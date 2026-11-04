/**
 * APK Builder. Two real toolchains:
 *  - "gradle": Android Gradle Plugin with a local Android SDK (full fidelity, needs network for Maven deps)
 *  - "lite":   aapt2 (Apktool's prebuilt) + javac + dx + jarsigner, fully offline, framework-only projects
 * Both run as sandboxed child processes; the produced APK is re-parsed by APPXRAY as a self-check.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { paths } from '../config.js';
import { readJson, writeJson } from '../store.js';
import { enqueue, log, Job } from '../jobs.js';
import { runSandboxed, toolPaths, toolStatus, androidSdkDir, jvmArgs, RunResult } from './tools.js';
import { inspectZip, readEntries } from './zip.js';
import { parseBinaryXml, getAttr, attrValue } from './res.js';
import { Dex } from './dex.js';

export interface BuildError { file?: string; line?: number; message: string; tool: string }
export interface BuildRecord {
  id: string;
  projectId: string;
  mode: 'gradle' | 'lite';
  status: 'queued' | 'running' | 'success' | 'failed';
  createdAt: string;
  endedAt?: string;
  durationMs?: number;
  jobId?: string;
  errors: BuildError[];
  checks: { name: string; ok: boolean; detail?: string }[];
  apk?: { file: string; size: number; sha256: string; package?: string; classes?: number };
}

export function availableModes() {
  const s = toolStatus();
  return {
    gradle: !!(s.androidSdk && s.gradle && s.java),
    lite: !!(s.aapt2 && s.frameworkRes && s.javac && s.androidStubs && s.dx && s.jarsigner && s.keytool),
    reasons: {
      gradle: !s.androidSdk ? 'Android SDK introuvable (ANDROID_HOME)' : !s.gradle ? 'Gradle introuvable' : undefined,
      lite: !s.aapt2 ? 'aapt2 manquant (npm run setup:tools)' : !s.androidStubs || !s.dx ? 'android-stubs/dx manquants (npm run setup:tools)' : !s.javac ? 'JDK (javac) manquant' : undefined,
    },
  };
}

const buildFile = (id: string) => path.join(paths.build(id), 'build.json');
export const getBuild = (id: string) => readJson<BuildRecord>(buildFile(id));

async function walkFiles(dir: string, filter: (f: string) => boolean, out: string[] = []): Promise<string[]> {
  for (const e of await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [] as fs.Dirent[])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walkFiles(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}

/** Static checks performed before invoking any compiler. */
export async function preflight(src: string): Promise<BuildRecord['checks']> {
  const checks: BuildRecord['checks'] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const manifest = path.join(src, 'app/src/main/AndroidManifest.xml');
  const mtxt = await fs.promises.readFile(manifest, 'utf8').catch(() => null);
  add('AndroidManifest.xml présent', !!mtxt);
  if (mtxt) {
    add('Manifest sans attribut package (namespace Gradle)', !/<manifest[^>]*\spackage=/.test(mtxt), 'AGP 8 refuse package= dans le manifest');
    add('Activité de lancement déclarée', /android\.intent\.category\.LAUNCHER/.test(mtxt));
    const declared = [...mtxt.matchAll(/<activity[^>]*android:name="\.([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
    const meta = await readJson<{ applicationId: string }>(path.join(src, 'appxray.json'));
    const javaRoot = path.join(src, 'app/src/main/java', (meta?.applicationId ?? '').replace(/\./g, '/'));
    const missing = declared.filter((c) => !fs.existsSync(path.join(javaRoot, c + '.java')) && !fs.existsSync(path.join(javaRoot, c + '.kt')));
    add('Classes des activités présentes', missing.length === 0, missing.length ? `Manquantes: ${missing.join(', ')}` : `${declared.length} activité(s)`);
  }
  const meta = await readJson<Record<string, unknown>>(path.join(src, 'appxray.json'));
  add('appxray.json (applicationId, versions)', !!meta?.applicationId);
  const resRoot = path.join(src, 'app/src/main/res');
  const resFiles = await walkFiles(resRoot, () => true);
  const bad = resFiles.filter((f) => {
    const base = path.basename(f).replace(/\.9\.png$/, '.png');
    return !/^[a-z0-9_]+\.[a-z0-9]+$/.test(base) && !path.relative(resRoot, f).startsWith('values');
  });
  add('Noms de ressources valides ([a-z0-9_])', bad.length === 0, bad.slice(0, 5).map((f) => path.relative(src, f)).join(', ') || `${resFiles.length} fichiers`);
  const java = await walkFiles(path.join(src, 'app/src/main/java'), (f) => f.endsWith('.java') || f.endsWith('.kt'));
  add('Sources présentes', java.length > 0, `${java.length} fichier(s)`);
  const kt = java.filter((f) => f.endsWith('.kt'));
  if (kt.length) add('Sources Kotlin', true, 'Compilables uniquement en mode Gradle');
  const big = resFiles.filter((f) => fs.statSync(f).size > 20 * 1024 * 1024);
  add('Pas de ressource > 20 Mo', big.length === 0, big.map((f) => path.basename(f)).join(', '));
  return checks;
}

function parseErrors(line: string, tool: string, src: string): BuildError | null {
  const m = /^(.+?\.(?:xml|java|kt|png|webp|kts)):(\d+)(?::\d+)?:\s*(?:error|e):\s*(.+)$/i.exec(line) ?? /^(?:e:\s*)?(?:file:\/\/)?(.+?\.(?:java|kt|kts)):(\d+):\d+\s+(.+)$/.exec(line);
  if (m) return { file: path.isAbsolute(m[1]) ? path.relative(src, m[1]) : m[1], line: +m[2], message: m[3], tool };
  const m2 = /^(?:error|ERROR):\s*(.+)$/.exec(line) ?? /^(.+?\.xml): error: (.+)$/.exec(line);
  if (m2) return { message: m2[m2.length - 1], tool };
  if (/^(FAILURE|> Task .* FAILED|What went wrong)/.test(line)) return { message: line, tool };
  return null;
}

async function ensureKeystore(job: Job): Promise<{ ks: string; pass: string }> {
  const ks = paths.keystore();
  const pf = ks + '.pass';
  if (fs.existsSync(ks) && fs.existsSync(pf)) return { ks, pass: (await fs.promises.readFile(pf, 'utf8')).trim() };
  const pass = crypto.randomBytes(18).toString('base64url');
  await fs.promises.mkdir(path.dirname(ks), { recursive: true, mode: 0o700 });
  await fs.promises.writeFile(pf, pass, { mode: 0o600 });
  log(job, '• Génération du keystore de débogage APPXRAY (RSA 2048, propre à cette installation)');
  const r = await runSandboxed('keytool', ['-genkeypair', '-keystore', ks, '-storetype', 'PKCS12', '-storepass', pass, '-keypass', pass, '-alias', 'appxray', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=APPXRAY Debug, O=APPXRAY'], { cwd: path.dirname(ks), onLine: (l) => log(job, l) });
  if (r.code !== 0) throw new Error('keytool a échoué');
  await fs.promises.chmod(ks, 0o600);
  return { ks, pass };
}

export async function startBuild(projectId: string, mode: 'gradle' | 'lite'): Promise<BuildRecord> {
  const modes = availableModes();
  if (!modes[mode]) throw Object.assign(new Error(`Mode ${mode} indisponible : ${modes.reasons[mode]}`), { status: 409 });
  const src = path.join(paths.project(projectId), 'src');
  if (!fs.existsSync(src)) throw Object.assign(new Error('Projet introuvable'), { status: 404 });
  const id = crypto.randomBytes(9).toString('base64url');
  const bdir = paths.build(id);
  await fs.promises.mkdir(bdir, { recursive: true });
  const rec: BuildRecord = { id, projectId, mode, status: 'queued', createdAt: new Date().toISOString(), errors: [], checks: [] };
  await writeJson(buildFile(id), rec);
  const job = enqueue('build', projectId, `Compilation ${mode === 'gradle' ? 'Gradle' : 'lite'} du projet`, async (j, ctl) => {
    rec.status = 'running';
    rec.jobId = j.id;
    await writeJson(buildFile(id), rec);
    const started = Date.now();
    try {
      log(j, '▶ Vérifications préalables');
      rec.checks = await preflight(src);
      for (const c of rec.checks) log(j, `  ${c.ok ? '✔' : '✖'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
      const blocking = rec.checks.filter((c) => !c.ok && !/Kotlin/.test(c.name));
      if (blocking.length) throw new Error(`${blocking.length} vérification(s) bloquante(s)`);
      const work = path.join(bdir, 'work');
      await fs.promises.rm(work, { recursive: true, force: true });
      await fs.promises.mkdir(work, { recursive: true });
      const apkOut = path.join(bdir, 'app-debug.apk');
      if (mode === 'lite') await buildLite(j, ctl, src, work, apkOut, rec);
      else await buildGradle(j, ctl, src, work, apkOut, rec);
      // Self-check: the APK must be parseable by our own analyzer.
      log(j, '▶ Auto-vérification de l’APK produit');
      const inv = await inspectZip(apkOut);
      const blobs = await readEntries(apkOut, (n) => n === 'AndroidManifest.xml' || /^classes\d*\.dex$/.test(n));
      const man = parseBinaryXml(blobs.get('AndroidManifest.xml')!);
      const pkg = getAttr(man, 'package');
      const classes = [...blobs].filter(([n]) => n.endsWith('.dex')).reduce((s, [, b]) => s + new Dex(b).classes.length, 0);
      const buf = await fs.promises.readFile(apkOut);
      rec.apk = { file: 'app-debug.apk', size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), package: pkg ? attrValue(pkg, {}) : undefined, classes };
      log(j, `✔ APK valide : ${inv.entries.length} entrées, ${classes} classes, package ${rec.apk.package}, ${(buf.length / 1024).toFixed(0)} Ko`);
      rec.status = 'success';
    } catch (e) {
      rec.status = 'failed';
      log(j, `✖ ${(e as Error).message}`);
      if (!rec.errors.length) rec.errors.push({ message: (e as Error).message, tool: 'appxray' });
      throw e;
    } finally {
      rec.endedAt = new Date().toISOString();
      rec.durationMs = Date.now() - started;
      await writeJson(buildFile(id), rec);
      await fs.promises.writeFile(path.join(bdir, 'build.log'), j.log.join('\n'));
      await fs.promises.rm(path.join(bdir, 'work'), { recursive: true, force: true }).catch(() => {});
    }
  });
  rec.jobId = job.id;
  await writeJson(buildFile(id), rec);
  return rec;
}

async function step(j: Job, ctl: AbortController, rec: BuildRecord, src: string, label: string, tool: string, cmd: string, args: string[], cwd: string, network = false, env?: Record<string, string>): Promise<RunResult> {
  log(j, `▶ ${label}`);
  const r = await runSandboxed(cmd, args, {
    cwd,
    network,
    env,
    signal: ctl.signal,
    onLine: (l) => {
      log(j, '  ' + l);
      const e = parseErrors(l.trim(), tool, src);
      if (e && rec.errors.length < 200) rec.errors.push(e);
    },
  });
  if (r.timedOut) throw new Error(`${label} : délai dépassé`);
  if (r.code !== 0) throw new Error(`${label} : échec (code ${r.code})`);
  log(j, `  ✔ ${(r.durationMs / 1000).toFixed(1)} s`);
  return r;
}

async function buildLite(j: Job, ctl: AbortController, src: string, work: string, apkOut: string, rec: BuildRecord) {
  const T = toolPaths();
  const meta = (await readJson<{ applicationId: string; versionCode: number; versionName: string; minSdk: number; liteTargetSdk?: number }>(path.join(src, 'appxray.json')))!;
  const main = path.join(src, 'app/src/main');
  const kt = await walkFiles(path.join(main, 'java'), (f) => f.endsWith('.kt'));
  if (kt.length) throw new Error('Le mode lite ne compile pas Kotlin : utilisez le mode Gradle (Android SDK requis).');
  // Manifest with injected package (AGP-style namespace)
  const manifest = (await fs.promises.readFile(path.join(main, 'AndroidManifest.xml'), 'utf8')).replace(/<manifest(\s)/, `<manifest package="${meta.applicationId}"$1`);
  await fs.promises.writeFile(path.join(work, 'AndroidManifest.xml'), manifest);
  await step(j, ctl, rec, src, 'aapt2 compile (ressources)', 'aapt2', T.aapt2, ['compile', '--dir', path.join(main, 'res'), '-o', path.join(work, 'res.zip')], work);
  const linkArgs = ['link', '-o', path.join(work, 'base.apk'), '-I', T.frameworkJar, '--manifest', path.join(work, 'AndroidManifest.xml'), '--java', path.join(work, 'gen'), '--min-sdk-version', String(meta.minSdk), '--target-sdk-version', String(meta.liteTargetSdk ?? 29), '--version-code', String(meta.versionCode), '--version-name', meta.versionName, '--auto-add-overlay', '--no-version-vectors'];
  if (fs.existsSync(path.join(main, 'assets'))) linkArgs.push('-A', path.join(main, 'assets'));
  linkArgs.push(path.join(work, 'res.zip'));
  await step(j, ctl, rec, src, 'aapt2 link (manifest + R.java + resources.arsc)', 'aapt2', T.aapt2, linkArgs, work);
  const sources = [...(await walkFiles(path.join(main, 'java'), (f) => f.endsWith('.java'))), ...(await walkFiles(path.join(work, 'gen'), (f) => f.endsWith('.java')))];
  await fs.promises.writeFile(path.join(work, 'sources.txt'), sources.map((s) => `"${s.replace(/\\/g, '/')}"`).join('\n'));
  await fs.promises.mkdir(path.join(work, 'classes'), { recursive: true });
  await step(j, ctl, rec, src, `javac (${sources.length} fichiers)`, 'javac', 'javac', ['-J-Xmx1g', '--release', '8', '-encoding', 'UTF-8', '-nowarn', '-Xlint:none', '-cp', fs.existsSync(T.androidAll) ? T.androidAll : T.androidStubs, '-d', path.join(work, 'classes'), '@' + path.join(work, 'sources.txt')], work);
  await step(j, ctl, rec, src, 'dx (bytecode → DEX)', 'dx', 'java', [...jvmArgs(), '-cp', T.dxJar, 'com.android.dx.command.Main', '--dex', `--min-sdk-version=${Math.min(meta.minSdk, 25)}`, `--output=${path.join(work, 'classes.dex')}`, path.join(work, 'classes')], work);
  await step(j, ctl, rec, src, 'Assemblage de l’APK', 'zip', 'zip', ['-j', '-q', path.join(work, 'base.apk'), path.join(work, 'classes.dex')], work);
  const { ks, pass } = await ensureKeystore(j);
  await step(j, ctl, rec, src, 'Signature (jarsigner, schéma v1, keystore APPXRAY)', 'jarsigner', 'jarsigner', ['-keystore', ks, '-storepass', pass, '-sigalg', 'SHA256withRSA', '-digestalg', 'SHA-256', '-signedjar', apkOut, path.join(work, 'base.apk'), 'appxray'], work);
  log(j, `ℹ Mode lite : targetSdk ${meta.liteTargetSdk ?? 29}, signature v1. Installable pour tests (adb install). Pour une publication, compilez en mode Gradle.`);
}

async function buildGradle(j: Job, ctl: AbortController, src: string, work: string, apkOut: string, rec: BuildRecord) {
  const sdk = androidSdkDir()!;
  const proj = path.join(work, 'project');
  await fs.promises.cp(src, proj, { recursive: true, filter: (s) => !s.includes(`${path.sep}reference${path.sep}`) });
  await fs.promises.writeFile(path.join(proj, 'local.properties'), `sdk.dir=${sdk}\n`);
  const gradleHome = path.join(paths.builds(), '..', 'gradle-home');
  await fs.promises.mkdir(gradleHome, { recursive: true });
  log(j, 'ℹ Mode Gradle : accès réseau autorisé uniquement pour télécharger les dépendances Maven du projet.');
  await step(j, ctl, rec, src, 'gradle assembleDebug', 'gradle', 'gradle', ['-p', proj, 'assembleDebug', '--no-daemon', '--console=plain', '--stacktrace', '-g', gradleHome], proj, true, { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, GRADLE_OPTS: '-Xmx2g' });
  const out = path.join(proj, 'app/build/outputs/apk/debug/app-debug.apk');
  if (!fs.existsSync(out)) throw new Error('APK introuvable après Gradle');
  await fs.promises.copyFile(out, apkOut);
}
