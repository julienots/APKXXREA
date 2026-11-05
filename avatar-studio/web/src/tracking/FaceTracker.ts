import { FaceLandmarker, HandLandmarker, FilesetResolver, type FaceLandmarkerResult, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { Euler, Matrix4 } from 'three';
import { OneEuro, clamp } from '../core/filters';
import { neutralFace, type FaceState, type ArmPose } from '../core/types';
import { store } from '../core/store';

export type TrackerStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error' | 'denied';

const BASE = './';

/**
 * Camera face tracking with MediaPipe Face Landmarker (478 landmarks + 52 ARKit-style blendshapes
 * + facial transformation matrix), fully on-device (WASM + GPU delegate). Optional hand tracking.
 */
export class FaceTracker {
  status: TrackerStatus = 'idle';
  error = '';
  readonly video: HTMLVideoElement;
  face: FaceState = neutralFace();
  faceFound = false;
  lastLandmarks: { x: number; y: number }[] | null = null;
  hands: { L?: ArmPose; R?: ArmPose } = {};
  handPoints: { x: number; y: number }[][] = [];
  fps = 0;
  /** Raw (uncalibrated) head angles, used to calibrate. */
  raw = { yaw: 0, pitch: 0, roll: 0 };

  private landmarker: FaceLandmarker | null = null;
  private handLandmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private filters = new Map<string, OneEuro>();
  private lastTs = 0;
  private lastVideoTime = -1;
  private frames = 0;
  private fpsT = 0;
  private running = false;
  private noFaceFrames = 0;
  private handLoading = false;
  private listeners = new Set<() => void>();

  constructor() {
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  private setStatus(s: TrackerStatus, err = ''): void {
    this.status = s;
    this.error = err;
    this.emit();
  }

  async init(onProgress?: (p: number, label: string) => void): Promise<void> {
    if (this.landmarker) return;
    this.setStatus('loading');
    onProgress?.(0.1, 'Moteur de vision');
    const fileset = await FilesetResolver.forVisionTasks(BASE + 'mediapipe');
    onProgress?.(0.5, 'Modèle du visage');
    const opts = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: BASE + 'models/face_landmarker.task', delegate },
      runningMode: 'VIDEO' as const,
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, opts('GPU'));
    } catch {
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, opts('CPU'));
    }
    onProgress?.(1, 'Prêt');
    this.setStatus('ready');
  }

  private async ensureHands(): Promise<void> {
    if (this.handLandmarker || this.handLoading) return;
    this.handLoading = true;
    try {
      const fileset = await FilesetResolver.forVisionTasks(BASE + 'mediapipe');
      const opts = (delegate: 'GPU' | 'CPU') => ({
        baseOptions: { modelAssetPath: BASE + 'models/hand_landmarker.task', delegate },
        runningMode: 'VIDEO' as const,
        numHands: 2,
      });
      try {
        this.handLandmarker = await HandLandmarker.createFromOptions(fileset, opts('GPU'));
      } catch {
        this.handLandmarker = await HandLandmarker.createFromOptions(fileset, opts('CPU'));
      }
    } finally {
      this.handLoading = false;
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    try {
      if (!this.landmarker) await this.init();
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
      this.running = true;
      this.setStatus('running');
      this.loop();
    } catch (e) {
      const err = e as DOMException;
      if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) this.setStatus('denied', 'Accès à la caméra refusé.');
      else this.setStatus('error', err?.message || 'Caméra indisponible.');
    }
  }

  stop(): void {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.faceFound = false;
    if (this.status === 'running') this.setStatus('ready');
  }

  get active(): boolean {
    return this.running;
  }

  calibrate(): void {
    store.update((s) => {
      s.calibration = { ...this.raw };
    });
  }

  private f(key: string, v: number, dt: number): number {
    let flt = this.filters.get(key);
    const sm = store.state.settings.smoothing;
    if (!flt) {
      flt = new OneEuro();
      this.filters.set(key, flt);
    }
    flt.minCutoff = 0.4 + (1 - sm) * 3.5;
    flt.beta = 0.008 + (1 - sm) * 0.05;
    return flt.filter(v, dt);
  }

  private loop = (): void => {
    if (!this.running) return;
    const v = this.video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    this.process();
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(this.loop);
    else requestAnimationFrame(this.loop);
  };

  private process(): void {
    const lm = this.landmarker;
    if (!lm || this.video.readyState < 2) return;
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;
    const now = performance.now();
    const dt = this.lastTs ? (now - this.lastTs) / 1000 : 1 / 30;
    this.lastTs = now;
    this.frames++;
    if (now - this.fpsT > 1000) {
      this.fps = (this.frames * 1000) / (now - this.fpsT);
      this.frames = 0;
      this.fpsT = now;
    }
    let res: FaceLandmarkerResult;
    try {
      res = lm.detectForVideo(this.video, now);
    } catch {
      return;
    }
    this.apply(res, dt);
    if (store.state.settings.handTracking) {
      if (!this.handLandmarker) void this.ensureHands();
      else if (this.frames % 2 === 0) {
        try {
          this.applyHands(this.handLandmarker.detectForVideo(this.video, now + 0.5));
        } catch {
          /* skip frame */
        }
      }
    } else if (this.hands.L || this.hands.R) {
      this.hands = {};
      this.handPoints = [];
    }
  }

  private apply(res: FaceLandmarkerResult, dt: number): void {
    const st = store.state.settings;
    const cal = store.state.calibration;
    const found = !!res.faceLandmarks?.length;
    if (!found) {
      this.noFaceFrames++;
      if (this.noFaceFrames > 8 && this.faceFound) {
        this.faceFound = false;
        this.emit();
      }
      // drift back to neutral
      const n = neutralFace();
      for (const k of Object.keys(n) as (keyof FaceState)[]) this.face[k] += (n[k] - this.face[k]) * 0.08;
      return;
    }
    this.noFaceFrames = 0;
    if (!this.faceFound) {
      this.faceFound = true;
      this.emit();
    }
    this.lastLandmarks = res.faceLandmarks[0];
    const bs: Record<string, number> = {};
    for (const c of res.faceBlendshapes?.[0]?.categories ?? []) bs[c.categoryName] = c.score;
    const mirror = st.mirror ? 1 : -1;
    const sens = st.sensitivity;

    // Head rotation from the facial transformation matrix
    let yaw = 0, pitch = 0, roll = 0;
    const mtx = res.facialTransformationMatrixes?.[0];
    if (mtx) {
      const e = new Euler().setFromRotationMatrix(new Matrix4().fromArray(mtx.data), 'YXZ');
      pitch = e.x;
      yaw = -e.y * mirror;
      roll = -e.z * mirror;
      const t = mtx.data;
      this.face.tx = this.f('tx', clamp((t[12] / 12) * mirror, -1, 1), dt);
      this.face.ty = this.f('ty', clamp(t[13] / 12, -1, 1), dt);
      this.face.tz = this.f('tz', clamp((t[14] + 45) / 25, -1, 1), dt);
    }
    this.raw = { yaw, pitch, roll };
    this.face.yaw = this.f('yaw', clamp((yaw - cal.yaw) * sens, -1.1, 1.1), dt);
    this.face.pitch = this.f('pitch', clamp((pitch - cal.pitch) * sens, -0.8, 0.8), dt);
    this.face.roll = this.f('roll', clamp((roll - cal.roll) * sens, -0.8, 0.8), dt);

    // Eyes. MediaPipe "Left" blendshapes refer to the left side of the image.
    const g = (k: string) => bs[k] ?? 0;
    let imgL = 1 - clamp((g('eyeBlinkLeft') - 0.12) / 0.5);
    let imgR = 1 - clamp((g('eyeBlinkRight') - 0.12) / 0.5);
    imgL = clamp(imgL + g('eyeWideLeft') * 0.3, 0, 1.2);
    imgR = clamp(imgR + g('eyeWideRight') * 0.3, 0, 1.2);
    let eyeL = st.mirror ? imgL : imgR;
    let eyeR = st.mirror ? imgR : imgL;
    if (st.swapEyes) [eyeL, eyeR] = [eyeR, eyeL];
    // Link eyes slightly so a half blink on one side stays natural
    const avg = (eyeL + eyeR) / 2;
    if (Math.abs(eyeL - eyeR) < 0.25) eyeL = eyeR = avg;
    this.face.eyeL = this.f('eyeL', eyeL, dt * 2.5);
    this.face.eyeR = this.f('eyeR', eyeR, dt * 2.5);
    const gx = (g('eyeLookOutLeft') - g('eyeLookInLeft') + g('eyeLookInRight') - g('eyeLookOutRight')) / 2;
    const gy = (g('eyeLookUpLeft') + g('eyeLookUpRight') - g('eyeLookDownLeft') - g('eyeLookDownRight')) / 2;
    this.face.gazeX = this.f('gx', clamp(gx * 1.6 * mirror, -1, 1), dt);
    this.face.gazeY = this.f('gy', clamp(gy * 1.8, -1, 1), dt);

    // Brows
    const down = (g('browDownLeft') + g('browDownRight')) / 2;
    const outerL = g(st.mirror ? 'browOuterUpLeft' : 'browOuterUpRight');
    const outerR = g(st.mirror ? 'browOuterUpRight' : 'browOuterUpLeft');
    const inner = g('browInnerUp');
    this.face.browL = this.f('bl', clamp((inner * 0.6 + outerL * 0.8 - down * 0.8) * 1.6 * sens, -1, 1.4), dt);
    this.face.browR = this.f('br', clamp((inner * 0.6 + outerR * 0.8 - down * 0.8) * 1.6 * sens, -1, 1.4), dt);
    this.face.browAngry = this.f('ba', clamp((down - 0.15) * 2.2), dt);
    this.face.browSad = this.f('bs', clamp((inner - (outerL + outerR) / 2 - 0.15) * 2), dt);

    // Mouth
    const smile = (g('mouthSmileLeft') + g('mouthSmileRight')) / 2;
    const frown = (g('mouthFrownLeft') + g('mouthFrownRight')) / 2;
    this.face.mouthOpen = this.f('mo', clamp((g('jawOpen') - 0.04) * 1.9 * sens, 0, 1.1), dt * 1.8);
    this.face.mouthRound = this.f('mr', clamp(Math.max(g('mouthFunnel'), g('mouthPucker')) * 1.5), dt);
    this.face.mouthWide = this.f('mw', clamp(smile * 0.8 + (g('mouthStretchLeft') + g('mouthStretchRight')) * 0.6 - g('mouthPucker') * 0.7, -0.5, 1), dt);
    this.face.smile = this.f('sm', clamp(smile * 1.4 - frown * 1.2 + 0.1, -1, 1), dt);
    this.face.cheekPuff = this.f('cp', g('cheekPuff'), dt);
  }

  private applyHands(res: HandLandmarkerResult): void {
    const mirror = store.state.settings.mirror;
    this.handPoints = res.landmarks ?? [];
    const out: { L?: ArmPose; R?: ArmPose } = {};
    for (const lms of res.landmarks ?? []) {
      const wrist = lms[0];
      const mid = lms[9];
      const x = mirror ? 1 - wrist.x : wrist.x;
      const y = wrist.y;
      // Screen right = avatar left (+X)
      const side: 1 | -1 = x > 0.5 ? 1 : -1;
      const shoulderX = 0.5 + side * 0.16;
      const shoulderY = 0.82;
      const dx = (x - shoulderX) * 2.2;
      const dy = (shoulderY - y) * 2.0;
      const handSize = Math.hypot(mid.x - wrist.x, mid.y - wrist.y);
      const bend = clamp(1.9 - dy * 0.9 - handSize * 2, 0.2, 2.4);
      const pose: ArmPose = { dir: [dx + side * 0.25, dy - 0.2, 0.45], bend };
      if (side === 1) out.L = pose;
      else out.R = pose;
    }
    this.hands = out;
  }
}
