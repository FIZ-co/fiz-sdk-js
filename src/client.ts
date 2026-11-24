import {
  FizApiError,
  FizConnectionError,
  FizError,
  FizTimeoutError,
} from './errors.js';
import { OPERATIONS, type OperationId } from './generated/operations.js';
import type {
  PathParams,
  QueryParams,
  RequestBody,
  RequestOptions,
  ResponseBody,
} from './types.js';
import { VERSION } from './version.js';

export const DEFAULT_BASE_URL = 'https://api.fiz.co';
const SANDBOX_KEY_PREFIX = 'fiz_test_';
/** A longer Retry-After is not waited for: the error is thrown instead. */
const MAX_RETRY_AFTER_MS = 60_000;
const MAX_REDIRECTS = 5;
/** What the API accepts as an Idempotency-Key: 1–128 visible ASCII characters. */
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,128}$/;

export interface FizOptions {
  /**
   * API key (`x-api-key`), created at https://app.fiz.co/settings/integrations.
   * Defaults to the `FIZ_API_KEY` environment variable. A key starting with
   * `fiz_test_` reaches the sandbox: AT test services, no fiscal effect.
   */
  apiKey?: string;
  /** OAuth access token of a registered app, sent as a bearer token. */
  accessToken?: string;
  /** Default `https://api.fiz.co`. */
  baseUrl?: string;
  /** Automatic retries of a failed attempt (default 2). See the README. */
  maxRetries?: number;
  /** Timeout per attempt, in milliseconds (default 60 000). */
  timeout?: number;
  /** A `fetch` implementation (default: the global one). */
  fetch?: typeof fetch;
  /** Your integration's name and version, added to the User-Agent. */
  appInfo?: { name: string; version?: string };
}

/** Arguments of `call()`: only the parts the operation takes. */
export type CallArgs<K extends OperationId> = {
  path?: PathParams<K>;
  query?: QueryParams<K>;
  body?: RequestBody<K>;
};

type Operation = { method: string; path: string; idempotent: boolean };

/**
 * Low-level HTTP client: auth, Idempotency-Key, retries and error mapping.
 * Each resource method is a typed wrapper around `call()`.
 */
export class FizClient {
  readonly baseUrl: string;
  readonly maxRetries: number;
  readonly timeout: number;
  /** `sandbox` for a `fiz_test_` key; OAuth tokens and other keys reach production. */
  readonly environment: 'production' | 'sandbox';
  private readonly authHeaders: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(options: FizOptions = {}) {
    if (options.apiKey && options.accessToken) {
      throw new FizError('Pass either apiKey or accessToken, not both.');
    }
    const apiKey = options.accessToken ? undefined : (options.apiKey ?? envApiKey());
    if (!apiKey && !options.accessToken) {
      throw new FizError(
        'No credential: pass apiKey (or set FIZ_API_KEY) or accessToken. API keys are created at https://app.fiz.co/settings/integrations.',
      );
    }
    this.authHeaders = apiKey
      ? { 'x-api-key': apiKey }
      : { authorization: `Bearer ${options.accessToken}` };
    this.environment = apiKey?.startsWith(SANDBOX_KEY_PREFIX) ? 'sandbox' : 'production';
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.maxRetries = options.maxRetries ?? 2;
    this.timeout = options.timeout ?? 60_000;
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) throw new FizError('No fetch available: pass options.fetch.');
    this.fetchImpl = fetchImpl.bind(globalThis);
    this.userAgent = userAgent(options.appInfo);
  }

  /**
   * Calls any API operation by its OpenAPI `operationId`. Resource methods
   * use this; call it directly for an operation this SDK version does not
   * wrap yet.
   */
  async call<K extends OperationId>(
    operationId: K,
    args: CallArgs<K> = {},
    options: RequestOptions = {},
  ): Promise<ResponseBody<K>> {
    const operation: Operation | undefined = OPERATIONS[operationId];
    if (!operation) throw new FizError(`Unknown operation ${String(operationId)}`);

    const path = expandPath(operation.path, args.path as Record<string, unknown> | undefined);
    const url = this.baseUrl + path + queryString(args.query as Record<string, unknown> | undefined);
    // A Headers object, not a plain one: header names are case-insensitive, and
    // a caller's `Idempotency-Key` next to our `idempotency-key` in a plain
    // object would be sent joined ("a, b") and refused by the API.
    const headers = new Headers({
      accept: 'application/json',
      'user-agent': this.userAgent,
      ...this.authHeaders,
    });
    for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);
    // One key for the whole call, every retry included. A key the caller gave
    // (option or header) is checked here: an empty one would send no header
    // while the retry logic still treated the write as safe to repeat.
    const idempotencyKey = operation.idempotent
      ? checkedIdempotencyKey(
          options.idempotencyKey ?? headers.get('idempotency-key') ?? undefined,
        )
      : undefined;
    if (idempotencyKey) headers.set('idempotency-key', idempotencyKey);
    else headers.delete('idempotency-key');
    const hasBody = args.body !== undefined;
    if (hasBody) headers.set('content-type', 'application/json');
    const body = hasBody ? JSON.stringify(args.body) : undefined;

    const maxRetries = options.maxRetries ?? this.maxRetries;
    const timeout = options.timeout ?? this.timeout;
    // Safe to repeat without knowing whether the first attempt arrived: a read,
    // or a write carrying an Idempotency-Key (the API replays the first result).
    const repeatable = operation.method === 'GET' || idempotencyKey !== undefined;

    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt < maxRetries;
      let response: Response;
      let payload: unknown;
      try {
        response = await this.attempt(url, operation.method, headers, body, timeout, options.signal);
        // Inside the try: the headers can arrive and the body still be cut
        // off. For a write that already happened, that is a lost response,
        // not a bug, and the same key recovers it.
        payload = await parseBody(response);
      } catch (error) {
        if (options.signal?.aborted) throw options.signal.reason ?? error;
        if (!repeatable || !canRetry) {
          throw noResponseError(error, `${operation.method} ${path}`, timeout, idempotencyKey);
        }
        await sleep(backoff(attempt), options.signal);
        continue;
      }

      if (response.ok) return payload as ResponseBody<K>;
      if (isRedirect(response)) {
        // Not followed: the credentials go to the API's origin only.
        throw new FizError(
          `${operation.method} ${path} answered with a redirect${location(response)}; it was not followed.`,
        );
      }

      const error = FizApiError.from({
        status: response.status,
        body: payload,
        headers: response.headers,
        method: operation.method,
        path,
        idempotencyKey,
      });
      const retryAfter = retryAfterMs(response.headers);
      if (
        !canRetry ||
        // Waiting less than the server asked would only earn another refusal.
        (retryAfter !== undefined && retryAfter > MAX_RETRY_AFTER_MS) ||
        !shouldRetry(response.status, operation.method, idempotencyKey, retryAfter)
      ) {
        throw error;
      }
      await sleep(retryAfter ?? backoff(attempt), options.signal);
    }
  }

  /**
   * Downloads a file the API linked to (a PDF, an export). Credentials are
   * sent only to the API's own origin, checked again on every redirect: fetch
   * would otherwise carry `x-api-key` to wherever a redirect points.
   */
  async download(fileUrl: string, options: Pick<RequestOptions, 'timeout' | 'signal'> = {}): Promise<ArrayBuffer> {
    const apiOrigin = new URL(this.baseUrl).origin;
    let url = new URL(fileUrl);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const response = await this.attempt(
        url.href,
        'GET',
        url.origin === apiOrigin ? { 'user-agent': this.userAgent, ...this.authHeaders } : {},
        undefined,
        options.timeout ?? this.timeout,
        options.signal,
      );
      if (isRedirect(response)) {
        const next = response.headers.get('location');
        if (!next) {
          throw new FizError(`Downloading ${url.pathname}: a redirect this runtime does not expose`);
        }
        url = new URL(next, url);
        continue;
      }
      if (!response.ok) {
        throw new FizError(`Downloading ${url.pathname} failed with ${response.status}`);
      }
      return response.arrayBuffer();
    }
    throw new FizError(`Downloading ${new URL(fileUrl).pathname}: more than ${MAX_REDIRECTS} redirects`);
  }

  private attempt(
    url: string,
    method: string,
    headers: HeadersInit,
    body: string | undefined,
    timeout: number,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const timeoutSignal = AbortSignal.timeout(timeout);
    return this.fetchImpl(url, {
      method,
      headers,
      body,
      // Never followed automatically: a redirect keeps custom headers such as
      // x-api-key, whatever origin it points to.
      redirect: 'manual',
      signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    });
  }
}

/**
 * Which failed responses are retried, following the API's idempotency rules:
 *  - 429: refused before the request ran.
 *  - 409 with Retry-After on a keyed write: the first attempt is still
 *    running; the same key returns its result once done. A 409 without
 *    Retry-After means the outcome is unknown and must not be retried blindly.
 *  - 502/503/504 on a read. On a write, a 5xx may already have taken effect
 *    and the key is spent; retrying would only answer 409.
 */
function shouldRetry(
  status: number,
  method: string,
  idempotencyKey: string | undefined,
  retryAfter: number | undefined,
): boolean {
  if (status === 429) return true;
  if (status === 409) return idempotencyKey !== undefined && retryAfter !== undefined;
  if (status === 502 || status === 503 || status === 504) return method === 'GET';
  return false;
}

function expandPath(template: string, params: Record<string, unknown> | undefined): string {
  return template.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = params?.[name];
    if (value === undefined || value === null || value === '') {
      throw new FizError(`Missing path parameter "${name}" for ${template}`);
    }
    return encodeURIComponent(String(value));
  });
}

function queryString(query: Record<string, unknown> | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === undefined || item === null) continue;
      params.append(key, item instanceof Date ? item.toISOString() : String(item));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('json')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function retryAfterMs(headers: Headers): number | undefined {
  const value = headers.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  if (!Number.isFinite(ms)) return undefined;
  return Math.max(ms, 0);
}

/** 0.5 s, 1 s, 2 s, … capped at 8 s, with ±25 % jitter. */
function backoff(attempt: number): number {
  const base = Math.min(500 * 2 ** attempt, 8_000);
  return base * (0.75 + Math.random() * 0.5);
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function envApiKey(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.FIZ_API_KEY || undefined;
}

/** `fiz-sdk-js/<version> node/<version> <app>/<version>`, leaving out what is unknown. */
function userAgent(appInfo: FizOptions['appInfo']): string {
  const parts = [`fiz-sdk-js/${VERSION}`];
  const node = (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node;
  if (node) parts.push(`node/${node}`);
  if (appInfo) parts.push(appInfo.version ? `${appInfo.name}/${appInfo.version}` : appInfo.name);
  return parts.join(' ');
}

/** The error for an attempt that got no response: a timeout or a network failure. */
function noResponseError(
  error: unknown,
  request: string,
  timeout: number,
  idempotencyKey: string | undefined,
): FizConnectionError {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new FizTimeoutError(`${request} timed out after ${timeout} ms`, idempotencyKey, { cause: error });
  }
  const reason = error instanceof Error ? error.message : String(error);
  return new FizConnectionError(`${request} failed: no complete response (${reason})`, idempotencyKey, {
    cause: error,
  });
}

/**
 * The caller's Idempotency-Key, refused before sending when the API would
 * refuse it; a new UUID when there is none.
 */
function checkedIdempotencyKey(given: string | undefined): string {
  if (given === undefined) return globalThis.crypto.randomUUID();
  if (!IDEMPOTENCY_KEY_PATTERN.test(given)) {
    throw new FizError(
      'idempotencyKey must be 1 to 128 visible ASCII characters (no spaces); omit it to have one generated.',
    );
  }
  return given;
}

/** A 3xx, or the opaque redirect a browser returns for `redirect: 'manual'`. */
function isRedirect(response: Response): boolean {
  return response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400);
}

function location(response: Response): string {
  const target = response.headers.get('location');
  return target ? ` to ${target}` : '';
}
