import fs from 'node:fs';
import path from 'node:path';
import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import yazl from 'yazl';
import { config, paths, safeId } from './config.js';
import { listRecords, readJson, removeDir, dirSize, getSettings, saveSettings } from './store.js';
import { createAnalysis, runAnalysis, load, Analysis, colorsOf, categorize, invalidate } from './engines/analyzer.js';
import { readEntry } from './engines/zip.js';
import { isBinaryXml, parseBinaryXml, toXmlText, frameworkAttrName, formatValue, VT } from './engines/res.js';
import { accessString, classRefs } from './engines/dex.js';
import { redact, secretKind } from './engines/detect.js';
import { startDecompile, getDecompileState, jadxSourceFor, smaliFor } from './engines/decompile.js';
import { listLayouts, layoutTree, screenGraph, drawableToSvg, refsOf } from './engines/ui.js';
import { defaultOptions, generateProject, ProjectRecord, ProjectOptions, getStoredScreen, saveStoredScreen, listStoredScreens, uiDir, StoredScreen } from './engines/rebuild.js';
import { startBuild, getBuild, availableModes, BuildRecord } from './engines/build.js';
import { toolStatus } from './engines/tools.js';
import { getJob, listJobs, cancelJob, cancelFor } from './jobs.js';

type Req = Request<Record<string, string>>;
type H = (req: Req, res: Response) => Promise<unknown> | unknown;
const wrap = (h: H) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(h(req as Req, res)).catch(next);
const httpError = (status: number, msg: string) => Object.assign(new Error(msg), { status });
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');

const upload = multer({
  storage: multer.diskStorage({ destination: (_r, _f, cb) => cb(null, paths.tmp()), filename: (_r, _f, cb) => cb(null, `up-${Date.now()}-${Math.random().toString(36).slice(2)}`) }),
  limits: { fileSize: config.limits.maxUploadBytes, files: 1 },
});

export function api() {
  const r = express.Router();

  r.use((req, res, next) => {
    if (!config.token) return next();
    const h = req.headers.authorization;
    if (h === `Bearer ${config.token}` || req.query.token === config.token) return next();
    res.status(401).json({ error: 'Authentification requise' });
  });

  // ───────── system ─────────
  r.get('/health', (_q, s) => s.json({ ok: true }));
  r.get(
    '/system',
    wrap(async (req, res) => {
      const usage = await dirSize(config.dataDir);
      res.json({ tools: toolStatus(req.query.refresh === '1'), buildModes: availableModes(), limits: config.limits, storage: usage, settings: await getSettings(), authRequired: !!config.token });
    }),
  );
  r.put('/settings', express.json(), wrap(async (req, res) => res.json(await saveSettings(req.body ?? {}))));
  r.delete(
    '/data',
    wrap(async (req, res) => {
      if (req.query.confirm !== 'DELETE') throw httpError(400, 'Confirmation requise');
      for (const j of listJobs()) cancelJob(j.id);
      for (const d of [paths.analyses(), paths.projects(), paths.builds()]) {
        for (const n of await fs.promises.readdir(d).catch(() => [] as string[])) await removeDir(path.join(d, n));
      }
      res.json({ ok: true });
    }),
  );

  r.get(
    '/dashboard',
    wrap(async (_q, res) => {
      const analyses = (await listRecords<Analysis>(paths.analyses(), 'analysis.json')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const projects = (await listRecords<ProjectRecord>(paths.projects(), 'project.json')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const builds = (await listRecords<BuildRecord>(paths.builds(), 'build.json')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      res.json({
        counts: { analyses: analyses.length, projects: projects.length, builds: builds.length, filesAnalyzed: analyses.reduce((s, a) => s + (a.files?.total ?? 0), 0), classesIndexed: analyses.reduce((s, a) => s + (a.dex?.classes ?? 0), 0) },
        storage: await dirSize(config.dataDir),
        recentAnalyses: analyses.slice(0, 6).map(summary),
        recentProjects: projects.slice(0, 6).map((p) => ({ id: p.id, name: p.name, analysisId: p.analysisId, updatedAt: p.updatedAt, screens: p.report.screens.length })),
        builds: { success: builds.filter((b) => b.status === 'success').length, failed: builds.filter((b) => b.status === 'failed').length, running: builds.filter((b) => b.status === 'running' || b.status === 'queued').length, recent: builds.slice(0, 6) },
        jobs: listJobs((j) => j.status === 'running' || j.status === 'queued').map(jobLite),
      });
    }),
  );

  // ───────── analyses ─────────
  r.post(
    '/analyses',
    upload.single('file'),
    wrap(async (req, res) => {
      if (!req.file) throw httpError(400, 'Aucun fichier reçu');
      if (!/\.(apk|apks|xapk|apkm|zip)$/i.test(req.file.originalname)) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        throw httpError(415, 'Format non supporté (APK, APKS, XAPK, APKM)');
      }
      let a: Analysis;
      try {
        a = await createAnalysis(req.file.path, req.file.originalname);
      } catch (e) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        throw e;
      }
      a = await runAnalysis(a.id);
      if (a.status === 'ready' && (await getSettings()).autoDecompile) await startDecompile(a.id);
      res.status(201).json(a);
    }),
  );
  r.get('/analyses', wrap(async (_q, res) => res.json((await listRecords<Analysis>(paths.analyses(), 'analysis.json')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(summary))));
  r.get(
    '/analyses/:id',
    wrap(async (req, res) => {
      const a = await readJson<Analysis>(path.join(paths.analysis(req.params.id), 'analysis.json'));
      if (!a) throw httpError(404, 'Analyse introuvable');
      res.json({ ...a, decompile: await getDecompileState(a.id), jobs: listJobs((j) => j.target === a.id).slice(0, 10).map(jobLite) });
    }),
  );
  r.delete(
    '/analyses/:id',
    wrap(async (req, res) => {
      const id = safeId(req.params.id);
      cancelFor(id);
      invalidate(id);
      await removeDir(paths.analysis(id));
      res.json({ ok: true });
    }),
  );
  r.post(
    '/analyses/:id/reanalyze',
    wrap(async (req, res) => res.json(await runAnalysis(safeId(req.params.id)))),
  );
  r.get('/analyses/:id/manifest', wrap(async (req, res) => res.type('text/plain').send(redact(await fs.promises.readFile(path.join(paths.analysis(req.params.id), 'AndroidManifest.xml'), 'utf8')))));
  r.get(
    '/analyses/:id/files',
    wrap(async (req, res) => {
      const L = await load(req.params.id);
      res.json(L.files.map(([name, size, csize, method]) => ({ name, size, csize, method, category: categorize(name) })));
    }),
  );
  r.get(
    '/analyses/:id/entry',
    wrap(async (req, res) => {
      const L = await load(req.params.id);
      const name = str(req.query.path, 1000);
      const meta = L.files.find((f) => f[0] === name);
      if (!meta) throw httpError(404, 'Entrée introuvable');
      const mode = str(req.query.mode) || 'auto';
      const buf = await L.read(name, mode === 'raw' ? 64 * 1024 * 1024 : 8 * 1024 * 1024);
      if (!buf) throw httpError(404, 'Entrée illisible');
      const ext = path.extname(name).toLowerCase();
      const IMG: Record<string, string> = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp' };
      const MEDIA: Record<string, string> = { '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ttf': 'font/ttf', '.otf': 'font/otf' };
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (mode === 'raw') {
        const type = IMG[ext] ?? MEDIA[ext];
        if (type) {
          res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
          return res.type(type).send(buf);
        }
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(name).replace(/[^\w.-]/g, '_')}"`);
        return res.type('application/octet-stream').send(buf);
      }
      if (isBinaryXml(buf)) {
        try {
          return res.json({ kind: 'xml', text: redact(toXmlText(parseBinaryXml(buf, frameworkAttrName(L.resolver)), L.resolver)) });
        } catch (e) {
          return res.json({ kind: 'error', text: (e as Error).message });
        }
      }
      if (IMG[ext]) return res.json({ kind: 'image', size: buf.length });
      if (MEDIA[ext]) return res.json({ kind: ext.match(/ttf|otf/) ? 'font' : 'media', size: buf.length, type: MEDIA[ext] });
      const sample = buf.subarray(0, 4096);
      const printable = sample.length === 0 || sample.filter((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 128).length / sample.length > 0.95;
      if (printable && !sample.includes(0)) return res.json({ kind: 'text', text: redact(buf.toString('utf8', 0, Math.min(buf.length, 512 * 1024))), truncated: buf.length > 512 * 1024 });
      res.json({ kind: 'binary', size: buf.length, magic: magicOf(buf), hex: hexdump(buf.subarray(0, 1024)) });
    }),
  );
  r.get(
    '/analyses/:id/drawable',
    wrap(async (req, res) => {
      const L = await load(req.params.id);
      const name = str(req.query.path, 1000);
      if (!L.files.some((f) => f[0] === name)) throw httpError(404, 'Ressource introuvable');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      res.setHeader('Cache-Control', 'private, max-age=3600');
      if (name.endsWith('.xml')) {
        const svg = await drawableToSvg(L, name);
        if (!svg) throw httpError(415, 'Drawable XML non convertible');
        return res.type('image/svg+xml').send(svg);
      }
      const buf = await L.read(name, 16 * 1024 * 1024);
      res.type(path.extname(name)).send(buf);
    }),
  );
  r.get(
    '/analyses/:id/resources',
    wrap(async (req, res) => {
      const L = await load(req.params.id);
      const type = str(req.query.type, 40);
      const t = L.resolver.app;
      if (!t) return res.json({ types: {}, items: [] });
      if (type === 'color') return res.json({ types: t.typeCounts, items: colorsOf(L.resolver) });
      const items: { id: string; name: string; config: string; value: string }[] = [];
      if (type) {
        for (const e of t.entries.values()) {
          if (e.type !== type) continue;
          for (const v of e.values) {
            let val = v.value ? formatValue(v.value, L.resolver) : `{style: ${v.bag?.items.length ?? 0} éléments}`;
            if (v.value?.type === VT.STRING && secretKind(val)) val = redact(val);
            items.push({ id: '0x' + e.id.toString(16), name: e.name, config: v.config, value: val.slice(0, 500) });
            if (items.length > 20000) break;
          }
        }
      }
      res.json({ types: t.typeCounts, items });
    }),
  );
  r.post('/analyses/:id/decompile', express.json(), wrap(async (req, res) => res.json((await startDecompile(safeId(req.params.id), req.body?.tools)).map(jobLite))));

  // ───────── code explorer ─────────
  r.get(
    '/analyses/:id/code/tree',
    wrap(async (req, res) => {
      const L = await load(req.params.id);
      const pkg = str(req.query.pkg, 300);
      const prefix = pkg ? pkg + '.' : '';
      const pkgs = new Map<string, number>();
      const classes: { name: string; simple: string; access: string; methods: number; dex: string }[] = [];
      for (const [name, e] of L.classIndex) {
        if (!name.startsWith(prefix)) continue;
        const rest = name.slice(prefix.length);
        const dot = rest.indexOf('.');
        if (dot >= 0) {
          const sub = prefix + rest.slice(0, dot);
          pkgs.set(sub, (pkgs.get(sub) ?? 0) + 1);
        } else classes.push({ name, simple: rest, access: accessString(e.cls.access), methods: e.cls.methods.length, dex: e.file });
      }
      const lib = new Map(L.analysis.libraries.map((l) => [l.id, l.name]));
      res.json({
        packages: [...pkgs].map(([name, count]) => ({ name, count, own: !!L.analysis.package && (name.startsWith(L.analysis.package) || L.analysis.package.startsWith(name)) })).sort((a, b) => Number(b.own) - Number(a.own) || a.name.localeCompare(b.name)),
        classes: classes.sort((a, b) => a.simple.localeCompare(b.simple)).slice(0, 5000),
        libraries: [...lib.values()],
      });
    }),
  );
  r.get(
    '/analyses/:id/code/class',
    wrap(async (req, res) => {
      const id = safeId(req.params.id);
      const L = await load(id);
      const name = str(req.query.name, 500);
      const e = L.classIndex.get(name);
      if (!e) throw httpError(404, 'Classe introuvable');
      const { cls, dex } = e;
      const refs = classRefs(dex, cls);
      const [java, smali] = await Promise.all([jadxSourceFor(id, name), smaliFor(id, name)]);
      res.json({
        name: cls.name,
        dex: e.file,
        access: accessString(cls.access),
        superName: cls.superName,
        interfaces: cls.interfaces,
        sourceFile: cls.sourceFile,
        fields: cls.fields.map((f) => ({ name: f.name, type: f.type, access: accessString(f.access) })),
        methods: cls.methods.map((m) => ({ name: m.name, params: m.params, ret: m.ret, access: accessString(m.access), insns: m.insnsSize })),
        refs: { types: [...refs.types].filter((t) => L.classIndex.has(t)).slice(0, 300), external: [...refs.types].filter((t) => !L.classIndex.has(t)).slice(0, 300), invokes: [...refs.invokes].slice(0, 500), strings: [...refs.strings].slice(0, 300).map(redact) },
        java: java ? { file: java.file, code: redact(java.code) } : null,
        smali: smali ? { file: smali.file, code: redact(smali.code) } : null,
        disasm: redact(dex.disassemble(cls)).slice(0, 2_000_000),
      });
    }),
  );
  r.get(
    '/analyses/:id/code/usages',
    wrap(async (req, res) => {
      const L = await load(req.params.id);
      const name = str(req.query.name, 500);
      const out: string[] = [];
      for (const k of L.classIndex.keys()) {
        if (k === name) continue;
        if (refsOf(L, k)?.types.has(name)) out.push(k);
        if (out.length >= 500) break;
      }
      res.json(out);
    }),
  );
  r.get(
    '/analyses/:id/code/search',
    wrap(async (req, res) => {
      const L = await load(req.params.id);
      const q = str(req.query.q, 200).toLowerCase();
      const kind = str(req.query.kind) || 'class';
      if (q.length < 2) return res.json([]);
      const out: { kind: string; label: string; cls: string; detail?: string }[] = [];
      const max = 300;
      if (kind === 'class') {
        for (const n of L.classIndex.keys()) if (n.toLowerCase().includes(q) && out.push({ kind, label: n, cls: n }) >= max) break;
      } else if (kind === 'method') {
        outer: for (const [n, e] of L.classIndex)
          for (const m of e.cls.methods)
            if (m.name.toLowerCase().includes(q)) {
              if (out.push({ kind, label: `${m.name}(${m.params.join(', ')})`, cls: n, detail: m.ret }) >= max) break outer;
            }
      } else if (kind === 'string') {
        for (const { dex } of L.dexes) {
          const hits = new Set<number>();
          dex.strings.forEach((s, i) => s.toLowerCase().includes(q) && hits.add(i));
          if (!hits.size) continue;
          outer2: for (const cls of dex.classes)
            for (const m of cls.methods)
              for (const ins of dex.instructions(m))
                if (ins.kind === 's' && ins.index !== undefined && hits.has(ins.index)) {
                  if (out.push({ kind, label: redact(dex.strings[ins.index]).slice(0, 300), cls: cls.name, detail: m.name }) >= max) break outer2;
                }
        }
      }
      res.json(out);
    }),
  );
  r.get(
    '/analyses/:id/code/overview',
    wrap(async (req, res) => {
      const L = await load(req.params.id);
      const byPkg = new Map<string, number>();
      for (const n of L.classIndex.keys()) {
        const p = n.split('.').slice(0, 2).join('.');
        byPkg.set(p, (byPkg.get(p) ?? 0) + 1);
      }
      res.json({ dex: L.analysis.dex, obfuscation: L.analysis.obfuscation, libraries: L.analysis.libraries, topPackages: [...byPkg].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([name, count]) => ({ name, count })), decompile: await getDecompileState(L.analysis.id) });
    }),
  );

  // ───────── UI reconstructor ─────────
  r.get(
    '/analyses/:id/ui/layouts',
    wrap(async (req, res) => {
      const L = await load(req.params.id);
      const stored = await listStoredScreens(L.analysis.id);
      res.json({ layouts: listLayouts(L).map((l) => ({ ...l, edited: stored.some((s) => s.key === l.name) })), stored: stored.map((s) => ({ key: s.key, origin: s.origin, title: s.title, baseLayout: s.baseLayout, updatedAt: s.updatedAt })) });
    }),
  );
  r.get('/analyses/:id/ui/graph', wrap(async (req, res) => res.json(screenGraph(await load(req.params.id)))));
  r.get(
    '/analyses/:id/ui/screen/:key',
    wrap(async (req, res) => {
      const L = await load(req.params.id);
      const key = req.params.key;
      if (req.query.original !== '1') {
        const s = await getStoredScreen(L.analysis.id, key);
        if (s) return res.json({ key, origin: s.origin, root: s.root, title: s.title, baseLayout: s.baseLayout });
      }
      const t = await layoutTree(L, key, str(req.query.config) || undefined);
      if (!t) throw httpError(404, 'Layout introuvable ou non décodable');
      res.json({ key, origin: 'original', root: t.root, file: t.file, config: t.config });
    }),
  );
  r.put(
    '/analyses/:id/ui/screen/:key',
    express.json({ limit: '8mb' }),
    wrap(async (req, res) => {
      const id = safeId(req.params.id);
      const body = req.body as Partial<StoredScreen>;
      if (!body?.root || typeof body.root !== 'object') throw httpError(400, 'Arbre UI manquant');
      const origin = body.origin === 'assisted' ? 'assisted' : 'edited';
      res.json(await saveStoredScreen(id, { key: req.params.key, origin, baseLayout: str(body.baseLayout, 100) || undefined, title: str(body.title, 100) || undefined, root: sanitizeTree(body.root), updatedAt: '' }));
    }),
  );
  r.delete(
    '/analyses/:id/ui/screen/:key',
    wrap(async (req, res) => {
      const key = req.params.key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      await fs.promises.rm(path.join(uiDir(safeId(req.params.id)), key + '.json'), { force: true });
      res.json({ ok: true });
    }),
  );

  // ───────── projects ─────────
  r.get(
    '/projects/defaults',
    wrap(async (req, res) => {
      const aid = str(req.query.analysisId, 64);
      const L = aid ? await load(aid) : undefined;
      const o = defaultOptions(L);
      let candidates: { key: string; origin: string; usedBy: string[] }[] = [];
      let launcherLayout: string | undefined;
      if (L) {
        const stored = await listStoredScreens(L.analysis.id);
        const g = screenGraph(L);
        launcherLayout = g.screens.find((s) => s.launcher)?.layouts[0];
        const layouts = listLayouts(L);
        candidates = [
          ...stored.map((s) => ({ key: s.key, origin: s.origin, usedBy: layouts.find((l) => l.name === s.key)?.usedBy ?? [] })),
          ...layouts.filter((l) => !stored.some((s) => s.key === l.name)).map((l) => ({ key: l.name, origin: 'original', usedBy: l.usedBy })),
        ];
        // default selection: layouts used by app screens
        const used = new Set(g.screens.flatMap((s) => s.layouts));
        o.screens = candidates.filter((c) => used.has(c.key) || c.origin !== 'original').slice(0, 20).map((c) => ({ key: c.key, launcher: c.key === launcherLayout }));
        o.features = [];
        const colors = colorsOf(L.resolver).filter((c) => !c.config);
        const pick = (re: RegExp) => colors.find((c) => re.test(c.name))?.value.toUpperCase();
        o.colors.primary = pick(/^(color_?)?primary$/i) ?? o.colors.primary;
        o.colors.primaryDark = pick(/^(color_?)?primary_?(dark|variant)$/i) ?? o.colors.primaryDark;
        o.colors.accent = pick(/^(color_?)?(accent|secondary)$/i) ?? o.colors.accent;
      }
      res.json({ options: o, candidates, features: L?.analysis.features ?? [], launcherLayout });
    }),
  );
  r.get('/projects', wrap(async (_q, res) => res.json((await listRecords<ProjectRecord>(paths.projects(), 'project.json')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))));
  r.post('/projects', express.json({ limit: '2mb' }), wrap(async (req, res) => res.status(201).json(await generateProject(normalizeOptions(req.body?.options)))));
  r.get(
    '/projects/:id',
    wrap(async (req, res) => {
      const p = await readJson<ProjectRecord>(path.join(paths.project(req.params.id), 'project.json'));
      if (!p) throw httpError(404, 'Projet introuvable');
      res.json(p);
    }),
  );
  r.put('/projects/:id', express.json({ limit: '2mb' }), wrap(async (req, res) => res.json(await generateProject(normalizeOptions(req.body?.options), safeId(req.params.id)))));
  r.delete(
    '/projects/:id',
    wrap(async (req, res) => {
      const id = safeId(req.params.id);
      cancelFor(id);
      await removeDir(paths.project(id));
      for (const b of await listRecords<BuildRecord>(paths.builds(), 'build.json')) if (b.projectId === id) await removeDir(paths.build(b.id));
      res.json({ ok: true });
    }),
  );
  r.get(
    '/projects/:id/files',
    wrap(async (req, res) => {
      const root = path.join(paths.project(req.params.id), 'src');
      const out: { path: string; size: number }[] = [];
      const walk = async (d: string) => {
        for (const e of await fs.promises.readdir(d, { withFileTypes: true }).catch(() => [] as fs.Dirent[])) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) await walk(p);
          else out.push({ path: path.relative(root, p), size: (await fs.promises.stat(p)).size });
          if (out.length > 20000) return;
        }
      };
      await walk(root);
      res.json(out.sort((a, b) => a.path.localeCompare(b.path)));
    }),
  );
  r.get(
    '/projects/:id/file',
    wrap(async (req, res) => {
      const f = projectPath(req.params.id, str(req.query.path, 1000));
      const st = await fs.promises.stat(f).catch(() => null);
      if (!st?.isFile()) throw httpError(404, 'Fichier introuvable');
      if (req.query.raw === '1') {
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return /\.(png|webp|jpe?g|gif)$/i.test(f) ? res.type(path.extname(f)).send(await fs.promises.readFile(f)) : res.download(f);
      }
      if (st.size > 2 * 1024 * 1024) return res.json({ binary: true, size: st.size });
      const buf = await fs.promises.readFile(f);
      if (buf.includes(0)) return res.json({ binary: true, size: st.size });
      res.json({ binary: false, size: st.size, text: buf.toString('utf8') });
    }),
  );
  r.put(
    '/projects/:id/file',
    express.text({ limit: '4mb', type: '*/*' }),
    wrap(async (req, res) => {
      const f = projectPath(req.params.id, str(req.query.path, 1000));
      if (typeof req.body !== 'string') throw httpError(400, 'Contenu texte attendu');
      await fs.promises.mkdir(path.dirname(f), { recursive: true });
      await fs.promises.writeFile(f, req.body);
      res.json({ ok: true });
    }),
  );
  r.delete(
    '/projects/:id/file',
    wrap(async (req, res) => {
      await fs.promises.rm(projectPath(req.params.id, str(req.query.path, 1000)), { force: true });
      res.json({ ok: true });
    }),
  );
  const resUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
  r.post(
    '/projects/:id/upload',
    resUpload.single('file'),
    wrap(async (req, res) => {
      const rel = str(req.query.path, 1000);
      if (!/^app\/src\/main\/(res|assets)\//.test(rel)) throw httpError(400, 'Seuls res/ et assets/ acceptent des fichiers binaires');
      if (!req.file) throw httpError(400, 'Fichier manquant');
      const f = projectPath(req.params.id, rel);
      await fs.promises.mkdir(path.dirname(f), { recursive: true });
      await fs.promises.writeFile(f, req.file.buffer);
      res.json({ ok: true, path: rel });
    }),
  );
  r.post(
    '/projects/:id/icon',
    resUpload.single('file'),
    wrap(async (req, res) => {
      const id = safeId(req.params.id);
      const b = req.file?.buffer;
      if (!b || b.readUInt32BE(0) !== 0x89504e47) throw httpError(400, 'Icône PNG attendue');
      const p = await readJson<ProjectRecord>(path.join(paths.project(id), 'project.json'));
      if (!p) throw httpError(404, 'Projet introuvable');
      await fs.promises.writeFile(path.join(paths.project(id), 'icon.png'), b);
      res.json(await generateProject(p.options, id));
    }),
  );
  r.get(
    '/projects/:id/download',
    wrap(async (req, res) => {
      const id = safeId(req.params.id);
      const p = await readJson<ProjectRecord>(path.join(paths.project(id), 'project.json'));
      if (!p) throw httpError(404, 'Projet introuvable');
      const root = path.join(paths.project(id), 'src');
      const zip = new yazl.ZipFile();
      const base = (p.name.replace(/[^\w-]+/g, '_') || 'project').slice(0, 40);
      const walk = async (d: string) => {
        for (const e of await fs.promises.readdir(d, { withFileTypes: true })) {
          const f = path.join(d, e.name);
          if (e.isDirectory()) await walk(f);
          else zip.addFile(f, `${base}/${path.relative(root, f).split(path.sep).join('/')}`);
        }
      };
      await walk(root);
      zip.end();
      res.setHeader('Content-Disposition', `attachment; filename="${base}.zip"`);
      res.type('application/zip');
      zip.outputStream.pipe(res);
    }),
  );

  // ───────── builds ─────────
  r.get(
    '/builds',
    wrap(async (req, res) => {
      const pid = str(req.query.projectId, 64);
      res.json((await listRecords<BuildRecord>(paths.builds(), 'build.json')).filter((b) => !pid || b.projectId === pid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    }),
  );
  r.post(
    '/builds',
    express.json(),
    wrap(async (req, res) => {
      const mode = req.body?.mode === 'gradle' ? 'gradle' : 'lite';
      res.status(201).json(await startBuild(safeId(str(req.body?.projectId, 64)), mode));
    }),
  );
  r.get(
    '/builds/:id',
    wrap(async (req, res) => {
      const b = await getBuild(safeId(req.params.id));
      if (!b) throw httpError(404, 'Compilation introuvable');
      const job = b.jobId ? getJob(b.jobId) : undefined;
      let logText = job?.log;
      if (!logText) logText = (await fs.promises.readFile(path.join(paths.build(b.id), 'build.log'), 'utf8').catch(() => '')).split('\n');
      res.json({ ...b, log: logText });
    }),
  );
  r.get(
    '/builds/:id/apk',
    wrap(async (req, res) => {
      const b = await getBuild(safeId(req.params.id));
      if (!b?.apk) throw httpError(404, 'APK indisponible');
      const p = await readJson<ProjectRecord>(path.join(paths.project(b.projectId), 'project.json'));
      res.download(path.join(paths.build(b.id), b.apk.file), `${(p?.name ?? 'app').replace(/[^\w-]+/g, '_')}-debug.apk`);
    }),
  );
  r.delete(
    '/builds/:id',
    wrap(async (req, res) => {
      await removeDir(paths.build(safeId(req.params.id)));
      res.json({ ok: true });
    }),
  );

  // ───────── jobs ─────────
  r.get('/jobs', (req, res) => {
    const t = str(req.query.target, 64);
    res.json(listJobs((j) => !t || j.target === t).slice(0, 50).map(jobLite));
  });
  r.get('/jobs/:id', (req, res) => {
    const j = getJob(req.params.id);
    if (!j) return res.status(404).json({ error: 'Tâche introuvable' });
    res.json(j);
  });
  r.post('/jobs/:id/cancel', (req, res) => res.json({ ok: cancelJob(req.params.id) }));

  r.use((err: Error & { status?: number; code?: string }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : err.code === 'ENOENT' ? 404 : err.status ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status === 404 && err.code === 'ENOENT' ? 'Introuvable' : err.message });
  });
  return r;
}

function summary(a: Analysis) {
  return { id: a.id, createdAt: a.createdAt, status: a.status, error: a.error, file: a.file, package: a.package, appLabel: a.appLabel, versionName: a.versionName, icon: a.icon, files: a.files?.total, classes: a.dex?.classes, libraries: a.libraries?.length, container: a.container?.kind };
}
function jobLite(j: ReturnType<typeof listJobs>[number]) {
  return { id: j.id, type: j.type, target: j.target, label: j.label, status: j.status, createdAt: j.createdAt, startedAt: j.startedAt, endedAt: j.endedAt, error: j.error, tail: j.log.slice(-3) };
}

function projectPath(id: string, rel: string) {
  const root = path.resolve(paths.project(id), 'src');
  const f = path.resolve(root, rel);
  if (!rel || !f.startsWith(root + path.sep)) throw httpError(400, 'Chemin invalide');
  return f;
}

function normalizeOptions(o: Partial<ProjectOptions> | undefined): ProjectOptions {
  if (!o || typeof o !== 'object') throw httpError(400, 'Options manquantes');
  const d = defaultOptions();
  return {
    analysisId: o.analysisId ? safeId(String(o.analysisId)) : undefined,
    appName: str(o.appName, 60).trim(),
    packageName: str(o.packageName, 150).trim(),
    versionName: str(o.versionName, 40).trim() || '1.0',
    versionCode: Number(o.versionCode) || 1,
    minSdk: Number(o.minSdk) || 21,
    colors: { ...d.colors, ...(o.colors ?? {}) },
    screens: Array.isArray(o.screens) ? o.screens.slice(0, 100).map((s) => ({ key: str(s.key, 100), title: str(s.title, 100) || undefined, launcher: !!s.launcher })).filter((s) => s.key) : [],
    features: Array.isArray(o.features) ? o.features.filter((f) => ['login', 'webview', 'settings', 'list', 'network'].includes(f?.id)).map((f) => ({ id: f.id, url: str(f.url, 500) || undefined })) : [],
    strings: o.strings && typeof o.strings === 'object' ? Object.fromEntries(Object.entries(o.strings).slice(0, 5000).map(([k, v]) => [k.slice(0, 100), String(v).slice(0, 4000)])) : {},
    copyOriginalIcon: o.copyOriginalIcon !== false,
    copyAssets: !!o.copyAssets,
    includeReference: !!o.includeReference,
  };
}

/** Keep only known fields of an edited UI tree (client data is untrusted). */
function sanitizeTree(n: unknown, depth = 0): StoredScreen['root'] {
  const x = (n ?? {}) as Record<string, unknown>;
  if (depth > 60) throw httpError(400, 'Arbre trop profond');
  const props = (x.props ?? {}) as Record<string, unknown>;
  const allowed = ['width', 'height', 'weight', 'orientation', 'gravity', 'layoutGravity', 'padding', 'margin', 'text', 'hint', 'textColor', 'textSize', 'textStyle', 'background', 'src', 'visibility', 'scaleType', 'inputType', 'rules', 'checked', 'onClick'];
  const cleanProps = Object.fromEntries(Object.entries(props).filter(([k]) => allowed.includes(k)));
  const kids = Array.isArray(x.children) ? x.children.slice(0, 500) : [];
  return {
    uid: str(x.uid, 40) || 'n',
    tag: str(x.tag, 200) || 'View',
    kind: str(x.kind, 30) || 'view',
    viewId: str(x.viewId, 100) || undefined,
    props: JSON.parse(JSON.stringify(cleanProps).slice(0, 200000)),
    raw: typeof x.raw === 'object' && x.raw ? (x.raw as Record<string, string>) : {},
    children: kids.map((c) => sanitizeTree(c, depth + 1)),
    note: str(x.note, 300) || undefined,
  };
}

function magicOf(b: Buffer): string {
  if (b.subarray(0, 4).toString('latin1') === '\x7fELF') return 'ELF (bibliothèque native)';
  if (b.readUInt32BE(0) === 0x504b0304) return 'ZIP';
  if (b.subarray(0, 4).toString('latin1') === 'dex\n') return 'DEX';
  if (b.readUInt16LE(0) === 0x0002) return 'Table de ressources Android';
  return 'inconnu';
}

function hexdump(b: Buffer): string {
  const lines: string[] = [];
  for (let i = 0; i < b.length; i += 16) {
    const s = b.subarray(i, i + 16);
    lines.push(`${i.toString(16).padStart(8, '0')}  ${[...s].map((x) => x.toString(16).padStart(2, '0')).join(' ').padEnd(48)}  ${[...s].map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('')}`);
  }
  return lines.join('\n');
}
