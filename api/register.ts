/**
 * POST /api/register — store token -> subscription(s) in Upstash Redis.
 * Body: { token: string, subscription: PushSubscriptionJSON }
 */

import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const KV_KEY_PREFIX = 'notify:';

type PushSub = { endpoint: string; keys?: { p256dh?: string; auth?: string }; expirationTime?: number | null };

export async function POST(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(null, { status: 405 });
  }
  let body: { token?: string; subscription?: PushSub };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'token and subscription required' }, { status: 400 });
  }
  const { token, subscription } = body;
  if (!token || typeof token !== 'string' || !subscription || typeof subscription !== 'object') {
    return Response.json({ error: 'token and subscription required' }, { status: 400 });
  }
  const key = KV_KEY_PREFIX + token;
  const existing = (await redis.get<PushSub[]>(key)) ?? [];
  const endpoint = subscription.endpoint;
  const idx = existing.findIndex((s) => s.endpoint === endpoint);
  const next = [...existing];
  if (idx >= 0) next[idx] = subscription;
  else next.push(subscription);
  await redis.set(key, next);
  return new Response(null, { status: 204 });
}
