/**
 * prompt-loader.ts
 *
 * Closes the dead loop: prompt-evolution-engine (and internet-benchmark-engine,
 * autonomous-capability-engine) write evolved prompts to promptVersions, but
 * content generators were reading hardcoded strings. This module makes content
 * generators actually USE the evolved prompts.
 *
 * Usage:
 *   const loaded = await loadActivePrompt("seo_optimization", { systemPrompt: FALLBACK });
 *   // loaded.systemPrompt is the latest evolved version (or FALLBACK if none exists yet)
 *   // loaded.isEvolved tells you whether AI evolution has kicked in yet
 */

import { db } from "../db";
import { promptVersions } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { createLogger } from "./logger";

const logger = createLogger("prompt-loader");

interface CachedPrompt {
  systemPrompt: string | null;
  userPromptTemplate: string | null;
  version: number;
  cachedAt: number;
}

const _cache = new Map<string, CachedPrompt>();
const CACHE_TTL_MS = 10 * 60_000; // 10 minutes — prompt evolution runs every 90 min

export interface LoadedPrompt {
  systemPrompt: string | null;
  userPromptTemplate: string | null;
  version: number;
  isEvolved: boolean;
}

/**
 * Load the active evolved prompt for a given key.
 * Falls back to `defaults` if no evolved version exists in the DB yet.
 * Results are cached for 10 minutes to avoid per-request DB queries.
 */
export async function loadActivePrompt(
  promptKey: string,
  defaults: { systemPrompt?: string; userPromptTemplate?: string } = {},
): Promise<LoadedPrompt> {
  const hit = _cache.get(promptKey);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
    return {
      systemPrompt: hit.systemPrompt ?? defaults.systemPrompt ?? null,
      userPromptTemplate: hit.userPromptTemplate ?? defaults.userPromptTemplate ?? null,
      version: hit.version,
      isEvolved: true,
    };
  }

  try {
    const [row] = await db
      .select({
        systemPrompt: promptVersions.systemPrompt,
        userPromptTemplate: promptVersions.userPromptTemplate,
        version: promptVersions.version,
      })
      .from(promptVersions)
      .where(and(eq(promptVersions.promptKey, promptKey), eq(promptVersions.status, "active")))
      .orderBy(desc(promptVersions.version))
      .limit(1);

    if (row) {
      _cache.set(promptKey, {
        systemPrompt: row.systemPrompt,
        userPromptTemplate: row.userPromptTemplate,
        version: row.version,
        cachedAt: Date.now(),
      });
      logger.debug(`[PromptLoader] ${promptKey} v${row.version} (evolved)`);
      return {
        systemPrompt: row.systemPrompt ?? defaults.systemPrompt ?? null,
        userPromptTemplate: row.userPromptTemplate ?? defaults.userPromptTemplate ?? null,
        version: row.version,
        isEvolved: true,
      };
    }
  } catch (err: any) {
    logger.debug(`[PromptLoader] DB miss for "${promptKey}": ${err.message?.slice(0, 60)}`);
  }

  return {
    systemPrompt: defaults.systemPrompt ?? null,
    userPromptTemplate: defaults.userPromptTemplate ?? null,
    version: 1,
    isEvolved: false,
  };
}

/** Evict a specific key so the next call re-fetches from DB */
export function invalidatePromptCache(promptKey: string): void {
  _cache.delete(promptKey);
}

/** Evict ALL cached prompts (call on server restart or after bulk evolution) */
export function invalidateAllPromptCaches(): void {
  _cache.clear();
}
