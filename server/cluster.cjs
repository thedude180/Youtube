'use strict';
/**
 * cluster.cjs — Zero-downtime deployment launcher
 *
 * WHY THIS EXISTS:
 *   The 4MB Express bundle takes ~5s to cold-start (loading googleapis, stripe,
 *   openai etc from disk). Replit begins health-probing at T+2ms. This script
 *   binds port 5000 in <500ms so health checks never see a connection refused.
 *
 * REQUEST ROUTING:
 *   Before Express ready:
 *     GET /healthz  → 200 "OK"       (always immediate, from this process)
 *     GET *         → 200 index.html  (SPA shell served from memory)
 *
 *   After Express ready:
 *     GET /healthz  → 200 "OK"       (always immediate, NEVER proxied)
 *     GET *         → proxied to Express on port 5001
 *
 * Zero external deps — built-in Node.js modules only.
 */

const http           = require('http');
const path           = require('path');
const fs             = require('fs');
const { spawn }      = require('child_process');

const PROXY_PORT = parseInt(process.env.PORT || '5000', 10);
const APP_PORT   = 5001;

// ── Pre-cache index.html for pre-ready responses ──────────────────────────
let indexHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>CreatorOS</title></head><body><p>Starting…</p></body></html>';
let htmlCt    = 'text/html; charset=utf-8';
try {
  const p    = path.resolve(__dirname, '..', 'dist', 'public', 'index.html');
  const html = fs.readFileSync(p, 'utf-8');
  if (html && html.length > 100) { indexHtml = html; }
} catch { /* built files may not exist yet — tiny fallback is fine */ }

let appReady = false;

// ── Helper: strip query-string before comparing path ─────────────────────
function parsePath(url) {
  return (url || '/').split('?')[0].split('#')[0] || '/';
}

// ── Shared proxy helper ───────────────────────────────────────────────────
function proxyToExpress(req, res) {
  const headers = Object.assign({}, req.headers, {
    'host'             : 'localhost:' + APP_PORT,
    'x-forwarded-for'  : req.socket.remoteAddress || '127.0.0.1',
    'x-forwarded-host' : req.headers.host || '',
    'x-forwarded-proto': 'https',
  });

  const proxyReq = http.request(
    { hostname: '127.0.0.1', port: APP_PORT, path: req.url, method: req.method, headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.on('error', () => { if (!res.writableEnded) res.end(); });
      proxyRes.pipe(res, { end: true });
    }
  );

  // GET/HEAD/DELETE have no body — use explicit end(), never pipe empty body
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE') {
    proxyReq.end();
  } else {
    req.on('error', () => proxyReq.destroy());
    req.pipe(proxyReq, { end: true });
  }

  proxyReq.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway');
    }
  });

  proxyReq.setTimeout(30_000, () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { 'Content-Type': 'text/plain' });
      res.end('Gateway Timeout');
    }
  });
}

// ── Proxy / health-check server ───────────────────────────────────────────
const proxyServer = http.createServer((req, res) => {
  const urlPath = parsePath(req.url);

  // /healthz — ALWAYS answered instantly by this process, never forwarded.
  // This is the one path that must NEVER timeout under any circumstances.
  if (urlPath === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    return res.end('OK');
  }

  // Before Express is ready — serve SPA shell for all paths (instant 200)
  if (!appReady) {
    res.writeHead(200, { 'Content-Type': htmlCt, 'Cache-Control': 'no-cache, no-store' });
    return res.end(indexHtml);
  }

  // Express is ready — proxy everything (including /) to the real app
  proxyToExpress(req, res);
});

// Keep SSE / streaming sockets alive indefinitely
proxyServer.on('connection', (socket) => { socket.setTimeout(0); });

proxyServer.on('error', (err) => {
  process.stderr.write('[cluster] Proxy server error: ' + err.message + '\n');
  process.exit(1);
});

// ── Bind port immediately ─────────────────────────────────────────────────
proxyServer.listen(PROXY_PORT, '0.0.0.0', () => {
  process.stderr.write('[cluster] Port ' + PROXY_PORT + ' bound — health checks live\n');

  // ── Launch Express on internal port 5001 ─────────────────────────────
  const childEnv = Object.assign({}, process.env, {
    PORT    : String(APP_PORT),
    NODE_ENV: process.env.NODE_ENV || 'production',
  });

  const child = spawn(
    process.execPath,
    ['--max-old-space-size=1536', path.resolve(__dirname, '..', 'dist', 'index.cjs')],
    { env: childEnv, stdio: 'inherit' }
  );

  child.on('error', (err) => {
    process.stderr.write('[cluster] Spawn error: ' + err.message + '\n');
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.stderr.write('[cluster] Express exited with code ' + code + '\n');
    process.exit(code || 0);
  });

  // ── Poll /healthz on port 5001 until Express answers 200 ─────────────
  let polls = 0;
  const poll = setInterval(() => {
    polls++;
    const probe = http.request(
      { hostname: '127.0.0.1', port: APP_PORT, path: '/healthz', method: 'GET', timeout: 3000 },
      (r) => {
        r.resume();
        if (r.statusCode === 200) {
          clearInterval(poll);
          appReady = true;
          process.stderr.write(
            '[cluster] Express ready (~' + (polls * 500) + 'ms) — proxying traffic to port ' + APP_PORT + '\n'
          );
        }
      }
    );
    probe.on('error', () => {});
    probe.on('timeout', () => { probe.destroy(); });
    probe.end();

    if (polls > 300) {
      clearInterval(poll);
      process.stderr.write('[cluster] Express did not start within 150s\n');
      process.exit(1);
    }
  }, 500);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────
process.on('SIGTERM', () => { proxyServer.close(); process.exit(0); });
process.on('SIGINT',  () => { proxyServer.close(); process.exit(0); });
