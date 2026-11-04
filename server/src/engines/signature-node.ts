/** Node adapter for signature inspection. */
import fs from 'node:fs';
import { X509Certificate, createHash } from 'node:crypto';
import { inspectSignaturesWith, nodeCertInfo, SignatureInfo } from './signature.js';

export async function inspectSignatures(apk: string, v1Blobs: Map<string, Buffer>): Promise<SignatureInfo> {
  const fd = await fs.promises.open(apk, 'r');
  try {
    const { size } = await fd.stat();
    const readAt = async (pos: number, len: number) => {
      const b = Buffer.alloc(len);
      await fd.read(b, 0, len, pos);
      return b;
    };
    return await inspectSignaturesWith(readAt, size, v1Blobs, (der) => nodeCertInfo(der, X509Certificate as never, (b) => createHash('sha256').update(b).digest('hex')));
  } finally {
    await fd.close();
  }
}
