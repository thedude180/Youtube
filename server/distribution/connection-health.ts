import type { Platform } from "@shared/schema";
import { PLATFORMS } from "@shared/schema";

type CircuitState = "closed" | "half_open" | "open";

type ConnectionStatus = {
  platform: string;
  status: CircuitState;
  latencyMs: number;
  consecutiveFailures: number;
  lastSuccess: Date | null;
  lastFailure: Date | null;
  lastChecked: Date;
};

const FAILURE_THRESHOLD = 5;
const RECOVERY_TIMEOUT_MS = 60_000;
const MAX_LATENCY_MS = 10_000;

const circuitStates = new Map<string, {
  state: CircuitState;
  failures: number;
  lastSuccess: Date | null;
  lastFailure: Date | null;
  lastLatencyMs: number;
  openedAt: Date | null;
}>();

function getOrInit(platform: string) {
  if (!circuitStates.has(platform)) {
    circuitStates.set(platform, {
      state: "closed",
      failures: 0,
      lastSuccess: null,
      lastFailure: null,
      lastLatencyMs: 0,
      openedAt: null,
    });
  }
  return circuitStates.get(platform)!;
}

export function getConnectionHealth(platform: string): ConnectionStatus {
  const circuit = getOrInit(platform);

  if (circuit.state === "open" && circuit.openedAt) {
    const elapsed = Date.now() - circuit.openedAt.getTime();
    if (elapsed >= RECOVERY_TIMEOUT_MS) {
      circuit.state = "half_open";
    }
  }

  return {
    platform,
    status: circuit.state,
    latencyMs: circuit.lastLatencyMs,
    consecutiveFailures: circuit.failures,
    lastSuccess: circuit.lastSuccess,
    lastFailure: circuit.lastFailure,
    lastChecked: new Date(),
  };
}

export function recordConnectionSuccess(platform: string, latencyMs: number): void {
  const circuit = getOrInit(platform);
  circuit.failures = 0;
  circuit.lastSuccess = new Date();
  circuit.lastLatencyMs = latencyMs;
  circuit.state = "closed";
  circuit.openedAt = null;
}

export function recordConnectionFailure(platform: string, latencyMs: number = MAX_LATENCY_MS): void {
  const circuit = getOrInit(platform);
  circuit.failures++;
  circuit.lastFailure = new Date();
  circuit.lastLatencyMs = latencyMs;

  if (circuit.failures >= FAILURE_THRESHOLD) {
    circuit.state = "open";
    circuit.openedAt = new Date();
  }
}

export function getAllConnectionHealth(): ConnectionStatus[] {
  return PLATFORMS.map(p => getConnectionHealth(p));
}

export function resetCircuitBreaker(platform: string): void {
  circuitStates.delete(platform);
}

export function isPublishAllowed(platform: string): boolean {
  const health = getConnectionHealth(platform);
  return health.status !== "open";
}

export function getCircuitBreakerConfig() {
  return {
    failureThreshold: FAILURE_THRESHOLD,
    recoveryTimeoutMs: RECOVERY_TIMEOUT_MS,
    maxLatencyMs: MAX_LATENCY_MS,
  };
}
