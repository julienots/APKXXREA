import { LICENSE_PUBLIC_JWK } from './licenseKey';
import { store, today, uid } from './store';

let keyPromise: Promise<CryptoKey> | null = null;
function publicKey(): Promise<CryptoKey> {
  if (!keyPromise) keyPromise = crypto.subtle.importKey('jwk', LICENSE_PUBLIC_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return keyPromise;
}

function fromB64u(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export type LicenseResult = { ok: true; exp: string } | { ok: false; reason: string };

/** Verifies a developer-signed Pro code (ECDSA P-256) entirely offline. */
export async function activateCode(raw: string): Promise<LicenseResult> {
  const code = raw.trim().replace(/\s+/g, '');
  const m = /^SEPRO-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(code);
  if (!m) return { ok: false, reason: 'Format de code invalide.' };
  try {
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      await publicKey(),
      fromB64u(m[2]),
      new TextEncoder().encode(m[1]),
    );
    if (!valid) return { ok: false, reason: 'Signature du code invalide.' };
    const payload = JSON.parse(new TextDecoder().decode(fromB64u(m[1]))) as { p: string; e: string; i: string };
    if (payload.p !== 'pro') return { ok: false, reason: 'Ce code ne concerne pas l\'abonnement Pro.' };
    if (payload.e < today()) return { ok: false, reason: 'Ce code a expiré.' };
    store.update((s) => {
      if (!s.license || s.license.exp < payload.e) s.license = { plan: 'pro', exp: payload.e, id: payload.i, source: 'code' };
    });
    return { ok: true, exp: payload.e };
  } catch {
    return { ok: false, reason: 'Code illisible.' };
  }
}

export function startTrial(): boolean {
  if (store.state.trialUsed || store.isPro) return false;
  const exp = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  store.update((s) => {
    s.trialUsed = true;
    s.license = { plan: 'pro', exp, id: 'trial-' + uid(), source: 'trial' };
  });
  return true;
}
