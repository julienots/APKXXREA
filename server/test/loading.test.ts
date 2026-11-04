import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DATA, FIX } from './helpers.ts';

const { ensureDirs } = await import('../src/store.ts');
const { createAnalysis, runAnalysis, load } = await import('../src/engines/analyzer.ts');
const { projectDefaults } = await import('../src/engines/project-defaults.ts');
const { generateProject } = await import('../src/engines/rebuild.ts');
const { startBuild, availableModes, getBuild } = await import('../src/engines/build.ts');
const { paths } = await import('../src/config.ts');
await ensureDirs();

async function analyse(name: string) {
  const up = path.join(DATA, name);
  fs.copyFileSync(path.join(FIX, name), up);
  const a = await runAnalysis((await createAnalysis(up, name)).id);
  assert.equal(a.status, 'ready', a.error);
  return load(a.id);
}

test('download/splash launcher screen is detected and chained to the real home screen', { timeout: 300_000 }, async (t) => {
  const L = await analyse('loader-with-main.apk');
  const d = await projectDefaults(L, []);
  const dl = d.candidates.find((c) => c.key === 'activity_download')!;
  assert.equal(dl.loading, true);
  assert.equal(d.candidates.find((c) => c.key === 'activity_main')!.loading, false);
  const spec = d.options.screens.find((s) => s.key === 'activity_download')!;
  assert.equal(spec.launcher, true);
  assert.equal(spec.next, 'activity_main');
  assert.ok(d.warnings.some((w) => /enchaînera automatiquement/.test(w)));
  // Generated Java moves on automatically, and compiles.
  const p = await generateProject({ ...d.options, packageName: 'com.example.chain' });
  const java = fs.readFileSync(path.join(paths.project(p.id), 'src/app/src/main/java/com/example/chain/DownloadActivity.java'), 'utf8');
  assert.match(java, /postDelayed[\s\S]*new Intent\(DownloadActivity\.this, MainActivity\.class\)[\s\S]*2000\)/);
  if (!availableModes().lite) return t.skip('lite toolchain absent');
  const b = await startBuild(p.id, 'lite');
  let rec = await getBuild(b.id);
  for (let i = 0; i < 150 && rec && rec.status !== 'success' && rec.status !== 'failed'; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    rec = await getBuild(b.id);
  }
  assert.equal(rec?.status, 'success', JSON.stringify(rec?.errors));
});

test('launcher download screen with no other XML screen produces an explicit warning', async () => {
  const L = await analyse('loader-only.apk');
  const d = await projectDefaults(L, []);
  assert.equal(d.candidates.find((c) => c.key === 'activity_download')!.loading, true);
  assert.ok(d.warnings.some((w) => /aucun autre écran XML/.test(w)));
  assert.equal(d.options.screens.find((s) => s.key === 'activity_download')?.next, undefined);
});
