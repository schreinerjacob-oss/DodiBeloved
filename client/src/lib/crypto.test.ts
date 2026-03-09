import { describe, expect, it } from 'vitest';
import { decrypt, deriveKey, encrypt, generateSalt } from './crypto';

describe('crypto', () => {
  it('round-trips encrypt/decrypt', async () => {
    const salt = generateSalt();
    const key = await deriveKey('test-passphrase', salt);
    const enc = await encrypt('hello dodi', key);
    const dec = await decrypt(enc, key);
    expect(dec).toBe('hello dodi');
  });
});

