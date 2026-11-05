import { store, daysUntil } from '../core/store';
import { ITEMS, COLLECTIONS, DAILY_MISSIONS, SLOT_LABEL } from '../core/catalog';
import type { Slot } from '../core/types';
import { icon } from '../ui/icons';
import { $, $$, el, esc, toast } from '../ui/dom';
import { itemCard, openItem, navigate } from '../ui/actions';
import { vibrate } from '../core/native';
import type { Screen } from './screen';

const FILTERS: { id: string; label: string; slots?: Slot[] }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'outfit', label: 'Tenues', slots: ['outfit'] },
  { id: 'hair', label: 'Coiffures', slots: ['hair'] },
  { id: 'acc', label: 'Accessoires', slots: ['accessory'] },
  { id: 'face', label: 'Visage', slots: ['base', 'eyes', 'brows', 'mouth'] },
  { id: 'exp', label: 'Expressions', slots: ['expression'] },
  { id: 'anim', label: 'Animations', slots: ['animation'] },
  { id: 'bg', label: 'Décors', slots: ['background'] },
];

const RANK = { legendaire: 0, epique: 1, rare: 2, commun: 3 };

export function createShop(): Screen {
  const root = el(`<section class="screen" id="scr-shop"><div class="scroll" id="shop-scroll"></div></section>`);
  const body = $('#shop-scroll', root);
  let filter = 'all';

  const render = () => {
    const limited = COLLECTIONS.find((c) => c.until && daysUntil(c.until) >= 0);
    const monthly = store.monthlyProSelection();
    const f = FILTERS.find((x) => x.id === filter)!;
    const list = ITEMS.filter((i) => (i.price > 0 || i.pro) && (!f.slots || f.slots.includes(i.slot)) && !(store.expired(i) && !store.owns(i.id)))
      .sort((a, b) => Number(store.owns(a.id)) - Number(store.owns(b.id)) || RANK[a.rarity] - RANK[b.rarity] || a.price - b.price);
    const canDaily = store.canClaimDaily();
    body.innerHTML = `
      <div class="card daily mt-s">
        <div class="giftbox">${icon('gift', 28)}</div>
        <div class="grow"><b>Coffre du jour</b><p class="muted small">${canDaily ? `${store.dailyAmount()} Éclats vous attendent${store.isPro ? ' (bonus Pro x3)' : ''}` : 'Revenez demain pour un nouveau coffre'}</p></div>
        <button class="btn small ${canDaily ? 'primary' : ''}" data-a="daily" ${canDaily ? '' : 'disabled'}>${canDaily ? 'Ouvrir' : 'Ouvert'}</button>
      </div>
      ${limited ? `<div class="hero mt" style="background:linear-gradient(135deg,${limited.colors[0]},${limited.colors[1]})">
        <span class="tag limited" style="position:relative;z-index:1;width:max-content">${icon('clock', 12)}&nbsp;Plus que ${daysUntil(limited.until!)} jours</span>
        <h3 style="position:relative;z-index:1">${esc(limited.name)}</h3><p style="position:relative;z-index:1">Objets exclusifs disponibles pour une durée limitée.</p>
        <div class="row gap mt-s"><button class="btn small primary" data-go="collections:${limited.id}">Voir la collection</button></div></div>` : ''}
      <h2 class="section">${icon('crown', 20, 'yellow')}Sélection Pro du mois</h2>
      <p class="muted small" style="margin:-6px 0 10px">${store.isPro ? 'Inclus dans votre abonnement ce mois-ci.' : 'Ces objets sont offerts aux membres Pro ce mois-ci.'}</p>
      <div class="hscroll">${monthly.map((i) => itemCard(i)).join('')}</div>
      <h2 class="section">${icon('sparkle', 20, 'yellow')}Missions du jour</h2>
      <div class="card">${DAILY_MISSIONS.map((m) => {
        const p = store.missionProgress(m.id);
        return `<div class="mission"><div class="grow"><b style="font-size:14px">${esc(m.label)}</b>
          <div class="progress"><i style="width:${(p.value / m.goal) * 100}%"></i></div><span class="tiny muted">${m.stat === 'trackedSeconds' ? `${Math.floor(p.value / 60)}/${m.goal / 60} min` : `${p.value}/${m.goal}`}</span></div>
          <button class="btn small ${p.done && !p.claimed ? 'primary' : ''}" data-m="${m.id}" ${p.done && !p.claimed ? '' : 'disabled'}>${p.claimed ? icon('check', 16) : `${icon('gem', 14)}${m.reward}`}</button></div>`;
      }).join('')}</div>
      <h2 class="section">${icon('shop', 20, 'yellow')}Boutique</h2>
      <div class="filter-tabs">${FILTERS.map((x) => `<button class="${x.id === filter ? 'active' : ''}" data-f="${x.id}">${x.label}</button>`).join('')}</div>
      <div class="item-grid mt">${list.map((i) => itemCard(i)).join('')}</div>
      <p class="muted tiny mt" style="text-align:center">Nouveaux modules à chaque mise à jour. Gagnez des Éclats avec le coffre du jour, les missions et les collections.</p>`;
    $('[data-a="daily"]', body).onclick = () => {
      const n = store.claimDaily();
      if (n) { vibrate(40); toast(`+${n} Éclats`, 'ok'); render(); }
    };
    $$('[data-m]', body).forEach((b) => (b.onclick = () => {
      const n = store.claimMission(b.dataset.m!);
      if (n) { vibrate(30); toast(`+${n} Éclats`, 'ok'); render(); }
    }));
    $$('[data-f]', body).forEach((b) => (b.onclick = () => { filter = b.dataset.f!; render(); }));
    $$('[data-go]', body).forEach((b) => (b.onclick = () => navigate(b.dataset.go!)));
    $$('[data-item]', body).forEach((b) => (b.onclick = () => openItem(b.dataset.item!, render)));
  };

  return {
    id: 'shop',
    el: root,
    show(arg) {
      if (arg && FILTERS.some((f) => f.id === arg)) filter = arg;
      render();
    },
    hide() {},
  };
}

export { SLOT_LABEL };
