import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');

const int = (v: string | undefined, d: number) => (v && /^\d+$/.test(v) ? parseInt(v, 10) : d);

export const config = {
  port: int(process.env.PORT, 8787),
  host: process.env.HOST ?? '127.0.0.1',
  dataDir: path.resolve(process.env.APPXRAY_DATA ?? path.join(ROOT, 'data')),
  toolsDir: path.resolve(process.env.APPXRAY_TOOLS ?? path.join(ROOT, 'tools')),
  webDist: path.join(ROOT, 'web', 'dist'),
  /** Optional shared secret. When set, every /api call needs `Authorization: Bearer <token>`. */
  token: process.env.APPXRAY_TOKEN ?? '',
  limits: {
    /** Max uploaded APK size. */
    maxUploadBytes: int(process.env.APPXRAY_MAX_UPLOAD_MB, 512) * 1024 * 1024,
    /** Zip-bomb protections. */
    maxEntries: 100_000,
    maxTotalUncompressed: 4 * 1024 * 1024 * 1024,
    maxEntryUncompressed: 1024 * 1024 * 1024,
    maxCompressionRatio: 250,
    /** Max bytes served / parsed in-memory from a single entry. */
    maxInMemoryEntry: 256 * 1024 * 1024,
    /** External tools (JADX, Apktool, Gradle). */
    toolTimeoutMs: int(process.env.APPXRAY_TOOL_TIMEOUT_S, 900) * 1000,
    toolMemoryMb: int(process.env.APPXRAY_TOOL_MEM_MB, 3072),
    toolCpuSeconds: int(process.env.APPXRAY_TOOL_CPU_S, 3600),
  },
};

export const paths = {
  analyses: () => path.join(config.dataDir, 'analyses'),
  analysis: (id: string) => path.join(config.dataDir, 'analyses', safeId(id)),
  projects: () => path.join(config.dataDir, 'projects'),
  project: (id: string) => path.join(config.dataDir, 'projects', safeId(id)),
  builds: () => path.join(config.dataDir, 'builds'),
  build: (id: string) => path.join(config.dataDir, 'builds', safeId(id)),
  keystore: () => path.join(config.dataDir, 'keys', 'appxray-debug.p12'),
  tmp: () => path.join(config.dataDir, 'tmp'),
};

export function safeId(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw Object.assign(new Error('invalid id'), { status: 400 });
  return id;
}
