/**
 * Anonymous push token for notify server: one per device, exchanged only P2P during pairing.
 * Stored in app settings (same store as partnerId, etc.).
 */

import { getSetting, saveSetting } from '@/lib/storage';

const PUSH_TOKEN_KEY = 'pushToken';
const PARTNER_PUSH_TOKEN_KEY = 'partnerPushToken';

/** Generate a new opaque token (e.g. for this device). */
export function generatePushToken(): string {
  return crypto.randomUUID();
}

/**
 * Get this device's push token, creating and persisting one if missing.
 */
export async function getOrCreatePushToken(): Promise<string> {
  let token = await getSetting(PUSH_TOKEN_KEY);
  if (!token) {
    token = generatePushToken();
    await saveSetting(PUSH_TOKEN_KEY, token);
  }
  return token;
}

export async function getPushToken(): Promise<string | undefined> {
  return getSetting(PUSH_TOKEN_KEY);
}

export async function getPartnerPushToken(): Promise<string | undefined> {
  return getSetting(PARTNER_PUSH_TOKEN_KEY);
}

export async function setPartnerPushToken(token: string): Promise<void> {
  await saveSetting(PARTNER_PUSH_TOKEN_KEY, token);
}
