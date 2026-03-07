/**
 * POST /api/register — store token -> subscription(s) and/or native FCM/APNs token in Upstash Redis.
 * Body (web): { token: string, subscription: PushSubscriptionJSON }
 * Body (native): { token: string, nativeToken: string, platform: 'ios' | 'android' }
 */

import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const KV_KEY_PREFIX = 'notify:';

type PushSub = { endpoint: string; keys?: { p256dh?: string; auth?: string }; expirationTime?: number | null };

type StoredRegistration =
  | PushSub[]
  | { web?: PushSub[]; nativeToken?: string; platform?: 'ios' | 'android' };

function normalizeStored(raw: StoredRegistration | null): {
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

export async function POST(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(null, { status: 405 });
  }
  let body: {
    token?: string;
    subscription?: PushSub;
    nativeToken?: string;
    platform?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'token and (subscription or nativeToken+platform) required' },
      { status: 400 }
    );
  }
  const { token, subscription, nativeToken, platform } = body;
  if (!token || typeof token !== 'string') {
    return Response.json({ error: 'token required' }, { status: 400 });
  }

  const key = KV_KEY_PREFIX + token;
  const raw = await redis.get<StoredRegistration>(key);
  const current = normalizeStored(raw);

  if (subscription != null && typeof subscription === 'object') {
    const endpoint = subscription.endpoint;
    const idx = current.web.findIndex((s) => s.endpoint === endpoint);
    const nextWeb = [...current.web];
    if (idx >= 0) nextWeb[idx] = subscription;
    else nextWeb.push(subscription);
    await redis.set(key, {
      web: nextWeb,
      nativeToken: current.nativeToken,
      platform: current.platform,
    });
    return new Response(null, { status: 204 });
  }

  if (
    nativeToken != null &&
    typeof nativeToken === 'string' &&
    (platform === 'ios' || platform === 'android')
  ) {
    await redis.set(key, {
      web: current.web,
      nativeToken,
      platform,
    });
    return new Response(null, { status: 204 });
  }

  return Response.json(
    { error: 'token and (subscription or nativeToken+platform) required' },
    { status: 400 }
  );
}
