/**
 * UI Reconstructor engine.
 *  - decodes compiled layouts into an editable, normalized view tree
 *  - resolves strings / colors / dimensions / drawables (bitmaps, <shape>, <vector> → SVG)
 *  - links screens (Activities/Fragments) to layouts and to each other by scanning DEX bytecode
 *    for layout resource-id literals and const-class / Intent targets.
 * Everything that cannot be recovered is flagged instead of being invented.
 */
import { Loaded, bestDrawableFile } from './analysis-core.js';
import { parseBinaryXml, isBinaryXml, frameworkAttrName, XmlNode, XmlAttr, formatAttrValue, resolveDeep, lookup, VT, isColor, colorHex, complexToFloat, ResValue, Resolver } from './res.js';
import { classRefs } from './dex.js';

export interface UiNode {
  uid: string;
  tag: string; // original tag
  kind: string; // normalized widget kind
  viewId?: string;
  props: UiProps;
  raw: Record<string, string>; // decoded original attributes (read-only reference)
  children: UiNode[];
  note?: string;
}

export interface UiProps {
  width?: string; // match | wrap | <n>dp
  height?: string;
  weight?: number;
  orientation?: 'vertical' | 'horizontal';
  gravity?: string;
  layoutGravity?: string;
  padding?: [number, number, number, number];
  margin?: [number, number, number, number];
  text?: string;
  hint?: string;
  textColor?: string;
  textSize?: number;
  textStyle?: string;
  background?: Paint;
  src?: Paint;
  visibility?: 'visible' | 'invisible' | 'gone';
  scaleType?: string;
  inputType?: string;
  rules?: Record<string, string>; // RelativeLayout / ConstraintLayout positioning
  checked?: boolean;
  onClick?: { type: 'navigate' | 'url' | 'toast'; value: string };
}

export interface Paint {
  color?: string; // #aarrggbb
  image?: string; // APK entry path (bitmap)
  ref?: string; // original reference
  svg?: boolean; // vector drawable converted server side
  radius?: number;
  stroke?: string;
}

const KIND_MAP: [RegExp, string][] = [
  [/(^|\.)(LinearLayout|LinearLayoutCompat|TableLayout|TableRow|RadioGroup)$/, 'linear'],
  [/(^|\.)(NestedScrollView|ScrollView)$/, 'scroll'],
  [/(^|\.)HorizontalScrollView$/, 'hscroll'],
  [/(^|\.)(RelativeLayout|PercentRelativeLayout)$/, 'relative'],
  [/(^|\.)(ConstraintLayout|MotionLayout)$/, 'constraint'],
  [/(^|\.)(CardView|MaterialCardView)$/, 'card'],
  [/(^|\.)(FrameLayout|CoordinatorLayout|AppBarLayout|CollapsingToolbarLayout|DrawerLayout|SwipeRefreshLayout|merge|ViewFlipper|ViewAnimator|TextInputLayout|FragmentContainerView|ViewPager2?|TabLayout|BottomNavigationView|NavigationView|ChipGroup)$/, 'frame'],
  [/(^|\.)(Toolbar|MaterialToolbar|ActionBar)$/, 'toolbar'],
  [/(^|\.)(Button|AppCompatButton|MaterialButton|ExtendedFloatingActionButton|Chip)$/, 'button'],
  [/(^|\.)(ImageButton|AppCompatImageButton|FloatingActionButton)$/, 'imagebutton'],
  [/(^|\.)(EditText|AppCompatEditText|TextInputEditText|AutoCompleteTextView|AppCompatAutoCompleteTextView|MaterialAutoCompleteTextView|SearchView)$/, 'edit'],
  [/(^|\.)(CheckBox|AppCompatCheckBox|MaterialCheckBox)$/, 'check'],
  [/(^|\.)(Switch|SwitchCompat|SwitchMaterial|MaterialSwitch|ToggleButton)$/, 'switch'],
  [/(^|\.)(RadioButton|AppCompatRadioButton|MaterialRadioButton)$/, 'radio'],
  [/(^|\.)(TextView|AppCompatTextView|MaterialTextView|CheckedTextView|Chronometer|TextClock)$/, 'text'],
  [/(^|\.)(ImageView|AppCompatImageView|ShapeableImageView|CircleImageView|LottieAnimationView)$/, 'image'],
  [/(^|\.)(ProgressBar|ContentLoadingProgressBar|LinearProgressIndicator|CircularProgressIndicator)$/, 'progress'],
  [/(^|\.)(SeekBar|AppCompatSeekBar|RatingBar|Slider)$/, 'seek'],
  [/(^|\.)(RecyclerView|ListView|GridView|ExpandableListView)$/, 'list'],
  [/(^|\.)WebView$/, 'web'],
  [/(^|\.)Spinner$|AppCompatSpinner$/, 'spinner'],
  [/(^|\.)(View|Space|Guideline|Barrier|Divider|MaterialDivider)$/, 'view'],
  [/(^|\.)(fragment)$/, 'fragment'],
  [/(^|\.)(include|ViewStub)$/, 'include'],
  [/(^|\.)(VideoView|SurfaceView|TextureView|PlayerView|StyledPlayerView|MapView)$/, 'surface'],
];

export function kindOf(tag: string): string {
  for (const [re, k] of KIND_MAP) if (re.test(tag)) return k;
  return tag.includes('.') ? 'custom' : 'view';
}

export const CONTAINER_KINDS = new Set(['linear', 'scroll', 'hscroll', 'relative', 'constraint', 'card', 'frame', 'toolbar']);

interface Ctx {
  L: Loaded;
  r: Resolver;
  uid: number;
  depth: number;
  includes: string[];
  missing: Set<string>;
}

function dimToDp(v: ResValue): number | undefined {
  if (v.type === VT.DIMENSION) {
    const n = complexToFloat(v.data);
    const unit = v.data & 0xf;
    return unit === 4 ? n * 160 : unit === 5 ? (n * 160) / 25.4 : unit === 3 ? (n * 160) / 72 : n; // in/mm/pt → dp; px≈dp at mdpi
  }
  return undefined;
}

function sizeSpec(a: XmlAttr | undefined, r: Resolver): string | undefined {
  if (!a) return undefined;
  const v = resolveDeep(r, a.value);
  if (v.type === VT.INT_DEC || v.type === VT.INT_HEX) {
    const d = v.data | 0;
    if (d === -1) return 'match';
    if (d === -2) return 'wrap';
  }
  const dp = dimToDp(v);
  if (dp !== undefined) return dp === 0 ? '0dp' : `${+dp.toFixed(1)}dp`;
  return undefined;
}

function resolvedString(a: XmlAttr | undefined, r: Resolver): string | undefined {
  if (!a) return undefined;
  const v = resolveDeep(r, a.value);
  if (v.type === VT.STRING) return v.str;
  if (a.raw !== undefined) return a.raw;
  return undefined;
}

export function paintOf(r: Resolver, a: XmlAttr | undefined | ResValue, L: Loaded, depth = 0): Paint | undefined {
  if (!a) return undefined;
  const value = 'value' in a ? a.value : a;
  const ref = value.type === VT.REFERENCE ? `${lookup(r, value.data)?.type ?? '?'}/${lookup(r, value.data)?.name ?? value.data.toString(16)}` : undefined;
  const v = resolveDeep(r, value);
  if (isColor(v)) return { color: colorHex(v), ref };
  if (v.type === VT.STRING && v.str) {
    if (/\.(png|webp|jpe?g|gif)$/i.test(v.str)) return { image: v.str, ref };
    if (v.str.endsWith('.xml') && value.type === VT.REFERENCE) {
      const best = bestDrawableFile(r, value.data);
      if (best && /\.(png|webp|jpe?g|gif)$/i.test(best)) return { image: best, ref };
      return { ref, svg: true, image: best ?? v.str };
    }
  }
  if (value.type === VT.REFERENCE && depth < 3) {
    const best = bestDrawableFile(r, value.data);
    if (best) return { image: best, ref, svg: best.endsWith('.xml') };
  }
  return ref ? { ref } : undefined;
}

const nums = (n: XmlNode, r: Resolver, all: string, l: string, t: string, rr: string, b: string, s: string, e: string): [number, number, number, number] | undefined => {
  const get = (name: string) => {
    const a = n.attrs.find((x) => x.name === name);
    return a ? dimToDp(resolveDeep(r, a.value)) : undefined;
  };
  const A = get(all);
  const H = get(all + 'Horizontal');
  const V = get(all + 'Vertical');
  const vals: [number | undefined, number | undefined, number | undefined, number | undefined] = [get(s) ?? get(l), get(t), get(e) ?? get(rr), get(b)];
  if (A === undefined && H === undefined && V === undefined && vals.every((x) => x === undefined)) return undefined;
  return [vals[0] ?? H ?? A ?? 0, vals[1] ?? V ?? A ?? 0, vals[2] ?? H ?? A ?? 0, vals[3] ?? V ?? A ?? 0].map((x) => +x.toFixed(1)) as [number, number, number, number];
};

const RULE_ATTRS = /^(layout_(below|above|toRightOf|toLeftOf|toStartOf|toEndOf|alignParent\w+|center\w+|align\w+)|layout_constraint\w+)$/;

async function convert(node: XmlNode, c: Ctx): Promise<UiNode> {
  const r = c.r;
  const attr = (name: string) => node.attrs.find((a) => a.name === name);
  const raw: Record<string, string> = {};
  for (const a of node.attrs) raw[(a.prefix ? a.prefix + ':' : '') + a.name] = formatAttrValue(a, r);
  let tag = node.tag;
  if (tag === 'view' && raw['class']) tag = raw['class'];
  const kind = kindOf(tag);
  const props: UiProps = {};
  props.width = sizeSpec(attr('layout_width'), r);
  props.height = sizeSpec(attr('layout_height'), r);
  const w = attr('layout_weight');
  if (w) props.weight = w.value.type === VT.FLOAT ? Buffer.from(Uint32Array.of(w.value.data).buffer).readFloatLE(0) : w.value.data;
  const o = attr('orientation');
  if (o) props.orientation = o.value.data === 1 ? 'vertical' : 'horizontal';
  else if (kind === 'linear') props.orientation = tag.endsWith('RadioGroup') || tag.endsWith('TableLayout') ? 'vertical' : 'horizontal';
  if (attr('gravity')) props.gravity = formatAttrValue(attr('gravity')!, r);
  if (attr('layout_gravity')) props.layoutGravity = formatAttrValue(attr('layout_gravity')!, r);
  props.padding = nums(node, r, 'padding', 'paddingLeft', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingStart', 'paddingEnd');
  props.margin = nums(node, r, 'layout_margin', 'layout_marginLeft', 'layout_marginTop', 'layout_marginRight', 'layout_marginBottom', 'layout_marginStart', 'layout_marginEnd');
  props.text = resolvedString(attr('text'), r);
  props.hint = resolvedString(attr('hint'), r);
  const tc = attr('textColor');
  if (tc) {
    const p = paintOf(r, tc, c.L);
    if (p?.color) props.textColor = p.color;
    else if (p?.image?.endsWith('.xml')) props.textColor = await colorStateDefault(c, p.image);
  }
  const ts = attr('textSize');
  if (ts) {
    const dp = dimToDp(resolveDeep(r, ts.value));
    if (dp) props.textSize = +dp.toFixed(1);
  }
  if (attr('textStyle')) props.textStyle = formatAttrValue(attr('textStyle')!, r);
  props.background = paintOf(r, attr('background'), c.L);
  const bt = attr('backgroundTint') ?? attr('cardBackgroundColor');
  if (bt) {
    const p = paintOf(r, bt, c.L);
    if (p?.color) props.background = { ...(props.background ?? {}), color: p.color, image: props.background?.svg ? undefined : props.background?.image };
  }
  if (props.background?.svg && props.background.image) {
    const shape = await shapeInfo(c, props.background.image);
    if (shape) props.background = { ...props.background, ...shape, svg: shape.color ? false : props.background.svg };
  }
  props.src = paintOf(r, attr('src') ?? attr('srcCompat'), c.L);
  const vis = attr('visibility');
  if (vis) props.visibility = vis.value.data === 2 ? 'gone' : vis.value.data === 1 ? 'invisible' : 'visible';
  if (attr('scaleType')) props.scaleType = formatAttrValue(attr('scaleType')!, r);
  if (attr('inputType')) props.inputType = formatAttrValue(attr('inputType')!, r);
  if (attr('checked')) props.checked = attr('checked')!.value.data !== 0;
  const rules: Record<string, string> = {};
  for (const a of node.attrs) if (RULE_ATTRS.test(a.name)) rules[a.name] = formatAttrValue(a, r).replace(/^@\+?id\//, '').replace(/^@id\//, '');
  if (Object.keys(rules).length) props.rules = rules;
  for (const k of Object.keys(props) as (keyof UiProps)[]) if (props[k] === undefined) delete props[k];

  const idAttr = attr('id');
  const out: UiNode = {
    uid: `n${c.uid++}`,
    tag,
    kind,
    viewId: idAttr ? formatAttrValue(idAttr, r).replace(/^@\+?id\//, '').replace(/^@id\//, '').replace(/^@android:id\//, 'android:') : undefined,
    props,
    raw,
    children: [],
  };
  if (kind === 'custom') out.note = 'Vue personnalisée : son rendu dépend de code applicatif. Aperçu générique.';
  if (kind === 'fragment') out.note = `Fragment ${raw['android:name'] ?? raw['class'] ?? ''} : contenu chargé dynamiquement.`;
  if (kind === 'list') out.note = 'Liste dynamique : les éléments sont fournis par un Adapter au runtime.';
  if (node.tag === 'include') {
    const lay = node.attrs.find((a) => a.name === 'layout');
    const lname = lay ? lookup(r, lay.value.data)?.name : undefined;
    if (lname && c.depth < 6 && !c.includes.includes(lname)) {
      const inc = await layoutTree(c.L, lname, undefined, { ...c, depth: c.depth + 1, includes: [...c.includes, lname] });
      if (inc) {
        out.note = `Inclusion de @layout/${lname}`;
        out.children = inc.root.children;
        if (inc.root.tag === 'merge') out.kind = 'frame';
        else {
          out.tag = inc.root.tag;
          out.kind = inc.root.kind;
          out.props = { ...inc.root.props, ...stripUndefined(out.props) };
          out.raw = { ...inc.root.raw, ...out.raw };
        }
        return out;
      }
    }
    out.note = `Inclusion de @layout/${lname ?? '?'} non résolue`;
  }
  for (const ch of node.children) out.children.push(await convert(ch, c));
  return out;
}

const stripUndefined = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

async function decodeXmlEntry(c: { L: Loaded; r: Resolver }, entry: string): Promise<XmlNode | null> {
  const buf = await c.L.read(entry, 8 * 1024 * 1024);
  if (!buf || !isBinaryXml(buf)) return null;
  try {
    return parseBinaryXml(buf, frameworkAttrName(c.r));
  } catch {
    return null;
  }
}

async function colorStateDefault(c: Ctx, entry: string): Promise<string | undefined> {
  const x = await decodeXmlEntry(c, entry);
  const items = x?.children.filter((k) => k.tag === 'item') ?? [];
  const last = items.find((i) => i.attrs.every((a) => !a.name.startsWith('state_'))) ?? items[items.length - 1];
  const col = last?.attrs.find((a) => a.name === 'color');
  if (!col) return undefined;
  const v = resolveDeep(c.r, col.value);
  return isColor(v) ? colorHex(v) : undefined;
}

async function shapeInfo(c: Ctx, entry: string): Promise<Partial<Paint> | undefined> {
  let x = await decodeXmlEntry(c, entry);
  if (!x) return undefined;
  if (x.tag === 'selector' || x.tag === 'ripple' || x.tag === 'layer-list' || x.tag === 'inset') {
    const firstShape = findFirst(x, (n) => n.tag === 'shape');
    if (!firstShape) {
      const col = findFirst(x, (n) => n.attrs.some((a) => a.name === 'color'));
      const ca = col?.attrs.find((a) => a.name === 'color');
      if (ca) {
        const v = resolveDeep(c.r, ca.value);
        if (isColor(v)) return { color: colorHex(v) };
      }
      return undefined;
    }
    x = firstShape;
  }
  if (x.tag !== 'shape') return undefined;
  const out: Partial<Paint> = {};
  for (const k of x.children) {
    const a = (n: string) => k.attrs.find((y) => y.name === n);
    if (k.tag === 'solid' && a('color')) {
      const v = resolveDeep(c.r, a('color')!.value);
      if (isColor(v)) out.color = colorHex(v);
    }
    if (k.tag === 'corners' && a('radius')) out.radius = dimToDp(resolveDeep(c.r, a('radius')!.value));
    if (k.tag === 'stroke' && a('color')) {
      const v = resolveDeep(c.r, a('color')!.value);
      if (isColor(v)) out.stroke = colorHex(v);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function findFirst(n: XmlNode, pred: (n: XmlNode) => boolean): XmlNode | undefined {
  if (pred(n)) return n;
  for (const c of n.children) {
    const f = findFirst(c, pred);
    if (f) return f;
  }
  return undefined;
}

export interface LayoutInfo {
  name: string;
  id: number;
  variants: { config: string; file: string }[];
  usedBy: string[];
}

export function listLayouts(L: Loaded): LayoutInfo[] {
  const out: LayoutInfo[] = [];
  for (const e of L.resolver.app?.entries.values() ?? []) {
    if (e.type !== 'layout') continue;
    out.push({ name: e.name, id: e.id, variants: e.values.filter((v) => v.value?.type === VT.STRING).map((v) => ({ config: v.config, file: v.value!.str! })), usedBy: [] });
  }
  const usage = layoutUsage(L);
  for (const l of out) l.usedBy = usage.get(l.id) ?? [];
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const LIB_PREFIX = /^(android|androidx|kotlin|kotlinx|java|javax|com\.google\.(android\.(material|gms)|firebase|common|gson)|okhttp3|retrofit2|dagger|io\.reactivex|com\.squareup|com\.bumptech|org\.(jetbrains|intellij))\./;

const usageCache = new WeakMap<Loaded, Map<number, string[]>>();
const refsCache = new WeakMap<Loaded, Map<string, ReturnType<typeof classRefs>>>();

function appClasses(L: Loaded) {
  return [...L.classIndex.values()].filter((x) => !LIB_PREFIX.test(x.cls.name));
}

export function refsOf(L: Loaded, name: string) {
  let m = refsCache.get(L);
  if (!m) refsCache.set(L, (m = new Map()));
  let r = m.get(name);
  if (!r) {
    const e = L.classIndex.get(name);
    if (!e) return undefined;
    r = classRefs(e.dex, e.cls);
    m.set(name, r);
  }
  return r;
}

/** layout resource id → classes whose bytecode references it (setContentView / inflate). */
export function layoutUsage(L: Loaded): Map<number, string[]> {
  let m = usageCache.get(L);
  if (m) return m;
  m = new Map();
  const layoutIds = new Set([...(L.resolver.app?.entries.values() ?? [])].filter((e) => e.type === 'layout').map((e) => e.id >>> 0));
  for (const { cls } of appClasses(L)) {
    const refs = refsOf(L, cls.name)!;
    const hits = new Set<number>([...refs.literals].filter((l) => layoutIds.has(l)));
    for (const rf of refs.resFields) {
      const id = rf.startsWith('layout/') ? L.resolver.app?.byName.get(rf) : undefined;
      if (id !== undefined) hits.add(id >>> 0);
    }
    for (const lit of hits) (m.get(lit) ?? m.set(lit, []).get(lit)!).push(cls.name);
  }
  usageCache.set(L, m);
  return m;
}

export interface Screen {
  name: string;
  type: 'activity' | 'fragment';
  launcher: boolean;
  exported?: boolean;
  layouts: string[];
  targets: string[];
  evidence: string[];
}

/** Screen graph: Activities (from manifest) + Fragments (from class hierarchy), linked through bytecode references. */
export function screenGraph(L: Loaded): { screens: Screen[]; dynamicUi: string[] } {
  const acts = L.analysis.components.filter((c) => c.type === 'activity');
  const actNames = new Set(acts.map((a) => a.name));
  const isFragment = (name: string) => {
    let cur = L.classIndex.get(name)?.cls;
    for (let i = 0; cur && i < 12; i++) {
      if (/(^|\.)(Fragment|DialogFragment|BottomSheetDialogFragment|PreferenceFragmentCompat)$/.test(cur.superName ?? '') && /fragment/i.test(cur.superName ?? '')) return true;
      cur = cur.superName ? L.classIndex.get(cur.superName)?.cls : undefined;
    }
    return false;
  };
  const fragments = appClasses(L).map((x) => x.cls.name).filter((n) => !actNames.has(n) && isFragment(n));
  const layoutById = new Map([...(L.resolver.app?.entries.values() ?? [])].filter((e) => e.type === 'layout').map((e) => [e.id >>> 0, e.name]));
  const screenSet = new Set([...actNames, ...fragments]);
  const screens: Screen[] = [];
  for (const name of [...actNames, ...fragments]) {
    const comp = acts.find((a) => a.name === name);
    const s: Screen = { name, type: comp ? 'activity' : 'fragment', launcher: !!comp?.launcher, exported: comp?.exported, layouts: [], targets: [], evidence: [] };
    // include inner/synthetic classes (lambdas, listeners) of the screen
    const related = [name, ...[...L.classIndex.keys()].filter((k) => k.startsWith(name + '$'))];
    for (const cn of related) {
      const refs = refsOf(L, cn);
      if (!refs) continue;
      const ids = [...refs.literals, ...[...refs.resFields].filter((f) => f.startsWith('layout/')).map((f) => (L.resolver.app?.byName.get(f) ?? 0) >>> 0)];
      for (const lit of ids) {
        const ln = layoutById.get(lit);
        if (ln && !s.layouts.includes(ln)) {
          s.layouts.push(ln);
          s.evidence.push(`${cn.slice(name.length) || 'classe'} référence @layout/${ln}`);
        }
      }
      for (const t of refs.types) if (screenSet.has(t) && t !== name && !s.targets.includes(t)) s.targets.push(t);
    }
    if (!L.classIndex.has(name)) s.evidence.push('Classe absente du DEX (split, chargement dynamique ou packer)');
    screens.push(s);
  }
  const dyn: string[] = [];
  const libs = new Set(L.analysis.libraries.map((l) => l.id));
  if (libs.has('compose')) dyn.push('Jetpack Compose : les écrans Compose sont construits en code, sans layout XML.');
  if (libs.has('flutter')) dyn.push("Flutter : l'interface est dessinée par le moteur Flutter (code Dart compilé dans libapp.so), non récupérable en XML.");
  if (libs.has('react-native')) dyn.push("React Native : l'interface est décrite dans le bundle JavaScript (assets/index.android.bundle).");
  if (libs.has('unity') || libs.has('godot') || libs.has('cocos')) dyn.push("Moteur de jeu : l'interface est rendue par le moteur, aucun layout Android exploitable.");
  if (libs.has('cordova') || libs.has('capacitor')) dyn.push("Application web hybride : l'interface est en HTML/CSS dans assets/.");
  return { screens, dynamicUi: dyn };
}

export async function layoutTree(L: Loaded, name: string, config?: string, parent?: Ctx): Promise<{ root: UiNode; file: string; config: string } | null> {
  const id = L.resolver.app?.byName.get(`layout/${name}`);
  const e = id !== undefined ? L.resolver.app!.entries.get(id) : undefined;
  if (!e) return null;
  const variants = e.values.filter((v) => v.value?.type === VT.STRING);
  const v = variants.find((x) => x.config === (config ?? '')) ?? variants.find((x) => x.config === '') ?? variants[0];
  if (!v) return null;
  const file = v.value!.str!;
  const c: Ctx = parent ?? { L, r: L.resolver, uid: 0, depth: 0, includes: [name], missing: new Set() };
  const xml = await decodeXmlEntry(c, file);
  if (!xml) return null;
  const root = await convert(xml, c);
  if (!parent) root.uid = 'root';
  return { root, file, config: v.config };
}

// ───────────────────────── Vector drawable → SVG ─────────────────────────
export async function drawableToSvg(L: Loaded, entry: string): Promise<string | null> {
  const c = { L, r: L.resolver };
  const x = await decodeXmlEntry(c, entry);
  if (!x) return null;
  const r = L.resolver;
  const css = (hex: string) => {
    const a = parseInt(hex.slice(1, 3), 16) / 255;
    return { color: '#' + hex.slice(3), opacity: +a.toFixed(3) };
  };
  const colorAttr = (n: XmlNode, name: string) => {
    const a = n.attrs.find((y) => y.name === name);
    if (!a) return undefined;
    const v = resolveDeep(r, a.value);
    return isColor(v) ? css(colorHex(v)) : undefined;
  };
  const num = (n: XmlNode, name: string, d = 0) => {
    const a = n.attrs.find((y) => y.name === name);
    if (!a) return d;
    const v = resolveDeep(r, a.value);
    if (v.type === VT.FLOAT) return Buffer.from(Uint32Array.of(v.data).buffer).readFloatLE(0);
    if (v.type === VT.DIMENSION) return complexToFloat(v.data);
    if (v.type === VT.INT_DEC) return v.data | 0;
    return d;
  };
  const esc = (s: string) => s.replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch]!);
  if (x.tag === 'shape') {
    const solid = x.children.find((k) => k.tag === 'solid');
    const corners = x.children.find((k) => k.tag === 'corners');
    const fill = solid ? colorAttr(solid, 'color') : undefined;
    const rad = corners ? num(corners, 'radius') : 0;
    const oval = x.attrs.find((a) => a.name === 'shape')?.value.data === 1;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">${oval ? `<ellipse cx="24" cy="24" rx="24" ry="24"` : `<rect width="48" height="48" rx="${rad}"`} fill="${fill?.color ?? '#888'}" fill-opacity="${fill?.opacity ?? 1}"/></svg>`;
  }
  if (x.tag !== 'vector') return null;
  const vw = num(x, 'viewportWidth', 24), vh = num(x, 'viewportHeight', 24);
  const tint = colorAttr(x, 'tint');
  const walk = (n: XmlNode): string =>
    n.children
      .map((k) => {
        if (k.tag === 'path') {
          const d = k.attrs.find((a) => a.name === 'pathData');
          const dv = d ? (d.value.type === VT.STRING ? d.value.str : d.raw) : '';
          const f = colorAttr(k, 'fillColor');
          const s = colorAttr(k, 'strokeColor');
          const fill = tint?.color ?? f?.color;
          return `<path d="${esc(dv ?? '')}" fill="${fill ?? 'none'}" fill-opacity="${f ? f.opacity * num(k, 'fillAlpha', 1) : 1}"${s ? ` stroke="${s.color}" stroke-width="${num(k, 'strokeWidth', 0)}"` : ''}${k.attrs.find((a) => a.name === 'fillType')?.value.data === 1 ? ' fill-rule="evenodd"' : ''}/>`;
        }
        if (k.tag === 'group') {
          const t = `translate(${num(k, 'translateX')} ${num(k, 'translateY')}) translate(${num(k, 'pivotX')} ${num(k, 'pivotY')}) rotate(${num(k, 'rotation')}) scale(${num(k, 'scaleX', 1)} ${num(k, 'scaleY', 1)}) translate(${-num(k, 'pivotX')} ${-num(k, 'pivotY')})`;
          return `<g transform="${t}">${walk(k)}</g>`;
        }
        return '';
      })
      .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${num(x, 'width', vw)}" height="${num(x, 'height', vh)}">${walk(x)}</svg>`;
}
