type Level = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function createLogger(level: Level) {
  const minWeight = LEVEL_WEIGHT[level];

  function shouldLog(target: Level): boolean {
    return LEVEL_WEIGHT[target] >= minWeight;
  }

  return {
    debug: (...args: unknown[]) => {
      if (shouldLog("debug")) console.debug("[DEBUG]", ...args);
    },
    info: (...args: unknown[]) => {
      if (shouldLog("info")) console.info("[INFO]", ...args);
    },
    warn: (...args: unknown[]) => {
      if (shouldLog("warn")) console.warn("[WARN]", ...args);
    },
    error: (...args: unknown[]) => {
      if (shouldLog("error")) console.error("[ERROR]", ...args);
    },
  };
}
