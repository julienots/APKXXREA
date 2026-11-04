import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DATA } from './helpers.ts';

const { encodeAxml, encodeArsc } = await import('../../web/src/local/apkbuild.ts');
const { parseBinaryXml, parseResTable, toXmlText } = await import('../src/engines/res.ts');
const { zipSync } = await import('fflate');

test('on-device encoders: binary manifest + resources.arsc accepted by aapt2', () => {
  const a = (name: string, value: object) => ({ ns: true, name, value });
  const el = (name: string, attrs: object[] = [], children: object[] = []) => ({ name, attrs, children });
  const manifest = encodeAxml(el('manifest', [{ ns: false, name: 'package', value: { str: 'com.example.t' } }, a('versionCode', { int: 7 }), a('versionName', { str: '2.0' })], [
    el('uses-sdk', [a('minSdkVersion', { int: 24 }), a('targetSdkVersion', { int: 29 })]),
    el('application', [a('theme', { ref: 0x01030238 }), a('label', { str: 'Équipe' }), a('icon', { ref: 0x7f010000 })], [
      el('activity', [a('name', { str: 'io.appxray.runtime.ScreenActivity' }), a('exported', { bool: true })]),
    ]),
  ]) as never);
  const xml = toXmlText(parseBinaryXml(Buffer.from(manifest)), {});
  assert.match(xml, /package="com\.example\.t"/);
  assert.match(xml, /android:label="Équipe"/);
  assert.match(xml, /android:exported="true"/);
  const arsc = encodeArsc('com.example.t', 'res/mipmap/ic_launcher.png');
  const t = parseResTable(Buffer.from(arsc));
  assert.equal(t.entries.get(0x7f010000)?.values[0].value?.str, 'res/mipmap/ic_launcher.png');
  const aapt2 = path.resolve('..', 'tools/aapt2/aapt2');
  if (!fs.existsSync(aapt2)) return;
  const apk = path.join(DATA, 'enc.apk');
  fs.writeFileSync(apk, zipSync({ 'AndroidManifest.xml': manifest, 'resources.arsc': arsc, 'res/mipmap/ic_launcher.png': fs.readFileSync(path.resolve('..', 'web/public/icon-192.png')) }));
  const out = spawnSync(aapt2, ['dump', 'badging', apk], { encoding: 'utf8' }).stdout;
  assert.match(out, /package: name='com\.example\.t' versionCode='7' versionName='2\.0'/);
  assert.match(out, /launchable-activity|application-label:'Équipe'/);
});
