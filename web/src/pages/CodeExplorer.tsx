import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, Detection, DecompileState, isLocal } from '../lib/api';
import { rememberAnalysis, shortName, useAsync } from '../lib/util';
import { Badge, Card, Empty, ErrorBox, Loading, NeedAnalysis, Notice, PageHeader, Tabs, Spinner } from '../components/ui';
import { CodeView } from '../components/CodeView';
import { IChevron, IFolder, ISearch, IFile } from '../components/icons';

interface TreeResp { packages: { name: string; count: number; own: boolean }[]; classes: { name: string; simple: string; access: string; methods: number; dex: string }[] }
interface ClassResp {
  name: string;
  dex: string;
  access: string;
  superName?: string;
  interfaces: string[];
  sourceFile?: string;
  fields: { name: string; type: string; access: string }[];
  methods: { name: string; params: string[]; ret: string; access: string; insns: number }[];
  refs: { types: string[]; external: string[]; invokes: string[]; strings: string[] };
  java: { file: string; code: string } | null;
  smali: { file: string; code: string } | null;
  disasm: string;
}
interface Overview { dex: { files: { name: string; version: string; classes: number; methods: number; strings: number }[]; classes: number; methods: number }; obfuscation?: { level: string; ratio: number }; libraries: Detection[]; topPackages: { name: string; count: number }[]; decompile: DecompileState }

export default function CodeExplorer() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const cls = sp.get('cls') ?? undefined;
  useEffect(() => {
    if (id) rememberAnalysis(id);
  }, [id]);
  const ov = useAsync(() => (id ? api<Overview>(`/analyses/${id}/code/overview`) : Promise.resolve(undefined)), [id]);
  const [mobilePane, setMobilePane] = useState<'tree' | 'code'>(cls ? 'code' : 'tree');
  if (!id) return <NeedAnalysis to="Code Explorer" />;
  const open = (name: string) => {
    setSp({ cls: name });
    setMobilePane('code');
  };
  return (
    <>
      <PageHeader kicker="Code Explorer" title="Exploration du code" subtitle="Code original décompilé (lecture seule) — distinct du code reconstruit par le Project Rebuilder." />
      <ErrorBox error={ov.error} />
      <div className="mb-3 flex gap-2 lg:hidden">
        <button className={`tab ${mobilePane === 'tree' ? 'tab-active' : ''}`} onClick={() => setMobilePane('tree')}>Packages & recherche</button>
        <button className={`tab ${mobilePane === 'code' ? 'tab-active' : ''}`} onClick={() => setMobilePane('code')} disabled={!cls}>Classe</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
        <div className={`grid content-start gap-4 ${mobilePane === 'tree' ? '' : 'hidden lg:grid'}`}>
          <SearchBox id={id} onOpen={open} />
          <Card title="Packages">
            <div className="scroll-thin max-h-[60vh] overflow-auto">
              <PkgNode id={id} pkg="" depth={0} selected={cls} onOpen={open} />
            </div>
          </Card>
        </div>
        <div className={`min-w-0 ${mobilePane === 'code' ? '' : 'hidden lg:block'}`}>
          {cls ? <ClassView id={id} name={cls} onOpen={open} /> : ov.data ? <OverviewPane o={ov.data} id={id} /> : <Loading />}
        </div>
      </div>
    </>
  );
}

function OverviewPane({ o, id }: { o: Overview; id: string }) {
  const max = Math.max(...o.topPackages.map((p) => p.count), 1);
  return (
    <div className="grid gap-4">
      {isLocal() ? <Notice>Mode téléphone : vue <strong>désassemblage natif</strong> (bytecode Dalvik décodé sur l'appareil), structure, relations et recherche. Le Java décompilé (JADX) nécessite un serveur APPXRAY sur ordinateur.</Notice> : (!o.decompile.jadx || o.decompile.jadx.status === 'running') && (
        <Notice>
          {o.decompile.jadx?.status === 'running' ? <span className="inline-flex items-center gap-2"><Spinner size={12} /> Décompilation JADX en cours…</span> : 'JADX n\'a pas encore été lancé : seule la désassemblage natif est disponible.'}{' '}
          <Link className="text-cyan-x underline" to={`/analyzer/${id}`}>Voir l'état</Link>
        </Notice>
      )}
      <Card title="Fichiers DEX">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {o.dex.files.map((d) => (
            <div key={d.name} className="rounded-lg border border-ink-700 p-3 text-sm">
              <div className="mono font-medium">{d.name} <span className="text-xs text-ink-400">v{d.version}</span></div>
              <div className="text-xs text-ink-400">{d.classes} classes · {d.methods} méthodes · {d.strings} chaînes</div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Répartition par package (dépendances)">
        <div className="grid gap-1.5">
          {o.topPackages.map((p) => (
            <div key={p.name} className="grid grid-cols-[minmax(120px,220px)_1fr_50px] items-center gap-3 text-sm" title={p.name}>
              <span className="mono truncate text-xs">{p.name}</span>
              <span className="h-2 overflow-hidden rounded-full bg-ink-700"><span className="block h-full bg-gradient-to-r from-volt-500 to-cyan-x" style={{ width: `${(p.count / max) * 100}%` }} /></span>
              <span className="text-right text-xs text-ink-400 tabular-nums">{p.count}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function SearchBox({ id, onOpen }: { id: string; onOpen: (c: string) => void }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'class' | 'method' | 'string'>('class');
  const [res, setRes] = useState<{ kind: string; label: string; cls: string; detail?: string }[]>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const run = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    setErr(undefined);
    try {
      setRes(await api(`/analyses/${id}/code/search?q=${encodeURIComponent(q)}&kind=${kind}`));
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Recherche">
      <form onSubmit={run} className="grid gap-2">
        <div className="flex gap-2">
          <input className="input" placeholder="Nom, méthode, chaîne…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-primary !px-3" aria-label="Rechercher" disabled={busy}>{busy ? <Spinner /> : <ISearch />}</button>
        </div>
        <div className="flex gap-1">
          {(['class', 'method', 'string'] as const).map((k) => (
            <button type="button" key={k} className={`tab !min-h-8 text-xs ${kind === k ? 'tab-active' : ''}`} onClick={() => setKind(k)}>
              {k === 'class' ? 'Classes' : k === 'method' ? 'Méthodes' : 'Chaînes'}
            </button>
          ))}
        </div>
      </form>
      <ErrorBox error={err} />
      {res && (
        <div className="scroll-thin mt-3 max-h-72 overflow-auto">
          {res.length === 0 && <div className="text-sm text-ink-400">Aucun résultat.</div>}
          <ul className="grid gap-1">
            {res.map((r, i) => (
              <li key={i}>
                <button className="w-full rounded-md px-2 py-1.5 text-left hover:bg-ink-800" onClick={() => onOpen(r.cls)}>
                  <div className="mono truncate text-xs text-ink-100">{r.label}</div>
                  {r.kind !== 'class' && <div className="mono truncate text-[10px] text-ink-400">{r.cls}{r.detail ? ` · ${r.detail}` : ''}</div>}
                </button>
              </li>
            ))}
          </ul>
          {res.length >= 300 && <div className="p-1 text-[11px] text-ink-400">Limité à 300 résultats.</div>}
        </div>
      )}
    </Card>
  );
}

function PkgNode({ id, pkg, depth, selected, onOpen }: { id: string; pkg: string; depth: number; selected?: string; onOpen: (c: string) => void }) {
  const { data, loading, error } = useAsync(() => api<TreeResp>(`/analyses/${id}/code/tree?pkg=${encodeURIComponent(pkg)}`), [id, pkg]);
  if (loading) return <div style={{ paddingLeft: 8 + depth * 14 }} className="py-1"><Spinner size={12} /></div>;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="mono text-[12.5px]">
      {data!.packages.map((p) => (
        <Pkg key={p.name} id={id} p={p} depth={depth} selected={selected} onOpen={onOpen} />
      ))}
      {data!.classes.map((c) => (
        <button key={c.name} onClick={() => onOpen(c.name)} style={{ paddingLeft: 8 + depth * 14 }} className={`flex min-h-8 w-full items-center gap-1.5 rounded-md pr-2 text-left ${selected === c.name ? 'bg-volt-500/20 text-white' : 'text-ink-200 hover:bg-ink-800'}`}>
          <IFile width={13} height={13} className={`shrink-0 ${c.access.includes('interface') ? 'text-warn' : 'text-ink-400'}`} />
          <span className="min-w-0 flex-1 truncate">{c.simple}</span>
          <span className="text-[10px] text-ink-500">{c.methods}m</span>
        </button>
      ))}
    </div>
  );
}

function Pkg({ id, p, depth, selected, onOpen }: { id: string; p: { name: string; count: number; own: boolean }; depth: number; selected?: string; onOpen: (c: string) => void }) {
  const [open, setOpen] = useState(!!selected?.startsWith(p.name + '.'));
  return (
    <div>
      <button onClick={() => setOpen(!open)} aria-expanded={open} style={{ paddingLeft: 8 + depth * 14 }} className="flex min-h-8 w-full items-center gap-1.5 rounded-md pr-2 text-left hover:bg-ink-800">
        <IChevron width={13} height={13} className={`shrink-0 text-ink-400 transition ${open ? 'rotate-90' : ''}`} />
        <IFolder width={13} height={13} className={`shrink-0 ${p.own ? 'text-cyan-x' : 'text-volt-400'}`} />
        <span className={`min-w-0 flex-1 truncate ${p.own ? 'text-cyan-x' : ''}`}>{p.name.split('.').pop()}</span>
        <span className="text-[10px] text-ink-500">{p.count}</span>
      </button>
      {open && <PkgNode id={id} pkg={p.name} depth={depth + 1} selected={selected} onOpen={onOpen} />}
    </div>
  );
}

type View = 'java' | 'smali' | 'disasm' | 'structure' | 'refs';

function ClassView({ id, name, onOpen }: { id: string; name: string; onOpen: (c: string) => void }) {
  const { data, error, loading } = useAsync(() => api<ClassResp>(`/analyses/${id}/code/class?name=${encodeURIComponent(name)}`), [id, name]);
  const [view, setView] = useState<View>('java');
  const [usages, setUsages] = useState<string[]>();
  useEffect(() => setUsages(undefined), [name]);
  useEffect(() => {
    if (data && view === 'java' && !data.java) setView(data.smali ? 'smali' : 'disasm');
  }, [data, view]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const c = data!;
  const short = c.name.split('.').pop()!;
  const obf = short.split('$')[0].length <= 2;
  return (
    <Card
      title={<span className="mono break-all">{c.name}</span>}
      actions={
        <div className="flex flex-wrap gap-1">
          <Badge tone="blue">{c.dex}</Badge>
          {obf && <Badge tone="warn">nom obfusqué</Badge>}
          <Badge tone="muted">original décompilé</Badge>
        </div>
      }
    >
      <div className="mb-3 text-xs text-ink-400">
        {c.access} · hérite de{' '}
        {c.superName ? (
          <button className="mono text-cyan-x hover:underline" onClick={() => onOpen(c.superName!)}>{c.superName}</button>
        ) : (
          '—'
        )}
        {c.interfaces.length > 0 && <> · implémente {c.interfaces.map((i) => <button key={i} className="mono mr-1 text-cyan-x hover:underline" onClick={() => onOpen(i)}>{shortName(i)}</button>)}</>}
        {c.sourceFile && <> · source « {c.sourceFile} »</>}
      </div>
      <Tabs<View>
        value={view}
        onChange={setView}
        tabs={[
          { id: 'java', label: `Java (JADX)${c.java ? '' : ' —'}` },
          { id: 'smali', label: `Smali (Apktool)${c.smali ? '' : ' —'}` },
          { id: 'disasm', label: 'Désassemblage natif' },
          { id: 'structure', label: `Structure (${c.methods.length}m/${c.fields.length}c)` },
          { id: 'refs', label: 'Relations' },
        ]}
      />
      {view === 'java' && (c.java ? <><div className="mono mb-2 text-[11px] text-ink-400">{c.java.file}</div><CodeView code={c.java.code} lang="java" /></> : <Empty title="Source Java indisponible">JADX n'a pas (encore) produit ce fichier. Lancez la décompilation depuis l'Analyzer, ou utilisez le désassemblage natif.</Empty>)}
      {view === 'smali' && (c.smali ? <><div className="mono mb-2 text-[11px] text-ink-400">{c.smali.file}</div><CodeView code={c.smali.code} lang="smali" /></> : <Empty title="Smali indisponible">Apktool n'a pas encore été exécuté pour cette analyse.</Empty>)}
      {view === 'disasm' && <CodeView code={c.disasm} lang="smali" />}
      {view === 'structure' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <div className="label">Méthodes</div>
            <ul className="mono grid gap-1 text-[11.5px]">
              {c.methods.map((m, i) => (
                <li key={i} className="rounded-md bg-ink-900/60 px-2 py-1 break-all">
                  <span className="text-ink-400">{m.access} </span>
                  <span className="text-ink-300">{shortName(m.ret)} </span>
                  <span className="text-cyan-x">{m.name}</span>({m.params.map(shortName).join(', ')}) <span className="text-ink-500">· {m.insns} u</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="label">Champs</div>
            <ul className="mono grid gap-1 text-[11.5px]">
              {c.fields.map((f, i) => (
                <li key={i} className="rounded-md bg-ink-900/60 px-2 py-1 break-all">
                  <span className="text-ink-400">{f.access} </span>
                  <span className="text-ink-300">{shortName(f.type)} </span>
                  <span className="text-volt-400">{f.name}</span>
                </li>
              ))}
              {c.fields.length === 0 && <li className="text-ink-400">Aucun champ</li>}
            </ul>
          </div>
        </div>
      )}
      {view === 'refs' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <div className="label">Classes de l'APK utilisées ({c.refs.types.length})</div>
            <div className="flex flex-wrap gap-1">
              {c.refs.types.map((t) => (
                <button key={t} className="chip border-volt-500/40 bg-volt-500/10 text-volt-400 hover:bg-volt-500/20" onClick={() => onOpen(t)} title={t}>{shortName(t)}</button>
              ))}
            </div>
            <div className="label mt-4">API externes / framework ({c.refs.external.length})</div>
            <div className="mono max-h-48 overflow-auto text-[11px] text-ink-300">{c.refs.external.join('\n')}</div>
          </div>
          <div>
            <div className="label flex items-center justify-between">
              Utilisée par
              {!usages && <button className="btn-ghost !min-h-7 text-xs" onClick={() => api<string[]>(`/analyses/${id}/code/usages?name=${encodeURIComponent(c.name)}`).then(setUsages)}>Calculer</button>}
            </div>
            {usages && (usages.length ? <div className="flex flex-wrap gap-1">{usages.map((u) => <button key={u} className="chip border-cyan-x/40 bg-cyan-x/10 text-cyan-x" onClick={() => onOpen(u)} title={u}>{shortName(u)}</button>)}</div> : <div className="text-sm text-ink-400">Aucune référence directe.</div>)}
            <div className="label mt-4">Chaînes ({c.refs.strings.length})</div>
            <ul className="mono max-h-48 overflow-auto text-[11px] text-good">{c.refs.strings.map((s, i) => <li key={i} className="break-all">"{s}"</li>)}</ul>
            <div className="label mt-4">Appels ({c.refs.invokes.length})</div>
            <div className="mono max-h-48 overflow-auto text-[11px] whitespace-pre text-ink-300">{c.refs.invokes.join('\n')}</div>
          </div>
        </div>
      )}
    </Card>
  );
}
