import type { Object3D } from 'three';
import type { BodyPose, FaceState } from '../core/types';
import type { FaceDraw } from './FaceCanvas';

export interface AvatarFrame {
  face: FaceState;
  draw: FaceDraw;
  pose: BodyPose;
  time: number;
  dt: number;
}

export interface AvatarDriver {
  readonly root: Object3D;
  /** Follows the head; used to anchor particles (hearts, tears, sparkles). */
  readonly headAnchor: Object3D;
  update(f: AvatarFrame): void;
  setOutline(on: boolean): void;
  dispose(): void;
}
