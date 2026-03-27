import { appendEvent } from "../kernel/creator-intelligence-graph";

export interface FounderStoryElement {
  phase: "origin" | "struggle" | "breakthrough" | "growth" | "vision";
  narrative: string;
  evidence: string[];
  emotionalArc: number;
}

export interface FounderStory {
  channelId: string;
  elements: FounderStoryElement[];
  completeness: number;
  lastGenerated: Date;
  useCases: string[];
}

export function generateFounderStory(
  channelId: string,
  facts: { phase: FounderStoryElement["phase"]; narrative: string; evidence: string[] }[]
): FounderStory {
  const elements: FounderStoryElement[] = facts.map((f, i) => ({
    ...f,
    emotionalArc: (i + 1) / facts.length,
  }));

  const requiredPhases: FounderStoryElement["phase"][] = ["origin", "struggle", "breakthrough", "growth", "vision"];
  const presentPhases = new Set(elements.map((e) => e.phase));
  const completeness = requiredPhases.filter((p) => presentPhases.has(p)).length / requiredPhases.length;

  const useCases: string[] = [];
  if (completeness >= 0.6) useCases.push("sponsor_pitch", "about_page", "media_kit");
  if (completeness >= 0.8) useCases.push("investor_deck", "brand_partnerships");
  if (completeness >= 1.0) useCases.push("living_prospectus", "acquisition_narrative");

  appendEvent("brand.recognition_change", "business", channelId, {
    storyCompleteness: completeness,
    elementCount: elements.length,
  }, "founder-story-generator");

  return {
    channelId,
    elements,
    completeness,
    lastGenerated: new Date(),
    useCases,
  };
}

export function getStoryCompleteness(story: FounderStory): { complete: string[]; missing: string[] } {
  const required: FounderStoryElement["phase"][] = ["origin", "struggle", "breakthrough", "growth", "vision"];
  const present = new Set(story.elements.map((e) => e.phase));
  return {
    complete: required.filter((p) => present.has(p)),
    missing: required.filter((p) => !present.has(p)),
  };
}
