/** Bridge to the Android shell (io.superessence.avatarstudio.MainActivity). Falls back to web APIs in a browser. */
interface NativeBridge {
  saveBegin(name: string, mime: string): string;
  saveChunk(id: string, b64: string): boolean;
  saveEnd(id: string): string;
  saveAbort(id: string): void;
  share(uri: string, mime: string): void;
  vibrate(ms: number): void;
  keepScreenOn(on: boolean): void;
  setImmersive(on: boolean): void;
  appVersion(): string;
  deviceInfo(): string;
}

declare global {
  interface Window {
    SENative?: NativeBridge;
    __seBack?: () => boolean;
  }
}

export const native = window.SENative;
export const isAndroid = !!native;

export function vibrate(ms = 12): void {
  try {
    if (native) native.vibrate(ms);
    else navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

export function keepScreenOn(on: boolean): void {
  try {
    native?.keepScreenOn(on);
  } catch {
    /* ignore */
  }
}

export function setImmersive(on: boolean): void {
  try {
    native?.setImmersive(on);
  } catch {
    /* ignore */
  }
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

export interface SavedFile {
  uri: string;
  name: string;
}

/** Saves a video to the phone gallery (Movies/SuperEssence) or downloads it in a browser. */
export async function saveVideo(blob: Blob, name: string, onProgress?: (p: number) => void): Promise<SavedFile> {
  const mime = blob.type || 'video/mp4';
  if (!native) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return { uri: url, name };
  }
  const id = native.saveBegin(name, mime);
  if (!id) throw new Error('Impossible de créer le fichier.');
  const CHUNK = 768 * 1024; // multiple of 3 so base64 chunks concatenate cleanly
  try {
    for (let off = 0; off < blob.size; off += CHUNK) {
      const b64 = await blobToBase64(blob.slice(off, off + CHUNK));
      if (!native.saveChunk(id, b64)) throw new Error('Écriture interrompue.');
      onProgress?.(Math.min(1, (off + CHUNK) / blob.size));
    }
    const uri = native.saveEnd(id);
    if (!uri) throw new Error('Finalisation impossible.');
    return { uri, name };
  } catch (e) {
    native.saveAbort(id);
    throw e;
  }
}

export async function shareVideo(saved: SavedFile, blob: Blob): Promise<void> {
  if (native) {
    native.share(saved.uri, blob.type || 'video/mp4');
    return;
  }
  const file = new File([blob], saved.name, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: saved.name });
}
