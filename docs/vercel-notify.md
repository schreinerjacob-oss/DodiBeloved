# Vercel Push Notify API (Beta)

The Dodi app can send push notifications (e.g. "New message from your partner", "Dodi is calling") when deployed on Vercel. The client talks to `/api/register` and `/api/notify`; token-to-subscription data is stored in **Upstash Redis** (via Vercel Storage / Marketplace).

---

## Quick checklist (do this in Vercel)

1. **Storage** — Create an **Upstash Redis** store (Vercel Marketplace → Redis), then **Connect Project** so `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are added.
2. **Runtime env** — In **Settings → Environment Variables**, add:
   - `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (from `npx web-push generate-vapid-keys`) for **Production** and **Preview**.
3. **Build env** — Add for **Build** (so the client gets them):
   - `VITE_NOTIFY_SERVER_URL` = `https://<your-app>.vercel.app/api`
   - `VITE_VAPID_PUBLIC_KEY` = same value as `VAPID_PUBLIC_KEY`
4. **Redeploy** — Trigger a new deployment after setting build env vars so the SPA is built with the correct notify URL and VAPID key.

---

## 1. Create and link Upstash Redis

1. In the [Vercel Dashboard](https://vercel.com/dashboard), open your project.
2. Go to **Storage** (or **Integrations** / Marketplace).
3. Add **Upstash Redis** (e.g. from [Vercel Marketplace](https://vercel.com/marketplace?category=storage&search=redis)).
4. Create the database and name it (e.g. `dodi-notify`).
5. **Connect Project** to this app. That adds `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to the project. The API routes use `Redis.fromEnv()` and need these variables.

## 2. Generate and set VAPID keys

VAPID keys are used for Web Push. Generate a pair once and reuse them for this app:

```bash
npx web-push generate-vapid-keys
```

You will get a **public** and **private** key (base64url).

In the project’s **Settings → Environment Variables**, add:

| Name               | Value        | Environment   |
|--------------------|-------------|---------------|
| `VAPID_PUBLIC_KEY` | (public key) | Production, Preview |
| `VAPID_PRIVATE_KEY`| (private key)| Production, Preview |

Use the same values for Production and Preview so the same keys work across deployments.

## 3. Build-time env vars (client)

The SPA needs the notify API base URL and the public VAPID key at **build** time. Add these in **Settings → Environment Variables** and enable them for the **Build** phase (or at least for builds that deploy the frontend):

| Name                     | Value                                                                 | Environment   |
|--------------------------|-----------------------------------------------------------------------|---------------|
| `VITE_NOTIFY_SERVER_URL` | `https://<your-vercel-app>.vercel.app/api` (no trailing slash)        | Production (and Preview if desired) |
| `VITE_VAPID_PUBLIC_KEY`  | Same string as `VAPID_PUBLIC_KEY` (the public key from step 2)       | Production (and Preview if desired) |

Replace `<your-vercel-app>` with your actual Vercel project URL (e.g. `dodi-xyz123`).

After changing these, **redeploy** so the new build gets the correct `VITE_*` values.

## Preview deployments

For branch/preview deployments, you can set `VITE_NOTIFY_SERVER_URL` to the preview URL (e.g. `https://dodi-xxx-preview-team.vercel.app/api`) in Preview environment variables so each branch uses its own notify API. Use the same `VITE_VAPID_PUBLIC_KEY` and runtime `VAPID_*` keys for simplicity.

## Summary

- **Redis**: Create Upstash Redis store, connect to project (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` auto-injected).
- **Runtime**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (Production + Preview).
- **Build**: `VITE_NOTIFY_SERVER_URL`, `VITE_VAPID_PUBLIC_KEY` (Production, and Preview if you want notify on previews).

No client code changes are required; the app already uses `getNotifyServerUrl()` and appends `/register` and `/notify`.
