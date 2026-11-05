import './styles.css';
import { store } from './core/store';
import { APP_NAME, APP_VERSION, NEWS, STUDIO_NAME } from './core/catalog';
import { stage } from './scene/Stage';
import { icon } from './ui/icons';
import { $, $$, el, esc, sheet, closeTopSheet, toast } from './ui/dom';
import { setNavigator } from './ui/actions';
import { createStudio } from './screens/StudioScreen';
import { createCreator } from './screens/CreatorScreen';
import { createShop } from './screens/ShopScreen';
import { createCollections } from './screens/CollectionsScreen';
import { createProfile } from './screens/ProfileScreen';
import type { Screen } from './screens/screen';
import type { AvatarConfig } from './core/types';

const app = document.getElementById('app')!;

// ------------------------------------------------------------------ splash
const splash = el(`<div class="splash">
  <div class="presents">${STUDIO_NAME} présente</div>
  <img src="./brand/superessence-logo.png" alt="SuperEssence"/>
  <div class="app-title">Avatar <span>Studio</span></div>
  <div class="bar"><i></i></div><div class="status">Démarrage</div>
</div>`);
document.body.appendChild(splash);
const progress = (p: number, label: string) => {
  ($('.bar i', splash) as HTMLElement).style.width = `${Math.round(p * 100)}%`;
  $('.status', splash).textContent = label;
};

function avatarSig(a: AvatarConfig): string {
  return JSON.stringify({ ...a, name: '' });
}

async function boot(): Promise<void> {
  progress(0.1, 'Moteur 3D');
  const st = stage();
  await document.fonts?.load('600 16px Fredoka').catch(() => {});
  progress(0.3, 'Votre avatar');
  try {
    await st.setAvatar(store.avatar);
  } catch {
    store.updateAvatar({ kind: 'toon' });
    await st.setAvatar(store.avatar);
  }
  // Rebuild the avatar when its configuration changes
  let sig = avatarSig(store.avatar);
  let pending = 0;
  store.subscribe(() => {
    const n = avatarSig(store.avatar);
    if (n === sig) return;
    sig = n;
    clearTimeout(pending);
    pending = window.setTimeout(() => {
      st.setAvatar(store.avatar).catch((e) => toast((e as Error).message, 'warn'));
    }, 60);
  });
  progress(0.45, 'Suivi du visage (MediaPipe)');
  try {
    await st.tracker.init((p, l) => progress(0.45 + p * 0.5, l));
  } catch {
    progress(0.95, 'Suivi du visage indisponible');
  }
  progress(1, 'Prêt');
  buildShell();
  splash.classList.add('out');
  setTimeout(() => splash.remove(), 600);
  if (!store.state.onboarded) onboarding();
  else if (store.hasUnreadNews()) setTimeout(openNews, 700);
}

// ------------------------------------------------------------------ shell
const TABS = [
  { id: 'studio', label: 'Studio', icon: 'studio' },
  { id: 'create', label: 'Créer', icon: 'create' },
  { id: 'shop', label: 'Boutique', icon: 'shop' },
  { id: 'collections', label: 'Collections', icon: 'collections' },
  { id: 'profile', label: 'Profil', icon: 'profile' },
];

let current: Screen | null = null;
const screens: Record<string, Screen> = {};

function buildShell(): void {
  const shell = el(`<div class="shell">
    <header class="topbar">
      <img class="logo" src="./brand/superessence-logo.png" alt="SuperEssence"/>
      <div class="grow"></div>
      <button class="pill yellow" id="coins">${icon('gem', 15)}<span></span></button>
      <span class="pill pro hidden" id="pro-badge">PRO</span>
      <button class="icon-btn" id="news-btn" aria-label="Nouveautés">${icon('bell')}<span class="dot hidden"></span></button>
    </header>
    <main class="screen-host"></main>
    <nav class="tabbar">${TABS.map((t) => `<button data-tab="${t.id}">${icon(t.icon, 23)}<span>${t.label}</span></button>`).join('')}</nav>
  </div>`);
  app.appendChild(shell);
  const host = $('.screen-host', shell);
  for (const s of [createStudio(), createCreator(), createShop(), createCollections(), createProfile()]) {
    screens[s.id] = s;
    host.appendChild(s.el);
  }
  $$('[data-tab]', shell).forEach((b) => (b.onclick = () => go(b.dataset.tab!)));
  $('#news-btn', shell).onclick = openNews;
  $('#coins', shell).onclick = () => go('shop');
  const refresh = () => {
    $('#coins span', shell).textContent = String(store.state.coins);
    $('#news-btn .dot', shell).classList.toggle('hidden', !store.hasUnreadNews());
    $('#pro-badge', shell).classList.toggle('hidden', !store.isPro);
  };
  store.subscribe(refresh);
  refresh();
  setNavigator(go);
  go('studio');
}

function go(route: string): void {
  const [id, arg] = route.split(':');
  const next = screens[id];
  if (!next) return;
  while (closeTopSheet()) { /* close open sheets */ }
  if (current && current !== next) {
    current.hide();
    current.el.classList.remove('active');
  }
  current = next;
  next.el.classList.add('active');
  next.show(arg);
  $$('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
}

// ------------------------------------------------------------------ news
function openNews(): void {
  store.update((s) => { s.lastSeenNews = APP_VERSION; });
  const tagLabel = { nouveau: 'Nouveau', evenement: 'Événement', bientot: 'Bientôt', technologie: 'Technologie' };
  const tagClass = { nouveau: 'new', evenement: 'limited', bientot: 'soon', technologie: 'pro' };
  const art = { nouveau: 'sparkle', evenement: 'clock', bientot: 'gift', technologie: 'bolt' };
  const s = sheet(`Nouveautés - version ${APP_VERSION}`, `${NEWS.map((n) => `<div class="news-card">
      <div class="banner" style="background:linear-gradient(135deg,${n.colors[0]},${n.colors[1]})"><div class="banner-art">${icon(art[n.tag], 150)}</div><span class="tag ${tagClass[n.tag]}">${tagLabel[n.tag]}</span></div>
      <div class="content"><h3>${esc(n.title)}</h3><p class="muted small">${esc(n.body)}</p>${n.action ? `<button class="btn small primary mt" data-r="${n.action.route}">${esc(n.action.label)}</button>` : ''}</div></div>`).join('')}`, { tall: true });
  $$('[data-r]', s.body).forEach((b) => (b.onclick = () => go(b.dataset.r!)));
}

// ------------------------------------------------------------------ onboarding
function onboarding(): void {
  const pages = [
    { icon: 'create', title: 'Créez votre personnage', text: 'Base, coiffure, yeux, couleurs, tenues et accessoires : un avatar 3D qui vous ressemble, ou pas du tout.' },
    { icon: 'camera', title: 'Il bouge avec vous', text: 'Votre tête, vos yeux, vos sourcils et votre bouche pilotent l\'avatar en direct. Tout est calculé sur votre téléphone.' },
    { icon: 'film', title: 'Filmez sans vous montrer', text: 'Shorts verticaux, vidéos YouTube ou live sur fond vert : créez du contenu sans apparaître à l\'écran.' },
  ];
  let i = 0;
  const o = el('<div class="onb"></div>');
  const render = () => {
    const p = pages[i];
    o.innerHTML = `<div class="row between"><img src="./brand/superessence-logo.png" style="height:22px" alt=""/><button class="btn small ghost" data-a="skip">Passer</button></div>
      <div class="art"><div class="disc">${icon(p.icon, 120)}</div></div>
      <h2>${p.title}</h2><p>${p.text}</p>
      <div class="dots">${pages.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <button class="btn primary block" data-a="next">${i < pages.length - 1 ? 'Suivant' : 'Activer la caméra et commencer'}</button>`;
    $('[data-a="skip"]', o).onclick = finish;
    $('[data-a="next"]', o).onclick = () => {
      if (i < pages.length - 1) { i++; render(); } else { finish(); void stage().tracker.start(); }
    };
  };
  const finish = () => {
    store.update((s) => { s.onboarded = true; s.lastSeenNews = ''; });
    o.remove();
    toast(`Bienvenue dans ${APP_NAME} : 300 Éclats offerts`, 'ok');
  };
  render();
  document.body.appendChild(o);
}

// ------------------------------------------------------------------ Android back button
window.__seBack = () => {
  if (closeTopSheet()) return true;
  if (current?.back?.()) return true;
  if (current && current.id !== 'studio') { go('studio'); return true; }
  return false;
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden) store.persist();
  else stage().lip.resume();
});
window.addEventListener('pagehide', () => store.persist());
// Prevent pinch zoom / double-tap zoom on the WebView
document.addEventListener('gesturestart', (e) => e.preventDefault());

(window as unknown as { __se: unknown }).__se = { stage, store };

boot().catch((e) => {
  progress(1, 'Erreur au démarrage : ' + ((e as Error).message || e));
  console.error(e);
});
