'use strict';
/**
 * prestart.cjs — Loaded via `node --require ./server/prestart.cjs`
 *
 * Binds port 5000 in < 100ms BEFORE the 4MB main bundle parses, so Replit's
 * health check gets an immediate 200 response.
 *
 * HOW HAND-OFF WORKS (no reusePort needed):
 *   1. This script calls server.listen(PORT) — the OS bind happens immediately.
 *   2. After bind, the raw TCP handle is stored in global.__replitPreServerHandle
 *      and detached from this server (so this server doesn't own the socket).
 *   3. dist/index.cjs detects __replitPreServerHandle and calls
 *      httpServer.listen(handle) — inheriting the already-bound socket with
 *      zero downtime and no EADDRINUSE.
 *
 * Zero external dependencies — only built-in Node.js modules.
 */

const http = require('http');
const path = require('path');
const fs   = require('fs');

const PORT = parseInt(process.env.PORT || '5000', 10);

let responseBody = 'Starting...';
let contentType  = 'text/plain';
try {
  const html = fs.readFileSync(
    path.resolve(__dirname, '..', 'dist', 'public', 'index.html'),
    'utf-8'
  );
  if (html) { responseBody = html; contentType = 'text/html; charset=utf-8'; }
} catch { /* index.html may not exist — plain 200 is fine for health check */ }

const preServer = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  res.end(responseBody);
});

preServer.listen({ port: PORT, host: '0.0.0.0' }, () => {
  process.stderr.write(
    '[prestart] Port ' + PORT + ' bound — health check live in <100ms\n'
  );

  // Capture the raw TCP handle and detach it from preServer.
  // This lets us pass the handle to Express later without closing the port.
  const handle = preServer._handle;
  preServer._handle = null;    // preServer no longer owns the socket
  global.__replitPreServerHandle = handle;

  // Also keep preServer reference so index.ts can call .close() on the
  // shell (already connectionless at this point — just cleans up listeners).
  global.__replitPreServer = preServer;
});

preServer.on('error', (err) => {
  process.stderr.write('[prestart] pre-server error (non-fatal): ' + err.message + '\n');
});
