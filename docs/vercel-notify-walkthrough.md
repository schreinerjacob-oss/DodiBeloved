# Get push notifications running on Vercel

Follow these steps in order. Use the VAPID keys generated for this project (they were printed in the terminal; also in the chat where you asked for this walkthrough).

---

## Step 1: Create Upstash Redis and connect it

1. Open [Vercel Dashboard](https://vercel.com/dashboard) and select your **Dodi** project.
2. Go to the **Storage** tab (or **Integrations** → search for Redis).
3. Click **Create Database** or **Add Integration** and choose **Upstash Redis** (from the [Marketplace](https://vercel.com/marketplace?category=storage&search=redis) if needed).
4. Create a new database (e.g. name: `dodi-notify`), same region as your app if possible.
5. Open the new store and click **Connect Project** → select this Dodi project.  
   This adds `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to the project automatically.

---

## Step 2: Add runtime environment variables (VAPID)

1. In the project, go to **Settings** → **Environment Variables**.
2. Add these two variables. Enable them for **Production** and **Preview** (and Development if you use Vercel dev).

| Name | Value | Environments |
|------|--------|----------------|
| `VAPID_PUBLIC_KEY` | *(paste the Public Key from below)* | Production, Preview |
| `VAPID_PRIVATE_KEY` | *(paste the Private Key from below)* | Production, Preview |

Use the exact keys you were given (no extra spaces or line breaks).

---

## Step 3: Add build environment variables (client)

The frontend is built with Vite and needs the notify API URL and public key at **build time**. Add these in the same **Environment Variables** page and **enable them for the Build** phase.

| Name | Value | Environments (enable Build) |
|------|--------|-----------------------------|
| `VITE_NOTIFY_SERVER_URL` | `https://YOUR_VERCEL_APP.vercel.app/api` | Production (and Preview if you want notify on previews) |
| `VITE_VAPID_PUBLIC_KEY` | *Same value as `VAPID_PUBLIC_KEY`* | Production (and Preview if needed) |

Replace `YOUR_VERCEL_APP` with your actual Vercel project URL (e.g. from the project’s **Domains** or deployment URL, like `dodi-abc123`).

---

## Step 4: Redeploy

1. Go to the **Deployments** tab.
2. Open the **⋯** menu on the latest deployment and choose **Redeploy** (or push a new commit).
3. Redeploy **after** saving the build env vars so the new build picks up `VITE_NOTIFY_SERVER_URL` and `VITE_VAPID_PUBLIC_KEY`.

---

## Step 5: Test

1. Open the deployed app (production URL).
2. Log in and ensure you’re paired with your partner (or use two devices/browsers).
3. Allow notifications when the app prompts.
4. From the other device/context, send a message or start a call; you should get a push notification.

If notifications don’t appear, check the browser console and that the service worker is registered; ensure both devices have allowed notifications for the site.

---

## Quick reference

- **Redis**: Upstash Redis store → Connect Project (adds `UPSTASH_REDIS_REST_*`).
- **Runtime**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (Production + Preview).
- **Build**: `VITE_NOTIFY_SERVER_URL`, `VITE_VAPID_PUBLIC_KEY` (same public key; URL = `https://<app>.vercel.app/api`).
- **Redeploy** after changing build env vars.
