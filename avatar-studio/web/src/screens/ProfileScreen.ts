import { store, formatDate } from '../core/store';
import { APP_VERSION, STUDIO_NAME, APP_NAME, PRO_PRICE_LABEL } from '../core/catalog';
import { activateCode, startTrial } from '../core/license';
import { stage } from '../scene/Stage';
import { icon } from '../ui/icons';
import { $, $$, el, esc, sheet, toast, confirmDialog, fmtTime, fmtSize } from '../ui/dom';
import { listVideos, deleteVideo, getBlob, type VideoMeta } from '../record/db';
import { saveVideo, shareVideo, vibrate, isAndroid } from '../core/native';
import type { Settings } from '../core/store';
import type { Screen } from './screen';

const COMPARE: [string, string, string][] = [
  ['Avatars', '1', '10'],
  ['Suivi du visage et de la voix', 'yes', 'yes'],
  ['Export vidéo', '720p avec filigrane', 'HD 1080p / 4K sans filigrane'],
  ['Durée d\'enregistrement', '3 min', '30 min'],
  ['Mode live (fond uni / transparent)', 'no', 'yes'],
  ['Toutes les expressions', 'no', 'yes'],
  ['Accès anticipé aux nouveaux modules', 'no', 'yes'],
  ['Objets de la boutique inclus chaque mois', 'no', '4 / mois'],
  ['Coffre du jour', '50', '150'],
  ['Décor avec image perso', 'no', 'yes'],
];

export function createProfile(): Screen {
  const root = el(`<section class="screen" id="scr-profile"><div class="scroll" id="prof-scroll"></div></section>`);
  const body = $('#prof-scroll', root);
  let avatarThumb = '';

  const cell = (v: string) => (v === 'yes' ? `<td class="yes">${icon('check', 18)}</td>` : v === 'no' ? `<td class="no">${icon('close', 16)}</td>` : `<td>${esc(v)}</td>`);

  const render = async () => {
    const s = store.state;
    const pro = store.isPro;
    if (!avatarThumb && store.avatar.kind === 'toon') {
      try { avatarThumb = stage().renderThumbnail(store.avatar, 'close', 160); } catch { /* ignore */ }
    }
    const videos = await listVideos().catch(() => [] as VideoMeta[]);
    const st = s.settings;
    const sw = (k: keyof Settings, label: string, sub = '') => `<div class="list-item"><div class="lbl"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</div><button class="switch ${st[k] ? 'on' : ''}" data-sw="${k}" aria-label="${label}"></button></div>`;
    const seg = (k: keyof Settings, label: string, opts: [string, string][], sub = '') => `<div class="list-item"><div class="lbl"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</div><div class="seg">${opts.map(([v, l]) => `<button class="${String(st[k]) === v ? 'active' : ''}" data-seg="${k}" data-v="${v}">${l}</button>`).join('')}</div></div>`;
    const range = (k: keyof Settings, label: string, min: number, max: number, step: number, sub = '') => `<div class="list-item"><div class="lbl"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</div><input type="range" min="${min}" max="${max}" step="${step}" value="${st[k]}" data-rg="${k}"/></div>`;

    body.innerHTML = `
      <div class="card mt-s row gap">
        <div style="width:72px;height:72px;border-radius:22px;overflow:hidden;background:var(--card2);flex:none;display:grid;place-items:center">${avatarThumb ? `<img src="${avatarThumb}" style="width:100%;height:100%;object-fit:cover"/>` : icon('profile', 34)}</div>
        <div class="grow"><h3>${esc(store.avatar.name)}</h3><p class="muted small">${s.title ? esc(s.title) + ' - ' : ''}${s.totalRecordings} vidéo${s.totalRecordings > 1 ? 's' : ''} - ${s.inventory.length} objets achetés</p>
        <div class="row gap-s mt-s"><span class="pill yellow">${icon('gem', 14)}${s.coins}</span>${pro ? '<span class="pill pro">PRO</span>' : '<span class="pill">Gratuit</span>'}</div></div>
      </div>

      <h2 class="section" id="pro-anchor">${icon('crown', 20, 'yellow')}Abonnement Pro</h2>
      <div class="pro-card">
        <h3>${icon('crown', 24)}${pro ? 'Vous êtes Pro' : 'Passez Pro'}</h3>
        <p class="muted small mt-s">${pro ? `Actif jusqu'au ${formatDate(s.license!.exp)} (${store.proDaysLeft} jours)${s.license!.source === 'trial' ? ' - essai gratuit' : ''}.` : `Abonnement géré par ${STUDIO_NAME} - ${PRO_PRICE_LABEL}. Activez votre code après l'achat.`}</p>
        <table class="compare"><tr><th></th><th>Gratuit</th><th style="color:var(--yellow)">Pro</th></tr>${COMPARE.map(([a, f, p]) => `<tr><td>${a}</td>${cell(f)}${cell(p)}</tr>`).join('')}</table>
        <div class="col gap mt">
          ${!pro && !s.trialUsed ? `<button class="btn primary block" data-a="trial">${icon('sparkle', 18)}Essai gratuit 7 jours</button>` : ''}
          <button class="btn block ${pro || s.trialUsed ? 'primary' : ''}" data-a="code">${icon('key', 18)}${pro ? 'Prolonger avec un code' : 'Activer un code Pro'}</button>
        </div>
      </div>

      <h2 class="section">${icon('film', 20, 'yellow')}Mes vidéos</h2>
      ${videos.length ? `<div class="video-grid">${videos.map((v) => `<button class="video-tile" data-v="${v.id}" style="aspect-ratio:${v.width}/${v.height}">${v.thumb ? `<img src="${v.thumb}"/>` : ''}<span>${fmtTime(v.duration)}</span></button>`).join('')}</div>` : '<div class="card"><p class="muted small">Vos enregistrements apparaîtront ici. Lancez-vous depuis l\'onglet Studio.</p></div>'}

      <h2 class="section">${icon('camera', 20, 'yellow')}Suivi du visage</h2>
      <div class="card">
        ${sw('mirror', 'Effet miroir', 'L\'avatar bouge comme votre reflet')}
        ${range('smoothing', 'Lissage', 0, 1, 0.05, 'Plus fluide ou plus réactif')}
        ${range('sensitivity', 'Amplitude', 0.5, 2, 0.05, 'Exagère les mouvements de la tête')}
        ${sw('gestureTriggers', 'Expressions par gestes', 'Grand sourire, surprise, colère, yeux fermés')}
        ${sw('handTracking', 'Suivi des mains (bêta)', 'Votre avatar lève les mains avec vous')}
        ${sw('swapEyes', 'Inverser œil gauche / droit', 'Si les clignements sont du mauvais côté')}
        ${sw('showCameraPreview', 'Aperçu de la caméra', 'Vignette avec les points du visage')}
        <div class="list-item"><div class="lbl"><b>Position neutre</b><span>Regardez droit devant puis calibrez</span></div><button class="btn small" data-a="cal">${icon('target', 16)}Calibrer</button></div>
      </div>

      <h2 class="section">${icon('mic', 20, 'yellow')}Bouche et voix</h2>
      <div class="card">
        ${seg('mouthMode', 'Animation de la bouche', [['mix', 'Mixte'], ['camera', 'Caméra'], ['voice', 'Voix']])}
        ${range('micGain', 'Sensibilité du micro', 0.3, 3, 0.1)}
      </div>

      <h2 class="section">${icon('film', 20, 'yellow')}Vidéo</h2>
      <div class="card">
        ${seg('quality', 'Qualité d\'export', [['sd', '720p'], ['hd', '1080p'], ['4k', '4K']], pro ? 'HD et 4K inclus avec Pro' : 'HD et 4K : Pro')}
        ${seg('fps', 'Images par seconde', [['30', '30'], ['60', '60']])}
      </div>

      <h2 class="section">${icon('sliders', 20, 'yellow')}Affichage et performances</h2>
      <div class="card">
        ${range('renderScale', 'Résolution du rendu', 0.5, 1, 0.05, 'Baissez si le téléphone chauffe')}
        ${sw('shadows', 'Ombres')}
        ${sw('outline', 'Contours dessinés', 'Style anime')}
        ${sw('haptics', 'Vibrations')}
      </div>

      <h2 class="section">${icon('info', 20, 'yellow')}À propos</h2>
      <div class="card" style="text-align:center">
        <img class="about-logo" src="./brand/superessence-logo.png" alt="SuperEssence"/>
        <p><b>${APP_NAME}</b> version ${APP_VERSION}</p>
        <p class="muted small mt-s">Développé par ${STUDIO_NAME}. Tout fonctionne sur votre téléphone : aucune image ni aucun son ne quitte l'appareil.</p>
        <p class="muted tiny mt">Technologies : Three.js, three-vrm (pixiv), MediaPipe Face et Hand Landmarker (Google), Web Audio API, MediaRecorder, WebGL 2, WebAssembly. Police Fredoka (SIL OFL).</p>
        <button class="btn small mt" data-a="reset" style="color:var(--red)">${icon('trash', 16)}Effacer toutes les données</button>
      </div>`;

    $$('[data-sw]', body).forEach((b) => (b.onclick = () => {
      const k = b.dataset.sw as keyof Settings;
      store.update((x) => { (x.settings as unknown as Record<string, unknown>)[k] = !x.settings[k]; });
      b.classList.toggle('on');
      vibrate(6);
    }));
    $$('[data-seg]', body).forEach((b) => (b.onclick = () => {
      const k = b.dataset.seg as keyof Settings;
      let v: string | number = b.dataset.v!;
      if (k === 'fps') v = Number(v);
      if (k === 'quality' && v !== 'sd' && !store.isPro) { toast('Export HD et 4K : fonctionnalité Pro.', 'warn'); return; }
      store.update((x) => { (x.settings as unknown as Record<string, unknown>)[k] = v; });
      $$(`[data-seg="${k}"]`, body).forEach((o) => o.classList.toggle('active', o === b));
    }));
    $$('[data-rg]', body).forEach((r) => ((r as HTMLInputElement).oninput = () => {
      const k = r.dataset.rg as keyof Settings;
      store.update((x) => { (x.settings as unknown as Record<string, unknown>)[k] = Number((r as HTMLInputElement).value); });
      if (k === 'renderScale') stage().resize();
    }));
    $('[data-a="cal"]', body).onclick = () => {
      if (!stage().tracker.active) { toast('Activez d\'abord la caméra dans le Studio.', 'warn'); return; }
      stage().tracker.calibrate();
      toast('Position neutre enregistrée', 'ok');
    };
    $('[data-a="trial"]', body)?.addEventListener('click', () => {
      if (startTrial()) { vibrate(40); toast('Essai Pro activé pour 7 jours', 'ok'); void render(); }
    });
    $('[data-a="code"]', body).onclick = () => openCode();
    $('[data-a="reset"]', body).onclick = async () => {
      if (await confirmDialog('Tout effacer', 'Avatars, achats, réglages et abonnement seront supprimés de ce téléphone.', 'Tout effacer', true)) {
        localStorage.clear();
        indexedDB.deleteDatabase('se-avatar-studio');
        location.reload();
      }
    };
    $$('[data-v]', body).forEach((b) => (b.onclick = () => openVideo(videos.find((v) => v.id === b.dataset.v)!)));
  };

  const openCode = () => {
    const s = sheet('Activer Pro', `<label class="field"><span>Code reçu après votre achat</span><input class="input" placeholder="SEPRO-..." autocapitalize="off" autocomplete="off" spellcheck="false"/></label>
      <p class="muted tiny mt-s">Le code est vérifié sur le téléphone par signature cryptographique (ECDSA P-256), sans connexion.</p>
      <button class="btn primary block mt" data-a="ok">${icon('key', 18)}Activer</button>`);
    const input = $('input', s.body) as HTMLInputElement;
    $('[data-a="ok"]', s.body).onclick = async () => {
      const r = await activateCode(input.value);
      if (r.ok) {
        vibrate(60);
        toast(`Pro activé jusqu'au ${formatDate(r.exp)}`, 'ok');
        s.close();
        void render();
      } else toast(r.reason, 'warn');
    };
  };

  const openVideo = async (v: VideoMeta) => {
    const blob = await getBlob('video-' + v.id);
    if (!blob) { toast('Fichier introuvable', 'warn'); return; }
    const url = URL.createObjectURL(blob);
    let saved: { uri: string; name: string } | null = null;
    const s = sheet(formatDate(new Date(v.created).toISOString().slice(0, 10)), `<video class="player" src="${url}" controls playsinline autoplay loop></video>
      <div class="row gap wrap mt-s"><span class="pill">${v.width}x${v.height}</span><span class="pill">${fmtTime(v.duration)}</span><span class="pill">${fmtSize(v.size)}</span></div>
      <div class="row gap mt"><button class="btn grow primary" data-a="save">${icon('download', 18)}${isAndroid ? 'Galerie' : 'Télécharger'}</button><button class="btn grow" data-a="share">${icon('share', 18)}Partager</button><button class="icon-btn" data-a="del" style="color:var(--red)">${icon('trash')}</button></div>`,
    { onClose: () => URL.revokeObjectURL(url) });
    const save = async () => {
      try { saved = await saveVideo(blob, v.name); toast('Vidéo enregistrée', 'ok'); } catch (e) { toast((e as Error).message, 'warn'); }
    };
    $('[data-a="save"]', s.body).onclick = save;
    $('[data-a="share"]', s.body).onclick = async () => { if (!saved) await save(); if (saved) await shareVideo(saved, blob).catch(() => {}); };
    $('[data-a="del"]', s.body).onclick = async () => {
      if (await confirmDialog('Supprimer', 'Supprimer cette vidéo de l\'application ?', 'Supprimer', true)) {
        await deleteVideo(v.id);
        s.close();
        void render();
      }
    };
  };

  store.subscribe(() => { avatarThumb = ''; });

  return {
    id: 'profile',
    el: root,
    show(arg) {
      void render().then(() => {
        if (arg === 'pro') $('#pro-anchor', body)?.scrollIntoView({ behavior: 'smooth' });
      });
    },
    hide() {},
  };
}
