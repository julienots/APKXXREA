import type { ArmPose, BodyPose, Vec3 } from '../core/types';
import { clamp } from '../core/filters';

type PartialPose = Partial<Omit<BodyPose, 'armL' | 'armR'>> & { armL?: ArmPose; armR?: ArmPose };

export interface Clip {
  id: string;
  duration: number;
  loop: boolean;
  pose: (t: number) => PartialPose;
}

const S = Math.sin;
const C = Math.cos;
const TAU = Math.PI * 2;

function arm(x: number, y: number, z: number, bend: number): ArmPose {
  return { dir: [x, y, z], bend };
}

export function restPose(): BodyPose {
  return {
    armL: arm(0.3, -1, 0.06, 0.18),
    armR: arm(-0.3, -1, 0.06, 0.18),
    spine: [0, 0, 0],
    hipsY: 0,
    hipsX: 0,
    hipsRotY: 0,
    head: [0, 0, 0],
  };
}

export function idlePose(t: number): BodyPose {
  const p = restPose();
  const br = S(t * 1.6);
  p.hipsY = br * 0.006;
  p.spine = [0.015 * br, 0.03 * S(t * 0.35), 0.02 * S(t * 0.5)];
  p.armL.dir = [0.3 + 0.02 * S(t * 1.6 + 1), -1, 0.06 + 0.03 * S(t * 0.7)];
  p.armR.dir = [-0.3 - 0.02 * S(t * 1.6 + 1), -1, 0.06 + 0.03 * S(t * 0.7 + 2)];
  return p;
}

const quant = (t: number, steps: number) => Math.floor(t * steps) / steps;

export const CLIPS: Record<string, Clip> = {
  // ---------------------------------------------------------------- gestures
  wave: { id: 'wave', duration: 2.4, loop: false, pose: (t) => ({ armR: arm(-0.55 + 0.22 * S(t * 11), 0.85, 0.25, 0.85 + 0.25 * S(t * 11 + 1)), head: [0, 0, 0.08] }) },
  nod: { id: 'nod', duration: 1.6, loop: false, pose: (t) => ({ head: [0.22 * Math.max(0, S(t * 8)), 0, 0] }) },
  clap: {
    id: 'clap', duration: 2.4, loop: false,
    pose: (t) => {
      const k = 0.08 + 0.14 * Math.abs(S(t * 9));
      return { armL: arm(k, -0.15, 1, 1.45), armR: arm(-k, -0.15, 1, 1.45), hipsY: 0.008 * Math.abs(S(t * 9)) };
    },
  },
  bow: { id: 'bow', duration: 2.2, loop: false, pose: (t) => { const k = S(clamp(t / 2.2) * Math.PI); return { spine: [0.55 * k, 0, 0], head: [0.2 * k, 0, 0], armL: arm(0.12, -1, 0.35 * k, 0.3), armR: arm(-0.12, -1, 0.35 * k, 0.3) }; } },
  victory: { id: 'victory', duration: 2.2, loop: false, pose: (t) => ({ armL: arm(0.55, 1, 0.1, 0.25), armR: arm(-0.55, 1, 0.1, 0.25), hipsY: 0.03 * Math.abs(S(t * 7)), head: [-0.15, 0, 0] }) },
  heart: { id: 'heart', duration: 2.6, loop: false, pose: (t) => ({ armL: arm(0.5, 1, 0.25, 2.1), armR: arm(-0.5, 1, 0.25, 2.1), head: [0, 0, 0.12 * S(t * 3)] }) },
  think: { id: 'think', duration: 3, loop: false, pose: () => ({ armR: arm(-0.12, -0.15, 1, 2.45), armL: arm(0.15, -0.6, 0.8, 1.6), head: [0.05, 0.1, 0.18] }) },
  shrug: { id: 'shrug', duration: 2, loop: false, pose: (t) => { const k = S(clamp(t / 2) * Math.PI); return { armL: arm(0.75, -0.6, 0.55, 1.5 * k), armR: arm(-0.75, -0.6, 0.55, 1.5 * k), hipsY: 0.02 * k, head: [0, 0, 0.18 * k] }; } },
  facepalm: { id: 'facepalm', duration: 2.6, loop: false, pose: (t) => ({ armR: arm(-0.05, 0.15, 1, 2.6), head: [0.3, 0.05 * S(t * 6), 0], spine: [0.12, 0, 0] }) },

  // ---------------------------------------------------------------- dances
  bounce: {
    id: 'bounce', duration: 8, loop: true,
    pose: (t) => {
      const b = Math.abs(S(t * 5.2));
      return {
        hipsY: 0.045 * b, hipsX: 0.02 * S(t * 2.6),
        armL: arm(0.6, -0.2 + 0.7 * Math.max(0, S(t * 5.2)), 0.3, 1.4),
        armR: arm(-0.6, -0.2 + 0.7 * Math.max(0, -S(t * 5.2)), 0.3, 1.4),
        spine: [0.06 * b, 0.12 * S(t * 2.6), 0], head: [0.08 * b, 0, 0.1 * S(t * 2.6)],
      };
    },
  },
  robot: {
    id: 'robot', duration: 8, loop: true,
    pose: (t) => {
      const q = quant(t, 2.5);
      const a = S(q * 3.1), b = C(q * 2.3);
      return {
        armL: arm(1, 0.6 * a, 0.2, Math.PI / 2 * (b > 0 ? 1 : 0.2)),
        armR: arm(-1, -0.6 * a, 0.2, Math.PI / 2 * (b > 0 ? 0.2 : 1)),
        hipsRotY: 0.35 * Math.sign(a) * (Math.abs(a) > 0.3 ? 1 : 0),
        head: [0, -0.3 * Math.sign(b), 0], hipsY: 0.01 * Math.abs(a),
      };
    },
  },
  disco: {
    id: 'disco', duration: 8, loop: true,
    pose: (t) => {
      const up = S(t * 3.2) > 0;
      return {
        armR: up ? arm(-0.6, 1, 0.3, 0.05) : arm(0.3, -0.6, 0.7, 0.3),
        armL: arm(0.4, -0.7, 0.3, 1.9),
        hipsX: 0.04 * S(t * 6.4), hipsY: 0.02 * Math.abs(S(t * 6.4)),
        spine: [0, 0, 0.12 * S(t * 3.2)], head: [0, 0, -0.15 * S(t * 3.2)],
      };
    },
  },
  spooky: {
    id: 'spooky', duration: 8, loop: true,
    pose: (t) => ({
      armL: arm(0.18 + 0.1 * S(t * 2), 0.05 + 0.1 * S(t * 4), 1, 0.15 + 0.4 * Math.abs(S(t * 2))),
      armR: arm(-0.18 + 0.1 * S(t * 2 + 1), 0.05 + 0.1 * S(t * 4 + 1), 1, 0.15 + 0.4 * Math.abs(S(t * 2 + 1))),
      hipsX: 0.06 * S(t * 2), hipsRotY: 0.25 * S(t * 2), head: [0.1, 0, 0.3 * S(t * 2)], hipsY: 0.02 * S(t * 4),
    }),
  },
  star: {
    id: 'star', duration: 6, loop: true,
    pose: (t) => {
      const spin = clamp((t % 3) / 1.1);
      return {
        hipsRotY: spin < 1 ? spin * TAU : 0,
        armL: arm(1, 0.25 + 0.5 * S(t * 4), 0.1, 0.1), armR: arm(-1, 0.25 + 0.5 * S(t * 4 + Math.PI), 0.1, 0.1),
        hipsY: 0.05 * Math.abs(S(t * 4)), head: [-0.1, 0, 0.1 * S(t * 4)],
      };
    },
  },

  // ---------------------------------------------------------------- expression body language
  'x-joy': { id: 'x-joy', duration: 2.4, loop: false, pose: (t) => ({ hipsY: 0.012 * Math.abs(S(t * 18)), head: [-0.18, 0, 0.06 * S(t * 9)], armL: arm(0.3, -0.7, 0.6, 1.6), armR: arm(-0.3, -0.7, 0.6, 1.6) }) },
  'x-cry': { id: 'x-cry', duration: 3, loop: false, pose: (t) => ({ armL: arm(0.12, -0.05, 1, 2.6), armR: arm(-0.12, -0.05, 1, 2.6), head: [0.22, 0, 0], hipsY: 0.006 * S(t * 14) }) },
  'x-angry': { id: 'x-angry', duration: 2.4, loop: false, pose: (t) => ({ armL: arm(0.35, -0.6, 0.7, 1.9 + 0.12 * S(t * 30)), armR: arm(-0.35, -0.6, 0.7, 1.9 + 0.12 * S(t * 30 + 1)), spine: [0.12, 0, 0], head: [0.15, 0, 0], hipsY: 0.004 * S(t * 30) }) },
  'x-surprise': { id: 'x-surprise', duration: 2, loop: false, pose: (t) => { const k = Math.exp(-t * 2.5); return { spine: [-0.18 * k, 0, 0], armL: arm(0.7, 0.2, 0.5, 1.2), armR: arm(-0.7, 0.2, 0.5, 1.2), hipsY: 0.05 * k * Math.max(0, S(t * 12)), head: [-0.15, 0, 0] }; } },
  'x-love': { id: 'x-love', duration: 3, loop: false, pose: (t) => ({ armL: arm(0.1, -0.4, 1, 2.1), armR: arm(-0.1, -0.4, 1, 2.1), head: [0, 0, 0.18 * S(t * 2.5)], hipsX: 0.02 * S(t * 2.5) }) },
  'x-shy': { id: 'x-shy', duration: 3, loop: false, pose: (t) => ({ armL: arm(0.05, -1, 0.5, 0.9), armR: arm(-0.05, -1, 0.5, 0.9), head: [0.25, -0.2, 0.1], hipsRotY: 0.08 * S(t * 3) }) },
  'x-sleepy': { id: 'x-sleepy', duration: 4, loop: false, pose: (t) => ({ head: [0.25 + 0.08 * S(t * 2), 0, 0.25], spine: [0.08, 0, 0.05], armR: arm(-0.1, 0.1, 1, 2.5) }) },
  'x-dizzy': { id: 'x-dizzy', duration: 3, loop: false, pose: (t) => ({ head: [0.1 * S(t * 6), 0, 0.25 * S(t * 4)], spine: [0, 0, 0.1 * S(t * 4)], hipsX: 0.03 * S(t * 4) }) },
  'x-gloom': { id: 'x-gloom', duration: 3.5, loop: false, pose: () => ({ spine: [0.3, 0, 0], head: [0.3, 0, 0], armL: arm(0.15, -1, 0.2, 0.05), armR: arm(-0.15, -1, 0.2, 0.05), hipsY: -0.02 }) },
  'x-smug': { id: 'x-smug', duration: 2.6, loop: false, pose: () => ({ armL: arm(0.6, -0.8, -0.2, 1.8), armR: arm(-0.6, -0.8, -0.2, 1.8), head: [-0.12, 0.1, -0.1] }) },
  'x-wow': { id: 'x-wow', duration: 2.6, loop: false, pose: (t) => ({ armL: arm(0.2, -0.3, 1, 2.2), armR: arm(-0.2, -0.3, 1, 2.2), hipsY: 0.02 * Math.abs(S(t * 8)), head: [-0.1, 0, 0.08 * S(t * 4)] }) },
};

function lerpV(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function lerpArm(a: ArmPose, b: ArmPose, t: number): ArmPose {
  const na = norm(a.dir), nb = norm(b.dir);
  return { dir: norm(lerpV(na, nb, t)), bend: a.bend + (b.bend - a.bend) * t };
}

export function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function blendPose(base: BodyPose, over: PartialPose, w: number): BodyPose {
  if (w <= 0) return base;
  return {
    armL: over.armL ? lerpArm(base.armL, over.armL, w) : base.armL,
    armR: over.armR ? lerpArm(base.armR, over.armR, w) : base.armR,
    spine: over.spine ? lerpV(base.spine, over.spine, w) : base.spine,
    head: over.head ? lerpV(base.head, over.head, w) : base.head,
    hipsY: over.hipsY !== undefined ? base.hipsY + (over.hipsY - base.hipsY) * w : base.hipsY,
    hipsX: over.hipsX !== undefined ? base.hipsX + (over.hipsX - base.hipsX) * w : base.hipsX,
    hipsRotY: over.hipsRotY !== undefined ? base.hipsRotY + (over.hipsRotY - base.hipsRotY) * w : base.hipsRotY,
  };
}

interface Playing {
  clip: Clip;
  t: number;
  w: number;
  fadingOut: boolean;
}

/** Plays body clips on top of the idle loop with cross-fades. Two layers: gesture/dance and expression. */
export class Animator {
  private layers: (Playing | null)[] = [null, null];
  private time = 0;

  play(id: string, layer = 0): boolean {
    const clip = CLIPS[id];
    if (!clip) return false;
    const cur = this.layers[layer];
    if (cur && cur.clip.id === id && clip.loop) {
      cur.fadingOut = true; // toggle off a looping dance
      return false;
    }
    this.layers[layer] = { clip, t: 0, w: cur ? cur.w * 0.5 : 0, fadingOut: false };
    return true;
  }

  stop(layer = 0): void {
    const cur = this.layers[layer];
    if (cur) cur.fadingOut = true;
  }

  isPlaying(id: string): boolean {
    return this.layers.some((l) => l && l.clip.id === id && !l.fadingOut);
  }

  get current(): string | null {
    const l = this.layers[0];
    return l && !l.fadingOut ? l.clip.id : null;
  }

  update(dt: number): BodyPose {
    this.time += dt;
    let pose = idlePose(this.time);
    for (let i = 0; i < this.layers.length; i++) {
      const l = this.layers[i];
      if (!l) continue;
      l.t += dt;
      if (!l.clip.loop && l.t > l.clip.duration - 0.35) l.fadingOut = true;
      l.w = clamp(l.w + (l.fadingOut ? -dt * 3.2 : dt * 4));
      if (l.fadingOut && l.w <= 0) {
        this.layers[i] = null;
        continue;
      }
      const ease = l.w * l.w * (3 - 2 * l.w);
      pose = blendPose(pose, l.clip.pose(l.t), ease);
    }
    return pose;
  }
}
