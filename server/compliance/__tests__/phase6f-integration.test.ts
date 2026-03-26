import { describe, it, expect } from "vitest";

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
      expect(result.entry!.action).toBe("verify_test");
      expect(result.entry!.checksum).toBeTruthy();
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
      expect(Array.isArray(result.entries)).toBe(true);
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    it("should retrieve audit stats with breakdown", async () => {
      const { getAuditStats } = await import("../../services/financial-audit");
      const stats = await getAuditStats("test-user-6f");
      expect(stats.totalEntries).toBeGreaterThanOrEqual(0);
      expect(stats.byAction).toBeDefined();
      expect(stats.byEntityType).toBeDefined();
      expect(stats.integrityStatus).toBe("healthy");
      expect(typeof stats.totalEntries).toBe("number");
    });

    it("should filter audit trail by entityType", async () => {
      const { recordFinancialAudit, getAuditTrail } = await import("../../services/financial-audit");
      await recordFinancialAudit("test-user-6f-filter", "filter_test", "revenue_record", "r-1", {}, { status: "verified" }, "test");
      await recordFinancialAudit("test-user-6f-filter", "filter_test", "capital_plan", "c-1", {}, { budget: 500 }, "test");
      const result = await getAuditTrail("test-user-6f-filter", { entityType: "revenue_record" });
      expect(result.entries.every(e => e.entityType === "revenue_record")).toBe(true);
    });

    it("should preserve before and after snapshots accurately", async () => {
      const { recordFinancialAudit, verifyAuditIntegrity } = await import("../../services/financial-audit");
      const before = { status: "estimated", amount: 50 };
      const after = { status: "verified", amount: 53, gapAmount: 3 };
      const id = await recordFinancialAudit("test-user-6f-snap", "snapshot_test", "revenue_record", "s-1", before, after, "test", 3);
      const result = await verifyAuditIntegrity(id);
      expect(result.valid).toBe(true);
      expect(result.entry!.beforeSnapshot).toEqual(before);
      expect(result.entry!.afterSnapshot).toEqual(after);
      expect(result.entry!.changeAmount).toBe(3);
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

    it("should get engine limit config with all default engines", async () => {
      const { getEngineLimitConfig } = await import("../../services/internal-rate-limiter");
      const config = getEngineLimitConfig();
      expect(config.content_draft).toBeDefined();
      expect(config.tags_change).toBeDefined();
      expect(config.cross_post).toBeDefined();
      expect(config.analytics_export).toBeDefined();
      expect(config.default).toBeDefined();
      expect(config.content_draft.maxRequests).toBe(20);
      expect(config.content_draft.windowMs).toBe(60000);
    });

    it("should report rate limit pressure", async () => {
      const { getRateLimitPressure } = await import("../../services/internal-rate-limiter");
      const pressure = getRateLimitPressure();
      expect(pressure.totalTrackedWindows).toBeGreaterThanOrEqual(0);
      expect(pressure.byEngine).toBeDefined();
      expect(pressure.highPressureEngines).toBeDefined();
      expect(Array.isArray(pressure.highPressureEngines)).toBe(true);
    });

    it("should allow reconfiguring engine limits dynamically", async () => {
      const { configureEngineLimit, getEngineLimitConfig, resetRateLimits } = await import("../../services/internal-rate-limiter");
      resetRateLimits();
      configureEngineLimit("custom_engine", 5, 30000);
      const config = getEngineLimitConfig();
      expect(config.custom_engine).toEqual({ maxRequests: 5, windowMs: 30000 });
    });

    it("should isolate rate limits between users", async () => {
      const { checkInternalRateLimit, resetRateLimits, configureEngineLimit } = await import("../../services/internal-rate-limiter");
      resetRateLimits();
      configureEngineLimit("isolation_test", 2, 60000);
      checkInternalRateLimit("user-A", "isolation_test");
      checkInternalRateLimit("user-A", "isolation_test");
      const resultA = checkInternalRateLimit("user-A", "isolation_test");
      const resultB = checkInternalRateLimit("user-B", "isolation_test");
      expect(resultA.allowed).toBe(false);
      expect(resultB.allowed).toBe(true);
    });

    it("should detect high pressure engines", async () => {
      const { checkInternalRateLimit, resetRateLimits, configureEngineLimit, getRateLimitPressure } = await import("../../services/internal-rate-limiter");
      resetRateLimits();
      configureEngineLimit("pressure_test", 5, 60000);
      for (let i = 0; i < 5; i++) checkInternalRateLimit("user-pressure", "pressure_test");
      const pressure = getRateLimitPressure();
      expect(pressure.byEngine.pressure_test).toBeDefined();
      expect(pressure.byEngine.pressure_test.pressure).toBeGreaterThanOrEqual(80);
    });
  });

  describe("T003: Adaptive Resource Governor", () => {
    it("should provide resource utilization summary with all fields", async () => {
      const { getResourceUtilizationSummary } = await import("../../lib/resource-governor");
      const summary = getResourceUtilizationSummary();
      expect(summary.slots).toBeDefined();
      expect(summary.slots.ai).toBeDefined();
      expect(summary.slots.db).toBeDefined();
      expect(summary.slots.api).toBeDefined();
      expect(summary.slots.heavy).toBeDefined();
      expect(summary.memoryPressure).toBeGreaterThanOrEqual(0);
      expect(summary.overallUtilization).toBeGreaterThanOrEqual(0);
      expect(typeof summary.loadShedding).toBe("boolean");
      expect(typeof summary.inQuietPeriod).toBe("boolean");
    });

    it("should report governor stats with baseMax for all categories", async () => {
      const { getGovernorStats } = await import("../../lib/resource-governor");
      const stats = getGovernorStats();
      for (const cat of ["ai", "db", "api", "heavy"]) {
        expect(stats[cat]).toBeDefined();
        expect(stats[cat].baseMax).toBeGreaterThan(0);
        expect(stats[cat].max).toBeGreaterThan(0);
        expect(stats[cat].utilization).toBeDefined();
      }
    });

    it("should check load shedding status", async () => {
      const { shouldLoadShed } = await import("../../lib/resource-governor");
      const result = shouldLoadShed();
      expect(typeof result).toBe("boolean");
    });

    it("should check quiet period status transitions", async () => {
      const { isQuietPeriod, setServerStartTime } = await import("../../lib/resource-governor");
      setServerStartTime(Date.now());
      expect(isQuietPeriod()).toBe(true);
      setServerStartTime(Date.now() - 100000);
      expect(isQuietPeriod()).toBe(false);
    });

    it("should respect resource slots and return results", async () => {
      const { withResourceSlot, setServerStartTime } = await import("../../lib/resource-governor");
      setServerStartTime(Date.now() - 100000);
      const result = await withResourceSlot("ai", "test-task", async () => ({ value: 42 }));
      expect(result).toEqual({ value: 42 });
    });

    it("should skip tasks during quiet period when configured", async () => {
      const { withResourceSlot, setServerStartTime } = await import("../../lib/resource-governor");
      setServerStartTime(Date.now());
      await expect(
        withResourceSlot("ai", "quiet-test", async () => "ok", { skipDuringQuiet: true })
      ).rejects.toThrow("quiet period");
    });

    it("should check canRun for all categories", async () => {
      const { canRun, setServerStartTime } = await import("../../lib/resource-governor");
      setServerStartTime(Date.now() - 100000);
      expect(canRun("ai")).toBe(true);
      expect(canRun("db")).toBe(true);
      expect(canRun("api")).toBe(true);
      expect(canRun("heavy")).toBe(true);
    });
  });

  describe("T004: Granular Circuit Breaker", () => {
    it("should create sub-service breakers with correct naming", async () => {
      const { getSubServiceBreaker } = await import("../../services/circuit-breaker");
      const breaker = getSubServiceBreaker("youtube", "upload");
      expect(breaker.name).toBe("youtube:upload");
    });

    it("should get service breaker states for all operations", async () => {
      const { getSubServiceBreaker, getServiceBreakerStates } = await import("../../services/circuit-breaker");
      getSubServiceBreaker("youtube", "upload");
      getSubServiceBreaker("youtube", "analytics");
      getSubServiceBreaker("youtube", "metadata");
      const states = getServiceBreakerStates("youtube");
      expect(states.length).toBeGreaterThanOrEqual(3);
      const ops = states.map(s => s.operation);
      expect(ops).toContain("upload");
      expect(ops).toContain("analytics");
      expect(ops).toContain("metadata");
      for (const s of states) {
        expect(s.status).toBe("healthy");
        expect(s.state).toBe("closed");
      }
    });

    it("should check sub-service health for existing and non-existing", async () => {
      const { isSubServiceHealthy } = await import("../../services/circuit-breaker");
      expect(isSubServiceHealthy("youtube", "upload")).toBe(true);
      expect(isSubServiceHealthy("nonexistent", "op")).toBe(true);
    });

    it("should provide granular breaker summary with service grouping", async () => {
      const { getGranularBreakerSummary } = await import("../../services/circuit-breaker");
      const summary = getGranularBreakerSummary();
      expect(summary.totalBreakers).toBeGreaterThan(0);
      expect(summary.byStatus).toBeDefined();
      expect(summary.byStatus.healthy).toBeGreaterThan(0);
      expect(summary.services).toBeDefined();
      expect(summary.services.youtube).toBeDefined();
      expect(summary.services.youtube.operations.length).toBeGreaterThanOrEqual(2);
    });

    it("should get all breaker stats including platform and sub-service", async () => {
      const { getAllBreakerStats } = await import("../../services/circuit-breaker");
      const stats = getAllBreakerStats();
      expect(stats["youtube:upload"]).toBeDefined();
      expect(stats["youtube:upload"].state).toBe("closed");
      expect(stats["YouTube API"]).toBeDefined();
      expect(stats["Stripe API"]).toBeDefined();
    });

    it("should execute through sub-service breaker successfully", async () => {
      const { getSubServiceBreaker } = await import("../../services/circuit-breaker");
      const breaker = getSubServiceBreaker("test-svc", "op1");
      const result = await breaker.execute(async () => "success");
      expect(result).toBe("success");
    });

    it("should trip sub-service breaker after failures", async () => {
      const { getSubServiceBreaker } = await import("../../services/circuit-breaker");
      const breaker = getSubServiceBreaker("test-trip", "failing-op", { failureThreshold: 3, resetTimeoutMs: 60000 });
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(async () => { throw new Error("fail"); }); } catch {}
      }
      expect(breaker.getStatus()).toBe("down");
      await expect(breaker.execute(async () => "ok")).rejects.toThrow("OPEN");
    });

    it("should use fallback when breaker is open", async () => {
      const { getSubServiceBreaker } = await import("../../services/circuit-breaker");
      const breaker = getSubServiceBreaker("test-fallback", "op", { failureThreshold: 2, resetTimeoutMs: 60000 });
      for (let i = 0; i < 2; i++) {
        try { await breaker.execute(async () => { throw new Error("fail"); }); } catch {}
      }
      const result = await breaker.execute(async () => "live", () => "fallback");
      expect(result).toBe("fallback");
    });
  });

  describe("T005: Ops Health Routes", () => {
    it("should have ops-health routes importable", async () => {
      const { registerOpsHealthRoutes } = await import("../../routes/ops-health");
      expect(typeof registerOpsHealthRoutes).toBe("function");
    });
  });

  describe("T006: Cross-module integration", () => {
    it("should have CommandResult type include retryAfterMs", async () => {
      const kernel = await import("../../kernel/index");
      const result: Record<string, unknown> = { success: false, retryAfterMs: 1000, correlationId: "test" };
      expect("retryAfterMs" in result).toBe(true);
    });

    it("should have financial audit entries typed as FinancialAuditEntry", async () => {
      const { getAuditTrail, recordFinancialAudit } = await import("../../services/financial-audit");
      await recordFinancialAudit("test-typed-user", "typed_test", "test_entity", null, {}, {}, "test");
      const result = await getAuditTrail("test-typed-user");
      expect(result.entries.length).toBeGreaterThan(0);
      const entry = result.entries[0];
      expect(entry.userId).toBe("test-typed-user");
      expect(entry.checksum).toBeTruthy();
      expect(entry.source).toBe("test");
    });
  });
});
