import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, AnalysisSummary, Feature, ProjectOptions, ProjectRecord } from '../lib/api';
import { ago, rememberProject, useAsync, toInputColor, fromInputColor, cssColor } from '../lib/util';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Spinner, Notice } from '../components/ui';
import { IBox, IHammer, ITrash, IPlus } from '../components/icons';

interface Defaults { options: ProjectOptions; candidates: { key: string; origin: string; usedBy: string[] }[]; features: Feature[]; launcherLayout?: string }

const FEATURES = [
  { id: 'login', label: 'Connexion', desc: 'Comptes locaux sécurisés (à brancher sur votre API)' },
  { id: 'webview', label: 'Contenu web', desc: 'WebView sur une URL de votre choix' },
  { id: 'settings', label: 'Paramètres', desc: 'Préférences persistées' },
  { id: 'list', label: 'Liste', desc: 'Liste avec adaptateur' },
  { id: 'network', label: 'Client réseau', desc: 'Helper HTTP (HttpURLConnection)' },
];

export default function Projects() {
  const [sp] = useSearchParams();
  const [analysisId, setAnalysisId] = useState(sp.get('analysis') ?? '');
  const list = useAsync(() => api<ProjectRecord[]>('/projects'), []);
  const analyses = useAsync(() => api<AnalysisSummary[]>('/analyses'), []);
  const [wizard, setWizard] = useState(!!sp.get('analysis'));
  const del = async (p: ProjectRecord) => {
    if (!confirm(`Supprimer le projet « ${p.name} » et ses compilations ?`)) return;
    await api(`/projects/${p.id}`, { method: 'DELETE' });
    list.reload();
  };
  return (
    <>
      <PageHeader kicker="Project Rebuilder" title="Projets reconstruits" subtitle="Génère un projet Android Studio (Gradle, Java, ressources XML) indépendant de l'application d'origine." actions={!wizard && <button className="btn-primary" onClick={() => setWizard(true)}><IPlus /> Nouveau projet</button>} />
      {wizard && (
        <div className="mb-6">
          <Card glow title="Nouveau projet" actions={<button className="text-xs text-ink-400" onClick={() => setWizard(false)}>Fermer</button>}>
            <label className="label">Analyse source</label>
            <select className="input mb-4" value={analysisId} onChange={(e) => setAnalysisId(e.target.value)}>
              <option value="">— Projet vierge (sans APK source) —</option>
              {(analyses.data ?? []).filter((a) => a.status === 'ready').map((a) => <option key={a.id} value={a.id}>{a.appLabel ?? a.file.name} · {a.package}</option>)}
            </select>
            <Wizard key={analysisId} analysisId={analysisId || undefined} />
          </Card>
        </div>
      )}
      <ErrorBox error={list.error} />
      {list.loading && !list.data && <Loading />}
      {list.data && list.data.length === 0 && !wizard && <Empty title="Aucun projet" action={<button className="btn-primary" onClick={() => setWizard(true)}>Créer un projet</button>}>Partez d'une analyse pour reprendre écrans, couleurs, textes et images.</Empty>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.data?.map((p) => (
          <Card key={p.id}>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: cssColor(p.options.colors.primary) }}><IBox className="text-white" /></span>
              <div className="min-w-0 flex-1">
                <Link to={`/projects/${p.id}`} onClick={() => rememberProject(p.id)} className="block truncate font-medium hover:text-cyan-x">{p.name}</Link>
                <div className="mono truncate text-xs text-ink-400">{p.options.packageName}</div>
                <div className="text-xs text-ink-400">{p.report.screens.length} écran(s) · {p.report.generated.length} fonctionnalité(s) · {ago(p.updatedAt)}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="btn-ghost" to={`/projects/${p.id}`} onClick={() => rememberProject(p.id)}>Ouvrir</Link>
              <Link className="btn-ghost" to={`/builder/${p.id}`} onClick={() => rememberProject(p.id)}><IHammer /> Compiler</Link>
              <button className="btn-danger" onClick={() => del(p)} aria-label="Supprimer"><ITrash /></button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

export function Wizard({ analysisId, existing, onDone }: { analysisId?: string; existing?: ProjectRecord; onDone?: (p: ProjectRecord) => void }) {
  const nav = useNavigate();
  const d = useAsync(() => api<Defaults>(`/projects/defaults${analysisId ? `?analysisId=${analysisId}` : ''}`), [analysisId]);
  const [o, setO] = useState<ProjectOptions>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [strFilter, setStrFilter] = useState('');
  const [strings, setStrings] = useState<{ name: string; value: string }[]>();
  useEffect(() => {
    if (d.data) setO(existing ? existing.options : d.data.options);
  }, [d.data, existing]);
  useEffect(() => {
    if (!analysisId) return;
    api<{ items: { name: string; config: string; value: string }[] }>(`/analyses/${analysisId}/resources?type=string`)
      .then((r) => setStrings(r.items.filter((i) => !i.config && !/^(abc_|mtrl_|material_|m3_|common_google|fcm_|androidx_|exo_|bottom_sheet|character_counter|password_toggle|search_menu|status_bar|call_notification)/.test(i.name))))
      .catch(() => setStrings([]));
  }, [analysisId]);
  if (d.loading) return <Loading />;
  if (d.error) return <ErrorBox error={d.error} />;
  if (!o) return null;
  const set = (patch: Partial<ProjectOptions>) => setO({ ...o, ...patch });
  const has = (k: string) => o.screens.some((s) => s.key === k);
  const toggleScreen = (k: string) => set({ screens: has(k) ? o.screens.filter((s) => s.key !== k) : [...o.screens, { key: k }] });
  const feat = (id: string) => o.features.find((f) => f.id === id);
  const toggleFeat = (id: string) => set({ features: feat(id) ? o.features.filter((f) => f.id !== id) : [...o.features, { id, ...(id === 'webview' ? { url: 'https://example.com' } : {}) }] });
  const submit = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      const p = existing ? await api<ProjectRecord>(`/projects/${existing.id}`, { method: 'PUT', json: { options: o } }) : await api<ProjectRecord>('/projects', { method: 'POST', json: { options: o } });
      rememberProject(p.id);
      if (onDone) onDone(p);
      else nav(`/projects/${p.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const suggested = new Set((d.data?.features ?? []).map((f) => f.scaffold).filter(Boolean));
  return (
    <div className="grid gap-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2">
          <label className="label">Nom de l'application</label>
          <input className="input" value={o.appName} maxLength={60} onChange={(e) => set({ appName: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className="label">Package (applicationId)</label>
          <input className="input mono" value={o.packageName} onChange={(e) => set({ packageName: e.target.value.toLowerCase() })} />
          <p className="mt-1 text-[11px] text-ink-400">Doit différer de l'original pour ne pas usurper l'identité de l'application.</p>
        </div>
        <div>
          <label className="label">Version</label>
          <input className="input" value={o.versionName} onChange={(e) => set({ versionName: e.target.value })} />
        </div>
        <div>
          <label className="label">Code de version</label>
          <input className="input" type="number" min={1} value={o.versionCode} onChange={(e) => set({ versionCode: +e.target.value })} />
        </div>
        <div>
          <label className="label">minSdk</label>
          <input className="input" type="number" min={21} max={35} value={o.minSdk} onChange={(e) => set({ minSdk: +e.target.value })} />
        </div>
      </section>

      <section>
        <div className="label">Couleurs du thème</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(['primary', 'primaryDark', 'accent', 'background'] as const).map((k) => (
            <div key={k} className="flex items-center gap-2 rounded-xl border border-ink-700 p-2">
              <input type="color" aria-label={k} className="h-9 w-10 cursor-pointer rounded-md border border-ink-600 bg-transparent" value={toInputColor(o.colors[k])} onChange={(e) => set({ colors: { ...o.colors, [k]: fromInputColor(e.target.value) } })} />
              <div className="min-w-0">
                <div className="text-xs">{{ primary: 'Primaire', primaryDark: 'Primaire foncée', accent: 'Accent', background: 'Fond' }[k]}</div>
                <div className="mono text-[10px] text-ink-400">{o.colors[k]}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {analysisId && (
        <section>
          <div className="label">Écrans à reconstruire ({o.screens.length})</div>
          <div className="scroll-thin grid max-h-64 gap-1 overflow-auto rounded-xl border border-ink-700 p-2 sm:grid-cols-2">
            {d.data!.candidates.map((c) => (
              <label key={c.key} className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm hover:bg-ink-800">
                <input type="checkbox" className="accent-volt-500" checked={has(c.key)} onChange={() => toggleScreen(c.key)} />
                <span className="mono min-w-0 flex-1 truncate text-xs">{c.key}</span>
                {c.origin !== 'original' && <Badge tone={c.origin === 'assisted' ? 'good' : 'cyan'}>{c.origin === 'assisted' ? 'assisté' : 'modifié'}</Badge>}
                {c.usedBy.length > 0 && <Badge tone="blue">{c.usedBy[0].split('.').pop()}</Badge>}
                {has(c.key) && (
                  <button type="button" className={`chip ${o.screens.find((s) => s.key === c.key)?.launcher ? 'border-good/40 bg-good/10 text-good' : 'border-ink-600 text-ink-400'}`} onClick={(e) => { e.preventDefault(); set({ screens: o.screens.map((s) => ({ ...s, launcher: s.key === c.key })) }); }}>
                    lancement
                  </button>
                )}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-400">Pré-sélection : layouts reliés à une activité/fragment de l'application et écrans modifiés. Éditez-les d'abord dans le UI Reconstructor.</p>
        </section>
      )}

      <section>
        <div className="label">Fonctionnalités à générer (nouveau code indépendant)</div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {FEATURES.map((f) => (
            <label key={f.id} className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-sm ${feat(f.id) ? 'border-cyan-x bg-cyan-x/5' : 'border-ink-700'}`}>
              <span className="flex items-center gap-2">
                <input type="checkbox" className="accent-volt-500" checked={!!feat(f.id)} onChange={() => toggleFeat(f.id)} />
                <span className="font-medium">{f.label}</span>
                {suggested.has(f.id) && <Badge tone="good">détecté</Badge>}
              </span>
              <span className="text-xs text-ink-400">{f.desc}</span>
              {f.id === 'webview' && feat('webview') && <input className="input mt-1 !min-h-8 text-xs" value={feat('webview')!.url ?? ''} onChange={(e) => set({ features: o.features.map((x) => (x.id === 'webview' ? { ...x, url: e.target.value } : x)) })} />}
            </label>
          ))}
        </div>
      </section>

      {analysisId && strings && strings.length > 0 && (
        <section>
          <div className="label flex items-center justify-between">
            <span>Textes de l'application ({strings.length})</span>
            <input className="input !min-h-8 !w-48 normal-case" placeholder="Filtrer…" value={strFilter} onChange={(e) => setStrFilter(e.target.value)} />
          </div>
          <div className="scroll-thin grid max-h-64 gap-1 overflow-auto rounded-xl border border-ink-700 p-2">
            {strings.filter((s) => !strFilter || `${s.name} ${s.value}`.toLowerCase().includes(strFilter.toLowerCase())).slice(0, 300).map((s) => (
              <div key={s.name} className="grid items-center gap-2 sm:grid-cols-[minmax(140px,240px)_1fr]">
                <span className="mono truncate text-[11px] text-ink-400" title={s.name}>{s.name}</span>
                <input className="input !min-h-8 text-xs" value={o.strings[s.name] ?? s.value} onChange={(e) => set({ strings: { ...o.strings, [s.name]: e.target.value } })} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-2 text-sm sm:grid-cols-3">
        {analysisId && <label className="flex items-center gap-2"><input type="checkbox" className="accent-volt-500" checked={o.copyOriginalIcon} onChange={(e) => set({ copyOriginalIcon: e.target.checked })} /> Reprendre l'icône d'origine</label>}
        {analysisId && <label className="flex items-center gap-2"><input type="checkbox" className="accent-volt-500" checked={o.copyAssets} onChange={(e) => set({ copyAssets: e.target.checked })} /> Copier assets, sons et polices</label>}
        {analysisId && <label className="flex items-center gap-2"><input type="checkbox" className="accent-volt-500" checked={o.includeReference} onChange={(e) => set({ includeReference: e.target.checked })} /> Joindre la référence décompilée (hors build)</label>}
      </section>
      <Notice>Le certificat de signature, les clés d'API et secrets détectés, ainsi que le code DEX d'origine ne sont jamais copiés. {existing && <strong>La régénération écrase les modifications manuelles de fichiers.</strong>}</Notice>
      <ErrorBox error={err} />
      <div>
        <button className="btn-primary" onClick={submit} disabled={busy}>{busy ? <Spinner /> : <IBox />} {existing ? 'Régénérer le projet' : 'Générer le projet Android'}</button>
      </div>
    </div>
  );
}
