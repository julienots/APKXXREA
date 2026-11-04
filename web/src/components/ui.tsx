import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { IAlert, IChevron } from './icons';
import { pct } from '../lib/util';

export function PageHeader({ title, subtitle, actions, kicker }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; kicker?: string }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {kicker && <div className="mb-1 text-[11px] font-semibold tracking-[0.2em] text-cyan-x/80 uppercase">{kicker}</div>}
        <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-ink-300">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '', title, actions, glow }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; glow?: boolean }) {
  return (
    <section className={`card ${glow ? 'card-glow' : ''} fade-up ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-ink-600/60 px-4 py-3">
          <h2 className="min-w-0 truncate text-sm font-semibold text-ink-100">{title}</h2>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: boolean }) {
  return (
    <div className={`card fade-up p-4 ${accent ? 'card-glow' : ''}`}>
      <div className="text-xs tracking-wide text-ink-300 uppercase">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${accent ? 'text-cyan-x' : ''}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-400">{hint}</div>}
    </div>
  );
}

const TONES: Record<string, string> = {
  blue: 'border-volt-500/40 bg-volt-500/10 text-volt-400',
  cyan: 'border-cyan-x/40 bg-cyan-x/10 text-cyan-x',
  good: 'border-good/40 bg-good/10 text-good',
  warn: 'border-warn/40 bg-warn/10 text-warn',
  bad: 'border-bad/40 bg-bad/10 text-bad',
  muted: 'border-ink-600 bg-ink-800 text-ink-300',
};
export function Badge({ children, tone = 'muted', title }: { children: ReactNode; tone?: keyof typeof TONES | string; title?: string }) {
  return (
    <span className={`chip ${TONES[tone] ?? TONES.muted}`} title={title}>
      {children}
    </span>
  );
}

export function statusTone(s?: string) {
  return s === 'success' || s === 'ready' ? 'good' : s === 'failed' || s === 'error' ? 'bad' : s === 'running' || s === 'processing' || s === 'queued' ? 'cyan' : s === 'partial' ? 'warn' : 'muted';
}
const STATUS_FR: Record<string, string> = { success: 'réussi', ready: 'prêt', failed: 'échec', error: 'erreur', running: 'en cours', processing: 'analyse…', queued: 'en attente', partial: 'partiel', cancelled: 'annulé' };
export function StatusBadge({ status }: { status?: string }) {
  return <Badge tone={statusTone(status)}>{status === 'running' || status === 'queued' ? <Spinner size={10} /> : null}{STATUS_FR[status ?? ''] ?? status ?? '—'}</Badge>;
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-label="Chargement">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-ink-300">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm text-bad" role="alert">
      <IAlert className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 break-words">{error}</div>
      {onRetry && (
        <button className="text-xs underline" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}

export function Notice({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'warn' | 'good' }) {
  const c = tone === 'warn' ? 'border-warn/40 bg-warn/5 text-warn' : tone === 'good' ? 'border-good/40 bg-good/5 text-good' : 'border-volt-500/40 bg-volt-500/5 text-ink-200';
  return <div className={`rounded-xl border p-3 text-sm ${c}`}>{children}</div>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-600 p-10 text-center">
      <div className="text-base font-medium">{title}</div>
      {children && <div className="max-w-md text-sm text-ink-300">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="scroll-thin -mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? 'tab-active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Confidence({ value }: { value: number }) {
  const color = value >= 0.75 ? 'bg-good' : value >= 0.5 ? 'bg-cyan-x' : 'bg-warn';
  return (
    <div className="flex items-center gap-2" title={`Confiance ${pct(value)}`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-ink-700">
        <div className={`h-full ${color}`} style={{ width: pct(value) }} />
      </div>
      <span className="text-xs text-ink-300 tabular-nums">{pct(value)}</span>
    </div>
  );
}

export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-ink-300">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Collapsible({ title, children, defaultOpen = false, right }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-ink-600/70">
      <button className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        <IChevron className={`shrink-0 transition ${open ? 'rotate-90' : ''}`} />
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        {right}
      </button>
      {open && <div className="border-t border-ink-600/60 p-3">{children}</div>}
    </div>
  );
}

export function NeedAnalysis({ to }: { to: string }) {
  return (
    <Empty title="Aucune analyse sélectionnée" action={<Link className="btn-primary" to="/import">Importer un APK</Link>}>
      Choisissez une analyse dans <Link className="text-cyan-x underline" to="/analyses">Mes analyses</Link> pour ouvrir le module {to}.
    </Empty>
  );
}
