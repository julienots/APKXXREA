import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, AnalysisSummary } from '../lib/api';
import { ago, bytes, rememberAnalysis, useAsync } from '../lib/util';
import { Card, Empty, ErrorBox, Loading, PageHeader, StatusBadge, Badge } from '../components/ui';
import { ICode, IPhone, IScan, ITrash, IUpload } from '../components/icons';
import { AppIcon } from './Dashboard';

export default function Analyses() {
  const { data, error, loading, reload } = useAsync(() => api<AnalysisSummary[]>('/analyses'), []);
  const [q, setQ] = useState('');
  const del = async (a: AnalysisSummary) => {
    if (!confirm(`Supprimer définitivement l'analyse « ${a.appLabel ?? a.file.name} » et tous ses fichiers (APK, sources décompilées, éditions UI) ?`)) return;
    await api(`/analyses/${a.id}`, { method: 'DELETE' });
    reload();
  };
  const list = (data ?? []).filter((a) => !q || `${a.appLabel} ${a.package} ${a.file.name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader kicker="Historique" title="Mes analyses" subtitle="Toutes les analyses conservées sur ce serveur." actions={<Link to="/import" className="btn-primary"><IUpload /> Nouvelle analyse</Link>} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data && data.length === 0 && <Empty title="Aucune analyse" action={<Link to="/import" className="btn-primary">Importer un APK</Link>} />}
      {data && data.length > 0 && (
        <Card>
          <input className="input mb-3" placeholder="Filtrer par nom, package, fichier…" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="grid gap-2">
            {list.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 rounded-xl border border-ink-700 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <AppIcon a={a} size={44} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{a.appLabel ?? a.file.name}</span>
                      <StatusBadge status={a.status} />
                      {a.container === 'bundle' && <Badge tone="warn">bundle</Badge>}
                    </div>
                    <div className="mono truncate text-xs text-ink-400">{a.package ?? a.error ?? '—'}</div>
                    <div className="text-xs text-ink-400">
                      v{a.versionName ?? '?'} · {bytes(a.file.size)} · {a.files ?? 0} fichiers · {a.classes?.toLocaleString('fr-FR') ?? 0} classes · {ago(a.createdAt)}
                    </div>
                    <div className="mono truncate text-[10px] text-ink-500" title="SHA-256">{a.file.sha256}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {a.status === 'ready' && (
                    <>
                      <Link className="btn-ghost" to={`/analyzer/${a.id}`} onClick={() => rememberAnalysis(a.id)}><IScan /> Analyser</Link>
                      <Link className="btn-ghost" to={`/code/${a.id}`} onClick={() => rememberAnalysis(a.id)}><ICode /> Code</Link>
                      <Link className="btn-ghost" to={`/ui/${a.id}`} onClick={() => rememberAnalysis(a.id)}><IPhone /> UI</Link>
                    </>
                  )}
                  <button className="btn-danger" onClick={() => del(a)} aria-label="Supprimer"><ITrash /></button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
