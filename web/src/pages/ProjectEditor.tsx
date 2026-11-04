import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, ProjectRecord, upload, url } from '../lib/api';
import { ago, bytes, rememberProject, useAsync } from '../lib/util';
import { Badge, Card, Empty, ErrorBox, KV, Loading, PageHeader, Spinner, Tabs, Notice } from '../components/ui';
import { CodeView, langOf } from '../components/CodeView';
import { FileTree } from '../components/FileTree';
import { IDownload, IHammer, ISave, ITrash, IUpload } from '../components/icons';
import { Wizard } from './Projects';

type Tab = 'report' | 'files' | 'settings';

export default function ProjectEditor() {
  const { pid } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) ?? 'report';
  useEffect(() => {
    if (pid) rememberProject(pid);
  }, [pid]);
  const p = useAsync(() => api<ProjectRecord>(`/projects/${pid}`), [pid]);
  if (p.loading && !p.data) return <Loading />;
  if (p.error) return <ErrorBox error={p.error} />;
  const proj = p.data!;
  return (
    <>
      <PageHeader
        kicker="Project Rebuilder"
        title={proj.name}
        subtitle={<span className="mono">{proj.options.packageName} · v{proj.options.versionName} · mis à jour {ago(proj.updatedAt)}</span>}
        actions={
          <>
            <a className="btn-ghost" href={url(`/projects/${proj.id}/download`)}><IDownload /> Télécharger (.zip)</a>
            <Link className="btn-primary" to={`/builder/${proj.id}`}><IHammer /> Compiler l'APK</Link>
          </>
        }
      />
      <Tabs<Tab> value={tab} onChange={(t) => setSp({ tab: t })} tabs={[{ id: 'report', label: 'Rapport' }, { id: 'files', label: 'Fichiers & édition' }, { id: 'settings', label: 'Paramètres & régénération' }]} />
      {tab === 'report' && <Report p={proj} onIcon={p.reload} />}
      {tab === 'files' && <Files pid={proj.id} />}
      {tab === 'settings' && (
        <Card>
          <Wizard analysisId={proj.analysisId} existing={proj} onDone={() => { p.reload(); setSp({ tab: 'report' }); }} />
        </Card>
      )}
    </>
  );
}

function List({ items, empty = 'aucun' }: { items: string[]; empty?: string }) {
  return items.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <div className="text-sm text-ink-400">{empty}</div>;
}

function Report({ p, onIcon }: { p: ProjectRecord; onIcon: () => void }) {
  const r = p.report;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const sendIcon = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    setErr(undefined);
    try {
      await upload(`/projects/${p.id}/icon`, f);
      onIcon();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card title="Écrans reconstruits" className="xl:col-span-2">
        {r.screens.length === 0 ? <div className="text-sm text-ink-400">Aucun écran reconstruit depuis l'APK.</div> : (
          <ul className="grid gap-2">
            {r.screens.map((s) => (
              <li key={s.activity} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-700 p-2 text-sm">
                <span className="mono font-medium">{s.activity}</span>
                <span className="text-ink-400">← res/layout/{s.layout}.xml</span>
                <Badge tone={s.origin === 'original' ? 'muted' : s.origin === 'assisted' ? 'good' : 'cyan'}>{s.origin}</Badge>
                {p.analysisId && <Link className="ml-auto text-xs text-cyan-x" to={`/ui/${p.analysisId}?layout=${s.layout.replace(/^screen_/, '')}`}>éditer</Link>}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div><div className="label">Fonctionnalités générées</div><List items={r.generated} /></div>
          <div><div className="label">Substitutions de composants</div><List items={r.substitutions} /></div>
          <div><div className="label">Non récupérable</div><List items={r.notRecovered} /></div>
          <div><div className="label">Éléments ignorés</div><List items={[...new Set(r.dropped)].slice(0, 30)} /></div>
        </div>
      </Card>
      <div className="grid content-start gap-4">
        <Card title="Icône">
          <div className="flex items-center gap-3">
            <img src={url(`/projects/${p.id}/file`, { path: 'app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', raw: '1' })} alt="" className="h-16 w-16 rounded-2xl bg-ink-800 object-contain" onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.2')} />
            <div className="grid gap-2">
              <input ref={input} type="file" accept="image/png" className="hidden" onChange={(e) => sendIcon(e.target.files?.[0])} />
              <button className="btn-ghost" onClick={() => input.current?.click()} disabled={busy}>{busy ? <Spinner /> : <IUpload />} Remplacer (PNG)</button>
            </div>
          </div>
          <ErrorBox error={err} />
        </Card>
        <Card title="Projet">
          <KV items={[['Package', <span className="mono">{p.options.packageName}</span>], ['minSdk', p.options.minSdk], ['Ressources copiées', r.copiedResources], ['Source', p.analysisId ? <Link className="text-cyan-x" to={`/analyzer/${p.analysisId}`}>analyse</Link> : 'vierge']]} />
        </Card>
        <Notice><strong>Exclu volontairement :</strong><List items={r.excluded} /></Notice>
      </div>
    </div>
  );
}

function Files({ pid }: { pid: string }) {
  const files = useAsync(() => api<{ path: string; size: number }[]>(`/projects/${pid}/files`), [pid]);
  const [sel, setSel] = useState<string>();
  const [filter, setFilter] = useState('');
  const [mobile, setMobile] = useState<'tree' | 'file'>('tree');
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr]">
      <div className={mobile === 'tree' ? '' : 'hidden lg:block'}>
        <Card title="Arborescence">
          <ErrorBox error={files.error} />
          <input className="input mb-2" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="scroll-thin max-h-[65vh] overflow-auto">
            {files.data && <FileTree files={files.data} filter={filter} selected={sel} defaultOpenDepth={6} onSelect={(f) => { setSel(f.path); setMobile('file'); }} />}
          </div>
          <NewFile pid={pid} onDone={(p) => { files.reload(); setSel(p); }} />
        </Card>
      </div>
      <div className={`min-w-0 ${mobile === 'file' ? '' : 'hidden lg:block'}`}>
        <button className="tab mb-2 lg:hidden" onClick={() => setMobile('tree')}>← Fichiers</button>
        {sel ? <FileEditor key={sel} pid={pid} path={sel} onDeleted={() => { setSel(undefined); files.reload(); }} onChanged={files.reload} /> : <Empty title="Sélectionnez un fichier">Code Java, layouts XML, ressources, Gradle : tout est modifiable. Les fichiers binaires (images, sons) peuvent être remplacés.</Empty>}
      </div>
    </div>
  );
}

function NewFile({ pid, onDone }: { pid: string; onDone: (p: string) => void }) {
  const [path, setPath] = useState('');
  const [err, setErr] = useState<string>();
  const create = async () => {
    setErr(undefined);
    try {
      await api(`/projects/${pid}/file?path=${encodeURIComponent(path)}`, { method: 'PUT', body: '', headers: { 'Content-Type': 'text/plain' } });
      onDone(path);
      setPath('');
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <div className="mt-3 border-t border-ink-700 pt-3">
      <label className="label">Nouveau fichier</label>
      <div className="flex gap-2">
        <input className="input mono text-xs" placeholder="app/src/main/java/…/MaClasse.java" value={path} onChange={(e) => setPath(e.target.value)} />
        <button className="btn-ghost" onClick={create} disabled={!path}>Créer</button>
      </div>
      <ErrorBox error={err} />
    </div>
  );
}

function FileEditor({ pid, path, onDeleted, onChanged }: { pid: string; path: string; onDeleted: () => void; onChanged: () => void }) {
  const f = useAsync(() => api<{ binary: boolean; size: number; text?: string }>(`/projects/${pid}/file?path=${encodeURIComponent(path)}`), [pid, path]);
  const [text, setText] = useState<string>();
  const [edit, setEdit] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setText(f.data?.text), [f.data]);
  const save = async () => {
    setBusy(true);
    setMsg(undefined);
    try {
      await api(`/projects/${pid}/file?path=${encodeURIComponent(path)}`, { method: 'PUT', body: text ?? '', headers: { 'Content-Type': 'text/plain' } });
      setMsg('Enregistré');
      onChanged();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const replace = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      await upload(`/projects/${pid}/upload?path=${encodeURIComponent(path)}`, file);
      setMsg('Fichier remplacé');
      f.reload();
      onChanged();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const del = async () => {
    if (!confirm(`Supprimer ${path} ?`)) return;
    await api(`/projects/${pid}/file?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    onDeleted();
  };
  const isImg = /\.(png|webp|jpe?g|gif)$/i.test(path);
  const isRes = /^app\/src\/main\/(res|assets)\//.test(path);
  const generated = /^app\//.test(path) && !path.startsWith('reference/');
  return (
    <Card
      title={<span className="mono break-all">{path}</span>}
      actions={
        <div className="flex flex-wrap gap-1.5">
          {path.startsWith('reference/') ? <Badge tone="muted">original décompilé · lecture seule</Badge> : generated ? <Badge tone="cyan">reconstruit</Badge> : null}
          {f.data && !f.data.binary && !path.startsWith('reference/') && (edit ? <button className="btn-primary !min-h-8 text-xs" onClick={save} disabled={busy}>{busy ? <Spinner size={12} /> : <ISave width={14} />} Enregistrer</button> : <button className="btn-ghost !min-h-8 text-xs" onClick={() => setEdit(true)}>Modifier</button>)}
          {isRes && <><input ref={input} type="file" className="hidden" onChange={(e) => replace(e.target.files?.[0])} /><button className="btn-ghost !min-h-8 text-xs" onClick={() => input.current?.click()}><IUpload width={14} /> Remplacer</button></>}
          <button className="btn-danger !min-h-8 !px-2" onClick={del} aria-label="Supprimer"><ITrash width={14} /></button>
        </div>
      }
    >
      {f.loading && <Loading />}
      <ErrorBox error={f.error} />
      {msg && <div className="mb-2 text-xs text-good">{msg}</div>}
      {f.data?.binary && (isImg ? <div className="grid place-items-center rounded-xl border border-ink-700 bg-ink-950 p-6"><img src={url(`/projects/${pid}/file`, { path, raw: '1' })} alt="" className="max-h-80 object-contain" /></div> : <div className="text-sm text-ink-300">Fichier binaire · {bytes(f.data.size)} · <a className="text-cyan-x" href={url(`/projects/${pid}/file`, { path, raw: '1' })}>télécharger</a></div>)}
      {f.data && !f.data.binary && text !== undefined && (edit ? (
        <textarea className="mono scroll-thin h-[65vh] w-full resize-y rounded-xl border border-ink-600 bg-ink-950 p-3 text-[12px] leading-[1.6] text-ink-100 outline-none focus:border-volt-500" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } if (e.key === 'Tab') { e.preventDefault(); const t = e.currentTarget; const s = t.selectionStart; setText(text.slice(0, s) + '    ' + text.slice(t.selectionEnd)); requestAnimationFrame(() => t.setSelectionRange(s + 4, s + 4)); } }} />
      ) : (
        <CodeView code={text} lang={langOf(path)} />
      ))}
    </Card>
  );
}
