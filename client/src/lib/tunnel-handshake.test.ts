import { describe, expect, it } from 'vitest';
import { decryptWithSharedSecret, deriveSharedSecret, encryptWithSharedSecret, generateEphemeralKeyPair } from './tunnel-handshake';

describe('tunnel-handshake', () => {
  it('derives matching shared secrets and round-trips encrypted payload', async () => {
    const a = await generateEphemeralKeyPair();
    const b = await generateEphemeralKeyPair();

    const sharedA = await deriveSharedSecret(a.privateKey, b.publicKey);
    const sharedB = await deriveSharedSecret(b.privateKey, a.publicKey);

    const { iv, encrypted } = await encryptWithSharedSecret('hello', sharedA);
    const dec = await decryptWithSharedSecret(iv, encrypted, sharedB);

    expect(dec).toBe('hello');
  });
});

