import type { Aspect } from '../core/types';
import type { Stage } from '../scene/Stage';
import { store, uid } from '../core/store';
import { putBlob, putVideo, type VideoMeta } from './db';

export type Quality = 'sd' | 'hd' | '4k';

const SIZES: Record<Quality, number> = { sd: 720, hd: 1080, '4k': 2160 };
const BITRATE: Record<Quality, number> = { sd: 4_000_000, hd: 9_000_000, '4k': 30_000_000 };

export function outputSize(aspect: Aspect, q: Quality): { w: number; h: number } {
  const short = SIZES[q];
  const long = Math.round((short * 16) / 9 / 2) * 2;
  if (aspect === '9:16') return { w: short, h: long };
  if (aspect === '16:9') return { w: long, h: short };
  return { w: short, h: short };
}

export function pickMime(): string {
  const candidates = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const c of candidates) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  return '';
}

let logoImg: HTMLImageElement | null = null;
function logo(): HTMLImageElement {
  if (!logoImg) {
    logoImg = new Image();
    logoImg.src = './brand/superessence-logo.png';
  }
  return logoImg;
}

export interface RecordingResult {
  blob: Blob;
  meta: VideoMeta;
}

/**
 * Records the stage: the WebGL frame is composited into a 2D canvas at the export resolution
 * (watermark for free accounts), captured with canvas.captureStream + the microphone track, and
 * encoded on-device with MediaRecorder (H.264/AAC MP4 when the WebView supports it, VP9/Opus WebM otherwise).
 */
export class Recorder {
  recording = false;
  paused = false;
  startedAt = 0;
  elapsed = 0;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private comp: HTMLCanvasElement | null = null;
  private hook: ((c: HTMLCanvasElement) => void) | null = null;
  private size = { w: 0, h: 0 };
  private watermark = true;
  private pauseAcc = 0;
  private pauseAt = 0;
  private tick = 0;

  constructor(private stage: Stage) {}

  get supported(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!pickMime() && 'captureStream' in HTMLCanvasElement.prototype;
  }

  start(aspect: Aspect, quality: Quality, withAudio: boolean): void {
    if (this.recording) return;
    const pro = store.isPro;
    const q: Quality = pro ? quality : 'sd';
    this.watermark = !pro;
    this.size = outputSize(aspect, q);
    const comp = document.createElement('canvas');
    comp.width = this.size.w;
    comp.height = this.size.h;
    this.comp = comp;
    const ctx = comp.getContext('2d', { alpha: false })!;
    this.stage.setFixedSize(this.size);
    const draw = (src: HTMLCanvasElement) => {
      ctx.drawImage(src, 0, 0, comp.width, comp.height);
      if (this.watermark) this.drawWatermark(ctx, comp.width, comp.height);
    };
    this.hook = draw;
    this.stage.hooks.add(draw);

    const stream = comp.captureStream(store.state.settings.fps);
    if (withAudio && this.stage.lip.stream) {
      for (const t of this.stage.lip.stream.getAudioTracks()) stream.addTrack(t);
    }
    const mime = pickMime();
    this.rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: BITRATE[q], audioBitsPerSecond: 128_000 });
    this.chunks = [];
    this.rec.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.rec.start(1000);
    this.recording = true;
    this.paused = false;
    this.pauseAcc = 0;
    this.startedAt = performance.now();
    this.elapsed = 0;
    clearInterval(this.tick);
    this.tick = window.setInterval(() => {
      if (!this.paused) this.elapsed = (performance.now() - this.startedAt - this.pauseAcc) / 1000;
    }, 200);
  }

  pause(): void {
    if (!this.rec || this.paused) return;
    this.rec.pause();
    this.paused = true;
    this.pauseAt = performance.now();
  }

  resume(): void {
    if (!this.rec || !this.paused) return;
    this.rec.resume();
    this.paused = false;
    this.pauseAcc += performance.now() - this.pauseAt;
  }

  private drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const img = logo();
    const lw = w * 0.34;
    const lh = img.naturalWidth ? (lw * img.naturalHeight) / img.naturalWidth : lw * 0.16;
    const pad = w * 0.035;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const bx = w - lw - pad * 1.6, by = h - lh - pad * 2.2;
    ctx.beginPath();
    ctx.roundRect(bx - pad * 0.4, by - pad * 0.3, lw + pad * 0.8, lh + pad * 1.25, pad * 0.5);
    ctx.fill();
    if (img.complete && img.naturalWidth) ctx.drawImage(img, bx, by, lw, lh);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${Math.round(w * 0.022)}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Fait avec Avatar Studio', bx + lw / 2, by + lh + pad * 0.62);
    ctx.restore();
  }

  async stop(): Promise<RecordingResult | null> {
    if (!this.rec) return null;
    const rec = this.rec;
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    if (rec.state !== 'inactive') rec.stop();
    await done;
    clearInterval(this.tick);
    if (this.hook) this.stage.hooks.delete(this.hook);
    this.stage.setFixedSize(null);
    this.recording = false;
    this.rec = null;
    const duration = this.elapsed;
    const mime = rec.mimeType || pickMime() || 'video/webm';
    const blob = new Blob(this.chunks, { type: mime.split(';')[0] });
    this.chunks = [];
    if (!blob.size) return null;
    const thumb = this.thumbnail();
    const id = uid();
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    const meta: VideoMeta = { id, name: `AvatarStudio-${stamp}.${ext}`, created: Date.now(), duration, width: this.size.w, height: this.size.h, mime: blob.type, size: blob.size, thumb };
    try {
      await putBlob('video-' + id, blob);
      await putVideo(meta);
    } catch {
      /* storage quota: the video can still be saved to the gallery */
    }
    store.track('recordings');
    store.update((s) => { s.totalRecordings++; });
    return { blob, meta };
  }

  private thumbnail(): string {
    const c = this.comp;
    if (!c) return '';
    const t = document.createElement('canvas');
    const k = 220 / Math.max(c.width, c.height);
    t.width = Math.round(c.width * k);
    t.height = Math.round(c.height * k);
    t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height);
    return t.toDataURL('image/jpeg', 0.75);
  }
}
