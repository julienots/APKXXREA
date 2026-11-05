import { store } from '../core/store';
import { ITEMS, item, itemsOf } from '../core/catalog';
import type { Aspect, Framing } from '../core/types';
import { stage, aspectRatio } from '../scene/Stage';
import { Recorder, type RecordingResult } from '../record/Recorder';
import { icon, faceIcon, animIcon } from '../ui/icons';
import { $, $$, el, esc, sheet, toast, fmtTime, fmtSize, pickFile } from '../ui/dom';
import { openItem, navigate } from '../ui/actions';
import { BG_PREVIEW } from '../ui/thumbs';
import { saveVideo, shareVideo, vibrate, keepScreenOn, setImmersive, isAndroid } from '../core/native';
import type { Screen } from './screen';

const FRAMING_LABEL: Record<Framing, string> = { close: 'Gros plan', bust: 'Buste', full: 'Plein pied' };
const ASPECT_LABEL: Record<Aspect, string> = { '9:16': 'Vertical 9:16 (Shorts)', '16:9': 'Horizontal 16:9 (YouTube)', '1:1': 'Carré 1:1' };

export function createStudio(): Screen {
  const st = stage();
  const recorder = new Recorder(st);
  const root = el(`<section class="screen" id="scr-studio">
    <div class="stage-area"><div class="stage-frame" id="studio-frame">
      <div class="overlay-tl">
        <div class="status-pill glass" id="trk-pill"><i></i><span>Caméra coupée</span></div>
        <div class="status-pill glass hidden" id="mic-pill">${icon('mic', 14)}<div class="meter"><i></i></div></div>
        <div class="status-pill glass rec hidden" id="rec-pill"><i></i><span class="rec-timer">00:00</span></div>
      </div>
      <div class="side-tools">
        <button class="icon-btn" data-t="cam" aria-label="Caméra">${icon('camera')}</button>
        <button class="icon-btn" data-t="mic" aria-label="Micro">${icon('mic')}</button>
        <button class="icon-btn" data-t="frame" aria-label="Cadrage">${icon('frame')}</button>
        <button class="icon-btn" data-t="aspect" aria-label="Format">${icon('aspect')}</button>
        <button class="icon-btn" data-t="bg" aria-label="Décor">${icon('background')}</button>
        <button class="icon-btn" data-t="cal" aria-label="Calibrer">${icon('target')}</button>
      </div>
      <div class="cam-preview hidden" id="cam-prev"><canvas></canvas></div>
    </div></div>
    <div class="studio-bottom">
      <div class="chips" id="exp-chips"></div>
      <div class="rec-row">
        <div class="round-tool"><button class="icon-btn" data-b="anim">${icon('animation')}</button><span>Animations</span></div>
        <div class="round-tool" style="width:auto"><button class="rec-btn" data-b="rec" aria-label="Enregistrer">${icon('record', 40)}</button></div>
        <div class="round-tool"><button class="icon-btn" data-b="live">${icon('live')}</button><span>Live</span></div>
      </div>
    </div>
  </section>`);
  const frame = $('#studio-frame', root);
  const area = $('.stage-area', root);
  const camPrev = $('#cam-prev', root);
  const prevCanvas = $('canvas', camPrev) as HTMLCanvasElement;
  let visible = false;

  // ---------------------------------------------------------------- layout
  const layout = () => {
    const r = aspectRatio(store.state.aspect);
    const aw = area.clientWidth - 24, ah = area.clientHeight - 8;
    let w = aw, h = aw / r;
    if (h > ah) { h = ah; w = ah * r; }
    frame.style.width = `${Math.floor(w)}px`;
    frame.style.height = `${Math.floor(h)}px`;
  };
  new ResizeObserver(layout).observe(area);

  // ---------------------------------------------------------------- expressions bar
  const renderChips = () => {
    const exps = itemsOf('expression');
    const owned = exps.filter((i) => store.owns(i.id));
    const locked = exps.filter((i) => !store.owns(i.id));
    $('#exp-chips', root).innerHTML = [...owned, ...locked].map((i) => `<button class="exp-btn ${store.owns(i.id) ? '' : 'locked'}" data-exp="${i.id}">
        <div class="face-wrap">${faceIcon(i.style, 34)}</div><span>${esc(i.name)}</span>${store.owns(i.id) ? '' : `<span class="lock">${icon('lock', 12)}</span>`}</button>`).join('');
    $$('[data-exp]', root).forEach((b) => (b.onclick = () => {
      const it = item(b.dataset.exp!)!;
      if (!store.owns(it.id)) { openItem(it.id, renderChips); return; }
      vibrate(14);
      st.triggerExpression(it.style);
      b.classList.add('active');
      setTimeout(() => b.classList.remove('active'), 600);
    }));
  };

  // ---------------------------------------------------------------- tools
  const tool = (t: string) => $(`[data-t="${t}"]`, root);
  const refreshTools = () => {
    tool('cam').classList.toggle('on', st.tracker.active);
    tool('cam').innerHTML = icon(st.tracker.active ? 'camera' : 'cameraOff');
    tool('mic').classList.toggle('on', st.lip.active);
    tool('mic').innerHTML = icon(st.lip.active ? 'mic' : 'micOff');
    tool('aspect').innerHTML = icon(store.state.aspect === '9:16' ? 'aspect' : store.state.aspect === '16:9' ? 'aspectWide' : 'aspectSquare');
    tool('cal').classList.toggle('hidden', !st.tracker.active);
    $('#mic-pill', root).classList.toggle('hidden', !st.lip.active);
    camPrev.classList.toggle('hidden', !(st.tracker.active && store.state.settings.showCameraPreview));
    camPrev.classList.toggle('mirror', store.state.settings.mirror);
    const pill = $('#trk-pill', root);
    const s = st.tracker.status;
    pill.className = 'status-pill glass ' + (st.tracker.active ? (st.tracker.faceFound ? 'ok' : 'warn') : '');
    $('span', pill).textContent = s === 'loading' ? 'Chargement du suivi' : s === 'denied' ? 'Caméra refusée' : s === 'error' ? 'Caméra indisponible' : st.tracker.active ? (st.tracker.faceFound ? 'Visage suivi' : 'Cherche votre visage') : 'Caméra coupée';
  };
  st.tracker.onChange(refreshTools);

  tool('cam').onclick = async () => {
    if (st.tracker.active) st.tracker.stop();
    else {
      refreshTools();
      await st.tracker.start();
      if (st.tracker.status === 'denied') toast('Autorisez la caméra dans les réglages du téléphone.', 'warn');
    }
    refreshTools();
  };
  tool('mic').onclick = async () => {
    if (st.lip.active) st.lip.stop();
    else if (!(await st.lip.start(store.state.settings.micGain))) toast('Micro indisponible ou refusé.', 'warn');
    refreshTools();
  };
  tool('cal').onclick = () => {
    st.tracker.calibrate();
    vibrate(20);
    toast('Position neutre enregistrée', 'ok');
  };
  tool('frame').onclick = () => {
    const s = sheet('Cadrage', `<div class="opt-grid">${(['close', 'bust', 'full'] as Framing[]).map((f) => `<button class="opt ${store.state.framing === f ? 'active' : ''}" data-f="${f}">${icon(f === 'close' ? 'zoom' : f === 'bust' ? 'frame' : 'profile', 28)}${FRAMING_LABEL[f]}</button>`).join('')}</div>`);
    $$('[data-f]', s.body).forEach((b) => (b.onclick = () => {
      store.update((x) => { x.framing = b.dataset.f as Framing; });
      st.setFraming(store.state.framing);
      s.close();
    }));
  };
  tool('aspect').onclick = () => {
    if (recorder.recording) return;
    const s = sheet('Format vidéo', `<div class="col gap">${(['9:16', '16:9', '1:1'] as Aspect[]).map((a) => `<button class="list-item" data-a="${a}" style="text-align:left">${icon(a === '9:16' ? 'aspect' : a === '16:9' ? 'aspectWide' : 'aspectSquare', 26)}<div class="lbl"><b>${ASPECT_LABEL[a]}</b><span>${a === '9:16' ? 'TikTok, Shorts, Reels' : a === '16:9' ? 'YouTube, Twitch' : 'Publications'}</span></div>${store.state.aspect === a ? icon('check', 20, 'yellow') : ''}</button>`).join('')}</div>`);
    $$('[data-a]', s.body).forEach((b) => (b.onclick = () => {
      store.update((x) => { x.aspect = b.dataset.a as Aspect; });
      layout();
      refreshTools();
      s.close();
    }));
  };
  tool('bg').onclick = () => openBackgrounds();

  const openBackgrounds = () => {
    const bgs = itemsOf('background');
    const s = sheet('Décors', '', { tall: true });
    const render = () => {
      s.body.innerHTML = `<div class="opt-grid">${bgs.map((b) => `<button class="opt ${store.state.background === b.id ? 'active' : ''}" data-bg="${b.id}"><div class="prev" style="background:${BG_PREVIEW[b.style]}"></div>${esc(b.name)}${store.owns(b.id) ? '' : `<span class="lockbadge">${icon('lock', 16)}</span>`}</button>`).join('')}</div>
        <div class="${item(store.state.background)?.style === 'chroma' ? '' : 'hidden'} mt"><p class="muted small">Couleur du fond uni</p><div class="swatches" style="padding:8px 0">${['#00b140', '#0047bb', '#ff00ff', '#000000', '#ffffff'].map((c) => `<button class="swatch ${store.state.bgColor === c ? 'active' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}</div></div>
        <div class="${item(store.state.background)?.style === 'custom' ? '' : 'hidden'} mt"><button class="btn block" data-a="img">${icon('upload', 18)}Choisir une image</button></div>`;
      $$('[data-bg]', s.body).forEach((b) => (b.onclick = () => {
        const it = item(b.dataset.bg!)!;
        if (!store.owns(it.id)) { openItem(it.id, render); return; }
        store.update((x) => { x.background = it.id; });
        render();
        if (it.style === 'custom' && !store.state.customBg) pickBg();
      }));
      $$('[data-c]', s.body).forEach((b) => (b.onclick = () => { store.update((x) => { x.bgColor = b.dataset.c!; }); render(); }));
      $('[data-a="img"]', s.body)?.addEventListener('click', pickBg);
    };
    const pickBg = async () => {
      const f = await pickFile('image/*');
      if (!f) return;
      const url = await downscale(f, 1920);
      store.update((x) => { x.customBg = url; });
      render();
    };
    render();
  };

  // ---------------------------------------------------------------- animations
  $('[data-b="anim"]', root).onclick = () => {
    const anims = itemsOf('animation');
    const s = sheet('Animations', '', { tall: true });
    const render = () => {
      s.body.innerHTML = `<p class="muted small" style="margin-bottom:12px">Les danses tournent en boucle : touchez à nouveau pour les arrêter.</p><div class="opt-grid">${anims.map((a) => `<button class="opt ${st.animator.isPlaying(a.style) ? 'active' : ''}" data-an="${a.id}">${animIcon(a.style, 30)}${esc(a.name)}${store.owns(a.id) ? '' : `<span class="lockbadge">${icon('lock', 16)}</span>`}</button>`).join('')}</div>`;
      $$('[data-an]', s.body).forEach((b) => (b.onclick = () => {
        const it = item(b.dataset.an!)!;
        if (!store.owns(it.id)) { openItem(it.id, render); return; }
        st.playAnimation(it.style);
        vibrate(12);
        setTimeout(render, 50);
        if (!['bounce', 'robot', 'disco', 'spooky', 'star'].includes(it.style)) s.close();
      }));
    };
    render();
  };

  // ---------------------------------------------------------------- recording
  const recBtn = $('[data-b="rec"]', root);
  let timerInt = 0;
  const maxDuration = () => (store.isPro ? 30 * 60 : 3 * 60);
  const startRecording = async () => {
    if (!recorder.supported) { toast('L\'enregistrement vidéo n\'est pas pris en charge sur cet appareil.', 'warn'); return; }
    if (!st.lip.active) await st.lip.start(store.state.settings.micGain);
    refreshTools();
    const cd = el('<div class="countdown"></div>');
    frame.appendChild(cd);
    for (const n of [3, 2, 1]) {
      cd.innerHTML = `<span>${n}</span>`;
      vibrate(8);
      await new Promise((r) => setTimeout(r, 800));
    }
    cd.remove();
    recorder.start(store.state.aspect, store.state.settings.quality, st.lip.active);
    keepScreenOn(true);
    recBtn.classList.add('recording');
    recBtn.innerHTML = icon('stop', 30);
    $('#rec-pill', root).classList.remove('hidden');
    timerInt = window.setInterval(() => {
      $('.rec-timer', root).textContent = fmtTime(recorder.elapsed);
      if (recorder.elapsed >= maxDuration()) void stopRecording();
    }, 250);
  };
  const stopRecording = async () => {
    clearInterval(timerInt);
    recBtn.classList.remove('recording');
    recBtn.innerHTML = icon('record', 40);
    $('#rec-pill', root).classList.add('hidden');
    keepScreenOn(false);
    const res = await recorder.stop();
    layout();
    if (res) showResult(res);
    else toast('Aucune image enregistrée.', 'warn');
  };
  recBtn.onclick = () => (recorder.recording ? stopRecording() : startRecording());

  // ---------------------------------------------------------------- live mode
  $('[data-b="live"]', root).onclick = () => {
    if (!store.isPro) {
      toast('Le mode live est inclus dans Pro.', 'warn');
      navigate('profile:pro');
      return;
    }
    openLive();
  };

  const openLive = () => {
    const layer = el(`<div class="live-layer"><div class="stage-frame" id="live-frame"></div>
      <div class="live-hud glass" style="border-radius:18px;padding:8px">
        <button class="icon-btn" data-l="close">${icon('close')}</button>
        <div class="seg grow" style="overflow-x:auto">
          ${[['#00b140', 'Vert'], ['#0047bb', 'Bleu'], ['#ff00ff', 'Magenta'], ['#000000', 'Noir'], ['transparent', 'Transparent'], ['scene', 'Décor']].map(([c, n]) => `<button data-lc="${c}">${n}</button>`).join('')}
        </div>
        <button class="icon-btn" data-l="frame">${icon('frame')}</button>
      </div>
      <div class="live-bottom"><div class="chips" id="live-chips"></div></div>
    </div>`);
    document.body.appendChild(layer);
    setImmersive(true);
    keepScreenOn(true);
    st.mount($('#live-frame', layer));
    let mode = '#00b140';
    const applyMode = () => {
      if (mode === 'scene') st.setLive(null);
      else if (mode === 'transparent') st.setLive({ mode: 'transparent', color: '#000' });
      else st.setLive({ mode: 'chroma', color: mode });
      $$('[data-lc]', layer).forEach((b) => b.classList.toggle('active', b.dataset.lc === mode));
    };
    applyMode();
    $$('[data-lc]', layer).forEach((b) => (b.onclick = () => { mode = b.dataset.lc!; applyMode(); }));
    const chips = $('#live-chips', layer);
    chips.innerHTML = itemsOf('expression').filter((i) => store.owns(i.id)).map((i) => `<button class="exp-btn" data-x="${i.style}"><div class="face-wrap">${faceIcon(i.style, 34)}</div><span>${esc(i.name)}</span></button>`).join('');
    $$('[data-x]', chips).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); st.triggerExpression(b.dataset.x!); poke(); }));
    let fadeT = 0;
    const poke = () => {
      $('.live-hud', layer).classList.remove('faded');
      $('.live-bottom', layer).classList.remove('faded');
      clearTimeout(fadeT);
      fadeT = window.setTimeout(() => {
        $('.live-hud', layer).classList.add('faded');
        $('.live-bottom', layer).classList.add('faded');
      }, 3500);
    };
    layer.addEventListener('pointerdown', poke);
    poke();
    const started = performance.now();
    $('[data-l="frame"]', layer).onclick = () => {
      const order: Framing[] = ['close', 'bust', 'full'];
      const next = order[(order.indexOf(st.framing) + 1) % 3];
      st.setFraming(next);
      toast(FRAMING_LABEL[next]);
    };
    const close = () => {
      clearTimeout(fadeT);
      store.track('liveSeconds', (performance.now() - started) / 1000);
      st.setLive(null);
      st.setFraming(store.state.framing);
      setImmersive(false);
      keepScreenOn(false);
      layer.remove();
      st.mount(frame);
      liveClose = null;
    };
    liveClose = close;
    $('[data-l="close"]', layer).onclick = close;
    if (!st.tracker.active) void st.tracker.start().then(refreshTools);
  };
  let liveClose: (() => void) | null = null;

  // ---------------------------------------------------------------- per-frame UI
  const pctx = prevCanvas.getContext('2d')!;
  const uiLoop = () => {
    requestAnimationFrame(uiLoop);
    if (!visible) return;
    if (st.lip.active) ($('.meter i', root) as HTMLElement).style.width = `${Math.round(st.lip.out.level * 100)}%`;
    if (!camPrev.classList.contains('hidden')) {
      const v = st.tracker.video;
      if (v.videoWidth) {
        if (prevCanvas.width !== v.videoWidth) { prevCanvas.width = v.videoWidth; prevCanvas.height = v.videoHeight; }
        pctx.drawImage(v, 0, 0);
        const lm = st.tracker.lastLandmarks;
        if (lm && st.tracker.faceFound) {
          pctx.fillStyle = '#ffcd20';
          for (let i = 0; i < lm.length; i += 3) pctx.fillRect(lm[i].x * prevCanvas.width - 1, lm[i].y * prevCanvas.height - 1, 2.5, 2.5);
        }
        pctx.fillStyle = '#3fa9ff';
        for (const hand of st.tracker.handPoints) for (const p of hand) pctx.fillRect(p.x * prevCanvas.width - 2, p.y * prevCanvas.height - 2, 4, 4);
      }
    }
  };
  requestAnimationFrame(uiLoop);

  window.addEventListener('se-expression', ((e: CustomEvent) => {
    if (e.detail.fromGesture && visible) toast(`Geste détecté : ${itemsOf('expression').find((i) => i.style === e.detail.style)?.name ?? ''}`);
  }) as EventListener);

  store.subscribe(() => { if (visible) { refreshTools(); } });

  return {
    id: 'studio',
    el: root,
    show() {
      visible = true;
      st.mount(frame);
      st.setFraming(store.state.framing);
      st.turn = 0;
      st.autoTurn = false;
      st.zoom = 1;
      layout();
      renderChips();
      refreshTools();
    },
    hide() {
      visible = false;
      if (recorder.recording) void stopRecording();
    },
    back() {
      if (liveClose) { liveClose(); return true; }
      return false;
    },
  };
}

function showResult(res: RecordingResult): void {
  const url = URL.createObjectURL(res.blob);
  const m = res.meta;
  let saved: { uri: string; name: string } | null = null;
  const s = sheet('Votre vidéo', `<video class="player" src="${url}" controls playsinline loop autoplay></video>
    <div class="row gap wrap mt-s"><span class="pill">${m.width}x${m.height}</span><span class="pill">${fmtTime(m.duration)}</span><span class="pill">${fmtSize(m.size)}</span><span class="pill">${m.mime.includes('mp4') ? 'MP4 H.264' : 'WebM VP9'}</span>${store.isPro ? '<span class="pill pro">Sans filigrane</span>' : ''}</div>
    ${store.isPro ? '' : `<p class="muted small mt">Version gratuite : qualité standard avec filigrane. Passez Pro pour exporter en HD ou 4K sans filigrane.</p>`}
    <div class="col gap mt"><button class="btn primary block" data-a="save">${icon('download', 18)}${isAndroid ? 'Enregistrer dans la galerie' : 'Télécharger'}</button>
    <div class="row gap"><button class="btn grow" data-a="share">${icon('share', 18)}Partager</button><button class="btn grow" data-a="close">Terminé</button></div></div>`, {
    onClose: () => URL.revokeObjectURL(url),
  });
  const save = async () => {
    const b = $('[data-a="save"]', s.body) as HTMLButtonElement;
    b.disabled = true;
    try {
      saved = await saveVideo(res.blob, m.name, (p) => { b.textContent = `Enregistrement ${Math.round(p * 100)} %`; });
      b.innerHTML = `${icon('check', 18)}Enregistrée${isAndroid ? ' dans Films/SuperEssence' : ''}`;
      toast('Vidéo enregistrée', 'ok');
    } catch (e) {
      b.disabled = false;
      b.innerHTML = `${icon('download', 18)}Réessayer`;
      toast((e as Error).message || 'Échec de l\'enregistrement', 'warn');
    }
  };
  $('[data-a="save"]', s.body).onclick = save;
  $('[data-a="share"]', s.body).onclick = async () => {
    if (!saved) await save();
    if (saved) await shareVideo(saved, res.blob).catch(() => toast('Partage indisponible', 'warn'));
  };
  $('[data-a="close"]', s.body).onclick = s.close;
}

async function downscale(f: File, max: number): Promise<string> {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86);
}

export { ITEMS };
