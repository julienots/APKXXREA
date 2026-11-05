import {
  BoxGeometry, BufferGeometry, CanvasTexture, CircleGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute,
  Fog, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Points, PointsMaterial, SphereGeometry,
  SRGBColorSpace, Texture, TorusGeometry, AdditiveBlending, DoubleSide, Shape, ShapeGeometry, type Scene,
  RepeatWrapping, BackSide,
} from 'three';
import { toon, glow } from '../avatar/materials';

export interface Backdrop {
  group: Group;
  background: Color | Texture | null;
  fog: Fog | null;
  floor: boolean;
  /** Light tint hints */
  key: string;
  ambient: string;
  update(t: number, dt: number): void;
  dispose(): void;
}

function gradientTexture(stops: [number, string][], w = 4, h = 512, radial = false): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = radial ? 512 : w;
  c.height = h;
  const x = c.getContext('2d')!;
  const g = radial ? x.createRadialGradient(256, h * 0.42, 10, 256, h * 0.5, h * 0.75) : x.createLinearGradient(0, 0, 0, h);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function windowsTexture(lit: string[], cols = 6, rows = 14): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 160;
  const x = c.getContext('2d')!;
  x.fillStyle = '#0c0c16';
  x.fillRect(0, 0, 64, 160);
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    if (Math.random() < 0.55) continue;
    x.fillStyle = lit[(Math.random() * lit.length) | 0];
    x.fillRect(4 + k * 10, 4 + r * 11, 6, 7);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

function stars(count: number, radius: number, size: number, color = '#ffffff'): Points {
  const pos: number[] = [];
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
    const r = radius * (0.7 + Math.random() * 0.3);
    const s = Math.sqrt(1 - u * u);
    pos.push(Math.cos(a) * s * r, Math.abs(u) * r * 0.9 + 0.5, -Math.abs(Math.sin(a) * s * r) - 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return new Points(g, new PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false }));
}

function floorDisc(color: string, r = 6): Mesh {
  const m = new Mesh(new CircleGeometry(r, 48), new MeshStandardMaterial({ color, roughness: 0.9 }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

function tree(h: number, color: string): Group {
  const g = new Group();
  const trunk = new Mesh(new CylinderGeometry(0.06, 0.09, h * 0.35, 8), toon('#5b3a26'));
  trunk.position.y = h * 0.17;
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const c = new Mesh(new ConeGeometry(h * (0.32 - i * 0.07), h * 0.42, 9), toon(color));
    c.position.y = h * (0.42 + i * 0.2);
    c.castShadow = true;
    g.add(c);
  }
  return g;
}

function make(partial: Partial<Backdrop> & { group: Group }): Backdrop {
  return {
    background: null, fog: null, floor: true, key: '#ffffff', ambient: '#b8c0ff',
    update: () => {},
    dispose: () => {
      partial.group.traverse((o) => {
        const m = o as Mesh;
        m.geometry?.dispose();
        const mat = m.material as { dispose?: () => void; map?: Texture } | undefined;
        mat?.map?.dispose();
        mat?.dispose?.();
      });
      if (partial.background instanceof Texture) partial.background.dispose();
    },
    ...partial,
  };
}

export function buildBackdrop(style: string, opts: { color: string; image?: string }): Backdrop {
  const g = new Group();
  switch (style) {
    case 'studio': {
      const cyc = new Mesh(new CylinderGeometry(5, 5, 6, 48, 1, true, Math.PI * 0.6, Math.PI * 0.8), new MeshStandardMaterial({ color: '#2a2a33', side: BackSide, roughness: 1 }));
      cyc.position.set(0, 3, 1.5);
      g.add(cyc);
      g.add(floorDisc('#24242c'));
      const ringMat = glow('#ffcd20', 1.5);
      const ring = new Mesh(new TorusGeometry(1.1, 0.02, 8, 64), ringMat);
      ring.position.set(0, 1.05, -2.8);
      g.add(ring);
      return make({ group: g, background: gradientTexture([[0, '#1d1d24'], [1, '#0d0d10']]), key: '#fff4e0', ambient: '#9aa0c8', update: (t) => { ring.rotation.z = t * 0.1; } });
    }
    case 'gradient':
      return make({ group: g, background: gradientTexture([[0, '#ff9a5a'], [0.5, '#ff4f8b'], [1, '#6b2bd6']], 512, 512, true), floor: false, key: '#fff0f5', ambient: '#ffc0e0' });
    case 'chroma':
      return make({ group: g, background: new Color(opts.color), floor: false, key: '#ffffff', ambient: '#d0d4ff' });
    case 'transparent':
      return make({ group: g, background: null, floor: false });
    case 'room': {
      const wall = new Mesh(new PlaneGeometry(8, 5), toon('#3b3f6b'));
      wall.position.set(0, 2.2, -2.2);
      g.add(wall);
      g.add(floorDisc('#4a3b5c'));
      const win = new Mesh(new PlaneGeometry(1.3, 0.9), new MeshBasicMaterial({ map: gradientTexture([[0, '#1b2b6b'], [1, '#ff8a5a']]) }));
      win.position.set(-1.1, 1.65, -2.18);
      g.add(win);
      const frame = new Mesh(new BoxGeometry(1.4, 0.05, 0.05), toon('#e8e0f0'));
      frame.position.set(-1.1, 1.65, -2.16);
      g.add(frame);
      const shelf = new Mesh(new BoxGeometry(1, 0.04, 0.25), toon('#c8a27a'));
      shelf.position.set(1.15, 1.5, -2.05);
      g.add(shelf);
      const cols = ['#ff4f8b', '#3fa9ff', '#ffcd20', '#39d98a', '#b56bff'];
      for (let i = 0; i < 6; i++) {
        const b = new Mesh(new BoxGeometry(0.07, 0.2 + (i % 3) * 0.04, 0.16), toon(cols[i % cols.length]));
        b.position.set(0.8 + i * 0.1, 1.62 + (i % 3) * 0.02, -2.05);
        g.add(b);
      }
      const led = new Mesh(new BoxGeometry(6, 0.03, 0.03), glow('#b56bff', 3));
      led.position.set(0, 2.9, -2.15);
      g.add(led);
      const plant = new Mesh(new SphereGeometry(0.25, 12, 10), toon('#39a96b'));
      plant.position.set(1.6, 0.5, -1.6);
      g.add(plant);
      const pot = new Mesh(new CylinderGeometry(0.16, 0.12, 0.3, 14), toon('#e8e0f0'));
      pot.position.set(1.6, 0.15, -1.6);
      g.add(pot);
      return make({ group: g, background: new Color('#2b2e52'), key: '#ffe9d6', ambient: '#a990ff', update: (t) => { (led.material as unknown as MeshStandardMaterial).emissive.setHSL((t * 0.05) % 1, 0.8, 0.55); } });
    }
    case 'neon': {
      const tex = windowsTexture(['#ff2fa8', '#3fa9ff', '#ffcd20', '#39ff88']);
      for (let i = 0; i < 16; i++) {
        const w = 0.6 + Math.random() * 0.8, h = 2 + Math.random() * 4;
        const t = tex.clone();
        t.repeat.set(w, h / 3);
        t.needsUpdate = true;
        const b = new Mesh(new BoxGeometry(w, h, w), new MeshBasicMaterial({ map: t }));
        const side = i % 2 ? 1 : -1;
        b.position.set(side * (1.2 + Math.random() * 3), h / 2, -3 - Math.random() * 5);
        g.add(b);
      }
      const grid = new Mesh(new PlaneGeometry(20, 20, 20, 20), new MeshBasicMaterial({ color: '#ff2fa8', wireframe: true, transparent: true, opacity: 0.35 }));
      grid.rotation.x = -Math.PI / 2;
      g.add(grid);
      const floor = floorDisc('#0d0b1a', 10);
      floor.position.y = -0.01;
      g.add(floor);
      const sign = new Mesh(new TorusGeometry(0.5, 0.04, 8, 6), glow('#39ff88', 3));
      sign.position.set(1.6, 2.4, -2.5);
      g.add(sign);
      return make({ group: g, background: gradientTexture([[0, '#06041a'], [0.6, '#2b0b4a'], [1, '#ff2fa8']]), fog: new Fog('#1a0b2e', 4, 14), key: '#ff9ad5', ambient: '#5b6bff', update: (t) => { grid.position.z = (t * 0.6) % 1; sign.rotation.z = t * 0.5; } });
    }
    case 'cosmos': {
      const s = stars(900, 12, 0.05);
      g.add(s);
      const planet = new Mesh(new SphereGeometry(0.9, 32, 24), toon('#6b5bd6'));
      planet.position.set(-2.2, 2.6, -5);
      g.add(planet);
      const ring = new Mesh(new TorusGeometry(1.4, 0.06, 4, 64), new MeshBasicMaterial({ color: '#ffcd8a', transparent: true, opacity: 0.6 }));
      ring.position.copy(planet.position);
      ring.rotation.set(1.2, 0.3, 0);
      g.add(ring);
      const moon = new Mesh(new SphereGeometry(0.2, 16, 12), toon('#e0e0f0'));
      moon.position.set(2, 2.2, -4);
      g.add(moon);
      const rock = new Mesh(new CylinderGeometry(1.2, 1.5, 0.3, 9), toon('#3a3550'));
      rock.position.y = -0.15;
      rock.receiveShadow = true;
      g.add(rock);
      return make({ group: g, background: gradientTexture([[0, '#020210'], [0.7, '#1b0b3d'], [1, '#3b1a6b']]), floor: false, key: '#e0e4ff', ambient: '#6b5bd6', update: (t) => { s.rotation.y = t * 0.01; planet.rotation.y = t * 0.1; moon.position.x = 2 + Math.sin(t * 0.3) * 0.3; } });
    }
    case 'forest': {
      g.add(floorDisc('#2b5b3a', 10));
      for (let i = 0; i < 18; i++) {
        const tr = tree(1.6 + Math.random() * 1.8, i % 3 ? '#2f7a4f' : '#3f9a5f');
        const side = i % 2 ? 1 : -1;
        tr.position.set(side * (1.1 + Math.random() * 3.5), 0, -1.5 - Math.random() * 5);
        g.add(tr);
      }
      const flies = stars(120, 4, 0.06, '#d8ff8a');
      (flies.material as PointsMaterial).blending = AdditiveBlending;
      flies.position.set(0, -0.3, 1);
      g.add(flies);
      return make({ group: g, background: gradientTexture([[0, '#0b2b3a'], [1, '#3b7a5b']]), fog: new Fog('#1b4a4a', 3, 11), key: '#e8ffd8', ambient: '#6bd6a0', update: (t) => { flies.rotation.y = t * 0.05; (flies.material as PointsMaterial).opacity = 0.6 + 0.4 * Math.sin(t * 2); } });
    }
    case 'beach': {
      const sea = new Mesh(new PlaneGeometry(40, 20), new MeshStandardMaterial({ color: '#2b5b9a', roughness: 0.3, metalness: 0.2 }));
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(0, 0.02, -12);
      g.add(sea);
      g.add(floorDisc('#e8c89a', 4));
      const sun = new Mesh(new CircleGeometry(1.2, 40), new MeshBasicMaterial({ color: '#ffd27a' }));
      sun.position.set(0, 1.4, -20);
      g.add(sun);
      const trunk = new Mesh(new CylinderGeometry(0.06, 0.1, 2.6, 8), toon('#8a5a36'));
      trunk.position.set(1.6, 1.3, -1.8);
      trunk.rotation.z = 0.2;
      g.add(trunk);
      for (let i = 0; i < 6; i++) {
        const leaf = new Mesh(new ConeGeometry(0.12, 1, 4), toon('#2f8a4f'));
        leaf.position.set(1.35, 2.55, -1.8);
        leaf.rotation.set(0, (i / 6) * Math.PI * 2, 2);
        leaf.translateY(0.45);
        g.add(leaf);
      }
      return make({ group: g, background: gradientTexture([[0, '#2b1a5b'], [0.55, '#ff6a6a'], [1, '#ffcd8a']]), key: '#ffb37a', ambient: '#ff8ab0', update: (t) => { sun.position.y = 1.4 + Math.sin(t * 0.1) * 0.1; } });
    }
    case 'dojo': {
      g.add(floorDisc('#3a2a22', 8));
      for (let i = -3; i <= 3; i++) {
        const pillar = new Mesh(new BoxGeometry(0.18, 4, 0.18), toon('#24181a'));
        pillar.position.set(i * 1.2, 2, -2.6);
        g.add(pillar);
      }
      for (let i = -2; i <= 2; i++) {
        const panel = new Mesh(new PlaneGeometry(1.0, 2.2), new MeshBasicMaterial({ color: '#f0e6d0', transparent: true, opacity: 0.85 }));
        panel.position.set(i * 1.2 + 0.6, 1.4, -2.65);
        g.add(panel);
      }
      const beam = new Mesh(new BoxGeometry(9, 0.05, 0.05), glow('#ff3b3b', 3));
      beam.position.set(0, 2.7, -2.5);
      g.add(beam);
      const sunDisc = new Mesh(new CircleGeometry(0.5, 40), glow('#ff3b3b', 2));
      sunDisc.position.set(0, 1.9, -2.62);
      g.add(sunDisc);
      return make({ group: g, background: new Color('#120a10'), fog: new Fog('#120a10', 4, 12), key: '#ffd8d0', ambient: '#ff6a6a' });
    }
    case 'haunted': {
      g.add(floorDisc('#1b1426', 8));
      const moon = new Mesh(new CircleGeometry(0.8, 40), new MeshBasicMaterial({ color: '#ffe8a8' }));
      moon.position.set(1.8, 3, -6);
      g.add(moon);
      const house = new Mesh(new BoxGeometry(3, 2.4, 1), toon('#2a1a3a'));
      house.position.set(-1.5, 1.2, -5);
      g.add(house);
      const roof = new Mesh(new ConeGeometry(2.2, 1.4, 4), toon('#1a0f26'));
      roof.position.set(-1.5, 3.1, -5);
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      const win = new Mesh(new PlaneGeometry(0.4, 0.5), glow('#ff9a1a', 2));
      win.position.set(-1.0, 1.4, -4.49);
      g.add(win);
      const pumpkins: Mesh[] = [];
      for (let i = 0; i < 4; i++) {
        const p = new Mesh(new SphereGeometry(0.17, 14, 10), toon('#ff7a1a', { emissive: '#ff5a00', emissiveIntensity: 0.25 }));
        p.scale.y = 0.8;
        p.position.set((i % 2 ? 1 : -1) * (0.9 + i * 0.35), 0.13, -0.8 - i * 0.4);
        g.add(p);
        pumpkins.push(p);
      }
      const bats: Mesh[] = [];
      const batShape = new Shape();
      batShape.moveTo(0, 0); batShape.lineTo(0.12, 0.06); batShape.lineTo(0.22, 0.0); batShape.lineTo(0.12, 0.02); batShape.lineTo(0, -0.04);
      batShape.lineTo(-0.12, 0.02); batShape.lineTo(-0.22, 0); batShape.lineTo(-0.12, 0.06); batShape.closePath();
      for (let i = 0; i < 7; i++) {
        const b = new Mesh(new ShapeGeometry(batShape), new MeshBasicMaterial({ color: '#0a0610', side: DoubleSide }));
        g.add(b);
        bats.push(b);
      }
      return make({
        group: g, background: gradientTexture([[0, '#0b0618'], [0.7, '#3b1a5b'], [1, '#ff7a1a']]), fog: new Fog('#2a1440', 3, 12), key: '#d0b8ff', ambient: '#ff8a3a',
        update: (t) => {
          bats.forEach((b, i) => { const a = t * 0.5 + i; b.position.set(Math.sin(a) * (2 + i * 0.2), 2.4 + Math.sin(a * 2.3) * 0.4, -3 + Math.cos(a) * 1.2); b.scale.y = 0.6 + 0.4 * Math.abs(Math.sin(t * 12 + i)); });
          pumpkins.forEach((p, i) => { (p.material as MeshStandardMaterial).emissiveIntensity = 0.25 + 0.15 * Math.sin(t * 6 + i * 2); });
        },
      });
    }
    case 'snow': {
      g.add(floorDisc('#e8f4ff', 10));
      for (let i = 0; i < 14; i++) {
        const tr = tree(1.6 + Math.random() * 1.6, '#2f6a5f');
        const side = i % 2 ? 1 : -1;
        tr.position.set(side * (1.2 + Math.random() * 3.5), 0, -1.8 - Math.random() * 5);
        g.add(tr);
      }
      const mount = new Mesh(new ConeGeometry(4, 4, 6), toon('#cfe4ff'));
      mount.position.set(0, 1.5, -12);
      g.add(mount);
      const flakes = stars(500, 6, 0.04, '#ffffff');
      g.add(flakes);
      return make({ group: g, background: gradientTexture([[0, '#7aa8e8'], [1, '#e8f4ff']]), fog: new Fog('#cfe4ff', 4, 16), key: '#ffffff', ambient: '#a8c8ff', update: (t, dt) => { flakes.position.y -= dt * 0.25; if (flakes.position.y < -3) flakes.position.y = 0; flakes.rotation.y = t * 0.02; } });
    }
    case 'throne': {
      g.add(floorDisc('#5b1a2a', 8));
      const carpet = new Mesh(new PlaneGeometry(1.2, 8), toon('#c0392b'));
      carpet.rotation.x = -Math.PI / 2;
      carpet.position.set(0, 0.005, -2);
      g.add(carpet);
      const seat = new Mesh(new BoxGeometry(1.1, 2.2, 0.3), toon('#ffcd20', { emissive: '#ff9a00', emissiveIntensity: 0.15 }));
      seat.position.set(0, 1.1, -2.4);
      g.add(seat);
      for (let i = -2; i <= 2; i++) {
        if (i === 0) continue;
        const col = new Mesh(new CylinderGeometry(0.15, 0.15, 4, 16), toon('#e8dcc8'));
        col.position.set(i * 1.3, 2, -2.8);
        g.add(col);
      }
      const dust = stars(200, 4, 0.03, '#ffe08a');
      (dust.material as PointsMaterial).blending = AdditiveBlending;
      g.add(dust);
      return make({ group: g, background: gradientTexture([[0, '#2a0b1a'], [1, '#6b2b1a']]), fog: new Fog('#2a0b1a', 4, 12), key: '#ffe8c0', ambient: '#ff9a6a', update: (t) => { dust.rotation.y = t * 0.03; } });
    }
    case 'custom': {
      let bg: Texture | Color = new Color('#202028');
      if (opts.image) {
        const img = new Image();
        const tex = new Texture(img);
        tex.colorSpace = SRGBColorSpace;
        img.onload = () => { tex.needsUpdate = true; };
        img.src = opts.image;
        bg = tex;
      }
      return make({ group: g, background: bg, floor: false });
    }
    default:
      return buildBackdrop('studio', opts);
  }
}

export function applyBackdrop(scene: Scene, b: Backdrop): void {
  scene.background = b.background;
  scene.fog = b.fog;
  scene.add(b.group);
}
