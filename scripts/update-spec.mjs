// Downloads the canonical (English) OpenAPI document into openapi/openapi.json.
// FIZ_SPEC_URL overrides the source, e.g. a local public-api build.
import { writeFileSync } from 'node:fs';

const url = process.env.FIZ_SPEC_URL ?? 'https://api.fiz.co/-json';
const res = await fetch(url, { headers: { accept: 'application/json' } });
if (!res.ok) throw new Error(`GET ${url} answered ${res.status}`);
const spec = await res.json();
if (!spec.openapi || !spec.paths) throw new Error(`${url} is not an OpenAPI document`);
writeFileSync(
  new URL('../openapi/openapi.json', import.meta.url),
  JSON.stringify(spec, null, 2) + '\n',
);
console.log(`Saved ${url} (${Object.keys(spec.paths).length} paths)`);
