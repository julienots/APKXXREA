import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

export function bytes(n?: number): string {
  if (n === undefined || n === null || isNaN(n)) return '—';
  const u = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

export function ago(iso?: string): string {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Android #AARRGGBB → CSS rgba(). */
export function cssColor(hex?: string): string | undefined {
  if (!hex) return undefined;
  const h = hex.replace('#', '');
  if (h.length === 8) {
    const a = parseInt(h.slice(0, 2), 16) / 255;
    return `rgba(${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${parseInt(h.slice(6, 8), 16)},${a.toFixed(3)})`;
  }
  if (h.length === 6) return `#${h}`;
  return undefined;
}
export function toInputColor(hex?: string): string {
  const h = (hex ?? '').replace('#', '');
  return '#' + (h.length === 8 ? h.slice(2) : h.length === 6 ? h : '000000');
}
export function fromInputColor(v: string, prevAlpha = 'FF'): string {
  return ('#' + prevAlpha + v.replace('#', '')).toUpperCase();
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const run = useCallback(() => {
    const my = ++seq.current;
    setLoading(true);
    setError(undefined);
    fn()
      .then((d) => my === seq.current && setData(d))
      .catch((e: Error) => my === seq.current && setError(e.message))
      .finally(() => my === seq.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    run();
  }, [run]);
  return { data, error, loading, reload: run, setData };
}

export function usePoll<T>(path: string | null, intervalMs: number, active: (d: T | undefined) => boolean) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const activeRef = useRef(active);
  activeRef.current = active;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      try {
        const d = await api<T>(path);
        if (stop) return;
        setData(d);
        setError(undefined);
        if (activeRef.current(d)) timer = setTimeout(loop, intervalMs);
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
    };
    loop();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [path, intervalMs, tick]);
  return { data, error, refresh: () => setTick((t) => t + 1), setData };
}

const CUR = 'appxray.currentAnalysis';
export function rememberAnalysis(id: string) {
  try {
    localStorage.setItem(CUR, id);
  } catch {
    /* ignore */
  }
}
export function lastAnalysis(): string | undefined {
  try {
    return localStorage.getItem(CUR) ?? undefined;
  } catch {
    return undefined;
  }
}
const CURP = 'appxray.currentProject';
export function rememberProject(id: string) {
  try {
    localStorage.setItem(CURP, id);
  } catch {
    /* ignore */
  }
}
export function lastProject(): string | undefined {
  try {
    return localStorage.getItem(CURP) ?? undefined;
  } catch {
    return undefined;
  }
}

export const shortName = (cls: string) => cls.split('.').pop() ?? cls;
