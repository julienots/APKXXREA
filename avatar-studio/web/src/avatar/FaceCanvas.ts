import { CanvasTexture, SRGBColorSpace, LinearFilter } from 'three';
import type { EyeMode } from '../core/types';
import { clamp } from '../core/filters';

export interface FaceDraw {
  eyeL: number;
  eyeR: number;
  gazeX: number;
  gazeY: number;
  eyeMode: EyeMode;
  browL: number;
  browR: number;
  browAngry: number;
  browSad: number;
  mouthOpen: number;
  mouthWide: number;
  mouthRound: number;
  smile: number;
  smirk: number;
  blush: number;
  tears: number;
  anger: number;
  sweat: number;
  gloom: number;
  shy: number;
  time: number;
}

export interface FaceStyle {
  eyes: string;
  eyeColor: string;
  brows: string;
  browColor: string;
  mouth: string;
  skin: string;
  base: string;
  accent: string;
  maskMouth: boolean;
}

const S = 512;

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt;
  } else {
    r *= 1 + amt; g *= 1 + amt; b *= 1 + amt;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/**
 * Paints the anime face (eyes, brows, mouth, overlays) into a canvas that is mapped
 * onto a spherical patch in front of the head. Fully procedural, redrawn each frame.
 */
export class FaceCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: CanvasTexture;
  private ctx: CanvasRenderingContext2D;

  constructor(public style: FaceStyle) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = S;
    this.canvas.height = S;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.anisotropy = 4;
  }

  draw(p: FaceDraw): void {
    const c = this.ctx;
    c.clearRect(0, 0, S, S);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    this.drawBaseMarks(p);
    this.drawBlush(p);
    if (p.gloom > 0.01) this.drawGloom(p);
    for (const side of [-1, 1] as const) {
      this.drawEye(side, side === 1 ? p.eyeL : p.eyeR, p);
      this.drawBrow(side, side === 1 ? p.browL : p.browR, p);
    }
    if (!this.style.maskMouth) this.drawMouth(p);
    if (p.tears > 0.01) this.drawTears(p);
    if (p.anger > 0.01) this.drawAnger(p);
    if (p.sweat > 0.01) this.drawSweat(p);
    this.texture.needsUpdate = true;
  }

  // ----------------------------------------------------------------- eyes
  private eyeGeom(side: -1 | 1) {
    const st = this.style.eyes;
    const cx = S * (0.5 + side * 0.185);
    const cy = S * 0.53;
    let w = S * 0.15, h = S * 0.19;
    if (st === 'sharp' || st === 'cat') h = S * 0.145;
    if (st === 'sleepy') h = S * 0.16;
    if (st === 'cyber') { w = S * 0.145; h = S * 0.165; }
    return { cx, cy, w, h };
  }

  private drawEye(side: -1 | 1, open: number, p: FaceDraw): void {
    const c = this.ctx;
    const { cx, cy, w, h } = this.eyeGeom(side);
    const st = this.style.eyes;
    const lash = '#1a1420';
    let mode = p.eyeMode;
    if (st === 'sleepy' && mode === 'normal') open = Math.min(open, 0.62);
    if (mode === 'sleepy') open = Math.min(open, 0.28);

    if (mode === 'happy') {
      c.strokeStyle = lash;
      c.lineWidth = S * 0.022;
      c.beginPath();
      c.moveTo(cx - w * 0.55, cy + h * 0.12);
      c.quadraticCurveTo(cx, cy - h * 0.55, cx + w * 0.55, cy + h * 0.12);
      c.stroke();
      return;
    }
    if (mode === 'swirl') {
      c.strokeStyle = lash;
      c.lineWidth = S * 0.012;
      c.beginPath();
      const turns = 3.2, R = w * 0.5;
      for (let i = 0; i <= 80; i++) {
        const t = i / 80;
        const a = t * turns * Math.PI * 2 + p.time * 6 * side;
        const r = R * t;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 1.1;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
      return;
    }

    if (open < 0.14) {
      c.strokeStyle = lash;
      c.lineWidth = S * 0.018;
      c.beginPath();
      c.moveTo(cx - w * 0.55, cy + h * 0.05);
      c.quadraticCurveTo(cx, cy + h * 0.32, cx + w * 0.55, cy + h * 0.05);
      c.stroke();
      // tiny lash flick on the outer corner
      c.beginPath();
      c.moveTo(cx + side * w * 0.55, cy + h * 0.05);
      c.lineTo(cx + side * w * 0.68, cy - h * 0.06);
      c.stroke();
      return;
    }

    const top = cy - h / 2;
    const bottom = cy + h / 2;
    const lidY = top + (1 - open) * h * 0.82;
    const angry = mode === 'angry' ? 1 : 0;
    const tiltIn = (st === 'sharp' || st === 'cat' ? 0.18 : 0) + angry * 0.22; // inner corner lower
    const innerX = cx - side * w * 0.55, outerX = cx + side * w * 0.55;

    c.save();
    // Clip: eye ellipse below the eyelid curve
    c.beginPath();
    c.ellipse(cx, cy, w * 0.52, h * 0.5, 0, 0, Math.PI * 2);
    c.clip();
    c.beginPath();
    c.moveTo(innerX - side * w, lidY + h * tiltIn);
    c.quadraticCurveTo(cx, lidY - h * 0.18, outerX + side * w, lidY - h * tiltIn * 0.3);
    c.lineTo(outerX + side * w, bottom + h);
    c.lineTo(innerX - side * w, bottom + h);
    c.closePath();
    c.clip();

    // Sclera
    c.fillStyle = '#ffffff';
    c.fillRect(cx - w, top - h * 0.2, w * 2, h * 1.4);
    c.fillStyle = 'rgba(120,110,160,0.18)';
    c.fillRect(cx - w, lidY - 4, w * 2, h * 0.16);

    // Iris
    const wide = mode === 'wide';
    const ix = cx + clamp(p.gazeX, -1, 1) * w * 0.22;
    const iy = cy + h * 0.06 - clamp(p.gazeY, -1, 1) * h * 0.14;
    const irx = w * (wide ? 0.32 : 0.4), iry = h * (wide ? 0.34 : 0.42);
    if (mode === 'star' || mode === 'heart') {
      c.fillStyle = mode === 'star' ? '#ffcd20' : '#ff4f8b';
      c.strokeStyle = mode === 'star' ? '#c78a00' : '#b5154c';
      c.lineWidth = 4;
      this.shapePath(mode, ix, iy, irx * 1.15);
      c.fill();
      c.stroke();
    } else {
      const col = this.style.eyeColor;
      const g = c.createLinearGradient(ix, iy - iry, ix, iy + iry);
      if (st === 'galaxy') {
        g.addColorStop(0, '#1a0b3d');
        g.addColorStop(0.5, '#6b2bd6');
        g.addColorStop(1, '#ff6ad5');
      } else {
        g.addColorStop(0, shade(col, -0.55));
        g.addColorStop(0.55, col);
        g.addColorStop(1, shade(col, 0.45));
      }
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(ix, iy, irx, iry, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = shade(col, -0.65);
      c.lineWidth = 3;
      c.stroke();
      // Pupil
      c.fillStyle = '#120c18';
      c.beginPath();
      if (st === 'cat') c.ellipse(ix, iy, irx * 0.18, iry * 0.72, 0, 0, Math.PI * 2);
      else c.ellipse(ix, iy - iry * 0.05, irx * (wide ? 0.28 : 0.45), iry * (wide ? 0.28 : 0.48), 0, 0, Math.PI * 2);
      c.fill();
      if (st === 'cyber') {
        c.strokeStyle = this.style.accent;
        c.lineWidth = 3;
        c.beginPath();
        c.ellipse(ix, iy, irx * 0.72, iry * 0.72, 0, 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 0.35;
        for (let y = iy - iry; y < iy + iry; y += 6) c.fillRect(ix - irx, y + ((p.time * 40) % 6), irx * 2, 1.5);
        c.globalAlpha = 1;
      }
      if (st === 'galaxy') {
        c.fillStyle = '#ffffff';
        for (let i = 0; i < 9; i++) {
          const a = i * 2.39996 + p.time * 0.3;
          const r = (i / 9) * irx * 0.9;
          c.globalAlpha = 0.5 + 0.5 * Math.sin(p.time * 3 + i);
          c.fillRect(ix + Math.cos(a) * r, iy + Math.sin(a) * r * 1.1, 3, 3);
        }
        c.globalAlpha = 1;
      }
      // Highlights
      c.fillStyle = 'rgba(255,255,255,0.95)';
      c.beginPath();
      c.ellipse(ix - irx * 0.35 * side, iy - iry * 0.42, irx * 0.32, iry * 0.24, -0.4, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(ix + irx * 0.32 * side, iy + iry * 0.42, irx * 0.14, iry * 0.1, 0, 0, Math.PI * 2);
      c.fill();
      if (st === 'sparkle' || mode === 'teary') {
        c.beginPath();
        c.ellipse(ix + irx * 0.15, iy - iry * 0.05, irx * 0.12, iry * 0.12, 0, 0, Math.PI * 2);
        c.fill();
        this.sparkle(ix - irx * 0.1 * side, iy + iry * 0.15, irx * 0.22, 0.9);
      }
    }
    if (mode === 'teary') {
      c.fillStyle = 'rgba(150,210,255,0.55)';
      c.fillRect(cx - w, cy + h * 0.22, w * 2, h * 0.4);
    }
    c.restore();

    // Upper lash line following the lid
    c.strokeStyle = lash;
    c.lineWidth = S * (st === 'sharp' ? 0.024 : 0.021);
    c.beginPath();
    const ly = Math.max(lidY, top + 2);
    c.moveTo(innerX, ly + h * tiltIn + h * 0.08);
    c.quadraticCurveTo(cx, ly - h * 0.16, outerX, ly - h * tiltIn * 0.3 + h * 0.06);
    c.lineTo(outerX + side * w * 0.14, ly - h * 0.06 - h * tiltIn * 0.3);
    c.stroke();
    // Lower lash
    c.lineWidth = S * 0.007;
    c.beginPath();
    c.moveTo(cx - w * 0.3, bottom - h * 0.02);
    c.quadraticCurveTo(cx, bottom + h * 0.04, cx + side * w * 0.42, bottom - h * 0.1);
    c.stroke();
  }

  private shapePath(kind: 'star' | 'heart', x: number, y: number, r: number): void {
    const c = this.ctx;
    c.beginPath();
    if (kind === 'star') {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r : r * 0.45;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
    } else {
      c.moveTo(x, y + r * 0.8);
      c.bezierCurveTo(x - r * 1.3, y - r * 0.1, x - r * 0.6, y - r * 1.1, x, y - r * 0.4);
      c.bezierCurveTo(x + r * 0.6, y - r * 1.1, x + r * 1.3, y - r * 0.1, x, y + r * 0.8);
      c.closePath();
    }
  }

  private sparkle(x: number, y: number, r: number, a: number): void {
    const c = this.ctx;
    c.save();
    c.globalAlpha = a;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(x, y - r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.quadraticCurveTo(x, y, x, y + r);
    c.quadraticCurveTo(x, y, x - r, y);
    c.quadraticCurveTo(x, y, x, y - r);
    c.fill();
    c.restore();
  }

  // ----------------------------------------------------------------- brows
  private drawBrow(side: -1 | 1, raise: number, p: FaceDraw): void {
    const c = this.ctx;
    const st = this.style.brows;
    const by = S * 0.36 - clamp(raise, -1, 1.5) * S * 0.045;
    const inX = S * (0.5 + side * 0.075), outX = S * (0.5 + side * 0.28);
    const inY = by + p.browAngry * S * 0.05 - p.browSad * S * 0.04;
    const outY = by - p.browAngry * S * 0.012 + p.browSad * S * 0.025;
    c.strokeStyle = this.style.browColor;
    c.fillStyle = this.style.browColor;
    if (st === 'dots') {
      c.beginPath();
      c.ellipse(inX + side * S * 0.04, inY - S * 0.01, S * 0.03, S * 0.018, -side * 0.2, 0, Math.PI * 2);
      c.fill();
      return;
    }
    c.lineWidth = st === 'thick' ? S * 0.03 : st === 'thin' ? S * 0.009 : S * 0.017;
    c.beginPath();
    c.moveTo(inX, inY);
    c.quadraticCurveTo((inX + outX) / 2, Math.min(inY, outY) - S * 0.025, outX, outY);
    c.stroke();
  }

  // ----------------------------------------------------------------- mouth
  private drawMouth(p: FaceDraw): void {
    const c = this.ctx;
    const st = this.style.mouth;
    const cx = S * 0.5 + p.smirk * S * 0.02, cy = S * 0.805;
    const open = clamp(p.mouthOpen, 0, 1.2);
    const width = S * 0.1 * (1 + clamp(p.mouthWide, -0.5, 1) * 0.55 - p.mouthRound * 0.45 + p.smile * 0.15);
    const corner = p.smile * S * 0.03;
    const smirkL = p.smirk * S * 0.025;
    const lineCol = '#3a1820';

    if (open < 0.06) {
      c.strokeStyle = lineCol;
      c.lineWidth = S * 0.011;
      c.beginPath();
      if (st === 'cat') {
        const w = width * 0.55;
        c.moveTo(cx - w * 1.4, cy - corner - S * 0.01);
        c.quadraticCurveTo(cx - w * 0.7, cy + S * 0.03, cx, cy - S * 0.005);
        c.quadraticCurveTo(cx + w * 0.7, cy + S * 0.03, cx + w * 1.4, cy - corner - S * 0.01 - smirkL);
      } else {
        c.moveTo(cx - width * 0.5, cy - corner);
        c.quadraticCurveTo(cx, cy + corner * 1.2 + S * 0.004, cx + width * 0.5, cy - corner - smirkL);
      }
      c.stroke();
      if (st === 'fang') this.fang(cx + width * 0.18, cy + corner * 0.4, 0.9);
      if (st === 'lips') this.lips(cx, cy, width, 0, corner);
      return;
    }

    const h = S * 0.12 * open;
    const w = width * (1 - p.mouthRound * 0.25 * open);
    const xl = cx - w / 2, xr = cx + w / 2;
    const yc = cy - corner * 0.6;
    c.save();
    c.beginPath();
    c.moveTo(xl, yc);
    c.bezierCurveTo(xl + w * 0.2, yc - h * 0.32 - p.mouthRound * h * 0.3, xr - w * 0.2, yc - h * 0.32 - p.mouthRound * h * 0.3, xr, yc - smirkL);
    c.bezierCurveTo(xr - w * 0.05 + p.mouthRound * w * 0.1, yc + h * 1.1, xl + w * 0.05 - p.mouthRound * w * 0.1, yc + h * 1.1, xl, yc);
    c.closePath();
    c.fillStyle = '#5c1724';
    c.fill();
    c.clip();
    // Tongue
    c.fillStyle = '#e8687a';
    c.beginPath();
    c.ellipse(cx, yc + h * 0.95, w * 0.34, h * 0.42, 0, 0, Math.PI * 2);
    c.fill();
    // Upper teeth when wide open
    if (open > 0.35 && p.mouthRound < 0.5) {
      c.fillStyle = '#ffffff';
      c.fillRect(xl, yc - h * 0.45, w, h * 0.22);
    }
    c.restore();
    c.strokeStyle = lineCol;
    c.lineWidth = S * 0.009;
    c.stroke();
    if (st === 'fang') this.fang(cx + w * 0.22, yc - h * 0.12, 1);
    if (st === 'lips') this.lips(cx, yc, w, h, corner);
  }

  private fang(x: number, y: number, s: number): void {
    const c = this.ctx;
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#3a1820';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x - S * 0.012 * s, y);
    c.lineTo(x + S * 0.012 * s, y);
    c.lineTo(x, y + S * 0.028 * s);
    c.closePath();
    c.fill();
    c.stroke();
  }

  private lips(cx: number, cy: number, w: number, h: number, corner: number): void {
    const c = this.ctx;
    c.strokeStyle = 'rgba(214,70,100,0.85)';
    c.lineWidth = S * 0.012;
    c.beginPath();
    c.moveTo(cx - w * 0.42, cy + h * 0.9 + S * 0.012);
    c.quadraticCurveTo(cx, cy + h * 1.15 + S * 0.03 + corner, cx + w * 0.42, cy + h * 0.9 + S * 0.012);
    c.stroke();
  }

  // ----------------------------------------------------------------- overlays
  private drawBaseMarks(p: FaceDraw): void {
    const c = this.ctx;
    const b = this.style.base;
    if (b === 'robot') {
      c.strokeStyle = this.style.accent;
      c.globalAlpha = 0.75 + 0.25 * Math.sin(p.time * 3);
      c.lineWidth = 4;
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(S * (0.5 + s * 0.3), S * 0.7);
        c.lineTo(S * (0.5 + s * 0.24), S * 0.7);
        c.lineTo(S * (0.5 + s * 0.21), S * 0.75);
        c.stroke();
      }
      c.globalAlpha = 1;
    } else if (b === 'fox') {
      c.fillStyle = '#d6303f';
      for (const s of [-1, 1]) {
        for (let i = 0; i < 2; i++) {
          c.beginPath();
          c.ellipse(S * (0.5 + s * (0.31 + i * 0.03)), S * (0.69 + i * 0.03), S * 0.035, S * 0.008, s * 0.25, 0, Math.PI * 2);
          c.fill();
        }
      }
    } else if (b === 'neko') {
      c.strokeStyle = 'rgba(60,40,40,0.55)';
      c.lineWidth = 3;
      for (const s of [-1, 1]) {
        for (let i = -1; i <= 1; i++) {
          c.beginPath();
          c.moveTo(S * (0.5 + s * 0.27), S * (0.72 + i * 0.022));
          c.lineTo(S * (0.5 + s * 0.38), S * (0.71 + i * 0.035));
          c.stroke();
        }
      }
    } else if (b === 'demon') {
      c.fillStyle = '#8f1d3a';
      c.beginPath();
      c.moveTo(S * 0.5, S * 0.17);
      c.lineTo(S * 0.52, S * 0.22);
      c.lineTo(S * 0.5, S * 0.27);
      c.lineTo(S * 0.48, S * 0.22);
      c.closePath();
      c.fill();
    }
  }

  private drawBlush(p: FaceDraw): void {
    const c = this.ctx;
    const a = clamp(p.blush + p.shy * 0.6, 0, 1);
    if (a < 0.02) return;
    for (const s of [-1, 1]) {
      const x = S * (0.5 + s * 0.24), y = S * 0.69;
      const g = c.createRadialGradient(x, y, 2, x, y, S * 0.09);
      g.addColorStop(0, `rgba(255,105,135,${0.55 * a})`);
      g.addColorStop(1, 'rgba(255,105,135,0)');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(x, y, S * 0.1, S * 0.06, 0, 0, Math.PI * 2);
      c.fill();
      if (p.shy > 0.2) {
        c.strokeStyle = `rgba(214,60,90,${p.shy * 0.8})`;
        c.lineWidth = 3;
        for (let i = -1; i <= 1; i++) {
          c.beginPath();
          c.moveTo(x + i * S * 0.025 - S * 0.008, y + S * 0.018);
          c.lineTo(x + i * S * 0.025 + S * 0.008, y - S * 0.018);
          c.stroke();
        }
      }
    }
  }

  private drawGloom(p: FaceDraw): void {
    const c = this.ctx;
    c.save();
    const g = c.createLinearGradient(0, 0, 0, S * 0.5);
    g.addColorStop(0, `rgba(40,30,90,${0.55 * p.gloom})`);
    g.addColorStop(1, 'rgba(40,30,90,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S * 0.5);
    c.strokeStyle = `rgba(40,30,90,${0.7 * p.gloom})`;
    c.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      const x = S * (0.24 + i * 0.065);
      c.beginPath();
      c.moveTo(x, S * 0.05);
      c.lineTo(x, S * (0.2 + (i % 3) * 0.04));
      c.stroke();
    }
    c.restore();
  }

  private drawTears(p: FaceDraw): void {
    const c = this.ctx;
    for (const s of [-1, 1]) {
      const x = S * (0.5 + s * 0.2);
      const y0 = S * 0.6;
      const g = c.createLinearGradient(0, y0, 0, S);
      g.addColorStop(0, `rgba(140,205,255,${0.85 * p.tears})`);
      g.addColorStop(1, 'rgba(140,205,255,0)');
      c.fillStyle = g;
      c.beginPath();
      const wob = Math.sin(p.time * 8 + s) * 3;
      c.moveTo(x - 9, y0);
      c.quadraticCurveTo(x - 12 + wob, S * 0.8, x - 7, S);
      c.lineTo(x + 7, S);
      c.quadraticCurveTo(x + 12 + wob, S * 0.8, x + 9, y0);
      c.fill();
      const t = (p.time * 0.9 + (s + 1) * 0.3) % 1;
      c.fillStyle = `rgba(190,230,255,${p.tears})`;
      c.beginPath();
      c.ellipse(x, y0 + t * S * 0.35, 6, 9, 0, 0, Math.PI * 2);
      c.fill();
    }
  }

  private drawAnger(p: FaceDraw): void {
    const c = this.ctx;
    const x = S * 0.76, y = S * 0.16, r = S * 0.05 * (0.9 + 0.12 * Math.sin(p.time * 14));
    c.save();
    c.globalAlpha = p.anger;
    c.strokeStyle = '#e8213b';
    c.lineWidth = S * 0.016;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const ax = x + Math.cos(a) * r, ay = y + Math.sin(a) * r;
      c.beginPath();
      c.arc(ax + Math.cos(a) * r * 0.55, ay + Math.sin(a) * r * 0.55, r * 0.6, a + Math.PI * 0.65, a + Math.PI * 1.35);
      c.stroke();
    }
    c.restore();
  }

  private drawSweat(p: FaceDraw): void {
    const c = this.ctx;
    const x = S * 0.83, y = S * 0.28 + ((p.time * 20) % 30);
    c.save();
    c.globalAlpha = p.sweat;
    c.fillStyle = '#9fd8ff';
    c.strokeStyle = '#3d8fd6';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(x, y - S * 0.05);
    c.quadraticCurveTo(x + S * 0.035, y + S * 0.005, x, y + S * 0.02);
    c.quadraticCurveTo(x - S * 0.035, y + S * 0.005, x, y - S * 0.05);
    c.fill();
    c.stroke();
    c.restore();
  }
}
