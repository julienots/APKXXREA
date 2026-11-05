import { store, daysUntil, formatDate } from '../core/store';
import { COLLECTIONS, RARITY_COLOR, RARITY_LABEL } from '../core/catalog';
import { icon } from '../ui/icons';
import { $, $$, el, esc, sheet, toast } from '../ui/dom';
import { itemCard, openItem } from '../ui/actions';
import { thumbHTML } from '../ui/thumbs';
import { vibrate } from '../core/native';
import type { Screen } from './screen';

const KIND_LABEL = { saison: 'Saison', theme: 'Thème', evenement: 'Événement', rare: 'Rare' };

export function createCollections(): Screen {
  const root = el(`<section class="screen" id="scr-collections"><div class="scroll" id="coll-scroll"></div></section>`);
  const body = $('#coll-scroll', root);

  const render = () => {
    const totals = COLLECTIONS.map((c) => store.collectionProgress(c.id));
    const owned = totals.reduce((a, b) => a + b.owned, 0);
    const all = totals.reduce((a, b) => a + b.total, 0);
    body.innerHTML = `
      <div class="card mt-s row gap">
        <div style="width:58px;height:58px;border-radius:18px;display:grid;place-items:center;background:rgba(255,205,32,.14);color:var(--yellow)">${icon('collections', 30)}</div>
        <div class="grow"><b>Progression globale</b><div class="progress"><i style="width:${(owned / all) * 100}%"></i></div><span class="tiny muted">${owned} / ${all} objets${store.state.title ? ` - titre : ${esc(store.state.title)}` : ''}</span></div>
      </div>
      <div class="row gap wrap mt">${(Object.keys(RARITY_LABEL) as (keyof typeof RARITY_LABEL)[]).map((r) => `<span class="pill"><i style="width:10px;height:10px;border-radius:3px;background:${RARITY_COLOR[r]}"></i>${RARITY_LABEL[r]}</span>`).join('')}</div>
      <div class="mt">${COLLECTIONS.map((c, idx) => {
        const p = totals[idx];
        const done = p.owned >= p.total;
        const claimed = store.state.claimedCollections.includes(c.id);
        const timeTag = c.until ? (daysUntil(c.until) >= 0 ? `<span class="tag limited">${daysUntil(c.until)} j restants</span>` : '<span class="tag">Terminé</span>') : c.from && daysUntil(c.from) > 0 ? `<span class="tag soon">Le ${formatDate(c.from)}</span>` : '';
        return `<div class="coll" data-c="${c.id}">
          <div class="coll-head" style="background:linear-gradient(135deg,${c.colors[0]},${c.colors[1]})">
            <div class="row gap-s" style="position:relative;z-index:1;margin-bottom:8px"><span class="tag">${KIND_LABEL[c.kind]}</span>${timeTag}</div>
            <h3>${esc(c.name)}</h3><p>${esc(c.tagline)}</p></div>
          <div class="coll-body">
            <div class="row between"><span class="small"><b>${p.owned}</b> / ${p.total}</span><span class="small muted">${icon('gem', 13)} ${c.reward} + titre « ${esc(c.rewardTitle)} »</span></div>
            <div class="progress"><i style="width:${(p.owned / p.total) * 100}%"></i></div>
            <div class="mini-grid">${p.items.slice(0, 12).map((i) => `<div class="mini ${store.owns(i.id) ? 'owned' : ''}">${thumbHTML(i)}</div>`).join('')}</div>
            ${done && !claimed ? `<button class="btn primary block mt" data-claim="${c.id}">${icon('gift', 18)}Récupérer la récompense</button>` : claimed ? `<p class="small mt-s" style="color:var(--green)">${icon('check', 14)} Collection complétée</p>` : ''}
          </div></div>`;
      }).join('')}</div>`;
    $$('[data-claim]', body).forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      const n = store.claimCollection(b.dataset.claim!);
      if (n) { vibrate(60); toast(`Collection complétée : +${n} Éclats`, 'ok'); render(); }
    }));
    $$('[data-c]', body).forEach((b) => (b.onclick = () => openCollection(b.dataset.c!)));
  };

  const openCollection = (id: string) => {
    const c = COLLECTIONS.find((x) => x.id === id)!;
    const s = sheet(c.name, '', { tall: true });
    const r = () => {
      const p = store.collectionProgress(id);
      s.body.innerHTML = `<p class="muted small">${esc(c.tagline)} - ${p.owned}/${p.total} objets</p><div class="item-grid mt">${p.items.map((i) => itemCard(i)).join('')}</div>`;
      $$('[data-item]', s.body).forEach((b) => (b.onclick = () => openItem(b.dataset.item!, () => { r(); render(); })));
    };
    r();
  };

  return {
    id: 'collections',
    el: root,
    show(arg) {
      render();
      if (arg) setTimeout(() => openCollection(arg), 50);
    },
    hide() {},
  };
}
