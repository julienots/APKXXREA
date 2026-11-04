/** JADX (DEX → Java) and Apktool (resources + smali) adapters, executed in the sandbox runner. */
import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../config.js';
import { readJson, writeJson, getSettings } from '../store.js';
import { enqueue, log, Job, listJobs } from '../jobs.js';
import { runSandboxed, toolPaths, toolStatus, jvmArgs } from './tools.js';

export interface DecompileState {
  jadx?: { status: string; at: string; durationMs?: number; javaFiles?: number; errors?: number; jobId?: string; isolated?: unknown };
  apktool?: { status: string; at: string; durationMs?: number; smaliFiles?: number; jobId?: string; isolated?: unknown };
}

const stateFile = (id: string) => path.join(paths.analysis(id), 'decompile.json');
export const jadxDir = (id: string) => path.join(paths.analysis(id), 'jadx');
export const apktoolDir = (id: string) => path.join(paths.analysis(id), 'apktool');

export async function getDecompileState(id: string): Promise<DecompileState> {
  return (await readJson<DecompileState>(stateFile(id))) ?? {};
}
async function patch(id: string, p: Partial<DecompileState>) {
  const s = await getDecompileState(id);
  await writeJson(stateFile(id), { ...s, ...p });
}

async function countFiles(dir: string, ext: string): Promise<number> {
  let n = 0;
  const walk = async (d: string) => {
    for (const e of await fs.promises.readdir(d, { withFileTypes: true }).catch(() => [] as fs.Dirent[])) {
      if (e.isDirectory()) await walk(path.join(d, e.name));
      else if (e.name.endsWith(ext)) n++;
    }
  };
  await walk(dir);
  return n;
}

export async function startDecompile(id: string, which: ('jadx' | 'apktool')[] = ['jadx', 'apktool']): Promise<Job[]> {
  const st = toolStatus();
  const out: Job[] = [];
  const active = listJobs((j) => j.target === id && (j.status === 'queued' || j.status === 'running')).map((j) => j.type);
  const apk = path.join(paths.analysis(id), 'original.apk');
  const work = path.join(paths.analysis(id), 'work');
  await fs.promises.mkdir(work, { recursive: true });
  const { jadxThreads } = await getSettings();

  if (which.includes('jadx') && st.jadx && !active.includes('jadx')) {
    const job = enqueue('jadx', id, 'Décompilation JADX (DEX → Java)', async (j, ctl) => {
      await patch(id, { jadx: { status: 'running', at: new Date().toISOString(), jobId: j.id } });
      await fs.promises.rm(jadxDir(id), { recursive: true, force: true });
      let errors = 0;
      const r = await runSandboxed(
        'java',
        [...jvmArgs(), '-cp', path.join(toolPaths().jadxLib, '*'), 'jadx.cli.JadxCLI', '-d', jadxDir(id), '--no-res', '--show-bad-code', '-j', String(jadxThreads), '--log-level', 'progress', apk],
        {
          cwd: work,
          signal: ctl.signal,
          onLine: (l) => {
            if (/ERROR/.test(l)) errors++;
            if (!/^INFO\s+-\s+progress/.test(l) || j.log.length < 5) log(j, l);
          },
        },
      );
      const javaFiles = await countFiles(path.join(jadxDir(id), 'sources'), '.java');
      log(j, `→ ${javaFiles} fichiers Java générés en ${(r.durationMs / 1000).toFixed(1)} s (réseau isolé: ${r.isolated.network ? 'oui' : 'non'})`);
      // JADX exits non-zero when some methods fail to decompile: that's partial success, not failure.
      const ok = javaFiles > 0 && !r.timedOut;
      await patch(id, { jadx: { status: ok ? (r.code === 0 ? 'success' : 'partial') : 'failed', at: new Date().toISOString(), durationMs: r.durationMs, javaFiles, errors, jobId: j.id, isolated: r.isolated } });
      if (!ok) throw new Error(r.timedOut ? 'JADX: délai dépassé' : `JADX a échoué (code ${r.code})`);
    });
    out.push(job);
  }
  if (which.includes('apktool') && st.apktool && !active.includes('apktool')) {
    const job = enqueue('apktool', id, 'Décodage Apktool (ressources + smali)', async (j, ctl) => {
      await patch(id, { apktool: { status: 'running', at: new Date().toISOString(), jobId: j.id } });
      await fs.promises.rm(apktoolDir(id), { recursive: true, force: true });
      const r = await runSandboxed('java', [...jvmArgs(), '-jar', toolPaths().apktoolJar, 'd', '-f', '-p', path.join(work, 'framework'), '-o', apktoolDir(id), apk], {
        cwd: work,
        signal: ctl.signal,
        onLine: (l) => log(j, l),
      });
      const smaliFiles = await countFiles(apktoolDir(id), '.smali');
      const ok = r.code === 0 && !r.timedOut;
      log(j, `→ ${smaliFiles} fichiers smali en ${(r.durationMs / 1000).toFixed(1)} s (réseau isolé: ${r.isolated.network ? 'oui' : 'non'})`);
      await patch(id, { apktool: { status: ok ? 'success' : smaliFiles ? 'partial' : 'failed', at: new Date().toISOString(), durationMs: r.durationMs, smaliFiles, jobId: j.id, isolated: r.isolated } });
      if (!ok && !smaliFiles) throw new Error(r.timedOut ? 'Apktool: délai dépassé' : `Apktool a échoué (code ${r.code})`);
    });
    out.push(job);
  }
  return out;
}

/** Locate the JADX source file containing a class (inner classes live in their outer class file). */
export async function jadxSourceFor(id: string, className: string): Promise<{ file: string; code: string } | null> {
  const outer = className.split('$')[0];
  const rel = outer.replace(/\./g, '/') + '.java';
  const file = path.join(jadxDir(id), 'sources', rel);
  try {
    return { file: rel, code: await fs.promises.readFile(file, 'utf8') };
  } catch {
    // JADX renames invalid identifiers / default-package classes
    const alt = path.join(jadxDir(id), 'sources', 'defpackage', outer + '.java');
    try {
      return { file: path.relative(path.join(jadxDir(id), 'sources'), alt), code: await fs.promises.readFile(alt, 'utf8') };
    } catch {
      return null;
    }
  }
}

export async function smaliFor(id: string, className: string): Promise<{ file: string; code: string } | null> {
  const rel = className.replace(/\./g, '/') + '.smali';
  const root = apktoolDir(id);
  const dirs = (await fs.promises.readdir(root).catch(() => [] as string[])).filter((d) => d.startsWith('smali'));
  for (const d of dirs) {
    try {
      return { file: `${d}/${rel}`, code: await fs.promises.readFile(path.join(root, d, rel), 'utf8') };
    } catch {
      /* next */
    }
  }
  return null;
}
