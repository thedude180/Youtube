export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function createErrorResponse(error: AppError, requestId?: string, isProduction?: boolean) {
  // In production mode, strip details field for 500+ status codes
  const shouldStripDetails = isProduction && error.statusCode >= 500;
  
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(!shouldStripDetails && error.details ? { details: error.details } : {}),
      ...(requestId ? { requestId } : {}),
    }
  };
}

export function notFound(resource: string) {
  return new AppError(404, 'NOT_FOUND', `${resource} not found`);
}

export function badRequest(message: string, details?: Record<string, any>) {
  return new AppError(400, 'BAD_REQUEST', message, details);
}

export function unauthorized(message = 'Authentication required') {
  return new AppError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'Access denied') {
  return new AppError(403, 'FORBIDDEN', message);
}

export function tooManyRequests(message = 'Too many requests', retryAfter?: number) {
  return new AppError(429, 'RATE_LIMITED', message, retryAfter ? { retryAfter } : undefined);
}

export function conflict(message: string) {
  return new AppError(409, 'CONFLICT', message);
}
