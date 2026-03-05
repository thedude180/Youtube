import Stripe from 'stripe';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const connectorName = 'stripe';
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  // AUDIT FIX: Validate REPLIT_CONNECTORS_HOSTNAME before URL construction to prevent "https://undefined/..." crash
  if (!hostname) throw new Error("REPLIT_CONNECTORS_HOSTNAME is not set");
  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', connectorName);
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken
    }
  });

  // AUDIT FIX: Check response.ok before parsing — non-200 responses return error JSON, not connection data
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
