/**
 * POST /api/notify — send Web Push and/or FCM to token's subscription(s).
 * Body: { token: string, type?: 'call' | 'message' }
 * Stored value can be PushSub[] (web) or { web?, nativeToken?, platform? }.
 * When nativeToken is set, sends via Firebase Admin (FCM/APNs). Env: FIREBASE_SERVICE_ACCOUNT_JSON (string) or FIREBASE_SERVICE_ACCOUNT_PATH.
 */

import { Redis } from '@upstash/redis';
import webpush from 'web-push';

const redis = Redis.fromEnv();
const KV_KEY_PREFIX = 'notify:';

type PushSub = { endpoint: string; keys?: { p256dh?: string; auth?: string }; expirationTime?: number | null };

type StoredRegistration =
  | PushSub[]
  | { web?: PushSub[]; nativeToken?: string; platform?: 'ios' | 'android' };

function ensureVapid(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error('Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY');
  }
  webpush.setVapidDetails('mailto:dodi@local', publicKey, privateKey);
}

let vapidInitialized = false;

function getStoredRegistration(raw: StoredRegistration | null): {
  web: PushSub[];
  nativeToken?: string;
  platform?: 'ios' | 'android';
} {
  if (!raw) return { web: [] };
  if (Array.isArray(raw)) return { web: raw };
  return {
    web: raw.web ?? [],
    nativeToken: raw.nativeToken,
    platform: raw.platform,
  };
}

async function sendViaFCM(nativeToken: string, title: string, bodyText: string): Promise<void> {
  const { getApps, cert, initializeApp } = await import('firebase-admin/app');
  const { getMessaging } = await import('firebase-admin/messaging');
  if (getApps().length === 0) {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (json) {
      try {
        initializeApp({ credential: cert(JSON.parse(json)) });
      } catch {
        throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON');
      }
    } else if (path) {
      const { readFileSync } = await import('fs');
      const key = JSON.parse(readFileSync(path, 'utf8'));
      initializeApp({ credential: cert(key) });
    } else {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH required for native push');
    }
  }
  await getMessaging().send({
    token: nativeToken,
    notification: { title, body: bodyText },
    data: { type: 'notify' },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(null, { status: 405 });
  }
  let body: { token?: string; type?: 'call' | 'message' };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'token required' }, { status: 400 });
  }
  const { token, type } = body;
  if (!token || typeof token !== 'string') {
    return Response.json({ error: 'token required' }, { status: 400 });
  }

  const key = KV_KEY_PREFIX + token;
  const raw = await redis.get<StoredRegistration>(key);
  const stored = getStoredRegistration(raw);

  const title = 'dodi';
  const bodyText = type === 'call' ? 'Dodi is calling' : 'New message from your partner';
  const tag = type === 'call' ? 'dodi-call' : 'dodi-message';
  const payload = JSON.stringify({ type: 'notify', title, body: bodyText, tag });

  if (!stored.web.length && !stored.nativeToken) {
    return Response.json({ error: 'unknown token' }, { status: 404 });
  }

  let webFailed = false;
  if (stored.web.length > 0) {
    if (!vapidInitialized) {
      try {
        ensureVapid();
        vapidInitialized = true;
      } catch {
        return Response.json({ error: 'server configuration error' }, { status: 500 });
      }
    }
    const results = await Promise.allSettled(
      stored.web.map((sub) =>
        webpush.sendNotification(sub as webpush.PushSubscription, payload).catch((err: { statusCode?: number }) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            return { expired: true };
          }
          throw err;
        })
      )
    );
    const stillValid: PushSub[] = [];
    results.forEach((result, i) => {
      if (result.status === 'rejected') return;
      if (result.value && typeof result.value === 'object' && 'expired' in result.value) return;
      stillValid.push(stored.web[i]);
    });
    if (stillValid.length !== stored.web.length) {
      await redis.set(key, {
        web: stillValid,
        nativeToken: stored.nativeToken,
        platform: stored.platform,
      });
    }
    webFailed = results.some((r) => r.status === 'rejected');
  }

  if (stored.nativeToken) {
    try {
      await sendViaFCM(stored.nativeToken, title, bodyText);
    } catch (e) {
      console.warn('FCM send error:', e);
      return Response.json({ error: 'send failed' }, { status: 500 });
    }
  }

  if (webFailed) {
    return Response.json({ error: 'send failed' }, { status: 500 });
  }
  return new Response(null, { status: 200 });
}
