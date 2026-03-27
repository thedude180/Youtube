import { emitDomainEvent } from "./index";

export interface CompiledSkill {
  name: string;
  version: string;
  triggers: string[];
  actions: string[];
  preconditions: string[];
  source: string;
  category?: "content" | "seo" | "distribution" | "monetization" | "live_ops" | "analytics" | "growth";
  confidence?: number;
  learnedRules?: LearnedRule[];
  compiledAt?: Date;
}

export interface LearnedRule {
  condition: string;
  action: string;
  weight: number;
  learnedFrom: string;
}

const skillRegistry = new Map<string, CompiledSkill>();

export function compileSkill(
  name: string,
  config: {
    triggers: string[];
    actions: string[];
    preconditions?: string[];
    source?: string;
    category?: CompiledSkill["category"];
    learnedSignals?: { signal: string; outcome: string; confidence: number }[];
  },
): CompiledSkill {
  const existing = skillRegistry.get(name);
  const versionNum = existing ? parseInt(existing.version.split(".")[0] || "1") + 1 : 1;

  const learnedRules: LearnedRule[] = (config.learnedSignals || [])
    .filter((s) => s.confidence > 0.3)
    .map((s) => ({
      condition: `when ${s.signal}`,
      action: s.outcome,
      weight: s.confidence,
      learnedFrom: s.signal,
    }));

  const confidence = config.learnedSignals && config.learnedSignals.length > 0
    ? config.learnedSignals.reduce((sum, s) => sum + s.confidence, 0) / config.learnedSignals.length
    : undefined;

  const skill: CompiledSkill = {
    name,
    version: `${versionNum}.0.0`,
    triggers: config.triggers,
    actions: config.actions,
    preconditions: config.preconditions || [],
    source: config.source || "manual",
    category: config.category,
    confidence,
    learnedRules: learnedRules.length > 0 ? learnedRules : undefined,
    compiledAt: new Date(),
  };

  skillRegistry.set(name, skill);
  return skill;
}

export function getSkillRegistry(): CompiledSkill[] {
  return Array.from(skillRegistry.values());
}

export function getSkill(name: string): CompiledSkill | null {
  return skillRegistry.get(name) || null;
}

export function getSkillsByCategory(category: CompiledSkill["category"]): CompiledSkill[] {
  return Array.from(skillRegistry.values()).filter((s) => s.category === category);
}

export async function compileAndEmit(
  userId: string,
  name: string,
  config: Parameters<typeof compileSkill>[1]
): Promise<CompiledSkill> {
  const skill = compileSkill(name, config);

  try {
    await emitDomainEvent(userId, "skill.compiled", {
      skillName: name,
      version: skill.version,
      category: skill.category,
      confidence: skill.confidence,
      ruleCount: skill.learnedRules?.length || 0,
    }, "skill-compiler", name);
  } catch (_) {}

  return skill;
}

export function seedDefaultSkills(): void {
  compileSkill("highlight-reel-generator", {
    triggers: ["video.uploaded", "stream.ended"],
    actions: ["analyze_audio_energy", "detect_scene_changes", "cut_segments", "concatenate", "upload"],
    preconditions: ["source_video_duration > 900", "storage.write == verified"],
    source: "smart-edit-engine",
    category: "content",
  });

  compileSkill("title-optimizer", {
    triggers: ["content.atom.created", "video.draft.ready"],
    actions: ["analyze_seo", "check_brand_alignment", "check_voice", "suggest_title"],
    preconditions: ["trust_budget.title_volatility > 0"],
    source: "seo-lab",
    category: "seo",
  });

  compileSkill("thumbnail-selector", {
    triggers: ["video.draft.ready"],
    actions: ["generate_variants", "score_thumbnails", "select_best"],
    preconditions: ["brand_safety.score >= 0.6"],
    source: "thumbnail-lab",
    category: "content",
  });

  compileSkill("live-moment-clipper", {
    triggers: ["stream.moment.captured"],
    actions: ["extract_segment", "enhance_audio", "generate_thumbnail", "queue_for_review"],
    preconditions: ["moment.intensity >= 0.7", "storage.write == verified"],
    source: "moment-capture",
    category: "live_ops",
  });

  compileSkill("distribution-packager", {
    triggers: ["video.published"],
    actions: ["analyze_platforms", "adapt_metadata", "schedule_cross_post"],
    preconditions: ["platform_capability.verified"],
    source: "distribution-os",
    category: "distribution",
  });
}
