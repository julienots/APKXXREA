import { store, defaultAvatar, uid } from '../core/store';
import { itemsOf, SKIN_TONES, HAIR_COLORS, EYE_COLORS, CLOTH_COLORS } from '../core/catalog';
import type { AvatarConfig, Slot } from '../core/types';
import { stage } from '../scene/Stage';
import { icon } from '../ui/icons';
import { $, $$, el, esc, sheet, toast, promptDialog, confirmDialog, pickFile } from '../ui/dom';
import { itemCard, openItem, equip, isEquipped, navigate } from '../ui/actions';
import { putBlob, delBlob } from '../record/db';
import { vibrate } from '../core/native';
import type { Screen } from './screen';

type Cat = { id: string; label: string; slot?: Slot; colors?: { key: keyof AvatarConfig; label: string; palette: string[] }[] };

const CATS: Cat[] = [
  { id: 'base', label: 'Base', slot: 'base', colors: [{ key: 'skin', label: 'Peau', palette: SKIN_TONES }] },
  { id: 'hair', label: 'Cheveux', slot: 'hair', colors: [{ key: 'hairColor', label: 'Couleur', palette: HAIR_COLORS }, { key: 'hairColor2', label: 'Mèches', palette: HAIR_COLORS }] },
  { id: 'eyes', label: 'Yeux', slot: 'eyes', colors: [{ key: 'eyeColor', label: 'Iris', palette: EYE_COLORS }] },
  { id: 'brows', label: 'Sourcils', slot: 'brows' },
  { id: 'mouth', label: 'Bouche', slot: 'mouth' },
  { id: 'outfit', label: 'Tenue', slot: 'outfit', colors: [{ key: 'outfitColor', label: 'Principale', palette: CLOTH_COLORS }, { key: 'outfitColor2', label: 'Détails', palette: CLOTH_COLORS }] },
  { id: 'accessory', label: 'Accessoires', slot: 'accessory', colors: [{ key: 'accentColor', label: 'Lumières', palette: CLOTH_COLORS }] },
  { id: 'shape', label: 'Proportions' },
];

export function createCreator(): Screen {
  const st = stage();
  const root = el(`<section class="screen" id="scr-create">
    <div class="avatar-slots" id="slots"></div>
    <div class="creator-stage"><div class="stage-frame" id="create-frame"></div>
      <div class="overlay-tr" style="right:14px;top:8px">
        <button class="icon-btn glass" data-a="spin" aria-label="Rotation">${icon('rotate')}</button>
        <button class="icon-btn glass" data-a="zoom" aria-label="Zoom">${icon('zoom')}</button>
        <button class="icon-btn glass" data-a="random" aria-label="Aléatoire">${icon('sparkle')}</button>
      </div>
    </div>
    <div class="creator-panel">
      <div class="cat-tabs" id="cats"></div>
      <div id="swatch-rows"></div>
      <div class="scroll" id="grid-wrap" style="padding-top:2px"></div>
    </div>
  </section>`);
  const frame = $('#create-frame', root);
  let cat = CATS[0];
  let visible = false;

  // ---------------------------------------------------------------- drag to rotate
  let dragX: number | null = null;
  frame.addEventListener('pointerdown', (e) => { dragX = e.clientX; st.autoTurn = false; frame.setPointerCapture(e.pointerId); });
  frame.addEventListener('pointermove', (e) => {
    if (dragX === null) return;
    st.turn += (e.clientX - dragX) * 0.012;
    dragX = e.clientX;
  });
  frame.addEventListener('pointerup', () => { dragX = null; });
  $('[data-a="spin"]', root).onclick = () => { st.autoTurn = !st.autoTurn; if (!st.autoTurn) st.turn = 0; };
  $('[data-a="zoom"]', root).onclick = () => { st.setFraming(st.framing === 'close' ? 'full' : st.framing === 'full' ? 'bust' : 'close'); };
  $('[data-a="random"]', root).onclick = () => randomize();

  // ---------------------------------------------------------------- avatar slots
  const renderSlots = () => {
    const s = store.state;
    $('#slots', root).innerHTML = s.avatars.map((a) => `<button class="slot-chip ${a.id === s.activeAvatar ? 'active' : ''}" data-av="${a.id}">${icon(a.kind === 'vrm' ? 'layers' : 'profile', 16)}${esc(a.name)}</button>`).join('')
      + `<button class="slot-chip" data-a="new">${icon('plus', 16)}Nouveau</button><button class="slot-chip" data-a="opts">${icon('settings', 16)}Gérer</button>`;
    $$('[data-av]', root).forEach((b) => (b.onclick = () => {
      if (b.dataset.av === s.activeAvatar) return;
      store.update((x) => { x.activeAvatar = b.dataset.av!; });
      renderAll();
    }));
    $('[data-a="new"]', root).onclick = () => newAvatar();
    $('[data-a="opts"]', root).onclick = () => manage();
  };

  const canAdd = () => {
    if (store.state.avatars.length >= store.maxAvatars) {
      toast(store.isPro ? 'Limite de 10 avatars atteinte.' : 'Plusieurs avatars : fonctionnalité Pro.', 'warn');
      if (!store.isPro) navigate('profile:pro');
      return false;
    }
    return true;
  };

  const newAvatar = () => {
    if (!canAdd()) return;
    const a = defaultAvatar(`Avatar ${store.state.avatars.length + 1}`);
    store.update((s) => { s.avatars.push(a); s.activeAvatar = a.id; });
    renderAll();
  };

  const manage = () => {
    const a = store.avatar;
    const s = sheet(a.name, `<div class="col">
      <button class="list-item" data-m="rename">${icon('edit')}<div class="lbl"><b>Renommer</b></div></button>
      <button class="list-item" data-m="dup">${icon('copy')}<div class="lbl"><b>Dupliquer</b><span>${store.isPro ? '' : 'Pro'}</span></div></button>
      <button class="list-item" data-m="vrm">${icon('upload')}<div class="lbl"><b>Importer un modèle VRM</b><span>Avatar 3D VRoid, VRM 0.x ou 1.0</span></div></button>
      <button class="list-item" data-m="reset">${icon('rotate')}<div class="lbl"><b>Réinitialiser l'apparence</b></div></button>
      ${store.state.avatars.length > 1 ? `<button class="list-item" data-m="del" style="color:var(--red)">${icon('trash')}<div class="lbl"><b>Supprimer cet avatar</b></div></button>` : ''}
    </div>`);
    $$('[data-m]', s.body).forEach((b) => (b.onclick = async () => {
      const m = b.dataset.m;
      s.close();
      if (m === 'rename') {
        const n = await promptDialog('Renommer', 'Nom de l\'avatar', a.name);
        if (n) store.updateAvatar({ name: n.slice(0, 24) });
      } else if (m === 'dup') {
        if (!canAdd()) return;
        const c: AvatarConfig = { ...a, accessories: [...a.accessories], id: uid(), name: a.name + ' (copie)' };
        store.update((x) => { x.avatars.push(c); x.activeAvatar = c.id; });
      } else if (m === 'vrm') {
        await importVrm();
      } else if (m === 'reset') {
        const d = defaultAvatar(a.name);
        store.updateAvatar({ ...d, id: a.id, kind: 'toon', vrmKey: undefined });
      } else if (m === 'del') {
        if (await confirmDialog('Supprimer', `Supprimer définitivement ${a.name} ?`, 'Supprimer', true)) {
          if (a.vrmKey) await delBlob(a.vrmKey).catch(() => {});
          store.update((x) => {
            x.avatars = x.avatars.filter((v) => v.id !== a.id);
            x.activeAvatar = x.avatars[0].id;
          });
        }
      }
      renderAll();
    }));
  };

  const importVrm = async () => {
    const f = await pickFile('.vrm,model/gltf-binary,application/octet-stream');
    if (!f) return;
    if (!/\.vrm$/i.test(f.name)) { toast('Choisissez un fichier .vrm', 'warn'); return; }
    if (f.size > 80e6) { toast('Fichier trop lourd (80 Mo max).', 'warn'); return; }
    const key = 'vrm-' + uid();
    await putBlob(key, f);
    const cur = store.avatar;
    const replace = cur.kind === 'toon' && store.state.avatars.length >= store.maxAvatars;
    const cfg: AvatarConfig = { ...defaultAvatar(f.name.replace(/\.vrm$/i, '').slice(0, 24)), kind: 'vrm', vrmKey: key };
    if (replace) {
      if (!(await confirmDialog('Remplacer l\'avatar', 'La version gratuite garde un seul avatar : le modèle VRM remplacera votre avatar actuel.', 'Remplacer'))) return;
      store.updateAvatar({ kind: 'vrm', vrmKey: key, name: cfg.name });
    } else {
      store.update((s) => { s.avatars.push(cfg); s.activeAvatar = cfg.id; });
    }
    toast('Chargement du modèle VRM...');
    try {
      await st.setAvatar(store.avatar);
      toast('Modèle VRM importé', 'ok');
    } catch (e) {
      toast((e as Error).message || 'Modèle VRM illisible', 'warn');
    }
    renderAll();
  };

  const randomize = () => {
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const owned = (slot: Slot) => itemsOf(slot).filter((i) => store.owns(i.id));
    const accs = owned('accessory').sort(() => Math.random() - 0.5).slice(0, Math.random() > 0.5 ? 1 : 0);
    const outfit = pick(owned('outfit'));
    store.updateAvatar({
      kind: 'toon',
      base: pick(owned('base')).id, skin: pick(SKIN_TONES.slice(0, 8)), hair: pick(owned('hair')).id,
      hairColor: pick(HAIR_COLORS), hairColor2: pick(HAIR_COLORS), eyes: pick(owned('eyes')).id, eyeColor: pick(EYE_COLORS),
      brows: pick(owned('brows')).id, mouth: pick(owned('mouth')).id, outfit: outfit.id,
      outfitColor: outfit.color ?? pick(CLOTH_COLORS), outfitColor2: outfit.color2 ?? pick(CLOTH_COLORS), accessories: accs.map((a) => a.id),
    });
    vibrate(20);
    renderAll();
  };

  // ---------------------------------------------------------------- categories
  const renderCats = () => {
    $('#cats', root).innerHTML = CATS.map((c) => `<button class="${c.id === cat.id ? 'active' : ''}" data-c="${c.id}">${c.label}</button>`).join('');
    $$('[data-c]', root).forEach((b) => (b.onclick = () => {
      cat = CATS.find((c) => c.id === b.dataset.c)!;
      st.setFraming(cat.id === 'outfit' || cat.id === 'shape' ? 'full' : cat.id === 'accessory' || cat.id === 'base' ? 'bust' : 'close');
      renderCats();
      renderBody();
    }));
  };

  const renderBody = () => {
    const a = store.avatar;
    const sw = $('#swatch-rows', root);
    const wrap = $('#grid-wrap', root);
    if (a.kind === 'vrm') {
      sw.innerHTML = '';
      wrap.innerHTML = `<div class="card mt"><h3>${icon('layers')} Modèle VRM</h3><p class="muted small mt-s">Cet avatar utilise un modèle 3D importé. Le suivi du visage, la bouche, les expressions et les animations fonctionnent ; l'apparence se modifie dans votre logiciel de création VRM.</p>
        <button class="btn block mt" data-a="toon">${icon('create', 18)}Revenir à un avatar personnalisable</button></div>`;
      $('[data-a="toon"]', wrap).onclick = () => { store.updateAvatar({ kind: 'toon' }); renderAll(); };
      return;
    }
    // colour rows
    sw.innerHTML = (cat.colors ?? []).map((c) => `<div class="swatches" data-key="${c.key}"><span class="swatch-label">${c.label}</span>${c.palette.map((p) => `<button class="swatch ${a[c.key] === p ? 'active' : ''}" style="background:${p}" data-col="${p}"></button>`).join('')}<label class="swatch custom">${icon('plus', 14)}<input type="color" value="${a[c.key]}"/></label></div>`).join('');
    $$('.swatches', sw).forEach((row) => {
      const key = row.dataset.key as keyof AvatarConfig;
      $$('[data-col]', row).forEach((b) => (b.onclick = () => { store.updateAvatar({ [key]: b.dataset.col } as Partial<AvatarConfig>); vibrate(6); renderBody(); }));
      const inp = $('input', row) as HTMLInputElement;
      inp.oninput = () => store.updateAvatar({ [key]: inp.value } as Partial<AvatarConfig>);
    });
    if (cat.id === 'shape') {
      wrap.innerHTML = `<div class="card">
        <div class="list-item"><div class="lbl"><b>Taille</b><span>Proportions générales</span></div><input type="range" min="0.85" max="1.15" step="0.01" value="${a.height}" data-r="height"/></div>
        <div class="list-item"><div class="lbl"><b>Joues roses</b><span>Intensité du blush</span></div><input type="range" min="0" max="1" step="0.05" value="${a.blush}" data-r="blush"/></div></div>`;
      $$('[data-r]', wrap).forEach((r) => ((r as HTMLInputElement).oninput = () => store.updateAvatar({ [r.dataset.r!]: Number((r as HTMLInputElement).value) } as Partial<AvatarConfig>)));
      return;
    }
    const items = itemsOf(cat.slot!).sort((x, y) => Number(store.owns(y.id)) - Number(store.owns(x.id)));
    wrap.innerHTML = `${cat.id === 'accessory' ? '<p class="muted small" style="margin:4px 0 10px">Jusqu\'à 4 accessoires. Touchez pour ajouter ou retirer.</p>' : ''}<div class="item-grid">${items.map((i) => itemCard(i, { selected: isEquipped(i) })).join('')}</div>`;
    $$('[data-item]', wrap).forEach((b) => (b.onclick = () => {
      const i = items.find((x) => x.id === b.dataset.item)!;
      if (store.owns(i.id)) {
        equip(i);
        $$('[data-item]', wrap).forEach((c) => c.classList.toggle('selected', isEquipped(items.find((x) => x.id === c.dataset.item)!)));
      } else openItem(i.id, renderBody);
    }));
  };

  const renderAll = () => {
    renderSlots();
    renderCats();
    renderBody();
  };

  let lastSig = '';
  store.subscribe(() => {
    if (!visible) return;
    const sig = store.state.activeAvatar + store.state.avatars.length + store.state.inventory.length + String(store.isPro);
    if (sig !== lastSig) {
      lastSig = sig;
      renderSlots();
    }
  });

  return {
    id: 'create',
    el: root,
    show() {
      visible = true;
      st.mount(frame);
      st.setFraming('close');
      st.zoom = 1;
      renderAll();
    },
    hide() {
      visible = false;
      st.autoTurn = false;
      st.turn = 0;
    },
  };
}
