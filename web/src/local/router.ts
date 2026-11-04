/**
 * On-device implementation of the APPXRAY REST API. Same routes and payloads as server/src/api.ts, backed by
 * IndexedDB and the shared engines, so the whole UI works inside the Android app without any server.
 */
import { zipSync } from 'fflate';
import { Buffer } from 'buffer';
import * as db from './db';
import { importApk, load, invalidate } from './engine';
import { buildApkOnDevice, MIN_SDK, TARGET_SDK } from './apkbuild';
import { categorize, colorsOf, type Analysis } from '../../../server/src/engines/analysis-core';
import { isBinaryXml, parseBinaryXml, toXmlText, frameworkAttrName, formatValue, VT } from '../../../server/src/engines/res';
import { accessString, classRefs } from '../../../server/src/engines/dex';
import { redact, secretKind } from '../../../server/src/engines/detect';
import { listLayouts, layoutTree, screenGraph, drawableToSvg, refsOf } from '../../../server/src/engines/ui';
import { buildProjectFiles, defaultOptions, resName, type ProjectOptions, type ProjectRecord, type StoredScreen } from '../../../server/src/engines/rebuild-core';

type Q = URLSearchParams;
interface Ctx { m: RegExpMatchArray; q: Q; method: string; body: unknown; file?: File }
type Handler = (c: Ctx) => Promise<Response | unknown>;

class HttpError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const blobRes = (data: Uint8Array | Blob | string, type: string) => new Response(data as BodyInit, { headers: { 'content-type': type } });
const str = (v: string | null, max = 500) => (v ?? '').slice(0, max);

export interface LocalBuild {
  id: string;
  projectId: string;
  mode: 'device';
  status: 'queued' | 'running' | 'success' | 'failed';
  createdAt: string;
  endedAt?: string;
  durationMs?: number;
  errors: { file?: string; line?: number; message: string; tool: string }[];
  checks: { name: string; ok: boolean; detail?: string }[];
  apk?: { file: string; size: number; sha256: string; package?: string; classes?: number };
  log: string[];
}
const running = new Map<string, LocalBuild>();

function summary(a: Analysis) {
  return { id: a.id, createdAt: a.createdAt, status: a.status, error: a.error, file: a.file, package: a.package, appLabel: a.appLabel, versionName: a.versionName, icon: a.icon, files: a.files?.total, classes: a.dex?.classes, libraries: a.libraries?.length, container: a.container?.kind };
}
const newId = () => {
  const b = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const sha256hex = async (u: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', u.slice().buffer))].map((x) => x.toString(16).padStart(2, '0')).join('');

const stored = (aid: string, key: string) => db.get<StoredScreen>('ui', `${aid}/${resName(key)}`);
async function storedList(aid: string) {
  return (await db.all<StoredScreen & { aid: string }>('ui')).filter((s) => s.aid === aid);
}
const sortDesc = <T,>(xs: T[], k: (x: T) => string) => xs.sort((a, b) => k(b).localeCompare(k(a)));

async function generate(o: ProjectOptions, existing?: string): Promise<ProjectRecord> {
  const L = o.analysisId ? await load(o.analysisId) : undefined;
  const id = existing ?? newId();
  const files: Record<string, Uint8Array | string> = {};
  const icon = await db.get<Blob>('blobs', `icon:${id}`);
  const report = await buildProjectFiles(o, { L, getStored: (k) => (o.analysisId ? stored(o.analysisId, k).then((x) => x ?? null) : Promise.resolve(null)), uploadedIcon: icon ? Buffer.from(await icon.arrayBuffer()) : undefined }, {
    async write(rel, data) {
      files[rel] = typeof data === 'string' ? data : new Uint8Array(data);
    },
  });
  const now = new Date().toISOString();
  const prev = existing ? await db.get<ProjectRecord>('projects', id) : undefined;
  const rec: ProjectRecord = { id, name: o.appName, analysisId: o.analysisId, createdAt: prev?.createdAt ?? now, updatedAt: now, options: o, report };
  await db.put('projectFiles', id, files);
  await db.put('projects', id, rec);
  return rec;
}

function normalizeOptions(o: Partial<ProjectOptions> | undefined): ProjectOptions {
  if (!o) throw new HttpError(400, 'Options manquantes');
  const d = defaultOptions();
  return {
    ...d,
    ...o,
    appName: String(o.appName ?? '').slice(0, 60).trim(),
    packageName: String(o.packageName ?? '').trim(),
    versionCode: Number(o.versionCode) || 1,
    minSdk: Number(o.minSdk) || 21,
    colors: { ...d.colors, ...(o.colors ?? {}) },
    screens: (o.screens ?? []).filter((s) => s?.key),
    features: (o.features ?? []).filter((f) => ['login', 'webview', 'settings', 'list', 'network'].includes(f?.id)),
    strings: o.strings ?? {},
  } as ProjectOptions;
}

async function runBuild(b: LocalBuild) {
  const started = Date.now();
  const log = (l: string) => b.log.push(l);
  b.status = 'running';
  try {
    const p = await db.get<ProjectRecord>('projects', b.projectId);
    if (!p) throw new Error('Projet introuvable');
    const L = p.analysisId ? await load(p.analysisId).catch(() => undefined) : undefined;
    const icon = await db.get<Blob>('blobs', `icon:${p.id}`);
    log('ℹ Compilation sur l’appareil : moteur APPXRAY précompilé + écrans, fonctionnalités, couleurs, textes et icône du projet.');
    log('ℹ Les modifications manuelles de fichiers Java/XML du projet ne sont pas compilées ici (pas de JDK sur un téléphone) : utilisez l’export ZIP + Android Studio pour cela.');
    const r = await buildApkOnDevice({
      options: p.options,
      L,
      getStored: async (k) => (p.analysisId ? (await stored(p.analysisId, k)) ?? null : null),
      layoutTree: async (k) => (L ? (await layoutTree(L, k))?.root ?? null : null),
      uploadedIcon: icon ? new Uint8Array(await icon.arrayBuffer()) : undefined,
      log,
    });
    b.checks = r.checks;
    await db.put('blobs', `build:${b.id}`, new Blob([r.apk as BlobPart], { type: 'application/vnd.android.package-archive' }));
    b.apk = { file: 'app.apk', size: r.apk.length, sha256: await sha256hex(r.apk), package: r.package, classes: r.classes };
    log(`✔ APK prêt : ${r.package}, ${(r.apk.length / 1024).toFixed(0)} Ko, minSdk ${MIN_SDK}, targetSdk ${TARGET_SDK}, signature v1`);
    b.status = 'success';
  } catch (e) {
    b.status = 'failed';
    b.errors.push({ message: (e as Error).message, tool: 'appxray' });
    log(`✖ ${(e as Error).message}`);
  } finally {
    b.endedAt = new Date().toISOString();
    b.durationMs = Date.now() - started;
    await db.put('builds', b.id, b);
    running.delete(b.id);
  }
}

const routes: [string, RegExp, Handler][] = [
  ['GET', /^\/health$/, async () => ({ ok: true })],
  [
    'GET',
    /^\/system$/,
    async () => {
      const settings = (await db.get<{ autoDecompile: boolean; jadxThreads: number }>('settings', 'settings')) ?? { autoDecompile: false, jadxThreads: 1 };
      return {
        mode: 'device',
        tools: { javac: false, keytool: false, jarsigner: false, frameworkRes: true, androidStubs: false, dx: false, sandbox: { netns: false, prlimit: false } },
        buildModes: { gradle: false, lite: false, device: true, reasons: { gradle: 'Nécessite un ordinateur avec le SDK Android', lite: 'Nécessite un JDK (ordinateur)' } },
        limits: { maxUploadBytes: 512 * 1024 * 1024, maxEntries: 100000, maxCompressionRatio: 250, toolTimeoutMs: 0, toolMemoryMb: 0 },
        storage: await db.usage(),
        settings,
        authRequired: false,
      };
    },
  ],
  ['PUT', /^\/settings$/, async (c) => (await db.put('settings', 'settings', c.body), c.body)],
  [
    'DELETE',
    /^\/data$/,
    async (c) => {
      if (c.q.get('confirm') !== 'DELETE') throw new HttpError(400, 'Confirmation requise');
      await db.clearAll();
      return { ok: true };
    },
  ],
  [
    'GET',
    /^\/dashboard$/,
    async () => {
      const analyses = sortDesc(await db.all<Analysis>('analyses'), (a) => a.createdAt);
      const projects = sortDesc(await db.all<ProjectRecord>('projects'), (p) => p.updatedAt);
      const builds = sortDesc([...(await db.all<LocalBuild>('builds')), ...running.values()], (b) => b.createdAt);
      return {
        counts: { analyses: analyses.length, projects: projects.length, builds: builds.length, filesAnalyzed: analyses.reduce((s, a) => s + (a.files?.total ?? 0), 0), classesIndexed: analyses.reduce((s, a) => s + (a.dex?.classes ?? 0), 0) },
        storage: await db.usage(),
        recentAnalyses: analyses.slice(0, 6).map(summary),
        recentProjects: projects.slice(0, 6).map((p) => ({ id: p.id, name: p.name, analysisId: p.analysisId, updatedAt: p.updatedAt, screens: p.report.screens.length })),
        builds: { success: builds.filter((b) => b.status === 'success').length, failed: builds.filter((b) => b.status === 'failed').length, running: running.size, recent: builds.slice(0, 6) },
        jobs: [],
      };
    },
  ],
  // ───── analyses
  [
    'POST',
    /^\/analyses$/,
    async (c) => {
      if (!c.file) throw new HttpError(400, 'Aucun fichier reçu');
      if (!/\.(apk|apks|xapk|apkm|zip)$/i.test(c.file.name)) throw new HttpError(415, 'Format non supporté (APK, APKS, XAPK, APKM)');
      return json(await importApk(c.file, c.file.name), 201);
    },
  ],
  ['GET', /^\/analyses$/, async () => sortDesc(await db.all<Analysis>('analyses'), (a) => a.createdAt).map(summary)],
  [
    'GET',
    /^\/analyses\/([\w-]+)$/,
    async (c) => {
      const a = await db.get<Analysis>('analyses', c.m[1]);
      if (!a) throw new HttpError(404, 'Analyse introuvable');
      return { ...a, decompile: {}, jobs: [] };
    },
  ],
  [
    'DELETE',
    /^\/analyses\/([\w-]+)$/,
    async (c) => {
      const id = c.m[1];
      invalidate(id);
      await db.del('analyses', id);
      for (const k of ['apk', 'files', 'manifest']) await db.del('blobs', `${k}:${id}`);
      await db.delPrefix('ui', `${id}/`);
      return { ok: true };
    },
  ],
  ['GET', /^\/analyses\/([\w-]+)\/manifest$/, async (c) => blobRes(redact((await db.get<string>('blobs', `manifest:${c.m[1]}`)) ?? ''), 'text/plain')],
  ['GET', /^\/analyses\/([\w-]+)\/files$/, async (c) => (await load(c.m[1])).files.map(([name, size, csize, method]) => ({ name, size, csize, method, category: categorize(name) }))],
  [
    'GET',
    /^\/analyses\/([\w-]+)\/entry$/,
    async (c) => {
      const L = await load(c.m[1]);
      const name = str(c.q.get('path'), 1000);
      if (!L.files.some((f) => f[0] === name)) throw new HttpError(404, 'Entrée introuvable');
      const raw = c.q.get('mode') === 'raw';
      const buf = await L.read(name, raw ? 64 * 1024 * 1024 : 8 * 1024 * 1024);
      if (!buf) throw new HttpError(404, 'Entrée illisible');
      const ext = (name.match(/\.\w+$/)?.[0] ?? '').toLowerCase();
      const TYPES: Record<string, string> = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ttf': 'font/ttf', '.otf': 'font/otf' };
      if (raw) return blobRes(new Uint8Array(buf), TYPES[ext] ?? 'application/octet-stream');
      if (isBinaryXml(buf)) {
        try {
          return { kind: 'xml', text: redact(toXmlText(parseBinaryXml(buf, frameworkAttrName(L.resolver)), L.resolver)) };
        } catch (e) {
          return { kind: 'error', text: (e as Error).message };
        }
      }
      const t = TYPES[ext];
      if (t?.startsWith('image')) return { kind: 'image', size: buf.length };
      if (t) return { kind: t.startsWith('font') ? 'font' : 'media', size: buf.length, type: t };
      const sample = buf.subarray(0, 4096);
      const printable = sample.length === 0 || sample.filter((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 128).length / sample.length > 0.95;
      if (printable && !sample.includes(0)) return { kind: 'text', text: redact(buf.toString('utf8', 0, Math.min(buf.length, 512 * 1024))), truncated: buf.length > 512 * 1024 };
      const hex: string[] = [];
      for (let i = 0; i < Math.min(buf.length, 1024); i += 16) {
        const s = buf.subarray(i, i + 16);
        hex.push(`${i.toString(16).padStart(8, '0')}  ${[...s].map((x) => x.toString(16).padStart(2, '0')).join(' ').padEnd(48)}  ${[...s].map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('')}`);
      }
      const magic = buf.subarray(0, 4).toString('latin1') === '\x7fELF' ? 'ELF (bibliothèque native)' : buf.subarray(0, 4).toString('latin1') === 'dex\n' ? 'DEX' : 'inconnu';
      return { kind: 'binary', size: buf.length, magic, hex: hex.join('\n') };
    },
  ],
  [
    'GET',
    /^\/analyses\/([\w-]+)\/drawable$/,
    async (c) => {
      const L = await load(c.m[1]);
      const name = str(c.q.get('path'), 1000);
      if (!L.files.some((f) => f[0] === name)) throw new HttpError(404, 'Ressource introuvable');
      if (name.endsWith('.xml')) {
        const svg = await drawableToSvg(L, name);
        if (!svg) throw new HttpError(415, 'Drawable XML non convertible');
        return blobRes(svg, 'image/svg+xml');
      }
      const b = await L.read(name, 16 * 1024 * 1024);
      const ext = name.split('.').pop()!.toLowerCase();
      return blobRes(new Uint8Array(b!), ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`);
    },
  ],
  [
    'GET',
    /^\/analyses\/([\w-]+)\/resources$/,
    async (c) => {
      const L = await load(c.m[1]);
      const type = str(c.q.get('type'), 40);
      const t = L.resolver.app;
      if (!t) return { types: {}, items: [] };
      if (type === 'color') return { types: t.typeCounts, items: colorsOf(L.resolver) };
      const items: { id: string; name: string; config: string; value: string }[] = [];
      for (const e of t.entries.values()) {
        if (e.type !== type) continue;
        for (const v of e.values) {
          let val = v.value ? formatValue(v.value, L.resolver) : `{style: ${v.bag?.items.length ?? 0} éléments}`;
          if (v.value?.type === VT.STRING && secretKind(val)) val = redact(val);
          items.push({ id: '0x' + e.id.toString(16), name: e.name, config: v.config, value: val.slice(0, 500) });
        }
        if (items.length > 20000) break;
      }
      return { types: t.typeCounts, items };
    },
  ],
  ['POST', /^\/analyses\/([\w-]+)\/decompile$/, async () => []],
  // ───── code
  [
    'GET',
    /^\/analyses\/([\w-]+)\/code\/tree$/,
    async (c) => {
      const L = await load(c.m[1]);
      const pkg = str(c.q.get('pkg'), 300);
      const prefix = pkg ? pkg + '.' : '';
      const pkgs = new Map<string, number>();
      const classes: { name: string; simple: string; access: string; methods: number; dex: string }[] = [];
      for (const [name, e] of L.classIndex) {
        if (!name.startsWith(prefix)) continue;
        const rest = name.slice(prefix.length);
        const dot = rest.indexOf('.');
        if (dot >= 0) pkgs.set(prefix + rest.slice(0, dot), (pkgs.get(prefix + rest.slice(0, dot)) ?? 0) + 1);
        else classes.push({ name, simple: rest, access: accessString(e.cls.access), methods: e.cls.methods.length, dex: e.file });
      }
      const own = L.analysis.package ?? '';
      return {
        packages: [...pkgs].map(([name, count]) => ({ name, count, own: !!own && (name.startsWith(own) || own.startsWith(name)) })).sort((a, b) => Number(b.own) - Number(a.own) || a.name.localeCompare(b.name)),
        classes: classes.sort((a, b) => a.simple.localeCompare(b.simple)).slice(0, 5000),
        libraries: L.analysis.libraries.map((l) => l.name),
      };
    },
  ],
  [
    'GET',
    /^\/analyses\/([\w-]+)\/code\/class$/,
    async (c) => {
      const L = await load(c.m[1]);
      const e = L.classIndex.get(str(c.q.get('name'), 500));
      if (!e) throw new HttpError(404, 'Classe introuvable');
      const { cls, dex } = e;
      const refs = classRefs(dex, cls);
      return {
        name: cls.name,
        dex: e.file,
        access: accessString(cls.access),
        superName: cls.superName,
        interfaces: cls.interfaces,
        sourceFile: cls.sourceFile,
        fields: cls.fields.map((f) => ({ name: f.name, type: f.type, access: accessString(f.access) })),
        methods: cls.methods.map((m) => ({ name: m.name, params: m.params, ret: m.ret, access: accessString(m.access), insns: m.insnsSize })),
        refs: { types: [...refs.types].filter((t) => L.classIndex.has(t)).slice(0, 300), external: [...refs.types].filter((t) => !L.classIndex.has(t)).slice(0, 300), invokes: [...refs.invokes].slice(0, 500), strings: [...refs.strings].slice(0, 300).map(redact) },
        java: null,
        smali: null,
        disasm: redact(dex.disassemble(cls)).slice(0, 2_000_000),
      };
    },
  ],
  [
    'GET',
    /^\/analyses\/([\w-]+)\/code\/usages$/,
    async (c) => {
      const L = await load(c.m[1]);
      const name = str(c.q.get('name'), 500);
      const out: string[] = [];
      for (const k of L.classIndex.keys()) {
        if (k !== name && refsOf(L, k)?.types.has(name)) out.push(k);
        if (out.length >= 500) break;
      }
      return out;
    },
  ],
  [
    'GET',
    /^\/analyses\/([\w-]+)\/code\/search$/,
    async (c) => {
      const L = await load(c.m[1]);
      const q = str(c.q.get('q'), 200).toLowerCase();
      const kind = c.q.get('kind') || 'class';
      if (q.length < 2) return [];
      const out: { kind: string; label: string; cls: string; detail?: string }[] = [];
      if (kind === 'class') {
        for (const n of L.classIndex.keys()) if (n.toLowerCase().includes(q) && out.push({ kind, label: n, cls: n }) >= 300) break;
      } else if (kind === 'method') {
        outer: for (const [n, e] of L.classIndex) for (const m of e.cls.methods) if (m.name.toLowerCase().includes(q) && out.push({ kind, label: `${m.name}(${m.params.join(', ')})`, cls: n, detail: m.ret }) >= 300) break outer;
      } else {
        for (const { dex } of L.dexes) {
          const hits = new Set<number>();
          dex.strings.forEach((s, i) => s.toLowerCase().includes(q) && hits.add(i));
          if (!hits.size) continue;
          outer2: for (const cls of dex.classes) for (const m of cls.methods) for (const ins of dex.instructions(m)) if (ins.kind === 's' && ins.index !== undefined && hits.has(ins.index) && out.push({ kind, label: redact(dex.strings[ins.index]).slice(0, 300), cls: cls.name, detail: m.name }) >= 300) break outer2;
        }
      }
      return out;
    },
  ],
  [
    'GET',
    /^\/analyses\/([\w-]+)\/code\/overview$/,
    async (c) => {
      const L = await load(c.m[1]);
      const byPkg = new Map<string, number>();
      for (const n of L.classIndex.keys()) {
        const p = n.split('.').slice(0, 2).join('.');
        byPkg.set(p, (byPkg.get(p) ?? 0) + 1);
      }
      return { dex: L.analysis.dex, obfuscation: L.analysis.obfuscation, libraries: L.analysis.libraries, topPackages: [...byPkg].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([name, count]) => ({ name, count })), decompile: { device: true } };
    },
  ],
  // ───── UI
  [
    'GET',
    /^\/analyses\/([\w-]+)\/ui\/layouts$/,
    async (c) => {
      const L = await load(c.m[1]);
      const st = await storedList(c.m[1]);
      return { layouts: listLayouts(L).map((l) => ({ ...l, edited: st.some((s) => s.key === l.name) })), stored: st.map((s) => ({ key: s.key, origin: s.origin, title: s.title, baseLayout: s.baseLayout, updatedAt: s.updatedAt })) };
    },
  ],
  ['GET', /^\/analyses\/([\w-]+)\/ui\/graph$/, async (c) => screenGraph(await load(c.m[1]))],
  [
    'GET',
    /^\/analyses\/([\w-]+)\/ui\/screen\/([\w-]+)$/,
    async (c) => {
      const L = await load(c.m[1]);
      const key = c.m[2];
      if (c.q.get('original') !== '1') {
        const s = await stored(c.m[1], key);
        if (s) return { key, origin: s.origin, root: s.root, title: s.title, baseLayout: s.baseLayout };
      }
      const t = await layoutTree(L, key, c.q.get('config') || undefined);
      if (!t) throw new HttpError(404, 'Layout introuvable ou non décodable');
      return { key, origin: 'original', root: t.root, file: t.file, config: t.config };
    },
  ],
  [
    'PUT',
    /^\/analyses\/([\w-]+)\/ui\/screen\/([\w-]+)$/,
    async (c) => {
      const b = c.body as Partial<StoredScreen>;
      if (!b?.root) throw new HttpError(400, 'Arbre UI manquant');
      const key = resName(c.m[2]);
      const s = { aid: c.m[1], key, origin: b.origin === 'assisted' ? 'assisted' : 'edited', baseLayout: b.baseLayout, title: b.title, root: b.root, updatedAt: new Date().toISOString() };
      await db.put('ui', `${c.m[1]}/${key}`, s);
      return s;
    },
  ],
  ['DELETE', /^\/analyses\/([\w-]+)\/ui\/screen\/([\w-]+)$/, async (c) => (await db.del('ui', `${c.m[1]}/${resName(c.m[2])}`), { ok: true })],
  // ───── projects
  [
    'GET',
    /^\/projects\/defaults$/,
    async (c) => {
      const aid = c.q.get('analysisId');
      const L = aid ? await load(aid) : undefined;
      const o = defaultOptions(L);
      let candidates: { key: string; origin: string; usedBy: string[] }[] = [];
      let launcherLayout: string | undefined;
      if (L && aid) {
        const st = await storedList(aid);
        const g = screenGraph(L);
        launcherLayout = g.screens.find((s) => s.launcher)?.layouts[0];
        const layouts = listLayouts(L);
        candidates = [...st.map((s) => ({ key: s.key, origin: s.origin, usedBy: layouts.find((l) => l.name === s.key)?.usedBy ?? [] })), ...layouts.filter((l) => !st.some((s) => s.key === l.name)).map((l) => ({ key: l.name, origin: 'original', usedBy: l.usedBy }))];
        const used = new Set(g.screens.flatMap((s) => s.layouts));
        o.screens = candidates.filter((x) => used.has(x.key) || x.origin !== 'original').slice(0, 20).map((x) => ({ key: x.key, launcher: x.key === launcherLayout }));
        const colors = colorsOf(L.resolver).filter((x) => !x.config);
        const pick = (re: RegExp) => colors.find((x) => re.test(x.name))?.value.toUpperCase();
        o.colors.primary = pick(/^(color_?)?primary$/i) ?? o.colors.primary;
        o.colors.primaryDark = pick(/^(color_?)?primary_?(dark|variant)$/i) ?? o.colors.primaryDark;
        o.colors.accent = pick(/^(color_?)?(accent|secondary)$/i) ?? o.colors.accent;
      }
      return { options: o, candidates, features: L?.analysis.features ?? [], launcherLayout };
    },
  ],
  ['GET', /^\/projects$/, async () => sortDesc(await db.all<ProjectRecord>('projects'), (p) => p.updatedAt)],
  ['POST', /^\/projects$/, async (c) => json(await generate(normalizeOptions((c.body as { options?: ProjectOptions })?.options)), 201)],
  [
    'GET',
    /^\/projects\/([\w-]+)$/,
    async (c) => {
      const p = await db.get<ProjectRecord>('projects', c.m[1]);
      if (!p) throw new HttpError(404, 'Projet introuvable');
      return p;
    },
  ],
  ['PUT', /^\/projects\/([\w-]+)$/, async (c) => generate(normalizeOptions((c.body as { options?: ProjectOptions })?.options), c.m[1])],
  [
    'DELETE',
    /^\/projects\/([\w-]+)$/,
    async (c) => {
      const id = c.m[1];
      await db.del('projects', id);
      await db.del('projectFiles', id);
      await db.del('blobs', `icon:${id}`);
      for (const b of await db.all<LocalBuild>('builds')) if (b.projectId === id) {
        await db.del('builds', b.id);
        await db.del('blobs', `build:${b.id}`);
      }
      return { ok: true };
    },
  ],
  [
    'GET',
    /^\/projects\/([\w-]+)\/files$/,
    async (c) => {
      const f = (await db.get<Record<string, Uint8Array | string>>('projectFiles', c.m[1])) ?? {};
      return Object.entries(f).map(([path, d]) => ({ path, size: typeof d === 'string' ? new TextEncoder().encode(d).length : d.length })).sort((a, b) => a.path.localeCompare(b.path));
    },
  ],
  [
    'GET',
    /^\/projects\/([\w-]+)\/file$/,
    async (c) => {
      const f = (await db.get<Record<string, Uint8Array | string>>('projectFiles', c.m[1])) ?? {};
      const p = str(c.q.get('path'), 1000);
      const d = f[p];
      if (d === undefined) throw new HttpError(404, 'Fichier introuvable');
      if (c.q.get('raw') === '1') return blobRes(typeof d === 'string' ? d : d, /\.png$/.test(p) ? 'image/png' : /\.jpe?g$/.test(p) ? 'image/jpeg' : /\.webp$/.test(p) ? 'image/webp' : 'application/octet-stream');
      if (typeof d === 'string') return { binary: false, size: d.length, text: d };
      return { binary: true, size: d.length };
    },
  ],
  [
    'PUT',
    /^\/projects\/([\w-]+)\/file$/,
    async (c) => {
      const p = str(c.q.get('path'), 1000);
      if (!p || p.includes('..') || p.startsWith('/')) throw new HttpError(400, 'Chemin invalide');
      const f = (await db.get<Record<string, Uint8Array | string>>('projectFiles', c.m[1])) ?? {};
      f[p] = String(c.body ?? '');
      await db.put('projectFiles', c.m[1], f);
      return { ok: true };
    },
  ],
  [
    'DELETE',
    /^\/projects\/([\w-]+)\/file$/,
    async (c) => {
      const f = (await db.get<Record<string, Uint8Array | string>>('projectFiles', c.m[1])) ?? {};
      delete f[str(c.q.get('path'), 1000)];
      await db.put('projectFiles', c.m[1], f);
      return { ok: true };
    },
  ],
  [
    'POST',
    /^\/projects\/([\w-]+)\/upload$/,
    async (c) => {
      const p = str(c.q.get('path'), 1000);
      if (!/^app\/src\/main\/(res|assets)\//.test(p) || p.includes('..')) throw new HttpError(400, 'Seuls res/ et assets/ acceptent des fichiers binaires');
      if (!c.file) throw new HttpError(400, 'Fichier manquant');
      const f = (await db.get<Record<string, Uint8Array | string>>('projectFiles', c.m[1])) ?? {};
      f[p] = new Uint8Array(await c.file.arrayBuffer());
      await db.put('projectFiles', c.m[1], f);
      return { ok: true, path: p };
    },
  ],
  [
    'POST',
    /^\/projects\/([\w-]+)\/icon$/,
    async (c) => {
      const b = c.file ? new Uint8Array(await c.file.arrayBuffer()) : null;
      if (!b || b[0] !== 0x89 || b[1] !== 0x50) throw new HttpError(400, 'Icône PNG attendue');
      const p = await db.get<ProjectRecord>('projects', c.m[1]);
      if (!p) throw new HttpError(404, 'Projet introuvable');
      await db.put('blobs', `icon:${p.id}`, new Blob([b], { type: 'image/png' }));
      return generate(p.options, p.id);
    },
  ],
  [
    'GET',
    /^\/projects\/([\w-]+)\/download$/,
    async (c) => {
      const p = await db.get<ProjectRecord>('projects', c.m[1]);
      const f = (await db.get<Record<string, Uint8Array | string>>('projectFiles', c.m[1])) ?? {};
      if (!p) throw new HttpError(404, 'Projet introuvable');
      const base = (p.name.replace(/[^\w-]+/g, '_') || 'project').slice(0, 40);
      const z: Record<string, Uint8Array> = {};
      for (const [k, v] of Object.entries(f)) z[`${base}/${k}`] = typeof v === 'string' ? new TextEncoder().encode(v) : v;
      return blobRes(zipSync(z), 'application/zip');
    },
  ],
  // ───── builds
  ['GET', /^\/builds$/, async (c) => sortDesc([...(await db.all<LocalBuild>('builds')), ...running.values()].filter((b) => !c.q.get('projectId') || b.projectId === c.q.get('projectId')), (b) => b.createdAt)],
  [
    'POST',
    /^\/builds$/,
    async (c) => {
      const pid = (c.body as { projectId?: string })?.projectId;
      if (!pid || !(await db.get('projects', pid))) throw new HttpError(404, 'Projet introuvable');
      const b: LocalBuild = { id: newId(), projectId: pid, mode: 'device', status: 'queued', createdAt: new Date().toISOString(), errors: [], checks: [], log: [] };
      running.set(b.id, b);
      void runBuild(b);
      return json(b, 201);
    },
  ],
  [
    'GET',
    /^\/builds\/([\w-]+)$/,
    async (c) => {
      const b = running.get(c.m[1]) ?? (await db.get<LocalBuild>('builds', c.m[1]));
      if (!b) throw new HttpError(404, 'Compilation introuvable');
      return b;
    },
  ],
  [
    'GET',
    /^\/builds\/([\w-]+)\/apk$/,
    async (c) => {
      const blob = await db.get<Blob>('blobs', `build:${c.m[1]}`);
      if (!blob) throw new HttpError(404, 'APK indisponible');
      return new Response(blob, { headers: { 'content-type': 'application/vnd.android.package-archive' } });
    },
  ],
  ['DELETE', /^\/builds\/([\w-]+)$/, async (c) => (await db.del('builds', c.m[1]), await db.del('blobs', `build:${c.m[1]}`), { ok: true })],
  ['GET', /^\/jobs$/, async () => []],
];

export async function localFetch(path: string, init: RequestInit & { file?: File } = {}): Promise<Response> {
  const u = new URL(path, 'http://local');
  const method = (init.method ?? 'GET').toUpperCase();
  let body: unknown = undefined;
  if (typeof init.body === 'string') {
    const t = new Headers(init.headers).get('content-type') ?? '';
    body = t.includes('json') ? JSON.parse(init.body) : init.body;
  }
  for (const [m, re, h] of routes) {
    if (m !== method) continue;
    const match = u.pathname.match(re);
    if (!match) continue;
    try {
      const r = await h({ m: match, q: u.searchParams, method, body, file: init.file });
      return r instanceof Response ? r : json(r);
    } catch (e) {
      const status = (e as HttpError).status ?? 500;
      if (status >= 500) console.error(e);
      return json({ error: (e as Error).message }, status);
    }
  }
  return json({ error: `Route inconnue: ${method} ${u.pathname}` }, 404);
}
