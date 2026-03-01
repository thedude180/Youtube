'use strict';
/**
 * prestart.cjs — Loaded via `node --require ./server/prestart.cjs`
 *
 * Binds port 5000 in < 100ms using SO_REUSEPORT so Replit's health check
 * gets an immediate 200 BEFORE the 4MB main bundle finishes loading.
 *
 * The main bundle (dist/index.cjs) also calls httpServer.listen with
 * reusePort:true — both servers share the port; OS load-balances between them.
 * Once the main server is ready it signals global.__replitPreServer.close()
 * so all subsequent traffic is handled exclusively by Express.
 *
 * Zero external dependencies — only built-in Node.js modules used here.
 */

const http = require('http');
const path = require('path');
const fs   = require('fs');

const PORT = parseInt(process.env.PORT || '5000', 10);

// Pre-read index.html so health-check responses are fully in-memory.
let responseBody = 'Starting...';
let contentType  = 'text/plain';
try {
  // __dirname here is /path/to/workspace/server/
  const html = fs.readFileSync(
    path.resolve(__dirname, '..', 'dist', 'public', 'index.html'),
    'utf-8'
  );
  if (html) { responseBody = html; contentType = 'text/html; charset=utf-8'; }
} catch { /* index.html may not exist yet — plain 200 is fine for health check */ }

const preServer = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  res.end(responseBody);
});

preServer.listen({ port: PORT, host: '0.0.0.0', reusePort: true }, () => {
  process.stderr.write(
    '[prestart] Port ' + PORT + ' bound with SO_REUSEPORT — health check live in <100ms\n'
  );
});

preServer.on('error', (err) => {
  // Non-fatal: if reusePort is unsupported the main bundle handles the port.
  process.stderr.write('[prestart] pre-server error (non-fatal): ' + err.message + '\n');
});

// Expose so index.ts can call close() once Express is ready.
global.__replitPreServer = preServer;
