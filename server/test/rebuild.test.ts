import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DATA, MINIMAL } from './helpers.ts';

const { ensureDirs } = await import('../src/store.ts');
const { createAnalysis, runAnalysis } = await import('../src/engines/analyzer.ts');
const { generateProject, defaultOptions, validateOptions, androidText, saveStoredScreen } = await import('../src/engines/rebuild.ts');
const { startBuild, availableModes, getBuild, preflight } = await import('../src/engines/build.ts');
const { paths } = await import('../src/config.ts');
await ensureDirs();

test('android text escaping', () => {
  assert.equal(androidText("l'app"), "l\\'app");
  assert.equal(androidText('@home'), '\\@home');
  assert.equal(androidText('a<b'), 'a&lt;b');
});

test('option validation', () => {
  const o = defaultOptions();
  assert.deepEqual(validateOptions(o), []);
  assert.ok(validateOptions({ ...o, packageName: 'Bad Package' }).length > 0);
  assert.ok(validateOptions({ ...o, colors: { ...o.colors, primary: 'red' } }).length > 0);
});

test('generate + compile a project from an analysed APK', { timeout: 300_000 }, async (t) => {
  const up = path.join(DATA, 'min.apk');
  fs.copyFileSync(MINIMAL, up);
  const a = await runAnalysis((await createAnalysis(up, 'minimal.apk')).id);
  assert.equal(a.status, 'ready', a.error);
  // an assisted screen with a navigation action
  await saveStoredScreen(a.id, {
    key: 'assisted_home',
    origin: 'assisted',
    updatedAt: '',
    root: {
      uid: 'root', tag: 'LinearLayout', kind: 'linear', raw: {}, props: { width: 'match', height: 'match', orientation: 'vertical' },
      children: [{ uid: 'b', tag: 'Button', kind: 'button', raw: {}, viewId: 'go', props: { text: "C'est parti", onClick: { type: 'navigate', value: 'activity_main' } }, children: [] }],
    },
  });
  const opts = { ...defaultOptions(), analysisId: a.id, appName: 'Test Rebuild', packageName: 'com.example.testrebuild', screens: [{ key: 'activity_main' }, { key: 'assisted_home', launcher: true }], features: [{ id: 'login' as const }, { id: 'webview' as const, url: 'https://example.org' }] };
  const p = await generateProject(opts);
  const src = path.join(paths.project(p.id), 'src');
  const java = fs.readFileSync(path.join(src, 'app/src/main/java/com/example/testrebuild/AssistedHomeActivity.java'), 'utf8');
  assert.match(java, /new Intent\(AssistedHomeActivity\.this, MainActivity\.class\)/);
  const manifest = fs.readFileSync(path.join(src, 'app/src/main/AndroidManifest.xml'), 'utf8');
  assert.doesNotMatch(manifest, /package=/);
  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(fs.readFileSync(path.join(src, 'app/build.gradle.kts'), 'utf8'), /applicationId = "com\.example\.testrebuild"/);
  assert.ok((await preflight(src)).every((c) => c.ok), 'preflight passes');
  if (!availableModes().lite) return t.skip('lite toolchain not installed (npm run setup:tools)');
  const b = await startBuild(p.id, 'lite');
  let rec = await getBuild(b.id);
  for (let i = 0; i < 150 && rec && rec.status !== 'success' && rec.status !== 'failed'; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    rec = await getBuild(b.id);
  }
  assert.equal(rec?.status, 'success', JSON.stringify(rec?.errors));
  assert.equal(rec!.apk!.package, 'com.example.testrebuild');
  assert.ok(rec!.apk!.classes! >= 5);
  // the produced APK is itself analysable by APPXRAY
  const copy = path.join(DATA, 'built.apk');
  fs.copyFileSync(path.join(paths.build(b.id), 'app-debug.apk'), copy);
  const re = await runAnalysis((await createAnalysis(copy, 'built.apk')).id);
  assert.equal(re.package, 'com.example.testrebuild');
  assert.ok(re.components.some((c) => c.launcher && c.name.endsWith('AssistedHomeActivity')));
  assert.ok(re.signature!.v1Certs[0].subject.includes('APPXRAY'));
});
