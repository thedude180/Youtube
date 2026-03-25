export interface CompiledSkill {
  name: string;
  version: string;
  triggers: string[];
  actions: string[];
  preconditions: string[];
  source: string;
}

const skillRegistry = new Map<string, CompiledSkill>();

export function compileSkill(
  name: string,
  config: {
    triggers: string[];
    actions: string[];
    preconditions?: string[];
    source?: string;
  },
): CompiledSkill {
  const skill: CompiledSkill = {
    name,
    version: "1.0.0",
    triggers: config.triggers,
    actions: config.actions,
    preconditions: config.preconditions || [],
    source: config.source || "manual",
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

export function seedDefaultSkills(): void {
  compileSkill("highlight-reel-generator", {
    triggers: ["video.uploaded", "stream.ended"],
    actions: ["analyze_audio_energy", "detect_scene_changes", "cut_segments", "concatenate", "upload"],
    preconditions: ["source_video_duration > 900", "storage.write == verified"],
    source: "smart-edit-engine",
  });

  compileSkill("title-optimizer", {
    triggers: ["content.atom.created", "video.draft.ready"],
    actions: ["analyze_seo", "check_brand_alignment", "check_voice", "suggest_title"],
    preconditions: ["trust_budget.title_volatility > 0"],
    source: "seo-lab",
  });

  compileSkill("thumbnail-selector", {
    triggers: ["video.draft.ready"],
    actions: ["generate_variants", "score_thumbnails", "select_best"],
    preconditions: ["brand_safety.score >= 0.6"],
    source: "thumbnail-lab",
  });
}
