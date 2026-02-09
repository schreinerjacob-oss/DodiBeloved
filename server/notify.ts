/**
 * Minimal notify-only server for Dodi push notifications.
 * - POST /register: store token -> subscription(s). No identity stored.
 * - POST /notify: send Web Push to token's subscription(s). No log, no persist.
 */

import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import webpush from 'web-push';

const app = express();
app.use(express.json({ limit: '10kb' }));

// In-memory: token -> array of PushSubscription (JSON objects)
const tokenToSubscriptions = new Map<string, webpush.PushSubscription[]>();

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error('Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY. Generate with: npx web-push generate-vapid-keys');
  process.exit(1);
}

webpush.setVapidDetails('mailto:dodi@local', VAPID_PUBLIC, VAPID_PRIVATE);

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

// POST /register — store token -> subscription(s). Optional generic log only.
app.post('/register', (req: Request, res: Response) => {
  const { token, subscription } = req.body as { token?: string; subscription?: webpush.PushSubscription };
  if (!token || typeof token !== 'string' || !subscription || typeof subscription !== 'object') {
    res.status(400).json({ error: 'token and subscription required' });
    return;
  }
  const subs = tokenToSubscriptions.get(token) ?? [];
  const key = subscription.endpoint;
  const idx = subs.findIndex(s => s.endpoint === key);
  if (idx >= 0) subs[idx] = subscription;
  else subs.push(subscription);
  tokenToSubscriptions.set(token, subs);
  // Optional: generic log only (no token value)
  // console.log('Registration received');
  res.status(204).end();
});

// POST /notify — send push to token's subscription(s). No log, no persist.
app.post('/notify', (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };
  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'token required' });
    return;
  }
  const subs = tokenToSubscriptions.get(token);
  if (!subs || subs.length === 0) {
    res.status(404).json({ error: 'unknown token' });
    return;
  }
  const payload = JSON.stringify({ type: 'notify' });
  Promise.all(
    subs.map(sub =>
      webpush.sendNotification(sub, payload).catch(err => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired or invalid — could remove from map (optional, no log of token)
          return;
        }
        throw err;
      })
    )
  )
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
