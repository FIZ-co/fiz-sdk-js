import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Fiz, OPERATIONS } from '../src/index.js';
import { Resource } from '../src/resources/base.js';

/**
 * method-map.json: which method of the client wraps each API operation, and
 * the arguments it takes, in order. The API docs (api.fiz.co, the reference
 * by resource) read it to show each operation in TypeScript. This test keeps
 * it equal to the code; `npm run method-map` rewrites it.
 */

const FILE = fileURLToPath(new URL('../method-map.json', import.meta.url));

interface Param {
  name: string;
  in: 'path' | 'query' | 'body';
  required: boolean;
  param?: string;
}

const CALL = /\.call\(\s*['"](\w+)['"]/;

/** `(id, body = {}, options)` → [['id', false], ['body', true], …]: name and whether it has a default. */
function parameters(source: string): [string, boolean][] {
  const open = source.indexOf('(');
  let depth = 0;
  let close = open;
  for (; close < source.length; close++) {
    if (source[close] === '(') depth++;
    if (source[close] === ')' && --depth === 0) break;
  }
  const list = source.slice(open + 1, close).trim();
  if (!list) return [];
  // Split at top-level commas only (a default value may be an object or a call).
  const parts: string[] = [];
  let level = 0;
  let current = '';
  for (const char of list) {
    if ('({['.includes(char)) level++;
    if (')}]'.includes(char)) level--;
    if (char === ',' && level === 0) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  return parts.map((p) => {
    const [name, defaultValue] = p.split('=');
    return [name!.trim().replace(/\?$/, ''), defaultValue !== undefined];
  });
}

/** `{ path: { id }, … }` or `{ path: { starterId: id } }` → argument → path parameter. */
function pathArguments(source: string): Record<string, string> {
  const found = /path:\s*\{([^}]*)\}/.exec(source);
  if (!found) return {};
  return Object.fromEntries(
    found[1]!
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [param, arg] = entry.split(':').map((s) => s.trim());
        return [arg ?? param!, param!];
      }),
  );
}

export function buildMethodMap() {
  const fiz = new Fiz({ apiKey: 'fiz_test_method_map' });
  const operations: Record<string, { method: string; params: Param[] }> = {};
  for (const [attr, resource] of Object.entries(fiz)) {
    if (!(resource instanceof Resource)) continue;
    const proto = Object.getPrototypeOf(resource) as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const fn = proto[name];
      if (name === 'constructor' || typeof fn !== 'function') continue;
      const source = fn.toString();
      const found = CALL.exec(source);
      if (!found) continue; // a helper on top of another method (listAll, downloadPdf)
      const operationId = found[1]!;
      if (operations[operationId]) continue;
      const pathArgs = pathArguments(source);
      const expected = [...OPERATIONS[operationId as keyof typeof OPERATIONS].path.matchAll(/\{(\w+)\}/g)].map(
        (m) => m[1],
      );
      if (Object.values(pathArgs).sort().join() !== expected.sort().join()) {
        throw new Error(`${attr}.${name}: path parameters ${expected.join(', ')} not all passed`);
      }
      const params: Param[] = [];
      for (const [arg, hasDefault] of parameters(source)) {
        if (arg === 'options') continue;
        const where = arg in pathArgs ? 'path' : arg === 'body' || arg === 'query' ? arg : undefined;
        if (!where) throw new Error(`${attr}.${name}: argument ${arg} is neither a path parameter, body nor query`);
        // An optional argument is `x?: T` or `x = default`; TypeScript's `?` is gone at
        // runtime, so it is read from the source of the declaration below.
        params.push({
          name: arg,
          in: where,
          required: !hasDefault && !optional(proto.constructor.name, name, arg),
          ...(where === 'path' ? { param: pathArgs[arg] } : {}),
        });
      }
      operations[operationId] = { method: `${attr}.${name}`, params };
    }
  }
  const sorted = Object.fromEntries(Object.entries(operations).sort(([a], [b]) => a.localeCompare(b)));
  return { language: 'typescript', operations: sorted };
}

const SOURCES = ['account', 'catalog', 'documents', 'invoices']
  .map((f) => readFileSync(fileURLToPath(new URL(`../src/resources/${f}.ts`, import.meta.url)), 'utf8'))
  .join('\n');

/** Whether `name(...)` in class `className` declares `arg` optional (`arg?:`). */
function optional(className: string, name: string, arg: string): boolean {
  const start = SOURCES.indexOf(`export class ${className} `);
  if (start < 0) throw new Error(`class ${className} not found in src/resources`);
  const end = SOURCES.indexOf('\nexport class ', start + 1);
  const body = SOURCES.slice(start, end < 0 ? undefined : end);
  const declaration = new RegExp(`\\n  (?:async )?${name}\\(([^)]*)\\)`).exec(body);
  if (!declaration) throw new Error(`${className}.${name} not found`);
  return new RegExp(`\\b${arg}\\?:`).test(declaration[1]!);
}

export const renderMethodMap = () => `${JSON.stringify(buildMethodMap(), null, 2)}\n`;

describe('method-map.json', () => {
  it('matches the code (npm run method-map rewrites it)', () => {
    const text = renderMethodMap();
    if (process.env.UPDATE_METHOD_MAP) writeFileSync(FILE, text);
    expect(readFileSync(FILE, 'utf8')).toBe(text);
  });

  it('has a method for every operation', () => {
    const { operations } = JSON.parse(readFileSync(FILE, 'utf8')) as { operations: object };
    expect(Object.keys(operations).sort()).toEqual(Object.keys(OPERATIONS).sort());
  });
});
