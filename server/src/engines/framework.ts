/** Server-side loader for Android framework resources (android:*), shipped inside Apktool. */
import path from 'node:path';
import { config } from '../config.js';
import { readEntry } from './zip.js';
import { parseResTable, ResTable } from './res.js';

let frameworkCache: ResTable | null | undefined;
export async function loadFramework(): Promise<ResTable | undefined> {
  if (frameworkCache !== undefined) return frameworkCache ?? undefined;
  try {
    const buf = await readEntry(path.join(config.toolsDir, 'aapt2', 'android-framework.jar'), 'resources.arsc');
    frameworkCache = buf ? parseResTable(buf) : null;
  } catch {
    frameworkCache = null;
  }
  return frameworkCache ?? undefined;
}
