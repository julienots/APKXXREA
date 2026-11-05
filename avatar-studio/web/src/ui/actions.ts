import { item, RARITY_COLOR, RARITY_LABEL, SLOT_LABEL, COLLECTIONS } from '../core/catalog';
import { store, daysUntil, formatDate } from '../core/store';
import type { AvatarConfig, Item } from '../core/types';
import { stage } from '../scene/Stage';
import { icon } from './icons';
import { $, esc, sheet, toast } from './dom';
import { thumbHTML } from './thumbs';
import { vibrate } from '../core/native';
import { APP_VERSION } from '../core/catalog';

export type Navigate = (route: string) => void;
let nav: Navigate = () => {};
export function setNavigator(n: Navigate): void {
  nav = n;
}
export function navigate(route: string): void {
  nav(route);
}

/** Applies an owned item to the active avatar / studio. */
export function equip(i: Item): void {
  if (!store.owns(i.id)) return;
  vibrate(10);
  switch (i.slot) {
    case 'base': store.updateAvatar({ base: i.id }); break;
    case 'hair': store.updateAvatar({ hair: i.id }); break;
    case 'eyes': store.updateAvatar({ eyes: i.id }); break;
    case 'brows': store.updateAvatar({ brows: i.id }); break;
    case 'mouth': store.updateAvatar({ mouth: i.id }); break;
    case 'outfit': {
      const patch: Partial<AvatarConfig> = { outfit: i.id };
      if (i.color) patch.outfitColor = i.color;
      if (i.color2) patch.outfitColor2 = i.color2;
      store.updateAvatar(patch);
      break;
    }
    case 'accessory': {
      const cur = store.avatar.accessories;
      if (cur.includes(i.id)) store.updateAvatar({ accessories: cur.filter((x) => x !== i.id) });
      else {
        if (cur.length >= 4) {
          toast('4 accessoires maximum : retirez-en un.', 'warn');
          return;
        }
        store.updateAvatar({ accessories: [...cur, i.id] });
      }
      break;
    }
    case 'background':
      store.update((s) => { s.background = i.id; });
      break;
    case 'expression':
      stage().triggerExpression(i.style);
      break;
    case 'animation':
      stage().playAnimation(i.style);
      break;
  }
}

export function isEquipped(i: Item): boolean {
  const a = store.avatar;
  switch (i.slot) {
    case 'base': return a.base === i.id;
    case 'hair': return a.hair === i.id;
    case 'eyes': return a.eyes === i.id;
    case 'brows': return a.brows === i.id;
    case 'mouth': return a.mouth === i.id;
    case 'outfit': return a.outfit === i.id;
    case 'accessory': return a.accessories.includes(i.id);
    case 'background': return store.state.background === i.id;
    default: return false;
  }
}

export function badges(i: Item): string {
  const out: string[] = [];
  if (i.addedIn === APP_VERSION && !store.state.inventory.includes(i.id) && i.price > 0) out.push('<span class="tag new">Nouveau</span>');
  if (i.until && !store.expired(i)) out.push('<span class="tag limited">Limité</span>');
  if (i.pro) out.push('<span class="tag pro">Pro</span>');
  if (store.notYetAvailable(i)) out.push('<span class="tag soon">Bientôt</span>');
  return out.join('');
}

export function priceHTML(i: Item): string {
  if (store.owns(i.id)) return `<div class="price owned">${icon('check', 13)}Possédé</div>`;
  if (i.pro) return `<div class="price">${icon('crown', 13)}Pro</div>`;
  if (store.expired(i)) return `<div class="price">Terminé</div>`;
  return `<div class="price">${icon('gem', 13)}${i.price}</div>`;
}

export function itemCard(i: Item, opts: { selected?: boolean } = {}): string {
  const owned = store.owns(i.id);
  return `<button class="item-card ${opts.selected ? 'selected' : ''} ${owned ? '' : 'locked'}" data-item="${i.id}">
    <div class="thumb">${thumbHTML(i)}<div class="corner">${badges(i)}</div>${owned ? '' : `<div class="lockbadge">${icon('lock', 14)}</div>`}</div>
    <div class="rar" style="background:${RARITY_COLOR[i.rarity]}"></div>
    <div class="meta"><div class="name">${esc(i.name)}</div>${priceHTML(i)}</div>
  </button>`;
}

/** Item detail sheet: preview, rarity, collection, try-on, purchase, equip. */
export function openItem(id: string, onChange?: () => void): void {
  const i = item(id);
  if (!i) return;
  let trying = false;
  const original = { ...store.avatar, accessories: [...store.avatar.accessories] };
  const coll = COLLECTIONS.find((c) => c.id === i.collection);
  const render = () => {
    const owned = store.owns(i.id);
    const block = store.purchaseBlock(i);
    const tryable = ['base', 'hair', 'eyes', 'brows', 'mouth', 'outfit', 'accessory', 'background', 'expression', 'animation'].includes(i.slot);
    let action = '';
    if (owned) {
      action = i.slot === 'expression' || i.slot === 'animation'
        ? `<button class="btn primary block" data-a="equip">${icon('play', 18)}Essayer maintenant</button>`
        : `<button class="btn primary block" data-a="equip">${isEquipped(i) && i.slot === 'accessory' ? 'Retirer' : isEquipped(i) ? 'Équipé' : 'Équiper'}</button>`;
    } else if (i.pro) {
      action = `<button class="btn primary block" data-a="pro">${icon('crown', 18)}Débloquer avec Pro</button>`;
    } else {
      action = `<button class="btn primary block" data-a="buy" ${block ? 'disabled' : ''}>${icon('gem', 18)}Acheter pour ${i.price}</button>${block ? `<p class="muted small mt-s" style="text-align:center">${esc(block)}</p>` : ''}`;
    }
    s.body.innerHTML = `
      <div class="detail-hero">${thumbHTML(i)}</div>
      <div class="row between mt"><div><h3 style="font-size:22px">${esc(i.name)}</h3>
        <div class="row gap-s mt-s"><span class="tag" style="background:${RARITY_COLOR[i.rarity]};color:#111">${RARITY_LABEL[i.rarity]}</span><span class="tag">${SLOT_LABEL[i.slot]}</span>${badges(i)}</div></div>
        <div class="pill yellow">${icon('gem', 15)}${store.state.coins}</div></div>
      ${coll ? `<p class="muted small mt">Collection <b style="color:var(--text)">${esc(coll.name)}</b>${coll.until ? ` - plus que ${Math.max(0, daysUntil(coll.until))} jours` : ''}${i.from && store.notYetAvailable(i) ? ` - sortie le ${formatDate(i.from)}` : ''}</p>` : ''}
      <div class="col gap mt">${action}${!owned && tryable ? `<button class="btn block" data-a="try">${icon('eye', 18)}${trying ? 'Essayage en cours' : 'Essayer'}</button>` : ''}</div>`;
    $('[data-a="equip"]', s.body)?.addEventListener('click', () => { equip(i); render(); onChange?.(); });
    $('[data-a="buy"]', s.body)?.addEventListener('click', () => {
      if (store.buy(i.id)) {
        vibrate(30);
        toast(`${i.name} ajouté à votre collection`, 'ok');
        trying = false;
        equip(i);
        render();
        onChange?.();
      }
    });
    $('[data-a="pro"]', s.body)?.addEventListener('click', () => { s.close(); navigate('profile:pro'); });
    $('[data-a="try"]', s.body)?.addEventListener('click', () => { tryOn(i); trying = true; render(); });
  };
  const tryOn = (it: Item) => {
    const st = stage();
    if (it.slot === 'expression') { st.triggerExpression(it.style); return; }
    if (it.slot === 'animation') { st.animator.play(it.style, 0); return; }
    if (it.slot === 'background') {
      const prev = store.state.background;
      store.state.background = it.id;
      st.setBackground(it.id);
      store.state.background = prev;
      return;
    }
    const cfg: AvatarConfig = { ...store.avatar, accessories: [...store.avatar.accessories] };
    if (it.slot === 'accessory') cfg.accessories = [...cfg.accessories.filter((x) => x !== it.id), it.id];
    else if (it.slot === 'outfit') { cfg.outfit = it.id; if (it.color) cfg.outfitColor = it.color; if (it.color2) cfg.outfitColor2 = it.color2; }
    else (cfg as unknown as Record<string, string>)[it.slot] = it.id;
    if (cfg.kind === 'vrm') cfg.kind = 'toon';
    void st.setAvatar(cfg);
  };
  const s = sheet(i.name, '', {
    onClose: () => {
      if (trying && !store.owns(i.id)) {
        void stage().setAvatar(store.avatar.id === original.id ? store.avatar : original);
        stage().setBackground(store.state.background);
      }
    },
  });
  render();
}
