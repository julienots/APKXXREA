/**
 * External tool discovery and sandboxed execution.
 * Isolation (Linux): new network namespace (unshare -n) when available, prlimit CPU/file-size/fds caps,
 * JVM heap cap, wall-clock timeout with process-group kill, scrubbed environment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { config } from '../config.js';

const exists = (p: string) => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};

function which(bin: string): string | undefined {
  for (const d of (process.env.PATH ?? '').split(':')) {
    const p = path.join(d, bin);
    if (exists(p)) return p;
  }
  return undefined;
}

export interface ToolStatus {
  java?: string;
  javac: boolean;
  keytool: boolean;
  jarsigner: boolean;
  apktool?: string;
  jadx?: string;
  aapt2?: string;
  frameworkRes: boolean;
  androidStubs: boolean;
  dx: boolean;
  androidSdk?: { path: string; platforms: string[]; buildTools: string[] };
  gradle?: string;
  sandbox: { netns: boolean; prlimit: boolean };
}

let cached: { at: number; s: ToolStatus } | null = null;

export function toolPaths() {
  const T = config.toolsDir;
  return {
    apktoolJar: path.join(T, 'apktool.jar'),
    jadxLib: path.join(T, 'jadx', 'lib'),
    aapt2: process.env.APPXRAY_AAPT2 ?? path.join(T, 'aapt2', 'aapt2'),
    frameworkJar: path.join(T, 'aapt2', 'android-framework.jar'),
    androidStubs: path.join(T, 'android', 'android-stubs.jar'),
    androidAll: path.join(T, 'android', 'android-all-29.jar'),
    dxJar: path.join(T, 'android', 'dx.jar'),
  };
}

function firstLine(cmd: string, args: string[]) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 20000, env: { ...process.env, JAVA_TOOL_OPTIONS: '' } });
    const out = `${r.stdout}\n${r.stderr}`.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('Picked up'));
    return r.status === 0 || out.length ? out[0] : undefined;
  } catch {
    return undefined;
  }
}

export function androidSdkDir(): string | undefined {
  for (const c of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, '/opt/android-sdk', '/usr/lib/android-sdk', path.join(process.env.HOME ?? '', 'Android/Sdk')]) {
    if (c && exists(path.join(c, 'platforms'))) return c;
  }
  return undefined;
}

export function toolStatus(force = false): ToolStatus {
  if (cached && !force && Date.now() - cached.at < 60_000) return cached.s;
  const P = toolPaths();
  const javaBin = which('java');
  const jadxJar = exists(P.jadxLib) ? fs.readdirSync(P.jadxLib).find((f) => /^jadx-cli-.*\.jar$/.test(f)) : undefined;
  const sdk = androidSdkDir();
  const s: ToolStatus = {
    java: javaBin ? firstLine('java', ['-version']) : undefined,
    javac: !!which('javac'),
    keytool: !!which('keytool'),
    jarsigner: !!which('jarsigner'),
    apktool: exists(P.apktoolJar) && javaBin ? firstLine('java', ['-jar', P.apktoolJar, '--version']) : undefined,
    jadx: jadxJar?.replace(/^jadx-cli-|\.jar$/g, ''),
    aapt2: exists(P.aapt2) ? firstLine(P.aapt2, ['version']) : undefined,
    frameworkRes: exists(P.frameworkJar),
    androidStubs: exists(P.androidStubs),
    dx: exists(P.dxJar),
    androidSdk: sdk
      ? {
          path: sdk,
          platforms: fs.readdirSync(path.join(sdk, 'platforms')),
          buildTools: exists(path.join(sdk, 'build-tools')) ? fs.readdirSync(path.join(sdk, 'build-tools')) : [],
        }
      : undefined,
    gradle: which('gradle') ? firstLine('gradle', ['--version', '-q'])?.replace(/^-+$/, '') || 'gradle' : undefined,
    sandbox: { netns: canUnshare(), prlimit: !!which('prlimit') },
  };
  cached = { at: Date.now(), s };
  return s;
}

let unshareOk: boolean | undefined;
function canUnshare() {
  if (unshareOk === undefined) {
    try {
      unshareOk = which('unshare') ? spawnSync('unshare', ['-n', 'true'], { timeout: 5000 }).status === 0 : false;
    } catch {
      unshareOk = false;
    }
  }
  return unshareOk;
}

export interface RunOptions {
  cwd: string;
  timeoutMs?: number;
  network?: boolean;
  env?: Record<string, string>;
  onLine?: (line: string, stream: 'out' | 'err') => void;
  signal?: AbortSignal;
}

export interface RunResult {
  code: number | null;
  signal: string | null;
  timedOut: boolean;
  durationMs: number;
  isolated: { network: boolean; limits: boolean };
}

/** Run an external command with isolation. Never pass APK-controlled strings as program names. */
export function runSandboxed(cmd: string, args: string[], o: RunOptions): Promise<RunResult> {
  const L = config.limits;
  const pre: string[] = [];
  const netIsolated = !o.network && canUnshare();
  if (netIsolated) pre.push('unshare', '-n', '--');
  const limited = !!which('prlimit');
  if (limited) pre.push('prlimit', `--cpu=${L.toolCpuSeconds}`, `--fsize=${4 * 1024 * 1024 * 1024}`, '--nofile=4096', '--core=0', '--');
  const full = [...pre, cmd, ...args];
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: o.cwd,
    LANG: 'C.UTF-8',
    TMPDIR: o.cwd,
    ...(o.network && process.env.JAVA_TOOL_OPTIONS ? { JAVA_TOOL_OPTIONS: process.env.JAVA_TOOL_OPTIONS } : {}),
    ...(o.network && process.env.HTTPS_PROXY ? { HTTPS_PROXY: process.env.HTTPS_PROXY, https_proxy: process.env.HTTPS_PROXY } : {}),
    ...(process.env.JAVA_HOME ? { JAVA_HOME: process.env.JAVA_HOME } : {}),
    ...(o.env ?? {}),
  };
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(full[0], full.slice(1), { cwd: o.cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let timedOut = false;
    const kill = () => {
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        /* already gone */
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, o.timeoutMs ?? L.toolTimeoutMs);
    o.signal?.addEventListener('abort', kill);
    const pipeLines = (s: NodeJS.ReadableStream, kind: 'out' | 'err') => {
      let buf = '';
      s.on('data', (d: Buffer) => {
        buf += d.toString('utf8').replace(/\r/g, '\n');
        const lines = buf.split('\n');
        buf = lines.pop()!;
        for (const l of lines) if (l.trim() && !l.startsWith('Picked up JAVA_TOOL_OPTIONS')) o.onLine?.(l, kind);
      });
      s.on('end', () => buf.trim() && o.onLine?.(buf, kind));
    };
    pipeLines(child.stdout!, 'out');
    pipeLines(child.stderr!, 'err');
    child.on('error', (e) => o.onLine?.(`spawn error: ${e.message}`, 'err'));
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, timedOut, durationMs: Date.now() - started, isolated: { network: netIsolated, limits: limited } });
    });
  });
}

export const jvmArgs = () => [`-Xmx${Math.max(512, config.limits.toolMemoryMb - 256)}m`, '-XX:+UseSerialGC', '-Djava.awt.headless=true'];
