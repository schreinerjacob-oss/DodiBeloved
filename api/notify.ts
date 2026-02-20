/**
 * POST /api/notify — send Web Push to token's subscription(s).
 * Body: { token: string, type?: 'call' | 'message' }
 */

import { Redis } from '@upstash/redis';
import webpush from 'web-push';

const redis = Redis.fromEnv();
const KV_KEY_PREFIX = 'notify:';

type PushSub = { endpoint: string; keys?: { p256dh?: string; auth?: string }; expirationTime?: number | null };

function ensureVapid(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error('Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY');
  }
  webpush.setVapidDetails('mailto:dodi@local', publicKey, privateKey);
}

let vapidInitialized = false;

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
  if (!vapidInitialized) {
    try {
      ensureVapid();
      vapidInitialized = true;
    } catch {
      return Response.json({ error: 'server configuration error' }, { status: 500 });
    }
  }
  const key = KV_KEY_PREFIX + token;
  const subs = await kv.get<PushSub[]>(key);
  if (!subs || subs.length === 0) {
    return Response.json({ error: 'unknown token' }, { status: 404 });
  }
  const title = 'dodi';
  const bodyText = type === 'call' ? 'Dodi is calling' : 'New message from your partner';
  const tag = type === 'call' ? 'dodi-call' : 'dodi-message';
  const payload = JSON.stringify({ type: 'notify', title, body: bodyText, tag });

  const results = await Promise.allSettled(
    subs.map((sub) =>
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
    stillValid.push(subs[i]);
  });

  if (stillValid.length !== subs.length) {
    await redis.set(key, stillValid);
  }

  const anyRejected = results.some((r) => r.status === 'rejected');
  if (anyRejected) {
    return Response.json({ error: 'send failed' }, { status: 500 });
  }
  return new Response(null, { status: 200 });
}
