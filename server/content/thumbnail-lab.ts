import { db } from "../db";
import { emitDomainEvent } from "../kernel/index";
import { tagProvenance } from "./provenance";

export interface ThumbnailVariant {
  id: string;
  style: string;
  description: string;
  score: number;
  elements: string[];
  colorScheme: string;
}

export async function generateThumbnailVariants(
  userId: string,
  videoTitle: string,
  gameTitle: string,
  options: { count?: number; style?: string } = {},
): Promise<ThumbnailVariant[]> {
  const count = options.count || 3;
  const styles = ["cinematic", "action", "minimal", "dramatic", "clean"];
  const variants: ThumbnailVariant[] = [];

  for (let i = 0; i < count; i++) {
    const style = options.style || styles[i % styles.length];
    variants.push({
      id: `thumb-${Date.now()}-${i}`,
      style,
      description: `${style} thumbnail for "${videoTitle}" - ${gameTitle}`,
      score: 0.6 + Math.random() * 0.35,
      elements: [gameTitle, "gameplay moment", style],
      colorScheme: ["dark-contrast", "vibrant", "muted-cinematic"][i % 3],
    });
  }

  await emitDomainEvent(userId, "thumbnail.variants.generated", {
    videoTitle,
    gameTitle,
    variantCount: variants.length,
  });

  return variants;
}

export function scoreThumbnail(variant: ThumbnailVariant, criteria: {
  clickability?: number;
  brandConsistency?: number;
  readability?: number;
  emotionalImpact?: number;
}): number {
  const weights = { clickability: 0.3, brandConsistency: 0.25, readability: 0.25, emotionalImpact: 0.2 };
  let score = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const value = criteria[key as keyof typeof criteria];
    if (value != null) {
      score += value * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? score / totalWeight : variant.score;
}

export function selectBestThumbnail(variants: ThumbnailVariant[]): ThumbnailVariant | null {
  if (variants.length === 0) return null;
  return variants.reduce((best, v) => v.score > best.score ? v : best, variants[0]);
}
