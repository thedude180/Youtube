import { db } from "../db";
import { channels } from "@shared/schema";
import { eq } from "drizzle-orm";

interface ServiceHealthResult {
  service: string;
  status: "healthy" | "degraded" | "down" | "unconfigured";
  latencyMs: number | null;
  message: string;
  checkedAt: string;
}

async function timedFetch(url: string, options: RequestInit = {}, timeoutMs = 5000): Promise<{ ok: boolean; status: number; latencyMs: number; body?: string }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const latencyMs = Date.now() - start;
    const body = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, latencyMs, body };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    if (err.name === "AbortError") {
      return { ok: false, status: 0, latencyMs, body: "Timeout" };
    }
    return { ok: false, status: 0, latencyMs, body: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function checkYouTube(): Promise<ServiceHealthResult> {
  const checkedAt = new Date().toISOString();
  try {
    const result = await timedFetch("https://www.googleapis.com/youtube/v3/i18nLanguages?part=snippet&key=_test_", {}, 5000);
    if (result.status === 400 || result.status === 403) {
      return { service: "YouTube Data API", status: "healthy", latencyMs: result.latencyMs, message: "API reachable (auth required for data)", checkedAt };
    }
    if (result.ok) {
      return { service: "YouTube Data API", status: "healthy", latencyMs: result.latencyMs, message: "API responding", checkedAt };
    }
    if (result.status === 0) {
      return { service: "YouTube Data API", status: "down", latencyMs: result.latencyMs, message: `Unreachable: ${result.body}`, checkedAt };
    }
    return { service: "YouTube Data API", status: "degraded", latencyMs: result.latencyMs, message: `HTTP ${result.status}`, checkedAt };
  } catch (err: any) {
    return { service: "YouTube Data API", status: "down", latencyMs: null, message: err.message, checkedAt };
  }
}

async function checkTwitch(): Promise<ServiceHealthResult> {
  const checkedAt = new Date().toISOString();
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) {
    return { service: "Twitch API", status: "unconfigured", latencyMs: null, message: "TWITCH_CLIENT_ID not set", checkedAt };
  }
  try {
    const result = await timedFetch("https://id.twitch.tv/oauth2/validate", {
      headers: { "Client-ID": clientId },
    }, 5000);
    if (result.status === 401 || result.status === 400) {
      return { service: "Twitch API", status: "healthy", latencyMs: result.latencyMs, message: "Auth endpoint reachable", checkedAt };
    }
    if (result.ok) {
      return { service: "Twitch API", status: "healthy", latencyMs: result.latencyMs, message: "API responding", checkedAt };
    }
    return { service: "Twitch API", status: "degraded", latencyMs: result.latencyMs, message: `HTTP ${result.status}`, checkedAt };
  } catch (err: any) {
    return { service: "Twitch API", status: "down", latencyMs: null, message: err.message, checkedAt };
  }
}

async function checkTikTok(): Promise<ServiceHealthResult> {
  const checkedAt = new Date().toISOString();
  const clientId = process.env.TIKTOK_CLIENT_ID;
  if (!clientId) {
    return { service: "TikTok API", status: "unconfigured", latencyMs: null, message: "TIKTOK_CLIENT_ID not set", checkedAt };
  }
  try {
    const result = await timedFetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials&client_key=test&client_secret=test",
    }, 5000);
    if (result.status >= 400 && result.status < 500) {
      return { service: "TikTok API", status: "healthy", latencyMs: result.latencyMs, message: "API reachable (auth required)", checkedAt };
    }
    if (result.ok) {
      return { service: "TikTok API", status: "healthy", latencyMs: result.latencyMs, message: "API responding", checkedAt };
    }
    return { service: "TikTok API", status: "degraded", latencyMs: result.latencyMs, message: `HTTP ${result.status}`, checkedAt };
  } catch (err: any) {
    return { service: "TikTok API", status: "down", latencyMs: null, message: err.message, checkedAt };
  }
}

async function checkStripe(): Promise<ServiceHealthResult> {
  const checkedAt = new Date().toISOString();
  try {
    const result = await timedFetch("https://api.stripe.com/v1/charges", {
      headers: { "Authorization": "Bearer sk_test_invalid" },
    }, 5000);
    if (result.status === 401) {
      return { service: "Stripe API", status: "healthy", latencyMs: result.latencyMs, message: "API reachable (auth required)", checkedAt };
    }
    if (result.ok) {
      return { service: "Stripe API", status: "healthy", latencyMs: result.latencyMs, message: "API responding", checkedAt };
    }
    return { service: "Stripe API", status: "degraded", latencyMs: result.latencyMs, message: `HTTP ${result.status}`, checkedAt };
  } catch (err: any) {
    return { service: "Stripe API", status: "down", latencyMs: null, message: err.message, checkedAt };
  }
}

async function checkGmail(): Promise<ServiceHealthResult> {
  const checkedAt = new Date().toISOString();
  try {
    const result = await timedFetch("https://gmail.googleapis.com/$discovery/rest?version=v1", {}, 5000);
    if (result.ok || result.status === 403) {
      return { service: "Gmail API", status: "healthy", latencyMs: result.latencyMs, message: "API reachable", checkedAt };
    }
    return { service: "Gmail API", status: "degraded", latencyMs: result.latencyMs, message: `HTTP ${result.status}`, checkedAt };
  } catch (err: any) {
    return { service: "Gmail API", status: "down", latencyMs: null, message: err.message, checkedAt };
  }
}

async function checkDiscord(): Promise<ServiceHealthResult> {
  const checkedAt = new Date().toISOString();
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return { service: "Discord Webhook", status: "unconfigured", latencyMs: null, message: "DISCORD_WEBHOOK_URL not set", checkedAt };
  }
  try {
    const result = await timedFetch("https://discord.com/api/v10/gateway", {}, 5000);
    if (result.ok) {
      return { service: "Discord API", status: "healthy", latencyMs: result.latencyMs, message: "Gateway reachable", checkedAt };
    }
    return { service: "Discord API", status: "degraded", latencyMs: result.latencyMs, message: `HTTP ${result.status}`, checkedAt };
  } catch (err: any) {
    return { service: "Discord API", status: "down", latencyMs: null, message: err.message, checkedAt };
  }
}

async function checkKick(): Promise<ServiceHealthResult> {
  const checkedAt = new Date().toISOString();
  const clientId = process.env.KICK_CLIENT_ID;
  if (!clientId) {
    return { service: "Kick API", status: "unconfigured", latencyMs: null, message: "KICK_CLIENT_ID not set", checkedAt };
  }
  try {
    const result = await timedFetch("https://kick.com/api/v2/channels", {}, 5000);
    if (result.ok || result.status === 403 || result.status === 401) {
      return { service: "Kick API", status: "healthy", latencyMs: result.latencyMs, message: "API reachable", checkedAt };
    }
    return { service: "Kick API", status: "degraded", latencyMs: result.latencyMs, message: `HTTP ${result.status}`, checkedAt };
  } catch (err: any) {
    return { service: "Kick API", status: "down", latencyMs: null, message: err.message, checkedAt };
  }
}

async function checkDatabase(): Promise<ServiceHealthResult> {
  const checkedAt = new Date().toISOString();
  const start = Date.now();
  try {
    await db.execute(new (await import("drizzle-orm")).SQL(["SELECT 1"], []));
    const latencyMs = Date.now() - start;
    return { service: "PostgreSQL", status: "healthy", latencyMs, message: "Database responding", checkedAt };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return { service: "PostgreSQL", status: "down", latencyMs, message: err.message, checkedAt };
  }
}

async function checkOpenAI(): Promise<ServiceHealthResult> {
  const checkedAt = new Date().toISOString();
  try {
    const result = await timedFetch("https://api.openai.com/v1/models", {
      headers: { "Authorization": "Bearer sk-invalid" },
    }, 5000);
    if (result.status === 401) {
      return { service: "OpenAI API", status: "healthy", latencyMs: result.latencyMs, message: "API reachable (auth required)", checkedAt };
    }
    if (result.ok) {
      return { service: "OpenAI API", status: "healthy", latencyMs: result.latencyMs, message: "API responding", checkedAt };
    }
    return { service: "OpenAI API", status: "degraded", latencyMs: result.latencyMs, message: `HTTP ${result.status}`, checkedAt };
  } catch (err: any) {
    return { service: "OpenAI API", status: "down", latencyMs: null, message: err.message, checkedAt };
  }
}

export async function runAllHealthChecks(): Promise<{
  services: ServiceHealthResult[];
  summary: { total: number; healthy: number; degraded: number; down: number; unconfigured: number };
  checkedAt: string;
}> {
  const checks = await Promise.allSettled([
    checkYouTube(),
    checkTwitch(),
    checkTikTok(),
    checkStripe(),
    checkGmail(),
    checkDiscord(),
    checkKick(),
    checkDatabase(),
    checkOpenAI(),
  ]);

  const services = checks.map(c => c.status === "fulfilled" ? c.value : {
    service: "Unknown",
    status: "down" as const,
    latencyMs: null,
    message: c.status === "rejected" ? c.reason?.message : "Check failed",
    checkedAt: new Date().toISOString(),
  });

  const summary = {
    total: services.length,
    healthy: services.filter(s => s.status === "healthy").length,
    degraded: services.filter(s => s.status === "degraded").length,
    down: services.filter(s => s.status === "down").length,
    unconfigured: services.filter(s => s.status === "unconfigured").length,
  };

  return { services, summary, checkedAt: new Date().toISOString() };
}
