'use strict';
/**
 * prestart.cjs — DISABLED
 *
 * Previous versions of this file bound port 5000 early to pass Replit's
 * health check before the main bundle loaded. This caused EADDRINUSE when
 * the main Express server tried to bind the same port.
 *
 * The deployment run command no longer uses --require ./server/prestart.cjs.
 * Express binds port 5000 directly and responds to health checks immediately
 * via the GET / and GET /healthz routes registered at the top of index.ts.
 *
 * This file is kept as a reference but does nothing.
 */
