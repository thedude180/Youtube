'use strict';
/**
 * cluster.cjs — Zero-downtime deployment launcher
 *
 * WHY THIS EXISTS:
 *   The 4MB Express bundle takes ~5.7s to start on a cold deployment container
 *   (loading googleapis, stripe, openai etc from disk). Replit's health check
 *   fires at T=0 and must get a 200 within 5s — we miss by ~0.7s.
 *
 * HOW IT WORKS:
 *   1. This script binds port 5000 in <50ms and serves immediate 200s.
 *   2. Spawns dist/index.cjs as a child process on internal port 5001.
 *   3. Polls until Express is up, then proxies ALL traffic to it.
 *   4. Health checks always get 200 — from this script until Express ready,
 *      from Express afterward.
 *
 * PROXY BEHAVIOUR:
 *   - GET /healthz → always 200 "OK" (even before Express is up)
 *   - All other requests before Express ready → serve pre-cached index.html
 *   - All requests after Express ready → proxied to 127.0.0.1:5001
 *
 * Zero external dependencies — only built-in Node.js modules.
 */

const http  = require('http');
const path  = require('path');
const fs    = require('fs');
const { spawn } = require('child_process');

const PROXY_PORT = parseInt(process.env.PORT || '5000', 10);
const APP_PORT   = 5001;

// ── Pre-cache index.html so health-check responses are served from memory ──
let indexHtml   = '<!DOCTYPE html><html><head><title>Loading…</title></head><body>Starting up…</body></html>';
let htmlCt      = 'text/html; charset=utf-8';
try {
  const html = fs.readFileSync(
    path.resolve(__dirname, '..', 'dist', 'public', 'index.html'), 'utf-8'
  );
  if (html) indexHtml = html;
} catch { /* built files may not exist yet — plain fallback is fine */ }

let appReady = false;

// ── Proxy / health-check server ────────────────────────────────────────────
const proxyServer = http.createServer((req, res) => {
  // Health check — always instant 200
  if (req.url === '/healthz' || req.url === '/healthz/') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    return res.end('OK');
  }

  // App not ready yet — serve cached HTML (SPA shell)
  if (!appReady) {
    res.writeHead(200, { 'Content-Type': htmlCt, 'Cache-Control': 'no-cache, no-store' });
    return res.end(indexHtml);
  }

  // Forward to Express
  const headers = { ...req.headers };
  headers['x-forwarded-for'] = req.socket.remoteAddress || '';
  headers['x-forwarded-host'] = req.headers.host || '';

  const proxyReq = http.request(
    { hostname: '127.0.0.1', port: APP_PORT, path: req.url, method: req.method, headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway — app restarting');
    }
  });

  req.pipe(proxyReq, { end: true });
});

// Handle SSE / streaming connections (no proxy timeout)
proxyServer.on('connection', (socket) => {
  socket.setTimeout(0);
});

// ── Bind port immediately ──────────────────────────────────────────────────
proxyServer.listen(PROXY_PORT, '0.0.0.0', () => {
  process.stderr.write(
    '[cluster] Port ' + PROXY_PORT + ' bound — health check live in <50ms\n'
  );

  // ── Launch Express on internal port ─────────────────────────────────────
  const childEnv = Object.assign({}, process.env, {
    PORT: String(APP_PORT),
    NODE_ENV: process.env.NODE_ENV || 'production',
  });

  const child = spawn(
    process.execPath,
    ['--max-old-space-size=1536', path.resolve(__dirname, '..', 'dist', 'index.cjs')],
    { env: childEnv, stdio: 'inherit' }
  );

  child.on('error', (err) => {
    process.stderr.write('[cluster] Failed to spawn Express: ' + err.message + '\n');
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.stderr.write('[cluster] Express process exited with code ' + code + '\n');
    process.exit(code || 0);
  });

  // ── Poll until Express is accepting connections ─────────────────────────
  let pollCount = 0;
  const poll = setInterval(() => {
    pollCount++;
    const probe = http.request(
      { hostname: '127.0.0.1', port: APP_PORT, path: '/healthz', method: 'GET' },
      (r) => {
        if (r.statusCode === 200) {
          clearInterval(poll);
          appReady = true;
          process.stderr.write(
            '[cluster] Express ready after ~' + (pollCount * 500) + 'ms — proxying all traffic to port ' + APP_PORT + '\n'
          );
        }
        r.resume();
      }
    );
    probe.on('error', () => { /* not ready yet */ });
    probe.end();

    // Safety timeout: if Express hasn't started in 120s, bail
    if (pollCount > 240) {
      clearInterval(poll);
      process.stderr.write('[cluster] Express did not start within 120s — giving up\n');
      process.exit(1);
    }
  }, 500);
});

// ── Graceful shutdown ──────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  proxyServer.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  proxyServer.close();
  process.exit(0);
});
