import { useEffect, useState } from 'react';
/** Typed client for the APPXRAY backend. */

export const TOKEN_KEY = 'appxray.token';
export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * On-device mode: the whole API is served inside the app (Android APK) by the local engine.
 * Active when the page is served by the APPXRAY Android app (https://appxray.local), unless a server was chosen.
 */
export const MODE_KEY = 'appxray.mode';
export function isLocal(): boolean {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return location.hostname === 'appxray.local' ? m !== 'server' : m === 'local';
  } catch {
    return location.hostname === 'appxray.local';
  }
}
let localMod: Promise<typeof import('../local/router')> | null = null;
const local = () => (localMod ??= import('../local/router'));

async function rawFetch(path: string, init: RequestInit & { file?: File } = {}): Promise<Response> {
  if (isLocal()) return (await local()).localFetch(path, init);
  const headers = new Headers(init.headers);
  const t = getToken();
  if (t) headers.set('Authorization', `Bearer ${t}`);
  return fetch(`/api${path}`, { ...init, headers });
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const res = await rawFetch(path, { ...init, headers, body });
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? `HTTP ${res.status}`);
  return data as T;
}

/** URL usable in <img src>, <a href> (token passed as query when auth is enabled). */
export function url(path: string, params: Record<string, string> = {}): string {
  const t = getToken();
  const q = new URLSearchParams({ ...params, ...(t ? { token: t } : {}) });
  const s = q.toString();
  return `/api${path}${s ? '?' + s : ''}`;
}

export function upload<T>(path: string, file: File, onProgress?: (p: number) => void): Promise<T> {
  if (isLocal()) {
    onProgress?.(1);
    return rawFetch(path, { method: 'POST', file }).then(async (r) => {
      const d = await r.json();
      if (!r.ok) throw new ApiError(r.status, d?.error ?? `HTTP ${r.status}`);
      return d as T;
    });
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);
    const t = getToken();
    if (t) xhr.setRequestHeader('Authorization', `Bearer ${t}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new ApiError(xhr.status, (data as { error?: string })?.error ?? `HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new ApiError(0, 'Erreur réseau'));
    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}

/** Fetch an API resource as a Blob (works in server and on-device modes). */
export async function apiBlob(path: string, params: Record<string, string> = {}): Promise<Blob> {
  const q = new URLSearchParams(params).toString();
  const r = await rawFetch(path + (q ? '?' + q : ''));
  if (!r.ok) throw new ApiError(r.status, `HTTP ${r.status}`);
  return r.blob();
}

const blobCache = new Map<string, Promise<string>>();
/** URL usable in <img>/<audio>/CSS for an API resource. On-device, resolves to a blob: URL. */
export function useApiUrl(path: string | null, params: Record<string, string> = {}, cache = true): string | undefined {
  const key = path ? path + '?' + new URLSearchParams(params).toString() : '';
  const [u, setU] = useState<string | undefined>(() => (path && !isLocal() ? url(path, params) : undefined));
  useEffect(() => {
    if (!path) return setU(undefined);
    if (!isLocal()) return setU(url(path, params));
    let alive = true;
    let p = cache ? blobCache.get(key) : undefined;
    if (!p) {
      p = apiBlob(path, params).then((b) => URL.createObjectURL(b));
      if (cache) {
        blobCache.set(key, p);
        if (blobCache.size > 400) blobCache.delete(blobCache.keys().next().value!);
      }
      p.catch(() => blobCache.delete(key));
    }
    p.then((x) => alive && setU(x)).catch(() => alive && setU(undefined));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return u;
}

interface AndroidBridge { listApps?(includeSystem: boolean): string; copyApk?(pkg: string): void; saveFile?(name: string, mime: string, base64: string): string; openFile?(uri: string, mime: string): void; changeServer?(): void; useLocal?(): void }
export const android = () => (window as unknown as { AppxrayAndroid?: AndroidBridge }).AppxrayAndroid;

/** Download an API resource to the device (Android: Downloads folder; browser: regular download). */
export async function apiDownload(path: string, filename: string, params: Record<string, string> = {}): Promise<string> {
  const br = android();
  if (!isLocal() && !br?.saveFile) {
    const a = document.createElement('a');
    a.href = url(path, params);
    a.download = filename;
    a.click();
    return filename;
  }
  const blob = await apiBlob(path, params);
  if (br?.saveFile) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const uri = br.saveFile(filename, blob.type || 'application/octet-stream', btoa(s));
    if (!uri) throw new Error('Enregistrement impossible');
    if (filename.endsWith('.apk') && br.openFile && confirm(`${filename} enregistré dans Téléchargements. L'installer maintenant ?`)) br.openFile(uri, 'application/vnd.android.package-archive');
    return uri;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  return filename;
}

// ───── types mirrored from the server ─────
export interface Evidence { kind: string; value: string }
export interface Detection { id: string; name: string; category: string; confidence: number; evidence: Evidence[] }
export interface Feature { id: string; name: string; description: string; confidence: number; classes: string[]; dependencies: string[]; permissions: string[]; resources: string[]; missing: string[]; scaffold?: string }
export interface CertInfo { subject: string; issuer: string; serial: string; validFrom: string; validTo: string; sha256: string; publicKeyType?: string; debugCert: boolean }
export interface Component { type: string; name: string; exported?: boolean; launcher?: boolean; permission?: string; intentFilters: { actions: string[]; categories: string[]; data: string[] }[] }
export interface JobLite { id: string; type: string; target: string; label: string; status: string; createdAt: string; startedAt?: string; endedAt?: string; error?: string; tail: string[] }
export interface Analysis {
  id: string;
  createdAt: string;
  status: 'processing' | 'ready' | 'error';
  error?: string;
  file: { name: string; size: number; sha256: string; sha1: string; md5: string };
  container: { kind: 'apk' | 'bundle'; format?: string; splits?: { name: string; size: number }[]; note?: string };
  package?: string;
  appLabel?: string;
  versionName?: string;
  versionCode?: string;
  minSdk?: string;
  targetSdk?: string;
  compileSdk?: string;
  icon?: { ref: string; path?: string };
  abis: string[];
  split: { isSplit: boolean; splitName?: string; requiresSplits: boolean; note?: string };
  debuggable: boolean;
  allowBackup?: boolean;
  usesCleartext?: boolean;
  components: Component[];
  permissions: { name: string; dangerous: boolean }[];
  usesFeatures: string[];
  metaData: { name: string; value: string }[];
  signature?: { schemes: string[]; v1Certs: CertInfo[]; v2Certs: CertInfo[]; v3Certs: CertInfo[]; otherBlocks: string[]; warnings: string[] };
  files: { total: number; uncompressed: number; categories: Record<string, { count: number; bytes: number }> };
  resources?: { packages: { id: number; name: string }[]; typeCounts: Record<string, number>; entries: number };
  dex: { files: { name: string; version: string; classes: number; methods: number; strings: number }[]; classes: number; methods: number };
  libraries: Detection[];
  obfuscation?: { ratio: number; level: string; samples: string[]; scope: string };
  features: Feature[];
  secrets: { kind: string; count: number }[];
  warnings: string[];
  decompile?: DecompileState;
  jobs?: JobLite[];
}
export interface DecompileState {
  jadx?: { status: string; at: string; durationMs?: number; javaFiles?: number; errors?: number };
  apktool?: { status: string; at: string; durationMs?: number; smaliFiles?: number };
}
export interface AnalysisSummary { id: string; createdAt: string; status: string; error?: string; file: Analysis['file']; package?: string; appLabel?: string; versionName?: string; icon?: Analysis['icon']; files?: number; classes?: number; libraries?: number; container?: string }

export interface Paint { color?: string; image?: string; ref?: string; svg?: boolean; radius?: number; stroke?: string }
export interface UiProps {
  width?: string;
  height?: string;
  weight?: number;
  orientation?: 'vertical' | 'horizontal';
  gravity?: string;
  layoutGravity?: string;
  padding?: [number, number, number, number];
  margin?: [number, number, number, number];
  text?: string;
  hint?: string;
  textColor?: string;
  textSize?: number;
  textStyle?: string;
  background?: Paint;
  src?: Paint;
  visibility?: 'visible' | 'invisible' | 'gone';
  scaleType?: string;
  inputType?: string;
  rules?: Record<string, string>;
  checked?: boolean;
  onClick?: { type: 'navigate' | 'url' | 'toast'; value: string };
}
export interface UiNode { uid: string; tag: string; kind: string; viewId?: string; props: UiProps; raw: Record<string, string>; children: UiNode[]; note?: string }
export interface Screen { name: string; type: 'activity' | 'fragment'; launcher: boolean; exported?: boolean; layouts: string[]; targets: string[]; evidence: string[] }

export interface ProjectOptions {
  analysisId?: string;
  appName: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  minSdk: number;
  colors: { primary: string; primaryDark: string; accent: string; background: string };
  screens: { key: string; title?: string; launcher?: boolean; next?: string; delay?: number }[];
  features: { id: string; url?: string }[];
  strings: Record<string, string>;
  copyOriginalIcon: boolean;
  copyAssets: boolean;
  includeReference: boolean;
}
export interface ProjectRecord {
  id: string;
  name: string;
  analysisId?: string;
  createdAt: string;
  updatedAt: string;
  options: ProjectOptions;
  report: { screens: { activity: string; layout: string; origin: string }[]; copiedResources: number; substitutions: string[]; dropped: string[]; notRecovered: string[]; generated: string[]; excluded: string[] };
}
export interface BuildRecord {
  id: string;
  projectId: string;
  mode: 'gradle' | 'lite' | 'device';
  status: 'queued' | 'running' | 'success' | 'failed';
  createdAt: string;
  endedAt?: string;
  durationMs?: number;
  errors: { file?: string; line?: number; message: string; tool: string }[];
  checks: { name: string; ok: boolean; detail?: string }[];
  apk?: { file: string; size: number; sha256: string; package?: string; classes?: number };
  log?: string[];
}
export interface SystemInfo {
  tools: {
    java?: string; javac: boolean; keytool: boolean; jarsigner: boolean; apktool?: string; jadx?: string; aapt2?: string; frameworkRes: boolean; androidStubs: boolean; dx: boolean;
    androidSdk?: { path: string; platforms: string[]; buildTools: string[] }; gradle?: string; sandbox: { netns: boolean; prlimit: boolean };
  };
  mode?: 'device';
  buildModes: { gradle: boolean; lite: boolean; device?: boolean; reasons: { gradle?: string; lite?: string } };
  limits: Record<string, number>;
  storage: { bytes: number; files: number };
  settings: { autoDecompile: boolean; jadxThreads: number };
  authRequired: boolean;
}
