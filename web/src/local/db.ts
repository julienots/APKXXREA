/** IndexedDB storage for the on-device mode (analyses, APK files, UI edits, projects, builds, signing key). */
const DB_NAME = 'appxray';
const STORES = ['analyses', 'blobs', 'ui', 'projects', 'projectFiles', 'builds', 'settings', 'keys'] as const;
export type Store = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s);
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbp;
}

function tx<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error ?? req.error);
        t.onabort = () => reject(t.error ?? new Error('Transaction annulée (espace de stockage insuffisant ?)'));
      }),
  );
}

export const get = <T>(store: Store, key: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
export const put = (store: Store, key: string, value: unknown) => tx(store, 'readwrite', (s) => s.put(value, key));
export const del = (store: Store, key: string) => tx(store, 'readwrite', (s) => s.delete(key));
export const all = <T>(store: Store) => tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
export const keys = (store: Store) => tx<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys());
export async function delPrefix(store: Store, prefix: string) {
  for (const k of await keys(store)) if (String(k).startsWith(prefix)) await del(store, String(k));
}
export async function clearAll() {
  for (const s of STORES) if (s !== 'keys') await tx(s, 'readwrite', (st) => st.clear());
}
export async function usage(): Promise<{ bytes: number; files: number }> {
  let files = 0;
  for (const s of STORES) files += (await keys(s)).length;
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : undefined;
  return { bytes: est?.usage ?? 0, files };
}
