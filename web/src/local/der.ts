/** Minimal DER encoder/decoder for X.509 certificates and PKCS#7 (on-device signing and certificate display). */
import type { CertInfo } from '../../../server/src/engines/signature';

const concat = (parts: Uint8Array[]) => {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
export { concat };

function len(n: number): Uint8Array {
  if (n < 0x80) return Uint8Array.of(n);
  const b: number[] = [];
  while (n > 0) {
    b.unshift(n & 0xff);
    n = Math.floor(n / 256);
  }
  return Uint8Array.of(0x80 | b.length, ...b);
}
export const tlv = (tag: number, ...content: Uint8Array[]) => {
  const c = concat(content);
  return concat([Uint8Array.of(tag), len(c.length), c]);
};
export const seq = (...c: Uint8Array[]) => tlv(0x30, ...c);
export const set = (...c: Uint8Array[]) => tlv(0x31, ...c);
export const ctx = (n: number, ...c: Uint8Array[]) => tlv(0xa0 | n, ...c);
export const nul = () => Uint8Array.of(0x05, 0x00);
export const octets = (b: Uint8Array) => tlv(0x04, b);
export const bits = (b: Uint8Array) => tlv(0x03, Uint8Array.of(0), b);
export const utf8 = (s: string) => tlv(0x0c, new TextEncoder().encode(s));
export function int(v: number | Uint8Array): Uint8Array {
  let b: Uint8Array;
  if (typeof v === 'number') {
    const a: number[] = [];
    do {
      a.unshift(v & 0xff);
      v = Math.floor(v / 256);
    } while (v > 0);
    b = Uint8Array.from(a);
  } else b = v;
  let i = 0;
  while (i < b.length - 1 && b[i] === 0) i++;
  b = b.subarray(i);
  if (b[0] & 0x80) b = concat([Uint8Array.of(0), b]);
  return tlv(0x02, b);
}
export function oid(s: string): Uint8Array {
  const p = s.split('.').map(Number);
  const out = [40 * p[0] + p[1]];
  for (const v of p.slice(2)) {
    const enc: number[] = [v & 0x7f];
    let x = Math.floor(v / 128);
    while (x > 0) {
      enc.unshift((x & 0x7f) | 0x80);
      x = Math.floor(x / 128);
    }
    out.push(...enc);
  }
  return tlv(0x06, Uint8Array.from(out));
}
export function time(d: Date): Uint8Array {
  const p = (n: number) => String(n).padStart(2, '0');
  const y = d.getUTCFullYear();
  const body = `${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return y < 2050 ? tlv(0x17, new TextEncoder().encode(String(y).slice(2) + body)) : tlv(0x18, new TextEncoder().encode(y + body));
}
export const name = (cn: string, o: string) => seq(set(seq(oid('2.5.4.3'), utf8(cn))), set(seq(oid('2.5.4.10'), utf8(o))));

// ───── decoding ─────
export interface Node { tag: number; start: number; hdr: number; len: number }
export function read(b: Uint8Array, p: number): Node {
  const tag = b[p];
  let l = b[p + 1];
  let hdr = 2;
  if (l & 0x80) {
    const n = l & 0x7f;
    l = 0;
    for (let i = 0; i < n; i++) l = l * 256 + b[p + 2 + i];
    hdr += n;
  }
  if (p + hdr + l > b.length) throw new Error('DER overflow');
  return { tag, start: p, hdr, len: l };
}
export function kids(b: Uint8Array, n: Node): Node[] {
  const out: Node[] = [];
  let p = n.start + n.hdr;
  while (p < n.start + n.hdr + n.len) {
    const c = read(b, p);
    out.push(c);
    p = c.start + c.hdr + c.len;
  }
  return out;
}
const body = (b: Uint8Array, n: Node) => b.subarray(n.start + n.hdr, n.start + n.hdr + n.len);
function decodeOid(v: Uint8Array): string {
  const out = [Math.floor(v[0] / 40), v[0] % 40];
  let x = 0;
  for (const byte of v.subarray(1)) {
    x = x * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) {
      out.push(x);
      x = 0;
    }
  }
  return out.join('.');
}
const RDN: Record<string, string> = { '2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.10': 'O', '2.5.4.11': 'OU', '1.2.840.113549.1.9.1': 'emailAddress' };
function nameStr(b: Uint8Array, n: Node): string {
  const parts: string[] = [];
  for (const s of kids(b, n)) for (const atv of kids(b, s)) {
    const [o, v] = kids(b, atv);
    const val = new TextDecoder(v.tag === 0x1e ? 'utf-16be' : 'utf-8').decode(body(b, v));
    parts.push(`${RDN[decodeOid(body(b, o))] ?? decodeOid(body(b, o))}=${val}`);
  }
  return parts.join(', ');
}
function timeStr(b: Uint8Array, n: Node): string {
  const s = new TextDecoder().decode(body(b, n));
  const full = n.tag === 0x17 ? (+s.slice(0, 2) >= 50 ? '19' : '20') + s : s;
  const d = new Date(Date.UTC(+full.slice(0, 4), +full.slice(4, 6) - 1, +full.slice(6, 8), +full.slice(8, 10), +full.slice(10, 12), +full.slice(12, 14)));
  return d.toUTCString();
}
const hex = (u: Uint8Array) => [...u].map((x) => x.toString(16).padStart(2, '0')).join('');

export async function certInfo(der: Uint8Array): Promise<CertInfo | null> {
  try {
    const cert = read(der, 0);
    const [tbs] = kids(der, cert);
    let f = kids(der, tbs);
    if (f[0].tag === 0xa0) f = f.slice(1);
    const [serial, , issuer, validity, subject, spki] = f;
    const [nb, na] = kids(der, validity);
    const algOid = decodeOid(body(der, kids(der, kids(der, spki)[0])[0]));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', der.slice()));
    const sub = nameStr(der, subject);
    return {
      subject: sub,
      issuer: nameStr(der, issuer),
      serial: hex(body(der, serial)).toUpperCase(),
      validFrom: timeStr(der, nb),
      validTo: timeStr(der, na),
      sha256: hex(digest).toUpperCase().match(/../g)!.join(':'),
      publicKeyType: { '1.2.840.113549.1.1.1': 'rsa', '1.2.840.10045.2.1': 'ec', '1.2.840.10040.4.1': 'dsa' }[algOid] ?? algOid,
      debugCert: /CN=Android Debug/i.test(sub),
    };
  } catch {
    return null;
  }
}
