/**
 * Environment-independent analysis core (no Node APIs): used by the server and by the on-device engine
 * that runs inside the APPXRAY Android app / PWA service worker.
 */
import { parseResTable, parseBinaryXml, toXmlText, frameworkAttrName, Resolver, ResTable, XmlNode, getAttr, attrValue, formatValue, resolveDeep, isColor, colorHex, VT } from './res.js';
import { Dex, DexClass } from './dex.js';
import type { SignatureInfo } from './signature.js';
import { detectLibraries, detectFeatures, obfuscationScore, secretKind, Detection, Feature } from './detect.js';

export interface InvEntry { name: string; size: number; compressedSize: number; method: number; encrypted?: boolean; unsafeName?: boolean }
export interface Inventory { entries: InvEntry[]; totalUncompressed: number; warnings: string[] }

export interface Component {
  type: 'activity' | 'service' | 'receiver' | 'provider' | 'activity-alias';
  name: string;
  exported?: boolean;
  launcher?: boolean;
  permission?: string;
  intentFilters: { actions: string[]; categories: string[]; data: string[] }[];
}

export interface Analysis {
  id: string;
  createdAt: string;
  status: 'processing' | 'ready' | 'error';
  error?: string;
  file: { name: string; size: number; sha256: string; sha1: string; md5: string };
  container: { kind: 'apk' | 'bundle'; format?: string; splits?: { name: string; size: number }[]; note?: string };
  package?: string;
  appLabel?: string;
  versionName?: string;
  versionCode?: string;
  minSdk?: string;
  targetSdk?: string;
  compileSdk?: string;
  icon?: { ref: string; path?: string };
  abis: string[];
  split: { isSplit: boolean; splitName?: string; requiresSplits: boolean; note?: string };
  debuggable: boolean;
  allowBackup?: boolean;
  usesCleartext?: boolean;
  components: Component[];
  permissions: { name: string; dangerous: boolean }[];
  usesFeatures: string[];
  metaData: { name: string; value: string }[];
  signature?: SignatureInfo;
  files: { total: number; uncompressed: number; categories: Record<string, { count: number; bytes: number }> };
  resources?: { packages: { id: number; name: string }[]; typeCounts: Record<string, number>; entries: number };
  dex: { files: { name: string; version: string; classes: number; methods: number; strings: number }[]; classes: number; methods: number };
  libraries: Detection[];
  obfuscation?: ReturnType<typeof obfuscationScore>;
  features: Feature[];
  secrets: { kind: string; count: number }[];
  warnings: string[];
}

const DANGEROUS = new Set(
  'READ_CALENDAR WRITE_CALENDAR CAMERA READ_CONTACTS WRITE_CONTACTS GET_ACCOUNTS ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION ACCESS_BACKGROUND_LOCATION RECORD_AUDIO READ_PHONE_STATE READ_PHONE_NUMBERS CALL_PHONE ANSWER_PHONE_CALLS READ_CALL_LOG WRITE_CALL_LOG ADD_VOICEMAIL USE_SIP BODY_SENSORS SEND_SMS RECEIVE_SMS READ_SMS RECEIVE_WAP_PUSH RECEIVE_MMS READ_EXTERNAL_STORAGE WRITE_EXTERNAL_STORAGE READ_MEDIA_IMAGES READ_MEDIA_VIDEO READ_MEDIA_AUDIO POST_NOTIFICATIONS BLUETOOTH_CONNECT BLUETOOTH_SCAN NEARBY_WIFI_DEVICES ACTIVITY_RECOGNITION'
    .split(' ')
    .map((p) => 'android.permission.' + p),
);

export function categorize(name: string): string {
  const n = name.toLowerCase();
  if (/^classes\d*\.dex$/.test(n)) return 'dex';
  if (n === 'androidmanifest.xml') return 'manifest';
  if (n === 'resources.arsc') return 'resources';
  if (n.startsWith('meta-inf/')) return /\.(rsa|dsa|ec|sf|mf)$/.test(n) ? 'signature' : 'metadata';
  if (n.startsWith('lib/') && n.endsWith('.so')) return 'native';
  if (/\.(png|webp|jpe?g|gif|bmp|svg|heic|avif)$/.test(n)) return 'image';
  if (/\.(ttf|otf|woff2?|ttc)$/.test(n)) return 'font';
  if (/\.(mp3|ogg|wav|m4a|aac|flac|mid|midi|opus|amr)$/.test(n)) return 'audio';
  if (/\.(mp4|webm|3gp|mkv|mov)$/.test(n)) return 'video';
  if (n.startsWith('res/layout')) return 'layout';
  if (n.startsWith('res/')) return 'res-xml';
  if (/\.(json|properties|ya?ml|txt|xml|conf|cfg|ini|pro|toml)$/.test(n)) return 'config';
  if (/\.(dll|jar|bundle|js|html|css|wasm|bin|dat|pak)$/.test(n)) return 'bundle';
  if (n.startsWith('assets/')) return 'asset';
  if (n.startsWith('kotlin/') || n.endsWith('.kotlin_builtins') || n.endsWith('.kotlin_module')) return 'kotlin-meta';
  return 'other';
}


export function newAnalysis(id: string, file: Analysis['file'], container: Analysis['container'], warnings: string[]): Analysis {
  return {
    id,
    createdAt: new Date().toISOString(),
    status: 'processing',
    file,
    container,
    abis: [],
    split: { isSplit: false, requiresSplits: false },
    debuggable: false,
    components: [],
    permissions: [],
    usesFeatures: [],
    metaData: [],
    files: { total: 0, uncompressed: 0, categories: {} },
    dex: { files: [], classes: 0, methods: 0 },
    libraries: [],
    features: [],
    secrets: [],
    warnings: [...warnings],
  };
}

export const NEEDED_ENTRY = (n: string) => n === 'AndroidManifest.xml' || n === 'resources.arsc' || /^classes\d*\.dex$/.test(n) || /^META-INF\/[^/]+\.(RSA|DSA|EC)$/i.test(n);

/** Fill `a` from the archive inventory and the decoded key entries. Returns the decoded manifest text. */
export function analyzeCore(a: Analysis, inv: Inventory, blobs: Map<string, Buffer>, framework: ResTable | undefined, signature: SignatureInfo | undefined): string {
  a.warnings.push(...inv.warnings.filter((w) => !a.warnings.includes(w)));
  a.files.total = inv.entries.length;
  a.files.uncompressed = inv.totalUncompressed;
  for (const e of inv.entries) {
    const c = categorize(e.name);
    a.files.categories[c] ??= { count: 0, bytes: 0 };
    a.files.categories[c].count++;
    a.files.categories[c].bytes += e.size;
  }
  a.abis = [...new Set(inv.entries.map((e) => /^lib\/([^/]+)\/[^/]+\.so$/.exec(e.name)?.[1]).filter(Boolean) as string[])];
  if (inv.entries.some((e) => e.encrypted)) a.warnings.push('Certaines entrées ont le drapeau « chiffré » (technique anti-analyse, ignorée par Android et par APPXRAY).');

  let table: ResTable | undefined;
  const arsc = blobs.get('resources.arsc');
  if (arsc) {
    try {
      table = parseResTable(arsc);
      a.resources = { packages: table.packages, typeCounts: table.typeCounts, entries: table.entries.size };
    } catch (e) {
      a.warnings.push(`resources.arsc illisible: ${(e as Error).message}`);
    }
  } else a.warnings.push('Pas de resources.arsc (APK split ou application sans ressources compilées).');
  const r: Resolver = { app: table, framework };

  // Manifest
  const mbuf = blobs.get('AndroidManifest.xml');
  if (!mbuf) throw new Error('AndroidManifest.xml manquant');
  const manifest = parseBinaryXml(mbuf, frameworkAttrName(r));
  const manifestXml = toXmlText(manifest, r);
  readManifest(a, manifest, r);

  // Signatures
  a.signature = signature;

  // DEX
  const classNames: string[] = [];
  const stringSample: string[] = [];
  const secretCounts = new Map<string, number>();
  for (const [name, buf] of [...blobs].filter(([n]) => n.endsWith('.dex')).sort(([x], [y]) => x.localeCompare(y, 'en', { numeric: true }))) {
    try {
      const d = new Dex(buf);
      const methods = d.classes.reduce((s, c) => s + c.methods.length, 0);
      a.dex.files.push({ name, version: d.version, classes: d.classes.length, methods, strings: d.strings.length });
      a.dex.classes += d.classes.length;
      a.dex.methods += methods;
      for (const c of d.classes) classNames.push(c.name);
      for (const s of d.strings) {
        if (s.length < 8 || s.length > 4096) continue;
        const k = secretKind(s);
        if (k) secretCounts.set(k, (secretCounts.get(k) ?? 0) + 1);
        if (stringSample.length < 50000) stringSample.push(s);
      }
    } catch (e) {
      a.warnings.push(`${name}: ${(e as Error).message}`);
    }
  }
  a.secrets = [...secretCounts].map(([kind, count]) => ({ kind, count }));
  if (a.secrets.length) a.warnings.push('Des chaînes ressemblant à des secrets ont été détectées. Elles sont masquées dans APPXRAY et ne sont jamais copiées dans les projets reconstruits.');

  const files = inv.entries.map((e) => e.name);
  const input = {
    files,
    classNames,
    permissions: a.permissions.map((p) => p.name),
    strings: stringSample,
    manifestComponents: a.components.map((c) => c.name),
    metaData: a.metaData.map((m) => m.name),
  };
  a.libraries = detectLibraries(input);
  a.obfuscation = a.package ? obfuscationScore(classNames, a.package) : undefined;
  a.features = detectFeatures(input, a.libraries);
  return manifestXml;
}

function readManifest(a: Analysis, m: XmlNode, r: Resolver) {
  const v = (n: XmlNode, name: string) => {
    const at = getAttr(n, name);
    return at ? attrValue(at, r) : undefined;
  };
  a.package = v(m, 'package');
  a.versionCode = v(m, 'versionCode');
  a.versionName = v(m, 'versionName');
  a.compileSdk = v(m, 'compileSdkVersion') ?? v(m, 'platformBuildVersionCode');
  const splitName = v(m, 'split');
  const requiredSplitTypes = v(m, 'requiredSplitTypes');
  const isSplitRequired = m.children.find((c) => c.tag === 'application')?.attrs.some((x) => x.name === 'isSplitRequired' && x.value.data !== 0);
  a.split = { isSplit: !!splitName, splitName, requiresSplits: !!(isSplitRequired || requiredSplitTypes), note: undefined };
  for (const c of m.children) {
    if (c.tag === 'uses-sdk') {
      a.minSdk = v(c, 'minSdkVersion');
      a.targetSdk = v(c, 'targetSdkVersion');
    } else if (c.tag === 'uses-permission' || c.tag === 'uses-permission-sdk-23') {
      const name = v(c, 'name');
      if (name) a.permissions.push({ name, dangerous: DANGEROUS.has(name) });
    } else if (c.tag === 'uses-feature') {
      const name = v(c, 'name');
      if (name) a.usesFeatures.push(name);
    } else if (c.tag === 'application') {
      const label = getAttr(c, 'label');
      if (label) {
        const rv = resolveDeep(r, label.value);
        a.appLabel = rv.type === VT.STRING ? rv.str : attrValue(label, r);
      }
      const icon = getAttr(c, 'icon') ?? getAttr(c, 'roundIcon');
      if (icon) a.icon = { ref: formatValue(icon.value, r), path: bestDrawableFile(r, icon.value.data) };
      a.debuggable = c.attrs.some((x) => x.name === 'debuggable' && x.value.data !== 0);
      const ab = getAttr(c, 'allowBackup');
      a.allowBackup = ab ? ab.value.data !== 0 : undefined;
      const ct = getAttr(c, 'usesCleartextTraffic');
      a.usesCleartext = ct ? ct.value.data !== 0 : undefined;
      for (const k of c.children) {
        if (['activity', 'activity-alias', 'service', 'receiver', 'provider'].includes(k.tag)) {
          const comp: Component = { type: k.tag as Component['type'], name: qualify(v(k, 'name') ?? '?', a.package), intentFilters: [] };
          const exp = getAttr(k, 'exported');
          if (exp) comp.exported = exp.value.data !== 0;
          comp.permission = v(k, 'permission');
          for (const f of k.children.filter((x) => x.tag === 'intent-filter')) {
            const filt = {
              actions: f.children.filter((x) => x.tag === 'action').map((x) => v(x, 'name') ?? ''),
              categories: f.children.filter((x) => x.tag === 'category').map((x) => v(x, 'name') ?? ''),
              data: f.children.filter((x) => x.tag === 'data').map((x) => x.attrs.map((at) => `${at.name}=${attrValue(at, r)}`).join(' ')),
            };
            comp.intentFilters.push(filt);
            if (filt.actions.includes('android.intent.action.MAIN') && filt.categories.includes('android.intent.category.LAUNCHER')) comp.launcher = true;
          }
          if (comp.exported === undefined && comp.intentFilters.length) comp.exported = true; // pre-API 31 implicit export
          a.components.push(comp);
        } else if (k.tag === 'meta-data') {
          const name = v(k, 'name') ?? '';
          const raw = v(k, 'value') ?? v(k, 'resource') ?? '';
          a.metaData.push({ name, value: secretKind(raw) ? raw.slice(0, 4) + '…[masqué]' : raw.slice(0, 200) });
        }
      }
    }
  }
  if (a.split.isSplit) a.split.note = `Cet APK est un split (« ${splitName} ») : il ne contient qu'une partie de l'application.`;
  else if (a.split.requiresSplits) a.split.note = "Cet APK déclare nécessiter des splits : importez le bundle complet (.apks/.xapk) pour une analyse exhaustive. Les ressources ou bibliothèques natives présentes uniquement dans les splits ne sont pas visibles.";
}

function qualify(name: string, pkg?: string) {
  if (name.startsWith('.') && pkg) return pkg + name;
  if (!name.includes('.') && pkg) return `${pkg}.${name}`;
  return name;
}

const DENSITY_RANK: Record<string, number> = { xxxhdpi: 6, xxhdpi: 5, xhdpi: 4, hdpi: 3, tvdpi: 2.5, mdpi: 2, ldpi: 1, anydpi: 7, nodpi: 0.5 };
function densityRank(cfg: string) {
  for (const [k, v] of Object.entries(DENSITY_RANK)) if (cfg.split('-').includes(k)) return v;
  return 1.5;
}

/** Best file for a drawable/mipmap resource: prefer bitmaps at high density, then XML. */
export function bestDrawableFile(r: Resolver, id: number, depth = 0): string | undefined {
  const e = r.app?.entries.get(id >>> 0);
  if (!e || depth > 5) return undefined;
  const cands = e.values.filter((x) => x.value?.type === VT.STRING && x.value.str).map((x) => ({ cfg: x.config, p: x.value!.str! }));
  const refs = e.values.filter((x) => x.value?.type === VT.REFERENCE);
  if (!cands.length && refs.length) return bestDrawableFile(r, refs[0].value!.data, depth + 1);
  const bitmaps = cands.filter((c) => /\.(png|webp|jpe?g|gif)$/i.test(c.p) && !c.cfg.includes('night'));
  const pool = bitmaps.length ? bitmaps : cands;
  pool.sort((x, y) => densityRank(y.cfg) - densityRank(x.cfg));
  return pool[0]?.p;
}

// ───────────────────────── Loaded analysis (explorers) ─────────────────────────
export interface Loaded {
  analysis: Analysis;
  resolver: Resolver;
  dexes: { name: string; dex: Dex }[];
  classIndex: Map<string, { dex: Dex; cls: DexClass; file: string }>;
  files: [string, number, number, number][];
  /** read one archive entry (bounded) */
  read(name: string, max?: number): Promise<Buffer | null>;
  /** read several entries */
  readMany(pred: (name: string) => boolean, maxEach?: number): Promise<Map<string, Buffer>>;
}

export function buildLoaded(analysis: Analysis, files: Loaded['files'], blobs: Map<string, Buffer>, framework: ResTable | undefined, io: Pick<Loaded, 'read' | 'readMany'>): Loaded {
  const resolver: Resolver = { framework };
  const arsc = blobs.get('resources.arsc');
  if (arsc) {
    try {
      resolver.app = parseResTable(arsc);
    } catch {
      /* already reported */
    }
  }
  const dexes: Loaded['dexes'] = [];
  const classIndex: Loaded['classIndex'] = new Map();
  for (const [name, buf] of [...blobs].filter(([n]) => n.endsWith('.dex')).sort(([x], [y]) => x.localeCompare(y, 'en', { numeric: true }))) {
    try {
      const dex = new Dex(buf);
      dexes.push({ name, dex });
      for (const cls of dex.classes) if (!classIndex.has(cls.name)) classIndex.set(cls.name, { dex, cls, file: name });
    } catch {
      /* reported during analysis */
    }
  }
  return { analysis, resolver, dexes, classIndex, files, ...io };
}

export function colorsOf(r: Resolver) {
  const out: { name: string; value: string; config: string }[] = [];
  for (const e of r.app?.entries.values() ?? []) {
    if (e.type !== 'color') continue;
    for (const v of e.values) {
      if (!v.value) continue;
      const rv = resolveDeep(r, v.value);
      if (isColor(rv)) out.push({ name: e.name, value: colorHex(rv), config: v.config });
    }
  }
  return out;
}

