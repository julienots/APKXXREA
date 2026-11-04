/** File-based storage: one directory per analysis / project / build, each with a JSON record. */
import fs from 'node:fs';
import path from 'node:path';
import { config, paths } from './config.js';

export async function ensureDirs() {
  for (const d of [paths.analyses(), paths.projects(), paths.builds(), paths.tmp(), path.dirname(paths.keystore())]) {
    await fs.promises.mkdir(d, { recursive: true, mode: 0o700 });
  }
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function writeJson(file: string, data: unknown) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(data, null, 1));
  await fs.promises.rename(tmp, file);
}

export async function listRecords<T>(dir: string, file: string): Promise<T[]> {
  let names: string[] = [];
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const n of names) {
    const r = await readJson<T>(path.join(dir, n, file));
    if (r) out.push(r);
  }
  return out;
}

export async function dirSize(dir: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0, files = 0;
  const walk = async (d: string) => {
    let ents: fs.Dirent[] = [];
    try {
      ents = await fs.promises.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) {
        files++;
        bytes += (await fs.promises.stat(p)).size;
      }
    }
  };
  await walk(dir);
  return { bytes, files };
}

export async function removeDir(dir: string) {
  const root = path.resolve(config.dataDir);
  const target = path.resolve(dir);
  if (!target.startsWith(root + path.sep)) throw new Error('refusing to delete outside data dir');
  await fs.promises.rm(target, { recursive: true, force: true });
}

export interface Settings {
  autoDecompile: boolean;
  jadxThreads: number;
}
const SETTINGS_FILE = () => path.join(config.dataDir, 'settings.json');
export async function getSettings(): Promise<Settings> {
  return { autoDecompile: true, jadxThreads: 2, ...(await readJson<Partial<Settings>>(SETTINGS_FILE())) };
}
export async function saveSettings(s: Partial<Settings>) {
  const cur = await getSettings();
  const next: Settings = {
    autoDecompile: typeof s.autoDecompile === 'boolean' ? s.autoDecompile : cur.autoDecompile,
    jadxThreads: Number.isInteger(s.jadxThreads) && s.jadxThreads! > 0 && s.jadxThreads! <= 16 ? s.jadxThreads! : cur.jadxThreads,
  };
  await writeJson(SETTINGS_FILE(), next);
  return next;
}
