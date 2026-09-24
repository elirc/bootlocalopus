export class AppError extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    // new.target is the concrete subclass being constructed.
    this.name = new.target.name;
    this.code = options.code ?? 'APP_ERROR';
    this.status = options.status ?? 500;
    if (Error.captureStackTrace) Error.captureStackTrace(this, new.target);
  }

  toJSON() {
    return { name: this.name, message: this.message, code: this.code, status: this.status };
  }
}

export class ValidationError extends AppError {
  constructor(message, fields = {}) {
    super(message, { code: 'VALIDATION', status: 400 });
    this.fields = fields;
  }

  toJSON() {
    return { ...super.toJSON(), fields: this.fields };
  }
}

export class NotFoundError extends AppError {
  constructor(resource, id) {
    super(resource + ' ' + id + ' not found', { code: 'NOT_FOUND', status: 404 });
    this.resource = resource;
    this.id = id;
  }
}

export function isRetryable(error) {
  const status = error?.status;
  return status == null || status >= 500;
}
