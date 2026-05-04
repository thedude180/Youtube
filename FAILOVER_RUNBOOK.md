# CreatorOS — Render Failover Runbook

**Primary:** Replit Autoscale → `creatoros.replit.app`  
**Backup:** Render (`creatoros-backup.onrender.com`) — hot-standby, always deployed on push to `main`  
**Domain:** `etgaming247.com` via DNS (Cloudflare recommended)

---

## Architecture Overview

```
GitHub (thedude180/Youtube)
        │
        │  push to main
        ▼
.github/workflows/deploy-backup.yml
        │
        │  curl deploy hook
        ▼
Render (creatoros-backup)     ←── hot-standby, same code, same prod DB
        │
        └── /healthz   (plain 200 OK)
        └── /api/health (JSON status, DB latency, memory, binaries)

DNS: etgaming247.com
        └── CNAME → creatoros.replit.app  (primary, normal operation)
        └── CNAME → creatoros-backup.onrender.com  (failover)
```

Both the Replit and Render deployments connect to the **same PostgreSQL database**, so OAuth tokens, queue state, and channel configs are always in sync — no data loss during a flip.

---

## Required Secrets — GitHub Repository

Set these in **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `RENDER_DEPLOY_HOOK_URL` | From Render dashboard → Service → Settings → Deploy Hooks |
| `RENDER_HEALTH_URL` | `https://creatoros-backup.onrender.com` (no trailing slash) |
| `DISCORD_WEBHOOK_URL` | Discord channel webhook URL for deploy notifications |

---

## Required Env Vars — Render Dashboard

Set these in **Render → creatoros-backup → Environment**:

| Variable | Where to get it |
|----------|----------------|
| `DATABASE_URL` | Same value as Replit production DATABASE_URL |
| `OPENAI_API_KEY` | OpenAI dashboard |
| `ANTHROPIC_API_KEY` | Anthropic console |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → OAuth credentials |
| `GOOGLE_REDIRECT_URI` | `https://creatoros-backup.onrender.com/api/google/callback` |
| `TWITCH_DEV_CLIENT_ID` / `TWITCH_DEV_CLIENT_SECRET` | Twitch Dev Console |
| `DISCORD_BOT_TOKEN` / `DISCORD_CHANNEL_ID` | Discord Developer Portal |
| `TIKTOK_DEV_CLIENT_ID` / `TIKTOK_DEV_CLIENT_SECRET` | TikTok Developer Portal |
| `TWITTER_DEV_*` / `X_DEV_*` | Twitter Developer Portal |
| `KICK_DEV_CLIENT_ID` / `KICK_DEV_CLIENT_SECRET` / `KICK_STREAM_URL` | Kick Developer |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` / `GMAIL_FROM_ADDRESS` | Google Cloud Console |
| `SESSION_SECRET` | Any 64-char random string (generate once, keep stable) |
| `NODE_ENV` | `production` |

---

## Monitoring — Check Both Sides

Quick manual health check:

```bash
# Primary (Replit)
curl -s https://creatoros.replit.app/api/health | jq '{status, database, memory}'

# Backup (Render)
curl -s https://creatoros-backup.onrender.com/api/health | jq '{status, database, memory}'
```

Or run the monitoring script (after setting env vars):

```bash
export REPLIT_PRIMARY_URL=https://creatoros.replit.app
export RENDER_BACKUP_URL=https://creatoros-backup.onrender.com
bash scripts/check-failover.sh
```

Expected healthy response:

```json
{
  "status": "ok",
  "database": { "status": "healthy", "connected": true },
  "memory": { "heapUsed": 180, "heapTotal": 512 }
}
```

---

## Failover Procedure — Replit → Render

**Trigger:** Primary (`creatoros.replit.app`) is returning 5xx, timing out, or showing `status: "degraded"` for more than 2 minutes.

### Step 1 — Confirm Render is healthy

```bash
curl -s https://creatoros-backup.onrender.com/healthz
# Must return: OK
curl -s https://creatoros-backup.onrender.com/api/health | jq .status
# Must return: "ok"
```

If Render is not healthy, **do not flip DNS** — trigger a manual Render deploy first (see Step 1b below), wait for it to come up.

**Step 1b — Force a Render redeploy (if backup is stale):**
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click `creatoros-backup` → **Manual Deploy** → **Deploy latest commit**
3. Wait for the deploy to finish (watch logs, usually 3–5 min)
4. Recheck health before proceeding

### Step 2 — Flip DNS

#### Option A — Cloudflare (automated with script)

```bash
export REPLIT_PRIMARY_URL=https://creatoros.replit.app
export RENDER_BACKUP_URL=https://creatoros-backup.onrender.com
export CF_API_TOKEN=<your-cloudflare-api-token>
export CF_ZONE_ID=<zone-id-for-etgaming247.com>
export CF_RECORD_ID=<dns-record-id-for-etgaming247.com>
export CF_RECORD_NAME=etgaming247.com
export RENDER_CNAME=creatoros-backup.onrender.com
bash scripts/check-failover.sh --flip-dns
```

#### Option B — Cloudflare (manual, 2 minutes)

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select `etgaming247.com`
3. Go to **DNS → Records**
4. Find the `A` or `CNAME` record for `etgaming247.com` (and `www`)
5. Edit → change value to `creatoros-backup.onrender.com` (CNAME, proxied ON)
6. Save

#### Option C — Other registrar

Change the CNAME/A record for `etgaming247.com` to point to:
```
creatoros-backup.onrender.com
```

TTL note: If Cloudflare proxy is enabled (orange cloud), the switch is near-instant. Without proxy, wait for your DNS TTL to expire (check current TTL before flipping).

### Step 3 — Verify the flip worked

```bash
# Check DNS propagation
dig etgaming247.com CNAME +short
# Should resolve toward creatoros-backup.onrender.com

# Check the site
curl -s https://etgaming247.com/healthz
# Should return: OK
curl -s https://etgaming247.com/api/health | jq .status
# Should return: "ok"
```

### Step 4 — Note the incident

Log in the `#ops` Discord channel:
```
🔴 FAILOVER ACTIVE — etgaming247.com now serving from Render backup
Time: <timestamp>
Reason: <what failed on Replit>
Render health: ok
```

---

## Return-to-Primary Procedure — Render → Replit

**Do this only when Replit primary is confirmed healthy again.**

### Step 1 — Verify Replit is healthy

```bash
curl -s https://creatoros.replit.app/api/health | jq '{status, database, memory}'
# status must be "ok"
```

### Step 2 — Flip DNS back to Replit

#### Cloudflare (manual)
1. Cloudflare Dashboard → `etgaming247.com` → DNS
2. Edit the CNAME/A record for `etgaming247.com`
3. Change value back to `creatoros.replit.app` (or the Replit autoscale URL)
4. Save

### Step 3 — Verify

```bash
dig etgaming247.com CNAME +short
curl -s https://etgaming247.com/healthz
```

### Step 4 — Announce

```
✅ FAILOVER CLEARED — etgaming247.com restored to Replit primary
Time: <timestamp>
Duration of failover: <X minutes>
```

---

## How Hot-Standby Stays Current

Every push to `main` on GitHub triggers the Actions workflow which:
1. Hits the Render deploy hook (starts a fresh build)
2. Polls `/healthz` every 10 seconds until Render returns 200 (up to 10 min)
3. Posts a Discord notification on success or failure

Render's Docker build installs `ffmpeg` and `yt-dlp` from `apt` and `pip` — these are available in the Docker runtime unlike Replit's autoscale environment.

---

## Render Dashboard Links

- **Service:** https://dashboard.render.com/web/creatoros-backup
- **Logs:** Render Dashboard → creatoros-backup → **Logs**
- **Deploy History:** Render Dashboard → creatoros-backup → **Deploys**
- **Environment:** Render Dashboard → creatoros-backup → **Environment**

---

## Render Service Config (render.yaml)

The service is defined in `render.yaml` at the root of the repo.  
Plan: **Starter** (512 MB RAM, shared CPU) — upgrade to **Standard** if memory pressure is detected during failover.

To upgrade: Render Dashboard → creatoros-backup → **Settings** → **Instance Type** → Standard ($25/mo).

---

## Secrets Rotation

If any platform credential (YouTube, TikTok, Twitter OAuth token) is rotated:
1. Update it in Replit's Secrets panel (for the primary)
2. Update it in Render Dashboard → creatoros-backup → Environment (for the backup)
3. Redeploy Render so the new value is picked up: Manual Deploy → latest commit

---

## Escalation

| Scenario | Action |
|----------|--------|
| Both primary and backup down | Check DB connectivity first — if `DATABASE_URL` is invalid both will fail |
| Render build failing | Check Render deploy logs — usually a npm build error or OOM during build |
| DNS flip done but site still showing primary | Cloudflare proxy cache — purge cache in Cloudflare Dashboard → Caching → Purge Everything |
| OAuth redirects broken on Render | Update `GOOGLE_REDIRECT_URI` (and other platform redirect URIs) to the Render URL in each platform's developer console |
