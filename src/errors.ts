/** Base class of every error this SDK throws. */
export class FizError extends Error {
  override name = 'FizError';
}

export interface FizApiErrorInit {
  status: number;
  body: unknown;
  headers: Headers;
  method: string;
  path: string;
  idempotencyKey: string | undefined;
}

/**
 * The API answered with a 4xx or 5xx status. Branch on `status` and `code`;
 * `message` is for people and its wording may change.
 */
export class FizApiError extends FizError {
  override name = 'FizApiError';
  /** HTTP status of the response. */
  readonly status: number;
  /**
   * Stable, machine-readable reason, when the invoicing system refused the
   * request (e.g. `ENTITY_NOT_FOUND`). Absent on request validation and
   * authentication errors.
   */
  readonly code: string | undefined;
  /** Every message of the response: one per field when validation fails. */
  readonly messages: string[];
  /** `X-Request-Id` of the response. Quote it when contacting FIZ support. */
  readonly requestId: string | undefined;
  /**
   * The Idempotency-Key the request carried, if it was a write. After a 409
   * whose outcome is unknown, check whether the write took effect before
   * retrying with a NEW key.
   */
  readonly idempotencyKey: string | undefined;
  /** Parsed response body, as received. */
  readonly body: unknown;
  readonly headers: Headers;

  constructor(init: FizApiErrorInit) {
    const messages = messagesOf(init.body);
    super(
      `${init.method} ${init.path} failed with ${init.status}: ${
        messages.join('; ') || 'no message'
      }`,
    );
    this.status = init.status;
    this.body = init.body;
    this.headers = init.headers;
    this.messages = messages;
    this.code = codeOf(init.body);
    this.requestId = init.headers.get('x-request-id') ?? undefined;
    this.idempotencyKey = init.idempotencyKey;
  }

  /** Builds the subclass that matches the status. */
  static from(init: FizApiErrorInit): FizApiError {
    const Class = ERROR_BY_STATUS[init.status] ?? (init.status >= 500 ? FizServerError : FizApiError);
    return new Class(init);
  }
}

/** 400: the request was refused as invalid. Nothing was written. */
export class FizBadRequestError extends FizApiError {
  override name = 'FizBadRequestError';
}
/** 401: the API key or access token is missing, invalid or revoked. */
export class FizAuthenticationError extends FizApiError {
  override name = 'FizAuthenticationError';
}
/** 403: the credential cannot do this (scope, plan or permission). */
export class FizPermissionError extends FizApiError {
  override name = 'FizPermissionError';
}
/** 404: the record does not exist or is not visible to this credential. */
export class FizNotFoundError extends FizApiError {
  override name = 'FizNotFoundError';
}
/**
 * 409: a conflict. With an Idempotency-Key it means the first attempt is
 * still running (the SDK already waited and retried) or that its outcome is
 * unknown: check whether it took effect, then retry with a NEW key.
 */
export class FizConflictError extends FizApiError {
  override name = 'FizConflictError';
}
/** 422: the Idempotency-Key was already used with a different request. */
export class FizUnprocessableEntityError extends FizApiError {
  override name = 'FizUnprocessableEntityError';
}
/** 429: too many requests. The SDK already retried, honouring `Retry-After`. */
export class FizRateLimitError extends FizApiError {
  override name = 'FizRateLimitError';
}
/** 5xx: the API or a service behind it failed. */
export class FizServerError extends FizApiError {
  override name = 'FizServerError';
}

const ERROR_BY_STATUS: Record<number, new (init: FizApiErrorInit) => FizApiError> = {
  400: FizBadRequestError,
  401: FizAuthenticationError,
  403: FizPermissionError,
  404: FizNotFoundError,
  409: FizConflictError,
  422: FizUnprocessableEntityError,
  429: FizRateLimitError,
};

/**
 * No response arrived (network failure or timeout). A write that carried an
 * Idempotency-Key is safe to repeat with the SAME key, which the SDK does
 * automatically before throwing this.
 */
export class FizConnectionError extends FizError {
  override name = 'FizConnectionError';
  readonly idempotencyKey: string | undefined;
  constructor(message: string, idempotencyKey: string | undefined, options?: { cause?: unknown }) {
    super(message, options);
    this.idempotencyKey = idempotencyKey;
  }
}

/** An attempt exceeded the timeout. */
export class FizTimeoutError extends FizConnectionError {
  override name = 'FizTimeoutError';
}

function messagesOf(body: unknown): string[] {
  if (typeof body === 'string') return body ? [body] : [];
  if (!body || typeof body !== 'object') return [];
  const message = (body as { message?: unknown }).message;
  if (typeof message === 'string') return [message];
  if (Array.isArray(message)) return message.filter((m): m is string => typeof m === 'string');
  return [];
}

function codeOf(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const code = (body as { code?: unknown }).code;
  return typeof code === 'string' && code ? code : undefined;
}
