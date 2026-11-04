/**
 * Safe ZIP access for untrusted APK archives.
 * - never trusts entry names (path traversal / absolute / NUL)
 * - enforces entry count, per-entry and total uncompressed size, and compression ratio limits
 * - yauzl validates real decompressed sizes against the headers while streaming
 */
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import yauzl from 'yauzl';
import { config } from '../config.js';

export interface ZipEntryInfo {
  name: string;
  size: number;
  compressedSize: number;
  method: number; // 0 stored, 8 deflate
  crc32: number;
  encrypted: boolean;
  unsafeName: boolean;
}

export interface ZipInventory {
  entries: ZipEntryInfo[];
  totalUncompressed: number;
  warnings: string[];
  comment: string;
}

export class ZipSafetyError extends Error {
  status = 422;
}

function decodeName(buf: Buffer, utf8: boolean): string {
  return utf8 ? buf.toString('utf8') : buf.toString('latin1');
}

export function isUnsafeName(name: string): boolean {
  if (!name || name.includes('\0')) return true;
  if (name.startsWith('/') || name.startsWith('\\') || /^[a-zA-Z]:/.test(name)) return true;
  return name.split(/[\\/]/).some((p) => p === '..');
}

function open(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, decodeStrings: false, validateEntrySizes: true, autoClose: false }, (err, zf) =>
      err || !zf ? reject(new ZipSafetyError(`Archive ZIP invalide: ${err?.message ?? 'unknown'}`)) : resolve(zf),
    ),
  );
}

/** Walk the central directory and validate it against zip-bomb limits. */
export async function inspectZip(file: string): Promise<ZipInventory> {
  const L = config.limits;
  const zf = await open(file);
  const entries: ZipEntryInfo[] = [];
  const warnings: string[] = [];
  let total = 0;
  const seen = new Set<string>();
  try {
    if (zf.entryCount > L.maxEntries) throw new ZipSafetyError(`Trop d'entrées (${zf.entryCount} > ${L.maxEntries})`);
    await new Promise<void>((resolve, reject) => {
      zf.on('entry', (e: yauzl.Entry) => {
        const utf8 = (e.generalPurposeBitFlag & 0x800) !== 0;
        const name = decodeName(e.fileName as unknown as Buffer, utf8);
        const unsafe = isUnsafeName(name);
        if (unsafe) warnings.push(`Nom d'entrée dangereux ignoré: ${JSON.stringify(name).slice(0, 120)}`);
        if (seen.has(name)) warnings.push(`Entrée dupliquée: ${name} (technique d'anti-analyse possible)`);
        seen.add(name);
        if (e.uncompressedSize > L.maxEntryUncompressed) {
          return reject(new ZipSafetyError(`Entrée trop volumineuse: ${name} (${e.uncompressedSize} octets)`));
        }
        if (e.compressedSize > 0 && e.uncompressedSize / e.compressedSize > L.maxCompressionRatio && e.uncompressedSize > 10 * 1024 * 1024) {
          return reject(new ZipSafetyError(`Ratio de compression suspect pour ${name} (bombe de décompression probable)`));
        }
        total += e.uncompressedSize;
        if (total > L.maxTotalUncompressed) return reject(new ZipSafetyError('Taille décompressée totale excessive'));
        entries.push({
          name,
          size: e.uncompressedSize,
          compressedSize: e.compressedSize,
          method: e.compressionMethod,
          crc32: e.crc32,
          encrypted: (e.generalPurposeBitFlag & 1) !== 0,
          unsafeName: unsafe,
        });
        zf.readEntry();
      });
      zf.on('end', () => resolve());
      zf.on('error', (err: Error) => reject(new ZipSafetyError(`Archive corrompue: ${err.message}`)));
      zf.readEntry();
    });
    const comment = decodeName(zf.comment as unknown as Buffer, true);
    return { entries, totalUncompressed: total, warnings, comment };
  } finally {
    zf.close();
  }
}

type EntryVisitor = (e: yauzl.Entry, name: string) => 'read' | 'skip' | 'stop';

async function walk(file: string, visit: EntryVisitor, onStream: (name: string, s: NodeJS.ReadableStream, e: yauzl.Entry) => Promise<void>) {
  const zf = await open(file);
  try {
    await new Promise<void>((resolve, reject) => {
      zf.on('entry', (e: yauzl.Entry) => {
        const utf8 = (e.generalPurposeBitFlag & 0x800) !== 0;
        const name = decodeName(e.fileName as unknown as Buffer, utf8);
        let action: ReturnType<EntryVisitor>;
        try {
          action = isUnsafeName(name) || /\/$/.test(name) ? 'skip' : visit(e, name);
        } catch (err) {
          return reject(err);
        }
        if (action === 'stop') return resolve();
        if (action === 'skip') return zf.readEntry();
        // Android ignores the "encrypted" flag (an anti-analysis trick): clear it so we can read the data.
        if (e.generalPurposeBitFlag & 1) (e as unknown as { generalPurposeBitFlag: number }).generalPurposeBitFlag &= ~1;
        zf.openReadStream(e, (err, s) => {
          if (err || !s) return reject(err ?? new Error('stream error'));
          onStream(name, s, e).then(() => zf.readEntry(), reject);
        });
      });
      zf.on('end', () => resolve());
      zf.on('error', reject);
      zf.readEntry();
    });
  } finally {
    zf.close();
  }
}

function limiter(max: number, name: string) {
  let n = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      n += chunk.length;
      if (n > max) return cb(new ZipSafetyError(`Limite de taille dépassée pendant la lecture de ${name}`));
      cb(null, chunk);
    },
  });
}

async function collect(s: NodeJS.ReadableStream, max: number, name: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of s as AsyncIterable<Buffer>) {
    n += c.length;
    if (n > max) throw new ZipSafetyError(`Entrée ${name} trop volumineuse pour être chargée en mémoire`);
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

/** Read several entries into memory (first occurrence wins, like Android's PackageParser). */
export async function readEntries(file: string, wanted: (name: string) => boolean, maxEach = config.limits.maxInMemoryEntry): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  await walk(
    file,
    (_e, name) => (wanted(name) && !out.has(name) ? 'read' : 'skip'),
    async (name, s) => {
      out.set(name, await collect(s, maxEach, name));
    },
  );
  return out;
}

export async function readEntry(file: string, name: string, max = config.limits.maxInMemoryEntry): Promise<Buffer | null> {
  let found: Buffer | null = null;
  await walk(
    file,
    (_e, n) => (found ? 'stop' : n === name ? 'read' : 'skip'),
    async (_n, s) => {
      found = await collect(s, max, name);
    },
  );
  return found;
}

/** Extract entries matching `filter` under `dest`, guarding against traversal and size abuse. */
export async function extractTo(file: string, dest: string, filter: (name: string) => boolean = () => true): Promise<number> {
  const root = path.resolve(dest);
  await fs.promises.mkdir(root, { recursive: true });
  let count = 0;
  let total = 0;
  const done = new Set<string>();
  await walk(
    file,
    (e, name) => {
      if (!filter(name) || done.has(name)) return 'skip';
      total += e.uncompressedSize;
      if (total > config.limits.maxTotalUncompressed) throw new ZipSafetyError('Taille extraite totale excessive');
      return 'read';
    },
    async (name, s) => {
      const target = path.resolve(root, name);
      if (!target.startsWith(root + path.sep)) return; // defence in depth
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await pipeline(s, limiter(config.limits.maxEntryUncompressed, name), fs.createWriteStream(target, { flags: 'wx', mode: 0o600 }));
      done.add(name);
      count++;
    },
  );
  return count;
}
