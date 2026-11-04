/**
 * On-device APK builder.
 * Javac/aapt2 cannot run on a phone, so APPXRAY ships a precompiled Android runtime (classes.dex, built from
 * android-runtime/) that renders the reconstructed screens from a JSON description. This module produces a real,
 * installable APK around it: binary AndroidManifest.xml, resources.arsc (launcher icon), assets, and a JAR (v1)
 * signature made with a key generated and kept on the device (WebCrypto).
 */
import { zipSync, type Zippable } from 'fflate';
import { Buffer } from 'buffer';
import * as der from './der';
import * as db from './db';
import type { UiNode, Paint } from '../../../server/src/engines/ui';
import { drawableToSvg } from '../../../server/src/engines/ui';
import type { Loaded } from '../../../server/src/engines/analysis-core';
import type { ProjectOptions, StoredScreen } from '../../../server/src/engines/rebuild-core';
import { MemZip } from './zip';
import { parseBinaryXml, getAttr, attrValue } from '../../../server/src/engines/res';
import { Dex } from '../../../server/src/engines/dex';

const enc = new TextEncoder();
const RT = 'io.appxray.runtime.';
const ID = { theme: 0x01010000, label: 0x01010001, icon: 0x01010002, name: 0x01010003, exported: 0x01010010, minSdkVersion: 0x0101020c, versionCode: 0x0101021b, versionName: 0x0101021c, targetSdkVersion: 0x01010270, allowBackup: 0x01010280, maxSdkVersion: 0x01010271 };
const THEME_MATERIAL_LIGHT_DARKACTIONBAR = 0x01030238;
const ICON_ID = 0x7f010000;
export const MIN_SDK = 24;
export const TARGET_SDK = 29;

// ───────────────────────── little-endian writer ─────────────────────────
class W {
  private parts: number[] = [];
  u8(v: number) { this.parts.push(v & 0xff); return this; }
  u16(v: number) { this.u8(v).u8(v >>> 8); return this; }
  u32(v: number) { this.u16(v & 0xffff).u16(v >>> 16); return this; }
  bytes(b: Uint8Array) { for (const x of b) this.parts.push(x); return this; }
  pad4() { while (this.parts.length % 4) this.parts.push(0); return this; }
  get length() { return this.parts.length; }
  out() { return Uint8Array.from(this.parts); }
}

function stringPool(strings: string[]): Uint8Array {
  const data = new W();
  const offsets: number[] = [];
  const lenBytes = (w: W, n: number) => (n > 0x7f ? w.u8(((n >> 8) & 0x7f) | 0x80).u8(n & 0xff) : w.u8(n));
  for (const s of strings) {
    offsets.push(data.length);
    const b = enc.encode(s);
    lenBytes(data, s.length);
    lenBytes(data, b.length);
    data.bytes(b).u8(0);
  }
  data.pad4();
  const body = data.out();
  const headerSize = 28;
  const stringsStart = headerSize + strings.length * 4;
  const w = new W().u16(0x0001).u16(headerSize).u32(stringsStart + body.length).u32(strings.length).u32(0).u32(0x100).u32(stringsStart).u32(0);
  for (const o of offsets) w.u32(o);
  return w.bytes(body).out();
}

// ───────────────────────── binary XML ─────────────────────────
type AttrVal = { str: string } | { int: number } | { bool: boolean } | { ref: number };
interface El { name: string; attrs: { ns: boolean; name: string; value: AttrVal }[]; children: El[] }
const el = (name: string, attrs: El['attrs'] = [], children: El[] = []): El => ({ name, attrs, children });
const a = (name: keyof typeof ID, value: AttrVal) => ({ ns: true, name, value });

export function encodeAxml(root: El): Uint8Array {
  const NS = 'http://schemas.android.com/apk/res/android';
  const resNames = new Set<string>();
  const walk = (e: El) => {
    for (const at of e.attrs) if (at.ns) resNames.add(at.name);
    e.children.forEach(walk);
  };
  walk(root);
  const resList = [...resNames].sort((x, y) => ID[x as keyof typeof ID] - ID[y as keyof typeof ID]);
  const pool: string[] = [...resList];
  const idx = (s: string) => {
    let i = pool.indexOf(s);
    if (i < 0) i = pool.push(s) - 1;
    return i;
  };
  idx('android');
  idx(NS);
  const collect = (e: El) => {
    idx(e.name);
    for (const at of e.attrs) {
      idx(at.name);
      if ('str' in at.value) idx(at.value.str);
    }
    e.children.forEach(collect);
  };
  collect(root);
  const nodes = new W();
  nodes.u16(0x0100).u16(16).u32(24).u32(1).u32(0xffffffff).u32(idx('android')).u32(idx(NS));
  const emit = (e: El) => {
    const attrs = [...e.attrs].sort((x, y) => (x.ns ? ID[x.name as keyof typeof ID] : -1) - (y.ns ? ID[y.name as keyof typeof ID] : -1));
    nodes.u16(0x0102).u16(16).u32(16 + 20 + 20 * attrs.length).u32(1).u32(0xffffffff);
    nodes.u32(0xffffffff).u32(idx(e.name)).u16(20).u16(20).u16(attrs.length).u16(0).u16(0).u16(0);
    for (const at of attrs) {
      nodes.u32(at.ns ? idx(NS) : 0xffffffff).u32(idx(at.name));
      const v = at.value;
      if ('str' in v) nodes.u32(idx(v.str)).u16(8).u8(0).u8(0x03).u32(idx(v.str));
      else if ('int' in v) nodes.u32(0xffffffff).u16(8).u8(0).u8(0x10).u32(v.int >>> 0);
      else if ('bool' in v) nodes.u32(0xffffffff).u16(8).u8(0).u8(0x12).u32(v.bool ? 0xffffffff : 0);
      else nodes.u32(0xffffffff).u16(8).u8(0).u8(0x01).u32(v.ref >>> 0);
    }
    e.children.forEach(emit);
    nodes.u16(0x0103).u16(16).u32(24).u32(1).u32(0xffffffff).u32(0xffffffff).u32(idx(e.name));
  };
  emit(root);
  nodes.u16(0x0101).u16(16).u32(24).u32(1).u32(0xffffffff).u32(idx('android')).u32(idx(NS));
  const sp = stringPool(pool);
  const map = new W().u16(0x0180).u16(8).u32(8 + resList.length * 4);
  for (const n of resList) map.u32(ID[n as keyof typeof ID]);
  const body = [sp, map.out(), nodes.out()];
  const size = 8 + body.reduce((s, b) => s + b.length, 0);
  return der.concat([new W().u16(0x0003).u16(8).u32(size).out(), ...body]);
}

// ───────────────────────── resources.arsc (launcher icon only) ─────────────────────────
export function encodeArsc(pkg: string, iconPath: string): Uint8Array {
  const global = stringPool([iconPath]);
  const typeStrings = stringPool(['mipmap']);
  const keyStrings = stringPool(['ic_launcher']);
  const spec = new W().u16(0x0202).u16(16).u32(16 + 4).u8(1).u8(0).u16(0).u32(1).u32(0).out();
  const cfgSize = 64;
  const typeHeader = 20 + cfgSize;
  const entriesStart = typeHeader + 4;
  const type = new W().u16(0x0201).u16(typeHeader).u32(entriesStart + 16).u8(1).u8(0).u16(0).u32(1).u32(entriesStart);
  type.u32(cfgSize);
  for (let i = 4; i < cfgSize; i++) type.u8(0);
  type.u32(0); // entry offset
  type.u16(8).u16(0).u32(0); // entry: size, flags, key index
  type.u16(8).u8(0).u8(0x03).u32(0); // Res_value: string #0 of the global pool
  const typeChunk = type.out();
  const pkgHeader = 288;
  const name = new Uint8Array(256);
  for (let i = 0; i < Math.min(pkg.length, 127); i++) {
    name[i * 2] = pkg.charCodeAt(i) & 0xff;
    name[i * 2 + 1] = pkg.charCodeAt(i) >> 8;
  }
  const pkgSize = pkgHeader + typeStrings.length + keyStrings.length + spec.length + typeChunk.length;
  const ph = new W().u16(0x0200).u16(pkgHeader).u32(pkgSize).u32(0x7f).bytes(name).u32(pkgHeader).u32(1).u32(pkgHeader + typeStrings.length).u32(1).u32(0).out();
  const pkgChunk = der.concat([ph, typeStrings, keyStrings, spec, typeChunk]);
  const total = 12 + global.length + pkgChunk.length;
  return der.concat([new W().u16(0x0002).u16(12).u32(total).u32(1).out(), global, pkgChunk]);
}

// ───────────────────────── signing (JAR v1) ─────────────────────────
interface DeviceKey { privateKey: CryptoKey; cert: Uint8Array; issuer: Uint8Array; serial: Uint8Array }

export async function deviceKey(): Promise<DeviceKey> {
  const existing = await db.get<DeviceKey>('keys', 'signing');
  if (existing) return existing;
  const kp = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' }, false, ['sign', 'verify'])) as CryptoKeyPair;
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey));
  const serial = crypto.getRandomValues(new Uint8Array(8));
  serial[0] &= 0x7f;
  const issuer = der.name('APPXRAY on-device', 'APPXRAY');
  const now = new Date();
  const later = new Date(now.getTime() + 30 * 365 * 86400_000);
  const alg = der.seq(der.oid('1.2.840.113549.1.1.11'), der.nul());
  const tbs = der.seq(der.ctx(0, der.int(2)), der.int(serial), alg, issuer, der.seq(der.time(now), der.time(later)), issuer, spki);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, tbs.slice().buffer));
  const cert = der.seq(tbs, alg, der.bits(sig));
  const key: DeviceKey = { privateKey: kp.privateKey, cert, issuer, serial };
  await db.put('keys', 'signing', key);
  return key;
}

const b64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const sha256 = async (u: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', u.slice().buffer));
/** Manifest lines are limited to 72 bytes; continuation lines start with a space. */
function mfLine(s: string): string {
  const b = enc.encode(s);
  if (b.length <= 70) return s + '\r\n';
  let out = '';
  let first = true;
  let cur = '';
  for (const ch of s) {
    const limit = first ? 70 : 69;
    if (enc.encode(cur + ch).length > limit) {
      out += (first ? '' : ' ') + cur + '\r\n';
      first = false;
      cur = '';
    }
    cur += ch;
  }
  return out + (first ? '' : ' ') + cur + '\r\n';
}

export async function signJar(files: Map<string, Uint8Array>): Promise<Map<string, Uint8Array>> {
  const key = await deviceKey();
  let mf = 'Manifest-Version: 1.0\r\nCreated-By: APPXRAY (on-device)\r\n\r\n';
  let sfEntries = '';
  for (const [name, data] of [...files].sort(([x], [y]) => x.localeCompare(y))) {
    const section = mfLine(`Name: ${name}`) + `SHA-256-Digest: ${b64(await sha256(data))}\r\n\r\n`;
    mf += section;
    sfEntries += mfLine(`Name: ${name}`) + `SHA-256-Digest: ${b64(await sha256(enc.encode(section)))}\r\n\r\n`;
  }
  const mfBytes = enc.encode(mf);
  const sf = enc.encode(`Signature-Version: 1.0\r\nCreated-By: APPXRAY (on-device)\r\nSHA-256-Digest-Manifest: ${b64(await sha256(mfBytes))}\r\n\r\n` + sfEntries);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, sf.slice().buffer));
  const sha256Alg = der.seq(der.oid('2.16.840.1.101.3.4.2.1'), der.nul());
  const signerInfo = der.seq(der.int(1), der.seq(key.issuer, der.int(key.serial)), sha256Alg, der.seq(der.oid('1.2.840.113549.1.1.1'), der.nul()), der.octets(signature));
  const signedData = der.seq(der.int(1), der.set(sha256Alg), der.seq(der.oid('1.2.840.113549.1.7.1')), der.ctx(0, key.cert), der.set(signerInfo));
  const pkcs7 = der.seq(der.oid('1.2.840.113549.1.7.2'), der.ctx(0, signedData));
  const out = new Map(files);
  out.set('META-INF/MANIFEST.MF', mfBytes);
  out.set('META-INF/APPXRAY.SF', sf);
  out.set('META-INF/APPXRAY.RSA', pkcs7);
  return out;
}

// ───────────────────────── images ─────────────────────────
const DENS: Record<string, number> = { ldpi: 120, mdpi: 160, tvdpi: 213, hdpi: 240, xhdpi: 320, xxhdpi: 480, xxxhdpi: 640, nodpi: 160 };

async function svgToPng(svg: string, px = 144): Promise<Uint8Array | null> {
  try {
    const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    const ratio = m ? +m[2] / +m[1] : 1;
    const img = new Image();
    const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('svg'));
      img.src = url;
    });
    const c = document.createElement('canvas');
    c.width = px;
    c.height = Math.max(1, Math.round(px * ratio));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

async function defaultIcon(primary: string, accent: string): Promise<Uint8Array> {
  const css = (h: string) => '#' + h.slice(3) ;
  const c = document.createElement('canvas');
  c.width = c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = css(primary);
  g.fillRect(0, 0, 192, 192);
  g.fillStyle = css(accent);
  g.beginPath();
  g.moveTo(96, 40);
  g.lineTo(152, 96);
  g.lineTo(96, 152);
  g.lineTo(40, 96);
  g.closePath();
  g.fill();
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  return new Uint8Array(await blob!.arrayBuffer());
}

// ───────────────────────── build ─────────────────────────
export interface DeviceBuildInput {
  options: ProjectOptions;
  L?: Loaded;
  getStored(key: string): Promise<StoredScreen | null>;
  layoutTree(key: string): Promise<UiNode | null>;
  uploadedIcon?: Uint8Array;
  log(line: string): void;
}

export interface DeviceBuildResult { apk: Uint8Array; package: string; classes: number; checks: { name: string; ok: boolean; detail?: string }[] }

export async function buildApkOnDevice(inp: DeviceBuildInput): Promise<DeviceBuildResult> {
  const { options: o, L, log } = inp;
  const checks: DeviceBuildResult['checks'] = [];
  const check = (name: string, ok: boolean, detail?: string) => {
    checks.push({ name, ok, detail });
    log(`  ${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) throw new Error(name + (detail ? ` : ${detail}` : ''));
  };
  log('▶ Vérifications');
  check('Package valide', /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(o.packageName), o.packageName);
  const runtimeRes = await fetch('/runtime/classes.dex');
  check('Runtime APPXRAY présent', runtimeRes.ok, 'runtime/classes.dex');
  const dex = new Uint8Array(await runtimeRes.arrayBuffer());

  log('▶ Écrans');
  const assets = new Map<string, Uint8Array>();
  const imgByEntry = new Map<string, string>();
  const screens: Record<string, { title: string; root: UiNode; next?: string; delayMs?: number }> = {};
  let n = 0;
  const convertPaint = async (p?: Paint): Promise<(Paint & { asset?: string; density?: number }) | undefined> => {
    if (!p) return p;
    const out: Paint & { asset?: string; density?: number } = { ...p };
    if (p.image && L) {
      let asset = imgByEntry.get(p.image);
      let density = 160;
      if (!asset) {
        let bytes: Uint8Array | null = null;
        let ext = '.png';
        if (/\.(png|webp|jpe?g|gif)$/i.test(p.image) && !p.svg) {
          const b = await L.read(p.image, 8 * 1024 * 1024);
          if (b) bytes = new Uint8Array(b);
          ext = p.image.endsWith('.9.png') ? '.png' : (p.image.match(/\.\w+$/)?.[0] ?? '.png');
        } else if (p.image.endsWith('.xml')) {
          const svg = await drawableToSvg(L, p.image);
          bytes = svg ? await svgToPng(svg) : null;
        }
        if (bytes) {
          asset = `i${n++}${ext.toLowerCase()}`;
          assets.set(`assets/appxray/img/${asset}`, bytes);
          imgByEntry.set(p.image, asset);
        }
      }
      if (asset) {
        const dir = p.image.split('/').slice(-2, -1)[0] ?? '';
        density = p.image.endsWith('.xml') ? 480 : DENS[dir.split('-').find((x) => x in DENS) ?? 'mdpi'];
        out.asset = asset;
        out.density = density;
      }
    }
    delete out.image;
    delete out.svg;
    delete out.ref;
    return out;
  };
  const convert = async (node: UiNode): Promise<UiNode> => ({
    ...node,
    raw: {},
    props: { ...node.props, background: await convertPaint(node.props.background), src: await convertPaint(node.props.src) },
    children: await Promise.all(node.children.map(convert)),
  });
  let launcher = '';
  for (const s of o.screens) {
    const stored = await inp.getStored(s.key);
    const tree = stored?.root ?? (await inp.layoutTree(s.key));
    if (!tree) {
      log(`  ⚠ écran ${s.key} introuvable, ignoré`);
      continue;
    }
    screens[s.key] = { title: s.title ?? stored?.title ?? '', root: await convert(tree), ...(s.next && s.next !== s.key ? { next: s.next, delayMs: Math.round((s.delay ?? 2) * 1000) } : {}) };
    if (s.launcher || !launcher) launcher = s.launcher ? s.key : launcher || s.key;
    log(`  ✔ ${s.key}${stored ? ` (${stored.origin})` : ''}`);
  }
  const features = Object.fromEntries(o.features.map((f) => [f.id, f.id === 'webview' ? { url: f.url ?? 'https://example.com' } : true]));
  if (!Object.keys(screens).length) {
    screens.home = { title: o.appName, root: { uid: 'root', tag: 'LinearLayout', kind: 'linear', raw: {}, children: [{ uid: 't', tag: 'TextView', kind: 'text', raw: {}, children: [], props: { text: o.appName, textSize: 24 } }], props: { width: 'match', height: 'match', gravity: 'center', orientation: 'vertical' } } };
    launcher = 'home';
  }
  for (const [k, v] of Object.entries(screens)) {
    if (v.next && !screens[v.next] && !['LoginActivity', 'WebActivity', 'SettingsActivity', 'ItemsActivity'].includes(v.next)) {
      log(`  ⚠ écran suivant « ${v.next} » de « ${k} » non inclus : enchaînement ignoré`);
      delete v.next;
    } else if (v.next) log(`  ✔ ${k} → ${v.next} après ${(v.delayMs! / 1000).toFixed(1)} s`);
  }
  check('Au moins un écran', Object.keys(screens).length > 0, `${Object.keys(screens).length} écran(s), ${imgByEntry.size} image(s)`);
  const app = { appName: o.appName, colors: o.colors, launcher, screens, features, loginFirst: !!features.login };
  assets.set('assets/appxray/app.json', enc.encode(JSON.stringify(app)));

  log('▶ Icône');
  let icon = inp.uploadedIcon ?? null;
  const iconPath = L?.analysis.icon?.path;
  if (!icon && o.copyOriginalIcon && L && iconPath && /\.(png|webp|jpe?g)$/i.test(iconPath)) {
    const b = await L.read(iconPath, 8 * 1024 * 1024);
    if (b) icon = new Uint8Array(b);
  }
  if (!icon) icon = await defaultIcon(o.colors.primary, o.colors.accent);
  const iconExt = icon[0] === 0x89 ? 'png' : icon[0] === 0xff ? 'jpg' : 'webp';
  const iconFile = `res/mipmap/ic_launcher.${iconExt}`;

  log('▶ Manifest binaire + resources.arsc');
  const needsNet = o.features.some((f) => f.id === 'webview' || f.id === 'network') || JSON.stringify(screens).includes('"type":"url"');
  const activity = (cls: string, launcherAct: boolean) =>
    el('activity', [a('name', { str: RT + cls }), a('exported', { bool: launcherAct })], launcherAct ? [el('intent-filter', [], [el('action', [a('name', { str: 'android.intent.action.MAIN' })]), el('category', [a('name', { str: 'android.intent.category.LAUNCHER' })])])] : []);
  const manifest = el('manifest', [{ ns: false, name: 'package', value: { str: o.packageName } }, a('versionCode', { int: o.versionCode }), a('versionName', { str: o.versionName })], [
    el('uses-sdk', [a('minSdkVersion', { int: Math.max(MIN_SDK, o.minSdk) }), a('targetSdkVersion', { int: TARGET_SDK })]),
    ...(needsNet ? [el('uses-permission', [a('name', { str: 'android.permission.INTERNET' })])] : []),
    el('application', [a('theme', { ref: THEME_MATERIAL_LIGHT_DARKACTIONBAR }), a('label', { str: o.appName }), a('icon', { ref: ICON_ID }), a('allowBackup', { bool: false })], [
      activity('ScreenActivity', true),
      activity('LoginActivity', false),
      activity('WebActivity', false),
      activity('SettingsActivity', false),
      activity('ItemsActivity', false),
    ]),
  ]);
  const files = new Map<string, Uint8Array>([
    ['AndroidManifest.xml', encodeAxml(manifest)],
    ['classes.dex', dex],
    ['resources.arsc', encodeArsc(o.packageName, iconFile)],
    [iconFile, icon],
    ...assets,
  ]);

  log('▶ Signature (JAR v1, clé générée sur l’appareil)');
  const signed = await signJar(files);
  const z: Zippable = {};
  for (const [name, data] of signed) z[name] = [data, { level: name === 'resources.arsc' || /\.(png|jpg|webp)$/.test(name) ? 0 : 6 }];
  const apk = zipSync(z);

  log('▶ Auto-vérification');
  const check2 = new MemZip(apk);
  const man = parseBinaryXml(check2.read('AndroidManifest.xml')!);
  const pkg = getAttr(man, 'package');
  const classes = new Dex(check2.read('classes.dex')!).classes.length;
  check('APK relisible par APPXRAY', !!pkg && classes > 0, `${(apk.length / 1024).toFixed(0)} Ko, ${classes} classes`);
  return { apk, package: pkg ? attrValue(pkg, {}) : o.packageName, classes, checks };
}

export { Buffer };
