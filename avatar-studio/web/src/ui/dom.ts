import { icon } from './icons';

export function $(sel: string, root: ParentNode = document): HTMLElement {
  return root.querySelector(sel) as HTMLElement;
}

export function $$(sel: string, root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll(sel)) as HTMLElement[];
}

export function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

let toastTimer = 0;
export function toast(msg: string, kind: 'info' | 'ok' | 'warn' = 'info'): void {
  let t = document.getElementById('toast');
  if (!t) {
    t = el('<div id="toast" role="status"></div>');
    document.body.appendChild(t);
  }
  t.className = `toast show ${kind}`;
  t.innerHTML = `${icon(kind === 'ok' ? 'check' : kind === 'warn' ? 'info' : 'sparkle', 18)}<span>${esc(msg)}</span>`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t!.classList.remove('show'), 2600);
}

export interface SheetHandle {
  root: HTMLElement;
  body: HTMLElement;
  close: () => void;
}

const sheetStack: SheetHandle[] = [];

/** Bottom sheet (mobile modal). */
export function sheet(title: string, content: string | HTMLElement, opts: { tall?: boolean; onClose?: () => void; className?: string } = {}): SheetHandle {
  const root = el(`<div class="sheet-wrap ${opts.className ?? ''}"><div class="sheet-backdrop"></div><div class="sheet ${opts.tall ? 'tall' : ''}" role="dialog" aria-label="${esc(title)}">
    <div class="sheet-grip"></div>
    <div class="sheet-head"><h3>${esc(title)}</h3><button class="icon-btn sheet-close" aria-label="Fermer">${icon('close')}</button></div>
    <div class="sheet-body"></div></div></div>`);
  const body = $('.sheet-body', root);
  if (typeof content === 'string') body.innerHTML = content;
  else body.appendChild(content);
  document.body.appendChild(root);
  requestAnimationFrame(() => root.classList.add('open'));
  const handle: SheetHandle = {
    root,
    body,
    close: () => {
      const i = sheetStack.indexOf(handle);
      if (i >= 0) sheetStack.splice(i, 1);
      root.classList.remove('open');
      setTimeout(() => root.remove(), 260);
      opts.onClose?.();
    },
  };
  $('.sheet-backdrop', root).onclick = handle.close;
  $('.sheet-close', root).onclick = handle.close;
  sheetStack.push(handle);
  return handle;
}

export function closeTopSheet(): boolean {
  const s = sheetStack[sheetStack.length - 1];
  if (!s) return false;
  s.close();
  return true;
}

export function confirmDialog(title: string, msg: string, ok = 'Confirmer', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const s = sheet(title, `<p class="muted">${esc(msg)}</p><div class="row gap end mt"><button class="btn ghost" data-a="no">Annuler</button><button class="btn ${danger ? 'danger' : 'primary'}" data-a="yes">${esc(ok)}</button></div>`, {
      onClose: () => { if (!done) resolve(false); },
    });
    $$('[data-a]', s.body).forEach((b) => (b.onclick = () => {
      done = true;
      resolve(b.dataset.a === 'yes');
      s.close();
    }));
  });
}

export function promptDialog(title: string, label: string, value = '', placeholder = ''): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const s = sheet(title, `<label class="field"><span>${esc(label)}</span><input class="input" maxlength="160" value="${esc(value)}" placeholder="${esc(placeholder)}"/></label><div class="row gap end mt"><button class="btn ghost" data-a="no">Annuler</button><button class="btn primary" data-a="yes">Valider</button></div>`, {
      onClose: () => { if (!done) resolve(null); },
    });
    const input = $('input', s.body) as HTMLInputElement;
    setTimeout(() => input.focus(), 250);
    const ok = () => { done = true; resolve(input.value.trim()); s.close(); };
    input.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
    $$('[data-a]', s.body).forEach((b) => (b.onclick = () => (b.dataset.a === 'yes' ? ok() : s.close())));
  });
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = () => resolve(i.files?.[0] ?? null);
    i.click();
  });
}

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function fmtSize(b: number): string {
  return b > 1e6 ? `${(b / 1e6).toFixed(1)} Mo` : `${Math.round(b / 1e3)} Ko`;
}
