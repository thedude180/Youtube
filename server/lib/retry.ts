export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelay?: number; label?: string } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelay = 1000, label = "API call" } = options;
  let lastError: Error | unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 500;
        console.error(`[Retry] ${label} attempt ${attempt}/${maxAttempts} failed, retrying in ${Math.round(delay)}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
