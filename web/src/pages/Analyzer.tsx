import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, Analysis, apiDownload, useApiUrl, isLocal } from '../lib/api';
import { bytes, ago, rememberAnalysis, useAsync, usePoll, cssColor } from '../lib/util';
import { Badge, Card, Collapsible, Confidence, Empty, ErrorBox, KV, Loading, NeedAnalysis, Notice, PageHeader, StatusBadge, Tabs, Spinner } from '../components/ui';
import { CodeView } from '../components/CodeView';
import { FileTree, TreeFile } from '../components/FileTree';
import { AppIcon } from './Dashboard';
import { IBox, ICode, IDownload, IPhone } from '../components/icons';

type Tab = 'overview' | 'manifest' | 'files' | 'resources' | 'components' | 'libs' | 'features' | 'signature';

export default function Analyzer() {
  const { id } = useParams();
  useEffect(() => {
    if (id) rememberAnalysis(id);
  }, [id]);
  const { data: a, error } = usePoll<Analysis>(id ? `/analyses/${id}` : null, 3000, (d) => !!d && (d.status === 'processing' || !!d.jobs?.some((j) => j.status === 'running' || j.status === 'queued')));
  const [tab, setTab] = useState<Tab>('overview');
  if (!id) return <NeedAnalysis to="APK Analyzer" />;
  if (error) return <ErrorBox error={error} />;
  if (!a) return <Loading />;
  if (a.status !== 'ready') return <Card><StatusBadge status={a.status} /> <span className="ml-2 text-sm">{a.error}</span></Card>;
  return (
    <>
      <PageHeader
        kicker="APK Analyzer"
        title={
          <span className="flex items-center gap-3">
            <AppIcon a={a} size={44} /> <span className="truncate">{a.appLabel ?? a.package}</span>
          </span>
        }
        subtitle={<span className="mono">{a.package} · v{a.versionName} ({a.versionCode})</span>}
        actions={
          <>
            <Link className="btn-ghost" to={`/code/${a.id}`}><ICode /> Code</Link>
            <Link className="btn-ghost" to={`/ui/${a.id}`}><IPhone /> UI</Link>
            <Link className="btn-primary" to={`/projects?analysis=${a.id}`}><IBox /> Reconstruire</Link>
          </>
        }
      />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: "Vue d'ensemble" },
          { id: 'manifest', label: 'Manifest' },
          { id: 'files', label: `Fichiers (${a.files.total})` },
          { id: 'resources', label: 'Ressources' },
          { id: 'components', label: `Composants (${a.components.length})` },
          { id: 'libs', label: `Technologies (${a.libraries.length})` },
          { id: 'features', label: `Fonctionnalités (${a.features.length})` },
          { id: 'signature', label: 'Signature' },
        ]}
      />
      {tab === 'overview' && <Overview a={a} />}
      {tab === 'manifest' && <ManifestTab id={a.id} />}
      {tab === 'files' && <FilesTab a={a} />}
      {tab === 'resources' && <ResourcesTab a={a} />}
      {tab === 'components' && <ComponentsTab a={a} />}
      {tab === 'libs' && <LibsTab a={a} />}
      {tab === 'features' && <FeaturesTab a={a} />}
      {tab === 'signature' && <SignatureTab a={a} />}
    </>
  );
}

const CAT_LABEL: Record<string, string> = { dex: 'Bytecode DEX', manifest: 'Manifest', resources: 'Table de ressources', signature: 'Signature', metadata: 'Métadonnées', native: 'Bibliothèques natives', image: 'Images', font: 'Polices', audio: 'Sons', video: 'Vidéos', layout: 'Layouts', 'res-xml': 'Ressources XML', config: 'Configuration', bundle: 'Bundles / scripts', asset: 'Assets', 'kotlin-meta': 'Métadonnées Kotlin', other: 'Autres' };

function Overview({ a }: { a: Analysis }) {
  const cats = Object.entries(a.files.categories).sort((x, y) => y[1].bytes - x[1].bytes);
  const max = Math.max(...cats.map(([, c]) => c.bytes), 1);
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card title="Identité" className="xl:col-span-2">
        <KV
          items={[
            ['Fichier', a.file.name],
            ['Taille', `${bytes(a.file.size)} (décompressé : ${bytes(a.files.uncompressed)})`],
            ['Package', <span className="mono">{a.package}</span>],
            ['Version', `${a.versionName} (code ${a.versionCode})`],
            ['SDK', `min ${a.minSdk ?? '?'} · cible ${a.targetSdk ?? '?'} · compilé ${a.compileSdk ?? '?'}`],
            ['Architectures', a.abis.length ? a.abis.map((x) => <Badge key={x} tone="cyan">{x}</Badge>) : <span className="text-ink-400">aucune bibliothèque native (Java/Kotlin pur)</span>],
            ['Conteneur', a.container.kind === 'bundle' ? <Badge tone="warn">bundle {a.container.format}</Badge> : 'APK unique'],
            ['DEX', `${a.dex.files.length} fichier(s) · ${a.dex.classes.toLocaleString('fr-FR')} classes · ${a.dex.methods.toLocaleString('fr-FR')} méthodes`],
            ['Obfuscation', a.obfuscation ? <span>{a.obfuscation.level} ({Math.round(a.obfuscation.ratio * 100)} % de noms courts, {a.obfuscation.scope})</span> : '—'],
            ['Debuggable', a.debuggable ? <Badge tone="warn">oui</Badge> : 'non'],
            ['SHA-256', <span className="mono text-xs break-all">{a.file.sha256}</span>],
            ['SHA-1', <span className="mono text-xs break-all">{a.file.sha1}</span>],
            ['MD5', <span className="mono text-xs break-all">{a.file.md5}</span>],
            ['Importé', ago(a.createdAt)],
          ]}
        />
      </Card>
      <div className="grid content-start gap-4">
        <DecompileCard a={a} />
        {(a.split.note || a.container.note) && (
          <Notice tone="warn">
            {a.container.note && <p>{a.container.note}</p>}
            {a.split.note && <p>{a.split.note}</p>}
            {a.container.splits && (
              <ul className="mono mt-2 text-xs">
                {a.container.splits.map((s) => (
                  <li key={s.name}>{s.name} · {bytes(s.size)}</li>
                ))}
              </ul>
            )}
          </Notice>
        )}
        {a.warnings.length > 0 && (
          <Notice tone="warn">
            <ul className="list-disc space-y-1 pl-4">
              {a.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Notice>
        )}
        {a.secrets.length > 0 && (
          <Notice tone="warn">
            Secrets potentiels (masqués) : {a.secrets.map((s) => `${s.kind} ×${s.count}`).join(', ')}
          </Notice>
        )}
      </div>
      <Card title="Répartition du contenu" className="xl:col-span-3">
        <div className="grid gap-2">
          {cats.map(([k, c]) => (
            <div key={k} className="grid grid-cols-[130px_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[180px_1fr_160px]">
              <span className="truncate text-ink-200">{CAT_LABEL[k] ?? k}</span>
              <div className="h-2 overflow-hidden rounded-full bg-ink-700">
                <div className="h-full rounded-full bg-gradient-to-r from-volt-500 to-cyan-x" style={{ width: `${Math.max(1, (c.bytes / max) * 100)}%` }} />
              </div>
              <span className="text-right text-xs text-ink-300 tabular-nums">{c.count} · {bytes(c.bytes)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function DecompileCard({ a }: { a: Analysis }) {
  if (isLocal()) return <Notice>Mode téléphone : analyse et désassemblage natif effectués sur l'appareil. La décompilation Java (JADX) et le smali (Apktool) nécessitent un serveur APPXRAY sur ordinateur.</Notice>;
  return <DecompileCardServer a={a} />;
}

function DecompileCardServer({ a }: { a: Analysis }) {
  const [busy, setBusy] = useState(false);
  const d = a.decompile ?? {};
  const running = a.jobs?.filter((j) => j.status === 'running' || j.status === 'queued') ?? [];
  const run = async () => {
    setBusy(true);
    try {
      await api(`/analyses/${a.id}/decompile`, { method: 'POST', json: {} });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Décompilation" actions={<button className="btn-ghost !min-h-8 text-xs" onClick={run} disabled={busy || running.length > 0}>{running.length ? <Spinner size={12} /> : null} Relancer</button>}>
      <div className="grid gap-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span>JADX (Java)</span>
          <span className="flex items-center gap-2 text-xs text-ink-400">
            {d.jadx?.javaFiles !== undefined && `${d.jadx.javaFiles} fichiers`} <StatusBadge status={d.jadx?.status ?? 'non lancé'} />
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Apktool (smali + res)</span>
          <span className="flex items-center gap-2 text-xs text-ink-400">
            {d.apktool?.smaliFiles !== undefined && `${d.apktool.smaliFiles} fichiers`} <StatusBadge status={d.apktool?.status ?? 'non lancé'} />
          </span>
        </div>
        {running.map((j) => (
          <div key={j.id} className="mono truncate text-[11px] text-ink-400">{j.tail.at(-1)}</div>
        ))}
        {d.jadx?.status === 'partial' && <p className="text-xs text-ink-400">« partiel » : certaines méthodes n'ont pas pu être décompilées ; le code concerné est marqué dans la sortie JADX.</p>}
      </div>
    </Card>
  );
}

function ManifestTab({ id }: { id: string }) {
  const { data, error, loading } = useAsync(() => api<string>(`/analyses/${id}/manifest`), [id]);
  if (loading) return <Loading />;
  return (
    <Card title="AndroidManifest.xml (décodé depuis le XML binaire)" actions={<button className="btn-ghost !min-h-8 text-xs" onClick={() => navigator.clipboard?.writeText(data ?? '')}>Copier</button>}>
      <ErrorBox error={error} />
      {data && <CodeView code={data} lang="xml" />}
    </Card>
  );
}

interface FileRow { name: string; size: number; csize: number; method: number; category: string }

function FilesTab({ a }: { a: Analysis }) {
  const { data, error, loading } = useAsync(() => api<FileRow[]>(`/analyses/${a.id}/files`), [a.id]);
  const [sel, setSel] = useState<FileRow>();
  const [filter, setFilter] = useState('');
  const [cat, setCat] = useState('');
  const files: TreeFile[] = useMemo(() => (data ?? []).filter((f) => !cat || f.category === cat).map((f) => ({ path: f.name, size: f.size })), [data, cat]);
  const nav = useNavigate();
  if (loading) return <Loading />;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,420px)_1fr]">
      <Card title="Arborescence">
        <ErrorBox error={error} />
        <div className="mb-2 flex gap-2">
          <input className="input" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <select className="input !w-36" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Catégorie">
            <option value="">Tout</option>
            {Object.keys(a.files.categories).map((c) => (
              <option key={c} value={c}>{CAT_LABEL[c] ?? c}</option>
            ))}
          </select>
        </div>
        <div className="scroll-thin max-h-[65vh] overflow-auto">
          <FileTree files={files} filter={filter} selected={sel?.name} onSelect={(f) => setSel(data!.find((x) => x.name === f.path))} />
        </div>
      </Card>
      <div className="min-w-0">{sel ? <EntryDetail a={a} f={sel} onOpenLayout={(n) => nav(`/ui/${a.id}?layout=${n}`)} /> : <Empty title="Sélectionnez un fichier">Détails, aperçu des images, sons, XML décodé, hexadécimal.</Empty>}</div>
    </div>
  );
}

interface EntryView { kind: string; text?: string; size?: number; hex?: string; magic?: string; type?: string; truncated?: boolean }

function EntryDetail({ a, f, onOpenLayout }: { a: Analysis; f: FileRow; onOpenLayout: (n: string) => void }) {
  const { data, error, loading } = useAsync(() => api<EntryView>(`/analyses/${a.id}/entry?path=${encodeURIComponent(f.name)}`), [f.name]);
  const rawPath = `/analyses/${a.id}/entry`;
  const raw = useApiUrl(data && ['image', 'media', 'font'].includes(data.kind) ? rawPath : null, { path: f.name, mode: 'raw' }, false);
  const drawableXml0 = /^res\/(drawable|mipmap)[^/]*\/.+\.xml$/.test(f.name);
  const svgPreview = useApiUrl(drawableXml0 ? `/analyses/${a.id}/drawable` : null, { path: f.name });
  const layout = /^res\/layout[^/]*\/(.+)\.xml$/.exec(f.name)?.[1];
  const drawableXml = /^res\/(drawable|mipmap)[^/]*\/.+\.xml$/.test(f.name);
  return (
    <Card title={<span className="mono break-all">{f.name}</span>} actions={<button className="btn-ghost !min-h-8 text-xs" onClick={() => apiDownload(rawPath, f.name.split('/').pop()!, { path: f.name, mode: 'raw' }).catch((e) => alert(e.message))}><IDownload width={14} /> Brut</button>}>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <Badge tone="blue">{CAT_LABEL[f.category] ?? f.category}</Badge>
        <Badge>{bytes(f.size)}</Badge>
        <Badge>{f.method === 0 ? 'stocké' : `compressé ${bytes(f.csize)}`}</Badge>
        {layout && <button className="chip border-cyan-x/40 bg-cyan-x/10 text-cyan-x" onClick={() => onOpenLayout(layout)}>Ouvrir dans UI Reconstructor →</button>}
      </div>
      {loading && <Loading />}
      <ErrorBox error={error} />
      {data?.kind === 'image' && raw && (
        <div className="grid place-items-center rounded-xl border border-ink-700 bg-[repeating-conic-gradient(#0b101c_0_25%,#121a2b_0_50%)] bg-[length:16px_16px] p-6">
          <img src={raw} alt={f.name} className="max-h-[50vh] max-w-full object-contain" />
        </div>
      )}
      {data?.kind === 'media' && raw && (data.type?.startsWith('video') ? <video controls src={raw} className="max-h-[50vh] w-full rounded-xl" /> : <audio controls src={raw} className="w-full" />)}
      {data?.kind === 'font' && raw && <FontPreview src={raw} />}
      {(data?.kind === 'xml' || data?.kind === 'text') && (
        <>
          {drawableXml && (
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-ink-700 p-3">
              <img src={svgPreview} alt="" className="h-16 w-16 object-contain" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
              <span className="text-xs text-ink-400">Rendu SVG reconstruit par APPXRAY (vector / shape)</span>
            </div>
          )}
          <CodeView code={data.text ?? ''} lang={data.kind === 'xml' || f.name.endsWith('.xml') ? 'xml' : 'text'} />
          {data.truncated && <p className="mt-2 text-xs text-ink-400">Aperçu tronqué à 512 Ko.</p>}
        </>
      )}
      {data?.kind === 'binary' && (
        <>
          <p className="mb-2 text-sm text-ink-300">Format détecté : {data.magic}</p>
          <CodeView code={data.hex ?? ''} />
        </>
      )}
      {data?.kind === 'error' && <ErrorBox error={data.text} />}
    </Card>
  );
}

function FontPreview({ src }: { src: string }) {
  const [family] = useState(() => `f${Math.random().toString(36).slice(2)}`);
  return (
    <div>
      <style>{`@font-face{font-family:${family};src:url("${src}")}`}</style>
      <div style={{ fontFamily: family }} className="space-y-2 rounded-xl border border-ink-700 p-4">
        <div className="text-3xl">Aa Bb Cc 0123</div>
        <div>Portez ce vieux whisky au juge blond qui fume.</div>
      </div>
    </div>
  );
}

function ResourcesTab({ a }: { a: Analysis }) {
  const types = Object.entries(a.resources?.typeCounts ?? {}).sort((x, y) => y[1] - x[1]);
  const [type, setType] = useState('color');
  const [q, setQ] = useState('');
  const { data, loading, error } = useAsync(() => api<{ items: { id?: string; name: string; config: string; value: string }[] }>(`/analyses/${a.id}/resources?type=${type}`), [a.id, type]);
  const items = (data?.items ?? []).filter((i) => !q || `${i.name} ${i.value}`.toLowerCase().includes(q.toLowerCase()));
  if (!a.resources) return <Empty title="Aucune table de ressources" />;
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <Card title={`${a.resources.entries} ressources`}>
        <div className="flex flex-wrap gap-1 lg:flex-col">
          {types.map(([t, n]) => (
            <button key={t} className={`tab flex justify-between gap-3 ${type === t ? 'tab-active' : ''}`} onClick={() => setType(t)}>
              <span>{t}</span> <span className="text-ink-500">{n}</span>
            </button>
          ))}
        </div>
      </Card>
      <Card title={type} actions={<input className="input !min-h-8 !w-48" placeholder="Filtrer…" value={q} onChange={(e) => setQ(e.target.value)} />}>
        {loading && <Loading />}
        <ErrorBox error={error} />
        {type === 'color' ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {items.slice(0, 1500).map((c, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-ink-700 p-2">
                <span className="h-8 w-8 shrink-0 rounded-md border border-ink-600" style={{ background: cssColor(c.value) }} />
                <div className="min-w-0">
                  <div className="truncate text-xs">{c.name}</div>
                  <div className="mono text-[10px] text-ink-400">{c.value}{c.config && ` · ${c.config}`}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="scroll-thin max-h-[65vh] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-ink-850 text-ink-400">
                <tr>
                  <th className="p-2">Nom</th>
                  <th className="p-2">Config</th>
                  <th className="p-2">Valeur</th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 3000).map((r, i) => (
                  <tr key={i} className="border-t border-ink-700/60 align-top">
                    <td className="mono p-2 break-all">{r.name}</td>
                    <td className="p-2 text-ink-400">{r.config || 'défaut'}</td>
                    <td className="mono p-2 break-all text-ink-200">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length > 3000 && <p className="p-2 text-xs text-ink-400">{items.length - 3000} lignes masquées — affinez le filtre.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}

function ComponentsTab({ a }: { a: Analysis }) {
  const groups = ['activity', 'activity-alias', 'service', 'receiver', 'provider'] as const;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title={`Permissions (${a.permissions.length})`}>
        <ul className="grid gap-1.5 text-sm">
          {a.permissions.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-2">
              <span className="mono min-w-0 truncate text-xs">{p.name}</span>
              {p.dangerous && <Badge tone="warn">sensible</Badge>}
            </li>
          ))}
        </ul>
        {a.usesFeatures.length > 0 && (
          <div className="mt-4">
            <div className="label">Fonctions matérielles</div>
            <div className="flex flex-wrap gap-1">{a.usesFeatures.map((f) => <Badge key={f}>{f}</Badge>)}</div>
          </div>
        )}
        {a.metaData.length > 0 && (
          <div className="mt-4">
            <div className="label">meta-data</div>
            <ul className="mono grid gap-1 text-[11px] text-ink-300">
              {a.metaData.map((m, i) => (
                <li key={i} className="break-all">{m.name} = {m.value}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <div className="grid content-start gap-3">
        {groups.map((g) => {
          const items = a.components.filter((c) => c.type === g);
          if (!items.length) return null;
          return (
            <Collapsible key={g} defaultOpen={g === 'activity'} title={`${g} (${items.length})`}>
              <ul className="grid gap-2">
                {items.map((c) => (
                  <li key={c.name} className="rounded-lg border border-ink-700 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/code/${a.id}?cls=${encodeURIComponent(c.name)}`} className="mono min-w-0 text-xs break-all text-cyan-x hover:underline">{c.name}</Link>
                      {c.launcher && <Badge tone="good">launcher</Badge>}
                      {c.exported && <Badge tone="warn">exporté</Badge>}
                      {c.permission && <Badge>{c.permission}</Badge>}
                    </div>
                    {c.intentFilters.map((f, i) => (
                      <div key={i} className="mono mt-1 text-[11px] text-ink-400">
                        {[...f.actions, ...f.categories].join(' · ')} {f.data.length > 0 && `· ${f.data.join(' ')}`}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

function LibsTab({ a }: { a: Analysis }) {
  const byCat = new Map<string, typeof a.libraries>();
  for (const l of a.libraries) byCat.set(l.category, [...(byCat.get(l.category) ?? []), l]);
  return (
    <div className="grid gap-4">
      {a.libraries.length === 0 && <Empty title="Aucune technologie reconnue">Le code peut être fortement obfusqué ou n'utiliser que le framework Android.</Empty>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[...byCat].map(([cat, libs]) => (
          <Card key={cat} title={cat}>
            <ul className="grid gap-3">
              {libs.map((l) => (
                <li key={l.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{l.name}</span>
                    <Confidence value={l.confidence} />
                  </div>
                  <ul className="mono mt-1 text-[11px] text-ink-400">
                    {l.evidence.map((e, i) => (
                      <li key={i} className="truncate">{e.kind}: {e.value}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      {a.obfuscation && a.obfuscation.samples.length > 0 && (
        <Card title={`Obfuscation : ${a.obfuscation.level}`}>
          <p className="mb-2 text-sm text-ink-300">Exemples de classes aux noms minifiés :</p>
          <div className="mono flex flex-wrap gap-1 text-[11px]">{a.obfuscation.samples.map((s) => <Badge key={s}>{s}</Badge>)}</div>
        </Card>
      )}
    </div>
  );
}

function FeaturesTab({ a }: { a: Analysis }) {
  return (
    <div className="grid gap-4">
      <Notice>
        Documentation technique générée par analyse statique (permissions, classes, bibliothèques, ressources). La confiance reflète le nombre et la nature des indices, pas une certitude.
        Pour les fonctionnalités marquées « reconstructible », le Project Rebuilder peut générer une <strong>nouvelle implémentation indépendante</strong> — jamais le backend ou les identifiants d'origine.
      </Notice>
      {a.features.length === 0 && <Empty title="Aucune fonctionnalité détectée" />}
      <div className="grid gap-4 lg:grid-cols-2">
        {a.features.map((f) => (
          <Card key={f.id} title={f.name} actions={<Confidence value={f.confidence} />}>
            <p className="mb-3 text-sm text-ink-300">{f.description}</p>
            <KV
              items={[
                ['Classes', f.classes.length ? <ul className="mono text-[11px]">{f.classes.slice(0, 8).map((c) => <li key={c}><Link className="text-cyan-x hover:underline" to={`/code/${a.id}?cls=${encodeURIComponent(c)}`}>{c}</Link></li>)}</ul> : '—'],
                ['Dépendances', f.dependencies.join(', ') || '—'],
                ['Permissions', f.permissions.map((p) => p.replace('android.permission.', '')).join(', ') || '—'],
                ['Ressources', f.resources.length ? <span className="mono text-[11px]">{f.resources.slice(0, 5).join(', ')}</span> : '—'],
                ['Éléments manquants', f.missing.length ? <ul className="list-disc pl-4 text-warn">{f.missing.map((m) => <li key={m}>{m}</li>)}</ul> : '—'],
                ['Reconstruction', f.scaffold ? <Badge tone="good">assistée disponible</Badge> : <Badge>documentation seule</Badge>],
              ]}
            />
          </Card>
        ))}
      </div>
    </div>
  );
}

function SignatureTab({ a }: { a: Analysis }) {
  const s = a.signature;
  if (!s) return <Empty title="Aucune information de signature" />;
  const certs = [...s.v1Certs.map((c) => ['v1', c] as const), ...s.v2Certs.map((c) => ['v2', c] as const), ...s.v3Certs.map((c) => ['v3', c] as const)];
  const uniq = certs.filter(([, c], i) => certs.findIndex(([, d]) => d.sha256 === c.sha256) === i);
  return (
    <div className="grid gap-4">
      <Card title="Schémas">
        <div className="flex flex-wrap gap-2">
          {s.schemes.length ? s.schemes.map((x) => <Badge key={x} tone="good">{x}</Badge>) : <Badge tone="bad">non signé</Badge>}
          {s.otherBlocks.map((x) => <Badge key={x}>{x}</Badge>)}
        </div>
        <p className="mt-3 text-xs text-ink-400">Les certificats sont affichés à titre d'information. APPXRAY ne copie jamais de matériel de signature dans un projet reconstruit : les APK produits sont signés avec une clé propre à votre installation.</p>
      </Card>
      {uniq.map(([v, c]) => (
        <Card key={c.sha256} title={`Certificat (${certs.filter(([, d]) => d.sha256 === c.sha256).map(([x]) => x).join(', ')})`} actions={c.debugCert ? <Badge tone="warn">certificat de debug</Badge> : null}>
          <KV items={[['Sujet', c.subject], ['Émetteur', c.issuer], ['Validité', `${c.validFrom} → ${c.validTo}`], ['Clé', c.publicKeyType], ['N° série', <span className="mono text-xs">{c.serial}</span>], ['SHA-256', <span className="mono text-xs break-all">{c.sha256}</span>]]} />
          <span className="hidden">{v}</span>
        </Card>
      ))}
    </div>
  );
}
