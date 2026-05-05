import Stripe from 'stripe';

let connectionSettings: any;

/**
 * Resolve Stripe credentials.
 *
 * On Replit the credentials come from the Replit connector proxy (no env vars needed).
 * Outside Replit (Docker, Render, bare VM) they come from STRIPE_SECRET_KEY /
 * STRIPE_PUBLISHABLE_KEY environment variables set in the host's secret store.
 */
async function getCredentials() {
  // ── Outside Replit: use env vars directly ────────────────────────────────────
  const isOnReplit = !!(
    process.env.REPLIT_CONNECTORS_HOSTNAME &&
    (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL)
  );

  if (!isOnReplit) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "";
    if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required outside Replit");
    return { secretKey, publishableKey };
  }

  // ── On Replit: use connector proxy ───────────────────────────────────────────
  if (connectionSettings) {
    const s = connectionSettings.settings;
    if (s?.publishable && s?.secret) {
      return { publishableKey: s.publishable, secretKey: s.secret };
    }
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  if (!hostname) throw new Error("REPLIT_CONNECTORS_HOSTNAME is not set");

  const connectorName = 'stripe';
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', connectorName);
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json', 'X_REPLIT_TOKEN': xReplitToken }
  });

  if (!response.ok) {
    throw new Error(`Stripe credentials fetch failed: HTTP ${response.status} from connectors service`);
  }
  const data = await response.json();
  connectionSettings = data.items?.[0];

  if (!connectionSettings || (!connectionSettings.settings.publishable || !connectionSettings.settings.secret)) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }

  return {
    publishableKey: connectionSettings.settings.publishable,
    secretKey: connectionSettings.settings.secret,
  };
}

export async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, {
    apiVersion: '2025-11-17.clover' as any,
  });
}

export async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}

// AUDIT FIX: Use Promise-initializer pattern to prevent concurrent calls from each initializing a separate instance
let stripeSyncPromise: Promise<any> | null = null;

export async function getStripeSync() {
  if (!stripeSyncPromise) {
    stripeSyncPromise = (async () => {
      const { StripeSync } = await import('stripe-replit-sync');
      const secretKey = await getStripeSecretKey();

      const noop = () => {};
      const silentLogger = { info: noop, warn: noop, error: noop, debug: noop, trace: noop, fatal: noop, child: () => silentLogger };
      return new StripeSync({
        poolConfig: {
          connectionString: process.env.DATABASE_URL!,
          max: 2,
        },
        stripeSecretKey: secretKey,
        logger: silentLogger,
      });
    })();
  }
  return stripeSyncPromise;
}
