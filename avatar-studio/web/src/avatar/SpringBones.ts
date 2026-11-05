import { Object3D, Quaternion, Vector3 } from 'three';

const _v = new Vector3();
const _v2 = new Vector3();
const _q = new Quaternion();
const _qi = new Quaternion();

interface Joint {
  node: Object3D;
  /** Rest direction of the child segment in the joint's parent space. */
  restDir: Vector3;
  restQuat: Quaternion;
  length: number;
  tail: Vector3;
  prevTail: Vector3;
}

export interface SpringParams {
  stiffness: number;
  drag: number;
  gravity: number;
}

/**
 * Verlet spring-bone chains (same principle as VRM spring bones): each joint's tail is simulated
 * as a point mass pulled back to its rest pose, then the joint is rotated to aim at it.
 */
export class SpringChain {
  private joints: Joint[] = [];
  private colliders: { center: Object3D; radius: number }[] = [];

  constructor(nodes: Object3D[], segmentLength: number, public params: SpringParams = { stiffness: 3.2, drag: 0.35, gravity: 1.2 }) {
    for (const node of nodes) {
      const restDir = new Vector3(0, -1, 0);
      this.joints.push({
        node,
        restDir,
        restQuat: node.quaternion.clone(),
        length: segmentLength,
        tail: new Vector3(),
        prevTail: new Vector3(),
      });
    }
  }

  addCollider(center: Object3D, radius: number): void {
    this.colliders.push({ center, radius });
  }

  reset(): void {
    for (const j of this.joints) {
      j.node.quaternion.copy(j.restQuat);
      j.node.updateWorldMatrix(true, false);
      this.restTail(j, j.tail);
      j.prevTail.copy(j.tail);
    }
  }

  private restTail(j: Joint, out: Vector3): Vector3 {
    // world position of tail if the joint had its rest rotation
    const parent = j.node.parent!;
    parent.getWorldQuaternion(_q);
    _q.multiply(j.restQuat);
    out.copy(j.restDir).applyQuaternion(_q).multiplyScalar(j.length);
    j.node.getWorldPosition(_v2);
    return out.add(_v2);
  }

  update(dt: number): void {
    if (!this.joints.length) return;
    dt = Math.min(dt, 1 / 30);
    const { stiffness, drag, gravity } = this.params;
    for (const j of this.joints) {
      j.node.quaternion.copy(j.restQuat);
      j.node.updateWorldMatrix(true, false);
      const head = j.node.getWorldPosition(new Vector3());
      const rest = this.restTail(j, new Vector3());
      if (j.tail.lengthSq() === 0) {
        j.tail.copy(rest);
        j.prevTail.copy(rest);
      }
      const vel = _v.copy(j.tail).sub(j.prevTail).multiplyScalar(1 - drag);
      const next = new Vector3().copy(j.tail).add(vel);
      next.addScaledVector(rest.sub(j.tail), Math.min(1, stiffness * dt * 6));
      next.y -= gravity * dt * dt * 9.8 * 0.6;
      // keep segment length
      next.sub(head).normalize().multiplyScalar(j.length).add(head);
      for (const c of this.colliders) {
        const cp = c.center.getWorldPosition(new Vector3());
        const d = next.distanceTo(cp);
        const r = c.radius + 0.01;
        if (d < r) {
          next.sub(cp).normalize().multiplyScalar(r).add(cp);
          next.sub(head).normalize().multiplyScalar(j.length).add(head);
        }
      }
      j.prevTail.copy(j.tail);
      j.tail.copy(next);
      // aim joint toward tail
      const parentQ = j.node.parent!.getWorldQuaternion(new Quaternion());
      const worldRestDir = j.restDir.clone().applyQuaternion(parentQ.clone().multiply(j.restQuat)).normalize();
      const toTail = next.clone().sub(head).normalize();
      _q.setFromUnitVectors(worldRestDir, toTail);
      // world rotation = _q * parentQ * restQuat  ->  local = parentQ^-1 * that
      _qi.copy(parentQ).invert();
      j.node.quaternion.copy(_qi.multiply(_q).multiply(parentQ).multiply(j.restQuat));
      j.node.updateWorldMatrix(false, false);
    }
  }
}
