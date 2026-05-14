# ── Stage 1: builder ──────────────────────────────────────────────────────────
# Installs ALL dependencies (including devDeps) so the TypeScript build works.
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: runner ───────────────────────────────────────────────────────────
# Only production dependencies + the compiled bundle.  ffmpeg is installed here
# because the app shells out to it at runtime; yt-dlp is downloaded on first run
# by server/lib/ensure-binaries.ts so we do NOT pip-install it.
FROM node:20-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      curl \
      ca-certificates \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Runtime directories written by the app (vault files, stream-editor output, etc.)
RUN mkdir -p vault clips reels data/longform-tmp data/stream-editor data/studio

# Run as a non-root user for security
RUN groupadd -r app && useradd -r -g app -d /app app \
  && chown -R app:app /app
USER app

EXPOSE 5000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
  CMD curl -f http://localhost:5000/healthz || exit 1

CMD ["node", "dist/index.cjs"]
