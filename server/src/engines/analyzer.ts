/** Server-side APK import + analysis (storage, hashing, caching). Analysis logic lives in analysis-core.ts. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { paths } from '../config.js';
import { writeJson, readJson } from '../store.js';
import { inspectZip, readEntries, readEntry, ZipSafetyError } from './zip.js';
import { loadFramework } from './framework.js';
import { inspectSignatures } from './signature-node.js';
import { Analysis, analyzeCore, newAnalysis, NEEDED_ENTRY, Loaded, buildLoaded } from './analysis-core.js';

export * from './analysis-core.js';

async function hashFile(file: string) {
  const algos = ['sha256', 'sha1', 'md5'] as const;
  const hs = algos.map((a) => crypto.createHash(a));
  for await (const chunk of fs.createReadStream(file)) for (const h of hs) h.update(chunk as Buffer);
  return Object.fromEntries(algos.map((a, i) => [a, hs[i].digest('hex')])) as Record<(typeof algos)[number], string>;
}

/** Store an uploaded file as a new analysis. Handles split bundles (.apks/.xapk/.apkm) by keeping the base APK. */
export async function createAnalysis(uploadPath: string, originalName: string): Promise<Analysis> {
  const id = crypto.randomBytes(9).toString('base64url');
  const dir = paths.analysis(id);
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
  const stat = await fs.promises.stat(uploadPath);
  const hashes = await hashFile(uploadPath);
  const inv = await inspectZip(uploadPath); // throws ZipSafetyError on bombs/corruption
  const names = new Set(inv.entries.map((e) => e.name));
  const container: Analysis['container'] = { kind: 'apk' };
  const apkPath = path.join(dir, 'original.apk');
  if (!names.has('AndroidManifest.xml')) {
    const inner = inv.entries.filter((e) => e.name.endsWith('.apk') && !e.unsafeName);
    if (!inner.length) throw new ZipSafetyError("Ce fichier n'est ni un APK ni un bundle d'APK (AndroidManifest.xml absent)");
    const base =
      inner.find((e) => /(^|\/)base\.apk$/.test(e.name)) ??
      inner.find((e) => !/split_|config\./.test(path.basename(e.name))) ??
      [...inner].sort((a, b) => b.size - a.size)[0];
    const buf = await readEntry(uploadPath, base.name);
    if (!buf) throw new ZipSafetyError('APK de base introuvable dans le bundle');
    await fs.promises.writeFile(apkPath, buf, { mode: 0o600 });
    container.kind = 'bundle';
    container.format = path.extname(originalName).slice(1).toLowerCase() || 'zip';
    container.splits = inner.map((e) => ({ name: e.name, size: e.size }));
    container.note = `Bundle de ${inner.length} APK. Seul l'APK de base (${base.name}) est analysé ; les splits (ABI, densité, langue, modules dynamiques) sont listés mais non fusionnés.`;
    await fs.promises.copyFile(uploadPath, path.join(dir, 'bundle.' + container.format));
    await fs.promises.unlink(uploadPath).catch(() => {});
  } else {
    await fs.promises.rename(uploadPath, apkPath).catch(async () => {
      await fs.promises.copyFile(uploadPath, apkPath);
      await fs.promises.unlink(uploadPath);
    });
  }
  const a = newAnalysis(id, { name: originalName.replace(/[^\w.\- ()]/g, '_').slice(0, 120), size: stat.size, ...hashes }, container, inv.warnings);
  await writeJson(path.join(dir, 'analysis.json'), a);
  return a;
}
export async function runAnalysis(id: string): Promise<Analysis> {
  const dir = paths.analysis(id);
  const a = (await readJson<Analysis>(path.join(dir, 'analysis.json')))!;
  try {
    await analyzeInto(a, path.join(dir, 'original.apk'), dir);
    a.status = 'ready';
  } catch (e) {
    a.status = 'error';
    a.error = (e as Error).message;
  }
  await writeJson(path.join(dir, 'analysis.json'), a);
  invalidate(id);
  return a;
}
async function analyzeInto(a: Analysis, apk: string, dir: string) {
  const inv = await inspectZip(apk);
  await writeJson(path.join(dir, 'files.json'), inv.entries.map((e) => [e.name, e.size, e.compressedSize, e.method]));
  const blobs = await readEntries(apk, NEEDED_ENTRY);
  const v1 = new Map([...blobs].filter(([n]) => n.startsWith('META-INF/')));
  const signature = await inspectSignatures(apk, v1);
  const xml = analyzeCore(a, inv, blobs, await loadFramework(), signature);
  await fs.promises.writeFile(path.join(dir, 'AndroidManifest.xml'), xml);
}

const cache = new Map<string, Promise<Loaded>>();

export function invalidate(id: string) {
  cache.delete(id);
}

export function load(id: string): Promise<Loaded> {
  let p = cache.get(id);
  if (!p) {
    p = doLoad(id);
    cache.set(id, p);
    p.catch(() => cache.delete(id));
    while (cache.size > 3) cache.delete(cache.keys().next().value!);
  }
  return p;
}
async function doLoad(id: string): Promise<Loaded> {
  const dir = paths.analysis(id);
  const analysis = await readJson<Analysis>(path.join(dir, 'analysis.json'));
  if (!analysis) throw Object.assign(new Error('Analyse introuvable'), { status: 404 });
  if (analysis.status !== 'ready') throw Object.assign(new Error(`Analyse non prête (${analysis.status})`), { status: 409 });
  const apk = path.join(dir, 'original.apk');
  const blobs = await readEntries(apk, (n) => n === 'resources.arsc' || /^classes\d*\.dex$/.test(n));
  const files = (await readJson<Loaded['files']>(path.join(dir, 'files.json'))) ?? [];
  return buildLoaded(analysis, files, blobs, await loadFramework(), {
    read: (name, max) => readEntry(apk, name, max),
    readMany: (pred, maxEach) => readEntries(apk, pred, maxEach),
  });
}
