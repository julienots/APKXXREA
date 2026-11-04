/** Minimal POSIX path helpers + hashing usable in Node and in the browser (no node:path). */
function norm(parts: string[]): string {
  const out: string[] = [];
  for (const p of parts.join('/').split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop();
      else out.push('..');
    } else out.push(p);
  }
  return out.join('/');
}
export const path = {
  join: (...p: string[]) => norm(p.filter((x) => x !== '')),
  dirname: (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.'),
  basename: (p: string, ext?: string) => {
    const b = p.slice(p.lastIndexOf('/') + 1);
    return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
  },
  extname: (p: string) => {
    const b = p.slice(p.lastIndexOf('/') + 1);
    const i = b.lastIndexOf('.');
    return i > 0 ? b.slice(i) : '';
  },
};
/** FNV-1a 32-bit, hex (stable names for generated resources; not for security). */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
