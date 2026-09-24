export class AppError extends Error {
  constructor(message, options = {}) {
    // TODO
  }
}

export class ValidationError extends AppError {}

export class NotFoundError extends AppError {}

export function isRetryable(error) {
  // TODO
}
