/**
 * Minimal notify-only server for Dodi push notifications.
 * - POST /register: store token -> subscription(s). No identity stored.
 * - POST /notify: send Web Push to token's subscription(s). No log, no persist.
 */

import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import webpush from 'web-push';
import * as admin from 'firebase-admin';

const app = express();
app.use(express.json({ limit: '10kb' }));

// In-memory: token -> array of PushSubscription (JSON objects)
const tokenToSubscriptions = new Map<string, webpush.PushSubscription[]>();
// In-memory: token -> array of native push registrations (FCM/APNs)
type NativeRegistration = { nativeToken: string; platform: 'ios' | 'android' };
const tokenToNativeRegistrations = new Map<string, NativeRegistration[]>();

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error('Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY. Generate with: npx web-push generate-vapid-keys');
  process.exit(1);
}

webpush.setVapidDetails('mailto:dodi@local', VAPID_PUBLIC, VAPID_PRIVATE);

// Firebase Admin (optional, for native push). Initialize once at startup to avoid race conditions.
const FIREBASE_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
let firebaseMessaging: admin.messaging.Messaging | null = null;

if (FIREBASE_JSON) {
  try {
    const creds = JSON.parse(FIREBASE_JSON);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(creds),
      });
    }
    firebaseMessaging = admin.messaging();
  } catch (err) {
    console.error('Failed to initialize Firebase Admin from FIREBASE_SERVICE_ACCOUNT_JSON', err);
    firebaseMessaging = null;
  }
}

// Optional: log only non-notify requests (do not log POST /notify at all)
function accessLogSkipNotify(req: Request, res: Response, next: () => void) {
  if (req.method === 'POST' && req.path === '/notify') {
    return next();
  }
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
}
app.use(accessLogSkipNotify);

// POST /register — store token -> subscription(s) and/or native tokens. Optional generic log only.
app.post('/register', (req: Request, res: Response) => {
  const { token, subscription, nativeToken, platform } = req.body as {
    token?: string;
    subscription?: webpush.PushSubscription;
    nativeToken?: string;
    platform?: 'ios' | 'android' | string;
  };

  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'token required' });
    return;
  }

  const hasWeb = subscription && typeof subscription === 'object';
  const hasNative = typeof nativeToken === 'string' && (platform === 'ios' || platform === 'android');

  if (!hasWeb && !hasNative) {
    res.status(400).json({ error: 'subscription or nativeToken+platform required' });
    return;
  }

  if (hasWeb) {
    const subs = tokenToSubscriptions.get(token) ?? [];
    const key = subscription!.endpoint;
    const idx = subs.findIndex((s) => s.endpoint === key);
    if (idx >= 0) subs[idx] = subscription!;
    else subs.push(subscription!);
    tokenToSubscriptions.set(token, subs);
  }

  if (hasNative) {
    const current = tokenToNativeRegistrations.get(token) ?? [];
    // Avoid simple duplicates for the same nativeToken+platform
    if (!current.some((r) => r.nativeToken === nativeToken && r.platform === platform)) {
      current.push({ nativeToken: nativeToken!, platform: platform as 'ios' | 'android' });
      tokenToNativeRegistrations.set(token, current);
    }
  }

  // Optional: generic log only (no token value)
  // console.log('Registration received');
  res.status(204).end();
});

// POST /notify — send push to token's subscription(s) and native tokens. No log, no persist.
app.post('/notify', (req: Request, res: Response) => {
  const { token, type } = req.body as { token?: string; type?: 'call' | 'message' };
  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'token required' });
    return;
  }
  const subs = tokenToSubscriptions.get(token);
  const natives = tokenToNativeRegistrations.get(token);
  if ((!subs || subs.length === 0) && (!natives || natives.length === 0)) {
    res.status(404).json({ error: 'unknown token' });
    return;
  }
  const title = 'dodi';
  const body = type === 'call'
    ? 'Dodi is calling'
    : 'New message from your partner';
  const tag = type === 'call' ? 'dodi-call' : 'dodi-message';
  const payload = JSON.stringify({ type: 'notify', title, body, tag });

  const webPromise = subs && subs.length > 0
    ? Promise.all(
        subs.map((sub) =>
          webpush.sendNotification(sub, payload).catch((err) => {
            if (err.statusCode === 410 || err.statusCode === 404) {
              // Subscription expired or invalid — could remove from map (optional, no log of token)
              return;
            }
            throw err;
          }),
        ),
      )
    : Promise.resolve();

  const nativePromise =
    natives && natives.length > 0 && firebaseMessaging
      ? (async () => {
          await Promise.all(
            natives.map((reg) =>
              firebaseMessaging!
                .send({
                  token: reg.nativeToken,
                  notification: { title, body },
                  data: { type: type ?? 'message' },
                })
                .catch(() => {
                  // Do not crash notify endpoint on individual native failures.
                }),
            ),
          );
        })()
      : Promise.resolve();

  Promise.all([webPromise, nativePromise])
    .then(() => {
      res.status(200).end();
    })
    .catch(() => {
      res.status(500).json({ error: 'send failed' });
    });
});

const PORT = Number(process.env.NOTIFY_PORT) || 5001;
app.listen(PORT, () => {
  console.log(`Notify server listening on port ${PORT}`);
});
