import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, BuildRecord, ProjectRecord, SystemInfo, url } from '../lib/api';
import { ago, bytes, rememberProject, useAsync, usePoll } from '../lib/util';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Spinner, StatusBadge, Notice } from '../components/ui';
import { ICheck, IDownload, IHammer, IPlay, IX } from '../components/icons';

export default function Builder() {
  const { pid } = useParams();
  const nav = useNavigate();
  const projects = useAsync(() => api<ProjectRecord[]>('/projects'), []);
  const sys = useAsync(() => api<SystemInfo>('/system'), []);
  const builds = useAsync(() => (pid ? api<BuildRecord[]>(`/builds?projectId=${pid}`) : Promise.resolve([])), [pid]);
  const [current, setCurrent] = useState<string>();
  const [mode, setMode] = useState<'lite' | 'gradle'>('lite');
  const [err, setErr] = useState<string>();
  useEffect(() => {
    if (pid) rememberProject(pid);
  }, [pid]);
  useEffect(() => {
    if (sys.data) setMode(sys.data.buildModes.gradle ? 'gradle' : 'lite');
  }, [sys.data]);
  useEffect(() => {
    if (!current && builds.data?.[0]) setCurrent(builds.data[0].id);
  }, [builds.data, current]);
  const start = async () => {
    setErr(undefined);
    try {
      const b = await api<BuildRecord>('/builds', { method: 'POST', json: { projectId: pid, mode } });
      setCurrent(b.id);
      builds.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const proj = projects.data?.find((p) => p.id === pid);
  const modes = sys.data?.buildModes;
  return (
    <>
      <PageHeader kicker="APK Builder" title="Compilation" subtitle="Compilation réelle côté serveur (aapt2, javac, dx/D8, signature) — jamais simulée dans le navigateur." />
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="grid content-start gap-4">
          <Card title="Projet">
            <select className="input" value={pid ?? ''} onChange={(e) => { setCurrent(undefined); nav(`/builder/${e.target.value}`); }}>
              <option value="">— choisir un projet —</option>
              {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.options.packageName}</option>)}
            </select>
            {proj && <Link className="mt-2 inline-block text-xs text-cyan-x" to={`/projects/${proj.id}?tab=files`}>Modifier les fichiers du projet →</Link>}
          </Card>
          <Card title="Chaîne de compilation">
            {!modes && <Loading />}
            {modes && (
              <div className="grid gap-2">
                {(['gradle', 'lite'] as const).map((m) => (
                  <label key={m} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${mode === m ? 'border-cyan-x bg-cyan-x/5' : 'border-ink-700'} ${!modes[m] ? 'opacity-50' : ''}`}>
                    <input type="radio" className="mt-1 accent-volt-500" disabled={!modes[m]} checked={mode === m} onChange={() => setMode(m)} />
                    <span className="text-sm">
                      <span className="font-medium">{m === 'gradle' ? 'Gradle + Android SDK' : 'APPXRAY lite (hors ligne)'}</span>
                      <span className="block text-xs text-ink-400">{m === 'gradle' ? 'AGP 8.7, compileSdk 35, D8, signature v2. Fidélité maximale.' : 'aapt2 + javac + dx + jarsigner. Java uniquement, targetSdk 29, signature v1.'}</span>
                      {!modes[m] && <span className="block text-xs text-warn">{modes.reasons[m]}</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <button className="btn-primary mt-3 w-full" disabled={!pid || !modes?.[mode]} onClick={start}><IPlay /> Lancer la compilation</button>
            <ErrorBox error={err} />
          </Card>
          {pid && (
            <Card title="Historique">
              {builds.data?.length === 0 && <div className="text-sm text-ink-400">Aucune compilation.</div>}
              <ul className="grid gap-1">
                {builds.data?.map((b) => (
                  <li key={b.id}>
                    <button className={`flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm ${current === b.id ? 'bg-volt-500/15' : 'hover:bg-ink-800'}`} onClick={() => setCurrent(b.id)}>
                      <StatusBadge status={b.status} />
                      <span className="flex-1 text-xs text-ink-300">{b.mode} · {ago(b.createdAt)}</span>
                      {b.durationMs && <span className="text-xs text-ink-500">{(b.durationMs / 1000).toFixed(1)} s</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="min-w-0">{!pid ? <Empty title="Choisissez un projet à compiler" /> : current ? <BuildView key={current} id={current} pid={pid} onDone={builds.reload} /> : <Empty title="Prêt à compiler">Lancez une compilation : les vérifications, les logs et les erreurs s'affichent ici.</Empty>}</div>
      </div>
    </>
  );
}

function BuildView({ id, pid, onDone }: { id: string; pid: string; onDone: () => void }) {
  const { data: b, error } = usePoll<BuildRecord>(`/builds/${id}`, 1200, (d) => !d || d.status === 'running' || d.status === 'queued');
  const logRef = useRef<HTMLPreElement>(null);
  const wasRunning = useRef(false);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    if (b && (b.status === 'running' || b.status === 'queued')) wasRunning.current = true;
    else if (b && wasRunning.current) {
      wasRunning.current = false;
      onDone();
    }
  }, [b, onDone]);
  if (error) return <ErrorBox error={error} />;
  if (!b) return <Loading />;
  return (
    <div className="grid gap-4">
      <Card glow={b.status === 'success'} title={<span className="flex items-center gap-2">Compilation <span className="mono text-xs text-ink-400">{b.id}</span></span>} actions={<StatusBadge status={b.status} />}>
        {b.status === 'success' && b.apk && (
          <div className="flex flex-col gap-3 rounded-xl border border-good/40 bg-good/5 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium text-good">APK de test généré et vérifié</div>
              <div className="mono text-xs break-all text-ink-300">{b.apk.package} · {bytes(b.apk.size)} · {b.apk.classes} classes</div>
              <div className="mono text-[10px] break-all text-ink-500">SHA-256 {b.apk.sha256}</div>
            </div>
            <a className="btn-primary" href={url(`/builds/${b.id}/apk`)}><IDownload /> Télécharger l'APK</a>
          </div>
        )}
        {b.status === 'failed' && (
          <Notice tone="warn">
            La compilation a échoué. Corrigez les fichiers indiqués puis relancez.{' '}
            <Link className="text-cyan-x underline" to={`/projects/${pid}?tab=files`}>Ouvrir l'éditeur de fichiers</Link>
          </Notice>
        )}
        {(b.status === 'running' || b.status === 'queued') && <div className="flex items-center gap-2 text-sm text-ink-300"><Spinner /> {b.status === 'queued' ? 'En attente d\'un emplacement de compilation…' : 'Compilation en cours…'}</div>}
      </Card>
      {b.checks.length > 0 && (
        <Card title="Vérifications préalables">
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
            {b.checks.map((c) => (
              <li key={c.name} className="flex items-start gap-2">
                {c.ok ? <ICheck className="mt-0.5 shrink-0 text-good" /> : <IX className="mt-0.5 shrink-0 text-bad" />}
                <span><span className={c.ok ? '' : 'text-bad'}>{c.name}</span>{c.detail && <span className="block text-xs text-ink-400">{c.detail}</span>}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {b.errors.length > 0 && b.status === 'failed' && (
        <Card title={`Erreurs (${b.errors.length})`}>
          <ul className="grid gap-2">
            {b.errors.map((e, i) => (
              <li key={i} className="rounded-lg border border-bad/30 bg-bad/5 p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="bad">{e.tool}</Badge>
                  {e.file && <Link className="mono text-xs break-all text-cyan-x hover:underline" to={`/projects/${pid}?tab=files`}>{e.file}{e.line ? `:${e.line}` : ''}</Link>}
                </div>
                <div className="mono mt-1 text-xs break-words text-ink-200">{e.message}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title={<span className="flex items-center gap-2"><IHammer width={16} /> Logs</span>}>
        <pre ref={logRef} className="mono scroll-thin max-h-[55vh] overflow-auto rounded-xl border border-ink-700 bg-ink-950 p-3 text-[11.5px] leading-relaxed whitespace-pre-wrap text-ink-200">
          {(b.log ?? []).map((l, i) => (
            <div key={i} className={/✖|error|ERROR|FAILED/.test(l) ? 'text-bad' : /✔|SUCCESS/.test(l) ? 'text-good' : /^▶/.test(l) ? 'text-cyan-x' : ''}>{l}</div>
          ))}
        </pre>
      </Card>
    </div>
  );
}
