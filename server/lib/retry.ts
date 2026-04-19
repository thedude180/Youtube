import { createLogger } from "./logger";

const logger = createLogger("retry");
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelay?: number; label?: string; timeoutMs?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelay = 1000, label = "API call", timeoutMs = 15000 } = options;
  let lastError: Error | unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 500;
        logger.error(`[Retry] ${label} attempt ${attempt}/${maxAttempts} failed, retrying in ${Math.round(delay)}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
