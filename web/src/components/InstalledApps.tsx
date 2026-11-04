import { useEffect, useMemo, useState } from 'react';
import { android } from '../lib/api';
import { bytes } from '../lib/util';
import { Badge, Empty, ErrorBox, Spinner } from './ui';
import { IDownload, IScan, ISearch } from './icons';

export interface InstalledApp { package: string; label: string; versionName: string; versionCode: number; size: number; baseSize: number; splits: number; system: boolean; updated: number }

/** Origin that serves installed APKs (the Android app intercepts https://appxray.local/__installed/...). */
export const installedBase = () => (location.hostname === 'appxray.local' ? '' : 'https://appxray.local');

declare global {
  interface Window { __appxrayCopyDone?: (pkg: string, ok: boolean, msg: string) => void }
}

/** Installed apps on the phone: analyse one directly, or copy its APK(s) to Downloads/APPXRAY. */
export function InstalledApps({ onAnalyse, busy }: { onAnalyse: (app: InstalledApp) => void; busy: boolean }) {
  const [system, setSystem] = useState(false);
  const [apps, setApps] = useState<InstalledApp[]>();
  const [q, setQ] = useState('');
  const [copying, setCopying] = useState<Record<string, 'run' | 'ok' | string>>({});
  const [err, setErr] = useState<string>();
  useEffect(() => {
    setApps(undefined);
    const t = setTimeout(() => {
      try {
        const list = JSON.parse(android()?.listApps?.(system) ?? '[]') as InstalledApp[];
        setApps(list.sort((a, b) => a.label.localeCompare(b.label, 'fr')));
      } catch (e) {
        setErr((e as Error).message);
        setApps([]);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [system]);
  useEffect(() => {
    window.__appxrayCopyDone = (pkg, ok, msg) => setCopying((c) => ({ ...c, [pkg]: ok ? 'ok' : msg }));
    return () => {
      window.__appxrayCopyDone = undefined;
    };
  }, []);
  const shown = useMemo(() => (apps ?? []).filter((a) => !q || `${a.label} ${a.package}`.toLowerCase().includes(q.toLowerCase())), [apps, q]);
  const copy = (a: InstalledApp) => {
    setCopying((c) => ({ ...c, [a.package]: 'run' }));
    android()!.copyApk!(a.package);
  };
  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <ISearch className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-400" width={16} />
          <input className="input !pl-9" placeholder="Rechercher une application…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-300">
          <input type="checkbox" className="h-4 w-4 accent-volt-500" checked={system} onChange={(e) => setSystem(e.target.checked)} /> Apps système
        </label>
      </div>
      <ErrorBox error={err} />
      {!apps && (
        <div className="flex items-center gap-2 p-4 text-sm text-ink-300">
          <Spinner /> Lecture des applications installées…
        </div>
      )}
      {apps && shown.length === 0 && <Empty title="Aucune application">Aucune application ne correspond.</Empty>}
      <ul className="scroll-thin grid max-h-[60vh] gap-1.5 overflow-auto">
        {shown.slice(0, 400).map((a) => {
          const st = copying[a.package];
          return (
            <li key={a.package} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-ink-700 p-2.5">
              <img src={`${installedBase()}/__installed/${a.package}/icon.png`} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 shrink-0 rounded-lg" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-medium">{a.label}</span>
                  {a.splits > 0 && <Badge tone="warn" title="Application découpée en plusieurs APK : la copie produit un .apks (base + splits) ; l'analyse porte sur l'APK de base.">{a.splits + 1} APK</Badge>}
                  {a.system && <Badge>système</Badge>}
                </div>
                <div className="mono truncate text-[11px] text-ink-400">{a.package}</div>
                <div className="text-[11px] text-ink-500">v{a.versionName} · {bytes(a.size)}</div>
                {st && st !== 'run' && st !== 'ok' && <div className="text-[11px] text-bad">{st}</div>}
              </div>
              <div className="flex w-full shrink-0 gap-1.5 sm:w-auto">
                <button className="btn-ghost !min-h-9 flex-1 !px-3 text-xs sm:flex-none" onClick={() => copy(a)} disabled={st === 'run'}>
                  {st === 'run' ? <Spinner size={12} /> : <IDownload width={15} />} {st === 'ok' ? 'Copié ✓' : 'Copier'}
                </button>
                <button className="btn-primary !min-h-9 flex-1 !px-3 text-xs sm:flex-none" onClick={() => onAnalyse(a)} disabled={busy}>
                  <IScan width={15} /> Analyser
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-ink-400">« Copier » enregistre l'APK (ou un .apks pour les apps en plusieurs morceaux) dans Téléchargements/APPXRAY. N'analysez que des applications qui vous appartiennent ou que vous êtes autorisé à étudier.</p>
    </div>
  );
}
