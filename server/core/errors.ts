export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (resource: string) =>
  new AppError(404, "NOT_FOUND", `${resource} not found`);

export const badRequest = (msg: string, details?: Record<string, unknown>) =>
  new AppError(400, "BAD_REQUEST", msg, details);

export const unauthorized = (msg = "Authentication required") =>
  new AppError(401, "UNAUTHORIZED", msg);

export const forbidden = (msg = "Access denied") =>
  new AppError(403, "FORBIDDEN", msg);

export const conflict = (msg: string) =>
  new AppError(409, "CONFLICT", msg);

export const tooManyRequests = (msg = "Too many requests", retryAfter?: number) =>
  new AppError(429, "RATE_LIMITED", msg, retryAfter ? { retryAfter } : undefined);

export const internal = (msg: string) =>
  new AppError(500, "INTERNAL_ERROR", msg);

export function toHttpError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  return internal(msg);
}

export function errorResponse(err: AppError, isProd = false) {
  return {
    error: {
      code: err.code,
      message: err.message,
      ...(isProd && err.statusCode >= 500 ? {} : err.details ? { details: err.details } : {}),
    },
  };
}
