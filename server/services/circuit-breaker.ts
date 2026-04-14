import { createLogger } from "../lib/logger";

const logger = createLogger("circuit-breaker");
type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxAttempts?: number;
}

interface BreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number | null;
  lastSuccess: number | null;
  totalRequests: number;
  totalFailures: number;
}

class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private successes = 0;
  private lastFailure: number | null = null;
  private lastSuccess: number | null = null;
  private totalRequests = 0;
  private totalFailures = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxAttempts: number;

  constructor(
    public readonly name: string,
    options: CircuitBreakerOptions = {}
  ) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30000;
    this.halfOpenMaxAttempts = options.halfOpenMaxAttempts ?? 2;
  }

  async execute<T>(fn: () => Promise<T>, fallback?: () => T): Promise<T> {
    this.totalRequests++;

    if (this.state === "open") {
      if (Date.now() - (this.lastFailure || 0) > this.resetTimeoutMs) {
        this.state = "half-open";
        this.failures = 0;
      } else {
        if (fallback) return fallback();
        throw new Error(`Circuit breaker [${this.name}] is OPEN — service unavailable`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback) return fallback();
      throw error;
    }
  }

  private onSuccess() {
    this.successes++;
    this.lastSuccess = Date.now();
    if (this.state === "half-open") {
      if (this.successes >= this.halfOpenMaxAttempts) {
        this.state = "closed";
        this.failures = 0;
        this.successes = 0;
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure() {
    this.failures++;
    this.totalFailures++;
    this.lastFailure = Date.now();
    this.successes = 0;
    if (this.failures >= this.failureThreshold) {
      this.state = "open";
      logger.warn(`[CircuitBreaker] ${this.name} tripped to OPEN after ${this.failures} failures`);
    }
  }

  getStats(): BreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
    };
  }

  getStatus(): "healthy" | "degraded" | "down" {
    if (this.state === "closed") return "healthy";
    if (this.state === "half-open") return "degraded";
    return "down";
  }

  reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.successes = 0;
  }
}

const breakers = new Map<string, CircuitBreaker>();

export function getBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
  let breaker = breakers.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker(name, options);
    breakers.set(name, breaker);
  }
  return breaker;
}

export function getSubServiceBreaker(service: string, operation: string, options?: CircuitBreakerOptions): CircuitBreaker {
  const key = `${service}:${operation}`;
  return getBreaker(key, options ?? { failureThreshold: 3, resetTimeoutMs: 30000 });
}

export function getAllBreakerStats(): Record<string, BreakerStats & { name: string }> {
  const stats: Record<string, BreakerStats & { name: string }> = {};
  for (const [name, breaker] of Array.from(breakers)) {
    stats[name] = { name, ...breaker.getStats() };
  }
  return stats;
}

export function getAllBreakerStatuses(): Array<{ name: string; status: string; state: CircuitState }> {
  return Array.from(breakers).map(([name, breaker]) => ({
    name,
    status: breaker.getStatus(),
    state: breaker.getStats().state,
  }));
}

export function getServiceBreakerStates(service: string): Array<{ operation: string; status: string; state: CircuitState; stats: BreakerStats }> {
  const results: Array<{ operation: string; status: string; state: CircuitState; stats: BreakerStats }> = [];
  for (const [name, breaker] of breakers) {
    if (name.startsWith(`${service}:`)) {
      const operation = name.substring(service.length + 1);
      results.push({ operation, status: breaker.getStatus(), state: breaker.getStats().state, stats: breaker.getStats() });
    }
  }
  return results;
}

export function isSubServiceHealthy(service: string, operation: string): boolean {
  const key = `${service}:${operation}`;
  const breaker = breakers.get(key);
  if (!breaker) return true;
  return breaker.getStatus() !== "down";
}

export function getGranularBreakerSummary(): {
  totalBreakers: number;
  byStatus: Record<string, number>;
  services: Record<string, { operations: string[]; healthyCount: number; degradedCount: number; downCount: number }>;
} {
  const byStatus: Record<string, number> = { healthy: 0, degraded: 0, down: 0 };
  const services: Record<string, { operations: string[]; healthyCount: number; degradedCount: number; downCount: number }> = {};

  for (const [name, breaker] of breakers) {
    const status = breaker.getStatus();
    byStatus[status] = (byStatus[status] || 0) + 1;

    const parts = name.split(":");
    if (parts.length >= 2) {
      const svc = parts[0];
      const op = parts.slice(1).join(":");
      if (!services[svc]) services[svc] = { operations: [], healthyCount: 0, degradedCount: 0, downCount: 0 };
      services[svc].operations.push(op);
      if (status === "healthy") services[svc].healthyCount++;
      else if (status === "degraded") services[svc].degradedCount++;
      else services[svc].downCount++;
    }
  }

  return { totalBreakers: breakers.size, byStatus, services };
}

export const youtubeBreaker = getBreaker("YouTube API", { failureThreshold: 5, resetTimeoutMs: 60000 });
export const twitchBreaker = getBreaker("Twitch API", { failureThreshold: 5, resetTimeoutMs: 60000 });
export const kickBreaker = getBreaker("Kick API", { failureThreshold: 5, resetTimeoutMs: 60000 });
export const tiktokBreaker = getBreaker("TikTok API", { failureThreshold: 5, resetTimeoutMs: 60000 });
export const discordBreaker = getBreaker("Discord API", { failureThreshold: 5, resetTimeoutMs: 60000 });
export const stripeBreaker = getBreaker("Stripe API", { failureThreshold: 3, resetTimeoutMs: 30000 });
export const openaiBreaker = getBreaker("OpenAI API", { failureThreshold: 5, resetTimeoutMs: 45000 });
export const gmailBreaker = getBreaker("Gmail API", { failureThreshold: 3, resetTimeoutMs: 60000 });
