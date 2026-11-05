import { CircleGeometry, Group, Mesh, MeshBasicMaterial, Object3D, Shape, ShapeGeometry, SphereGeometry, Vector3, DoubleSide, type BufferGeometry } from 'three';

type Kind = 'hearts' | 'sparkles' | 'tears' | 'anger' | 'zzz' | 'stars' | 'rain' | 'notes';

interface P {
  m: Mesh;
  v: Vector3;
  life: number;
  max: number;
  spin: number;
  orbit?: number;
}

function starShape(r: number): Shape {
  const s = new Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return s;
}

function heart(r: number): Shape {
  const s = new Shape();
  s.moveTo(0, -0.8 * r);
  s.bezierCurveTo(-1.3 * r, 0.1 * r, -0.6 * r, 1.1 * r, 0, 0.4 * r);
  s.bezierCurveTo(0.6 * r, 1.1 * r, 1.3 * r, 0.1 * r, 0, -0.8 * r);
  return s;
}

function zShape(r: number): Shape {
  const s = new Shape();
  s.moveTo(-r, r); s.lineTo(r, r); s.lineTo(r, r * 0.6); s.lineTo(-r * 0.3, -r * 0.6); s.lineTo(r, -r * 0.6);
  s.lineTo(r, -r); s.lineTo(-r, -r); s.lineTo(-r, -r * 0.6); s.lineTo(r * 0.3, r * 0.6); s.lineTo(-r, r * 0.6);
  s.closePath();
  return s;
}

function noteShapes(r: number): Shape[] {
  const head = new Shape();
  head.absellipse(0, 0, r * 0.5, r * 0.36, 0, Math.PI * 2, false, 0.4);
  const stem = new Shape();
  stem.moveTo(r * 0.38, 0); stem.lineTo(r * 0.5, 0); stem.lineTo(r * 0.5, r * 1.6);
  stem.quadraticCurveTo(r * 0.9, r * 1.3, r * 1.0, r * 0.9); stem.quadraticCurveTo(r * 0.9, r * 1.45, r * 0.38, r * 1.75);
  stem.closePath();
  return [head, stem];
}

function crossShape(r: number): Shape {
  const s = new Shape();
  const w = r * 0.32;
  s.moveTo(-w, r); s.lineTo(w, r); s.lineTo(w, w); s.lineTo(r, w); s.lineTo(r, -w); s.lineTo(w, -w);
  s.lineTo(w, -r); s.lineTo(-w, -r); s.lineTo(-w, -w); s.lineTo(-r, -w); s.lineTo(-r, w); s.lineTo(-w, w);
  s.closePath();
  return s;
}

/** Billboard-ish 3D particles anchored to the avatar's head for triggered expressions. */
export class Particles {
  readonly group = new Group();
  private items: P[] = [];
  private geos: Record<string, BufferGeometry> = {};
  private emitT = 0;
  private kind: Kind | null = null;
  private until = 0;
  private cloud: Group | null = null;

  constructor() {
    this.geos.heart = new ShapeGeometry(heart(0.05), 10);
    this.geos.star = new ShapeGeometry(starShape(0.045));
    this.geos.drop = new SphereGeometry(0.022, 8, 6);
    this.geos.z = new ShapeGeometry(zShape(0.04));
    this.geos.note = new ShapeGeometry(noteShapes(0.05));
    this.geos.cross = new ShapeGeometry(crossShape(0.05));
    this.geos.puff = new CircleGeometry(0.12, 16);
  }

  emit(kind: Kind, duration: number): void {
    this.kind = kind;
    this.until = duration;
    this.emitT = 0;
    if (kind === 'rain' && !this.cloud) {
      const c = new Group();
      const mat = new MeshBasicMaterial({ color: '#5b5b70', transparent: true, opacity: 0.9, side: DoubleSide });
      for (let i = 0; i < 5; i++) {
        const p = new Mesh(this.geos.puff, mat);
        p.position.set((i - 2) * 0.09, Math.sin(i) * 0.03, 0);
        p.scale.setScalar(0.8 + (i % 2) * 0.3);
        c.add(p);
      }
      this.cloud = c;
      this.group.add(c);
    }
  }

  private spawn(kind: Kind, head: Vector3, camera: Object3D): void {
    let geo = this.geos.star, color = '#ffcd20', v = new Vector3(), pos = head.clone(), life = 1.4, spin = 0;
    const r = (a: number) => (Math.random() - 0.5) * a;
    switch (kind) {
      case 'hearts': geo = this.geos.heart; color = Math.random() > 0.5 ? '#ff4f8b' : '#ff8ab5'; pos.add(new Vector3(r(0.5), 0.1 + r(0.2), 0.15)); v.set(r(0.15), 0.35, 0); life = 1.6; break;
      case 'sparkles': geo = this.geos.star; color = Math.random() > 0.3 ? '#ffe680' : '#ffffff'; pos.add(new Vector3(r(0.8), r(0.6), 0.2)); v.set(0, 0.05, 0); life = 0.9; spin = r(6); break;
      case 'tears': geo = this.geos.drop; color = '#8ccfff'; pos.add(new Vector3((Math.random() > 0.5 ? 1 : -1) * 0.12, -0.02, 0.3)); v.set(r(0.4), 0.3, 0.15); life = 1.0; break;
      case 'anger': geo = this.geos.cross; color = '#ff2a3d'; pos.add(new Vector3(0.28, 0.32, 0.1)); v.set(0, 0.05, 0); life = 0.5; break;
      case 'zzz': geo = this.geos.z; color = '#b8c8ff'; pos.add(new Vector3(0.25, 0.3, 0)); v.set(0.08, 0.2, 0); life = 2; break;
      case 'stars': geo = this.geos.star; color = '#ffcd20'; pos.add(new Vector3(0, 0.35, 0)); life = 1.2; spin = 4; break;
      case 'notes': geo = this.geos.note; color = Math.random() > 0.5 ? '#ffcd20' : '#39d98a'; pos.add(new Vector3(r(0.6), 0.2, 0.1)); v.set(r(0.2), 0.3, 0); life = 1.3; spin = r(2); break;
      case 'rain': geo = this.geos.drop; color = '#8ccfff'; pos.add(new Vector3(r(0.4), 0.48, 0)); v.set(0, -1.2, 0); life = 0.45; break;
    }
    const m = new Mesh(geo, new MeshBasicMaterial({ color, transparent: true, side: DoubleSide, depthWrite: false }));
    m.position.copy(pos);
    m.quaternion.copy(camera.quaternion);
    m.renderOrder = 5;
    this.group.add(m);
    this.items.push({ m, v, life, max: life, spin, orbit: kind === 'stars' ? Math.random() * Math.PI * 2 : undefined });
  }

  update(dt: number, anchor: Object3D, camera: Object3D): void {
    const head = anchor.getWorldPosition(new Vector3());
    if (this.kind) {
      this.until -= dt;
      this.emitT -= dt;
      const rate = this.kind === 'rain' ? 0.04 : this.kind === 'sparkles' ? 0.06 : this.kind === 'anger' ? 0.35 : this.kind === 'stars' ? 0.25 : 0.18;
      while (this.emitT <= 0) {
        this.spawn(this.kind, head, camera);
        this.emitT += rate;
      }
      if (this.until <= 0) this.kind = null;
    }
    if (this.cloud) {
      this.cloud.position.copy(head).add(new Vector3(0, 0.5, 0));
      this.cloud.quaternion.copy(camera.quaternion);
      if (this.kind !== 'rain') {
        this.cloud.scale.multiplyScalar(1 - dt * 4);
        if (this.cloud.scale.x < 0.05) {
          this.group.remove(this.cloud);
          this.cloud = null;
        }
      } else this.cloud.scale.setScalar(Math.min(1, this.cloud.scale.x + dt * 3));
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.m);
        (p.m.material as MeshBasicMaterial).dispose();
        this.items.splice(i, 1);
        continue;
      }
      const k = p.life / p.max;
      if (p.orbit !== undefined) {
        p.orbit += dt * 3.5;
        p.m.position.set(head.x + Math.cos(p.orbit) * 0.3, head.y + 0.32 + Math.sin(p.orbit * 2) * 0.02, head.z + Math.sin(p.orbit) * 0.3);
      } else {
        p.m.position.addScaledVector(p.v, dt);
        if (p.m.geometry === this.geos.drop) p.v.y -= dt * 2.5;
      }
      p.m.quaternion.copy(camera.quaternion);
      p.m.rotateZ(p.spin * (1 - k));
      const pop = Math.min(1, (1 - k) * 6);
      p.m.scale.setScalar(pop * (0.6 + 0.4 * k));
      (p.m.material as MeshBasicMaterial).opacity = Math.min(1, k * 2.5);
    }
  }

  clear(): void {
    for (const p of this.items) {
      this.group.remove(p.m);
      (p.m.material as MeshBasicMaterial).dispose();
    }
    this.items = [];
    this.kind = null;
  }
}
