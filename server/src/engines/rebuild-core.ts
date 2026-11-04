/**
 * Project Rebuilder: generates an independent Android Studio / Gradle project from an analysis
 * plus the user's edits. Output uses only the Android framework (no AndroidX) so it builds both
 * with Gradle+AGP and with APPXRAY's lite toolchain. Signing material and secrets are never copied.
 */
import { Loaded, bestDrawableFile } from './analysis-core.js';
import { layoutTree, UiNode, CONTAINER_KINDS, screenGraph } from './ui.js';
import { path, shortHash } from './pathutil.js';
import { parseBinaryXml, isBinaryXml, frameworkAttrName, XmlNode, resolveDeep, isColor, colorHex, VT, formatAttrValue, complexToFloat, lookup } from './res.js';
import { secretKind } from './detect.js';

export interface ScreenSpec {
  key: string; // layout name or edited/assisted screen key
  title?: string;
  launcher?: boolean;
}
export interface ProjectOptions {
  analysisId?: string;
  appName: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  minSdk: number;
  colors: { primary: string; primaryDark: string; accent: string; background: string };
  screens: ScreenSpec[];
  features: { id: 'login' | 'webview' | 'settings' | 'list' | 'network'; url?: string }[];
  strings: Record<string, string>;
  copyOriginalIcon: boolean;
  copyAssets: boolean;
  includeReference: boolean;
}

export interface ProjectRecord {
  id: string;
  name: string;
  analysisId?: string;
  createdAt: string;
  updatedAt: string;
  options: ProjectOptions;
  report: Report;
}

export interface Report {
  screens: { activity: string; layout: string; origin: string }[];
  copiedResources: number;
  substitutions: string[];
  dropped: string[];
  notRecovered: string[];
  generated: string[];
  excluded: string[];
}

const LIB_STRING_PREFIX = /^(abc_|mtrl_|material_|m3_|common_google_|fcm_|fallback_|exo_|androidx_|bottom_sheet|character_counter|clear_text|error_icon|hide_bottom|icon_content|item_view|password_toggle|path_password|search_menu|status_bar|appbar_scrolling|bottomsheet|fab_transformation|call_notification|google_|gcm_|default_web_client_id|firebase_|project_id|com_facebook|com\.)/;

export const isValidPackage = (p: string) => /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(p) && p.length <= 150;
const resName = (s: string) => {
  let n = s.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (!/^[a-z]/.test(n)) n = 'r_' + n;
  return n.slice(0, 80) || 'r_res';
};
const pascal = (s: string) => s.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Screen';
const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Escape a literal for aapt2 (string resources and text attributes). */
export const androidText = (s: string) => xmlEsc(s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/^([@?])/, '\\$1'));
const javaStr = (s: string) => JSON.stringify(s);
const hexOk = (c?: string) => !!c && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c);

export function defaultOptions(L?: Loaded): ProjectOptions {
  const a = L?.analysis;
  const label = a?.appLabel && !secretKind(a.appLabel) ? a.appLabel : 'Mon application';
  const pkg = a?.package && isValidPackage(a.package + '.rebuilt') ? `${a.package}.rebuilt` : 'com.example.rebuilt';
  return {
    analysisId: a?.id,
    appName: label.slice(0, 60),
    packageName: pkg,
    versionName: '1.0',
    versionCode: 1,
    minSdk: 21,
    colors: { primary: '#FF0A84FF', primaryDark: '#FF0050B3', accent: '#FF00E5FF', background: '#FFFFFFFF' },
    screens: [],
    features: [],
    strings: {},
    copyOriginalIcon: true,
    copyAssets: false,
    includeReference: false,
  };
}

export function validateOptions(o: ProjectOptions): string[] {
  const errs: string[] = [];
  if (!o.appName?.trim()) errs.push("Nom de l'application requis");
  if (!isValidPackage(o.packageName)) errs.push('Nom de package invalide (ex. com.exemple.monapp)');
  if (!/^[\w.\- ]{1,40}$/.test(o.versionName)) errs.push('versionName invalide');
  if (!Number.isInteger(o.versionCode) || o.versionCode < 1 || o.versionCode > 2100000000) errs.push('versionCode invalide');
  if (!Number.isInteger(o.minSdk) || o.minSdk < 21 || o.minSdk > 35) errs.push('minSdk doit être entre 21 et 35');
  for (const [k, v] of Object.entries(o.colors)) if (!hexOk(v)) errs.push(`Couleur ${k} invalide (#AARRGGBB)`);
  for (const f of o.features) if (f.id === 'webview' && f.url && !/^https?:\/\/[^\s"']+$/.test(f.url)) errs.push('URL WebView invalide');
  return errs;
}

export interface StoredScreen { key: string; origin: 'original' | 'edited' | 'assisted'; baseLayout?: string; title?: string; root: UiNode; updatedAt: string }
export { resName };

// ───────────────────────── Generation ─────────────────────────
export interface Sink { write(rel: string, data: string | Buffer): Promise<void> }
export interface BuildDeps {
  L?: Loaded;
  getStored(key: string): Promise<StoredScreen | null>;
  uploadedIcon?: Buffer;
  /** copies the decompiled reference sources; returns false when unavailable */
  reference?: (sink: Sink) => Promise<boolean>;
}

interface Gen {
  L?: Loaded;
  root: string; // always '' (paths are project-relative)
  sink: Sink;
  o: ProjectOptions;
  report: Report;
  drawables: Map<string, string>; // apk entry → drawable name
  pendingCopies: Map<string, string>; // apk entry → project-relative path
  extraXml: Map<string, string>; // project-relative path → content
  strings: Map<string, string>;
  idCounter: number;
}

/** Generate every file of the project into `sink`. */
export async function buildProjectFiles(o: ProjectOptions, deps: BuildDeps, sink: Sink): Promise<Report> {
  const errs = validateOptions(o);
  if (errs.length) throw Object.assign(new Error(errs.join(' · ')), { status: 400 });
  const L = deps.L;
  const root = '';
  const g: Gen = {
    L,
    root,
    sink,
    o,
    report: { screens: [], copiedResources: 0, substitutions: [], dropped: [], notRecovered: [], generated: [], excluded: [] },
    drawables: new Map(),
    pendingCopies: new Map(),
    extraXml: new Map(),
    strings: new Map(),
    idCounter: 0,
  };
  currentSink = sink;
  g.report.excluded.push('Certificats et clés de signature d’origine (un keystore APPXRAY propre est utilisé)', 'Secrets, clés d’API et identifiants détectés', 'Code DEX d’origine (seule une référence décompilée optionnelle est fournie, hors compilation)');

  const pkgPath = o.packageName.replace(/\./g, '/');
  const javaDir = path.join(root, 'app/src/main/java', pkgPath);
  const resDir = path.join(root, 'app/src/main/res');

  // Original strings (app-owned only)
  if (L?.resolver.app) {
    for (const e of L.resolver.app.entries.values()) {
      if (e.type !== 'string' || LIB_STRING_PREFIX.test(e.name) || e.id >>> 24 !== 0x7f) continue;
      const v = e.values.find((x) => x.config === '' && x.value?.type === VT.STRING);
      const s = v?.value?.str;
      if (s === undefined || s.length > 4000 || secretKind(s)) continue;
      g.strings.set(resName(e.name), s);
    }
  }
  for (const [k, v] of Object.entries(o.strings ?? {})) g.strings.set(resName(k), String(v).slice(0, 4000));
  g.strings.set('app_name', o.appName);

  // Screens
  const activities: { cls: string; layout: string; title: string; launcher: boolean; actions: ClickAction[] }[] = [];
  const usedCls = new Set<string>();
  const graph = L ? screenGraph(L) : undefined;
  if (graph?.dynamicUi.length) g.report.notRecovered.push(...graph.dynamicUi);
  for (const spec of o.screens) {
    let root: UiNode | undefined;
    let origin = 'original';
    if (L) {
      const stored = await deps.getStored(spec.key);
      if (stored) {
        root = stored.root;
        origin = stored.origin;
      } else {
        const t = await layoutTree(L, spec.key);
        root = t?.root;
      }
    }
    if (!root) {
      g.report.dropped.push(`Écran ${spec.key} introuvable`);
      continue;
    }
    const layoutName = resName(spec.key.startsWith('activity_') || spec.key.startsWith('screen_') ? spec.key : 'screen_' + spec.key);
    const actions: ClickAction[] = [];
    const xml = await layoutXml(g, root, actions, layoutName);
    await writeFile(path.join(resDir, 'layout', layoutName + '.xml'), xml);
    let cls = pascal(spec.key.replace(/^(activity|fragment|screen|layout)_/, '')) + 'Activity';
    while (usedCls.has(cls)) cls = cls.replace(/(\d*)Activity$/, (_m, d) => `${(+d || 1) + 1}Activity`);
    usedCls.add(cls);
    activities.push({ cls, layout: layoutName, title: spec.title ?? spec.key, launcher: !!spec.launcher, actions });
    g.report.screens.push({ activity: cls, layout: layoutName, origin });
  }

  // Feature scaffolds (new, independent implementations)
  const features = new Set(o.features.map((f) => f.id));
  const webUrl = o.features.find((f) => f.id === 'webview')?.url ?? 'https://example.com';
  for (const f of features) {
    const sc = SCAFFOLDS[f];
    if (!sc) continue;
    for (const [rel, content] of Object.entries(sc.files)) {
      const r = rel.replace('$PKG_PATH', pkgPath);
      await writeFile(path.join(root, r), content.replace(/\$PKG/g, o.packageName).replace(/\$URL/g, javaStr(webUrl).slice(1, -1)));
    }
    for (const [k, v] of Object.entries(sc.strings ?? {})) g.strings.set(k, v);
    if (sc.activity) activities.push({ cls: sc.activity, layout: '', title: sc.title, launcher: false, actions: [] });
    g.report.generated.push(`${sc.title} — ${sc.note}`);
  }
  if (!activities.length) {
    await writeFile(path.join(resDir, 'layout', 'activity_main.xml'), EMPTY_LAYOUT);
    activities.push({ cls: 'MainActivity', layout: 'activity_main', title: 'Accueil', launcher: true, actions: [] });
    g.report.generated.push('Écran d’accueil vide (aucun écran sélectionné)');
  }
  // Launcher: explicit choice > login scaffold > first screen
  const explicit = activities.find((a) => a.launcher);
  const loginAct = activities.find((a) => a.cls === 'LoginActivity');
  const homeAct = activities.find((a) => a.layout && a !== loginAct) ?? activities[0];
  const launcherAct = explicit ?? loginAct ?? homeAct;
  for (const a of activities) a.launcher = a === launcherAct;

  // Java sources for reconstructed screens
  const targets = new Map<string, string>();
  for (const a of activities) targets.set(a.cls, a.cls);
  for (const s of g.report.screens) {
    const spec = o.screens.find((x) => s.layout === resName(x.key.startsWith('activity_') || x.key.startsWith('screen_') ? x.key : 'screen_' + x.key));
    if (spec) targets.set(spec.key, s.activity);
  }
  for (const a of activities.filter((x) => x.layout && x.cls !== 'LoginActivity' && x.cls !== 'SettingsActivity')) {
    if (!g.report.screens.some((s) => s.activity === a.cls)) continue;
    await writeFile(path.join(javaDir, a.cls + '.java'), activityJava(o.packageName, a.cls, a.layout, a.actions, targets));
  }
  if (features.has('login')) {
    await writeFile(path.join(javaDir, 'AppNav.java'), `package ${o.packageName};\n\n/** Generated by APPXRAY: screen opened after a successful login. */\nfinal class AppNav {\n    static final Class<?> HOME = ${homeAct && homeAct !== loginAct ? homeAct.cls : 'LoginActivity'}.class;\n    private AppNav() {}\n}\n`);
  }

  // Resources: values
  const C = o.colors;
  await writeFile(path.join(resDir, 'values/colors.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="appxray_primary">${C.primary}</color>\n    <color name="appxray_primary_dark">${C.primaryDark}</color>\n    <color name="appxray_accent">${C.accent}</color>\n    <color name="appxray_background">${C.background}</color>\n</resources>\n`);
  await writeFile(
    path.join(resDir, 'values/styles.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <style name="AppTheme" parent="android:Theme.Material.Light.DarkActionBar">\n        <item name="android:colorPrimary">@color/appxray_primary</item>\n        <item name="android:colorPrimaryDark">@color/appxray_primary_dark</item>\n        <item name="android:colorAccent">@color/appxray_accent</item>\n        <item name="android:windowBackground">@color/appxray_background</item>\n    </style>\n</resources>\n`,
  );
  const strXml = [...g.strings].sort(([a], [b]) => (a === 'app_name' ? -1 : b === 'app_name' ? 1 : a.localeCompare(b))).map(([k, v]) => `    <string name="${k}" formatted="false">${androidText(v)}</string>`).join('\n');
  await writeFile(path.join(resDir, 'values/strings.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<!-- Textes de l'application (modifiables). Les chaînes ressemblant à des secrets ont été exclues. -->\n<resources>\n${strXml}\n</resources>\n`);
  for (const [rel, content] of g.extraXml) await writeFile(path.join(resDir, rel), content);

  // Copy referenced drawables from the APK
  if (L && g.pendingCopies.size) {
    const bufs = await L.readMany((n) => g.pendingCopies.has(n), 16 * 1024 * 1024);
    for (const [entry, rel] of g.pendingCopies) {
      const b = bufs.get(entry);
      if (!b) continue;
      await g.sink.write(path.join(resDir, rel), b);
      g.report.copiedResources++;
    }
  }

  // Icon
  let iconRef = '@drawable/ic_launcher';
  const iconPath = L?.analysis.icon?.path;
  if (o.copyOriginalIcon && L && iconPath && /\.(png|webp|jpe?g)$/i.test(iconPath)) {
    const b = (await L.readMany((n) => n === iconPath, 8 * 1024 * 1024)).get(iconPath);
    if (b) {
      const ext = path.extname(iconPath).toLowerCase().replace('.jpeg', '.jpg');
      await writeFile(path.join(resDir, 'mipmap-xxxhdpi', 'ic_launcher' + ext), b);
      iconRef = '@mipmap/ic_launcher';
      g.report.copiedResources++;
    }
  }
  if (deps.uploadedIcon) {
    await writeFile(path.join(resDir, 'mipmap-xxxhdpi', 'ic_launcher.png'), deps.uploadedIcon);
    iconRef = '@mipmap/ic_launcher';
  }
  if (iconRef === '@drawable/ic_launcher') await writeFile(path.join(resDir, 'drawable', 'ic_launcher.xml'), launcherVector(C.primary, C.accent));

  // Original assets / raw / fonts
  if (o.copyAssets && L) await copyAssets(g, resDir);

  // Manifest
  const perms = new Set<string>();
  if (features.has('webview') || features.has('network')) perms.add('android.permission.INTERNET');
  for (const a of activities) for (const act of a.actions) if (act.type === 'url') perms.add('android.permission.INTERNET');
  await writeFile(path.join(root, 'app/src/main/AndroidManifest.xml'), manifestXml(activities, [...perms], iconRef));

  // Gradle & meta
  await writeGradle(g);
  if (o.includeReference && L) {
    if (deps.reference && (await deps.reference(g.sink))) {
      await writeFile('reference/README.md', '# Référence décompilée (JADX)\n\nCode **original décompilé**, fourni en lecture seule pour consultation. Il n’est **pas compilé** dans le projet et peut contenir des erreurs de décompilation. Le code du dossier `app/` est le code **reconstruit/généré** par APPXRAY.\n');
    } else g.report.dropped.push('Référence décompilée non incluse : décompilation JADX indisponible');
  }
  await writeFile(path.join(root, 'APPXRAY_REPORT.md'), reportMd(g, L));
  await writeFile(path.join(root, 'appxray.json'), JSON.stringify({ applicationId: o.packageName, versionCode: o.versionCode, versionName: o.versionName, minSdk: o.minSdk, liteTargetSdk: 29 }, null, 2));

  return g.report;
}

let currentSink: Sink | null = null;
async function writeFile(p: string, content: string | Buffer) {
  await currentSink!.write(p.replace(/^\/+/, ''), content);
}

// ───────────────────────── Layout → XML ─────────────────────────
export interface ClickAction { viewId: string; type: 'navigate' | 'url' | 'toast'; value: string }

const TAG_FOR: Record<string, string> = {
  linear: 'LinearLayout', scroll: 'ScrollView', hscroll: 'HorizontalScrollView', relative: 'RelativeLayout', constraint: 'RelativeLayout',
  card: 'FrameLayout', frame: 'FrameLayout', toolbar: 'LinearLayout', button: 'Button', imagebutton: 'ImageButton', edit: 'EditText',
  check: 'CheckBox', switch: 'Switch', radio: 'RadioButton', text: 'TextView', image: 'ImageView', progress: 'ProgressBar',
  seek: 'SeekBar', list: 'ListView', web: 'WebView', spinner: 'Spinner', view: 'View', fragment: 'FrameLayout', include: 'FrameLayout',
  surface: 'FrameLayout', custom: 'FrameLayout',
};

async function layoutXml(g: Gen, root: UiNode, actions: ClickAction[], layoutName: string): Promise<string> {
  const ids = new Set<string>();
  const collect = (n: UiNode) => {
    if (n.viewId && !n.viewId.startsWith('android:')) ids.add(idName(n.viewId));
    n.children.forEach(collect);
  };
  collect(root);
  const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?>', `<!-- Généré par APPXRAY depuis l'écran « ${xmlEsc(layoutName)} ». Les vues spécifiques ont été remplacées par des widgets Android standard. -->`];
  const emit = async (n: UiNode, depth: number, parentKind: string | null) => {
    const ind = '    '.repeat(depth);
    let kind = n.kind;
    if (n.props.visibility === 'gone' && depth > 0 && n.children.length === 0 && !n.viewId) return; // drop invisible leaf noise
    let tag = TAG_FOR[kind] ?? 'View';
    if (kind === 'custom' && !n.children.length) tag = n.props.text ? 'TextView' : 'View';
    if (kind === 'custom' || kind === 'constraint' || kind === 'card' || kind === 'fragment' || kind === 'surface' || /\./.test(n.tag) && TAG_FOR[kind] && !n.tag.endsWith(TAG_FOR[kind])) {
      const msg = `${n.tag} → ${tag}`;
      if (!g.report.substitutions.includes(msg)) g.report.substitutions.push(msg);
    }
    const a: string[] = [];
    if (depth === 0) a.push('xmlns:android="http://schemas.android.com/apk/res/android"');
    let viewId = n.viewId;
    const action = n.props.onClick;
    if (action && !viewId) viewId = `appxray_v${g.idCounter++}`;
    if (viewId) a.push(viewId.startsWith('android:') ? `android:id="@android:id/${viewId.slice(8)}"` : `android:id="@+id/${idName(viewId)}"`);
    if (action && viewId && !viewId.startsWith('android:')) actions.push({ viewId: idName(viewId), type: action.type, value: action.value });
    const p = n.props;
    let w = p.width ?? 'wrap', h = p.height ?? 'wrap';
    if (parentKind === 'constraint') {
      if (w === '0dp') w = 'match';
      if (h === '0dp') h = 'match';
    }
    if (depth === 0) {
      if (w === 'wrap' && CONTAINER_KINDS.has(kind)) w = 'match';
      if (h === 'wrap' && CONTAINER_KINDS.has(kind)) h = 'match';
    }
    const dim = (s: string) => (s === 'match' ? 'match_parent' : s === 'wrap' ? 'wrap_content' : /^\d+(\.\d+)?dp$/.test(s) ? s : 'wrap_content');
    a.push(`android:layout_width="${dim(w)}"`, `android:layout_height="${dim(h)}"`);
    if (p.weight && parentKind === 'linear') a.push(`android:layout_weight="${+p.weight}"`);
    if (tag === 'LinearLayout') a.push(`android:orientation="${kind === 'toolbar' ? 'horizontal' : p.orientation ?? 'vertical'}"`);
    if (p.gravity && /^[a-z_|]+$/.test(p.gravity) && tag !== 'View') a.push(`android:gravity="${p.gravity}"`);
    if (p.layoutGravity && /^[a-z_|]+$/.test(p.layoutGravity) && (parentKind === 'linear' || parentKind === 'frame' || parentKind === 'card' || parentKind === 'scroll')) a.push(`android:layout_gravity="${p.layoutGravity}"`);
    if (p.padding?.some((x) => x)) a.push(`android:paddingLeft="${p.padding[0]}dp"`, `android:paddingTop="${p.padding[1]}dp"`, `android:paddingRight="${p.padding[2]}dp"`, `android:paddingBottom="${p.padding[3]}dp"`);
    if (p.margin?.some((x) => x)) a.push(`android:layout_marginLeft="${p.margin[0]}dp"`, `android:layout_marginTop="${p.margin[1]}dp"`, `android:layout_marginRight="${p.margin[2]}dp"`, `android:layout_marginBottom="${p.margin[3]}dp"`);
    if (parentKind === 'relative' || parentKind === 'constraint') a.push(...relativeRules(p.rules ?? {}, ids, parentKind === 'constraint', w, h));
    const textual = ['TextView', 'Button', 'EditText', 'CheckBox', 'Switch', 'RadioButton'].includes(tag);
    if (textual && p.text !== undefined) a.push(`android:text="${textRef(g, n, 'android:text', p.text)}"`);
    if (textual && p.hint !== undefined) a.push(`android:hint="${textRef(g, n, 'android:hint', p.hint)}"`);
    if (textual && hexOk(p.textColor)) a.push(`android:textColor="${p.textColor}"`);
    if (textual && p.textSize) a.push(`android:textSize="${p.textSize}sp"`);
    if (textual && p.textStyle && /^(bold|italic|normal|bold\|italic)$/.test(p.textStyle)) a.push(`android:textStyle="${p.textStyle}"`);
    if (tag === 'EditText' && p.inputType && /^[a-zA-Z|]+$/.test(p.inputType)) a.push(`android:inputType="${p.inputType}"`);
    if ((tag === 'CheckBox' || tag === 'Switch' || tag === 'RadioButton') && p.checked) a.push('android:checked="true"');
    const bg = await paintRef(g, p.background, 'bg');
    if (bg) a.push(`android:background="${bg}"`);
    if (tag === 'ImageView' || tag === 'ImageButton') {
      const src = await paintRef(g, p.src, 'img');
      if (src) a.push(`android:src="${src}"`);
      if (p.scaleType && /^[a-zA-Z]+$/.test(p.scaleType)) a.push(`android:scaleType="${p.scaleType}"`);
      a.push('android:contentDescription="@null"');
    }
    if (p.visibility && p.visibility !== 'visible') a.push(`android:visibility="${p.visibility}"`);
    if (kind === 'card' && !bg) a.push('android:background="#FFFFFFFF"');
    let children = n.children;
    const isContainer = ['LinearLayout', 'RelativeLayout', 'FrameLayout', 'ScrollView', 'HorizontalScrollView'].includes(tag);
    if (!isContainer && children.length) {
      g.report.dropped.push(`Enfants de ${n.tag}${n.viewId ? ' #' + n.viewId : ''} (vue non conteneur)`);
      children = [];
    }
    const open = `${ind}<${tag}${a.map((x) => `\n${ind}    ${x}`).join('')}`;
    if (!children.length) {
      lines.push(open + ' />');
      return;
    }
    lines.push(open + '>');
    const childKind = tag === 'LinearLayout' ? 'linear' : kind === 'constraint' ? 'constraint' : tag === 'RelativeLayout' ? 'relative' : tag.endsWith('ScrollView') ? 'scroll' : 'frame';
    if (tag.endsWith('ScrollView') && children.length > 1) {
      lines.push(`${ind}    <LinearLayout\n${ind}        android:layout_width="match_parent"\n${ind}        android:layout_height="wrap_content"\n${ind}        android:orientation="vertical">`);
      for (const c of children) await emit(c, depth + 2, 'linear');
      lines.push(`${ind}    </LinearLayout>`);
    } else for (const c of children) await emit(c, depth + 1, childKind);
    lines.push(`${ind}</${tag}>`);
  };
  await emit(root, 0, null);
  return lines.join('\n') + '\n';
}

const idName = (s: string) => resName(s.replace(/^@\+?id\//, ''));

function textRef(g: Gen, n: UiNode, attr: string, text: string): string {
  const ref = /^@string\/(.+)$/.exec(n.raw?.[attr] ?? '')?.[1];
  if (ref) {
    const key = resName(ref);
    if (g.strings.has(key) && g.strings.get(key) === text) return `@string/${key}`;
    if (g.o.strings[key] !== undefined && !g.strings.has(key)) return `@string/${key}`;
  }
  return androidText(text);
}

function relativeRules(rules: Record<string, string>, ids: Set<string>, constraint: boolean, w: string, h: string): string[] {
  const out = new Map<string, string>();
  const ref = (v: string) => (v === 'parent' ? null : ids.has(idName(v)) ? `@+id/${idName(v)}` : undefined);
  for (const [k, v] of Object.entries(rules)) {
    if (!constraint) {
      if (/^layout_(alignParent\w+|center\w+)$/.test(k)) {
        if (v === 'true') out.set(k, 'true');
      } else {
        const r = ref(v);
        if (r) out.set(k, r);
      }
      continue;
    }
    const m = /^layout_constraint(Top|Bottom|Start|End|Left|Right|Baseline)_to(Top|Bottom|Start|End|Left|Right|Baseline)Of$/.exec(k);
    if (!m) continue;
    const [, from, to] = m;
    const r = ref(v);
    if (r === undefined) continue;
    const side = (s: string) => (s === 'Left' ? 'Start' : s === 'Right' ? 'End' : s);
    const f = side(from), t = side(to);
    if (r === null) {
      if (f === 'Top' && t === 'Top') out.set('layout_alignParentTop', 'true');
      if (f === 'Bottom' && t === 'Bottom') out.set('layout_alignParentBottom', 'true');
      if (f === 'Start' && t === 'Start') out.set('layout_alignParentStart', 'true');
      if (f === 'End' && t === 'End') out.set('layout_alignParentEnd', 'true');
    } else {
      if (f === 'Top' && t === 'Bottom') out.set('layout_below', r);
      if (f === 'Top' && t === 'Top') out.set('layout_alignTop', r);
      if (f === 'Bottom' && t === 'Top') out.set('layout_above', r);
      if (f === 'Bottom' && t === 'Bottom') out.set('layout_alignBottom', r);
      if (f === 'Start' && t === 'End') out.set('layout_toEndOf', r);
      if (f === 'Start' && t === 'Start') out.set('layout_alignStart', r);
      if (f === 'End' && t === 'Start') out.set('layout_toStartOf', r);
      if (f === 'End' && t === 'End') out.set('layout_alignEnd', r);
    }
  }
  if (constraint) {
    if (out.get('layout_alignParentStart') && out.get('layout_alignParentEnd') && w !== 'match') {
      out.delete('layout_alignParentStart');
      out.delete('layout_alignParentEnd');
      out.set('layout_centerHorizontal', 'true');
    }
    if (out.get('layout_alignParentTop') && out.get('layout_alignParentBottom') && h !== 'match') {
      out.delete('layout_alignParentTop');
      out.delete('layout_alignParentBottom');
      out.set('layout_centerVertical', 'true');
    }
  }
  return [...out].map(([k, v]) => `android:${k}="${v}"`);
}

const DENS_DIR = /(^|-)(ldpi|mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi|nodpi|tvdpi|anydpi)(-|$)/;

async function paintRef(g: Gen, p: UiNode['props']['background'], prefix: string): Promise<string | undefined> {
  if (!p) return undefined;
  if (p.image && /^(appxray-upload:)/.test(p.image)) {
    return undefined;
  }
  if (p.image && /\.(png|webp|jpe?g|gif)$/i.test(p.image) && g.L) {
    let name = g.drawables.get(p.image);
    if (!name) {
      const base = resName(p.ref?.split('/')[1] ?? path.basename(p.image).replace(/\.(9\.)?\w+$/, ''));
      name = base;
      let i = 2;
      while ([...g.drawables.values()].includes(name)) name = `${base}_${i++}`;
      const folder = path.basename(path.dirname(p.image));
      const dens = DENS_DIR.exec(folder)?.[2] ?? 'nodpi';
      const ext = p.image.endsWith('.9.png') ? '.9.png' : path.extname(p.image).toLowerCase().replace('.jpeg', '.jpg');
      g.drawables.set(p.image, name);
      g.pendingCopies.set(p.image, `drawable-${dens}/${name}${ext}`);
    }
    return `@drawable/${name}`;
  }
  if (p.radius || p.stroke) {
    const name = `${prefix}_shape_${shortHash(JSON.stringify(p))}`;
    g.extraXml.set(
      `drawable/${name}.xml`,
      `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n${hexOk(p.color) ? `    <solid android:color="${p.color}" />\n` : ''}${p.radius ? `    <corners android:radius="${+p.radius.toFixed(1)}dp" />\n` : ''}${hexOk(p.stroke) ? `    <stroke android:width="1dp" android:color="${p.stroke}" />\n` : ''}</shape>\n`,
    );
    return `@drawable/${name}`;
  }
  if (hexOk(p.color)) return p.color;
  if (p.svg && p.image && g.L) {
    const name = await vectorCopy(g, p.image, p.ref);
    if (name) return `@drawable/${name}`;
  }
  if (p.ref) g.report.dropped.push(`Ressource ${p.ref} (format non reconstructible)`);
  return undefined;
}

/** Re-serialize a compiled <vector>/<shape> drawable with every value inlined (no dangling references). */
async function vectorCopy(g: Gen, entry: string, ref?: string): Promise<string | undefined> {
  const L = g.L!;
  const name = resName(ref?.split('/')[1] ?? path.basename(entry, '.xml'));
  if ([...g.extraXml.keys()].includes(`drawable/${name}.xml`)) return name;
  const buf = (await L.readMany((n) => n === entry, 4 * 1024 * 1024)).get(entry);
  if (!buf || !isBinaryXml(buf)) return undefined;
  let x: XmlNode;
  try {
    x = parseBinaryXml(buf, frameworkAttrName(L.resolver));
  } catch {
    return undefined;
  }
  if (!['vector', 'shape'].includes(x.tag)) return undefined;
  const r = L.resolver;
  const ser = (n: XmlNode, ind: string): string => {
    const attrs: string[] = [];
    for (const a of n.attrs) {
      if (a.prefix !== 'android') continue;
      const v = resolveDeep(r, a.value);
      let val: string | undefined;
      if (isColor(v)) val = colorHex(v);
      else if (v.type === VT.DIMENSION) val = formatAttrValue({ ...a, value: v }, r);
      else if (v.type === VT.STRING) val = xmlEsc(v.str ?? '');
      else if (v.type === VT.FLOAT || v.type === VT.INT_DEC || v.type === VT.INT_BOOLEAN || v.type === VT.INT_HEX) val = xmlEsc(formatAttrValue({ ...a, value: v }, r));
      if (v.type === VT.DIMENSION) val = `${+complexToFloat(v.data).toFixed(2)}${['px', 'dp', 'sp', 'pt', 'in', 'mm'][v.data & 0xf] ?? 'dp'}`;
      if (val !== undefined && !/^[@?]/.test(val)) attrs.push(`android:${a.name}="${val}"`);
    }
    const kids = n.children.filter((k) => ['path', 'group', 'clip-path', 'solid', 'corners', 'stroke', 'padding', 'size', 'gradient'].includes(k.tag));
    const head = `${ind}<${n.tag}${ind === '' ? ' xmlns:android="http://schemas.android.com/apk/res/android"' : ''}${attrs.map((t) => ' ' + t).join('')}`;
    return kids.length ? `${head}>\n${kids.map((k) => ser(k, ind + '    ')).join('')}${ind}</${n.tag}>\n` : `${head} />\n`;
  };
  g.extraXml.set(`drawable/${name}.xml`, '<?xml version="1.0" encoding="utf-8"?>\n' + ser(x, ''));
  return name;
}

async function copyAssets(g: Gen, resDir: string) {
  const L = g.L!;
  const want = new Map<string, string>();
  for (const [name, size] of L.files) {
    if (size > 50 * 1024 * 1024) continue;
    if (name.startsWith('assets/') && !/\.(dex|jar|so|bundle|dll|odex|vdex|apk)$/i.test(name) && !/(google-services|firebase|credential|secret|\.key$|\.pem$|\.p12$|\.jks$|keystore)/i.test(name)) {
      want.set(name, path.join('..', name));
    }
  }
  for (const e of L.resolver.app?.entries.values() ?? []) {
    if (e.type !== 'raw' && e.type !== 'font') continue;
    const v = e.values.find((x) => x.value?.type === VT.STRING && !x.value.str!.endsWith('.xml'));
    if (v) want.set(v.value!.str!, `${e.type}/${resName(e.name)}${path.extname(v.value!.str!).toLowerCase()}`);
  }
  if (!want.size) return;
  const bufs = await L.readMany((n) => want.has(n), 50 * 1024 * 1024);
  for (const [entry, rel] of want) {
    const b = bufs.get(entry);
    if (!b) continue;
    const dest = path.join(resDir, rel);
    if (dest.startsWith('..') || dest.includes('/../')) continue;
    await writeFile(dest, b);
    g.report.copiedResources++;
  }
}


function activityJava(pkg: string, cls: string, layout: string, actions: ClickAction[], targets: Map<string, string>): string {
  const handlers = actions
    .map((a) => {
      let body = '';
      if (a.type === 'navigate' && targets.has(a.value)) body = `startActivity(new Intent(${cls}.this, ${targets.get(a.value)}.class));`;
      else if (a.type === 'url' && /^https?:\/\//.test(a.value)) body = `startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(${javaStr(a.value)})));`;
      else if (a.type === 'toast') body = `Toast.makeText(${cls}.this, ${javaStr(a.value)}, Toast.LENGTH_SHORT).show();`;
      else return '';
      return `        bindClick(R.id.${a.viewId}, new View.OnClickListener() {\n            @Override public void onClick(View v) {\n                ${body}\n            }\n        });`;
    })
    .filter(Boolean)
    .join('\n');
  return `package ${pkg};

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Toast;

/**
 * Écran reconstruit par APPXRAY à partir de la mise en page « ${layout} ».
 * Code généré (non issu de l'application d'origine) : ajoutez ici votre propre logique.
 */
public class ${cls} extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.${layout});
${handlers || '        // Aucune action configurée. Utilisez l\'éditeur UI d\'APPXRAY pour lier des boutons à des écrans.'}
    }

    private void bindClick(int id, View.OnClickListener l) {
        View v = findViewById(id);
        if (v != null) v.setOnClickListener(l);
    }

    @SuppressWarnings("unused")
    private void openScreen(Class<?> target) {
        startActivity(new Intent(this, target));
    }

    @SuppressWarnings("unused")
    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }
}
`;
}

function manifestXml(acts: { cls: string; launcher: boolean; title: string }[], perms: string[], icon: string) {
  const comps = acts
    .map((a) =>
      a.launcher
        ? `        <activity\n            android:name=".${a.cls}"\n            android:exported="true">\n            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n        </activity>`
        : `        <activity android:name=".${a.cls}" android:exported="false" />`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Manifest reconstruit par APPXRAY (aucun composant, permission ou secret d'origine n'est repris automatiquement). -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
${perms.map((p) => `    <uses-permission android:name="${p}" />`).join('\n')}
    <application
        android:allowBackup="false"
        android:icon="${icon}"
        android:label="@string/app_name"
        android:theme="@style/AppTheme">
${comps}
    </application>
</manifest>
`;
}

async function writeGradle(g: Gen) {
  const o = g.o;
  const r = g.root;
  await writeFile(path.join(r, 'settings.gradle.kts'), `pluginManagement {\n    repositories {\n        google()\n        mavenCentral()\n        gradlePluginPortal()\n    }\n}\ndependencyResolutionManagement {\n    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)\n    repositories {\n        google()\n        mavenCentral()\n    }\n}\nrootProject.name = ${javaStr(o.appName.replace(/[^\w -]/g, '').trim() || 'App')}\ninclude(":app")\n`);
  await writeFile(path.join(r, 'build.gradle.kts'), `plugins {\n    id("com.android.application") version "8.7.3" apply false\n}\n`);
  await writeFile(path.join(r, 'gradle.properties'), 'org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\nandroid.useAndroidX=false\nandroid.nonTransitiveRClass=true\n');
  await writeFile(
    path.join(r, 'app/build.gradle.kts'),
    `plugins {\n    id("com.android.application")\n}\n\nandroid {\n    namespace = "${o.packageName}"\n    compileSdk = 35\n\n    defaultConfig {\n        applicationId = "${o.packageName}"\n        minSdk = ${o.minSdk}\n        targetSdk = 35\n        versionCode = ${o.versionCode}\n        versionName = "${o.versionName}"\n    }\n\n    buildTypes {\n        release {\n            isMinifyEnabled = false\n            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")\n        }\n    }\n    compileOptions {\n        sourceCompatibility = JavaVersion.VERSION_1_8\n        targetCompatibility = JavaVersion.VERSION_1_8\n    }\n}\n\ndependencies {\n    // Le projet n'utilise que le framework Android. Ajoutez vos dépendances ici.\n}\n`,
  );
  await writeFile(path.join(r, 'app/proguard-rules.pro'), '# Règles ProGuard/R8 du projet reconstruit\n');
  await writeFile(path.join(r, '.gitignore'), '.gradle/\nbuild/\nlocal.properties\n*.iml\n.idea/\n');
  await writeFile(
    path.join(r, 'README.md'),
    `# ${o.appName}\n\nProjet Android **indépendant** généré par APPXRAY.\n\n- Ouvrir avec Android Studio (Ladybug ou plus récent), ou compiler avec \`gradle assembleDebug\` (AGP 8.7, Gradle 8.9+).\n- Ou compiler directement dans APPXRAY (module APK Builder).\n- Voir \`APPXRAY_REPORT.md\` pour ce qui a été reconstruit, substitué ou non récupérable.\n`,
  );
}

function reportMd(g: Gen, L?: Loaded) {
  const r = g.report;
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- (aucun)');
  return `# Rapport de reconstruction APPXRAY

Généré le ${new Date().toISOString()}${L ? ` depuis \`${L.analysis.file.name}\` (SHA-256 \`${L.analysis.file.sha256}\`)` : ''}.

> Ce projet est une **reconstruction**. Il ne contient pas le code d'origine : les écrans sont regénérés à partir des
> mises en page récupérées et les fonctionnalités sont de **nouvelles implémentations indépendantes**.

## Écrans
${r.screens.length ? r.screens.map((s) => `- \`${s.activity}\` ← layout \`${s.layout}\` (origine : ${s.origin})`).join('\n') : '- (aucun écran reconstruit)'}

## Fonctionnalités générées (code neuf)
${list(r.generated)}

## Substitutions de composants
${list(r.substitutions)}

## Éléments ignorés
${list([...new Set(r.dropped)].slice(0, 200))}

## Non récupérable automatiquement
${list(r.notRecovered)}

## Volontairement exclu
${list(r.excluded)}

Ressources copiées depuis l'APK : ${r.copiedResources}.
`;
}

const EMPTY_LAYOUT = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:gravity="center"
    android:orientation="vertical"
    android:padding="24dp">
    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="@string/app_name"
        android:textSize="24sp" />
</LinearLayout>
`;

function launcherVector(primary: string, accent: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="${primary}" android:pathData="M0,0h108v108h-108z" />
    <path android:fillColor="${accent}" android:pathData="M54,30 L78,54 L54,78 L30,54 Z" />
</vector>
`;
}

// ───────────────────────── Feature scaffolds (new code) ─────────────────────────
interface Scaffold { title: string; note: string; activity?: string; files: Record<string, string>; strings?: Record<string, string> }

const SCAFFOLDS: Record<string, Scaffold> = {
  login: {
    title: 'Connexion',
    activity: 'LoginActivity',
    note: 'écran de connexion autonome avec comptes locaux (mot de passe haché SHA-256 + sel). Aucun backend ni identifiant d’origine. Remplacez AuthStore par votre API.',
    strings: { login_title: 'Connexion', login_email: 'Adresse e-mail', login_password: 'Mot de passe', login_submit: 'Se connecter', login_register: 'Créer un compte' },
    files: {
      'app/src/main/res/layout/activity_login.xml': `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:gravity="center_vertical"
    android:orientation="vertical"
    android:padding="24dp">
    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginBottom="24dp"
        android:text="@string/login_title"
        android:textSize="28sp"
        android:textStyle="bold" />
    <EditText
        android:id="@+id/login_email"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:hint="@string/login_email"
        android:inputType="textEmailAddress" />
    <EditText
        android:id="@+id/login_password"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:hint="@string/login_password"
        android:inputType="textPassword" />
    <Button
        android:id="@+id/login_submit"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="16dp"
        android:text="@string/login_submit" />
    <Button
        android:id="@+id/login_register"
        style="?android:attr/borderlessButtonStyle"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="@string/login_register" />
</LinearLayout>
`,
      'app/src/main/java/$PKG_PATH/AuthStore.java': `package $PKG;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import java.security.MessageDigest;
import java.security.SecureRandom;

/**
 * Stockage local des comptes (généré par APPXRAY, implémentation indépendante).
 * Remplacez cette classe par un appel à votre propre service d'authentification.
 */
public final class AuthStore {
    private final SharedPreferences prefs;

    public AuthStore(Context c) {
        prefs = c.getSharedPreferences("appxray_auth", Context.MODE_PRIVATE);
    }

    public boolean register(String email, String password) {
        if (prefs.contains("u_" + email)) return false;
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        String s = Base64.encodeToString(salt, Base64.NO_WRAP);
        prefs.edit().putString("u_" + email, s + ":" + hash(s, password)).apply();
        return true;
    }

    public boolean login(String email, String password) {
        String stored = prefs.getString("u_" + email, null);
        if (stored == null) return false;
        String[] parts = stored.split(":", 2);
        boolean ok = parts.length == 2 && MessageDigest.isEqual(parts[1].getBytes(), hash(parts[0], password).getBytes());
        if (ok) prefs.edit().putString("session", email).apply();
        return ok;
    }

    public String currentUser() { return prefs.getString("session", null); }

    public void logout() { prefs.edit().remove("session").apply(); }

    private static String hash(String salt, String password) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(salt.getBytes("UTF-8"));
            return Base64.encodeToString(md.digest(password.getBytes("UTF-8")), Base64.NO_WRAP);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
`,
      'app/src/main/java/$PKG_PATH/LoginActivity.java': `package $PKG;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.util.Patterns;
import android.view.View;
import android.widget.EditText;
import android.widget.Toast;

/** Écran de connexion généré par APPXRAY (nouvelle implémentation, sans backend d'origine). */
public class LoginActivity extends Activity {
    private AuthStore auth;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        auth = new AuthStore(this);
        if (auth.currentUser() != null && AppNav.HOME != LoginActivity.class) {
            openHome();
            return;
        }
        setContentView(R.layout.activity_login);
        final EditText email = (EditText) findViewById(R.id.login_email);
        final EditText password = (EditText) findViewById(R.id.login_password);
        findViewById(R.id.login_submit).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                if (!valid(email, password)) return;
                if (auth.login(email.getText().toString().trim(), password.getText().toString())) openHome();
                else toast("Identifiants incorrects");
            }
        });
        findViewById(R.id.login_register).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                if (!valid(email, password)) return;
                if (auth.register(email.getText().toString().trim(), password.getText().toString())) toast("Compte créé, vous pouvez vous connecter");
                else toast("Ce compte existe déjà");
            }
        });
    }

    private boolean valid(EditText email, EditText password) {
        if (!Patterns.EMAIL_ADDRESS.matcher(email.getText().toString().trim()).matches()) {
            email.setError("E-mail invalide");
            return false;
        }
        if (password.getText().length() < 8) {
            password.setError("8 caractères minimum");
            return false;
        }
        return true;
    }

    private void openHome() {
        if (AppNav.HOME == LoginActivity.class) { toast("Connecté"); return; }
        startActivity(new Intent(this, AppNav.HOME));
        finish();
    }

    private void toast(String m) { Toast.makeText(this, m, Toast.LENGTH_SHORT).show(); }
}
`,
    },
  },
  webview: {
    title: 'Contenu web',
    activity: 'WebActivity',
    note: 'écran WebView chargeant une URL que vous choisissez (JavaScript activé, navigation interne).',
    files: {
      'app/src/main/java/$PKG_PATH/WebActivity.java': `package $PKG;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Écran web généré par APPXRAY. */
public class WebActivity extends Activity {
    public static final String START_URL = "$URL";
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.setWebViewClient(new WebViewClient());
        setContentView(web);
        web.loadUrl(START_URL);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
`,
    },
  },
  settings: {
    title: 'Paramètres',
    activity: 'SettingsActivity',
    note: 'écran de préférences persistées (SharedPreferences).',
    strings: { settings_notifications: 'Notifications', settings_dark: 'Thème sombre' },
    files: {
      'app/src/main/res/layout/activity_settings.xml': `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="16dp">
    <Switch
        android:id="@+id/settings_notifications"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:padding="12dp"
        android:text="@string/settings_notifications" />
    <Switch
        android:id="@+id/settings_dark"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:padding="12dp"
        android:text="@string/settings_dark" />
</LinearLayout>
`,
      'app/src/main/java/$PKG_PATH/SettingsActivity.java': `package $PKG;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.CompoundButton;
import android.widget.Switch;

/** Préférences générées par APPXRAY. */
public class SettingsActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);
        final SharedPreferences prefs = getSharedPreferences("settings", MODE_PRIVATE);
        bind(prefs, (Switch) findViewById(R.id.settings_notifications), "notifications");
        bind(prefs, (Switch) findViewById(R.id.settings_dark), "dark");
    }

    private void bind(final SharedPreferences prefs, Switch s, final String key) {
        s.setChecked(prefs.getBoolean(key, false));
        s.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
            @Override public void onCheckedChanged(CompoundButton b, boolean checked) {
                prefs.edit().putBoolean(key, checked).apply();
            }
        });
    }
}
`,
    },
  },
  list: {
    title: 'Liste de contenu',
    activity: 'ItemsActivity',
    note: 'liste défilante avec adaptateur (données d’exemple à remplacer).',
    files: {
      'app/src/main/java/$PKG_PATH/ItemsActivity.java': `package $PKG;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.ListView;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.List;

/** Liste générée par APPXRAY : remplacez loadItems() par votre source de données. */
public class ItemsActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ListView list = new ListView(this);
        setContentView(list);
        final List<String> items = loadItems();
        list.setAdapter(new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, items));
        list.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                Toast.makeText(ItemsActivity.this, items.get(position), Toast.LENGTH_SHORT).show();
            }
        });
    }

    protected List<String> loadItems() {
        List<String> items = new ArrayList<String>();
        for (int i = 1; i <= 30; i++) items.add("Élément " + i);
        return items;
    }
}
`,
    },
  },
  network: {
    title: 'Client réseau',
    note: 'classe ApiClient (HttpURLConnection, thread d’arrière-plan, rappel sur le thread UI). Configurez votre propre URL de base.',
    files: {
      'app/src/main/java/$PKG_PATH/ApiClient.java': `package $PKG;

import android.os.Handler;
import android.os.Looper;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Client HTTP minimal généré par APPXRAY. Aucune URL ni clé d'origine n'est reprise. */
public final class ApiClient {
    public interface Callback { void onResult(int status, String body, Exception error); }

    private final String baseUrl;
    private final Handler main = new Handler(Looper.getMainLooper());

    public ApiClient(String baseUrl) { this.baseUrl = baseUrl; }

    public void get(String path, Callback cb) { request("GET", path, null, cb); }

    public void postJson(String path, String json, Callback cb) { request("POST", path, json, cb); }

    private void request(final String method, final String path, final String body, final Callback cb) {
        new Thread(new Runnable() {
            @Override public void run() {
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(baseUrl + path).openConnection();
                    c.setRequestMethod(method);
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(20000);
                    if (body != null) {
                        c.setDoOutput(true);
                        c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                        OutputStream os = c.getOutputStream();
                        os.write(body.getBytes("UTF-8"));
                        os.close();
                    }
                    final int status = c.getResponseCode();
                    InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while (in != null && (n = in.read(buf)) > 0) out.write(buf, 0, n);
                    final String text = out.toString("UTF-8");
                    main.post(new Runnable() { @Override public void run() { cb.onResult(status, text, null); } });
                } catch (final Exception e) {
                    main.post(new Runnable() { @Override public void run() { cb.onResult(-1, null, e); } });
                } finally {
                    if (c != null) c.disconnect();
                }
            }
        }).start();
    }
}
`,
    },
  },
};

export async function lookupForEditor(L: Loaded, id: number) {
  return lookup(L.resolver, id);
}
export { bestDrawableFile };
