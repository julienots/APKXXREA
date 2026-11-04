/** On-device analysis engine: runs the same analysis core as the server, entirely in the app. */
import { Buffer } from 'buffer';
import { analyzeCore, newAnalysis, NEEDED_ENTRY, buildLoaded, type Analysis, type Loaded } from '../../../server/src/engines/analysis-core';
import { inspectSignaturesWith } from '../../../server/src/engines/signature';
import { VT, type ResTable, type ResEntry } from '../../../server/src/engines/res';
import { MemZip, ZipError } from './zip';
import { certInfo } from './der';
import * as db from './db';

(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;

let fw: Promise<ResTable | undefined> | null = null;
/** Android framework resources (android:*) extracted at build time into /framework.json. */
export function framework(): Promise<ResTable | undefined> {
  if (!fw) {
    fw = fetch('/framework.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { types: string[]; rows: [number, number, string, unknown?][] } | null) => {
        if (!j) return undefined;
        const t: ResTable = { packages: [{ id: 1, name: 'android' }], entries: new Map(), byName: new Map(), typeCounts: {} };
        for (const [id, ti, name, extra] of j.rows) {
          const type = j.types[ti];
          const e: ResEntry = { id, pkg: 'android', type, name, values: [] };
          if (type === 'attr' && Array.isArray(extra)) e.values.push({ config: '', bag: { parent: 0, items: (extra as [number, number][]).map(([n, d]) => ({ name: n, value: { type: VT.INT_DEC, data: d } })) } });
          else if (Array.isArray(extra)) e.values.push({ config: '', value: { type: (extra as number[])[0], data: (extra as number[])[1] } });
          t.entries.set(id, e);
        }
        return t;
      })
      .catch(() => undefined);
  }
  return fw;
}

export const newId = () => {
  const b = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function digest(algo: string, data: Uint8Array) {
  const d = new Uint8Array(await crypto.subtle.digest(algo, data.slice().buffer));
  return [...d].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Import + analyse an APK (or .apks/.xapk/.apkm bundle) stored on the device. */
export async function importApk(file: Blob, originalName: string): Promise<Analysis> {
  const raw = new Uint8Array(await file.arrayBuffer());
  const outer = new MemZip(raw);
  const container: Analysis['container'] = { kind: 'apk' };
  let apk = raw;
  if (!outer.has('AndroidManifest.xml')) {
    const inner = outer.entries.filter((e) => e.name.endsWith('.apk') && !e.unsafeName);
    if (!inner.length) throw new ZipError("Ce fichier n'est ni un APK ni un bundle d'APK (AndroidManifest.xml absent)");
    const base = inner.find((e) => /(^|\/)base\.apk$/.test(e.name)) ?? inner.find((e) => !/split_|config\./.test(e.name.split('/').pop()!)) ?? [...inner].sort((a, b) => b.size - a.size)[0];
    apk = new Uint8Array(outer.read(base.name)!);
    container.kind = 'bundle';
    container.format = originalName.split('.').pop()?.toLowerCase() ?? 'zip';
    container.splits = inner.map((e) => ({ name: e.name, size: e.size }));
    container.note = `Bundle de ${inner.length} APK. Seul l'APK de base (${base.name}) est analysé ; les splits sont listés mais non fusionnés.`;
  }
  const zip = container.kind === 'bundle' ? new MemZip(apk) : outer;
  const id = newId();
  const a = newAnalysis(id, { name: originalName.replace(/[^\w.\- ()]/g, '_').slice(0, 120), size: raw.length, sha256: await digest('SHA-256', raw), sha1: await digest('SHA-1', raw), md5: '' }, container, outer.inv.warnings);
  let manifest = '';
  try {
    const blobs = zip.readMany(NEEDED_ENTRY);
    const v1 = new Map([...blobs].filter(([n]) => n.startsWith('META-INF/')));
    const buf = Buffer.from(apk.buffer, apk.byteOffset, apk.byteLength);
    const signature = await inspectSignaturesWith(async (pos, len) => buf.subarray(pos, pos + len), buf.length, v1, (der) => certInfo(der));
    manifest = analyzeCore(a, zip.inv, blobs, await framework(), signature);
    a.status = 'ready';
  } catch (e) {
    a.status = 'error';
    a.error = (e as Error).message;
  }
  await db.put('blobs', `apk:${id}`, new Blob([apk], { type: 'application/vnd.android.package-archive' }));
  await db.put('blobs', `files:${id}`, zip.entries.map((e) => [e.name, e.size, e.compressedSize, e.method]));
  await db.put('blobs', `manifest:${id}`, manifest);
  await db.put('analyses', id, a);
  return a;
}

const cache = new Map<string, Promise<Loaded>>();
export function invalidate(id: string) {
  cache.delete(id);
}
export function load(id: string): Promise<Loaded> {
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      const analysis = await db.get<Analysis>('analyses', id);
      if (!analysis) throw Object.assign(new Error('Analyse introuvable'), { status: 404 });
      if (analysis.status !== 'ready') throw Object.assign(new Error(`Analyse non prête (${analysis.status})`), { status: 409 });
      const blob = await db.get<Blob>('blobs', `apk:${id}`);
      if (!blob) throw Object.assign(new Error('APK introuvable sur l’appareil'), { status: 404 });
      const zip = new MemZip(new Uint8Array(await blob.arrayBuffer()));
      const files = (await db.get<Loaded['files']>('blobs', `files:${id}`)) ?? [];
      const blobs = zip.readMany((n) => n === 'resources.arsc' || /^classes\d*\.dex$/.test(n));
      return buildLoaded(analysis, files, blobs, await framework(), {
        read: async (n, max) => zip.read(n, max),
        readMany: async (pred, max) => zip.readMany(pred, max),
      });
    })();
    cache.set(id, p);
    p.catch(() => cache.delete(id));
    while (cache.size > 2) cache.delete(cache.keys().next().value!);
  }
  return p;
}
