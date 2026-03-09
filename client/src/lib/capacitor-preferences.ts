/**
 * Native keychain-backed storage (iOS Keychain, Android SharedPreferences).
 * Used when running in Capacitor so passphrase/PIN and critical keys survive
 * WKWebView/IndexedDB eviction. On web, all functions no-op or return undefined.
 */

import { Capacitor } from '@capacitor/core';
import type { PreferencesPlugin } from '@capacitor/preferences';

const CRITICAL_KEYS = new Set([
  'passphrase',
  'salt',
  'userId',
  'pinEnabled',
  'displayName',
  'encryptedPassphrase',
  'pin',
  'partnerId',
  'pairingStatus',
]);

let Preferences: PreferencesPlugin | null = null;

async function getPreferences(): Promise<PreferencesPlugin | null> {
  if (Preferences != null) return Preferences;
  try {
    const prefs = await import('@capacitor/preferences');
    Preferences = prefs.Preferences;
    return Preferences;
  } catch {
    return null;
  }
}

function prefKey(key: string): string {
  return `dodi-${key}`;
}

export function isNativePlatform(): boolean {
  try {
    return Capacitor?.isNativePlatform?.() ?? false;
  } catch {
    return false;
  }
}

export async function getNativeSetting(key: string): Promise<string | undefined> {
  if (!CRITICAL_KEYS.has(key)) return undefined;
  if (!isNativePlatform()) return undefined;
  const prefs = await getPreferences();
  if (!prefs) return undefined;
  try {
    const { value } = await prefs.get({ key: prefKey(key) });
    return value ?? undefined;
  } catch {
    return undefined;
  }
}

export async function setNativeSetting(key: string, value: string): Promise<void> {
  if (!CRITICAL_KEYS.has(key)) return;
  if (!isNativePlatform()) return;
  const prefs = await getPreferences();
  if (!prefs) return;
  try {
    await prefs.set({ key: prefKey(key), value });
  } catch (e) {
    console.warn('[capacitor-preferences] set failed:', key, e);
  }
}

/** Remove all mirrored keys from native Preferences (e.g. on logout). */
export async function clearNativeSettings(): Promise<void> {
  if (!isNativePlatform()) return;
  const prefs = await getPreferences();
  if (!prefs) return;
  try {
    for (const key of CRITICAL_KEYS) {
      await prefs.remove({ key: prefKey(key) });
    }
  } catch (e) {
    console.warn('[capacitor-preferences] clear failed:', e);
  }
}
