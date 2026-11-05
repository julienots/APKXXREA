import type { EyeMode, FaceState } from '../core/types';
import type { FaceDraw } from './FaceCanvas';
import type { Visemes } from '../audio/LipSync';
import { clamp, lerp } from '../core/filters';

export interface ExpressionDef {
  style: string;
  eyeMode: EyeMode;
  brow: { raise: number; angry: number; sad: number };
  mouth?: { open: number; smile: number; wide: number; round: number; smirk?: number };
  blush?: number;
  tears?: number;
  anger?: number;
  sweat?: number;
  gloom?: number;
  shy?: number;
  particles?: 'hearts' | 'sparkles' | 'tears' | 'anger' | 'zzz' | 'stars' | 'rain' | 'notes';
  clip: string;
  duration: number;
}

export const EXPRESSIONS: Record<string, ExpressionDef> = {
  joy: { style: 'joy', eyeMode: 'happy', brow: { raise: 0.5, angry: 0, sad: 0 }, mouth: { open: 0.75, smile: 1, wide: 0.6, round: 0 }, blush: 0.6, particles: 'notes', clip: 'x-joy', duration: 2.6 },
  surprise: { style: 'surprise', eyeMode: 'wide', brow: { raise: 1.3, angry: 0, sad: 0 }, mouth: { open: 0.85, smile: 0, wide: -0.3, round: 0.9 }, sweat: 0.6, particles: 'stars', clip: 'x-surprise', duration: 2.2 },
  cry: { style: 'cry', eyeMode: 'teary', brow: { raise: 0.3, angry: 0, sad: 1 }, mouth: { open: 0.45, smile: -0.9, wide: 0.3, round: 0 }, tears: 1, particles: 'tears', clip: 'x-cry', duration: 3.2 },
  angry: { style: 'angry', eyeMode: 'angry', brow: { raise: -0.4, angry: 1, sad: 0 }, mouth: { open: 0.35, smile: -0.8, wide: 0.7, round: 0 }, anger: 1, blush: 0.3, particles: 'anger', clip: 'x-angry', duration: 2.6 },
  love: { style: 'love', eyeMode: 'heart', brow: { raise: 0.4, angry: 0, sad: 0.2 }, mouth: { open: 0.2, smile: 0.9, wide: 0.2, round: 0 }, blush: 1, particles: 'hearts', clip: 'x-love', duration: 3.2 },
  shy: { style: 'shy', eyeMode: 'normal', brow: { raise: 0.2, angry: 0, sad: 0.6 }, mouth: { open: 0.05, smile: 0.3, wide: -0.2, round: 0.3 }, blush: 1, shy: 1, sweat: 0.4, clip: 'x-shy', duration: 3 },
  wow: { style: 'wow', eyeMode: 'star', brow: { raise: 1, angry: 0, sad: 0 }, mouth: { open: 0.6, smile: 0.7, wide: 0.2, round: 0.2 }, blush: 0.5, particles: 'sparkles', clip: 'x-wow', duration: 2.8 },
  gloom: { style: 'gloom', eyeMode: 'sleepy', brow: { raise: 0, angry: 0, sad: 1 }, mouth: { open: 0.08, smile: -1, wide: -0.1, round: 0 }, gloom: 1, particles: 'rain', clip: 'x-gloom', duration: 3.6 },
  sleepy: { style: 'sleepy', eyeMode: 'sleepy', brow: { raise: -0.1, angry: 0, sad: 0.3 }, mouth: { open: 0.35, smile: 0, wide: -0.2, round: 0.8 }, particles: 'zzz', clip: 'x-sleepy', duration: 4 },
  dizzy: { style: 'dizzy', eyeMode: 'swirl', brow: { raise: 0.5, angry: 0, sad: 0.5 }, mouth: { open: 0.3, smile: -0.3, wide: 0.5, round: 0 }, sweat: 1, particles: 'stars', clip: 'x-dizzy', duration: 3 },
  smug: { style: 'smug', eyeMode: 'normal', brow: { raise: 0.4, angry: 0.3, sad: 0 }, mouth: { open: 0, smile: 0.7, wide: 0.3, round: 0, smirk: 1 }, blush: 0.2, particles: 'sparkles', clip: 'x-smug', duration: 2.6 },
};

interface Active {
  def: ExpressionDef;
  t: number;
  w: number;
  hold: boolean;
}

/**
 * Composes the final face: tracked face + voice visemes + triggered expressions + automatic
 * micro-animation (blinks, saccades) when the camera is off.
 */
export class FaceComposer {
  private active: Active | null = null;
  private blinkT = 2;
  private blinkPhase = 0;
  private saccade = { x: 0, y: 0, t: 1 };
  private gestureHold = { joy: 0, surprise: 0, angry: 0, sleepy: 0 };
  private gestureCooldown = 0;
  onGesture?: (style: string) => void;

  trigger(style: string, hold = false): ExpressionDef | null {
    const def = EXPRESSIONS[style];
    if (!def) return null;
    if (this.active && this.active.def.style === style && this.active.hold) {
      this.active.hold = false;
      this.active.t = def.duration;
      return null;
    }
    this.active = { def, t: 0, w: this.active ? this.active.w * 0.5 : 0, hold };
    return def;
  }

  get current(): string | null {
    return this.active && this.active.w > 0.3 ? this.active.def.style : null;
  }

  get weight(): number {
    return this.active?.w ?? 0;
  }

  /** Gesture triggers from the tracked face (held big smile, surprised face, frown, closed eyes). */
  detectGestures(f: FaceState, tracked: boolean, dt: number): void {
    this.gestureCooldown -= dt;
    if (!tracked || this.active || this.gestureCooldown > 0) {
      for (const k of Object.keys(this.gestureHold) as (keyof typeof this.gestureHold)[]) this.gestureHold[k] = 0;
      return;
    }
    const h = this.gestureHold;
    h.joy = f.smile > 0.75 && f.mouthOpen > 0.25 ? h.joy + dt : 0;
    h.surprise = f.mouthOpen > 0.6 && (f.browL + f.browR) / 2 > 0.7 ? h.surprise + dt : 0;
    h.angry = f.browAngry > 0.6 && f.smile < 0 ? h.angry + dt : 0;
    h.sleepy = f.eyeL < 0.15 && f.eyeR < 0.15 ? h.sleepy + dt : 0;
    const fire = (k: keyof typeof h, need: number, style: string) => {
      if (h[k] > need) {
        h[k] = 0;
        this.gestureCooldown = 4;
        this.onGesture?.(style);
      }
    };
    fire('joy', 0.9, 'joy');
    fire('surprise', 0.5, 'surprise');
    fire('angry', 0.9, 'angry');
    fire('sleepy', 2.5, 'sleepy');
  }

  compose(face: FaceState, tracked: boolean, lip: Visemes | null, mouthMode: 'mix' | 'camera' | 'voice', blush: number, time: number, dt: number): FaceDraw {
    // Automatic life when the camera is not tracking
    let eyeL = face.eyeL, eyeR = face.eyeR, gazeX = face.gazeX, gazeY = face.gazeY;
    if (!tracked) {
      this.blinkT -= dt;
      if (this.blinkT <= 0) {
        this.blinkPhase = 0.16;
        this.blinkT = 2 + Math.random() * 3.5;
      }
      this.saccade.t -= dt;
      if (this.saccade.t <= 0) {
        this.saccade = { x: (Math.random() - 0.5) * 0.6, y: (Math.random() - 0.5) * 0.3, t: 0.8 + Math.random() * 2.5 };
      }
      gazeX = lerp(gazeX, this.saccade.x, 0.15);
      gazeY = lerp(gazeY, this.saccade.y, 0.15);
    }
    if (this.blinkPhase > 0) {
      this.blinkPhase -= dt;
      const b = Math.sin((1 - this.blinkPhase / 0.16) * Math.PI);
      eyeL = Math.min(eyeL, 1 - b);
      eyeR = Math.min(eyeR, 1 - b);
    }

    // Mouth: camera + voice
    let open = tracked ? face.mouthOpen : 0;
    let wide = tracked ? face.mouthWide : 0;
    let round = tracked ? face.mouthRound : 0;
    if (lip && lip.level > 0.02 && mouthMode !== 'camera') {
      if (mouthMode === 'voice' || !tracked) {
        open = lip.open;
        wide = lip.wide;
        round = lip.round;
      } else {
        // Mixed: camera gives the shape, voice reinforces the opening and vowel
        open = Math.max(open, lip.open * 0.85);
        round = lerp(round, lip.round, 0.5);
        wide = lerp(wide, lip.wide, 0.4);
      }
    }

    const d: FaceDraw = {
      eyeL, eyeR, gazeX, gazeY, eyeMode: 'normal',
      browL: face.browL, browR: face.browR, browAngry: face.browAngry, browSad: face.browSad,
      mouthOpen: open, mouthWide: wide, mouthRound: round, smile: face.smile, smirk: 0,
      blush, tears: 0, anger: 0, sweat: 0, gloom: 0, shy: 0, time,
    };

    // Triggered expression layer
    const a = this.active;
    if (a) {
      a.t += dt;
      const ending = !a.hold && a.t > a.def.duration;
      a.w = clamp(a.w + (ending ? -dt * 3 : dt * 5));
      if (ending && a.w <= 0) this.active = null;
      else {
        const w = a.w;
        const e = a.def;
        if (w > 0.45) d.eyeMode = e.eyeMode;
        d.browL = lerp(d.browL, e.brow.raise, w);
        d.browR = lerp(d.browR, e.brow.raise, w);
        d.browAngry = lerp(d.browAngry, e.brow.angry, w);
        d.browSad = lerp(d.browSad, e.brow.sad, w);
        if (e.mouth) {
          const talk = lip && lip.level > 0.1 ? lip.open * 0.5 : 0;
          d.mouthOpen = lerp(d.mouthOpen, Math.max(e.mouth.open, talk), w);
          d.smile = lerp(d.smile, e.mouth.smile, w);
          d.mouthWide = lerp(d.mouthWide, e.mouth.wide, w);
          d.mouthRound = lerp(d.mouthRound, e.mouth.round, w);
          d.smirk = (e.mouth.smirk ?? 0) * w;
        }
        d.blush = Math.max(d.blush, (e.blush ?? 0) * w);
        d.tears = (e.tears ?? 0) * w;
        d.anger = (e.anger ?? 0) * w;
        d.sweat = (e.sweat ?? 0) * w;
        d.gloom = (e.gloom ?? 0) * w;
        d.shy = (e.shy ?? 0) * w;
        if (e.eyeMode === 'happy' || e.eyeMode === 'swirl' || e.eyeMode === 'star' || e.eyeMode === 'heart') {
          d.eyeL = d.eyeR = 1;
        }
      }
    }
    return d;
  }
}
