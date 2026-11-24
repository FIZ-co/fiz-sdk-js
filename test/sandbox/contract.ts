import Ajv from 'ajv';
import spec from '../../openapi/openapi.json' with { type: 'json' };
import { OPERATIONS } from '../../src/index.js';

/**
 * Checks every response the API really sends against the API document
 * (openapi/openapi.json), with a strict validator: the schema a generated
 * client trusts must accept what the API returns, or that client breaks on a
 * real response. Used by the sandbox tests.
 *
 * A failure names the operation, the status and the JSON path that failed,
 * never the value: these are real (sandbox) records, and AGENTS.md keeps
 * account data out of logs that may be published.
 */
export interface ContractFailure {
  operation: string;
  status: number;
  problem: string;
}

type Json = Record<string, unknown>;

/**
 * OpenAPI 3.0 → what Ajv (JSON Schema draft-07) understands: boolean
 * exclusiveMinimum/Maximum become numbers. `nullable` is Ajv's own OpenAPI
 * keyword; formats and the documentation keywords are not checked.
 */
function toJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toJsonSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Json = {};
  for (const [key, value] of Object.entries(node as Json)) out[key] = toJsonSchema(value);
  for (const [bound, limit] of [
    ['exclusiveMinimum', 'minimum'],
    ['exclusiveMaximum', 'maximum'],
  ] as const) {
    if (typeof out[bound] === 'boolean') {
      if (out[bound] === true) out[bound] = out[limit];
      else delete out[bound];
      delete out[limit];
    }
  }
  return out;
}

const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
ajv.addSchema(toJsonSchema(spec) as Json, 'spec');

const pointer = (...parts: string[]) =>
  parts.map((p) => p.replace(/~/g, '~0').replace(/\//g, '~1')).join('/');

const templates = Object.entries(OPERATIONS).map(([operationId, op]) => ({
  operationId,
  method: op.method,
  path: op.path,
  pattern: new RegExp(`^${op.path.replace(/\{[^}]+\}/g, '[^/]+')}$`),
}));

/** The operation an API request belongs to; literal routes win over `{id}`. */
function operationOf(method: string, pathname: string) {
  const candidates = templates.filter((t) => t.method === method && t.pattern.test(pathname));
  return candidates.sort((a, b) => (a.path.match(/\{/g)?.length ?? 0) - (b.path.match(/\{/g)?.length ?? 0))[0];
}

function check(method: string, pathname: string, status: number, text: string): ContractFailure[] {
  const operation = operationOf(method, pathname);
  if (!operation) return [{ operation: `${method} ${pathname}`, status, problem: 'no operation in the API document' }];
  const name = `${operation.method} ${operation.path}`;
  const responses = (spec.paths as Record<string, Record<string, { responses: Record<string, Json> }>>)[operation.path]![
    operation.method.toLowerCase()
  ]!.responses;
  if (!responses[String(status)]) return [{ operation: name, status, problem: 'status not documented' }];
  const content = responses[String(status)]!.content as Record<string, unknown> | undefined;
  if (!content?.['application/json']) return [];

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return [{ operation: name, status, problem: 'body is not JSON' }];
  }
  const validate = ajv.getSchema(
    `spec#/${pointer('paths', operation.path, operation.method.toLowerCase(), 'responses', String(status), 'content', 'application/json', 'schema')}`,
  );
  if (!validate) return [{ operation: name, status, problem: 'schema not found' }];
  if (validate(body)) return [];
  return (validate.errors ?? []).map((error) => ({
    operation: name,
    status,
    problem: `${error.instancePath || '(body)'} ${error.message ?? 'invalid'}${
      error.keyword === 'required' || error.keyword === 'additionalProperties'
        ? ` (${JSON.stringify(error.params)})`
        : ''
    }`,
  }));
}

/**
 * A fetch that validates every response from `apiOrigin` and records what
 * does not match. Other hosts (a PDF on storage) pass through unchecked.
 */
export function contractFetch(apiOrigin: string, failures: ContractFailure[]): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    // Redirects (3xx) carry no documented body; everything else is checked.
    if (url.origin === apiOrigin && (response.status < 300 || response.status >= 400)) {
      failures.push(...check(init?.method ?? 'GET', url.pathname, response.status, await response.clone().text()));
    }
    return response;
  };
}
