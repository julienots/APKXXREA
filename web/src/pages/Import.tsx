import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Analysis, upload, isLocal, android } from '../lib/api';
import { InstalledApps, installedBase, type InstalledApp } from '../components/InstalledApps';
import { bytes, rememberAnalysis } from '../lib/util';
import { Card, ErrorBox, Notice, PageHeader, Spinner, Tabs } from '../components/ui';
import { IShield, IUpload } from '../components/icons';

const STEPS = ['Transfert', 'Contrôle ZIP (bombe, traversée)', 'Empreintes SHA-256/SHA-1/MD5', 'Manifest + ressources', 'DEX + signatures', 'Détection'];

export default function ImportPage() {
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [consent, setConsent] = useState(false);
  const canList = !!android()?.listApps;
  const [source, setSource] = useState<'file' | 'installed'>(canList ? 'installed' : 'file');
  const [status, setStatus] = useState<string>();

  const analyseInstalled = async (app: InstalledApp) => {
    if (!consent) {
      setError("Cochez d'abord la confirmation d'autorisation ci-dessous.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      setStatus(`Lecture de l'APK de ${app.label}…`);
      const r = await fetch(`${installedBase()}/__installed/${app.package}/base.apk`);
      if (!r.ok) throw new Error(`APK illisible (HTTP ${r.status})`);
      const f = new File([await r.blob()], `${app.label.replace(/[^\w.\- ]/g, '_')}_${app.versionName}.apk`, { type: 'application/vnd.android.package-archive' });
      setStatus(`Analyse de ${app.label}…`);
      const a = await upload<Analysis>('/analyses', f, setProgress);
      rememberAnalysis(a.id);
      if (a.status === 'error') setError(`Analyse en échec : ${a.error}`);
      else nav(`/analyzer/${a.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setStatus(undefined);
    }
  };

  const pick = (f?: File | null) => {
    setError(undefined);
    if (!f) return;
    if (!/\.(apk|apks|xapk|apkm)$/i.test(f.name)) {
      setError('Format non supporté : sélectionnez un fichier .apk (ou un bundle .apks / .xapk / .apkm).');
      return;
    }
    setFile(f);
  };

  const start = async () => {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    setProgress(0);
    try {
      const a = await upload<Analysis>('/analyses', file, setProgress);
      rememberAnalysis(a.id);
      if (a.status === 'error') setError(`Analyse en échec : ${a.error}`);
      else nav(`/analyzer/${a.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader kicker="Module 1" title="Importer un APK" subtitle={isLocal() ? 'Le fichier est analysé statiquement sur ce téléphone, sans jamais être exécuté.' : 'Le fichier est analysé statiquement côté serveur, sans jamais être exécuté.'} />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card glow>
          <label className="mb-4 flex items-start gap-3 text-sm text-ink-200">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-volt-500" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>Je confirme être propriétaire de cette application ou disposer d'une autorisation pour l'analyser et la reproduire.</span>
          </label>
          {canList && <Tabs value={source} onChange={setSource} tabs={[{ id: 'installed', label: 'Applications installées' }, { id: 'file', label: 'Fichier APK' }]} />}
          {source === 'installed' && canList ? (
            <>
              <InstalledApps onAnalyse={analyseInstalled} busy={busy} />
              {status && <div className="mt-3 flex items-center gap-2 text-sm text-cyan-x"><Spinner /> {status}</div>}
            </>
          ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={`relative flex min-h-64 flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed p-6 text-center transition ${drag ? 'border-cyan-x bg-cyan-x/5' : 'border-ink-600'} ${busy ? 'scanline' : ''}`}
          >
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-volt-500/15 text-cyan-x">
              <IUpload width={30} height={30} />
            </div>
            {file ? (
              <div>
                <div className="font-medium break-all">{file.name}</div>
                <div className="text-sm text-ink-300">{bytes(file.size)}</div>
              </div>
            ) : (
              <div>
                <div className="font-medium">Glissez-déposez un APK ici</div>
                <div className="text-sm text-ink-400">.apk, .apks, .xapk, .apkm — 512 Mo max</div>
              </div>
            )}
            <input ref={input} type="file" accept=".apk,.apks,.xapk,.apkm,application/vnd.android.package-archive" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <button className="btn-ghost" onClick={() => input.current?.click()} disabled={busy}>
              Choisir un fichier
            </button>
          </div>
          )}
          {(source === 'file' || !canList) && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={!file || !consent || busy} onClick={start}>
              {busy ? <Spinner /> : <IUpload />} {busy ? (progress < 1 ? `Envoi ${Math.round(progress * 100)} %` : 'Analyse en cours…') : "Lancer l'analyse"}
            </button>
            {busy && (
              <div className="h-1.5 min-w-40 flex-1 overflow-hidden rounded-full bg-ink-700">
                <div className="h-full bg-gradient-to-r from-volt-500 to-cyan-x transition-all" style={{ width: `${Math.max(5, progress * 100)}%` }} />
              </div>
            )}
          </div>
          )}
          <div className="mt-4">
            <ErrorBox error={error} />
          </div>
        </Card>
        <div className="grid content-start gap-4">
          <Card title="Pipeline d'analyse">
            <ol className="grid gap-2 text-sm">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-3">
                  <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] ${busy && (i === 0 ? progress < 1 : progress >= 1) ? 'bg-cyan-x/20 text-cyan-x' : 'bg-ink-700 text-ink-300'}`}>{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-ink-400">{isLocal() ? "Tout s'exécute sur ce téléphone : le fichier ne quitte pas l'appareil." : 'Ensuite, JADX et Apktool sont lancés en arrière-plan dans un bac à sable (réseau coupé, limites CPU/temps).'}</p>
          </Card>
          <Notice>
            <div className="flex gap-2">
              <IShield className="mt-0.5 shrink-0 text-cyan-x" />
              <div>
                Les APK fractionnés (<em>splits</em>) sont détectés : pour un bundle .apks/.xapk, l'APK de base est analysé et les splits sont listés.
              </div>
            </div>
          </Notice>
        </div>
      </div>
    </>
  );
}
