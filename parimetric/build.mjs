// Builds dist/parimetric.apk without aapt2: binary manifest + resources.arsc are written here
// (same encoders as web/src/local/apkbuild.ts), then javac -> dx -> zip -> jarsigner (v1, valid for targetSdk 29).
// Requires ./tools/android/{android-all-29.jar,dx.jar} (npm run setup:tools) and a JDK.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const T = path.join(ROOT, 'tools', 'android');
const OUT = path.join(ROOT, 'dist');
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'parimetric-'));
const cfg = { pkg: 'com.parimetric.app', label: 'Parimetric', versionCode: 1, versionName: '1.0.0', minSdk: 24, targetSdk: 29 };

const ID = { theme: 0x01010000, label: 0x01010001, icon: 0x01010002, name: 0x01010003, exported: 0x01010010, configChanges: 0x0101001f, screenOrientation: 0x0101001e, minSdkVersion: 0x0101020c, versionCode: 0x0101021b, versionName: 0x0101021c, windowSoftInputMode: 0x0101022b, targetSdkVersion: 0x01010270, allowBackup: 0x01010280, hardwareAccelerated: 0x010102d3 };
const THEME_MATERIAL_NOACTIONBAR = 0x0103022e;
const ICON_ID = 0x7f010000;
const enc = new TextEncoder();

class Wr {
  constructor() { this.p = []; }
  u8(v) { this.p.push(v & 0xff); return this; }
  u16(v) { return this.u8(v).u8(v >>> 8); }
  u32(v) { return this.u16(v & 0xffff).u16(v >>> 16); }
  bytes(b) { for (const x of b) this.p.push(x); return this; }
  pad4() { while (this.p.length % 4) this.p.push(0); return this; }
  get length() { return this.p.length; }
  out() { return Uint8Array.from(this.p); }
}
const concat = (arr) => Buffer.concat(arr.map((a) => Buffer.from(a)));

function stringPool(strings) {
  const data = new Wr();
  const offsets = [];
  const len = (w, n) => (n > 0x7f ? w.u8(((n >> 8) & 0x7f) | 0x80).u8(n & 0xff) : w.u8(n));
  for (const s of strings) {
    offsets.push(data.length);
    const b = enc.encode(s);
    len(data, s.length); len(data, b.length); data.bytes(b).u8(0);
  }
  data.pad4();
  const body = data.out();
  const start = 28 + strings.length * 4;
  const w = new Wr().u16(1).u16(28).u32(start + body.length).u32(strings.length).u32(0).u32(0x100).u32(start).u32(0);
  for (const o of offsets) w.u32(o);
  return w.bytes(body).out();
}

const el = (name, attrs = [], children = []) => ({ name, attrs, children });
const a = (name, value) => ({ ns: true, name, value });

function encodeAxml(root) {
  const NS = 'http://schemas.android.com/apk/res/android';
  const res = new Set();
  (function walk(e) { e.attrs.forEach((x) => x.ns && res.add(x.name)); e.children.forEach(walk); })(root);
  const resList = [...res].sort((x, y) => ID[x] - ID[y]);
  const pool = [...resList];
  const idx = (s) => { let i = pool.indexOf(s); if (i < 0) i = pool.push(s) - 1; return i; };
  idx('android'); idx(NS);
  (function collect(e) { idx(e.name); for (const x of e.attrs) { idx(x.name); if ('str' in x.value) idx(x.value.str); } e.children.forEach(collect); })(root);
  const n = new Wr();
  n.u16(0x0100).u16(16).u32(24).u32(1).u32(0xffffffff).u32(idx('android')).u32(idx(NS));
  (function emit(e) {
    const attrs = [...e.attrs].sort((x, y) => (x.ns ? ID[x.name] : -1) - (y.ns ? ID[y.name] : -1));
    n.u16(0x0102).u16(16).u32(36 + 20 * attrs.length).u32(1).u32(0xffffffff);
    n.u32(0xffffffff).u32(idx(e.name)).u16(20).u16(20).u16(attrs.length).u16(0).u16(0).u16(0);
    for (const x of attrs) {
      n.u32(x.ns ? idx(NS) : 0xffffffff).u32(idx(x.name));
      const v = x.value;
      if ('str' in v) n.u32(idx(v.str)).u16(8).u8(0).u8(0x03).u32(idx(v.str));
      else if ('int' in v) n.u32(0xffffffff).u16(8).u8(0).u8(0x10).u32(v.int >>> 0);
      else if ('hex' in v) n.u32(0xffffffff).u16(8).u8(0).u8(0x11).u32(v.hex >>> 0);
      else if ('bool' in v) n.u32(0xffffffff).u16(8).u8(0).u8(0x12).u32(v.bool ? 0xffffffff : 0);
      else n.u32(0xffffffff).u16(8).u8(0).u8(0x01).u32(v.ref >>> 0);
    }
    e.children.forEach(emit);
    n.u16(0x0103).u16(16).u32(24).u32(1).u32(0xffffffff).u32(0xffffffff).u32(idx(e.name));
  })(root);
  n.u16(0x0101).u16(16).u32(24).u32(1).u32(0xffffffff).u32(idx('android')).u32(idx(NS));
  const sp = stringPool(pool);
  const map = new Wr().u16(0x0180).u16(8).u32(8 + resList.length * 4);
  for (const r of resList) map.u32(ID[r]);
  const body = [sp, map.out(), n.out()];
  const size = 8 + body.reduce((s, b) => s + b.length, 0);
  return concat([new Wr().u16(3).u16(8).u32(size).out(), ...body]);
}

function encodeArsc(pkg, iconPath) {
  const global = stringPool([iconPath]);
  const typeStrings = stringPool(['mipmap']);
  const keyStrings = stringPool(['ic_launcher']);
  const spec = new Wr().u16(0x0202).u16(16).u32(20).u8(1).u8(0).u16(0).u32(1).u32(0).out();
  const cfgSize = 64, typeHeader = 20 + cfgSize, entriesStart = typeHeader + 4;
  const t = new Wr().u16(0x0201).u16(typeHeader).u32(entriesStart + 16).u8(1).u8(0).u16(0).u32(1).u32(entriesStart);
  t.u32(cfgSize); for (let i = 4; i < cfgSize; i++) t.u8(0);
  t.u32(0); t.u16(8).u16(0).u32(0); t.u16(8).u8(0).u8(0x03).u32(0);
  const typeChunk = t.out();
  const name = new Uint8Array(256);
  for (let i = 0; i < Math.min(pkg.length, 127); i++) { name[i * 2] = pkg.charCodeAt(i) & 0xff; name[i * 2 + 1] = pkg.charCodeAt(i) >> 8; }
  const ph = 288;
  const pkgSize = ph + typeStrings.length + keyStrings.length + spec.length + typeChunk.length;
  const head = new Wr().u16(0x0200).u16(ph).u32(pkgSize).u32(0x7f).bytes(name).u32(ph).u32(1).u32(ph + typeStrings.length).u32(1).u32(0).out();
  const pkgChunk = concat([head, typeStrings, keyStrings, spec, typeChunk]);
  return concat([new Wr().u16(2).u16(12).u32(12 + global.length + pkgChunk.length).u32(1).out(), global, pkgChunk]);
}

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString();
const step = (s) => console.log('> ' + s);

step('Manifest binaire + resources.arsc');
const manifest = el('manifest', [{ ns: false, name: 'package', value: { str: cfg.pkg } }, a('versionCode', { int: cfg.versionCode }), a('versionName', { str: cfg.versionName })], [
  el('uses-sdk', [a('minSdkVersion', { int: cfg.minSdk }), a('targetSdkVersion', { int: cfg.targetSdk })]),
  el('uses-permission', [a('name', { str: 'android.permission.INTERNET' })]),
  el('application', [a('theme', { ref: THEME_MATERIAL_NOACTIONBAR }), a('label', { str: cfg.label }), a('icon', { ref: ICON_ID }), a('allowBackup', { bool: false }), a('hardwareAccelerated', { bool: true })], [
    el('activity', [a('name', { str: cfg.pkg + '.MainActivity' }), a('exported', { bool: true }), a('configChanges', { hex: 0x04a0 | 0x0800 | 0x0100 }), a('windowSoftInputMode', { hex: 0x10 })], [
      el('intent-filter', [], [el('action', [a('name', { str: 'android.intent.action.MAIN' })]), el('category', [a('name', { str: 'android.intent.category.LAUNCHER' })])]),
    ]),
  ]),
]);
const iconFile = 'res/mipmap/ic_launcher.png';

step('javac');
const classes = path.join(W, 'classes');
fs.mkdirSync(classes);
const srcs = [];
(function find(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? find(p) : p.endsWith('.java') && srcs.push(p); } })(path.join(HERE, 'src'));
run('javac', ['--release', '8', '-encoding', 'UTF-8', '-nowarn', '-cp', path.join(T, 'android-all-29.jar'), '-d', classes, ...srcs]);

step('dx');
run('java', ['-cp', path.join(T, 'dx.jar'), 'com.android.dx.command.Main', '--dex', '--min-sdk-version=24', '--output=' + path.join(W, 'classes.dex'), classes]);

step('zip');
const stage = path.join(W, 'apk');
fs.mkdirSync(path.join(stage, 'res', 'mipmap'), { recursive: true });
fs.writeFileSync(path.join(stage, 'AndroidManifest.xml'), encodeAxml(manifest));
fs.writeFileSync(path.join(stage, 'resources.arsc'), encodeArsc(cfg.pkg, iconFile));
fs.copyFileSync(path.join(W, 'classes.dex'), path.join(stage, 'classes.dex'));
fs.copyFileSync(path.join(HERE, 'icon.png'), path.join(stage, iconFile));
fs.cpSync(path.join(HERE, 'assets'), path.join(stage, 'assets'), { recursive: true });
const unsigned = path.join(W, 'unsigned.apk');
run('zip', ['-q', '-r', '-0', unsigned, 'resources.arsc'], { cwd: stage });
run('zip', ['-q', '-r', '-D', '-9', unsigned, 'AndroidManifest.xml', 'classes.dex', 'res', 'assets'], { cwd: stage });

step('jarsigner');
const ks = process.env.PARIMETRIC_KEYSTORE || path.join(HERE, 'release.p12');
const passFile = ks + '.pass';
if (!fs.existsSync(ks)) {
  fs.writeFileSync(passFile, Buffer.from(Array.from({ length: 18 }, () => Math.floor(Math.random() * 256))).toString('hex'), { mode: 0o600 });
  const pw = fs.readFileSync(passFile, 'utf8');
  run('keytool', ['-genkeypair', '-keystore', ks, '-storetype', 'PKCS12', '-storepass', pw, '-keypass', pw, '-alias', 'parimetric', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Parimetric, O=Parimetric']);
}
const pw = fs.readFileSync(passFile, 'utf8');
fs.mkdirSync(OUT, { recursive: true });
const apk = path.join(OUT, 'parimetric.apk');
run('jarsigner', ['-keystore', ks, '-storepass', pw, '-sigalg', 'SHA256withRSA', '-digestalg', 'SHA-256', '-signedjar', apk, unsigned, 'parimetric']);
console.log(run('jarsigner', ['-verify', apk]).split('\n').find((l) => /verified/.test(l)) || '');
fs.rmSync(W, { recursive: true, force: true });
console.log(`OK ${apk} (${(fs.statSync(apk).size / 1024).toFixed(0)} Ko)`);
