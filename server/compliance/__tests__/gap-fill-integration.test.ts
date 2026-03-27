import { describe, it, expect } from "vitest";

describe("Phase 1 Gap Fill", () => {
  describe("Model Fallback Chain", () => {
    it("provides available chains", async () => {
      const { getAvailableChains, getChainModels } = await import("../../kernel/model-fallback-chain");
      const chains = getAvailableChains();
      expect(chains).toContain("openai_primary");
      expect(chains).toContain("openai_mini");
      expect(chains).toContain("claude_primary");
      expect(chains).toContain("claude_light");
      expect(chains).toContain("ultra_resilient");
    });

    it("resolves chains for different task types", async () => {
      const { resolveChainForTask } = await import("../../kernel/model-fallback-chain");
      expect(resolveChainForTask("strategy_planning")).toBe("openai_primary");
      expect(resolveChainForTask("quick_suggestion")).toBe("openai_mini");
      expect(resolveChainForTask("creator_dna_analysis", "claude")).toBe("claude_primary");
      expect(resolveChainForTask("chat_moderation", "claude")).toBe("claude_light");
    });

    it("chain models are ordered by priority", async () => {
      const { getChainModels } = await import("../../kernel/model-fallback-chain");
      const primary = getChainModels("openai_primary");
      expect(primary.length).toBeGreaterThanOrEqual(3);
      expect(primary[0].provider).toBe("openai");
      expect(primary[0].model).toBe("gpt-4o");
    });
  });

  describe("Connection Fabric", () => {
    it("seeds default connections", async () => {
      const { seedDefaultConnections, getAllConnections, getHealthReport } = await import("../../kernel/connection-fabric");
      seedDefaultConnections();
      const connections = getAllConnections();
      expect(connections.length).toBeGreaterThanOrEqual(4);
      const platforms = connections.map((c) => c.platform);
      expect(platforms).toContain("youtube");
      expect(platforms).toContain("infrastructure");
      expect(platforms).toContain("ai");
    });

    it("generates health report", async () => {
      const { seedDefaultConnections, getHealthReport } = await import("../../kernel/connection-fabric");
      seedDefaultConnections();
      const report = getHealthReport();
      expect(report.totalConnections).toBeGreaterThanOrEqual(4);
      expect(report.overallHealth).toBe("healthy");
      expect(report.byStatus.connected).toBeGreaterThanOrEqual(4);
    });

    it("tracks connection status changes", async () => {
      const { seedDefaultConnections, updateConnectionStatus, getConnection, getConnectionsByStatus } = await import("../../kernel/connection-fabric");
      seedDefaultConnections();
      updateConnectionStatus("youtube-primary", "degraded", { reason: "quota low" });
      const conn = getConnection("youtube-primary");
      expect(conn?.status).toBe("degraded");
      const degraded = getConnectionsByStatus("degraded");
      expect(degraded.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("State Reconciliation Layer", () => {
    it("registers and runs reconciliation checkers", async () => {
      const { registerReconciliationChecker, runReconciliation, getRegisteredDomains } = await import("../../kernel/state-reconciliation");
      registerReconciliationChecker("test_domain", async () => [
        { domain: "test_domain", check: "value_check", status: "matched" as const, internalValue: 42, externalValue: 42, timestamp: new Date() },
      ]);
      const domains = getRegisteredDomains();
      expect(domains).toContain("test_domain");
      const report = await runReconciliation("test_domain");
      expect(report.overallStatus).toBe("consistent");
      expect(report.summary.matched).toBe(1);
    });

    it("detects mismatches", async () => {
      const { registerReconciliationChecker, runReconciliation } = await import("../../kernel/state-reconciliation");
      registerReconciliationChecker("mismatch_domain", async () => [
        { domain: "mismatch_domain", check: "state_check", status: "mismatch" as const, internalValue: "A", externalValue: "B", details: "Values differ", timestamp: new Date() },
      ]);
      const report = await runReconciliation("mismatch_domain");
      expect(report.overallStatus).toBe("inconsistent");
      expect(report.summary.mismatched).toBe(1);
    });

    it("handles unknown domains gracefully", async () => {
      const { runReconciliation } = await import("../../kernel/state-reconciliation");
      const report = await runReconciliation("nonexistent_domain");
      expect(report.overallStatus).toBe("error");
    });
  });

  describe("Regional Policy Adapter", () => {
    it("evaluates EU policies", async () => {
      const { evaluateRegionalPolicy } = await import("../../kernel/regional-policy");
      const result = evaluateRegionalPolicy("EU");
      expect(result.region).toBe("EU");
      expect(result.applicableRules.length).toBeGreaterThanOrEqual(3);
      expect(result.blocked.length).toBeGreaterThanOrEqual(1);
    });

    it("detects region from locale", async () => {
      const { detectRegionFromLocale } = await import("../../kernel/regional-policy");
      expect(detectRegionFromLocale("de-DE")).toBe("EU");
      expect(detectRegionFromLocale("en-GB")).toBe("UK");
      expect(detectRegionFromLocale("ko-KR")).toBe("APAC_KR");
      expect(detectRegionFromLocale("ja-JP")).toBe("APAC_JP");
      expect(detectRegionFromLocale("pt-BR")).toBe("LATAM_BR");
    });

    it("returns all regions", async () => {
      const { getAllRegions } = await import("../../kernel/regional-policy");
      const regions = getAllRegions();
      expect(regions).toContain("EU");
      expect(regions).toContain("GLOBAL");
      expect(regions).toContain("UK");
    });
  });

  describe("Agent UI Payload Contract", () => {
    it("validates correct payloads", async () => {
      const { validateAgentUIPayload, createAgentUIPayload } = await import("../../kernel/agent-ui-contract");
      const payload = createAgentUIPayload("seo-agent", "SEO Lab", "recommendation", "Optimize Title", "Your title could perform better", 0.85);
      const result = validateAgentUIPayload(payload);
      expect(result.valid).toBe(true);
    });

    it("rejects invalid payloads", async () => {
      const { validateAgentUIPayload } = await import("../../kernel/agent-ui-contract");
      const result = validateAgentUIPayload({ agentId: "test" });
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it("has registered agents", async () => {
      const { REGISTERED_AGENTS } = await import("../../kernel/agent-ui-contract");
      expect(REGISTERED_AGENTS.length).toBeGreaterThanOrEqual(8);
      const ids = REGISTERED_AGENTS.map((a) => a.id);
      expect(ids).toContain("seo-agent");
      expect(ids).toContain("compliance-agent");
    });
  });

  describe("Skill Compiler", () => {
    it("compiles and retrieves skills", async () => {
      const { compileSkill, getSkill, getSkillRegistry } = await import("../../kernel/skill-compiler");
      const skill = compileSkill("test-skill", {
        triggers: ["test.event"],
        actions: ["do_something"],
        source: "test",
        category: "content",
      });
      expect(skill.name).toBe("test-skill");
      expect(skill.category).toBe("content");
      expect(getSkill("test-skill")).toBeTruthy();
      expect(getSkillRegistry().length).toBeGreaterThanOrEqual(1);
    });

    it("seeds default skills", async () => {
      const { seedDefaultSkills, getSkillRegistry } = await import("../../kernel/skill-compiler");
      seedDefaultSkills();
      const skills = getSkillRegistry();
      const names = skills.map((s) => s.name);
      expect(names).toContain("highlight-reel-generator");
      expect(names).toContain("title-optimizer");
      expect(names).toContain("thumbnail-selector");
    });

    it("supports learned signals", async () => {
      const { compileSkill } = await import("../../kernel/skill-compiler");
      const skill = compileSkill("learned-skill", {
        triggers: ["content.published"],
        actions: ["optimize_timing"],
        source: "learning-engine",
        learnedSignals: [
          { signal: "publish_time_morning", outcome: "higher_ctr", confidence: 0.8 },
          { signal: "publish_time_evening", outcome: "lower_ctr", confidence: 0.6 },
        ],
      });
      expect(skill.learnedRules).toBeDefined();
      expect(skill.learnedRules!.length).toBe(2);
      expect(skill.confidence).toBeGreaterThan(0);
    });
  });
});

describe("Phase 2 Gap Fill", () => {
  describe("Authenticity Signal Amplifier", () => {
    it("amplifies authenticity signals", async () => {
      const { amplifyAuthenticitySignals } = await import("../../content/authenticity-signal-amplifier");
      const result = amplifyAuthenticitySignals("content-1", [
        { type: "originality", score: 0.8, source: "content-analysis" },
        { type: "community_trust", score: 0.9, source: "audience-feedback" },
      ]);
      expect(result.signals.length).toBe(2);
      expect(result.amplifiedComposite).toBeGreaterThan(result.compositeScore);
      expect(result.signals[0].amplifiedScore).toBeGreaterThanOrEqual(result.signals[0].rawScore);
    });
  });

  describe("AI Displacement Risk Monitor", () => {
    it("assesses displacement risk", async () => {
      const { assessDisplacementRisk } = await import("../../content/ai-displacement-risk");
      const report = assessDisplacementRisk({
        humanContentRatio: 0.9,
        communityEngagement: 0.7,
        revenueStreams: 3,
        brandRecognition: 0.6,
      });
      expect(report.overallRisk).toBeDefined();
      expect(report.factors.length).toBeGreaterThanOrEqual(5);
      expect(report.humanValueMoat).toBeGreaterThan(0);
    });

    it("detects high risk when metrics are low", async () => {
      const { assessDisplacementRisk } = await import("../../content/ai-displacement-risk");
      const report = assessDisplacementRisk({
        humanContentRatio: 0.1,
        communityEngagement: 0.1,
        revenueStreams: 1,
        brandRecognition: 0.1,
        directAudienceReach: 0.1,
      });
      expect(["high", "critical"]).toContain(report.overallRisk);
      expect(report.humanValueMoat).toBeLessThan(0.5);
    });
  });

  describe("IP Expansion Scaffolding", () => {
    it("identifies adaptation opportunities", async () => {
      const { analyzeIPExpansion } = await import("../../content/ip-expansion");
      const analysis = analyzeIPExpansion("vid-1", "long_video");
      expect(analysis.adaptations.length).toBeGreaterThanOrEqual(3);
      expect(analysis.highValueCount).toBeGreaterThanOrEqual(1);
      expect(analysis.adaptations.every((a) => a.status === "identified")).toBe(true);
    });

    it("excludes already adapted types", async () => {
      const { analyzeIPExpansion } = await import("../../content/ip-expansion");
      const analysis = analyzeIPExpansion("vid-1", "long_video", ["short_form", "highlights"]);
      const types = analysis.adaptations.map((a) => a.adaptationType);
      expect(types).not.toContain("short_form");
      expect(types).not.toContain("highlights");
    });
  });
});

describe("Phase 3 Gap Fill", () => {
  describe("Smart Inbox", () => {
    it("pushes and retrieves signals", async () => {
      const { pushSignal, getInbox, getInboxSummary } = await import("../../live-ops/smart-inbox");
      pushSignal("user-1", {
        category: "live",
        priority: "high",
        title: "Stream starting",
        summary: "Your scheduled stream is about to begin",
        source: "live-detection",
        actionRequired: true,
        metadata: {},
      });
      const inbox = getInbox("user-1");
      expect(inbox.length).toBeGreaterThanOrEqual(1);
      const summary = getInboxSummary("user-1");
      expect(summary.unread).toBeGreaterThanOrEqual(1);
    });

    it("marks signals as read", async () => {
      const { pushSignal, markRead, getInboxSummary } = await import("../../live-ops/smart-inbox");
      const signal = pushSignal("user-read-test", {
        category: "content",
        priority: "medium",
        title: "Test",
        summary: "Test signal",
        source: "test",
        actionRequired: false,
        metadata: {},
      });
      markRead("user-read-test", signal.id);
      const summary = getInboxSummary("user-read-test");
      expect(summary.unread).toBe(0);
    });
  });

  describe("Human Value Moat", () => {
    it("captures and assesses signals", async () => {
      const { captureHumanValueSignal, assessHumanValueMoat } = await import("../../live-ops/human-value-moat");
      const signals = [
        captureHumanValueSignal("live", "presence", 0.8),
        captureHumanValueSignal("chat", "community", 0.6),
        captureHumanValueSignal("gameplay", "creativity", 0.9),
      ];
      const report = assessHumanValueMoat(signals);
      expect(report.overallScore).toBeGreaterThan(0);
      expect(report.strengthAreas.length).toBeGreaterThanOrEqual(1);
    });

    it("captures live human value signals", async () => {
      const { captureLiveHumanValueSignals } = await import("../../live-ops/human-value-moat");
      const signals = captureLiveHumanValueSignals(90, 30, 15);
      expect(signals.length).toBe(3);
      expect(signals.every((s) => s.score >= 0 && s.score <= 1)).toBe(true);
    });
  });
});

describe("Phase 4 Gap Fill", () => {
  describe("Seasonal Intelligence", () => {
    it("provides seasonal insights", async () => {
      const { getSeasonalInsights } = await import("../../distribution/seasonal-intelligence");
      const insights = getSeasonalInsights();
      expect(insights.currentSeason).toBeDefined();
      expect(["Winter", "Spring", "Summer", "Fall"]).toContain(insights.currentSeason);
      expect(insights.revenueOutlook).toBeDefined();
    });

    it("identifies active events for specific dates", async () => {
      const { getSeasonalInsights } = await import("../../distribution/seasonal-intelligence");
      const holiday = getSeasonalInsights(new Date(2025, 11, 15));
      expect(holiday.activeEvents.length).toBeGreaterThanOrEqual(1);
      const eventNames = holiday.activeEvents.map((e) => e.name);
      expect(eventNames.some((n) => n.includes("Holiday") || n.includes("Game Awards"))).toBe(true);
    });
  });
});

describe("Phase 5 Gap Fill", () => {
  describe("Audience Identity Graph", () => {
    it("builds default audience graph", async () => {
      const { buildAudienceGraph, getAudienceGraph } = await import("../../business/audience-identity-graph");
      const graph = buildAudienceGraph("user-1");
      expect(graph.segments.length).toBeGreaterThanOrEqual(3);
      expect(graph.connections.length).toBeGreaterThanOrEqual(2);
      expect(graph.privacyCompliance.gdprCompliant).toBe(true);
    });

    it("supports data deletion requests", async () => {
      const { buildAudienceGraph, requestDataDeletion, getAudienceGraph } = await import("../../business/audience-identity-graph");
      buildAudienceGraph("user-delete");
      const result = requestDataDeletion("user-delete", "core_gamers");
      expect(result.accepted).toBe(true);
      const graph = getAudienceGraph("user-delete");
      expect(graph.privacyCompliance.deletionRequestsPending).toBeGreaterThanOrEqual(1);
    });

    it("assesses audience escape velocity", async () => {
      const { buildAudienceGraph, assessAudienceEscapeVelocity } = await import("../../business/audience-identity-graph");
      buildAudienceGraph("user-escape");
      const result = await assessAudienceEscapeVelocity("user-escape");
      expect(result.score).toBeGreaterThan(0);
      expect(result.factors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Creator REIT Readiness", () => {
    it("assesses REIT readiness", async () => {
      const { assessREITReadiness } = await import("../../business/creator-reit-readiness");
      const assessment = assessREITReadiness({
        monthlyRevenue: 5000,
        revenueStreams: 3,
        contentLibrarySize: 200,
        subscriberCount: 50000,
      });
      expect(assessment.readinessLevel).toBeDefined();
      expect(assessment.dimensions.length).toBeGreaterThanOrEqual(5);
      expect(assessment.overallScore).toBeGreaterThan(0);
    });
  });

  describe("Creator Wellness Intelligence", () => {
    it("assesses wellness and detects risk", async () => {
      const { assessCreatorWellness } = await import("../../business/creator-wellness-intelligence");
      const report = assessCreatorWellness({ weeklyHours: 70, publishFrequency: 8, daysOff: 0 });
      expect(["strained", "at_risk", "burnout_risk"]).toContain(report.status);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it("reports thriving for balanced inputs", async () => {
      const { assessCreatorWellness } = await import("../../business/creator-wellness-intelligence");
      const report = assessCreatorWellness({ weeklyHours: 30, publishFrequency: 2, daysOff: 3, contentSatisfaction: 0.9 });
      expect(["thriving", "balanced"]).toContain(report.status);
    });
  });

  describe("Collaboration Intelligence", () => {
    it("identifies collaboration opportunities", async () => {
      const { analyzeCollaborationOpportunities } = await import("../../business/collaboration-intelligence");
      const report = analyzeCollaborationOpportunities({ subscriberCount: 20000, niche: "ps5-gaming" });
      expect(report.opportunities.length).toBeGreaterThanOrEqual(3);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe("Seasonal Revenue Calendar", () => {
    it("provides 12-month revenue calendar", async () => {
      const { getSeasonalRevenueCalendar } = await import("../../business/seasonal-revenue-calendar");
      const calendar = getSeasonalRevenueCalendar(1000);
      expect(calendar.entries.length).toBe(12);
      expect(calendar.currentMonth).toBeDefined();
      expect(calendar.yearlyPattern).toBeDefined();
    });

    it("identifies peak months correctly", async () => {
      const { getSeasonalRevenueCalendar } = await import("../../business/seasonal-revenue-calendar");
      const calendar = getSeasonalRevenueCalendar();
      const december = calendar.entries.find((e) => e.monthName === "December");
      expect(december?.expectedMultiplier).toBeGreaterThanOrEqual(1.3);
    });
  });

  describe("Native Checkout Intelligence", () => {
    it("analyzes checkout channels", async () => {
      const { analyzeCheckoutChannels } = await import("../../business/native-checkout-intelligence");
      const report = analyzeCheckoutChannels(15000, 500);
      expect(report.channels.length).toBeGreaterThanOrEqual(4);
      expect(report.recommended.length).toBeGreaterThan(0);
      expect(report.estimatedMonthlyRevenue).toBeGreaterThan(0);
    });
  });

  describe("Hardware & Production ROI", () => {
    it("analyzes hardware ROI", async () => {
      const { analyzeHardwareROI, getDefaultPS5CreatorSetup } = await import("../../business/hardware-production-roi");
      const report = analyzeHardwareROI(getDefaultPS5CreatorSetup());
      expect(report.assets.length).toBeGreaterThanOrEqual(5);
      expect(report.totalInvestment).toBeGreaterThan(0);
    });
  });

  describe("Skill Development Intelligence", () => {
    it("assesses skill development", async () => {
      const { assessSkillDevelopment } = await import("../../business/skill-development-intelligence");
      const plan = assessSkillDevelopment("ps5-no-commentary");
      expect(plan.skillAreas.length).toBeGreaterThanOrEqual(8);
      expect(plan.prioritySkills.length).toBeGreaterThan(0);
      expect(plan.overallReadiness).toBeGreaterThan(0);
    });
  });

  describe("Emerging Market Intelligence", () => {
    it("analyzes emerging markets", async () => {
      const { analyzeEmergingMarkets } = await import("../../business/emerging-market-intelligence");
      const report = analyzeEmergingMarkets();
      expect(report.markets.length).toBeGreaterThanOrEqual(5);
      expect(report.topOpportunities.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("Phase 6 Gap Fill", () => {
  describe("Content Preservation Restore Tests", () => {
    it("registers and tests preservation assets", async () => {
      const { registerPreservedAsset, runIntegrityCheck, runRestoreTest, getPreservationReport } = await import("../../services/content-preservation-restore");
      registerPreservedAsset({
        id: "asset-1",
        type: "video",
        sourceId: "vid-1",
        preservedAt: new Date(),
        size: 1024000,
        checksum: "abc123",
        status: "preserved",
      });
      const integrityResult = runIntegrityCheck("asset-1");
      expect(integrityResult.passed).toBe(true);

      const restoreResult = runRestoreTest("asset-1");
      expect(restoreResult.passed).toBe(true);
      expect(restoreResult.testType).toBe("full_restore");

      const report = getPreservationReport();
      expect(report.totalAssets).toBeGreaterThanOrEqual(1);
      expect(report.restoreTestedAssets).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Crisis Response Approval Enforcement", () => {
    it("auto-approves low severity actions", async () => {
      const { requestCrisisApproval, canExecuteCrisisAction } = await import("../../services/crisis-response-approval");
      const action = requestCrisisApproval("user-crisis-1", "brand_safety", "low", "Pause ad campaign");
      expect(action.approvalStatus).toBe("auto_approved");
      const check = canExecuteCrisisAction("user-crisis-1", action.id);
      expect(check.canExecute).toBe(true);
    });

    it("requires approval for high severity actions", async () => {
      const { requestCrisisApproval, canExecuteCrisisAction, approveCrisisAction, markExecuted } = await import("../../services/crisis-response-approval");
      const action = requestCrisisApproval("user-crisis-2", "copyright_strike", "critical", "Remove flagged content");
      expect(action.approvalStatus).toBe("pending");
      const check1 = canExecuteCrisisAction("user-crisis-2", action.id);
      expect(check1.canExecute).toBe(false);

      const result = approveCrisisAction("user-crisis-2", action.id, "founder");
      expect(result.approved).toBe(true);

      const check2 = canExecuteCrisisAction("user-crisis-2", action.id);
      expect(check2.canExecute).toBe(true);

      expect(markExecuted("user-crisis-2", action.id)).toBe(true);
    });

    it("rejects and prevents execution", async () => {
      const { requestCrisisApproval, rejectCrisisAction, canExecuteCrisisAction } = await import("../../services/crisis-response-approval");
      const action = requestCrisisApproval("user-crisis-3", "reputation", "high", "Issue public statement");
      rejectCrisisAction("user-crisis-3", action.id, "founder");
      const check = canExecuteCrisisAction("user-crisis-3", action.id);
      expect(check.canExecute).toBe(false);
    });
  });

  describe("Continuity Artifacts Export", () => {
    it("seeds and retrieves artifacts", async () => {
      const { seedDefaultArtifacts, getArtifacts } = await import("../../services/continuity-artifacts-export");
      seedDefaultArtifacts("user-export-1");
      const artifacts = getArtifacts("user-export-1");
      expect(artifacts.length).toBeGreaterThanOrEqual(7);
    });

    it("auto-approves non-restricted exports", async () => {
      const { seedDefaultArtifacts, requestExport, executeExport } = await import("../../services/continuity-artifacts-export");
      seedDefaultArtifacts("user-export-2");
      const request = requestExport("user-export-2", ["content_inv", "brand"], "founder");
      expect(request.status).toBe("approved");
      const result = executeExport("user-export-2", request.id);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it("requires approval for restricted artifacts", async () => {
      const { seedDefaultArtifacts, requestExport, approveExport, executeExport } = await import("../../services/continuity-artifacts-export");
      seedDefaultArtifacts("user-export-3");
      const request = requestExport("user-export-3", ["legal_def", "data_room"], "founder");
      expect(request.status).toBe("pending");

      const exec1 = executeExport("user-export-3", request.id);
      expect(exec1.success).toBe(false);

      approveExport("user-export-3", request.id, "founder");
      const exec2 = executeExport("user-export-3", request.id);
      expect(exec2.success).toBe(true);
    });
  });
});

describe("Remaining Phase 5 Gap Fill", () => {
  describe("Strategic Asset Narrative", () => {
    it("builds asset narrative", async () => {
      const { buildStrategicAssetNarrative } = await import("../../business/strategic-asset-narrative");
      const report = buildStrategicAssetNarrative({ contentCount: 200, subscriberCount: 50000, monthlyRevenue: 3000 });
      expect(report.assets.length).toBeGreaterThanOrEqual(5);
      expect(report.totalCurrentValue).toBeGreaterThan(0);
      expect(report.overallNarrative).toBeDefined();
    });
  });

  describe("Monetization Benchmark Intelligence", () => {
    it("benchmarks against niche", async () => {
      const { runMonetizationBenchmark } = await import("../../business/monetization-benchmark");
      const report = runMonetizationBenchmark({ rpm: 5, ctr: 6, revenueStreams: 3 });
      expect(report.comparisons.length).toBeGreaterThanOrEqual(3);
      expect(report.overallPercentile).toBeGreaterThan(0);
    });
  });

  describe("Workflow Wedge Positioning", () => {
    it("analyzes workflow wedges", async () => {
      const { analyzeWorkflowWedges } = await import("../../business/workflow-wedge-positioning");
      const report = analyzeWorkflowWedges();
      expect(report.wedges.length).toBeGreaterThanOrEqual(5);
      expect(report.topWedges.length).toBe(3);
      expect(report.totalTimeSavings).toBeGreaterThan(0);
    });
  });

  describe("First-Party Data Architecture", () => {
    it("builds data architecture and enforces privacy", async () => {
      const { buildFirstPartyDataArchitecture, enforcePrivacyCompliance } = await import("../../business/first-party-data-architecture");
      const report = buildFirstPartyDataArchitecture();
      expect(report.sources.length).toBeGreaterThanOrEqual(4);
      expect(report.complianceScore).toBe(1);

      const compliance = await enforcePrivacyCompliance("user-fpd", report);
      expect(compliance.compliant).toBe(true);
    });

    it("detects non-compliant sources", async () => {
      const { buildFirstPartyDataArchitecture, enforcePrivacyCompliance } = await import("../../business/first-party-data-architecture");
      const report = buildFirstPartyDataArchitecture([
        { name: "Shady Tracker", type: "behavioral", platform: "web", collectionMethod: "pixel", consentLevel: "none", dataPoints: 1000, privacyCompliant: false, retentionDays: 999 },
      ]);
      const compliance = await enforcePrivacyCompliance("user-fpd-bad", report);
      expect(compliance.compliant).toBe(false);
      expect(compliance.violations.length).toBeGreaterThan(0);
    });
  });

  describe("AI Risk-Adjusted Content Strategy", () => {
    it("analyzes content portfolio risk", async () => {
      const { analyzeAIRiskAdjustedStrategy } = await import("../../business/ai-risk-adjusted-content");
      const strategy = analyzeAIRiskAdjustedStrategy([
        { contentType: "walkthrough", currentPercentage: 40, monthlyRevenue: 1000 },
        { contentType: "live_stream", currentPercentage: 30, monthlyRevenue: 800 },
        { contentType: "challenge_run", currentPercentage: 30, monthlyRevenue: 500 },
      ]);
      expect(strategy.adjustments.length).toBe(3);
      expect(strategy.portfolioRisk).toBeGreaterThanOrEqual(0);
      const liveStream = strategy.adjustments.find((a) => a.contentType === "live_stream");
      expect(liveStream?.riskCategory).toBe("low");
    });
  });

  describe("Legal Defense Readiness", () => {
    it("assesses readiness and enforces export approval", async () => {
      const { assessLegalDefenseReadiness, exportLegalDefensePackage } = await import("../../business/legal-defense-readiness");
      const report = assessLegalDefenseReadiness({ hasTermsOfService: true, hasPrivacyPolicy: true });
      expect(report.readinessLevel).toBeDefined();

      const noApproval = exportLegalDefensePackage(report);
      expect(noApproval.approved).toBe(false);

      const withApproval = exportLegalDefensePackage(report, "founder");
      expect(withApproval.approved).toBe(true);
      expect(withApproval.exportedAreas.length).toBeGreaterThan(0);
    });
  });

  describe("Sponsor Operations Cloud", () => {
    it("manages sponsor pipeline", async () => {
      const { addDeal, getSponsorOperationsReport, updateDealStatus } = await import("../../business/sponsor-operations-cloud");
      const deal = addDeal("user-sponsor", {
        brandName: "GamePad Pro",
        status: "outreach",
        dealValue: 500,
        deliverables: ["Integrated mention"],
        notes: "Initial outreach sent",
      });
      expect(deal.id).toBeDefined();

      updateDealStatus("user-sponsor", deal.id, "negotiating");

      const report = getSponsorOperationsReport("user-sponsor", 20000);
      expect(report.pipeline.activeDeals).toBe(1);
      expect(report.rateCard.dedicatedVideo).toBeGreaterThan(0);
    });
  });

  describe("Infrastructure Positioning Intelligence", () => {
    it("analyzes infrastructure positions", async () => {
      const { analyzeInfrastructurePositioning } = await import("../../business/infrastructure-positioning");
      const report = analyzeInfrastructurePositioning();
      expect(report.positions.length).toBeGreaterThanOrEqual(5);
      expect(report.totalMonthlyCost).toBeGreaterThan(0);
      const youtube = report.positions.find((p) => p.currentProvider === "YouTube");
      expect(youtube?.lock_in_risk).toBeGreaterThanOrEqual(0.8);
    });
  });
});
