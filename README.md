# CreatorOS - YouTube Team In A Box


## Quick Start (Lite Mode)

Running into memory issues or quota limits? Use **Lite Mode** to start only essential services:

```bash
# In your .env file:
LITE_MODE=true

# Or pass as env var:
LITE_MODE=true npm run dev
```

**Lite Mode** starts the web server, database, auth, and all API routes — but skips the 50+ background engines (autopilot, AI intelligence, live streaming, content grinder, etc.). This reduces RAM usage by ~80% and eliminates YouTube API quota drain from background services.

**When to use Lite Mode:**
- Replit free tier (RAM limit ~512MB)
- Local development / debugging
- First-time setup / testing

**When to use Full Mode (LITE_MODE=false):**
- Production deployment with adequate resources (2GB+ RAM)
- Running the full autonomous content pipeline

An AI-powered multi-platform content management and live streaming OS for gaming creators.

## Tech Stack

- **Frontend**: React + Vite, Tailwind CSS, shadcn/ui, TanStack Query
- **Backend**: Express.js, Drizzle ORM
- **Database**: PostgreSQL
- **AI**: OpenAI (GPT-4o-mini), Anthropic (Claude)
- **Payments**: Stripe

---

## Running on Replit (recommended for development)

Click **Run** — the app starts automatically.  All secrets are managed through Replit's Secrets panel.  No `.env` file needed.

---

## Running outside Replit

### Prerequisites

- Node.js v20+
- PostgreSQL 15+
- ffmpeg (installed by the Docker image automatically; install manually for bare-metal)

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/creatoros.git
cd creatoros
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in at minimum:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **yes** | PostgreSQL connection string |
| `SESSION_SECRET` | **yes** | Random string ≥ 32 chars |
| `APP_URL` | **yes** | Public URL of this server (e.g. `https://your-domain.com`) |
| `GOOGLE_CLIENT_ID` / `_SECRET` | for YouTube | Google Cloud Console credentials |
| `STRIPE_SECRET_KEY` | for billing | Stripe secret key |
| `GMAIL_*` | for emails | Gmail OAuth refresh-token credentials |

All other variables are optional and gracefully degrade if absent.

### 3. Push the database schema

```bash
npm run db:push
```

### 4. Run the development server

```bash
npm run dev
```

The app is available at `http://localhost:5000`.

### 5. Build and run for production

```bash
npm run build
npm start
```

---

## Docker

### Quick start (Docker Compose)

```bash
cp .env.example .env
# Edit .env — set SESSION_SECRET and any platform API keys
docker compose up --build
```

The web app starts on `http://localhost:5000` backed by a local PostgreSQL container.  `DATABASE_URL` is set automatically by Compose — do not set it in `.env` when using Compose.

### Build the image manually

```bash
docker build -t creatoros .
docker run -p 5000:5000 \
  -e DATABASE_URL=postgresql://... \
  -e SESSION_SECRET=... \
  -e APP_URL=https://your-domain.com \
  creatoros
```

The container runs as a **non-root user** and exposes `/healthz` for health checks.

---

## Deploying to Render

1. Fork this repo and connect it in the [Render dashboard](https://render.com).
2. Select **New → Web Service → Docker**.
3. Render reads `render.yaml` automatically.  Set the `sync: false` env vars in the Render dashboard.  At minimum:
   - `DATABASE_URL` — your Render PostgreSQL connection string
   - `APP_URL` — your Render service URL (e.g. `https://creatoros.onrender.com`)
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   - `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
4. The health check uses `/healthz`.

---

## Object Storage (optional)

By default, vault files, clips, and reels are stored on local disk (`vault/` directory).

To use S3-compatible object storage (Cloudflare R2, AWS S3, MinIO, Backblaze B2), set these four env vars:

```
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<key-id>
S3_SECRET_ACCESS_KEY=<secret>
S3_BUCKET=creatoros-vault
```

The server selects the S3 backend automatically when all four are present.

---

## Project Structure

```
creatoros/
├── client/               # React frontend
│   └── src/
│       ├── components/   # Reusable UI components
│       ├── hooks/        # Custom React hooks
│       ├── lib/          # Utility functions
│       └── pages/        # Page components
├── server/               # Express.js backend
│   ├── lib/              # Shared utilities
│   │   ├── app-url.ts    # Canonical public URL (APP_URL → Replit → localhost)
│   │   ├── env-validator.ts  # Startup env validation
│   │   └── storage-adapter.ts  # Local disk / S3 adapter
│   ├── routes/           # API route handlers
│   └── *.ts              # Engine modules (autopilot, pipelines, etc.)
├── shared/               # Shared types and schemas
├── Dockerfile            # Multi-stage, non-root, HEALTHCHECK
├── docker-compose.yml    # Web + Postgres for local prod testing
├── render.yaml           # Render deployment config
└── .env.example          # All supported env vars with descriptions
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (frontend + backend) |
| `npm run build` | Build for production |
| `npm start` | Run production build |
| `npm run check` | TypeScript type checking |
| `npm run db:push` | Push schema changes to database |

## Platform Integrations

CreatorOS connects to these platforms via OAuth:

- YouTube (content publishing + analytics)
- Twitch (live streaming)
- Kick (live streaming)
- TikTok (short-form video)
- X / Twitter (text + media posts)
- Discord (community announcements)

## License

MIT
