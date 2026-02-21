import { createLogger } from "../lib/logger";

const logger = createLogger("api-retry");

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryOn?: (error: any, attempt: number) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 30000, retryOn } = options;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      if (attempt === maxRetries) break;
      
      const isRetryable = retryOn 
        ? retryOn(error, attempt) 
        : isTransientError(error);
      
      if (!isRetryable) break;

      const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 500, maxDelay);
      logger.warn(`${label} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms`, {
        error: error.message || String(error),
        attempt: attempt + 1,
      });
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError;
}

function isTransientError(error: any): boolean {
  if (error?.status === 429 || error?.status === 503 || error?.status === 502) return true;
  if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || error?.code === 'ENOTFOUND') return true;
  if (error?.message?.includes('rate limit') || error?.message?.includes('timeout')) return true;
  return false;
}
