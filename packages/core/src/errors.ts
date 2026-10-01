/**
 * Domain errors carry a stable code and an i18n message key. Internal details
 * (SQL, provider errors, ids) never reach users (TZ §63).
 */
export type ErrorCode = 'unauthorized' | 'forbidden' | 'not_found' | 'validation' | 'link_expired' | 'internal';

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 400,
  link_expired: 410,
  internal: 500,
};

export class AppError extends Error {
  readonly statusCode: number;
  constructor(readonly code: ErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AppError';
    this.statusCode = STATUS[code];
  }
}
