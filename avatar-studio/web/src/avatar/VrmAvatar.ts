import { Group, Object3D, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils, type VRMHumanBoneName } from '@pixiv/three-vrm';
import type { ArmPose } from '../core/types';
import type { AvatarDriver, AvatarFrame } from './driver';
import { clamp } from '../core/filters';

const _q = new Quaternion();

/** Drives any VRM 0.x / 1.0 model (three-vrm): humanoid bones, expressions, look-at, spring bones. */
export class VrmAvatar implements AvatarDriver {
  readonly root = new Group();
  readonly headAnchor = new Object3D();
  private vrm: VRM;
  private rest = new Map<string, Quaternion>();

  private constructor(vrm: VRM) {
    this.vrm = vrm;
    this.root.add(vrm.scene);
    vrm.scene.traverse((o) => {
      o.frustumCulled = false;
      if ((o as import('three').Mesh).isMesh) o.castShadow = true;
    });
    const head = vrm.humanoid.getNormalizedBoneNode('head');
    (head ?? vrm.scene).add(this.headAnchor);
    this.headAnchor.position.set(0, 0.1, 0);
    for (const b of ['hips', 'spine', 'chest', 'neck', 'head', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm'] as VRMHumanBoneName[]) {
      const n = vrm.humanoid.getNormalizedBoneNode(b);
      if (n) this.rest.set(b, n.quaternion.clone());
    }
    // Scale the model so that it matches the procedural avatars (~1.5 units tall).
    const headPos = new Vector3();
    vrm.scene.updateMatrixWorld(true);
    head?.getWorldPosition(headPos);
    const h = headPos.y || 1.4;
    this.root.scale.setScalar(1.2 / h);
  }

  static async load(data: ArrayBuffer): Promise<VrmAvatar> {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.parseAsync(data, '');
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) throw new Error('Ce fichier n\'est pas un modèle VRM.');
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.rotateVRM0(vrm);
    return new VrmAvatar(vrm);
  }

  private bone(name: VRMHumanBoneName): Object3D | null {
    return this.vrm.humanoid.getNormalizedBoneNode(name);
  }

  private setRot(name: VRMHumanBoneName, x: number, y: number, z: number): void {
    const n = this.bone(name);
    if (!n) return;
    n.rotation.set(x, y, z, 'YXZ');
  }

  private applyArm(side: 1 | -1, pose: ArmPose): void {
    const upper = this.bone(side === 1 ? 'leftUpperArm' : 'rightUpperArm');
    const lower = this.bone(side === 1 ? 'leftLowerArm' : 'rightLowerArm');
    if (!upper) return;
    const d = new Vector3(...pose.dir).normalize();
    // In the normalised VRM rig the arms rest along +X (left) / -X (right).
    _q.setFromUnitVectors(new Vector3(side, 0, 0), d);
    upper.quaternion.copy(_q);
    if (lower) lower.rotation.set(0, side === 1 ? -pose.bend : pose.bend, 0);
  }

  update(f: AvatarFrame): void {
    const { face, pose, draw } = f;
    const hx = face.pitch + pose.head[0], hy = face.yaw + pose.head[1], hz = face.roll + pose.head[2];
    const hips = this.bone('hips');
    if (hips) {
      hips.position.x = pose.hipsX + face.tx * 0.05;
      hips.rotation.y = pose.hipsRotY;
    }
    this.setRot('spine', pose.spine[0] + face.pitch * 0.1, pose.spine[1] + face.yaw * 0.2, pose.spine[2] + face.roll * 0.12 - face.tx * 0.1);
    this.setRot('neck', hx * 0.35, hy * 0.3, hz * 0.3);
    this.setRot('head', hx * 0.65, hy * 0.6, hz * 0.6);
    this.applyArm(1, pose.armL);
    this.applyArm(-1, pose.armR);

    const em = this.vrm.expressionManager;
    if (em) {
      const happyEyes = draw.eyeMode === 'happy' ? 1 : 0;
      em.setValue('blinkLeft', clamp(1 - draw.eyeL));
      em.setValue('blinkRight', clamp(1 - draw.eyeR));
      const open = clamp(draw.mouthOpen);
      const round = clamp(draw.mouthRound);
      const wide = clamp(draw.mouthWide);
      em.setValue('aa', clamp(open * (1 - round) * (1 - wide * 0.5)));
      em.setValue('oh', clamp(open * round));
      em.setValue('ou', clamp(round * 0.6 * (1 - open)));
      em.setValue('ih', clamp(wide * open * 0.8));
      em.setValue('ee', clamp(wide * 0.5 * open));
      em.setValue('happy', clamp(Math.max(happyEyes, draw.smile - 0.3)));
      em.setValue('angry', clamp(draw.browAngry));
      em.setValue('sad', clamp(Math.max(draw.browSad * 0.8, draw.tears)));
      em.setValue('surprised', draw.eyeMode === 'wide' ? 1 : 0);
      em.setValue('relaxed', draw.eyeMode === 'sleepy' ? 0.8 : 0);
    }
    if (this.vrm.lookAt) {
      this.vrm.lookAt.autoUpdate = false;
      this.vrm.lookAt.yaw = -draw.gazeX * 18;
      this.vrm.lookAt.pitch = draw.gazeY * 12;
      this.vrm.lookAt.update(f.dt);
    }
    this.vrm.update(f.dt);
  }

  setOutline(): void {
    /* VRM models carry their own MToon outlines */
  }

  dispose(): void {
    VRMUtils.deepDispose(this.vrm.scene);
  }
}
