type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const current = (process.env.LOG_LEVEL as LogLevel) ?? "info";

function format(level: LogLevel, module: string, msg: string, meta?: unknown): string {
  const base: Record<string, unknown> = { ts: new Date().toISOString(), level, module, msg };
  if (meta !== undefined && meta !== null) {
    base.meta = meta instanceof Error ? { message: meta.message, stack: meta.stack } : meta;
  }
  return JSON.stringify(base);
}

export function createLogger(module: string) {
  return {
    debug: (msg: string, meta?: unknown) => {
      if (LEVELS["debug"] >= LEVELS[current]) console.log(format("debug", module, msg, meta));
    },
    info: (msg: string, meta?: unknown) => {
      if (LEVELS["info"] >= LEVELS[current]) console.log(format("info", module, msg, meta));
    },
    warn: (msg: string, meta?: unknown) => {
      if (LEVELS["warn"] >= LEVELS[current]) console.warn(format("warn", module, msg, meta));
    },
    error: (msg: string, meta?: unknown) => {
      if (LEVELS["error"] >= LEVELS[current]) console.error(format("error", module, msg, meta));
    },
  };
}

export const rootLogger = createLogger("app");
