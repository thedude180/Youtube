type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "warn";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function normaliseMeta(meta: unknown): Record<string, any> | undefined {
  if (meta === undefined || meta === null) return undefined;
  if (meta instanceof Error) return { message: meta.message, stack: meta.stack };
  if (typeof meta === "object" && !Array.isArray(meta)) return meta as Record<string, any>;
  return { value: String(meta) };
}

function formatLog(level: LogLevel, module: string, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const normalisedMeta = normaliseMeta(meta);
  const base: Record<string, any> = { timestamp, level, module, message };
  if (normalisedMeta !== undefined) base.meta = normalisedMeta;
  return JSON.stringify(base);
}

export function createLogger(module: string) {
  return {
    debug: (msg: string, meta?: unknown) => {
      if (shouldLog("debug")) console.log(formatLog("debug", module, msg, meta));
    },
    info: (msg: string, meta?: unknown) => {
      if (shouldLog("info")) console.log(formatLog("info", module, msg, meta));
    },
    warn: (msg: string, meta?: unknown) => {
      if (shouldLog("warn")) console.warn(formatLog("warn", module, msg, meta));
    },
    error: (msg: string, meta?: unknown) => {
      if (shouldLog("error")) console.error(formatLog("error", module, msg, meta));
    },
  };
}

export const logger = createLogger("express");
