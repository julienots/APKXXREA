import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DATA, MINIMAL, SETTINGS, hasSettings, makeZip, tmpFile } from './helpers.ts';

const { inspectZip, readEntry, extractTo, ZipSafetyError } = await import('../src/engines/zip.ts');
const { parseResTable, parseBinaryXml, toXmlText, loadFramework, frameworkAttrName } = await import('../src/engines/res.ts');
const { Dex, classRefs } = await import('../src/engines/dex.ts');
const { pkcs7Certificates, inspectSignatures } = await import('../src/engines/signature.ts');
const { redact, secretKind, obfuscationScore } = await import('../src/engines/detect.ts');
const { ensureDirs } = await import('../src/store.ts');
await ensureDirs();

describe('zip safety', () => {
  test('rejects a decompression bomb by ratio', async () => {
    const bomb = tmpFile('bomb.zip', makeZip([{ name: 'AndroidManifest.xml', data: Buffer.alloc(64 * 1024 * 1024), deflate: true }]));
    await assert.rejects(inspectZip(bomb), (e: Error) => e instanceof ZipSafetyError && /compression/i.test(e.message));
  });
  test('flags and skips path traversal entries on extraction', async () => {
    const z = tmpFile('trav.zip', makeZip([{ name: '../../evil.txt', data: Buffer.from('x') }, { name: 'ok/file.txt', data: Buffer.from('fine') }]));
    const inv = await inspectZip(z);
    assert.equal(inv.entries.find((e) => e.name.includes('evil'))?.unsafeName, true);
    assert.ok(inv.warnings.some((w) => /dangereux/.test(w)));
    const out = path.join(DATA, 'extract');
    const n = await extractTo(z, out);
    assert.equal(n, 1);
    assert.ok(fs.existsSync(path.join(out, 'ok/file.txt')));
    assert.ok(!fs.existsSync(path.join(DATA, '..', 'evil.txt')));
  });
  test('rejects non-zip input', async () => {
    await assert.rejects(inspectZip(tmpFile('x.apk', Buffer.from('not a zip at all'))), ZipSafetyError);
  });
});

describe('binary formats (minimal.apk built by APPXRAY lite toolchain)', () => {
  test('decodes manifest, resources and dex', async () => {
    const man = (await readEntry(MINIMAL, 'AndroidManifest.xml'))!;
    const arsc = (await readEntry(MINIMAL, 'resources.arsc'))!;
    const dex = (await readEntry(MINIMAL, 'classes.dex'))!;
    const table = parseResTable(arsc);
    assert.equal(table.packages[0].name, 'com.demo.app');
    const appName = table.byName.get('string/app_name')!;
    assert.equal(table.entries.get(appName)!.values[0].value!.str, 'Demo');
    const color = table.entries.get(table.byName.get('color/primary')!)!.values[0].value!;
    assert.equal(color.data >>> 0, 0xff0055ff);
    const framework = await loadFramework();
    const r = { app: table, framework };
    const xml = toXmlText(parseBinaryXml(man, frameworkAttrName(r)), r);
    assert.match(xml, /package="com\.demo\.app"/);
    assert.match(xml, /android:label="@string\/app_name"/);
    assert.match(xml, /android\.intent\.category\.LAUNCHER/);
    const layout = toXmlText(parseBinaryXml((await readEntry(MINIMAL, 'res/layout/activity_main.xml'))!, frameworkAttrName(r)), r);
    if (framework) assert.match(layout, /android:orientation="vertical"/, 'enum attribute decoded via framework attrs');
    assert.match(layout, /android:textColor="@color\/primary"/);
    const d = new Dex(dex);
    const main = d.classes.find((c) => c.name === 'com.demo.app.MainActivity')!;
    assert.equal(main.superName, 'android.app.Activity');
    const refs = classRefs(d, main);
    assert.ok([...refs.invokes].some((i) => i.endsWith('.setContentView')));
    const layoutId = table.byName.get('layout/activity_main')!;
    assert.ok(refs.literals.has(layoutId) || refs.resFields.has('layout/activity_main'), 'layout reference detected in bytecode');
    assert.match(d.disassemble(main), /invoke-virtual .*setContentView/);
  });
  test('reads v1 signature certificates', async () => {
    const rsa = (await readEntry(MINIMAL, 'META-INF/APPXRAY.RSA'))!;
    assert.equal(pkcs7Certificates(rsa).length, 1);
    const info = await inspectSignatures(MINIMAL, new Map([['META-INF/APPXRAY.RSA', rsa]]));
    assert.deepEqual(info.schemes, ['v1 (JAR)']);
    assert.match(info.v1Certs[0].subject, /APPXRAY Debug/);
  });
});

describe('detection helpers', () => {
  test('secrets are recognised and masked', () => {
    const key = 'AIza' + 'S'.repeat(35);
    assert.equal(secretKind(`k=${key}`), 'Google API key');
    assert.ok(!redact(`k=${key}`).includes(key));
  });
  test('obfuscation score', () => {
    const minified = ['com.x.a', 'com.x.b', 'com.x.c', 'com.x.a.b', 'com.x.d', 'com.x.e', 'com.x.f', 'com.x.g', 'com.x.h', 'com.x.i'];
    assert.equal(obfuscationScore(minified, 'com.x').level, 'forte');
    assert.equal(obfuscationScore(['com.x.MainActivity', 'com.x.LoginActivity'], 'com.x').level, 'faible');
  });
});

describe('real-world APK (Appium Settings)', { skip: !hasSettings && 'run scripts/fetch-test-apk.sh' }, () => {
  test('full analysis pipeline', async () => {
    const { createAnalysis, runAnalysis, load } = await import('../src/engines/analyzer.ts');
    const { screenGraph, layoutTree } = await import('../src/engines/ui.ts');
    const up = path.join(DATA, 'upload.apk');
    fs.copyFileSync(SETTINGS, up);
    const a0 = await createAnalysis(up, 'settings.apk');
    const a = await runAnalysis(a0.id);
    assert.equal(a.status, 'ready', a.error);
    assert.equal(a.package, 'io.appium.settings');
    assert.equal(a.appLabel, 'Appium Settings');
    assert.equal(a.minSdk, '26');
    assert.equal(a.dex.files.length, 10);
    assert.ok(a.dex.classes > 5000);
    assert.ok(a.signature!.schemes.includes('v2'));
    assert.ok(a.libraries.some((l) => l.id === 'kotlin'));
    assert.ok(a.components.some((c) => c.launcher && c.name === 'io.appium.settings.Settings'));
    const L = await load(a.id);
    const g = screenGraph(L);
    assert.deepEqual(g.screens.find((s) => s.name === 'io.appium.settings.Settings')!.layouts, ['main']);
    const t = await layoutTree(L, 'main');
    assert.equal(t!.root.kind, 'relative');
    assert.ok(t!.root.children.length > 0);
  });
});
