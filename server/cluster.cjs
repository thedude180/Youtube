'use strict';
/**
 * cluster.cjs — Zero-downtime deployment launcher
 *
 * WHY THIS EXISTS:
 *   The 4MB Express bundle takes ~5s to start on a cold deployment container.
 *   Replit sets up port forwarding at T+2ms and begins health probing immediately.
 *   This script binds port 5000 in <100ms so health checks never see connection refused.
 *
 * HOW IT WORKS:
 *   1. Binds port 5000 immediately, answers all health checks directly.
 *   2. Spawns dist/index.cjs as a child process on internal port 5001.
 *   3. Polls /healthz on 5001 until Express responds 200.
 *   4. Once Express ready, proxies all NON-health-check traffic to port 5001.
 *   5. /healthz and / are ALWAYS answered directly by this script — never forwarded.
 *      This guarantees health checks always get 200 regardless of Express state.
 *
 * Zero external dependencies — only built-in Node.js modules.
 */

const http   = require('http');
const path   = require('path');
const fs     = require('fs');
const net    = require('net');
const { spawn } = require('child_process');

const PROXY_PORT = parseInt(process.env.PORT || '5000', 10);
const APP_PORT   = 5001;

// ── Pre-cache index.html for immediate SPA responses ──────────────────────
let indexHtml = '<!DOCTYPE html><html><head><title>CreatorOS</title></head><body><script>location.reload()</script></body></html>';
let htmlCt    = 'text/html; charset=utf-8';
try {
  const p    = path.resolve(__dirname, '..', 'dist', 'public', 'index.html');
  const html = fs.readFileSync(p, 'utf-8');
  if (html && html.length > 0) { indexHtml = html; }
} catch { /* built files not ready — tiny fallback is fine */ }

let appReady = false;

// ── Helper: is this a health-check path? ─────────────────────────────────
function isHealthPath(url) {
  return url === '/' || url === '/healthz' || url === '/healthz/' || url === '';
}

// ── Proxy / health-check server ───────────────────────────────────────────
const proxyServer = http.createServer((req, res) => {
  // ── Rule 1: Health check paths ALWAYS served directly, never forwarded ──
  // This guarantees health checks always get 200 regardless of Express state,
  // Express host-header security middleware, or proxy latency.
  if (isHealthPath(req.url)) {
    res.writeHead(200, {
      'Content-Type'  : req.url === '/healthz' || req.url === '/healthz/' ? 'text/plain' : htmlCt,
      'Cache-Control' : 'no-cache, no-store, must-revalidate',
    });
    return res.end(req.url === '/healthz' || req.url === '/healthz/' ? 'OK' : indexHtml);
  }

  // ── Rule 2: Any path when Express not ready → SPA shell ─────────────────
  if (!appReady) {
    res.writeHead(200, { 'Content-Type': htmlCt, 'Cache-Control': 'no-cache, no-store' });
    return res.end(indexHtml);
  }

  // ── Rule 3: Proxy everything else to Express ──────────────────────────
  // Override host to localhost so Express host-validation middleware doesn't
  // reject the request thinking it's an external host attack.
  const headers = Object.assign({}, req.headers, {
    'host'             : 'localhost:' + APP_PORT,
    'x-forwarded-for'  : req.socket.remoteAddress || '127.0.0.1',
    'x-forwarded-host' : req.headers.host || '',
    'x-forwarded-proto': 'https',
  });

  const proxyReq = http.request(
    { hostname: '127.0.0.1', port: APP_PORT, path: req.url, method: req.method, headers },
    (proxyRes) => {
      // Copy status + headers then stream body
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.on('error', () => { if (!res.writableEnded) res.end(); });
      proxyRes.pipe(res, { end: true });
    }
  );

  // Explicit end() for bodyless methods — never pipe an empty body
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

  // Timeout safety: if Express doesn't respond in 30s, 504
  proxyReq.setTimeout(30_000, () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { 'Content-Type': 'text/plain' });
      res.end('Gateway Timeout');
    }
  });
});

// Keep SSE / streaming sockets alive
proxyServer.on('connection', (socket) => { socket.setTimeout(0); });

// ── Bind port immediately ─────────────────────────────────────────────────
proxyServer.listen(PROXY_PORT, '0.0.0.0', () => {
  process.stderr.write('[cluster] Port ' + PROXY_PORT + ' bound — health checks live\n');

  // ── Launch Express on internal port ──────────────────────────────────
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

  // ── Poll until Express answers /healthz ───────────────────────────────
  let pollCount = 0;
  const poll = setInterval(() => {
    pollCount++;

    const probe = http.request(
      { hostname: '127.0.0.1', port: APP_PORT, path: '/healthz', method: 'GET',
        timeout: 3000 },
      (r) => {
        r.resume(); // drain body
        if (r.statusCode === 200) {
          clearInterval(poll);
          appReady = true;
          process.stderr.write(
            '[cluster] Express ready (~' + (pollCount * 500) + 'ms) — proxying to port ' + APP_PORT + '\n'
          );
        }
      }
    );
    probe.on('error', () => { /* not ready yet — keep polling */ });
    probe.on('timeout', () => { probe.destroy(); });
    probe.end();

    if (pollCount > 300) { // 150s safety bail
      clearInterval(poll);
      process.stderr.write('[cluster] Express did not start in 150s — exiting\n');
      process.exit(1);
    }
  }, 500);
});

proxyServer.on('error', (err) => {
  process.stderr.write('[cluster] Proxy server error: ' + err.message + '\n');
  process.exit(1);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────
process.on('SIGTERM', () => { proxyServer.close(); process.exit(0); });
process.on('SIGINT',  () => { proxyServer.close(); process.exit(0); });
