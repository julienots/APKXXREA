import {
  BoxGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, Group, Material, Mesh, MeshBasicMaterial,
  Object3D, PlaneGeometry, Quaternion, SphereGeometry, TorusGeometry, Vector3, DoubleSide, LatheGeometry, Vector2,
  ShapeGeometry, Shape,
} from 'three';
import type { AvatarConfig, ArmPose } from '../core/types';
import { item } from '../core/catalog';
import { FaceCanvas } from './FaceCanvas';
import { SpringChain } from './SpringBones';
import { toon, metal, glow, mesh, withOutline, setOutlines, disposeTree } from './materials';
import type { AvatarDriver, AvatarFrame } from './driver';

const R = 0.34; // head radius
const FACE = { phiStart: Math.PI / 2 - 0.85, phiLen: 1.7, thetaStart: 0.75, thetaLen: 1.45 };
const DOWN = new Vector3(0, -1, 0);

function styleOf(id: string, fallback: string): string {
  return item(id)?.style ?? fallback;
}

function onSphere(elev: number, yaw: number, r: number): Vector3 {
  return new Vector3(r * Math.cos(elev) * Math.sin(yaw), r * Math.sin(elev), r * Math.cos(elev) * Math.cos(yaw));
}

/** Position on the face patch from canvas coordinates (0..1). */
export function facePoint(u: number, v: number, r = R): Vector3 {
  const phi = FACE.phiStart + u * FACE.phiLen;
  const theta = FACE.thetaStart + v * FACE.thetaLen;
  return new Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

function cone(radius: number, len: number, seg = 7): ConeGeometry {
  const g = new ConeGeometry(radius, len, seg, 1);
  g.rotateX(Math.PI);
  g.translate(0, -len / 2, 0);
  return g;
}

function taper(r0: number, r1: number, len: number, seg = 10): CylinderGeometry {
  const g = new CylinderGeometry(r0, r1, len, seg, 1);
  g.translate(0, -len / 2, 0);
  return g;
}

function heartShape(s: number): Shape {
  const sh = new Shape();
  sh.moveTo(0, -0.8 * s);
  sh.bezierCurveTo(-1.3 * s, 0.1 * s, -0.6 * s, 1.1 * s, 0, 0.4 * s);
  sh.bezierCurveTo(0.6 * s, 1.1 * s, 1.3 * s, 0.1 * s, 0, -0.8 * s);
  return sh;
}

interface ArmRig {
  upper: Group;
  elbow: Group;
  hand: Group;
  side: 1 | -1;
}

/** Procedural chibi avatar: skeleton of groups, toon shading, ink outlines, spring physics. */
export class ToonAvatar implements AvatarDriver {
  readonly root = new Group();
  readonly headAnchor = new Object3D();
  private hips = new Group();
  private spine = new Group();
  private chest = new Group();
  private neck = new Group();
  private head = new Group();
  private skull = new Group();
  private armL!: ArmRig;
  private armR!: ArmRig;
  private springs: SpringChain[] = [];
  private face: FaceCanvas;
  private mats: Record<string, Material> = {};
  private animated: { obj: Object3D; fn: (t: number) => void }[] = [];
  private headCollider = new Object3D();
  private chestCollider = new Object3D();
  private base: string;
  private floatBase = 0;

  constructor(public cfg: AvatarConfig, outline = true) {
    this.base = styleOf(cfg.base, 'human');
    const hairStyle = styleOf(cfg.hair, 'medium');
    const accessories = cfg.accessories.map((a) => styleOf(a, '')).filter(Boolean);

    // ------------------------------------------------------------ materials
    const skin = this.base === 'robot' ? metal(cfg.skin === '#fcd5b8' ? '#c9ced8' : cfg.skin, 0.3, 0.6)
      : this.base === 'ghost' ? toon(cfg.skin, { transparent: true, opacity: 0.82, emissive: '#7fb8ff', emissiveIntensity: 0.25 })
      : toon(cfg.skin);
    this.mats.skin = skin;
    this.mats.hair = toon(cfg.hairColor);
    this.mats.hair2 = toon(cfg.hairColor2);
    this.mats.cloth = toon(cfg.outfitColor);
    this.mats.cloth2 = toon(cfg.outfitColor2);
    this.mats.dark = toon('#24222c');
    this.mats.white = toon('#f4f4f6');
    this.mats.accent = glow(cfg.accentColor, 1.2);
    this.mats.gold = metal('#ffcd20', 0.25, 0.9);

    this.face = new FaceCanvas({
      eyes: styleOf(cfg.eyes, 'round'),
      eyeColor: cfg.eyeColor,
      brows: styleOf(cfg.brows, 'soft'),
      browColor: shadeHex(cfg.hairColor, -0.25),
      mouth: styleOf(cfg.mouth, 'classic'),
      skin: cfg.skin,
      base: this.base,
      accent: cfg.accentColor,
      maskMouth: accessories.includes('mask'),
    });

    // ------------------------------------------------------------ skeleton
    this.root.add(this.hips);
    this.hips.position.y = 0.46;
    this.hips.add(this.spine);
    this.spine.position.y = 0.03;
    this.spine.add(this.chest);
    this.chest.position.y = 0.27;
    this.chest.add(this.neck);
    this.neck.position.y = 0.08;
    this.neck.add(this.head);
    this.head.position.y = 0.05;
    this.head.add(this.skull);
    this.skull.position.y = R * 0.9;
    this.skull.scale.set(1, 0.96, 0.97);
    this.skull.add(this.headAnchor);
    this.skull.add(this.headCollider);
    this.chest.add(this.chestCollider);
    this.chestCollider.position.set(0, -0.05, 0);
    for (const g of [this.spine, this.chest, this.neck, this.head]) g.rotation.order = 'YXZ';

    this.buildBody();
    this.buildHead();
    this.buildHair(hairStyle);
    this.buildOutfit(styleOf(cfg.outfit, 'tee'));
    this.buildBaseExtras();
    for (const a of accessories) this.buildAccessory(a);

    const s = cfg.height || 1;
    this.root.scale.setScalar(s);
    if (this.base === 'ghost') this.floatBase = 0.06;
    this.root.traverse((o) => {
      if ((o as Mesh).isMesh && o.name !== '__outline') (o as Mesh).castShadow = true;
    });
    setOutlines(this.root, outline);
  }

  // ================================================================== body
  private buildBody(): void {
    const { skin, cloth, dark } = this.mats;
    const ghost = this.base === 'ghost';
    // pelvis + legs
    const pants = this.mats.pants = toon(shadeHex(this.cfg.outfitColor2, -0.35));
    const pelvis = mesh(new SphereGeometry(0.135, 20, 14), pants);
    pelvis.scale.set(1.05, 0.72, 0.82);
    pelvis.position.y = 0.03;
    pelvis.name = 'pelvis';
    this.hips.add(pelvis);
    if (ghost) {
      const tailGeo = new LatheGeometry([new Vector2(0.0, -0.42), new Vector2(0.05, -0.36), new Vector2(0.12, -0.22), new Vector2(0.16, -0.08), new Vector2(0.15, 0.05)], 20);
      const wisp = mesh(tailGeo, skin);
      wisp.name = 'ghostTail';
      this.hips.add(wisp);
      pelvis.visible = false;
    } else {
      for (const side of [1, -1]) {
        const leg = new Group();
        leg.position.set(side * 0.072, 0, 0);
        leg.name = side === 1 ? 'legL' : 'legR';
        const thigh = mesh(new CapsuleGeometry(0.058, 0.27, 6, 12), pants);
        thigh.position.y = -0.19;
        thigh.name = 'legMesh';
        leg.add(thigh);
        const shoe = mesh(new SphereGeometry(0.07, 16, 12), dark);
        shoe.scale.set(0.95, 0.62, 1.45);
        shoe.position.set(0, -0.405, 0.03);
        leg.add(shoe);
        this.hips.add(leg);
      }
    }
    // torso
    const torso = mesh(new CapsuleGeometry(0.14, 0.15, 8, 18), cloth);
    torso.position.y = 0.15;
    torso.scale.set(1.08, 1, 0.8);
    torso.name = 'torso';
    this.spine.add(torso);
    // neck
    const neckMesh = mesh(new CylinderGeometry(0.048, 0.055, 0.12, 14), skin);
    neckMesh.position.y = 0.01;
    this.neck.add(neckMesh);
    // arms
    this.armL = this.buildArm(1);
    this.armR = this.buildArm(-1);
  }

  private buildArm(side: 1 | -1): ArmRig {
    const shoulder = new Group();
    shoulder.position.set(side * 0.165, 0.035, 0);
    this.chest.add(shoulder);
    const upper = new Group();
    shoulder.add(upper);
    const sleeve = mesh(new CapsuleGeometry(0.046, 0.12, 6, 12), this.mats.cloth);
    sleeve.position.y = -0.09;
    sleeve.name = 'upperArm';
    upper.add(sleeve);
    const joint = mesh(new SphereGeometry(0.05, 14, 10), this.mats.cloth, false);
    upper.add(joint);
    const elbow = new Group();
    elbow.position.y = -0.19;
    upper.add(elbow);
    const fore = mesh(new CapsuleGeometry(0.04, 0.11, 6, 12), this.mats.skin);
    fore.position.y = -0.08;
    fore.name = 'foreArm';
    elbow.add(fore);
    const hand = new Group();
    hand.position.y = -0.175;
    elbow.add(hand);
    const palm = mesh(new SphereGeometry(0.048, 14, 10), this.mats.skin);
    palm.scale.set(0.85, 1.1, 0.7);
    palm.name = 'hand';
    hand.add(palm);
    const thumb = mesh(new CapsuleGeometry(0.014, 0.03, 4, 8), this.mats.skin, false);
    thumb.position.set(-side * 0.0, -0.005, 0.04);
    thumb.rotation.x = 0.8;
    hand.add(thumb);
    return { upper, elbow, hand, side };
  }

  private sleeveMaterial(longSleeves: boolean, mat?: Material): void {
    for (const arm of [this.armL, this.armR]) {
      arm.elbow.traverse((o) => {
        if (o.name === 'foreArm' && longSleeves) (o as Mesh).material = mat ?? this.mats.cloth;
      });
    }
  }

  // ================================================================== head & face
  private buildHead(): void {
    const headMesh = mesh(new SphereGeometry(R, 40, 32), this.mats.skin);
    headMesh.name = 'head';
    this.skull.add(headMesh);
    const faceGeo = new SphereGeometry(R * 1.004, 48, 40, FACE.phiStart, FACE.phiLen, FACE.thetaStart, FACE.thetaLen);
    const faceMat = new MeshBasicMaterial({ map: this.face.texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const faceMesh = new Mesh(faceGeo, faceMat);
    faceMesh.renderOrder = 2;
    faceMesh.name = 'face';
    this.skull.add(faceMesh);
    // ears
    if (this.base === 'human' || this.base === 'robot' || this.base === 'demon' || this.base === 'ghost') {
      for (const s of [1, -1]) {
        const ear = this.base === 'robot'
          ? mesh(new CylinderGeometry(0.07, 0.07, 0.05, 20), this.mats.accent)
          : mesh(new SphereGeometry(0.06, 14, 10), this.mats.skin);
        if (this.base === 'robot') ear.rotation.z = Math.PI / 2;
        else ear.scale.set(0.45, 0.85, 0.6);
        ear.position.set(s * R * 0.97, -0.03, -0.01);
        this.skull.add(ear);
      }
    } else if (this.base === 'elf') {
      for (const s of [1, -1]) {
        const ear = mesh(new ConeGeometry(0.05, 0.22, 10), this.mats.skin);
        ear.scale.set(1, 1, 0.45);
        ear.position.set(s * (R + 0.07), 0.03, -0.02);
        ear.rotation.z = -s * 1.15;
        this.skull.add(ear);
      }
    }
  }

  // ================================================================== hair
  private strand(elev: number, yaw: number, len: number, width: number, outward = 0.18, mat = this.mats.hair, flat = 0.5, parent: Object3D = this.skull): Group {
    const pivot = new Group();
    pivot.position.copy(onSphere(elev, yaw, R * 1.03));
    pivot.rotation.order = 'YXZ';
    pivot.rotation.y = yaw;
    pivot.rotation.x = -elev - outward;
    const m = mesh(cone(width, len), mat);
    m.scale.z = flat;
    pivot.add(m);
    parent.add(pivot);
    return pivot;
  }

  private chain(parent: Object3D, pos: Vector3, rest: Quaternion, segs: number, segLen: number, r0: number, r1: number, mat: Material, stiffness = 3, curl = 0, tipMat?: Material): Group[] {
    const joints: Group[] = [];
    let p: Object3D = parent;
    for (let i = 0; i < segs; i++) {
      const j = new Group();
      if (i === 0) {
        j.position.copy(pos);
        j.quaternion.copy(rest);
      } else {
        j.position.y = -segLen;
        j.rotation.x = curl;
      }
      const ra = r0 + (r1 - r0) * (i / segs);
      const rb = r0 + (r1 - r0) * ((i + 1) / segs);
      const m = mesh(taper(ra, Math.max(0.004, rb), segLen * 1.12, 10), tipMat && i === segs - 1 ? tipMat : mat);
      j.add(m);
      const knot = mesh(new SphereGeometry(ra, 10, 8), tipMat && i === segs - 1 ? tipMat : mat, false);
      j.add(knot);
      p.add(j);
      joints.push(j);
      p = j;
    }
    const sc = new SpringChain(joints, segLen, { stiffness, drag: 0.32, gravity: 1.3 });
    sc.addCollider(this.headCollider, R * 1.02);
    sc.addCollider(this.chestCollider, 0.17);
    this.springs.push(sc);
    return joints;
  }

  private cap(lenTheta = 1.45, tilt = 0.55, scale = 1.06, mat = this.mats.hair): Mesh {
    const cap = mesh(new SphereGeometry(R * scale, 36, 22, 0, Math.PI * 2, 0, lenTheta), mat);
    cap.rotation.x = -tilt;
    cap.name = 'hairCap';
    this.skull.add(cap);
    return cap;
  }

  private bangs(count = 7, spread = 1.1, len = 0.15, elev = 0.72, mat = this.mats.hair, alt?: Material): void {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1) - 0.5;
      const yaw = t * spread * 2;
      const l = len * (1 + Math.abs(t) * 0.9);
      this.strand(elev - Math.abs(t) * 0.12, yaw, l, 0.07, 0.12, alt && i % 2 ? alt : mat);
    }
  }

  private sideLocks(len = 0.32, width = 0.08): void {
    for (const s of [1, -1]) {
      this.strand(0.35, s * 1.3, len, width, 0.08);
      this.strand(0.3, s * 1.05, len * 0.85, width * 0.9, 0.1);
    }
  }

  private backHair(segs = 3, segLen = 0.12, count = 5, r0 = 0.07, mat = this.mats.hair, tip?: Material): void {
    for (let i = 0; i < count; i++) {
      const yaw = Math.PI + (i / (count - 1) - 0.5) * 2.1;
      const pos = onSphere(-0.05, yaw, R * 0.92);
      const q = new Quaternion().setFromAxisAngle(new Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), -0.25);
      this.chain(this.skull, pos, q, segs, segLen, r0, 0.025, mat, 2.6, 0.06, tip);
    }
  }

  private buildHair(style: string): void {
    const H = this.mats.hair, H2 = this.mats.hair2;
    switch (style) {
      case 'buzz':
        this.cap(1.3, 0.45, 1.015);
        break;
      case 'short':
        this.cap();
        this.bangs(7, 1.0, 0.13);
        for (const s of [1, -1]) this.strand(0.32, s * 1.35, 0.16, 0.07, 0.1);
        this.strand(0.2, Math.PI, 0.15, 0.12, 0.1);
        break;
      case 'medium':
        this.cap();
        this.bangs(8, 1.1, 0.15);
        this.sideLocks(0.3, 0.085);
        for (let i = 0; i < 5; i++) this.strand(0.25, Math.PI + (i - 2) * 0.45, 0.3, 0.11, 0.06);
        break;
      case 'long':
        this.cap();
        this.bangs(8, 1.1, 0.16);
        this.sideLocks(0.42, 0.085);
        this.backHair(4, 0.12, 6, 0.085);
        break;
      case 'ponytail': {
        this.cap(1.45, 0.55, 1.05);
        this.bangs(7, 1.05, 0.15);
        for (const s of [1, -1]) this.strand(0.3, s * 1.3, 0.24, 0.06, 0.08);
        const pos = onSphere(0.45, Math.PI, R * 1.02);
        const tie = mesh(new TorusGeometry(0.045, 0.016, 8, 18), this.mats.accent, false);
        tie.position.copy(pos);
        tie.rotation.x = 0.9;
        this.skull.add(tie);
        this.chain(this.skull, pos, new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.9), 5, 0.1, 0.065, 0.02, H, 2.8, 0.12);
        break;
      }
      case 'twintails':
        this.cap();
        this.bangs(7, 1.05, 0.15, 0.72, H, H2);
        for (const s of [1, -1] as const) {
          const pos = onSphere(0.5, s * 1.85, R * 1.03);
          const tie = mesh(new SphereGeometry(0.04, 12, 10), this.mats.accent, false);
          tie.position.copy(pos);
          this.skull.add(tie);
          this.chain(this.skull, pos, new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), s * 0.5), 5, 0.11, 0.07, 0.02, H, 2.6, 0.08, H2);
        }
        break;
      case 'bob': {
        this.cap();
        this.bangs(9, 1.15, 0.16);
        const skirt = mesh(new CylinderGeometry(R * 1.08, R * 1.13, 0.3, 30, 1, true, Math.PI * 0.32, Math.PI * 1.36), H);
        (skirt.material as Material).side = DoubleSide;
        skirt.position.y = -0.07;
        this.skull.add(skirt);
        break;
      }
      case 'bun': {
        this.cap(1.45, 0.55, 1.05);
        this.bangs(6, 0.95, 0.14);
        const bun = mesh(new SphereGeometry(0.12, 18, 14), H);
        bun.position.copy(onSphere(0.95, Math.PI, R * 1.05));
        this.skull.add(bun);
        const pin = mesh(new CylinderGeometry(0.008, 0.008, 0.34, 6), this.mats.accent, false);
        pin.position.copy(bun.position);
        pin.rotation.z = 1.1;
        this.skull.add(pin);
        break;
      }
      case 'spiky':
        this.cap(1.3, 0.5, 1.04);
        for (let i = 0; i < 16; i++) {
          const yaw = (i / 16) * Math.PI * 2;
          const p = this.strand(0.55 + (i % 2) * 0.25, yaw, 0.22 + (i % 3) * 0.04, 0.08, -1.9, i % 4 === 0 ? H2 : H, 0.7);
          p.rotation.x += Math.cos(yaw) > 0.3 ? 0.4 : 0;
        }
        this.bangs(5, 0.9, 0.14);
        break;
      case 'afro':
        this.cap(1.4, 0.5, 1.05);
        for (let i = 0; i < 26; i++) {
          const yaw = i * 2.39996;
          const elev = 0.15 + ((i * 0.618) % 1) * 1.25;
          if (Math.cos(yaw) > 0.55 && elev < 0.7) continue; // keep the face clear
          const b = mesh(new SphereGeometry(0.11 + (i % 3) * 0.015, 12, 10), H, false);
          b.position.copy(onSphere(elev, yaw, R * 1.12));
          this.skull.add(b);
        }
        break;
      case 'wolf':
        this.cap();
        this.bangs(9, 1.15, 0.17, 0.74);
        for (let i = 0; i < 10; i++) {
          const yaw = Math.PI * 0.45 + (i / 9) * Math.PI * 1.1;
          this.strand(0.1 + (i % 2) * 0.12, yaw, 0.2 + (i % 3) * 0.05, 0.08, 0.35 + (i % 2) * 0.15, i % 3 === 0 ? H2 : H);
        }
        break;
      case 'princess':
        this.cap();
        this.bangs(8, 1.1, 0.15);
        for (const s of [1, -1] as const) {
          const pos = onSphere(0.1, s * 1.5, R * 1.02);
          const joints = this.chain(this.skull, pos, new Quaternion(), 6, 0.065, 0.06, 0.03, H, 3.5, 0);
          joints.forEach((j, i) => {
            const curl = mesh(new TorusGeometry(0.045 - i * 0.004, 0.022, 8, 16), H, false);
            curl.rotation.y = Math.PI / 2;
            curl.position.y = -0.03;
            j.add(curl);
          });
        }
        this.backHair(4, 0.12, 5, 0.08);
        break;
      case 'frost':
        this.cap();
        this.bangs(9, 1.12, 0.18, 0.72, H, H2);
        this.sideLocks(0.36, 0.08);
        this.backHair(3, 0.13, 5, 0.08, H, H2);
        break;
      default:
        this.cap();
        this.bangs();
    }
  }

  // ================================================================== outfits
  private buildOutfit(style: string): void {
    const { cloth, cloth2, white, dark, gold } = this.mats;
    const torso = this.spine.getObjectByName('torso') as Mesh;
    const add = (m: Object3D, parent: Object3D = this.spine) => { parent.add(m); return m; };
    const front = (geo: import('three').BufferGeometry, mat: Material, y: number, z = 0.115, outline = false) => {
      const m = mesh(geo, mat, outline);
      m.position.set(0, y, z);
      return add(m);
    };
    switch (style) {
      case 'tee': {
        front(new CylinderGeometry(0.035, 0.035, 0.01, 20), cloth2, 0.2, 0.118).rotation.x = Math.PI / 2;
        break;
      }
      case 'hoodie': {
        this.sleeveMaterial(true);
        const hood = mesh(new SphereGeometry(0.16, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), cloth);
        hood.position.set(0, 0.34, -0.1);
        hood.rotation.x = -1.9;
        add(hood);
        const pocket = mesh(new BoxGeometry(0.17, 0.07, 0.03), toon(shadeHex(this.cfg.outfitColor, -0.15)));
        pocket.position.set(0, 0.06, 0.105);
        add(pocket);
        for (const s of [1, -1]) {
          const str = mesh(new CylinderGeometry(0.006, 0.006, 0.11, 6), cloth2, false);
          str.position.set(s * 0.035, 0.26, 0.118);
          add(str);
        }
        break;
      }
      case 'jacket': {
        this.sleeveMaterial(true);
        front(new BoxGeometry(0.07, 0.3, 0.02), white, 0.17, 0.108);
        for (const s of [1, -1]) {
          const trim = mesh(new BoxGeometry(0.012, 0.32, 0.02), glow(this.cfg.outfitColor2, 1.4), false);
          trim.position.set(s * 0.045, 0.17, 0.112);
          add(trim);
          const collar = mesh(new BoxGeometry(0.07, 0.09, 0.02), cloth);
          collar.position.set(s * 0.06, 0.33, 0.08);
          collar.rotation.set(-0.3, 0, s * 0.5);
          add(collar);
        }
        break;
      }
      case 'dress': case 'witch': case 'fairy': {
        const long = style === 'witch';
        if (style === 'witch') this.sleeveMaterial(true);
        const h = long ? 0.44 : 0.26;
        const skirt = mesh(new CylinderGeometry(0.15, long ? 0.34 : 0.3, h, 28, 1, true), style === 'fairy' ? cloth2 : cloth);
        (skirt.material as Material).side = DoubleSide;
        skirt.position.y = -h / 2 + 0.04;
        this.hips.add(skirt);
        const belt = mesh(new TorusGeometry(0.15, 0.018, 8, 26), style === 'witch' ? cloth2 : style === 'fairy' ? cloth : cloth2, false);
        belt.rotation.x = Math.PI / 2;
        belt.position.y = 0.05;
        this.hips.add(belt);
        if (style === 'fairy') {
          for (let i = 0; i < 8; i++) {
            const petal = mesh(new ConeGeometry(0.07, 0.2, 6), i % 2 ? cloth : cloth2);
            petal.scale.z = 0.35;
            const a = (i / 8) * Math.PI * 2;
            petal.position.set(Math.sin(a) * 0.2, -0.13, Math.cos(a) * 0.2);
            petal.rotation.set(Math.PI + 0.35 * Math.cos(a), a, -0.35 * Math.sin(a));
            this.hips.add(petal);
          }
        }
        if (!long) for (const leg of ['legL', 'legR']) {
          const l = this.hips.getObjectByName(leg)?.getObjectByName('legMesh') as Mesh | undefined;
          if (l) l.material = this.mats.skin;
        }
        break;
      }
      case 'suit': {
        this.sleeveMaterial(true);
        this.mats.pants = cloth;
        this.hips.traverse((o) => { if (o.name === 'legMesh' || o.name === 'pelvis') (o as Mesh).material = cloth; });
        const shirt = new Shape();
        shirt.moveTo(-0.06, 0.1); shirt.lineTo(0.06, 0.1); shirt.lineTo(0, -0.08); shirt.closePath();
        const sm = new Mesh(new ShapeGeometry(shirt), white);
        sm.position.set(0, 0.25, 0.121);
        add(sm);
        const tie = mesh(new BoxGeometry(0.03, 0.16, 0.012), cloth2, false);
        tie.position.set(0, 0.24, 0.128);
        add(tie);
        break;
      }
      case 'kimono': {
        this.sleeveMaterial(true);
        for (const s of [1, -1]) {
          const lap = mesh(new BoxGeometry(0.035, 0.3, 0.015), cloth2, false);
          lap.position.set(s * 0.03, 0.2, 0.116);
          lap.rotation.z = s * 0.45;
          add(lap);
        }
        const obi = mesh(new CylinderGeometry(0.16, 0.16, 0.08, 24), cloth2);
        obi.position.y = 0.04;
        obi.scale.z = 0.82;
        add(obi);
        const hakama = mesh(new CylinderGeometry(0.15, 0.24, 0.42, 24, 1, true), toon(shadeHex(this.cfg.outfitColor, -0.3)));
        (hakama.material as Material).side = DoubleSide;
        hakama.position.y = -0.2;
        this.hips.add(hakama);
        for (const arm of [this.armL, this.armR]) {
          const sl = mesh(new CylinderGeometry(0.05, 0.09, 0.14, 14, 1, true), cloth);
          (sl.material as Material).side = DoubleSide;
          sl.position.y = -0.04;
          arm.elbow.add(sl);
        }
        break;
      }
      case 'armor': {
        this.sleeveMaterial(true, dark);
        const plate = mesh(new BoxGeometry(0.24, 0.2, 0.06), metal(this.cfg.outfitColor, 0.3, 0.85));
        plate.position.set(0, 0.22, 0.09);
        add(plate);
        const core = mesh(new CylinderGeometry(0.028, 0.028, 0.02, 20), glow(this.cfg.outfitColor2, 2), false);
        core.rotation.x = Math.PI / 2;
        core.position.set(0, 0.22, 0.125);
        add(core);
        for (const arm of [this.armL, this.armR]) {
          const pad = mesh(new SphereGeometry(0.075, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), metal(this.cfg.outfitColor, 0.3, 0.85));
          pad.position.y = 0.01;
          arm.upper.add(pad);
          const ring = mesh(new TorusGeometry(0.045, 0.008, 6, 18), glow(this.cfg.outfitColor2, 2), false);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = -0.12;
          arm.elbow.add(ring);
        }
        break;
      }
      case 'neon': {
        this.sleeveMaterial(true);
        const g = glow(this.cfg.outfitColor2, 2.2);
        for (const y of [0.06, 0.24]) {
          const ring = mesh(new TorusGeometry(0.152, 0.008, 6, 30), g, false);
          ring.rotation.x = Math.PI / 2;
          ring.scale.y = 0.8;
          ring.position.y = y;
          add(ring);
        }
        for (const arm of [this.armL, this.armR]) {
          const ring = mesh(new TorusGeometry(0.047, 0.006, 6, 18), g, false);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = -0.1;
          arm.elbow.add(ring);
        }
        const hood = mesh(new SphereGeometry(0.16, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), cloth);
        hood.position.set(0, 0.34, -0.1);
        hood.rotation.x = -1.9;
        add(hood);
        break;
      }
      case 'parka': {
        this.sleeveMaterial(true);
        torso.scale.set(1.2, 1.05, 0.95);
        for (const y of [0.0, 0.12, 0.24]) {
          const puff = mesh(new TorusGeometry(0.165, 0.03, 8, 30), cloth);
          puff.rotation.x = Math.PI / 2;
          puff.scale.set(1.08, 0.8, 1);
          puff.position.y = y;
          add(puff);
        }
        const fur = mesh(new TorusGeometry(0.1, 0.04, 10, 24), white);
        fur.rotation.x = Math.PI / 2 - 0.2;
        fur.position.set(0, 0.36, -0.02);
        add(fur);
        const zip = mesh(new BoxGeometry(0.012, 0.3, 0.01), cloth2, false);
        zip.position.set(0, 0.16, 0.135);
        add(zip);
        break;
      }
      case 'royal': {
        this.sleeveMaterial(true);
        for (const s of [1, -1]) {
          const trim = mesh(new BoxGeometry(0.02, 0.32, 0.015), gold, false);
          trim.position.set(s * 0.04, 0.17, 0.115);
          add(trim);
        }
        const sash = mesh(new BoxGeometry(0.04, 0.42, 0.012), toon('#c0392b'), false);
        sash.position.set(0, 0.17, 0.122);
        sash.rotation.z = 0.6;
        add(sash);
        // cape: two spring chains of panels
        for (const s of [1, -1]) {
          const pos = new Vector3(s * 0.08, 0.34, -0.1);
          const joints = this.chain(this.chest.parent!, pos, new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.12), 4, 0.13, 0.004, 0.004, cloth, 4.5, 0.02);
          for (const j of joints) {
            const panel = new Mesh(new PlaneGeometry(0.16, 0.135), this.mats.cloth2);
            (panel.material as Material).side = DoubleSide;
            panel.position.set(0, -0.065, -0.005);
            panel.castShadow = true;
            j.add(panel);
          }
        }
        const collar = mesh(new TorusGeometry(0.1, 0.03, 8, 24), this.mats.white);
        collar.rotation.x = Math.PI / 2 - 0.25;
        collar.position.set(0, 0.36, -0.02);
        add(collar);
        break;
      }
    }
  }

  // ================================================================== base extras
  private buildBaseExtras(): void {
    const b = this.base;
    if (b === 'neko' || b === 'fox') {
      this.animalEars(b === 'fox');
      this.tail(b === 'fox');
    } else if (b === 'robot') {
      const stem = mesh(new CylinderGeometry(0.008, 0.008, 0.14, 8), this.mats.dark, false);
      stem.position.copy(onSphere(1.25, 0.4, R));
      stem.position.y += 0.07;
      this.skull.add(stem);
      const bulb = mesh(new SphereGeometry(0.028, 12, 10), this.mats.accent, false);
      bulb.position.copy(stem.position);
      bulb.position.y += 0.08;
      this.skull.add(bulb);
      this.animated.push({ obj: bulb, fn: (t) => { bulb.scale.setScalar(1 + 0.2 * Math.sin(t * 5)); } });
      for (const y of [-0.02, 0.03]) {
        const ring = mesh(new TorusGeometry(0.055, 0.008, 6, 18), this.mats.accent, false);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y;
        this.neck.add(ring);
      }
    } else if (b === 'demon') {
      this.horns('#2a1a26');
      this.tail(false, true);
    }
  }

  private animalEars(fox: boolean): void {
    for (const s of [1, -1]) {
      const pivot = new Group();
      pivot.position.copy(onSphere(1.0, s * 0.62, R * 0.98));
      pivot.rotation.set(-0.1, 0, -s * 0.38);
      const outer = mesh(new ConeGeometry(fox ? 0.1 : 0.085, fox ? 0.22 : 0.16, 4), this.mats.hair);
      outer.position.y = fox ? 0.1 : 0.07;
      outer.rotation.y = Math.PI / 4;
      outer.scale.z = 0.55;
      pivot.add(outer);
      const inner = new Mesh(new ConeGeometry(fox ? 0.06 : 0.05, fox ? 0.15 : 0.11, 4), toon('#ffb3c7'));
      inner.position.set(0, fox ? 0.08 : 0.06, 0.03);
      inner.rotation.y = Math.PI / 4;
      inner.scale.z = 0.3;
      pivot.add(inner);
      if (fox) {
        const tip = mesh(new ConeGeometry(0.035, 0.07, 4), this.mats.white, false);
        tip.position.y = 0.19;
        tip.rotation.y = Math.PI / 4;
        tip.scale.z = 0.55;
        pivot.add(tip);
      }
      this.skull.add(pivot);
      this.animated.push({ obj: pivot, fn: (t) => { pivot.rotation.x = -0.1 + Math.max(0, Math.sin(t * 0.7 + s) - 0.97) * 8; } });
    }
  }

  private tail(fox: boolean, spade = false): void {
    const mat = spade ? toon('#2a1a26') : this.mats.hair;
    const pos = new Vector3(0, 0.02, -0.11);
    const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -2.1);
    const joints = this.chain(this.hips, pos, q, fox ? 5 : 6, fox ? 0.08 : 0.07, fox ? 0.07 : 0.025, fox ? 0.03 : 0.018, mat, 1.8, -0.18, fox ? this.mats.white : undefined);
    const last = joints[joints.length - 1];
    if (spade) {
      const tip = mesh(new ConeGeometry(0.05, 0.08, 4), toon('#8f1d3a'));
      tip.position.y = -0.09;
      tip.rotation.x = Math.PI;
      tip.scale.z = 0.4;
      last.add(tip);
    }
  }

  private horns(color: string): void {
    for (const s of [1, -1]) {
      const pivot = new Group();
      pivot.position.copy(onSphere(1.0, s * 0.5, R * 1.02));
      pivot.rotation.set(-0.4, 0, -s * 0.35);
      const segs = [0.045, 0.035, 0.022];
      let p: Object3D = pivot;
      segs.forEach((r, i) => {
        const g = new Group();
        g.position.y = i === 0 ? 0 : 0.06;
        g.rotation.x = i === 0 ? 0 : -0.45;
        const m = mesh(new CylinderGeometry(i === segs.length - 1 ? 0.002 : segs[i + 1], r, 0.07, 10), toon(color));
        m.position.y = 0.035;
        g.add(m);
        p.add(g);
        p = g;
      });
      this.skull.add(pivot);
    }
  }

  // ================================================================== accessories
  private eyePos(side: 1 | -1, r = R): Vector3 {
    return facePoint(0.5 + side * 0.185, 0.53, r);
  }

  private buildAccessory(style: string): void {
    const sk = this.skull;
    const acc = this.mats.accent;
    switch (style) {
      case 'glasses': case 'sunglasses': {
        const frame = toon(style === 'sunglasses' ? '#15151c' : '#2a2a33');
        for (const s of [1, -1] as const) {
          const p = this.eyePos(s, R * 1.09);
          const ring = mesh(new TorusGeometry(0.068, 0.009, 8, 24), frame, false);
          ring.position.copy(p);
          ring.lookAt(p.clone().multiplyScalar(2));
          sk.add(ring);
          if (style === 'sunglasses') {
            const lens = new Mesh(new CylinderGeometry(0.066, 0.066, 0.004, 24), toon('#101018', { transparent: true, opacity: 0.88 }));
            lens.position.copy(p);
            lens.lookAt(p.clone().multiplyScalar(2));
            lens.rotateX(Math.PI / 2);
            sk.add(lens);
          }
          const arm = mesh(new CylinderGeometry(0.006, 0.006, 0.3, 6), frame, false);
          arm.position.set(s * R * 0.92, p.y, 0.1);
          arm.rotation.x = Math.PI / 2;
          sk.add(arm);
        }
        const bridge = mesh(new CylinderGeometry(0.006, 0.006, 0.07, 6), frame, false);
        bridge.position.copy(facePoint(0.5, 0.5, R * 1.1));
        bridge.rotation.z = Math.PI / 2;
        sk.add(bridge);
        break;
      }
      case 'headphones': {
        const band = mesh(new TorusGeometry(R * 1.12, 0.022, 8, 30, Math.PI), toon('#1b1b22'));
        band.rotation.y = 0;
        band.position.y = 0.0;
        sk.add(band);
        for (const s of [1, -1]) {
          const cup = mesh(new CylinderGeometry(0.09, 0.09, 0.07, 22), toon('#1b1b22'));
          cup.rotation.z = Math.PI / 2;
          cup.position.set(s * R * 1.1, -0.02, 0);
          sk.add(cup);
          const led = mesh(new TorusGeometry(0.065, 0.01, 6, 22), acc, false);
          led.rotation.y = Math.PI / 2;
          led.position.set(s * (R * 1.1 + 0.037), -0.02, 0);
          sk.add(led);
        }
        break;
      }
      case 'cap': {
        const dome = mesh(new SphereGeometry(R * 1.1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), this.mats.cloth2);
        dome.rotation.x = -0.25;
        sk.add(dome);
        const brim = mesh(new CylinderGeometry(0.2, 0.2, 0.015, 24, 1, false, -Math.PI / 2, Math.PI), this.mats.cloth2);
        brim.position.set(0, R * 0.62, R * 0.72);
        brim.rotation.x = 0.25;
        brim.scale.set(1, 1, 1.1);
        sk.add(brim);
        break;
      }
      case 'beanie': {
        const dome = mesh(new SphereGeometry(R * 1.1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.45), toon('#3a6df0'));
        dome.rotation.x = -0.3;
        sk.add(dome);
        const fold = mesh(new TorusGeometry(R * 1.02, 0.04, 8, 30), toon('#2a52c0'));
        fold.rotation.x = Math.PI / 2 - 0.3;
        fold.position.set(0, R * 0.42, -0.03);
        sk.add(fold);
        const pom = mesh(new SphereGeometry(0.07, 12, 10), this.mats.white);
        pom.position.set(0, R * 1.12, -0.12);
        sk.add(pom);
        break;
      }
      case 'catears': case 'bunny': {
        if (style === 'catears') { this.animalEars(false); break; }
        for (const s of [1, -1]) {
          const pos = onSphere(1.15, s * 0.35, R * 1.02);
          const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI - s * 0.2);
          const joints = this.chain(sk, pos, q, 3, 0.08, 0.04, 0.035, this.mats.white, 6, 0.08);
          for (const j of joints) {
            const inner = new Mesh(new CapsuleGeometry(0.018, 0.05, 4, 8), toon('#ffb3c7'));
            inner.position.set(0, -0.04, 0.025);
            j.add(inner);
          }
          // springs hang down; invert gravity effect for upright ears via high stiffness
        }
        break;
      }
      case 'horns':
        this.horns('#3a2a2a');
        break;
      case 'witchhat': {
        const brim = mesh(new CylinderGeometry(0.42, 0.42, 0.02, 32), toon('#2c1440'));
        brim.position.y = R * 0.78;
        brim.rotation.x = -0.15;
        sk.add(brim);
        const top = mesh(new ConeGeometry(0.24, 0.48, 24), toon('#2c1440'));
        top.position.set(0, R * 0.78 + 0.24, -0.04);
        top.rotation.set(-0.35, 0, 0.18);
        sk.add(top);
        const band = mesh(new TorusGeometry(0.235, 0.022, 8, 28), toon('#ff7a1a'), false);
        band.rotation.x = Math.PI / 2 - 0.15;
        band.position.y = R * 0.8;
        sk.add(band);
        break;
      }
      case 'halo': {
        const halo = new Mesh(new TorusGeometry(0.2, 0.018, 10, 40), glow('#ffe680', 2));
        halo.rotation.x = Math.PI / 2 - 0.2;
        halo.position.y = R * 1.35;
        sk.add(halo);
        this.animated.push({ obj: halo, fn: (t) => { halo.position.y = R * 1.35 + Math.sin(t * 2) * 0.015; } });
        break;
      }
      case 'wings': {
        for (const s of [1, -1]) {
          const pivot = new Group();
          pivot.position.set(s * 0.06, 0.25, -0.12);
          const sh = new Shape();
          sh.moveTo(0, 0);
          sh.bezierCurveTo(0.15, 0.3, 0.45, 0.35, 0.42, 0.1);
          sh.bezierCurveTo(0.4, -0.05, 0.25, -0.1, 0.3, -0.25);
          sh.bezierCurveTo(0.15, -0.2, 0.05, -0.1, 0, 0);
          const wing = new Mesh(new ShapeGeometry(sh, 16), toon('#bff6ff', { transparent: true, opacity: 0.6, emissive: '#9ff', emissiveIntensity: 0.4, double: true }));
          wing.scale.x = s;
          wing.rotation.y = -s * 0.5;
          pivot.add(wing);
          this.spine.add(pivot);
          this.animated.push({ obj: pivot, fn: (t) => { pivot.rotation.y = s * (0.25 + 0.25 * Math.sin(t * 6)); } });
        }
        break;
      }
      case 'crown': {
        const ring = mesh(new CylinderGeometry(0.17, 0.16, 0.08, 24, 1, true), this.mats.gold);
        (ring.material as Material).side = DoubleSide;
        ring.position.y = R * 1.0;
        ring.rotation.x = -0.15;
        sk.add(ring);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const sp = mesh(new ConeGeometry(0.028, 0.08, 6), this.mats.gold, false);
          sp.position.set(Math.sin(a) * 0.165, R * 1.0 + 0.075 + Math.cos(a) * -0.02, Math.cos(a) * 0.165);
          sk.add(sp);
          const gem = mesh(new SphereGeometry(0.014, 8, 6), glow(i % 2 ? '#ff2f6d' : '#3fa9ff', 1.5), false);
          gem.position.set(Math.sin(a) * 0.172, R * 1.0, Math.cos(a) * 0.172);
          sk.add(gem);
        }
        break;
      }
      case 'mask': {
        const m = mesh(new SphereGeometry(R * 1.03, 30, 14, Math.PI / 2 - 0.9, 1.8, 1.72, 0.62), toon('#1b1b25'));
        sk.add(m);
        const stripe = mesh(new BoxGeometry(0.2, 0.012, 0.01), glow('#ff3b3b', 2), false);
        stripe.position.copy(facePoint(0.5, 0.86, R * 1.05));
        sk.add(stripe);
        break;
      }
      case 'scarf': {
        const sc = mesh(new TorusGeometry(0.085, 0.04, 10, 24), toon('#d63a3a'));
        sc.rotation.x = Math.PI / 2;
        sc.position.y = 0.0;
        this.neck.add(sc);
        const pos = new Vector3(0.05, -0.02, 0.08);
        this.chain(this.neck, pos, new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.15), 3, 0.08, 0.035, 0.03, toon('#d63a3a'), 2.5, 0);
        break;
      }
      case 'bow': {
        const g = new Group();
        g.position.copy(onSphere(0.95, -0.75, R * 1.08));
        for (const s of [1, -1]) {
          const loop = mesh(new ConeGeometry(0.06, 0.11, 4), toon('#ff4f8b'));
          loop.rotation.z = s * Math.PI / 2;
          loop.position.x = s * 0.055;
          loop.scale.z = 0.5;
          g.add(loop);
        }
        g.add(mesh(new SphereGeometry(0.025, 10, 8), toon('#d6205f'), false));
        g.lookAt(g.position.clone().multiplyScalar(2));
        sk.add(g);
        break;
      }
      case 'flower': {
        const g = new Group();
        g.position.copy(onSphere(0.55, 1.05, R * 1.08));
        for (let i = 0; i < 5; i++) {
          const p = mesh(new SphereGeometry(0.03, 10, 8), toon('#ffd0e8'), false);
          const a = (i / 5) * Math.PI * 2;
          p.position.set(Math.cos(a) * 0.032, Math.sin(a) * 0.032, 0);
          p.scale.z = 0.4;
          g.add(p);
        }
        g.add(mesh(new SphereGeometry(0.02, 10, 8), toon('#ffcd20'), false));
        g.lookAt(g.position.clone().multiplyScalar(2));
        sk.add(g);
        break;
      }
      case 'tail':
        this.tail(false);
        break;
      case 'antenna': {
        for (const s of [1, -1]) {
          const pos = onSphere(1.2, s * 0.3, R);
          const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI - s * 0.3);
          const joints = this.chain(sk, pos, q, 3, 0.06, 0.008, 0.008, this.mats.dark, 7, 0);
          const ball = mesh(new SphereGeometry(0.025, 10, 8), acc, false);
          ball.position.y = -0.065;
          joints[joints.length - 1].add(ball);
        }
        break;
      }
      case 'earrings': {
        for (const s of [1, -1]) {
          const ring = mesh(new TorusGeometry(0.025, 0.006, 6, 16), this.mats.gold, false);
          ring.position.set(s * R * 0.98, -0.11, 0);
          ring.rotation.y = Math.PI / 2;
          sk.add(ring);
        }
        break;
      }
    }
  }

  // ================================================================== runtime
  private applyArm(rig: ArmRig, pose: ArmPose): void {
    const d = new Vector3(pose.dir[0], pose.dir[1], pose.dir[2]).normalize();
    // keep arms out of the torso
    if (d.y < -0.2 && d.z < 0.35) {
      const minX = 0.2;
      if (rig.side === 1 && d.x < minX) d.x = minX;
      if (rig.side === -1 && d.x > -minX) d.x = -minX;
      d.normalize();
    }
    rig.upper.quaternion.setFromUnitVectors(DOWN, d);
    rig.elbow.rotation.x = -pose.bend;
  }

  update(f: AvatarFrame): void {
    const { face, pose, time } = f;
    // hips / body
    this.hips.position.x = pose.hipsX + face.tx * 0.06;
    this.hips.position.y = 0.46 + pose.hipsY + (this.floatBase ? this.floatBase + Math.sin(time * 1.8) * 0.02 : 0);
    this.hips.rotation.y = pose.hipsRotY;
    this.spine.rotation.set(pose.spine[0] + face.pitch * 0.12, pose.spine[1] + face.yaw * 0.22, pose.spine[2] + face.roll * 0.15 - face.tx * 0.12);
    // head: neck takes ~35% of the rotation
    const hx = face.pitch + pose.head[0], hy = face.yaw + pose.head[1], hz = face.roll + pose.head[2];
    this.neck.rotation.set(hx * 0.35, hy * 0.3, hz * 0.3);
    this.head.rotation.set(hx * 0.65, hy * 0.5, hz * 0.6);
    this.applyArm(this.armL, pose.armL);
    this.applyArm(this.armR, pose.armR);
    // face
    this.face.draw(f.draw);
    for (const a of this.animated) a.fn(time);
    this.root.updateMatrixWorld(true);
    for (const s of this.springs) s.update(f.dt);
  }

  setOutline(on: boolean): void {
    setOutlines(this.root, on);
  }

  dispose(): void {
    disposeTree(this.root);
    this.face.texture.dispose();
  }
}

export function shadeHex(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt;
  } else {
    r *= 1 + amt; g *= 1 + amt; b *= 1 + amt;
  }
  return '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
}

export { heartShape, withOutline };
