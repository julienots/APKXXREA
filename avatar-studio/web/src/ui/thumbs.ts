import type { AvatarConfig, Item, Framing } from '../core/types';
import { store } from '../core/store';
import { stage } from '../scene/Stage';
import { animIcon, faceIcon } from './icons';

const cache = new Map<string, string>();
const queue: { key: string; cfg: AvatarConfig; framing: Framing; expression?: string }[] = [];
let pumping = false;

/** Preview colours for backgrounds (rendered as CSS tiles). */
export const BG_PREVIEW: Record<string, string> = {
  studio: 'linear-gradient(180deg,#1d1d24,#0d0d10)',
  gradient: 'radial-gradient(circle at 50% 40%,#ff9a5a,#ff4f8b 50%,#6b2bd6)',
  room: 'linear-gradient(180deg,#3b3f6b 60%,#4a3b5c 60%)',
  chroma: 'linear-gradient(180deg,#00b140,#00b140)',
  neon: 'linear-gradient(180deg,#06041a,#2b0b4a 60%,#ff2fa8)',
  cosmos: 'radial-gradient(circle at 30% 30%,#6b5bd6 8%,transparent 9%),linear-gradient(180deg,#020210,#3b1a6b)',
  forest: 'linear-gradient(180deg,#0b2b3a,#3b7a5b)',
  beach: 'linear-gradient(180deg,#2b1a5b,#ff6a6a 55%,#ffcd8a)',
  dojo: 'radial-gradient(circle at 50% 45%,#ff3b3b 14%,transparent 15%),linear-gradient(180deg,#120a10,#3a2a22)',
  haunted: 'radial-gradient(circle at 70% 30%,#ffe8a8 9%,transparent 10%),linear-gradient(180deg,#0b0618,#3b1a5b 70%,#ff7a1a)',
  snow: 'linear-gradient(180deg,#7aa8e8,#e8f4ff)',
  throne: 'linear-gradient(180deg,#2a0b1a,#6b2b1a)',
  custom: 'repeating-linear-gradient(45deg,#2a2a33 0 10px,#33333f 10px 20px)',
};

function sig(c: AvatarConfig): string {
  return [c.base, c.skin, c.hair, c.hairColor, c.hairColor2, c.eyes, c.eyeColor, c.brows, c.mouth, c.outfit, c.outfitColor, c.outfitColor2, c.accessories.join('+'), c.accentColor].join('|');
}

function variant(i: Item, a: AvatarConfig): { cfg: AvatarConfig; framing: Framing; expression?: string } {
  const cfg: AvatarConfig = { ...a, kind: 'toon', accessories: [...a.accessories] };
  let framing: Framing = 'close';
  switch (i.slot) {
    case 'base': cfg.base = i.id; break;
    case 'hair': cfg.hair = i.id; cfg.accessories = []; break;
    case 'eyes': cfg.eyes = i.id; break;
    case 'brows': cfg.brows = i.id; break;
    case 'mouth': cfg.mouth = i.id; cfg.accessories = cfg.accessories.filter((x) => x !== 'acc-mask'); break;
    case 'outfit':
      cfg.outfit = i.id;
      if (i.color) cfg.outfitColor = i.color;
      if (i.color2) cfg.outfitColor2 = i.color2;
      framing = 'bust';
      break;
    case 'accessory':
      cfg.accessories = [i.id];
      if (['wings', 'tail', 'scarf'].includes(i.style)) framing = 'bust';
      break;
    case 'expression':
      return { cfg, framing: 'close', expression: i.style };
  }
  return { cfg, framing };
}

function pump(): void {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const job = queue.shift();
    if (!job) {
      pumping = false;
      return;
    }
    if (!cache.has(job.key)) {
      try {
        cache.set(job.key, stage().renderThumbnail(job.cfg, job.framing, 168, job.expression));
      } catch {
        cache.set(job.key, '');
      }
      document.querySelectorAll<HTMLImageElement>(`img[data-thumb="${CSS.escape(job.key)}"]`).forEach((img) => {
        img.src = cache.get(job.key)!;
        img.classList.add('ready');
      });
    }
    setTimeout(step, 16);
  };
  setTimeout(step, 30);
}

/** Returns HTML for an item preview: a live 3D render when relevant, a vector glyph otherwise. */
export function thumbHTML(i: Item, avatar: AvatarConfig = store.avatar): string {
  if (i.slot === 'background') return `<div class="thumb-bg" style="background:${BG_PREVIEW[i.style] ?? BG_PREVIEW.studio}"></div>`;
  if (i.slot === 'animation') return `<div class="thumb-glyph">${animIcon(i.style, 34)}</div>`;
  if (avatar.kind === 'vrm' && i.slot === 'expression') return `<div class="thumb-glyph">${faceIcon(i.style, 40)}</div>`;
  const v = variant(i, avatar.kind === 'vrm' ? { ...avatar, kind: 'toon' } : avatar);
  const key = i.id + '#' + sig(v.cfg);
  const cached = cache.get(key);
  if (cached) return `<img class="thumb-img ready" alt="" src="${cached}"/>`;
  if (!queue.some((q) => q.key === key)) queue.push({ key, ...v });
  pump();
  return `<img class="thumb-img" alt="" data-thumb="${key}" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="/>`;
}

export function clearThumbQueue(): void {
  queue.length = 0;
}
