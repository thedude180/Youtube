/**
 * container-memory.ts
 *
 * Container-aware memory measurement.
 *
 * WHY THIS EXISTS
 * ---------------
 * Node's `os.freemem()` / `os.totalmem()` report the HOST machine's memory, not
 * the memory available to THIS container.  On the production deployment the
 * container is capped (cgroup limit ~512 MB–1 GB) while the host may have tens of
 * GB.  Any "free memory %" computed from `os.*` therefore looks abundant even as
 * the container is about to be OOM-killed — so memory gates built on `os.*` never
 * fire before the kernel kills the process.
 *
 * The TRUE signal — the one the OOM killer itself watches — is the cgroup's
 * current usage vs. its limit:
 *   cgroup v2: /sys/fs/cgroup/memory.current  vs  /sys/fs/cgroup/memory.max
 *   cgroup v1: .../memory/memory.usage_in_bytes  vs  .../memory.limit_in_bytes
 *
 * This module reads those files (with safe fallbacks to os.* when cgroup data is
 * unavailable or unlimited) so callers can gate expensive work on real container
 * memory pressure.
 */

import fs from "fs";
import os from "os";

const CG_V2_CURRENT = "/sys/fs/cgroup/memory.current";
const CG_V2_MAX = "/sys/fs/cgroup/memory.max";
const CG_V1_USAGE = "/sys/fs/cgroup/memory/memory.usage_in_bytes";
const CG_V1_LIMIT = "/sys/fs/cgroup/memory/memory.limit_in_bytes";

// cgroup v1 reports "unlimited" as a near-INT64_MAX sentinel.  Anything above
// this (≈8 PB) is treated as "no real limit set".
const UNLIMITED_SENTINEL = 0x7fff_0000_0000_0000;

function readNum(file: string): number | null {
  try {
    const raw = fs.readFileSync(file, "utf-8").trim();
    if (raw === "max") return null; // cgroup v2 "max" = unlimited
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

// The limit does not change for the life of the process — resolve it once.
let _cachedLimitBytes: number | null | undefined;

function resolveLimitBytes(): number {
  if (_cachedLimitBytes !== undefined && _cachedLimitBytes !== null) {
    return _cachedLimitBytes;
  }

  let limit = readNum(CG_V2_MAX) ?? readNum(CG_V1_LIMIT);

  // Treat unlimited / unreadable / absurdly-large limits as "use host total".
  if (limit === null || limit >= UNLIMITED_SENTINEL || limit > os.totalmem()) {
    limit = os.totalmem();
  }

  _cachedLimitBytes = limit;
  return limit;
}

function readUsageBytes(): number {
  // Prefer cgroup current usage (matches the OOM killer's view).  Fall back to
  // process RSS, then to host used-memory, so we always return *something* sane.
  const cgUsage = readNum(CG_V2_CURRENT) ?? readNum(CG_V1_USAGE);
  if (cgUsage !== null) return cgUsage;

  try {
    return process.memoryUsage().rss;
  } catch {
    return os.totalmem() - os.freemem();
  }
}

export interface ContainerMemory {
  usageBytes: number;
  limitBytes: number;
  /** Absolute bytes still available within the container limit. */
  freeBytes: number;
  /** Fraction of the container limit currently in use (0–1). */
  usedRatio: number;
  /** Fraction of the container limit still free (0–1). */
  freeRatio: number;
}

/**
 * Returns container-aware memory usage.  Always cheap (small sysfs reads) and
 * never throws — falls back to host/process metrics if cgroup data is missing.
 */
export function getContainerMemory(): ContainerMemory {
  const limitBytes = resolveLimitBytes();
  const usageBytes = readUsageBytes();
  const usedRatio = limitBytes > 0 ? Math.min(1, usageBytes / limitBytes) : 0;
  return {
    usageBytes,
    limitBytes,
    freeBytes: Math.max(0, limitBytes - usageBytes),
    usedRatio,
    freeRatio: 1 - usedRatio,
  };
}

/**
 * Minimum free memory (bytes) required before spawning a yt-dlp / ffmpeg
 * subprocess.  These tools allocate ~80–150 MB at startup; on a small container
 * an 85% ratio gate can still leave less headroom than that, so callers also
 * enforce this absolute floor.
 */
export const MIN_SPAWN_HEADROOM_BYTES = 200 * 1024 * 1024;

/**
 * True when there is enough free container memory to safely spawn a
 * download/encode subprocess — guards against OOM on small containers where the
 * ratio gate alone leaves insufficient absolute headroom.
 */
export function hasSpawnHeadroom(mem: ContainerMemory = getContainerMemory()): boolean {
  return mem.freeBytes >= MIN_SPAWN_HEADROOM_BYTES;
}
