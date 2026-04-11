import { describe, it, expect } from "vitest";
import {
  profileSourceQuality,
  getPlatformCapability,
  getEffectiveMaxResolution,
  computeMezzanineMaster,
  evaluateUpscale,
  computeOutputLadder,
  assessQualityGovernor,
  explainQualityDecision,
  getExportQualityRecommendation,
} from "../resolution-intelligence";

describe("Resolution Intelligence — v15.2.a17", () => {

  describe("Source Quality Profiler", () => {
    it("should classify native 1080p source correctly", () => {
      const analysis = profileSourceQuality({
        resolution: "1080p", fps: 60, aspectRatio: "16:9",
      });
      expect(analysis.sourceResolution).toBe("1080p");
      expect(analysis.sourceFps).toBe(60);
      expect(analysis.nativeVsWeakClassification).toBe("native");
      expect(analysis.upscaleEligibilityScore).toBeGreaterThan(0.3);
      expect(analysis.archiveMasterRecommendation).toBe("1080p");
    });

    it("should classify weak source with high compression artifacts", () => {
      const analysis = profileSourceQuality({
        resolution: "720p", fps: 30, compressionArtifacts: 0.8,
      });
      expect(analysis.nativeVsWeakClassification).toBe("weak");
      expect(analysis.upscaleEligibilityScore).toBeLessThan(0.5);
    });

    it("should detect HDR and scene complexity", () => {
      const analysis = profileSourceQuality({
        resolution: "2160p", fps: 60, hdr: true, sceneComplexity: 0.9,
        motionIntensity: 0.8,
      });
      expect(analysis.hdrDetected).toBe(true);
      expect(analysis.sceneComplexity).toBe(0.9);
      expect(analysis.motionIntensity).toBe(0.8);
    });

    it("should compute live ladder recommendation with upscale target", () => {
      const analysis = profileSourceQuality({
        resolution: "1080p", fps: 60,
      });
      expect(analysis.liveLadderRecommendation).toBeDefined();
      expect(analysis.liveLadderRecommendation.nativeOutput).toBe("1080p");
    });
  });

  describe("Platform Resolution Registry", () => {
    it("should return YouTube 4K capability", () => {
      const cap = getPlatformCapability("youtube");
      expect(cap.maxResolution).toBe("2160p");
      expect(cap.maxFps).toBe(60);
      expect(cap.codecs).toContain("h264");
      expect(cap.stale).toBe(false);
    });

    it("should cap Kick at 1080p", () => {
      const cap = getPlatformCapability("kick");
      expect(cap.maxResolution).toBe("1080p");
    });

    it("should degrade unknown platform to conservative defaults", () => {
      const cap = getPlatformCapability("unknownplatform");
      expect(cap.maxResolution).toBe("1080p");
      expect(cap.stale).toBe(true);
    });

    it("should enforce latency mode constraints on YouTube", () => {
      const ultraLow = getEffectiveMaxResolution("youtube", "ultra-low");
      const normal = getEffectiveMaxResolution("youtube", "normal");
      expect(ultraLow).toBe("1080p");
      expect(normal).toBe("2160p");
    });

    it("should enforce latency mode constraints on Twitch", () => {
      const ultraLow = getEffectiveMaxResolution("twitch", "ultra-low");
      expect(ultraLow).toBe("720p");
    });
  });

  describe("Mezzanine Master Stream Manager", () => {
    it("should preserve native source resolution as master", () => {
      const source = profileSourceQuality({ resolution: "1080p", fps: 60 });
      const master = computeMezzanineMaster(source, ["youtube", "kick", "twitch"]);
      expect(master.masterResolution).toBe("1080p");
      expect(master.nativeOrEnhanced).toBe("native");
      expect(master.masterFps).toBe(60);
    });

    it("should not let a weak destination cap reduce master quality", () => {
      const source = profileSourceQuality({ resolution: "1080p", fps: 60 });
      const master = computeMezzanineMaster(source, ["tiktok"]);
      expect(master.masterResolution).toBe("1080p");
    });
  });

  describe("Live Upscale Orchestrator", () => {
    it("should approve upscale from 1080p to 1440p on YouTube with healthy headroom", () => {
      const source = profileSourceQuality({ resolution: "1080p", fps: 60 });
      const decision = evaluateUpscale(source, "youtube", "normal", { gpu: 0.8, cpu: 0.8, bandwidth: 0.8 });
      expect(decision.shouldUpscale).toBe(true);
      expect(decision.targetResolution).toBe("1440p");
      expect(decision.method).toBe("super-resolution");
      expect(decision.confidence).toBeGreaterThan(0.3);
    });

    it("should block upscale when GPU headroom is dangerously low", () => {
      const source = profileSourceQuality({ resolution: "1080p", fps: 60 });
      const decision = evaluateUpscale(source, "youtube", "normal", { gpu: 0.1, cpu: 0.8, bandwidth: 0.8 });
      expect(decision.shouldUpscale).toBe(false);
      expect(decision.reason).toContain("headroom");
    });

    it("should block upscale when source is weak", () => {
      const source = profileSourceQuality({ resolution: "480p", fps: 30, compressionArtifacts: 0.9 });
      const decision = evaluateUpscale(source, "youtube", "normal", { gpu: 0.8, cpu: 0.8, bandwidth: 0.8 });
      expect(decision.shouldUpscale).toBe(false);
    });

    it("should not upscale when source already meets platform max", () => {
      const source = profileSourceQuality({ resolution: "1080p", fps: 60 });
      const decision = evaluateUpscale(source, "kick", "normal", { gpu: 0.8, cpu: 0.8, bandwidth: 0.8 });
      expect(decision.shouldUpscale).toBe(false);
      expect(decision.reason).toContain("meets or exceeds");
    });

    it("should enforce one-step-only upscale by default", () => {
      const source = profileSourceQuality({ resolution: "720p", fps: 60 });
      const decision = evaluateUpscale(source, "youtube", "normal", { gpu: 0.8, cpu: 0.8, bandwidth: 0.8 });
      if (decision.shouldUpscale) {
        expect(decision.targetResolution).toBe("900p");
      }
    });
  });

  describe("Destination Output Ladder Router", () => {
    it("should compute per-destination output profiles", () => {
      const source = profileSourceQuality({ resolution: "1080p", fps: 60 });
      const ladder = computeOutputLadder(source, ["youtube", "kick", "twitch"], "normal", { gpu: 0.8, cpu: 0.8, bandwidth: 0.8 });
      expect(ladder.length).toBe(3);

      const youtube = ladder.find(l => l.destination === "youtube");
      const kick = ladder.find(l => l.destination === "kick");
      expect(youtube).toBeDefined();
      expect(kick).toBeDefined();
      expect(kick!.outputResolution).toBe("1080p");
    });

    it("should not exceed platform ceiling", () => {
      const source = profileSourceQuality({ resolution: "2160p", fps: 60 });
      const ladder = computeOutputLadder(source, ["kick", "tiktok"], "normal", { gpu: 0.8, cpu: 0.8, bandwidth: 0.8 });
      for (const entry of ladder) {
        const cap = getPlatformCapability(entry.destination);
        expect(entry.outputFps).toBeLessThanOrEqual(cap.maxFps);
      }
    });

    it("should respect user allowUpscale=false preference", () => {
      const source = profileSourceQuality({ resolution: "1080p", fps: 60 });
      const ladder = computeOutputLadder(
        source, ["youtube"], "normal", { gpu: 0.8, cpu: 0.8, bandwidth: 0.8 },
        { youtube: { allowUpscale: false } },
      );
      expect(ladder[0].nativeOrEnhanced).toBe("native");
      expect(ladder[0].outputResolution).toBe("1080p");
    });
  });

  describe("Live Quality Governor", () => {
    it("should return nominal state for healthy metrics", () => {
      const assessment = assessQualityGovernor({
        droppedFrames: 0, encoderLagMs: 10, bandwidthPressure: 0.2,
        gpuPressure: 0.3, cpuPressure: 0.3, upscaleActive: false,
        currentResolution: "1080p",
      });
      expect(assessment.state).toBe("nominal");
      expect(assessment.actions.length).toBe(0);
    });

    it("should enter caution and disable upscale on moderate pressure", () => {
      const assessment = assessQualityGovernor({
        droppedFrames: 10, encoderLagMs: 120, bandwidthPressure: 0.65,
        gpuPressure: 0.5, cpuPressure: 0.5, upscaleActive: true,
        currentResolution: "1440p",
      });
      expect(assessment.state).toBe("caution");
      expect(assessment.actions.some(a => a.type === "disable_upscale")).toBe(true);
    });

    it("should enter emergency on severe pressure with multiple actions", () => {
      const assessment = assessQualityGovernor({
        droppedFrames: 60, encoderLagMs: 600, bandwidthPressure: 0.95,
        gpuPressure: 0.96, cpuPressure: 0.9, upscaleActive: true,
        currentResolution: "1440p",
      });
      expect(assessment.state).toBe("emergency");
      expect(assessment.actions.some(a => a.type === "disable_upscale")).toBe(true);
      expect(assessment.actions.some(a => a.type === "reduce_bitrate")).toBe(true);
      expect(assessment.actions.some(a => a.type === "reduce_resolution")).toBe(true);
    });

    it("should degrade step by step: upscale first, then bitrate, then resolution", () => {
      const degraded = assessQualityGovernor({
        droppedFrames: 25, encoderLagMs: 250, bandwidthPressure: 0.8,
        gpuPressure: 0.85, cpuPressure: 0.6, upscaleActive: true,
        currentResolution: "1440p",
      });
      expect(degraded.state).toBe("degraded");
      const actionTypes = degraded.actions.map(a => a.type);
      expect(actionTypes[0]).toBe("disable_upscale");
      expect(actionTypes).toContain("reduce_bitrate");
    });
  });

  describe("Resolution Truth + Explanation Layer", () => {
    it("should explain quality decision with full context", () => {
      const source = profileSourceQuality({ resolution: "1080p", fps: 60 });
      const ladder = computeOutputLadder(source, ["youtube"], "normal", { gpu: 0.8, cpu: 0.8, bandwidth: 0.8 });
      const explanation = explainQualityDecision(source, ladder[0], { gpu: 0.8, cpu: 0.8, bandwidth: 0.8 });

      expect(explanation.sourceResolution).toBe("1080p");
      expect(explanation.outputResolution).toBeDefined();
      expect(["native", "enhanced"]).toContain(explanation.nativeOrEnhanced);
      expect(explanation.reasoning).toContain("Source: 1080p");
      expect(explanation.platformConstraints).toBeDefined();
      expect(explanation.platformConstraints.maxResolution).toBe("2160p");
      expect(["low", "medium", "high"]).toContain(explanation.riskLevel);
    });

    it("should show enhanced label and rollback path for upscaled output", () => {
      const source = profileSourceQuality({ resolution: "1080p", fps: 60 });
      const entry = {
        destination: "youtube", outputResolution: "1440p", outputFps: 60,
        bitrate: 9000, codec: "h264", nativeOrEnhanced: "enhanced" as const,
        latencyMode: "normal", confidence: 0.7,
      };
      const explanation = explainQualityDecision(source, entry, { gpu: 0.8, cpu: 0.8, bandwidth: 0.8 });
      expect(explanation.nativeOrEnhanced).toBe("enhanced");
      expect(explanation.rollbackPath).toContain("1080p");
      expect(explanation.reasoning).toContain("Upscaled");
    });
  });

  describe("Content Export Quality", () => {
    it("should recommend upscale for VOD when source quality is good", () => {
      const source = profileSourceQuality({ resolution: "1080p", fps: 60 });
      const rec = getExportQualityRecommendation(source, "vod");
      expect(rec.recommendedResolution).toBe("2160p");
      expect(rec.upscaleRecommended).toBe(true);
    });

    it("should keep native resolution for shorts and clips", () => {
      const source = profileSourceQuality({ resolution: "1080p", fps: 60 });
      const shortRec = getExportQualityRecommendation(source, "short");
      expect(shortRec.upscaleRecommended).toBe(false);
      expect(shortRec.recommendedResolution).toBe("1080p");
    });
  });

  describe("Platform-Specific Rules", () => {
    it("YouTube: low-latency blocks 4K, degrades to best valid", () => {
      const effectiveMax = getEffectiveMaxResolution("youtube", "low");
      expect(effectiveMax).toBe("1440p");
    });

    it("Kick: stable 1080p60 H.264 CBR preferred", () => {
      const cap = getPlatformCapability("kick");
      expect(cap.maxResolution).toBe("1080p");
      expect(cap.maxFps).toBe(60);
      expect(cap.codecs).toContain("h264");

      const source = profileSourceQuality({ resolution: "1080p", fps: 60 });
      const ladder = computeOutputLadder(source, ["kick"], "normal", { gpu: 0.8, cpu: 0.8, bandwidth: 0.8 });
      expect(ladder[0].outputResolution).toBe("1080p");
      expect(ladder[0].nativeOrEnhanced).toBe("native");
    });

    it("TikTok: caps at 30fps and 1080p", () => {
      const cap = getPlatformCapability("tiktok");
      expect(cap.maxFps).toBe(30);

      const source = profileSourceQuality({ resolution: "1080p", fps: 60 });
      const ladder = computeOutputLadder(source, ["tiktok"], "normal", { gpu: 0.8, cpu: 0.8, bandwidth: 0.8 });
      expect(ladder[0].outputFps).toBe(30);
    });
  });

  describe("Archive Preservation", () => {
    it("should preserve best master even when destinations are weaker", () => {
      const source = profileSourceQuality({ resolution: "1080p", fps: 60 });
      const master = computeMezzanineMaster(source, ["tiktok", "kick"]);
      expect(master.masterResolution).toBe("1080p");
      expect(master.masterFps).toBe(60);
    });
  });

  describe("End-to-end Decision Flow", () => {
    it("should produce a complete quality decision trace", () => {
      const source = profileSourceQuality({ resolution: "1080p", fps: 60, motionIntensity: 0.6 });
      const headroom = { gpu: 0.75, cpu: 0.7, bandwidth: 0.8 };
      const destinations = ["youtube", "kick", "twitch"];
      const ladder = computeOutputLadder(source, destinations, "normal", headroom);
      const explanations = ladder.map(e => explainQualityDecision(source, e, headroom));
      const master = computeMezzanineMaster(source, destinations);

      expect(ladder.length).toBe(3);
      expect(explanations.length).toBe(3);
      expect(master.masterResolution).toBe("1080p");

      for (const exp of explanations) {
        expect(exp.reasoning.length).toBeGreaterThan(0);
        expect(exp.confidence).toBeGreaterThan(0);
        expect(["low", "medium", "high"]).toContain(exp.riskLevel);
      }

      const gov = assessQualityGovernor({
        droppedFrames: 2, encoderLagMs: 30, bandwidthPressure: 0.3,
        gpuPressure: 0.4, cpuPressure: 0.35, upscaleActive: false,
        currentResolution: "1080p",
      });
      expect(gov.state).toBe("nominal");
    });
  });
});