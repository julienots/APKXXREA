/**
 * Native decoders for Android's binary resource formats:
 *  - resources.arsc (ResTable)
 *  - binary XML (AndroidManifest.xml, res/layout/*.xml, ...)
 * Written from the AOSP format definitions (frameworks/base/libs/androidfw/include/androidfw/ResourceTypes.h).
 */

const T = {
  STRING_POOL: 0x0001,
  TABLE: 0x0002,
  XML: 0x0003,
  XML_START_NS: 0x0100,
  XML_END_NS: 0x0101,
  XML_START_EL: 0x0102,
  XML_END_EL: 0x0103,
  XML_CDATA: 0x0104,
  XML_RES_MAP: 0x0180,
  PACKAGE: 0x0200,
  TYPE: 0x0201,
  TYPE_SPEC: 0x0202,
  LIBRARY: 0x0203,
} as const;

export const VT = {
  NULL: 0, REFERENCE: 1, ATTRIBUTE: 2, STRING: 3, FLOAT: 4, DIMENSION: 5, FRACTION: 6,
  DYN_REFERENCE: 7, DYN_ATTRIBUTE: 8, INT_DEC: 0x10, INT_HEX: 0x11, INT_BOOLEAN: 0x12,
  ARGB8: 0x1c, RGB8: 0x1d, ARGB4: 0x1e, RGB4: 0x1f,
} as const;

export class ResFormatError extends Error {}

function u16(b: Buffer, o: number) {
  if (o + 2 > b.length) throw new ResFormatError('read past end');
  return b.readUInt16LE(o);
}
function u32(b: Buffer, o: number) {
  if (o + 4 > b.length) throw new ResFormatError('read past end');
  return b.readUInt32LE(o);
}

// ───────────────────────── String pool ─────────────────────────
export function parseStringPool(b: Buffer, start: number): string[] {
  const headerSize = u16(b, start + 2);
  const size = u32(b, start + 4);
  const count = u32(b, start + 8);
  const flags = u32(b, start + 16);
  const stringsStart = u32(b, start + 20);
  const utf8 = (flags & 0x100) !== 0;
  const end = Math.min(b.length, start + size);
  const out: string[] = new Array(count);
  const max = Math.min(count, 2_000_000);
  for (let i = 0; i < max; i++) {
    try {
      let p = start + stringsStart + u32(b, start + headerSize + i * 4);
      if (utf8) {
        let n = b[p++];
        if (n & 0x80) p++; // utf16 length (skip)
        n = b[p++];
        if (n & 0x80) n = ((n & 0x7f) << 8) | b[p++];
        out[i] = b.toString('utf8', p, Math.min(p + n, end));
      } else {
        let n = u16(b, p);
        p += 2;
        if (n & 0x8000) {
          n = ((n & 0x7fff) << 16) | u16(b, p);
          p += 2;
        }
        out[i] = b.toString('utf16le', p, Math.min(p + n * 2, end));
      }
    } catch {
      out[i] = '';
    }
  }
  return out;
}

// ───────────────────────── Values ─────────────────────────
export interface ResValue {
  type: number;
  data: number;
  str?: string;
}

const RADIX = [1 / 256, 1 / 32768, 1 / 8388608, 1 / 2147483648];
const DIM_UNITS = ['px', 'dp', 'sp', 'pt', 'in', 'mm'];

export function complexToFloat(data: number): number {
  return (data & 0xffffff00) * RADIX[(data >> 4) & 3];
}

export function colorHex(v: ResValue): string {
  const d = v.data >>> 0;
  return '#' + d.toString(16).padStart(8, '0');
}

export function isColor(v: ResValue) {
  return v.type >= VT.ARGB8 && v.type <= VT.RGB4;
}

// ───────────────────────── Configs ─────────────────────────
const DENS: Record<number, string> = { 120: 'ldpi', 160: 'mdpi', 213: 'tvdpi', 240: 'hdpi', 320: 'xhdpi', 480: 'xxhdpi', 640: 'xxxhdpi', 0xfffe: 'anydpi', 0xffff: 'nodpi' };

export function configQualifier(b: Buffer, o: number): string {
  const size = u32(b, o);
  const q: string[] = [];
  const mcc = u16(b, o + 4), mnc = u16(b, o + 6);
  if (mcc) q.push(`mcc${mcc}`);
  if (mnc) q.push(`mnc${mnc}`);
  const lang = b.toString('latin1', o + 8, o + 10).replace(/\0/g, '');
  const country = b.toString('latin1', o + 10, o + 12).replace(/\0/g, '');
  if (lang && !(b[o + 8] & 0x80)) q.push(lang);
  if (country && !(b[o + 10] & 0x80)) q.push(`r${country}`);
  if (size >= 32) {
    const sw = u16(b, o + 30);
    if (sw) q.push(`sw${sw}dp`);
  }
  if (size >= 36) {
    const w = u16(b, o + 32), h = u16(b, o + 34);
    if (w) q.push(`w${w}dp`);
    if (h) q.push(`h${h}dp`);
  }
  const orient = b[o + 12];
  if (orient === 1) q.push('port');
  if (orient === 2) q.push('land');
  if (size >= 32) {
    const ui = b[o + 29];
    if ((ui & 0x30) === 0x20) q.push('night');
    if ((ui & 0x30) === 0x10) q.push('notnight');
  }
  const density = u16(b, o + 14);
  if (density && DENS[density]) q.push(DENS[density]);
  else if (density) q.push(`${density}dpi`);
  if (size >= 28) {
    const sdk = u16(b, o + 24);
    if (sdk) q.push(`v${sdk}`);
  }
  return q.join('-');
}

// ───────────────────────── ResTable ─────────────────────────
export interface ResEntryValue {
  config: string;
  value?: ResValue;
  bag?: { parent: number; items: { name: number; value: ResValue }[] };
}
export interface ResEntry {
  id: number;
  pkg: string;
  type: string;
  name: string;
  values: ResEntryValue[];
}
export interface ResTable {
  packages: { id: number; name: string }[];
  entries: Map<number, ResEntry>;
  byName: Map<string, number>; // "type/name" for the main package
  typeCounts: Record<string, number>;
}

function readValue(b: Buffer, o: number, strings: string[]): ResValue {
  const type = b[o + 3];
  const data = u32(b, o + 4);
  const v: ResValue = { type, data };
  if (type === VT.STRING) v.str = strings[data] ?? '';
  return v;
}

export function parseResTable(b: Buffer): ResTable {
  if (u16(b, 0) !== T.TABLE) throw new ResFormatError('resources.arsc: en-tête invalide');
  const headerSize = u16(b, 2);
  const total = Math.min(u32(b, 4), b.length);
  let strings: string[] = [];
  const table: ResTable = { packages: [], entries: new Map(), byName: new Map(), typeCounts: {} };
  let p = headerSize;
  while (p + 8 <= total) {
    const type = u16(b, p);
    const size = u32(b, p + 4);
    if (size < 8) break;
    if (type === T.STRING_POOL) strings = parseStringPool(b, p);
    else if (type === T.PACKAGE) parsePackage(b, p, size, strings, table);
    p += size;
  }
  return table;
}

function parsePackage(b: Buffer, start: number, size: number, strings: string[], table: ResTable) {
  const headerSize = u16(b, start + 2);
  const pkgId = u32(b, start + 8);
  const name = b.toString('utf16le', start + 12, start + 12 + 256).replace(/\0.*$/s, '');
  const typeStrOff = u32(b, start + 268);
  const keyStrOff = u32(b, start + 276);
  const typeNames = typeStrOff ? parseStringPool(b, start + typeStrOff) : [];
  const keys = keyStrOff ? parseStringPool(b, start + keyStrOff) : [];
  table.packages.push({ id: pkgId, name });
  const main = table.packages.length === 1;
  const end = Math.min(b.length, start + size);
  let p = start + headerSize;
  while (p + 8 <= end) {
    const ctype = u16(b, p);
    const csize = u32(b, p + 4);
    if (csize < 8) break;
    if (ctype === T.TYPE) {
      try {
        parseType(b, p, pkgId, name, typeNames, keys, strings, table, main);
      } catch {
        /* tolerate malformed type chunks (obfuscators produce them) */
      }
    }
    p += csize;
  }
}

function parseType(b: Buffer, start: number, pkgId: number, pkgName: string, typeNames: string[], keys: string[], strings: string[], table: ResTable, main: boolean) {
  const headerSize = u16(b, start + 2);
  const size = u32(b, start + 4);
  const typeId = b[start + 8];
  const flags = b[start + 9];
  const entryCount = u32(b, start + 12);
  const entriesStart = u32(b, start + 16);
  const config = configQualifier(b, start + 20);
  const typeName = typeNames[typeId - 1] ?? `type${typeId}`;
  const sparse = (flags & 0x01) !== 0;
  const off16 = (flags & 0x02) !== 0;
  const offs: [number, number][] = [];
  const o = start + headerSize;
  for (let i = 0; i < entryCount; i++) {
    if (sparse) {
      const idx = u16(b, o + i * 4);
      offs.push([idx, u16(b, o + i * 4 + 2) * 4]);
    } else if (off16) {
      const v = u16(b, o + i * 2);
      if (v !== 0xffff) offs.push([i, v * 4]);
    } else {
      const v = u32(b, o + i * 4);
      if (v !== 0xffffffff) offs.push([i, v]);
    }
  }
  const end = start + size;
  for (const [idx, off] of offs) {
    const e = start + entriesStart + off;
    if (e + 8 > end) continue;
    const eflags = u16(b, e + 2);
    const id = ((pkgId & 0xff) << 24) | (typeId << 16) | idx;
    let keyIdx: number;
    const ev: ResEntryValue = { config };
    if (eflags & 0x08) {
      // compact entry
      keyIdx = u16(b, e);
      ev.value = { type: eflags >> 8, data: u32(b, e + 4) };
      if (ev.value.type === VT.STRING) ev.value.str = strings[ev.value.data] ?? '';
    } else {
      const esize = u16(b, e);
      keyIdx = u32(b, e + 4);
      if (eflags & 0x01) {
        const parent = u32(b, e + 8);
        const count = Math.min(u32(b, e + 12), 4096);
        const items: { name: number; value: ResValue }[] = [];
        let q = e + esize;
        for (let k = 0; k < count && q + 12 <= end; k++, q += 12) items.push({ name: u32(b, q), value: readValue(b, q + 4, strings) });
        ev.bag = { parent, items };
      } else {
        ev.value = readValue(b, e + esize, strings);
      }
    }
    const key = keys[keyIdx] ?? `0x${(id >>> 0).toString(16)}`;
    let entry = table.entries.get(id >>> 0);
    if (!entry) {
      entry = { id: id >>> 0, pkg: pkgName, type: typeName, name: key, values: [] };
      table.entries.set(id >>> 0, entry);
      table.typeCounts[typeName] = (table.typeCounts[typeName] ?? 0) + 1;
      if (main) table.byName.set(`${typeName}/${key}`, id >>> 0);
    }
    entry.values.push(ev);
  }
}

// ───────────────────────── Resolution helpers ─────────────────────────
export interface Resolver {
  app?: ResTable;
  framework?: ResTable;
}

export function lookup(r: Resolver, id: number): ResEntry | undefined {
  id = id >>> 0;
  if (id >>> 24 === 0x01) return r.framework?.entries.get(id);
  return r.app?.entries.get(id) ?? r.framework?.entries.get(id);
}

export function refName(r: Resolver, id: number, prefix = '@'): string {
  if (id === 0) return '@null';
  const e = lookup(r, id);
  if (!e) return `${prefix}0x${(id >>> 0).toString(16).padStart(8, '0')}`;
  const pkg = id >>> 24 === 0x01 ? 'android:' : '';
  return `${prefix}${pkg}${e.type}/${e.name}`;
}

export function formatValue(v: ResValue, r: Resolver): string {
  switch (v.type) {
    case VT.NULL:
      return v.data === 1 ? '@empty' : '';
    case VT.REFERENCE:
    case VT.DYN_REFERENCE:
      return refName(r, v.data, '@');
    case VT.ATTRIBUTE:
    case VT.DYN_ATTRIBUTE:
      return refName(r, v.data, '?');
    case VT.STRING:
      return v.str ?? '';
    case VT.FLOAT:
      return String(Buffer.from(Uint32Array.of(v.data).buffer).readFloatLE(0));
    case VT.DIMENSION: {
      const n = complexToFloat(v.data);
      return `${+n.toFixed(3)}${DIM_UNITS[v.data & 0xf] ?? 'px'}`;
    }
    case VT.FRACTION: {
      const n = complexToFloat(v.data) * 100;
      return `${+n.toFixed(3)}${(v.data & 0xf) === 1 ? '%p' : '%'}`;
    }
    case VT.INT_HEX:
      return '0x' + (v.data >>> 0).toString(16);
    case VT.INT_BOOLEAN:
      return v.data !== 0 ? 'true' : 'false';
    case VT.ARGB8:
    case VT.RGB8:
    case VT.ARGB4:
    case VT.RGB4:
      return colorHex(v);
    default:
      return String(v.data | 0);
  }
}

/** Follow references to a concrete value, picking the default (or first) config. */
export function resolveDeep(r: Resolver, v: ResValue, prefer = '', depth = 0): ResValue {
  if (depth > 10 || (v.type !== VT.REFERENCE && v.type !== VT.DYN_REFERENCE)) return v;
  const e = lookup(r, v.data);
  if (!e) return v;
  const pick = e.values.find((x) => x.config === prefer && x.value) ?? e.values.find((x) => x.config === '' && x.value) ?? e.values.find((x) => x.value);
  return pick?.value ? resolveDeep(r, pick.value, prefer, depth + 1) : v;
}

// ───────────────────────── Binary XML ─────────────────────────
export interface XmlAttr {
  ns?: string;
  prefix?: string;
  name: string;
  resId?: number;
  raw?: string;
  value: ResValue;
}
export interface XmlNode {
  tag: string;
  ns?: string;
  attrs: XmlAttr[];
  children: XmlNode[];
  text?: string;
  line?: number;
}

export function isBinaryXml(b: Buffer) {
  return b.length >= 8 && u16(b, 0) === T.XML;
}

export function parseBinaryXml(b: Buffer, attrNameById?: (id: number) => string | undefined): XmlNode {
  if (!isBinaryXml(b)) throw new ResFormatError('XML binaire Android invalide');
  const headerSize = u16(b, 2);
  const total = Math.min(u32(b, 4), b.length);
  let strings: string[] = [];
  let resMap: number[] = [];
  const nsPrefix = new Map<string, string>();
  const root: XmlNode = { tag: '#document', attrs: [], children: [] };
  const stack: XmlNode[] = [root];
  let p = headerSize;
  let guard = 0;
  while (p + 8 <= total && guard++ < 5_000_000) {
    const type = u16(b, p);
    const hs = u16(b, p + 2);
    const size = u32(b, p + 4);
    if (size < 8) break;
    switch (type) {
      case T.STRING_POOL:
        strings = parseStringPool(b, p);
        break;
      case T.XML_RES_MAP: {
        const n = (size - hs) / 4;
        resMap = [];
        for (let i = 0; i < n; i++) resMap.push(u32(b, p + hs + i * 4));
        break;
      }
      case T.XML_START_NS: {
        const prefix = strings[u32(b, p + 16)] ?? '';
        const uri = strings[u32(b, p + 20)] ?? '';
        nsPrefix.set(uri, prefix);
        break;
      }
      case T.XML_START_EL: {
        const line = u32(b, p + 8);
        const ext = p + hs;
        const nsIdx = u32(b, ext);
        const name = strings[u32(b, ext + 4)] ?? '?';
        const attrStart = u16(b, ext + 8);
        const attrSize = u16(b, ext + 10) || 20;
        const attrCount = u16(b, ext + 12);
        const node: XmlNode = { tag: name, attrs: [], children: [], line };
        if (nsIdx !== 0xffffffff) node.ns = strings[nsIdx];
        for (let i = 0; i < attrCount; i++) {
          const a = ext + attrStart + i * attrSize;
          if (a + 20 > total) break;
          const ans = u32(b, a);
          const nameIdx = u32(b, a + 4);
          const rawIdx = u32(b, a + 8);
          const value = readValue(b, a + 12, strings);
          const resId = resMap[nameIdx];
          let aname = strings[nameIdx] ?? '';
          if ((!aname || /^[^a-zA-Z_]/.test(aname)) && resId) aname = attrNameById?.(resId) ?? `attr_0x${resId.toString(16)}`;
          const attr: XmlAttr = { name: aname, value };
          if (ans !== 0xffffffff) {
            attr.ns = strings[ans];
            attr.prefix = nsPrefix.get(attr.ns ?? '') ?? (attr.ns?.endsWith('/android') ? 'android' : 'ns');
          }
          if (resId) attr.resId = resId;
          if (rawIdx !== 0xffffffff) attr.raw = strings[rawIdx];
          node.attrs.push(attr);
        }
        stack[stack.length - 1].children.push(node);
        stack.push(node);
        break;
      }
      case T.XML_END_EL:
        if (stack.length > 1) stack.pop();
        break;
      case T.XML_CDATA: {
        const txt = strings[u32(b, p + 16)];
        const cur = stack[stack.length - 1];
        if (txt?.trim()) cur.text = (cur.text ?? '') + txt;
        break;
      }
    }
    p += size;
  }
  const doc = root.children[0];
  if (!doc) throw new ResFormatError('XML binaire vide');
  (doc as XmlNode & { namespaces?: Record<string, string> }).namespaces = Object.fromEntries([...nsPrefix].map(([u, pf]) => [pf, u]));
  return doc;
}

export function attrValue(a: XmlAttr, r: Resolver): string {
  if (a.value.type === VT.STRING) return a.value.str ?? '';
  if (a.raw !== undefined && a.value.type === VT.NULL) return a.raw;
  return formatValue(a.value, r);
}

export function getAttr(n: XmlNode, name: string): XmlAttr | undefined {
  return n.attrs.find((a) => a.name === name);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toXmlText(n: XmlNode, r: Resolver, indent = ''): string {
  const ns = (n as XmlNode & { namespaces?: Record<string, string> }).namespaces;
  const head = indent === '' ? '<?xml version="1.0" encoding="utf-8"?>\n' : '';
  const nsAttrs = ns ? Object.entries(ns).map(([p, u]) => ` xmlns:${p}="${esc(u)}"`).join('') : '';
  const attrs = n.attrs.map((a) => ` ${a.prefix ? a.prefix + ':' : ''}${a.name}="${esc(formatAttrValue(a, r))}"`).join('');
  const open = `${indent}<${n.tag}${nsAttrs}${attrs}`;
  if (!n.children.length && !n.text) return `${head}${open}/>\n`;
  const kids = n.children.map((c) => toXmlText(c, r, indent + '    ')).join('');
  const text = n.text ? esc(n.text) : '';
  return `${head}${open}>${text}${kids ? '\n' + kids + indent : ''}</${n.tag}>\n`;
}

// ───────────────────────── Attribute enums / flags ─────────────────────────
const ATTR_TYPE = 0x01000000;
const TYPE_ENUM = 1 << 16;
const TYPE_FLAGS = 1 << 17;
const bitCount = (n: number) => n.toString(2).replace(/0/g, '').length;

/** Decode an attribute value using its <attr> definition (enum/flag symbols), when known. */
export function formatAttrValue(a: XmlAttr, r: Resolver): string {
  const v = a.value;
  if (a.resId && (v.type === VT.INT_DEC || v.type === VT.INT_HEX)) {
    const def = lookup(r, a.resId);
    const bag = def?.values.find((x) => x.bag)?.bag;
    if (bag) {
      const t = bag.items.find((i) => i.name === ATTR_TYPE)?.value.data ?? 0;
      const symbols = bag.items
        .filter((i) => i.name >>> 16 !== 0x0100)
        .map((i) => ({ name: lookup(r, i.name)?.name ?? '', val: i.value.data >>> 0 }));
      const d = v.data >>> 0;
      if (t & TYPE_ENUM) {
        const s = symbols.find((x) => x.val === d);
        if (s?.name) return s.name;
      }
      if (t & TYPE_FLAGS) {
        const exact = symbols.find((x) => x.val === d);
        if (exact?.name) return exact.name;
        const parts: string[] = [];
        let covered = 0;
        for (const s of [...symbols].sort((x, y) => bitCount(y.val) - bitCount(x.val))) {
          if (s.val && (d & s.val) === s.val && (covered & s.val) !== s.val) {
            parts.push(s.name);
            covered |= s.val;
          }
        }
        if (parts.length && covered === d) return parts.join('|');
      }
    }
  }
  return attrValue(a, r);
}

let frameworkCache: ResTable | null | undefined;
/** Framework resources (android:*) shipped with Apktool. Optional: everything works without it, just less readable. */
export async function loadFramework(): Promise<ResTable | undefined> {
  if (frameworkCache !== undefined) return frameworkCache ?? undefined;
  try {
    const { config } = await import('../config.js');
    const { readEntry } = await import('./zip.js');
    const path = await import('node:path');
    const buf = await readEntry(path.join(config.toolsDir, 'aapt2', 'android-framework.jar'), 'resources.arsc');
    frameworkCache = buf ? parseResTable(buf) : null;
  } catch {
    frameworkCache = null;
  }
  return frameworkCache ?? undefined;
}

export function frameworkAttrName(r: Resolver) {
  return (id: number) => {
    const e = r.framework?.entries.get(id >>> 0);
    return e?.type === 'attr' ? e.name : undefined;
  };
}
