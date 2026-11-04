import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { IDashboard, IUpload, IList, IScan, ICode, IPhone, IBox, IHammer, ISettings, IMenu, IX } from './icons';
import { lastAnalysis, lastProject } from '../lib/util';

const NAV = [
  { to: '/', label: 'Dashboard', icon: IDashboard, end: true },
  { to: '/import', label: 'Importer APK', icon: IUpload },
  { to: '/analyses', label: 'Mes analyses', icon: IList },
  { to: '/analyzer', label: 'APK Analyzer', icon: IScan, withAnalysis: true },
  { to: '/code', label: 'Code Explorer', icon: ICode, withAnalysis: true },
  { to: '/ui', label: 'UI Reconstructor', icon: IPhone, withAnalysis: true },
  { to: '/projects', label: 'Project Rebuilder', icon: IBox },
  { to: '/builder', label: 'APK Builder', icon: IHammer, withProject: true },
  { to: '/settings', label: 'Paramètres', icon: ISettings },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/icon.svg" alt="" width={32} height={32} className="rounded-lg" />
      <div>
        <div className="text-[15px] font-bold tracking-[0.18em]">
          APP<span className="text-cyan-x">XRAY</span>
        </div>
        <div className="text-[10px] tracking-wider text-ink-400">APK analysis · rebuild</div>
      </div>
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const loc = useLocation();
  const a = lastAnalysis();
  const p = lastProject();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Navigation principale">
      {NAV.map((n, i) => {
        const target = n.withAnalysis && a ? `${n.to}/${a}` : n.withProject && p ? `${n.to}/${p}` : n.to;
        const active = n.end ? loc.pathname === '/' : loc.pathname.startsWith(n.to);
        const Icon = n.icon;
        return (
          <NavLink
            key={n.to}
            to={target}
            onClick={onNavigate}
            className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition ${active ? 'bg-volt-500/15 text-white shadow-[inset_0_0_0_1px_rgb(47_107_255/0.35)]' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100'}`}
          >
            <span className={`text-[10px] tabular-nums ${active ? 'text-cyan-x' : 'text-ink-500'}`}>{String(i + 1).padStart(2, '0')}</span>
            <Icon className={active ? 'text-cyan-x' : 'text-ink-400 group-hover:text-ink-200'} />
            <span className="truncate">{n.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r border-ink-700/80 bg-ink-950/60 p-4 backdrop-blur lg:flex">
        <Logo />
        <NavItems />
        <div className="mt-auto rounded-xl border border-ink-700 p-3 text-[11px] leading-relaxed text-ink-400">
          Analysez uniquement des APK qui vous appartiennent ou pour lesquels vous disposez d'une autorisation.
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-700/80 bg-ink-900/85 px-4 py-3 backdrop-blur lg:hidden" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <Logo />
          <button className="btn-ghost !min-h-10 !px-3" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
            <IMenu />
          </button>
        </header>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col gap-5 overflow-y-auto border-r border-ink-700 bg-ink-900 p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
              <div className="flex items-center justify-between">
                <Logo />
                <button className="btn-ghost !min-h-10 !px-3" onClick={() => setOpen(false)} aria-label="Fermer le menu">
                  <IX />
                </button>
              </div>
              <NavItems onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}
        <main className="mx-auto w-full max-w-[1500px] min-w-0 flex-1 px-4 py-5 sm:px-6 lg:py-8" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
