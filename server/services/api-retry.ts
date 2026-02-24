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
  if (error?.status === 429 || error?.status === 503 || error?.status === 502 || error?.status === 504 || error?.status === 408) return true;
  if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || error?.code === 'ENOTFOUND' || error?.code === 'EPIPE' || error?.code === 'EHOSTUNREACH' || error?.code === 'ECONNREFUSED') return true;
  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('rate limit') || msg.includes('timeout') || msg.includes('socket hang up') || msg.includes('network') || msg.includes('fetch failed') || msg.includes('connection') || msg.includes('aborted')) return true;
  return false;
}

export async function withRetryUpload<T>(
  fn: () => Promise<T>,
  label: string,
  options: RetryOptions = {}
): Promise<T> {
  return withRetry(fn, label, {
    maxRetries: options.maxRetries ?? 5,
    baseDelay: options.baseDelay ?? 2000,
    maxDelay: options.maxDelay ?? 60000,
    retryOn: options.retryOn ?? ((error) => {
      if (error?.nonRetryable) return false;
      return isTransientError(error);
    }),
  });
}
