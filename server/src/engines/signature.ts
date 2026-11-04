/**
 * Signature inspection (read-only). Reports scheme versions and certificate fingerprints.
 * Private keys are never present in an APK; APPXRAY never copies signing material into rebuilt projects.
 */
import fs from 'node:fs';
import { X509Certificate, createHash } from 'node:crypto';

export interface CertInfo {
  subject: string;
  issuer: string;
  serial: string;
  validFrom: string;
  validTo: string;
  sha256: string;
  publicKeyType?: string;
  debugCert: boolean;
}
export interface SignatureInfo {
  schemes: string[];
  v1Certs: CertInfo[];
  v2Certs: CertInfo[];
  v3Certs: CertInfo[];
  otherBlocks: string[];
  warnings: string[];
}

const BLOCK_IDS: Record<number, string> = {
  0x7109871a: 'v2',
  0xf05368c0: 'v3',
  0x1b93ad61: 'v3.1',
  0x42726577: 'verity-padding',
  0x6dff800d: 'source-stamp',
  0x2146444e: 'play-metadata',
  0x504b4453: 'dependency-info',
};

function certInfo(der: Buffer): CertInfo | null {
  try {
    const c = new X509Certificate(der);
    return {
      subject: c.subject.replace(/\n/g, ', '),
      issuer: c.issuer.replace(/\n/g, ', '),
      serial: c.serialNumber,
      validFrom: c.validFrom,
      validTo: c.validTo,
      sha256: createHash('sha256').update(der).digest('hex').toUpperCase().match(/../g)!.join(':'),
      publicKeyType: c.publicKey.asymmetricKeyType,
      debugCert: /CN=Android Debug/i.test(c.subject),
    };
  } catch {
    return null;
  }
}

// ── minimal DER walker ──
interface Tlv { tag: number; start: number; hdr: number; len: number }
function tlv(b: Buffer, p: number): Tlv {
  const tag = b[p];
  let len = b[p + 1];
  let hdr = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n > 4) throw new Error('DER length too large');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + b[p + 2 + i];
    hdr += n;
  }
  if (p + hdr + len > b.length) throw new Error('DER overflow');
  return { tag, start: p, hdr, len };
}
function children(b: Buffer, t: Tlv): Tlv[] {
  const out: Tlv[] = [];
  let p = t.start + t.hdr;
  const end = p + t.len;
  while (p < end) {
    const c = tlv(b, p);
    out.push(c);
    p = c.start + c.hdr + c.len;
  }
  return out;
}

/** Extract certificates from a PKCS#7 SignedData blob (META-INF/*.RSA|DSA|EC). */
export function pkcs7Certificates(b: Buffer): Buffer[] {
  const ci = tlv(b, 0);
  const [, explicit] = children(b, ci);
  if (!explicit) return [];
  const [signedData] = children(b, explicit);
  const parts = children(b, signedData);
  const certSet = parts.find((p) => p.tag === 0xa0);
  if (!certSet) return [];
  return children(b, certSet).filter((c) => c.tag === 0x30).map((c) => b.subarray(c.start, c.start + c.hdr + c.len));
}

function lpSeq(b: Buffer, p: number, end: number): Buffer[] {
  const out: Buffer[] = [];
  while (p + 4 <= end) {
    const n = b.readUInt32LE(p);
    p += 4;
    if (p + n > end) break;
    out.push(b.subarray(p, p + n));
    p += n;
  }
  return out;
}

async function readAt(fd: fs.promises.FileHandle, pos: number, len: number) {
  const buf = Buffer.alloc(len);
  await fd.read(buf, 0, len, pos);
  return buf;
}

export async function inspectSignatures(apk: string, v1Blobs: Map<string, Buffer>): Promise<SignatureInfo> {
  const info: SignatureInfo = { schemes: [], v1Certs: [], v2Certs: [], v3Certs: [], otherBlocks: [], warnings: [] };
  for (const [name, blob] of v1Blobs) {
    try {
      for (const der of pkcs7Certificates(blob)) {
        const c = certInfo(der);
        if (c) info.v1Certs.push(c);
      }
    } catch {
      info.warnings.push(`Bloc PKCS#7 illisible: ${name}`);
    }
  }
  if (info.v1Certs.length) info.schemes.push('v1 (JAR)');

  const fd = await fs.promises.open(apk, 'r');
  try {
    const { size } = await fd.stat();
    const tailLen = Math.min(size, 65557);
    const tail = await readAt(fd, size - tailLen, tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) return info;
    const cdOff = tail.readUInt32LE(eocd + 16);
    if (cdOff < 32) return info;
    const footer = await readAt(fd, cdOff - 24, 24);
    if (footer.toString('latin1', 8, 24) !== 'APK Sig Block 42') return info;
    const blockSize = Number(footer.readBigUInt64LE(0));
    if (blockSize > 64 * 1024 * 1024 || blockSize > cdOff) {
      info.warnings.push('APK Signing Block de taille incohérente');
      return info;
    }
    const block = await readAt(fd, cdOff - blockSize - 8, blockSize + 8);
    let p = 8;
    const end = block.length - 24;
    while (p + 12 <= end) {
      const len = Number(block.readBigUInt64LE(p));
      const id = block.readUInt32LE(p + 8);
      const vStart = p + 12, vEnd = p + 8 + len;
      if (len < 4 || vEnd > end) break;
      const kind = BLOCK_IDS[id] ?? `0x${id.toString(16)}`;
      if (kind === 'v2' || kind === 'v3' || kind === 'v3.1') {
        info.schemes.push(kind === 'v2' ? 'v2' : kind);
        try {
          const [signersSeq] = lpSeq(block, vStart, vEnd);
          for (const signer of lpSeq(signersSeq, 0, signersSeq.length)) {
            const [signedData] = lpSeq(signer, 0, signer.length);
            const [, certs] = lpSeq(signedData, 0, signedData.length);
            for (const der of lpSeq(certs, 0, certs.length)) {
              const c = certInfo(der);
              if (c) (kind === 'v2' ? info.v2Certs : info.v3Certs).push(c);
            }
          }
        } catch {
          info.warnings.push(`Bloc de signature ${kind} illisible`);
        }
      } else if (kind !== 'verity-padding') info.otherBlocks.push(kind);
      p = vEnd;
    }
  } finally {
    await fd.close();
  }
  return info;
}
