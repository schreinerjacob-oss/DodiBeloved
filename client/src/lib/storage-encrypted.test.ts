import { beforeEach, describe, expect, it } from 'vitest';
import type { Message } from '@/types';
import { arrayBufferToBase64, generateSalt } from './crypto';
import { clearAllData, clearEncryptionCache, getMessages, saveMessage, saveSetting } from './storage-encrypted';

describe('storage-encrypted', () => {
  beforeEach(async () => {
    clearEncryptionCache();
    await clearAllData();
    await saveSetting('passphrase', 'unit-test-passphrase');
    await saveSetting('salt', arrayBufferToBase64(generateSalt()));
  });

  it('saves and loads an encrypted message', async () => {
    const msg: Message = {
      id: 'm1',
      senderId: 'a',
      recipientId: 'b',
      content: 'hi',
      timestamp: new Date('2026-01-01T00:00:00.000Z'),
      type: 'text',
      status: 'sent',
    };

    await saveMessage(msg);
    const loaded = await getMessages(10, 0);

    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe('m1');
    expect(loaded[0].content).toBe('hi');
    expect(loaded[0].timestamp instanceof Date).toBe(true);
  });
});

