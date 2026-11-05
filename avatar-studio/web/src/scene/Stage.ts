import {
  ACESFilmicToneMapping, Color, DirectionalLight, Group, HemisphereLight, Mesh, PCFShadowMap, PerspectiveCamera,
  PlaneGeometry, Scene, ShadowMaterial, SRGBColorSpace, Vector3, WebGLRenderer, WebGLRenderTarget,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PMREMGenerator } from 'three';
import type { AvatarConfig, Aspect, Framing, FaceState } from '../core/types';
import { neutralFace } from '../core/types';
import { store } from '../core/store';
import { item } from '../core/catalog';
import { ToonAvatar } from '../avatar/ToonAvatar';
import { VrmAvatar } from '../avatar/VrmAvatar';
import type { AvatarDriver } from '../avatar/driver';
import { FaceComposer, EXPRESSIONS } from '../avatar/Expressions';
import { Animator } from '../avatar/Motions';
import { Particles } from './Particles';
import { buildBackdrop, applyBackdrop, type Backdrop } from './Backgrounds';
import { FaceTracker } from '../tracking/FaceTracker';
import { LipSync } from '../audio/LipSync';
import { getBlob } from '../record/db';
import { clamp, damp, lerp } from '../core/filters';
import type { FaceDraw } from '../avatar/FaceCanvas';

const FRAMES: Record<Framing, { y: number; h: number }> = {
  close: { y: 1.2, h: 0.95 },
  bust: { y: 1.02, h: 1.35 },
  full: { y: 0.78, h: 1.85 },
};

export type FrameHook = (source: HTMLCanvasElement) => void;

/** The single WebGL stage shared by every screen: renderer, scene, avatar, tracking pipeline. */
export class Stage {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(28, 9 / 16, 0.05, 60);
  readonly tracker = new FaceTracker();
  readonly lip = new LipSync();
  readonly composer = new FaceComposer();
  readonly animator = new Animator();
  readonly particles = new Particles();
  avatar: AvatarDriver | null = null;
  framing: Framing = 'bust';
  /** Extra rotation (creator turntable). */
  turn = 0;
  autoTurn = false;
  zoom = 1;
  liveBackdrop: { mode: 'chroma' | 'transparent'; color: string } | null = null;
  readonly hooks = new Set<FrameHook>();
  /** Fixed output size used while recording. */
  fixedSize: { w: number; h: number } | null = null;

  private container: HTMLElement | null = null;
  private avatarHolder = new Group();
  private backdrop: Backdrop | null = null;
  private backdropKey = '';
  private key: DirectionalLight;
  private hemi: HemisphereLight;
  private shadowFloor: Mesh;
  private time = 0;
  private last = performance.now();
  private face: FaceState = neutralFace();
  private ro: ResizeObserver;
  private avatarToken = 0;
  private trackedSeconds = 0;
  private camPos = new Vector3(0, 1, 4);
  private camTarget = new Vector3(0, 1, 0);
  lastDraw: FaceDraw | null = null;
  fps = 60;
  private fpsAcc = 0;
  private fpsN = 0;
  private paused = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage-canvas';
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;

    // Image-based lighting for metallic parts (robot skin, armour, gold)
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.8;
    pmrem.dispose();

    this.hemi = new HemisphereLight('#ffffff', '#6b6b8a', 1.4);
    this.scene.add(this.hemi);
    this.key = new DirectionalLight('#ffffff', 2.2);
    this.key.position.set(1.5, 3, 2.5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.left = -1.5;
    this.key.shadow.camera.right = 1.5;
    this.key.shadow.camera.top = 2.5;
    this.key.shadow.camera.bottom = -0.5;
    this.key.shadow.bias = -0.0005;
    this.scene.add(this.key);
    const rim = new DirectionalLight('#9fc8ff', 1.3);
    rim.position.set(-2, 2, -2.5);
    this.scene.add(rim);
    this.shadowFloor = new Mesh(new PlaneGeometry(6, 6), new ShadowMaterial({ opacity: 0.28 }));
    this.shadowFloor.rotation.x = -Math.PI / 2;
    this.shadowFloor.position.y = 0.002;
    this.shadowFloor.receiveShadow = true;
    this.scene.add(this.shadowFloor);
    this.scene.add(this.avatarHolder);
    this.scene.add(this.particles.group);

    this.composer.onGesture = (style) => this.triggerExpression(style, true);

    this.ro = new ResizeObserver(() => this.resize());
    store.subscribe((s) => {
      this.setBackground(s.background);
      this.renderer.shadowMap.enabled = s.settings.shadows;
      this.key.castShadow = s.settings.shadows;
      this.avatar?.setOutline(s.settings.outline);
      this.lip.setGain(s.settings.micGain);
    });
    this.framing = store.state.framing;
    this.setBackground(store.state.background);
    requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ layout
  mount(el: HTMLElement): void {
    if (this.container === el) return;
    if (this.container) this.ro.unobserve(this.container);
    this.container = el;
    el.appendChild(this.canvas);
    this.ro.observe(el);
    this.resize();
  }

  resize(): void {
    const el = this.container;
    let w: number, h: number, css = true;
    if (this.fixedSize) {
      ({ w, h } = this.fixedSize);
      css = false;
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(w, h, false);
    } else {
      if (!el) return;
      w = Math.max(1, el.clientWidth);
      h = Math.max(1, el.clientHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * store.state.settings.renderScale);
      this.renderer.setSize(w, h, css);
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setFixedSize(size: { w: number; h: number } | null): void {
    this.fixedSize = size;
    this.resize();
    if (!size) this.canvas.style.width = this.canvas.style.height = '100%';
  }

  setPaused(p: boolean): void {
    this.paused = p;
    if (!p) this.last = performance.now();
  }

  // ------------------------------------------------------------------ content
  async setAvatar(cfg: AvatarConfig): Promise<void> {
    const token = ++this.avatarToken;
    let next: AvatarDriver;
    if (cfg.kind === 'vrm' && cfg.vrmKey) {
      const blob = await getBlob(cfg.vrmKey);
      if (!blob) throw new Error('Modèle VRM introuvable.');
      next = await VrmAvatar.load(await blob.arrayBuffer());
    } else {
      next = new ToonAvatar(cfg, store.state.settings.outline);
    }
    if (token !== this.avatarToken) {
      next.dispose();
      return;
    }
    if (this.avatar) {
      this.avatarHolder.remove(this.avatar.root);
      this.avatar.dispose();
    }
    this.avatar = next;
    this.avatarHolder.add(next.root);
  }

  setBackground(id: string): void {
    const it = item(id);
    let style = it?.style ?? 'studio';
    let color = store.state.bgColor;
    if (this.liveBackdrop) {
      style = this.liveBackdrop.mode;
      color = this.liveBackdrop.color;
    }
    const key = `${style}|${color}|${style === 'custom' ? store.state.customBg?.length : ''}`;
    if (key === this.backdropKey) return;
    this.backdropKey = key;
    if (this.backdrop) {
      this.scene.remove(this.backdrop.group);
      this.backdrop.dispose();
    }
    const b = buildBackdrop(style, { color, image: store.state.customBg });
    this.backdrop = b;
    applyBackdrop(this.scene, b);
    this.shadowFloor.visible = b.floor || style === 'gradient' || style === 'custom';
    this.key.color = new Color(b.key);
    this.hemi.color = new Color('#ffffff').lerp(new Color(b.ambient), 0.35);
    this.renderer.setClearColor(0x000000, style === 'transparent' ? 0 : 1);
    this.canvas.classList.toggle('transparent', style === 'transparent');
  }

  setLive(mode: { mode: 'chroma' | 'transparent'; color: string } | null): void {
    this.liveBackdrop = mode;
    this.backdropKey = '';
    this.setBackground(store.state.background);
  }

  setFraming(f: Framing): void {
    this.framing = f;
  }

  triggerExpression(style: string, fromGesture = false): void {
    const def = this.composer.trigger(style);
    if (!def) return;
    this.animator.play(def.clip, 1);
    if (def.particles) this.particles.emit(def.particles, def.duration * 0.8);
    store.track('expressions');
    window.dispatchEvent(new CustomEvent('se-expression', { detail: { style, fromGesture } }));
  }

  playAnimation(style: string): boolean {
    const started = this.animator.play(style, 0);
    if (started) store.track('animations');
    return started;
  }

  // ------------------------------------------------------------------ loop
  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    if (this.paused) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    this.time += dt;
    this.step(dt);
  };

  private step(dt: number): void {
    const t = this.time;
    const s = store.state.settings;
    const tracked = this.tracker.active && this.tracker.faceFound;
    const lip = this.lip.active ? this.lip.update(dt) : null;

    // Face source
    const src = tracked ? this.tracker.face : null;
    const f = this.face;
    if (src) Object.assign(f, src);
    else {
      // idle head motion, plus nods driven by the voice energy
      const talk = lip ? lip.level : 0;
      f.yaw = damp(f.yaw, Math.sin(t * 0.4) * 0.08, 3, dt);
      f.pitch = damp(f.pitch, Math.sin(t * 0.7) * 0.03 + talk * 0.08 * Math.sin(t * 9), 4, dt);
      f.roll = damp(f.roll, Math.sin(t * 0.33) * 0.04, 3, dt);
      f.tx = damp(f.tx, 0, 2, dt);
      f.eyeL = f.eyeR = 1;
      f.browL = damp(f.browL, talk * 0.3, 6, dt);
      f.browR = f.browL;
      f.smile = damp(f.smile, 0.2, 2, dt);
      f.browAngry = f.browSad = 0;
    }
    if (tracked) {
      this.trackedSeconds += dt;
      if (this.trackedSeconds > 5) {
        store.track('trackedSeconds', this.trackedSeconds);
        this.trackedSeconds = 0;
      }
    }
    if (s.gestureTriggers) this.composer.detectGestures(f, tracked, dt);
    const cfg = store.avatar;
    const draw = this.composer.compose(f, tracked, lip, s.mouthMode, cfg.blush, t, dt);
    this.lastDraw = draw;

    let pose = this.animator.update(dt);
    if (s.handTracking && tracked) {
      const h = this.tracker.hands;
      if (h.L) pose = { ...pose, armL: { dir: lerpDir(pose.armL.dir, h.L.dir, 0.85), bend: lerp(pose.armL.bend, h.L.bend, 0.85) } };
      if (h.R) pose = { ...pose, armR: { dir: lerpDir(pose.armR.dir, h.R.dir, 0.85), bend: lerp(pose.armR.bend, h.R.bend, 0.85) } };
    }

    if (this.avatar) {
      if (this.autoTurn) this.turn += dt * 0.5;
      this.avatar.root.rotation.y = this.turn;
      this.avatar.update({ face: f, draw, pose, time: t, dt });
      this.particles.update(dt, this.avatar.headAnchor, this.camera);
    }
    this.backdrop?.update(t, dt);
    this.updateCamera(dt, tracked ? f : null);
    this.renderer.render(this.scene, this.camera);
    for (const h of this.hooks) h(this.canvas);
  }

  private updateCamera(dt: number, f: FaceState | null): void {
    const fr = FRAMES[this.framing];
    const h = fr.h / this.zoom;
    const fov = (this.camera.fov * Math.PI) / 180;
    let dist = h / 2 / Math.tan(fov / 2);
    // Narrow portrait frames: make sure the character's width also fits.
    const minW = this.framing === 'full' ? 0.95 : this.framing === 'bust' ? 0.9 : 0.75;
    const visW = h * this.camera.aspect;
    if (visW < minW) dist *= minW / visW;
    const parallax = f ? clamp(f.tx, -1, 1) * 0.04 : 0;
    this.camTarget.set(0, fr.y, 0);
    const want = new Vector3(parallax, fr.y + 0.04, dist);
    const k = 1 - Math.exp(-dt * 6);
    this.camPos.lerp(want, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
  }

  /** Renders an offscreen thumbnail of an avatar config (used by the creator / shop grids). */
  renderThumbnail(cfg: AvatarConfig, framing: Framing, size = 160, expression?: string): string {
    const av = new ToonAvatar(cfg, true);
    const scene = new Scene();
    scene.environment = this.scene.environment;
    scene.add(new HemisphereLight('#ffffff', '#6b6b8a', 1.6));
    const d = new DirectionalLight('#ffffff', 2.2);
    d.position.set(1.5, 3, 2.5);
    scene.add(d);
    scene.add(av.root);
    const face = neutralFace();
    face.yaw = -0.18;
    face.pitch = 0.02;
    const draw = this.composer.compose(face, true, null, 'camera', cfg.blush, 0, 0.016);
    if (expression && EXPRESSIONS[expression]) {
      const tmp = new FaceComposer();
      tmp.trigger(expression, true);
      for (let i = 0; i < 20; i++) Object.assign(draw, tmp.compose(face, true, null, 'camera', cfg.blush, 0.5, 0.05));
    }
    av.update({ face, draw, pose: new Animator().update(0.016), time: 0, dt: 0.016 });
    const cam = new PerspectiveCamera(28, 1, 0.05, 20);
    const fr = framing === 'close' ? { y: 1.22, h: 0.9 } : framing === 'bust' ? { y: 1.0, h: 1.3 } : { y: 0.78, h: 1.8 };
    const dist = fr.h / 2 / Math.tan((28 * Math.PI) / 360);
    cam.position.set(0.12, fr.y + 0.03, dist);
    cam.lookAt(0, fr.y, 0);
    const rt = new WebGLRenderTarget(size, size, { samples: 4 });
    rt.texture.colorSpace = SRGBColorSpace;
    const prevTarget = this.renderer.getRenderTarget();
    const prevClear = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(rt);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    this.renderer.setRenderTarget(prevTarget);
    this.renderer.setClearColor(0x000000, prevClear);
    rt.dispose();
    av.dispose();
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    // flip Y
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }
}

function lerpDir(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

let instance: Stage | null = null;
export function stage(): Stage {
  if (!instance) instance = new Stage();
  return instance;
}

export function aspectRatio(a: Aspect): number {
  return a === '9:16' ? 9 / 16 : a === '16:9' ? 16 / 9 : 1;
}
