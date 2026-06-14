/**
 * google-quota-sync.ts
 *
 * Pulls real YouTube API quota consumption from Google Cloud Monitoring API
 * and calibrates the internal quota tracker with the authoritative number.
 *
 * Requires GOOGLE_CLOUD_MONITORING_KEY env var containing the full JSON of a
 * Google Cloud service account key with the "Monitoring Viewer" role.
 *
 * How to set up:
 *   1. Google Cloud Console → IAM & Admin → Service Accounts → Create
 *   2. Grant "Monitoring Viewer" role
 *   3. Keys tab → Add Key → JSON → download
 *   4. Paste the entire JSON as GOOGLE_CLOUD_MONITORING_KEY secret
 *
 * The Google Cloud Monitoring data is ~1–2 hours delayed, so calibration
 * only increases the internal counter (never decreases it), preserving
 * real-time tracking accuracy.
 */

import crypto from "crypto";
import { createLogger } from "../lib/logger";
import { calibrateQuotaUsage, getPacificDate } from "./youtube-quota-tracker";

const logger = createLogger("google-quota-sync");
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // sync every hour

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  token_uri: string;
}

interface SyncState {
  lastSyncAt: string | null;
  lastSyncValue: number | null;
  lastSyncError: string | null;
  configured: boolean;
}

let _state: SyncState = {
  lastSyncAt: null,
  lastSyncValue: null,
  lastSyncError: null,
  configured: false,
};

let _cachedToken: { token: string; expiresAt: number } | null = null;

function getServiceAccountKey(): ServiceAccountKey | null {
  const raw = process.env.GOOGLE_CLOUD_MONITORING_KEY;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServiceAccountKey;
  } catch {
    logger.warn("[QuotaSync] GOOGLE_CLOUD_MONITORING_KEY is not valid JSON — check formatting");
    return null;
  }
}

async function getAccessToken(sa: ServiceAccountKey): Promise<string | null> {
  if (_cachedToken && Date.now() < _cachedToken.expiresAt - 5 * 60_000) {
    return _cachedToken.token;
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/monitoring.read",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })).toString("base64url");

    const signingInput = `${header}.${payload}`;
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(signingInput);
    const signature = sign.sign(sa.private_key, "base64url");
    const jwt = `${signingInput}.${signature}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      logger.warn(`[QuotaSync] Token exchange failed ${tokenRes.status}: ${body.slice(0, 200)}`);
      return null;
    }

    const json = await tokenRes.json() as any;
    _cachedToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
    return json.access_token;
  } catch (err: any) {
    logger.warn(`[QuotaSync] getAccessToken error: ${err?.message}`);
    return null;
  }
}

async function fetchRealQuotaUnits(sa: ServiceAccountKey): Promise<number | null> {
  const token = await getAccessToken(sa);
  if (!token) return null;

  try {
    // Build interval: from midnight Pacific today to now
    const pacificDate = getPacificDate(); // YYYY-MM-DD
    const ptOffsetHours = new Date()
      .toLocaleString("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "short" })
      .includes("PDT") ? 7 : 8;
    const midnightUTC = new Date(`${pacificDate}T00:00:00.000Z`);
    midnightUTC.setUTCHours(ptOffsetHours, 0, 0, 0); // shift from local midnight to UTC midnight

    const params = new URLSearchParams({
      // YouTube Data API quota usage metric (rate quota = units/day)
      filter: [
        'metric.type="serviceruntime.googleapis.com/quota/rate/net_usage"',
        'resource.labels.service="youtube.googleapis.com"',
      ].join(" AND "),
      "interval.startTime": midnightUTC.toISOString(),
      "interval.endTime": new Date().toISOString(),
      // Collapse all quota metric dimensions into one daily total
      "aggregation.alignmentPeriod": "86400s",
      "aggregation.perSeriesAligner": "ALIGN_SUM",
      "aggregation.crossSeriesReducer": "REDUCE_SUM",
      "aggregation.groupByFields": [],
      view: "FULL",
    } as any);

    const url = `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(sa.project_id)}/timeSeries?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.warn(`[QuotaSync] Monitoring API ${res.status}: ${body.slice(0, 300)}`);
      return null;
    }

    const data = await res.json() as any;
    const timeSeries: any[] = data.timeSeries ?? [];

    if (timeSeries.length === 0) {
      // No data = either no API calls today, metric path wrong, or data not yet propagated
      logger.info("[QuotaSync] No quota time series returned — 0 units or data not yet propagated (1–2h delay)");
      return 0;
    }

    // Sum all points across all matching series
    let total = 0;
    for (const series of timeSeries) {
      for (const point of (series.points ?? [])) {
        const v = point?.value;
        if (v?.int64Value !== undefined) total += parseInt(v.int64Value, 10);
        else if (v?.doubleValue !== undefined) total += Math.round(v.doubleValue);
      }
    }

    return total;
  } catch (err: any) {
    logger.warn(`[QuotaSync] fetchRealQuotaUnits error: ${err?.message}`);
    return null;
  }
}

export async function runQuotaSync(): Promise<SyncState> {
  const sa = getServiceAccountKey();
  if (!sa) {
    _state = { ..._state, configured: false, lastSyncError: "GOOGLE_CLOUD_MONITORING_KEY not set" };
    return _state;
  }
  _state.configured = true;

  const realUnits = await fetchRealQuotaUnits(sa);
  if (realUnits === null) {
    _state.lastSyncError = "Monitoring API call failed — check logs";
    return _state;
  }

  // Find the connected channel's userId to calibrate
  try {
    const { db } = await import("../db");
    const { channels } = await import("@shared/schema");
    const { isNotNull } = await import("drizzle-orm");
    const [ch] = await db.select({ userId: channels.userId })
      .from(channels)
      .where(isNotNull(channels.accessToken))
      .limit(1);

    if (!ch) {
      _state.lastSyncError = "No connected YouTube channel found";
      return _state;
    }

    await calibrateQuotaUsage(ch.userId, realUnits);
    _state = {
      configured: true,
      lastSyncAt: new Date().toISOString(),
      lastSyncValue: realUnits,
      lastSyncError: null,
    };
    logger.info(`[QuotaSync] Calibrated → ${realUnits} units from Google Cloud Monitoring`);
  } catch (err: any) {
    _state.lastSyncError = err?.message ?? "Calibration write failed";
  }

  return _state;
}

export function getQuotaSyncState(): SyncState {
  return { ..._state };
}

/**
 * Public entry point for the quota tracker to call at startup without creating
 * a circular module-level import.  Called via dynamic import() so it resolves
 * after both modules have fully initialised.
 *
 * Returns the number of YouTube API units Google Cloud Monitoring reports for
 * today, or null when:
 *   - GOOGLE_CLOUD_MONITORING_KEY is not set
 *   - The Monitoring API is unreachable / returns an error
 *   - Data has not yet propagated (Google Monitoring has a 1–2h delay)
 *
 * Callers must treat null as "unavailable, fall back to DB" — never as 0.
 */
export async function fetchRealQuotaUnitsPublic(): Promise<number | null> {
  const sa = getServiceAccountKey();
  if (!sa) return null;
  return fetchRealQuotaUnits(sa);
}

export function initGoogleQuotaSync(): void {
  const key = process.env.GOOGLE_CLOUD_MONITORING_KEY;
  if (!key) {
    logger.info("[QuotaSync] GOOGLE_CLOUD_MONITORING_KEY not set — Google quota calibration disabled");
    return;
  }

  _state.configured = true;
  logger.info("[QuotaSync] Google Cloud Monitoring integration active — first sync in 3 min, then hourly");

  // First sync at T+3min (after core services settle)
  setTimeout(async () => {
    const result = await runQuotaSync();
    if (result.lastSyncError) logger.warn(`[QuotaSync] First sync error: ${result.lastSyncError}`);
  }, 3 * 60_000);

  // Hourly thereafter
  setInterval(async () => {
    const result = await runQuotaSync();
    if (result.lastSyncError) logger.warn(`[QuotaSync] Sync error: ${result.lastSyncError}`);
  }, SYNC_INTERVAL_MS);
}
