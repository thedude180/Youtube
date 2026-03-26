import { describe, it, expect, beforeAll, vi } from "vitest";

describe("Phase 6F: Operational Hardening & Audit Intelligence", () => {

  describe("T001: Financial Audit Trail", () => {
    it("should record audit entries with HMAC checksum", async () => {
      const { recordFinancialAudit } = await import("../../services/financial-audit");
      const id = await recordFinancialAudit(
        "test-user-6f", "test_action", "test_entity", "entity-1",
        { oldValue: 100 }, { newValue: 200 }, "test-source", 100, "USD", { note: "test" },
      );
      expect(id).toBeGreaterThan(0);
    });

    it("should verify audit integrity on valid entries", async () => {
      const { recordFinancialAudit, verifyAuditIntegrity } = await import("../../services/financial-audit");
      const id = await recordFinancialAudit(
        "test-user-6f", "verify_test", "test_entity", "entity-2",
        { before: true }, { after: true }, "test-source",
      );
      const result = await verifyAuditIntegrity(id);
      expect(result.valid).toBe(true);
      expect(result.entry).not.toBeNull();
    });

    it("should return invalid for non-existent entries", async () => {
      const { verifyAuditIntegrity } = await import("../../services/financial-audit");
      const result = await verifyAuditIntegrity(999999);
      expect(result.valid).toBe(false);
      expect(result.entry).toBeNull();
    });

    it("should retrieve audit trail with pagination", async () => {
      const { getAuditTrail } = await import("../../services/financial-audit");
      const result = await getAuditTrail("test-user-6f", { limit: 10 });
      expect(result.entries).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    it("should retrieve audit stats", async () => {
      const { getAuditStats } = await import("../../services/financial-audit");
      const stats = await getAuditStats("test-user-6f");
      expect(stats.totalEntries).toBeGreaterThanOrEqual(0);
      expect(stats.byAction).toBeDefined();
      expect(stats.byEntityType).toBeDefined();
      expect(stats.integrityStatus).toBe("healthy");
    });
  });

  describe("T002: Internal Rate Limiter", () => {
    it("should allow requests within limit", async () => {
      const { checkInternalRateLimit, resetRateLimits } = await import("../../services/internal-rate-limiter");
      resetRateLimits();
      const result = checkInternalRateLimit("user-rl-test", "content_draft");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it("should reject requests exceeding limit", async () => {
      const { checkInternalRateLimit, resetRateLimits, configureEngineLimit } = await import("../../services/internal-rate-limiter");
      resetRateLimits();
      configureEngineLimit("test_limited_action", 3, 60000);
      checkInternalRateLimit("user-rl-exhaust", "test_limited_action");
      checkInternalRateLimit("user-rl-exhaust", "test_limited_action");
      checkInternalRateLimit("user-rl-exhaust", "test_limited_action");
      const result = checkInternalRateLimit("user-rl-exhaust", "test_limited_action");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterMs).toBeGreaterThanOrEqual(0);
    });

    it("should get engine limit config", async () => {
      const { getEngineLimitConfig } = await import("../../services/internal-rate-limiter");
      const config = getEngineLimitConfig();
      expect(config.content_draft).toBeDefined();
      expect(config.default).toBeDefined();
    });

    it("should report rate limit pressure", async () => {
      const { getRateLimitPressure } = await import("../../services/internal-rate-limiter");
      const pressure = getRateLimitPressure();
      expect(pressure.totalTrackedWindows).toBeGreaterThanOrEqual(0);
      expect(pressure.byEngine).toBeDefined();
      expect(pressure.highPressureEngines).toBeDefined();
    });
  });

  describe("T003: Adaptive Resource Governor", () => {
    it("should provide resource utilization summary", async () => {
      const { getResourceUtilizationSummary } = await import("../../lib/resource-governor");
      const summary = getResourceUtilizationSummary();
      expect(summary.slots).toBeDefined();
      expect(summary.memoryPressure).toBeGreaterThanOrEqual(0);
      expect(summary.overallUtilization).toBeGreaterThanOrEqual(0);
      expect(typeof summary.loadShedding).toBe("boolean");
      expect(typeof summary.inQuietPeriod).toBe("boolean");
    });

    it("should report governor stats with baseMax", async () => {
      const { getGovernorStats } = await import("../../lib/resource-governor");
      const stats = getGovernorStats();
      expect(stats.ai).toBeDefined();
      expect(stats.ai.baseMax).toBeDefined();
      expect(stats.ai.max).toBeGreaterThan(0);
    });

    it("should check load shedding status", async () => {
      const { shouldLoadShed } = await import("../../lib/resource-governor");
      const result = shouldLoadShed();
      expect(typeof result).toBe("boolean");
    });

    it("should check quiet period status", async () => {
      const { isQuietPeriod, setServerStartTime } = await import("../../lib/resource-governor");
      setServerStartTime(Date.now());
      expect(isQuietPeriod()).toBe(true);
      setServerStartTime(Date.now() - 100000);
      expect(isQuietPeriod()).toBe(false);
    });

    it("should respect resource slots", async () => {
      const { withResourceSlot, setServerStartTime } = await import("../../lib/resource-governor");
      setServerStartTime(Date.now() - 100000);
      const result = await withResourceSlot("ai", "test-task", async () => "done");
      expect(result).toBe("done");
    });
  });

  describe("T004: Granular Circuit Breaker", () => {
    it("should create sub-service breakers", async () => {
      const { getSubServiceBreaker } = await import("../../services/circuit-breaker");
      const breaker = getSubServiceBreaker("youtube", "upload");
      expect(breaker.name).toBe("youtube:upload");
    });

    it("should get service breaker states", async () => {
      const { getSubServiceBreaker, getServiceBreakerStates } = await import("../../services/circuit-breaker");
      getSubServiceBreaker("youtube", "upload");
      getSubServiceBreaker("youtube", "analytics");
      const states = getServiceBreakerStates("youtube");
      expect(states.length).toBeGreaterThanOrEqual(2);
      const ops = states.map(s => s.operation);
      expect(ops).toContain("upload");
      expect(ops).toContain("analytics");
    });

    it("should check sub-service health", async () => {
      const { isSubServiceHealthy } = await import("../../services/circuit-breaker");
      expect(isSubServiceHealthy("youtube", "upload")).toBe(true);
      expect(isSubServiceHealthy("nonexistent", "op")).toBe(true);
    });

    it("should provide granular breaker summary", async () => {
      const { getGranularBreakerSummary } = await import("../../services/circuit-breaker");
      const summary = getGranularBreakerSummary();
      expect(summary.totalBreakers).toBeGreaterThan(0);
      expect(summary.byStatus).toBeDefined();
      expect(summary.services).toBeDefined();
    });

    it("should get all breaker stats including sub-services", async () => {
      const { getAllBreakerStats } = await import("../../services/circuit-breaker");
      const stats = getAllBreakerStats();
      expect(stats["youtube:upload"]).toBeDefined();
      expect(stats["youtube:upload"].state).toBe("closed");
    });
  });

  describe("T005: Ops Health Routes", () => {
    it("should have ops-health routes importable", async () => {
      const { registerOpsHealthRoutes } = await import("../../routes/ops-health");
      expect(typeof registerOpsHealthRoutes).toBe("function");
    });
  });
});
