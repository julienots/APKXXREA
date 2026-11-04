/** In-memory ZIP reader for the on-device engine (same safety limits as the server). */
import { inflateSync } from 'fflate';
import type { Inventory, InvEntry } from '../../../server/src/engines/analysis-core';

export const LIMITS = { maxEntries: 100_000, maxTotal: 4 * 1024 ** 3, maxEntry: 1024 ** 3, ratio: 250, maxInMemory: 256 * 1024 * 1024 };

export class ZipError extends Error {}

interface CdEntry extends InvEntry { offset: number; flags: number }

export const isUnsafeName = (name: string) =>
  !name || name.includes('\0') || name.startsWith('/') || name.startsWith('\\') || /^[a-zA-Z]:/.test(name) || name.split(/[\\/]/).some((p) => p === '..');

export class MemZip {
  readonly entries: CdEntry[] = [];
  readonly inv: Inventory;
  private byName = new Map<string, CdEntry>();
  constructor(readonly buf: Uint8Array) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new ZipError('Archive ZIP invalide (fin de répertoire introuvable)');
    const count = dv.getUint16(eocd + 10, true);
    const cdOff = dv.getUint32(eocd + 16, true);
    if (count > LIMITS.maxEntries) throw new ZipError(`Trop d'entrées (${count})`);
    const warnings: string[] = [];
    let total = 0;
    let p = cdOff;
    const utf8 = new TextDecoder('utf-8');
    const latin1 = new TextDecoder('latin1');
    for (let i = 0; i < count; i++) {
      if (p + 46 > buf.length || dv.getUint32(p, true) !== 0x02014b50) throw new ZipError('Répertoire central corrompu');
      const flags = dv.getUint16(p + 8, true);
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const size = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const offset = dv.getUint32(p + 42, true);
      const name = (flags & 0x800 ? utf8 : latin1).decode(buf.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      const unsafe = isUnsafeName(name);
      if (unsafe) warnings.push(`Nom d'entrée dangereux ignoré: ${JSON.stringify(name).slice(0, 120)}`);
      if (this.byName.has(name)) warnings.push(`Entrée dupliquée: ${name} (technique d'anti-analyse possible)`);
      if (size > LIMITS.maxEntry) throw new ZipError(`Entrée trop volumineuse: ${name}`);
      if (csize > 0 && size / csize > LIMITS.ratio && size > 10 * 1024 * 1024) throw new ZipError(`Ratio de compression suspect pour ${name} (bombe de décompression probable)`);
      total += size;
      if (total > LIMITS.maxTotal) throw new ZipError('Taille décompressée totale excessive');
      const e: CdEntry = { name, size, compressedSize: csize, method, encrypted: (flags & 1) !== 0, unsafeName: unsafe, offset, flags };
      this.entries.push(e);
      if (!this.byName.has(name)) this.byName.set(name, e);
    }
    this.inv = { entries: this.entries, totalUncompressed: total, warnings };
  }

  has(name: string) {
    return this.byName.has(name);
  }

  read(name: string, max = LIMITS.maxInMemory): Buffer | null {
    const e = this.byName.get(name);
    if (!e || e.unsafeName) return null;
    if (e.size > max) throw new ZipError(`Entrée ${name} trop volumineuse pour être chargée`);
    const dv = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
    const lh = e.offset;
    if (dv.getUint32(lh, true) !== 0x04034b50) throw new ZipError(`En-tête local invalide: ${name}`);
    const start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true);
    const data = this.buf.subarray(start, start + e.compressedSize);
    let out: Uint8Array;
    if (e.method === 0) out = data.slice(0, e.size);
    else if (e.method === 8) {
      out = inflateSync(data, { out: new Uint8Array(e.size) });
      if (out.length !== e.size) out = out.subarray(0, e.size);
    } else throw new ZipError(`Méthode de compression ${e.method} non supportée (${name})`);
    return Buffer.from(out.buffer, out.byteOffset, out.byteLength);
  }

  readMany(pred: (n: string) => boolean, max?: number): Map<string, Buffer> {
    const m = new Map<string, Buffer>();
    for (const e of this.byName.values()) {
      if (!pred(e.name) || e.unsafeName) continue;
      const b = this.read(e.name, max);
      if (b) m.set(e.name, b);
    }
    return m;
  }
}
