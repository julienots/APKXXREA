import { Link } from 'react-router-dom';
import { api, AnalysisSummary, BuildRecord, JobLite, useApiUrl } from '../lib/api';
import { ago, bytes, usePoll } from '../lib/util';
import { Card, Empty, ErrorBox, Loading, PageHeader, Stat, StatusBadge } from '../components/ui';
import { IBox, ICode, IHammer, IPhone, IScan, IUpload } from '../components/icons';

interface Dash {
  counts: { analyses: number; projects: number; builds: number; filesAnalyzed: number; classesIndexed: number };
  storage: { bytes: number; files: number };
  recentAnalyses: AnalysisSummary[];
  recentProjects: { id: string; name: string; analysisId?: string; updatedAt: string; screens: number }[];
  builds: { success: number; failed: number; running: number; recent: BuildRecord[] };
  jobs: JobLite[];
}

export function AppIcon({ a, size = 40 }: { a: Pick<AnalysisSummary, 'id' | 'icon' | 'status'>; size?: number }) {
  const p = a.icon?.path;
  const src = useApiUrl(p && a.status === 'ready' ? `/analyses/${a.id}/drawable` : null, { path: p ?? '' });
  return p && a.status === 'ready' ? (
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-xl bg-ink-800 object-contain" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
  ) : (
    <div className="grid shrink-0 place-items-center rounded-xl bg-ink-700 text-xs text-ink-300" style={{ width: size, height: size }}>
      APK
    </div>
  );
}

const TOOLS = [
  { to: '/import', label: 'Importer un APK', icon: IUpload, desc: 'Glisser-déposer, empreintes, contrôles' },
  { to: '/analyzer', label: 'APK Analyzer', icon: IScan, desc: 'Manifest, ressources, signatures' },
  { to: '/code', label: 'Code Explorer', icon: ICode, desc: 'Classes, Java (JADX), Smali' },
  { to: '/ui', label: 'UI Reconstructor', icon: IPhone, desc: 'Écrans, aperçu mobile, édition' },
  { to: '/projects', label: 'Project Rebuilder', icon: IBox, desc: 'Projet Android indépendant' },
  { to: '/builder', label: 'APK Builder', icon: IHammer, desc: 'Compilation réelle + logs' },
];

export default function Dashboard() {
  const { data, error } = usePoll<Dash>('/dashboard', 4000, (d) => !!d && (d.jobs.length > 0 || d.builds.running > 0));
  return (
    <>
      <PageHeader kicker="Vue d'ensemble" title="Dashboard" subtitle="Importer → analyser → explorer → reconstruire → compiler" actions={<Link to="/import" className="btn-primary"><IUpload /> Importer un APK</Link>} />
      <ErrorBox error={error} />
      {!data && !error && <Loading />}
      {data && (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Analyses" value={data.counts.analyses} accent />
            <Stat label="Fichiers analysés" value={data.counts.filesAnalyzed.toLocaleString('fr-FR')} />
            <Stat label="Classes indexées" value={data.counts.classesIndexed.toLocaleString('fr-FR')} />
            <Stat label="Projets" value={data.counts.projects} />
            <Stat label="Compilations" value={data.counts.builds} hint={`${data.builds.success} réussies · ${data.builds.failed} échecs`} />
            <Stat label="Espace utilisé" value={bytes(data.storage.bytes)} hint={`${data.storage.files.toLocaleString('fr-FR')} fichiers`} />
          </div>
          {data.jobs.length > 0 && (
            <Card title="Traitements en cours" glow>
              <ul className="grid gap-2">
                {data.jobs.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <StatusBadge status={j.status} /> <span className="font-medium">{j.label}</span>
                    <span className="mono min-w-0 flex-1 truncate text-xs text-ink-400">{j.tail.at(-1)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <div className="grid gap-4 xl:grid-cols-3">
            <Card title="Dernières analyses" className="xl:col-span-2" actions={<Link to="/analyses" className="text-xs text-cyan-x">Tout voir</Link>}>
              {data.recentAnalyses.length === 0 ? (
                <Empty title="Aucune analyse" action={<Link to="/import" className="btn-primary">Importer un premier APK</Link>}>Importez un APK pour démarrer.</Empty>
              ) : (
                <ul className="divide-y divide-ink-700/70">
                  {data.recentAnalyses.map((a) => (
                    <li key={a.id}>
                      <Link to={`/analyzer/${a.id}`} className="flex items-center gap-3 rounded-lg py-2.5 hover:bg-ink-800/60 sm:px-2">
                        <AppIcon a={a} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{a.appLabel ?? a.file.name}</div>
                          <div className="mono truncate text-xs text-ink-400">{a.package ?? '—'} · v{a.versionName ?? '?'}</div>
                        </div>
                        <div className="hidden text-right text-xs text-ink-400 sm:block">
                          <div>{a.classes?.toLocaleString('fr-FR') ?? '—'} classes</div>
                          <div>{ago(a.createdAt)}</div>
                        </div>
                        <StatusBadge status={a.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Statut des reconstructions">
              <div className="grid gap-3">
                {data.recentProjects.length === 0 && <div className="text-sm text-ink-400">Aucun projet reconstruit.</div>}
                {data.recentProjects.map((p) => {
                  const b = data.builds.recent.find((x) => x.projectId === p.id);
                  return (
                    <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-ink-800/60">
                      <IBox className="text-volt-400" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{p.name}</div>
                        <div className="text-xs text-ink-400">{p.screens} écran(s) · {ago(p.updatedAt)}</div>
                      </div>
                      {b ? <StatusBadge status={b.status} /> : <span className="text-xs text-ink-500">non compilé</span>}
                    </Link>
                  );
                })}
              </div>
            </Card>
          </div>
          <Card title="Accès rapide">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TOOLS.map((t) => (
                <Link key={t.to} to={t.to} className="group flex items-center gap-3 rounded-xl border border-ink-700 p-3 transition hover:border-volt-500/60 hover:bg-volt-500/5">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-volt-500/10 text-cyan-x group-hover:bg-volt-500/20">
                    <t.icon />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{t.label}</span>
                    <span className="block text-xs text-ink-400">{t.desc}</span>
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

export { api };
