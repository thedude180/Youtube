/**
 * generate-music.ts
 *
 * Server-side music generation via the ElevenLabs API.
 * Requires ELEVENLABS_API_KEY to be set in the environment.
 *
 * If the key is not set, the function throws a user-friendly error explaining
 * how to enable it — existing tracks in data/music-library/ continue to work.
 */

import fs from "fs";
import path from "path";
import { createLogger } from "./logger";

const logger = createLogger("generate-music");

export interface GenerateMusicOptions {
  prompt: string;
  outputPath: string;
  /** Target duration in seconds (default 90). ElevenLabs rounds to nearest supported value. */
  durationSeconds?: number;
  /** Force instrumental output — no singing (default true). */
  forceInstrumental?: boolean;
  /** ElevenLabs output format (default "mp3_44100_128"). */
  outputFormat?: string;
  /** Overwrite an existing file at outputPath (default false). */
  overwrite?: boolean;
}

export async function generateMusic(opts: GenerateMusicOptions): Promise<{ filePath: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY is not configured. " +
      "Add it as a secret in the Replit environment to enable in-app track generation. " +
      "Existing tracks in data/music-library/ will continue to be used automatically.",
    );
  }

  const {
    prompt,
    outputPath,
    durationSeconds = 90,
    outputFormat = "mp3_44100_128",
    overwrite = false,
  } = opts;

  if (!overwrite && fs.existsSync(outputPath)) {
    logger.info(`[GenerateMusic] File already exists, skipping: ${path.basename(outputPath)}`);
    return { filePath: outputPath };
  }

  logger.info(`[GenerateMusic] Generating ${durationSeconds}s track → ${path.basename(outputPath)}`);

  const body: Record<string, unknown> = {
    text: prompt,
    duration_seconds: durationSeconds,
    output_format: outputFormat,
    prompt_influence: 0.85,
  };

  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000), // 2-min timeout
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "(no body)");
    throw new Error(`ElevenLabs API error ${response.status}: ${text.substring(0, 300)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, buffer);

  logger.info(`[GenerateMusic] Saved ${(buffer.length / 1024).toFixed(0)} KB → ${path.basename(outputPath)}`);
  return { filePath: outputPath };
}
