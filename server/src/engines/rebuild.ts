/** Server wrapper of the Project Rebuilder: storage of UI edits and projects on disk. Logic: rebuild-core.ts. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { paths } from '../config.js';
import { writeJson, readJson } from '../store.js';
import { load } from './analyzer.js';
import { jadxDir } from './decompile.js';
import { buildProjectFiles, ProjectOptions, ProjectRecord, StoredScreen, resName, Sink } from './rebuild-core.js';

export * from './rebuild-core.js';

export const uiDir = (analysisId: string) => path.join(paths.analysis(analysisId), 'ui');

export async function getStoredScreen(analysisId: string, key: string): Promise<StoredScreen | null> {
  return readJson<StoredScreen>(path.join(uiDir(analysisId), resName(key) + '.json'));
}
export async function listStoredScreens(analysisId: string): Promise<StoredScreen[]> {
  const dir = uiDir(analysisId);
  const names = await fs.promises.readdir(dir).catch(() => [] as string[]);
  const out: StoredScreen[] = [];
  for (const n of names.filter((x) => x.endsWith('.json'))) {
    const s = await readJson<StoredScreen>(path.join(dir, n));
    if (s) out.push(s);
  }
  return out;
}
export async function saveStoredScreen(analysisId: string, s: StoredScreen) {
  s.key = resName(s.key);
  s.updatedAt = new Date().toISOString();
  await writeJson(path.join(uiDir(analysisId), s.key + '.json'), s);
  return s;
}

function diskSink(root: string): Sink {
  return {
    async write(rel, data) {
      const f = path.resolve(root, rel);
      if (!f.startsWith(path.resolve(root) + path.sep)) throw new Error(`chemin refusé: ${rel}`);
      await fs.promises.mkdir(path.dirname(f), { recursive: true });
      await fs.promises.writeFile(f, data);
    },
  };
}

export async function generateProject(o: ProjectOptions, existingId?: string): Promise<ProjectRecord> {
  const L = o.analysisId ? await load(o.analysisId) : undefined;
  const id = existingId ?? crypto.randomBytes(9).toString('base64url');
  const pdir = paths.project(id);
  const root = path.join(pdir, 'src');
  const tmp = path.join(pdir, `src.tmp-${Date.now()}`);
  await fs.promises.mkdir(tmp, { recursive: true });
  const uploaded = path.join(pdir, 'icon.png');
  let report;
  try {
    report = await buildProjectFiles(o, {
      L,
      getStored: (key) => (o.analysisId ? getStoredScreen(o.analysisId, key) : Promise.resolve(null)),
      uploadedIcon: fs.existsSync(uploaded) ? await fs.promises.readFile(uploaded) : undefined,
      reference: async () => {
        const src = path.join(jadxDir(o.analysisId!), 'sources');
        if (!fs.existsSync(src)) return false;
        await fs.promises.cp(src, path.join(tmp, 'reference', 'decompiled-java'), { recursive: true, filter: (s) => !/\/(android|androidx|kotlin|kotlinx|com\/google)\//.test(s) });
        return true;
      },
    }, diskSink(tmp));
  } catch (e) {
    await fs.promises.rm(tmp, { recursive: true, force: true });
    throw e;
  }
  await fs.promises.rm(root, { recursive: true, force: true });
  await fs.promises.rename(tmp, root);
  const now = new Date().toISOString();
  const prev = existingId ? await readJson<ProjectRecord>(path.join(pdir, 'project.json')) : null;
  const rec: ProjectRecord = { id, name: o.appName, analysisId: o.analysisId, createdAt: prev?.createdAt ?? now, updatedAt: now, options: o, report };
  await writeJson(path.join(pdir, 'project.json'), rec);
  return rec;
}
