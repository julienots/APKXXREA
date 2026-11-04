import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, Screen, UiNode, UiProps } from '../lib/api';
import { rememberAnalysis, shortName, useAsync, toInputColor, fromInputColor } from '../lib/util';
import { Badge, Card, Collapsible, Empty, ErrorBox, Loading, NeedAnalysis, Notice, PageHeader, Spinner, Tabs } from '../components/ui';
import { PhoneRender } from '../components/PhoneRender';
import { PALETTE, TEMPLATES, findNode, findParent, mapTree, removeNode, moveNode, cloneWithNewIds, countNodes } from '../lib/templates';
import { IArrowDown, IArrowUp, IBox, IPlus, ISave, ITrash, IUndo } from '../components/icons';

interface LayoutsResp { layouts: { name: string; id: number; variants: { config: string; file: string }[]; usedBy: string[]; edited: boolean }[]; stored: { key: string; origin: string; title?: string; baseLayout?: string; updatedAt: string }[] }
interface ScreenResp { key: string; origin: string; root: UiNode; file?: string; config?: string; title?: string }

const DEVICES = { phone: { w: 360, h: 760, label: 'Téléphone 360dp' }, large: { w: 412, h: 860, label: 'Grand 412dp' }, tablet: { w: 600, h: 900, label: 'Tablette 600dp' } };

export default function UiReconstructor() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const key = sp.get('layout') ?? undefined;
  useEffect(() => {
    if (id) rememberAnalysis(id);
  }, [id]);
  const layouts = useAsync(() => (id ? api<LayoutsResp>(`/analyses/${id}/ui/layouts`) : Promise.resolve(undefined)), [id]);
  const graph = useAsync(() => (id ? api<{ screens: Screen[]; dynamicUi: string[] }>(`/analyses/${id}/ui/graph`) : Promise.resolve(undefined)), [id]);
  const [view, setView] = useState<'screens' | 'flow'>('screens');
  const [filter, setFilter] = useState('');
  const [showLib, setShowLib] = useState(false);
  if (!id) return <NeedAnalysis to="UI Reconstructor" />;
  const select = (k: string) => setSp({ layout: k });
  const libLayout = (n: string) => /^(abc_|mtrl_|material_|design_|m3_|notification_|select_dialog|support_simple|browser_actions|exo_|ime_|preference|com_facebook|common_google|fcm|test_|lb_)/.test(n);
  const ls = (layouts.data?.layouts ?? []).filter((l) => (showLib || !libLayout(l.name) || l.usedBy.length || l.edited) && (!filter || l.name.includes(filter)));
  return (
    <>
      <PageHeader
        kicker="UI Reconstructor"
        title="Reconstruction des interfaces"
        subtitle="Layouts récupérés depuis le XML binaire, liés aux écrans par analyse du bytecode. Aperçu approximatif, éditable."
        actions={<Link className="btn-primary" to={`/projects?analysis=${id}`}><IBox /> Générer le projet</Link>}
      />
      <ErrorBox error={layouts.error ?? graph.error} />
      {graph.data && graph.data.dynamicUi.length > 0 && (
        <div className="mb-4">
          <Notice tone="warn">
            <strong>Interface construite dynamiquement :</strong>
            <ul className="mt-1 list-disc pl-5">{graph.data.dynamicUi.map((d) => <li key={d}>{d}</li>)}</ul>
            <div className="mt-1">Utilisez la <strong>reconstruction assistée</strong> (modèles ci-dessous) : APPXRAY ne prétend pas retrouver une structure absente de l'APK.</div>
          </Notice>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
        <div className="grid content-start gap-4">
          <Card>
            <Tabs value={view} onChange={setView} tabs={[{ id: 'screens', label: 'Layouts' }, { id: 'flow', label: 'Flux des écrans' }]} />
            {view === 'screens' ? (
              <>
                <input className="input mb-2" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} />
                <label className="mb-2 flex items-center gap-2 text-xs text-ink-300"><input type="checkbox" className="accent-volt-500" checked={showLib} onChange={(e) => setShowLib(e.target.checked)} /> Inclure les layouts de bibliothèques</label>
                {layouts.loading && <Loading />}
                <div className="scroll-thin max-h-[45vh] overflow-auto">
                  {(layouts.data?.stored ?? []).filter((s) => s.origin === 'assisted').map((s) => (
                    <LayoutItem key={s.key} active={key === s.key} name={s.key} badges={<Badge tone="good">assisté</Badge>} onClick={() => select(s.key)} />
                  ))}
                  {ls.map((l) => (
                    <LayoutItem key={l.name} active={key === l.name} name={l.name} onClick={() => select(l.name)} badges={<>{l.edited && <Badge tone="cyan">modifié</Badge>}{l.usedBy.length > 0 && <Badge tone="blue" title={l.usedBy.join('\n')}>{shortName(l.usedBy[0])}{l.usedBy.length > 1 ? ` +${l.usedBy.length - 1}` : ''}</Badge>}</>} />
                  ))}
                  {layouts.data && ls.length === 0 && <div className="p-2 text-sm text-ink-400">Aucun layout XML exploitable.</div>}
                </div>
              </>
            ) : (
              graph.data && <FlowList screens={graph.data.screens} onPick={select} />
            )}
          </Card>
          <AssistedCard id={id} onCreated={(k) => { layouts.reload(); select(k); }} />
        </div>
        <div className={`min-w-0 ${key ? 'order-first xl:order-none' : ''}`}>
          {view === 'flow' && graph.data && <FlowGraph screens={graph.data.screens} onPick={(k) => { select(k); setView('screens'); }} />}
          {key ? <Editor key={key} id={id} screenKey={key} onSaved={layouts.reload} screens={(graph.data?.screens ?? [])} allKeys={[...(layouts.data?.stored ?? []).map((s) => s.key), ...(layouts.data?.layouts ?? []).map((l) => l.name)]} /> : view === 'screens' && <Empty title="Sélectionnez un layout">Les layouts marqués d'une classe sont reliés à un écran par le bytecode (setContentView / inflate).</Empty>}
        </div>
      </div>
    </>
  );
}

function LayoutItem({ name, active, badges, onClick }: { name: string; active: boolean; badges?: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm ${active ? 'bg-volt-500/20 text-white' : 'hover:bg-ink-800'}`}>
      <span className="mono min-w-0 flex-1 truncate text-xs">{name}</span>
      <span className="flex shrink-0 gap-1">{badges}</span>
    </button>
  );
}

function FlowList({ screens, onPick }: { screens: Screen[]; onPick: (k: string) => void }) {
  return (
    <ul className="grid gap-2 text-sm">
      {screens.map((s) => (
        <li key={s.name} className="rounded-lg border border-ink-700 p-2">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mono text-xs font-medium">{shortName(s.name)}</span>
            {s.launcher && <Badge tone="good">lancement</Badge>}
            <Badge>{s.type}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {s.layouts.map((l) => <button key={l} className="chip border-cyan-x/40 bg-cyan-x/10 text-cyan-x" onClick={() => onPick(l)}>@layout/{l}</button>)}
            {!s.layouts.length && <span className="text-[11px] text-ink-400">aucun layout détecté (UI en code ?)</span>}
          </div>
          {s.targets.length > 0 && <div className="mt-1 text-[11px] text-ink-400">→ {s.targets.map(shortName).join(', ')}</div>}
        </li>
      ))}
    </ul>
  );
}

function FlowGraph({ screens, onPick }: { screens: Screen[]; onPick: (k: string) => void }) {
  const { cols, pos, W, H } = useMemo(() => {
    const byName = new Map(screens.map((s) => [s.name, s]));
    const level = new Map<string, number>();
    const start = screens.filter((s) => s.launcher).map((s) => s.name);
    const queue = [...(start.length ? start : screens.slice(0, 1).map((s) => s.name))];
    queue.forEach((q) => level.set(q, 0));
    while (queue.length) {
      const cur = queue.shift()!;
      for (const t of byName.get(cur)?.targets ?? []) if (!level.has(t)) { level.set(t, level.get(cur)! + 1); queue.push(t); }
    }
    const maxL = Math.max(0, ...level.values());
    for (const s of screens) if (!level.has(s.name)) level.set(s.name, maxL + 1);
    const cols: string[][] = [];
    for (const [n, l] of level) (cols[l] ??= []).push(n);
    const pos = new Map<string, { x: number; y: number }>();
    cols.forEach((c, i) => c.forEach((n, j) => pos.set(n, { x: 20 + i * 230, y: 20 + j * 90 })));
    return { cols, pos, W: 40 + cols.length * 230, H: 40 + Math.max(...cols.map((c) => c.length)) * 90 };
  }, [screens]);
  if (!screens.length) return <Empty title="Aucun écran détecté" />;
  return (
    <Card title="Flux des écrans (déduit du bytecode)" className="mb-4">
      <div className="scroll-thin overflow-auto">
        <svg width={W} height={H} className="min-w-full" role="img" aria-label="Graphe des écrans">
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#22e3ff" /></marker>
          </defs>
          {screens.flatMap((s) => s.targets.map((t) => {
            const a = pos.get(s.name), b = pos.get(t);
            if (!a || !b) return null;
            return <path key={s.name + t} d={`M${a.x + 190},${a.y + 30} C${a.x + 210},${a.y + 30} ${b.x - 20},${b.y + 30} ${b.x},${b.y + 30}`} stroke="#22e3ff" strokeOpacity=".6" fill="none" markerEnd="url(#arr)" />;
          }))}
          {screens.map((s) => {
            const p = pos.get(s.name)!;
            return (
              <g key={s.name} transform={`translate(${p.x},${p.y})`} className="cursor-pointer" onClick={() => s.layouts[0] && onPick(s.layouts[0])}>
                <rect width="190" height="60" rx="12" fill="#0b101c" stroke={s.launcher ? '#34d399' : '#2f6bff'} strokeOpacity=".8" />
                <text x="12" y="24" fill="#e6ebf5" fontSize="12" fontFamily="ui-monospace,monospace">{shortName(s.name).slice(0, 24)}</text>
                <text x="12" y="44" fill="#8d9bbb" fontSize="10">{s.layouts[0] ? `@layout/${s.layouts[0]}`.slice(0, 30) : s.type}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-2 text-xs text-ink-400">{cols.length} niveau(x). Les liens proviennent de références de classes (Intent explicites, const-class). Les navigations dynamiques (deep links, réflexion) ne sont pas visibles.</p>
    </Card>
  );
}

function AssistedCard({ id, onCreated }: { id: string; onCreated: (k: string) => void }) {
  const [name, setName] = useState('');
  const [tpl, setTpl] = useState('login');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const create = async () => {
    const key = 'assisted_' + (name || tpl).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    setBusy(true);
    setErr(undefined);
    try {
      await api(`/analyses/${id}/ui/screen/${key}`, { method: 'PUT', json: { origin: 'assisted', title: name || TEMPLATES[tpl].label, root: TEMPLATES[tpl].make() } });
      onCreated(key);
      setName('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Reconstruction assistée">
      <p className="mb-3 text-xs text-ink-400">Créez un écran neuf à partir d'un modèle lorsque l'interface d'origine n'est pas récupérable (Compose, Flutter, jeu, vue personnalisée…).</p>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(TEMPLATES).map(([k, t]) => (
          <button key={k} onClick={() => setTpl(k)} className={`rounded-lg border p-2 text-left text-xs ${tpl === k ? 'border-cyan-x bg-cyan-x/10' : 'border-ink-700 hover:border-ink-500'}`}>
            <div className="font-medium">{t.label}</div>
            <div className="text-ink-400">{t.desc}</div>
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input className="input" placeholder="nom_ecran (optionnel)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary" onClick={create} disabled={busy} aria-label="Créer l'écran assisté">{busy ? <Spinner /> : <IPlus />}</button>
      </div>
      <ErrorBox error={err} />
    </Card>
  );
}

function Editor({ id, screenKey, onSaved, screens, allKeys }: { id: string; screenKey: string; onSaved: () => void; screens: Screen[]; allKeys: string[] }) {
  const { data, error, loading, reload } = useAsync(() => api<ScreenResp>(`/analyses/${id}/ui/screen/${screenKey}`), [id, screenKey]);
  const [root, setRoot] = useState<UiNode>();
  const [history, setHistory] = useState<UiNode[]>([]);
  const [sel, setSel] = useState<string>();
  const [device, setDevice] = useState<keyof typeof DEVICES>('phone');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [pane, setPane] = useState<'preview' | 'inspect'>('preview');
  useEffect(() => {
    if (data) {
      setRoot(data.root);
      setHistory([]);
      setDirty(false);
      setSel(undefined);
    }
  }, [data]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!root || !data) return null;
  const update = (next: UiNode) => {
    setHistory((h) => [...h.slice(-29), root]);
    setRoot(next);
    setDirty(true);
  };
  const selected = sel ? findNode(root, sel) : undefined;
  const setProps = (patch: Partial<UiProps>, extra?: Partial<UiNode>) => sel && update(mapTree(root, sel, (n) => ({ ...n, ...extra, props: clean({ ...n.props, ...patch }) })));
  const save = async () => {
    setSaving(true);
    setMsg(undefined);
    try {
      await api(`/analyses/${id}/ui/screen/${screenKey}`, { method: 'PUT', json: { origin: data.origin === 'assisted' ? 'assisted' : 'edited', baseLayout: data.origin === 'original' ? screenKey : undefined, title: data.title, root } });
      setDirty(false);
      setMsg('Enregistré');
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const revert = async () => {
    if (!confirm(data.origin === 'assisted' ? 'Supprimer cet écran assisté ?' : 'Abandonner vos modifications et revenir au layout d\'origine ?')) return;
    await api(`/analyses/${id}/ui/screen/${screenKey}`, { method: 'DELETE' });
    onSaved();
    reload();
  };
  const addChild = (make: () => UiNode) => {
    const target = selected && ['linear', 'frame', 'relative', 'constraint', 'card', 'scroll', 'hscroll', 'toolbar'].includes(selected.kind) ? selected : (sel && findParent(root, sel)) || root;
    const child = make();
    update(mapTree(root, target.uid, (n) => ({ ...n, children: [...n.children, child] })));
    setSel(child.uid);
  };
  const dev = DEVICES[device];
  const usedBy = screens.filter((s) => s.layouts.includes(screenKey));
  return (
    <div className="grid gap-4">
      <Card
        title={<span className="mono">{screenKey}</span>}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={data.origin === 'original' ? 'muted' : data.origin === 'assisted' ? 'good' : 'cyan'}>{data.origin === 'original' ? 'original' : data.origin === 'assisted' ? 'assisté' : 'modifié'}</Badge>
            <button className="btn-ghost !min-h-8 !px-2" disabled={!history.length} onClick={() => { setRoot(history.at(-1)); setHistory((h) => h.slice(0, -1)); }} aria-label="Annuler"><IUndo width={15} /></button>
            {data.origin !== 'original' && <button className="btn-ghost !min-h-8 text-xs" onClick={revert}>{data.origin === 'assisted' ? 'Supprimer' : 'Rétablir l\'original'}</button>}
            <button className="btn-primary !min-h-8 text-xs" disabled={!dirty || saving} onClick={save}>{saving ? <Spinner size={12} /> : <ISave width={15} />} Enregistrer</button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
          {data.file && <span className="mono">{data.file}{data.config ? ` [${data.config}]` : ''}</span>}
          <span>{countNodes(root)} vues</span>
          {usedBy.map((s) => <Badge key={s.name} tone="blue">{shortName(s.name)}</Badge>)}
          {msg && <span className="text-good">{msg}</span>}
          {dirty && <span className="text-warn">modifications non enregistrées</span>}
        </div>
      </Card>
      <div className="flex gap-2 xl:hidden">
        <button className={`tab ${pane === 'preview' ? 'tab-active' : ''}`} onClick={() => setPane('preview')}>Aperçu</button>
        <button className={`tab ${pane === 'inspect' ? 'tab-active' : ''}`} onClick={() => setPane('inspect')}>Structure & propriétés</button>
      </div>
      <div className="grid gap-4 xl:grid-cols-[auto_1fr]">
        <div className={`${pane === 'preview' ? '' : 'hidden xl:block'}`}>
          <div className="mb-2 flex flex-wrap gap-1">
            {(Object.keys(DEVICES) as (keyof typeof DEVICES)[]).map((d) => (
              <button key={d} className={`tab !min-h-8 text-xs ${device === d ? 'tab-active' : ''}`} onClick={() => setDevice(d)}>{DEVICES[d].label}</button>
            ))}
          </div>
          <div className="w-full overflow-x-auto">
            <div className="mx-auto rounded-[38px] border border-ink-600 bg-ink-950 p-3 shadow-[0_0_60px_-20px_rgba(34,227,255,.35)]" style={{ width: dev.w + 26 }}>
              <div className="mx-auto mb-2 h-1.5 w-16 rounded-full bg-ink-700" />
              <div className="overflow-auto rounded-[26px] bg-white text-left" style={{ width: dev.w, height: dev.h }} onClick={() => setSel(undefined)}>
                <div className="flex h-6 items-center justify-between bg-slate-100 px-4 text-[10px] text-slate-500"><span>12:00</span><span>▮▮▮ ◔</span></div>
                <div style={{ minHeight: dev.h - 24, display: 'flex', flexDirection: 'column', fontFamily: 'Roboto, system-ui, sans-serif' }}>
                  <PhoneRender root={root} analysisId={id} selected={sel} onSelect={(u) => { setSel(u); }} />
                </div>
              </div>
            </div>
          </div>
          <p className="mx-auto mt-2 max-w-sm text-center text-[11px] text-ink-400">Aperçu approximatif (1dp = 1px). Les positionnements Relative/Constraint sont affichés en flux vertical ; les règles sont conservées dans le projet généré.</p>
        </div>
        <div className={`grid content-start gap-4 ${pane === 'inspect' ? '' : 'hidden xl:grid'}`}>
          <Card title="Structure">
            <div className="scroll-thin max-h-72 overflow-auto">
              <Outline n={root} depth={0} sel={sel} onSel={setSel} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {PALETTE.map((p) => (
                <button key={p.label} className="chip border-ink-600 bg-ink-800 text-ink-200 hover:border-cyan-x" onClick={() => addChild(p.make)}><IPlus width={11} height={11} /> {p.label}</button>
              ))}
            </div>
            {selected && selected !== root && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-ghost !min-h-8 !px-2" onClick={() => update(moveNode(root, selected.uid, -1))} aria-label="Monter"><IArrowUp width={15} /></button>
                <button className="btn-ghost !min-h-8 !px-2" onClick={() => update(moveNode(root, selected.uid, 1))} aria-label="Descendre"><IArrowDown width={15} /></button>
                <button className="btn-ghost !min-h-8 text-xs" onClick={() => { const p = findParent(root, selected.uid)!; const c = cloneWithNewIds(selected); update(mapTree(root, p.uid, (x) => ({ ...x, children: [...x.children, c] }))); }}>Dupliquer</button>
                <button className="btn-danger !min-h-8 text-xs" onClick={() => { update(removeNode(root, selected.uid)); setSel(undefined); }}><ITrash width={14} /> Supprimer</button>
              </div>
            )}
          </Card>
          {selected ? <Props n={selected} setProps={setProps} targets={allKeys.filter((k) => k !== screenKey)} /> : <Empty title="Sélectionnez une vue">Cliquez dans l'aperçu ou dans la structure.</Empty>}
        </div>
      </div>
    </div>
  );
}

function clean(p: UiProps): UiProps {
  const o = { ...p } as Record<string, unknown>;
  for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === '') delete o[k];
  return o as UiProps;
}

function Outline({ n, depth, sel, onSel }: { n: UiNode; depth: number; sel?: string; onSel: (u: string) => void }) {
  return (
    <>
      <button onClick={() => onSel(n.uid)} style={{ paddingLeft: 6 + depth * 12 }} className={`mono flex min-h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-[11.5px] ${sel === n.uid ? 'bg-volt-500/20 text-white' : 'text-ink-200 hover:bg-ink-800'} ${n.props.visibility === 'gone' ? 'opacity-50' : ''}`}>
        <span className="text-volt-400">{n.tag.split('.').pop()}</span>
        {n.viewId && <span className="text-ink-400">#{n.viewId}</span>}
        {n.props.text && <span className="min-w-0 truncate text-ink-500">“{n.props.text}”</span>}
        {n.note && <span className="ml-auto text-warn" title={n.note}>●</span>}
      </button>
      {n.children.map((c) => <Outline key={c.uid} n={c} depth={depth + 1} sel={sel} onSel={onSel} />)}
    </>
  );
}

function ColorField({ label, value, onChange }: { label: string; value?: string; onChange: (v?: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-2">
        <input type="color" className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-ink-600 bg-transparent" value={toInputColor(value)} onChange={(e) => onChange(fromInputColor(e.target.value, value && value.length === 9 ? value.slice(1, 3) : 'FF'))} aria-label={label} />
        <input className="input mono" value={value ?? ''} placeholder="#AARRGGBB" onChange={(e) => onChange(/^#[0-9a-fA-F]{8}$|^#[0-9a-fA-F]{6}$/.test(e.target.value) ? e.target.value.toUpperCase() : e.target.value || undefined)} />
      </div>
    </div>
  );
}

function SizeField({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  const mode = value === 'match' || value === 'wrap' ? value : 'dp';
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-2">
        <select className="input !w-28" value={mode} onChange={(e) => onChange(e.target.value === 'dp' ? '48dp' : e.target.value)}>
          <option value="match">match</option>
          <option value="wrap">wrap</option>
          <option value="dp">dp</option>
        </select>
        {mode === 'dp' && <input className="input" type="number" min={0} value={parseFloat(value ?? '0')} onChange={(e) => onChange(`${Math.max(0, +e.target.value)}dp`)} />}
      </div>
    </div>
  );
}

function Quad({ label, value, onChange }: { label: string; value?: [number, number, number, number]; onChange: (v?: [number, number, number, number]) => void }) {
  const v = value ?? [0, 0, 0, 0];
  return (
    <div>
      <label className="label">{label} (G H D B)</label>
      <div className="grid grid-cols-4 gap-1">
        {v.map((x, i) => (
          <input key={i} className="input !px-2" type="number" value={x} aria-label={`${label} ${i}`} onChange={(e) => { const n = [...v] as [number, number, number, number]; n[i] = +e.target.value; onChange(n.every((z) => !z) ? undefined : n); }} />
        ))}
      </div>
    </div>
  );
}

function Props({ n, setProps, targets }: { n: UiNode; setProps: (p: Partial<UiProps>, extra?: Partial<UiNode>) => void; targets: string[] }) {
  const p = n.props;
  const textual = ['text', 'button', 'edit', 'check', 'switch', 'radio', 'custom'].includes(n.kind);
  const container = ['linear', 'toolbar'].includes(n.kind);
  return (
    <Card title={<span className="mono">{n.tag.split('.').pop()} {n.viewId && <span className="text-ink-400">#{n.viewId}</span>}</span>}>
      {n.note && <div className="mb-3"><Notice tone="warn">{n.note}</Notice></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Identifiant</label>
          <input className="input mono" value={n.viewId ?? ''} onChange={(e) => setProps({}, { viewId: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') || undefined })} />
        </div>
        <div>
          <label className="label">Visibilité</label>
          <select className="input" value={p.visibility ?? 'visible'} onChange={(e) => setProps({ visibility: e.target.value as UiProps['visibility'] })}>
            <option value="visible">visible</option>
            <option value="invisible">invisible</option>
            <option value="gone">gone</option>
          </select>
        </div>
        {textual && (
          <div className="sm:col-span-2">
            <label className="label">Texte</label>
            <textarea className="input min-h-16 py-2" value={p.text ?? ''} onChange={(e) => setProps({ text: e.target.value })} />
          </div>
        )}
        {n.kind === 'edit' && (
          <div className="sm:col-span-2">
            <label className="label">Indication (hint)</label>
            <input className="input" value={p.hint ?? ''} onChange={(e) => setProps({ hint: e.target.value })} />
          </div>
        )}
        {textual && <ColorField label="Couleur du texte" value={p.textColor} onChange={(v) => setProps({ textColor: v })} />}
        {textual && (
          <div>
            <label className="label">Taille du texte (sp)</label>
            <input className="input" type="number" min={6} max={96} value={p.textSize ?? ''} onChange={(e) => setProps({ textSize: e.target.value ? +e.target.value : undefined })} />
          </div>
        )}
        {textual && (
          <div>
            <label className="label">Style</label>
            <select className="input" value={p.textStyle ?? 'normal'} onChange={(e) => setProps({ textStyle: e.target.value === 'normal' ? undefined : e.target.value })}>
              <option>normal</option>
              <option>bold</option>
              <option>italic</option>
              <option value="bold|italic">bold + italic</option>
            </select>
          </div>
        )}
        <ColorField label="Fond" value={p.background?.color} onChange={(v) => setProps({ background: v ? { ...(p.background ?? {}), color: v, image: undefined, svg: undefined } : p.background?.image ? { ...p.background, color: undefined } : undefined })} />
        <div>
          <label className="label">Arrondi du fond (dp)</label>
          <input className="input" type="number" min={0} value={p.background?.radius ?? ''} onChange={(e) => setProps({ background: { ...(p.background ?? {}), radius: e.target.value ? +e.target.value : undefined } })} />
        </div>
        <SizeField label="Largeur" value={p.width} onChange={(v) => setProps({ width: v })} />
        <SizeField label="Hauteur" value={p.height} onChange={(v) => setProps({ height: v })} />
        {container && (
          <div>
            <label className="label">Orientation</label>
            <select className="input" value={p.orientation ?? 'vertical'} onChange={(e) => setProps({ orientation: e.target.value as 'vertical' | 'horizontal' })}>
              <option value="vertical">vertical</option>
              <option value="horizontal">horizontal</option>
            </select>
          </div>
        )}
        <div>
          <label className="label">Gravité du contenu</label>
          <select className="input" value={p.gravity ?? ''} onChange={(e) => setProps({ gravity: e.target.value || undefined })}>
            {['', 'start', 'center', 'center_horizontal', 'center_vertical', 'end', 'top', 'bottom', 'center_vertical|start', 'center_vertical|end'].map((g) => <option key={g} value={g}>{g || '(défaut)'}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Poids (layout_weight)</label>
          <input className="input" type="number" min={0} step={0.5} value={p.weight ?? ''} onChange={(e) => setProps({ weight: e.target.value ? +e.target.value : undefined })} />
        </div>
        <Quad label="Marges (dp)" value={p.margin} onChange={(v) => setProps({ margin: v })} />
        <Quad label="Padding (dp)" value={p.padding} onChange={(v) => setProps({ padding: v })} />
        {['button', 'imagebutton', 'text', 'image', 'card', 'linear'].includes(n.kind) && (
          <div className="sm:col-span-2">
            <label className="label">Action au clic (code généré)</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select className="input sm:!w-44" value={p.onClick?.type ?? ''} onChange={(e) => setProps({ onClick: e.target.value ? { type: e.target.value as 'navigate', value: p.onClick?.value ?? '' } : undefined })}>
                <option value="">aucune</option>
                <option value="navigate">ouvrir un écran</option>
                <option value="url">ouvrir une URL</option>
                <option value="toast">message (toast)</option>
              </select>
              {p.onClick?.type === 'navigate' && (
                <select className="input" value={p.onClick.value} onChange={(e) => setProps({ onClick: { type: 'navigate', value: e.target.value } })}>
                  <option value="">— écran cible —</option>
                  {[...targets, 'LoginActivity', 'WebActivity', 'SettingsActivity', 'ItemsActivity'].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
              {(p.onClick?.type === 'url' || p.onClick?.type === 'toast') && <input className="input" placeholder={p.onClick.type === 'url' ? 'https://…' : 'Message'} value={p.onClick.value} onChange={(e) => setProps({ onClick: { type: p.onClick!.type, value: e.target.value } })} />}
            </div>
            <p className="mt-1 text-[11px] text-ink-400">L'écran cible doit être inclus dans le projet ; les écrans de fonctionnalités (Login, Web…) doivent être activés dans le Project Rebuilder.</p>
          </div>
        )}
      </div>
      {Object.keys(n.raw).length > 0 && (
        <div className="mt-4">
          <Collapsible title={`Attributs d'origine (${Object.keys(n.raw).length})`}>
            <dl className="mono grid gap-1 text-[11px]">
              {Object.entries(n.raw).map(([k, v]) => (
                <div key={k} className="break-all"><span className="text-ink-400">{k}</span> = <span className="text-ink-100">{v}</span></div>
              ))}
            </dl>
          </Collapsible>
        </div>
      )}
    </Card>
  );
}
