/** Minimal IndexedDB blob store (recordings, imported VRM models, custom backgrounds). */
const DB = 'se-avatar-studio';
const STORE = 'blobs';
const META = 'videos';

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 2);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
        if (!d.objectStoreNames.contains(META)) d.createObjectStore(META, { keyPath: 'id' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const req = fn(d.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export const putBlob = (key: string, b: Blob) => tx(STORE, 'readwrite', (s) => s.put(b, key));
export const getBlob = (key: string) => tx<Blob | undefined>(STORE, 'readonly', (s) => s.get(key));
export const delBlob = (key: string) => tx(STORE, 'readwrite', (s) => s.delete(key));

export interface VideoMeta {
  id: string;
  name: string;
  created: number;
  duration: number;
  width: number;
  height: number;
  mime: string;
  size: number;
  thumb: string;
  savedUri?: string;
}

export const putVideo = (m: VideoMeta) => tx(META, 'readwrite', (s) => s.put(m));
export const listVideos = () => tx<VideoMeta[]>(META, 'readonly', (s) => s.getAll()).then((v) => v.sort((a, b) => b.created - a.created));
export async function deleteVideo(id: string): Promise<void> {
  await tx(META, 'readwrite', (s) => s.delete(id));
  await delBlob('video-' + id);
}
