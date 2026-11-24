import type { components, operations } from './generated/openapi.js';
import type { OperationId } from './generated/operations.js';

type Op<K extends OperationId> = operations[K];

type JsonContent<T> = T extends { content: { 'application/json': infer C } }
  ? C
  : unknown;

/** JSON body the operation accepts (`never` when it takes none). */
export type RequestBody<K extends OperationId> = Op<K> extends {
  requestBody: infer B;
}
  ? JsonContent<B>
  : Op<K> extends { requestBody?: infer B }
    ? JsonContent<NonNullable<B>>
    : never;

/** Query parameters of the operation (`never` when it takes none). */
export type QueryParams<K extends OperationId> = NonNullable<
  Op<K>['parameters']['query']
>;

/** Path parameters of the operation (`never` when it takes none). */
export type PathParams<K extends OperationId> = NonNullable<
  Op<K>['parameters']['path']
>;

/**
 * Success body of the operation. `unknown` where the API document does not
 * describe the response yet.
 */
export type ResponseBody<K extends OperationId> = Op<K>['responses'] extends infer R
  ? 200 extends keyof R
    ? JsonContent<R[200]>
    : 201 extends keyof R
      ? JsonContent<R[201]>
      : unknown
  : unknown;

/** Every schema of the API document, by name (e.g. `Schemas['CreateInvoiceDto']`). */
export type Schemas = components['schemas'];

/** Options of a single call; each overrides the client's default. */
export interface RequestOptions {
  /**
   * Idempotency-Key for a write. Generated (a UUID) when omitted, and reused
   * by every automatic retry of this call. Pass your own (an order id, say,
   * at most 128 printable ASCII characters) to make retries across process
   * restarts safe too.
   */
  idempotencyKey?: string;
  /** Automatic retries for this call (default: the client's `maxRetries`). */
  maxRetries?: number;
  /** Timeout per attempt, in milliseconds (default: the client's `timeout`). */
  timeout?: number;
  /** Aborts the call, including pending retries. */
  signal?: AbortSignal;
  /** Extra request headers. */
  headers?: Record<string, string>;
}
