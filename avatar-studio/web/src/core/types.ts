export type Slot =
  | 'base'
  | 'hair'
  | 'eyes'
  | 'brows'
  | 'mouth'
  | 'outfit'
  | 'accessory'
  | 'expression'
  | 'animation'
  | 'background';

export type Rarity = 'commun' | 'rare' | 'epique' | 'legendaire';

export interface Item {
  id: string;
  slot: Slot;
  name: string;
  desc?: string;
  /** Price in Eclats. 0 = free starter item. */
  price: number;
  rarity: Rarity;
  collection?: string;
  /** Only available with a Pro subscription (not purchasable). */
  pro?: boolean;
  /** Limited availability: purchasable until this ISO date. */
  until?: string;
  /** Available from this ISO date. Pro gets early access before it. */
  from?: string;
  /** App version that introduced the item (drives the "Nouveautés" badges). */
  addedIn: string;
  /** Style key consumed by the renderer. */
  style: string;
  /** Optional default colour. */
  color?: string;
  color2?: string;
}

export interface AvatarConfig {
  id: string;
  name: string;
  kind: 'toon' | 'vrm';
  /** IndexedDB key of an imported VRM file. */
  vrmKey?: string;
  base: string;
  skin: string;
  hair: string;
  hairColor: string;
  hairColor2: string;
  eyes: string;
  eyeColor: string;
  brows: string;
  mouth: string;
  outfit: string;
  outfitColor: string;
  outfitColor2: string;
  accessories: string[];
  accentColor: string;
  blush: number;
  height: number;
}

/** Normalised face parameters, produced by tracking / lip-sync / expressions, consumed by avatars. */
export interface FaceState {
  /** Head rotation (radians), avatar space. */
  yaw: number;
  pitch: number;
  roll: number;
  /** Head translation in normalised units (-1..1). */
  tx: number;
  ty: number;
  tz: number;
  /** Eye openness 0..1. L = avatar left (screen right). */
  eyeL: number;
  eyeR: number;
  /** Gaze in display space (-1..1). */
  gazeX: number;
  gazeY: number;
  browL: number;
  browR: number;
  browAngry: number;
  browSad: number;
  mouthOpen: number;
  mouthWide: number;
  mouthRound: number;
  smile: number;
  cheekPuff: number;
  /** Viseme weights from voice analysis. */
  vA: number;
  vI: number;
  vU: number;
  vE: number;
  vO: number;
}

export function neutralFace(): FaceState {
  return {
    yaw: 0, pitch: 0, roll: 0, tx: 0, ty: 0, tz: 0,
    eyeL: 1, eyeR: 1, gazeX: 0, gazeY: 0,
    browL: 0, browR: 0, browAngry: 0, browSad: 0,
    mouthOpen: 0, mouthWide: 0, mouthRound: 0, smile: 0.15, cheekPuff: 0,
    vA: 0, vI: 0, vU: 0, vE: 0, vO: 0,
  };
}

export type EyeMode = 'normal' | 'happy' | 'star' | 'heart' | 'swirl' | 'teary' | 'sleepy' | 'wide' | 'angry';

/** Visual overlays and overrides from triggered expressions. */
export interface ExpressionLayer {
  id: string;
  weight: number;
  eyeMode: EyeMode;
  brow: { raise: number; angry: number; sad: number };
  mouth: { open: number; smile: number; wide: number; round: number } | null;
  blush: number;
  tears: number;
  anger: number;
  sweat: number;
  gloom: number;
  sparkle: number;
  hearts: number;
}

export type Vec3 = [number, number, number];

export interface ArmPose {
  /** Upper arm direction in body space (avatar faces +Z, avatar left = +X). */
  dir: Vec3;
  /** Elbow bend in radians. */
  bend: number;
}

export interface BodyPose {
  armL: ArmPose;
  armR: ArmPose;
  spine: Vec3;
  hipsY: number;
  hipsX: number;
  hipsRotY: number;
  head: Vec3;
}

export type Aspect = '9:16' | '16:9' | '1:1';
export type Framing = 'close' | 'bust' | 'full';
