import {
  BackSide, Color, DataTexture, DoubleSide, Material, Mesh, MeshStandardMaterial, MeshToonMaterial,
  NearestFilter, RedFormat, ShaderMaterial, type BufferGeometry, type Object3D,
} from 'three';

let gradient: DataTexture | null = null;
function toonGradient(): DataTexture {
  if (!gradient) {
    gradient = new DataTexture(new Uint8Array([90, 175, 255]), 3, 1, RedFormat);
    gradient.minFilter = NearestFilter;
    gradient.magFilter = NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

export function toon(color: string, opts: { emissive?: string; emissiveIntensity?: number; transparent?: boolean; opacity?: number; double?: boolean } = {}): MeshToonMaterial {
  const m = new MeshToonMaterial({ color: new Color(color), gradientMap: toonGradient() });
  if (opts.emissive) {
    m.emissive = new Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  if (opts.transparent) {
    m.transparent = true;
    m.opacity = opts.opacity ?? 0.8;
  }
  if (opts.double) m.side = DoubleSide;
  return m;
}

export function metal(color: string, rough = 0.35, metalness = 0.8): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: new Color(color), roughness: rough, metalness });
}

export function glow(color: string, intensity = 1.6): MeshToonMaterial {
  return toon(color, { emissive: color, emissiveIntensity: intensity });
}

const outlineMat = new ShaderMaterial({
  uniforms: { thickness: { value: 0.0065 }, color: { value: new Color('#16121c') } },
  vertexShader: /* glsl */ `
    uniform float thickness;
    void main() {
      vec3 p = position + normalize(normal) * thickness;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    void main() { gl_FragColor = vec4(color, 1.0); }`,
  side: BackSide,
});

/** Inverted-hull outline (anime ink line). */
export function withOutline<T extends Mesh>(mesh: T, enabled = true): T {
  const o = new Mesh(mesh.geometry, outlineMat);
  o.name = '__outline';
  o.visible = enabled;
  o.castShadow = false;
  o.raycast = () => {};
  mesh.add(o);
  return mesh;
}

export function setOutlines(root: Object3D, on: boolean): void {
  root.traverse((o) => {
    if (o.name === '__outline') o.visible = on;
  });
}

export function mesh(geo: BufferGeometry, mat: Material, outline = true, shadow = true): Mesh {
  const m = new Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = false;
  return outline ? withOutline(m) : m;
}

export function disposeTree(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.geometry && o.name !== '__outline') m.geometry.dispose();
    const mat = m.material as Material | Material[] | undefined;
    if (mat && mat !== outlineMat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
  });
}
