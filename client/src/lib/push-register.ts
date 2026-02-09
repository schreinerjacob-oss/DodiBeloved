/**
 * Register this device's push subscription with the notify server.
 * Called after pairing when permission is granted, and on app load when already paired.
 */

import { getOrCreatePushToken } from '@/lib/push-token';
import { getNotificationPermission } from '@/lib/notifications';

const NOTIFY_SERVER_URL = import.meta.env.VITE_NOTIFY_SERVER_URL as string | undefined;
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/** Base URL of the notify server (no trailing slash). */
export function getNotifyServerUrl(): string | undefined {
  return NOTIFY_SERVER_URL?.trim() || undefined;
}

/** VAPID public key for PushManager.subscribe (base64url). */
export function getVapidPublicKey(): string | undefined {
  return VAPID_PUBLIC_KEY?.trim() || undefined;
}

/** Decode base64url to Uint8Array for applicationServerKey. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64Safe);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Subscribe to push and register with the notify server.
 * No-op if notify server URL or VAPID key is missing, or permission not granted.
 */
export async function registerPushWithNotifyServer(): Promise<boolean> {
  const baseUrl = getNotifyServerUrl();
  const vapidKey = getVapidPublicKey();
  if (!baseUrl || !vapidKey) return false;

  const permission = await getNotificationPermission();
  if (permission !== 'granted') return false;

  try {
    const token = await getOrCreatePushToken();
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, subscription: subscription.toJSON() }),
    });
    if (!res.ok) {
      console.warn('Push register failed:', res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Push register error:', e);
    return false;
  }
}
