import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPERATIONS } from '../src/index.js';
import spec from '../openapi/openapi.json' with { type: 'json' };

const resourcesDir = new URL('../src/resources/', import.meta.url);
const resourceSource = readdirSync(resourcesDir)
  .map((file) => readFileSync(new URL(file, resourcesDir), 'utf8'))
  .join('\n');

/**
 * When `npm run update-spec` brings a new operation, this fails until a
 * resource method wraps it (it is already callable through `fiz.call`).
 */
describe('every API operation has a resource method', () => {
  it.each(Object.keys(OPERATIONS))('%s', (operationId) => {
    expect(resourceSource).toContain(`'${operationId}'`);
  });
});

describe('generated operation table', () => {
  it('matches the spec', () => {
    const fromSpec = Object.values(spec.paths).flatMap((item) =>
      Object.values(item as Record<string, { operationId?: string }>)
        .map((op) => op.operationId)
        .filter(Boolean),
    );
    expect(Object.keys(OPERATIONS).sort()).toEqual([...fromSpec].sort());
  });

  it('marks the writes that take an Idempotency-Key', () => {
    expect(OPERATIONS.InvoicesController_issue.idempotent).toBe(true);
    expect(OPERATIONS.InvoicesController_findAll.idempotent).toBe(false);
    expect(OPERATIONS.VatController_calculate.idempotent).toBe(false);
  });
});

describe('response bodies', () => {
  it('every success of every operation is JSON, as the client assumes', () => {
    // The client parses a success as JSON and treats anything else as a lost
    // response. An operation answering something else (a file, CSV) needs
    // the client taught first.
    const notJson: string[] = [];
    for (const [path, item] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(item as Record<string, { responses?: Record<string, { content?: Record<string, unknown> }> }>)) {
        for (const [status, response] of Object.entries(op.responses ?? {})) {
          if (!status.startsWith('2')) continue;
          const types = Object.keys(response.content ?? {});
          if (types.length === 0 || types.some((t) => t !== 'application/json')) {
            notJson.push(`${method.toUpperCase()} ${path} ${status}: ${types.join(', ') || 'no body'}`);
          }
        }
      }
    }
    expect(notJson).toEqual([]);
  });
});
