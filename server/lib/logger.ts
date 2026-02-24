type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "warn";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatLog(level: LogLevel, module: string, message: string, meta?: Record<string, any>): string {
  const timestamp = new Date().toISOString();
  const base = { timestamp, level, module, message, ...meta };
  return JSON.stringify(base);
}

export function createLogger(module: string) {
  return {
    debug: (msg: string, meta?: Record<string, any>) => {
      if (shouldLog("debug")) console.log(formatLog("debug", module, msg, meta));
    },
    info: (msg: string, meta?: Record<string, any>) => {
      if (shouldLog("info")) console.log(formatLog("info", module, msg, meta));
    },
    warn: (msg: string, meta?: Record<string, any>) => {
      if (shouldLog("warn")) console.warn(formatLog("warn", module, msg, meta));
    },
    error: (msg: string, meta?: Record<string, any>) => {
      if (shouldLog("error")) console.error(formatLog("error", module, msg, meta));
    },
  };
}

export const logger = createLogger("express");
