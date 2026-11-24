# Agent rules for fiz-sdk-js

Rules every coding agent (Codex, Cursor, Claude Code, …) and every human
contributor follows in this repository. `CLAUDE.md` imports this file.

## This repository is public

Everything written here is world-readable and permanent: code, comments,
commit messages, pull request titles and descriptions, review comments, issue
replies. A force-push does not take it back; forks and mirrors keep it.

Write from the public API's side, as an outside integrator would read it:

- **Refer to the API only by what is public.** Operations as the OpenAPI
  document names them (`POST /invoices/{id}/issue`), fields and error `code`s
  as documented, the docs at https://api.fiz.co, the changelog at
  https://api.fiz.co/docs/changelog. Write "the API now returns `updatedAt`
  when a draft is created", not where that change was made.
- **Name no internal system.** Not FIZ's private repositories, internal
  services or their components, infrastructure, deploy pipelines, internal
  tools, trackers, chats, dashboards, or internal pull request and ticket
  numbers. If the reason for a change only makes sense with internal context,
  state the observable behaviour instead.
- **No customer or account data.** No company or person names, tax numbers,
  document numbers, record ids, request ids or log excerpts from any account,
  sandbox accounts included: sandbox output is shaped like real data and
  is treated as such. Examples use the placeholders the README uses
  (`Example customer`, `inv1`, `order-1042`).
- **No credentials.** Never commit an API key, live or `fiz_test_`. Tests and
  scripts read `FIZ_API_KEY` / `FIZ_TEST_API_KEY` from the environment;
  `.env` is ignored.
- **No internal process.** Who reviewed what, internal schedules, staffing,
  or decisions made elsewhere stay out. A commit explains *why* from the code
  and the API's documented behaviour.
- **English only**, in code, comments, commits, pull requests and reviews.

Before every push, read the diff, the commit message and the pull request
text once more against this list. Something internal that needs recording
belongs in FIZ's internal tracker, not here.

## What this is

The official JavaScript/TypeScript client for the FIZ API: certified
invoicing in Portugal (documents numbered, with ATCUD and QR code, reported
to the AT). Published to npm as `@fiz-co/sdk`. No runtime dependencies;
Node.js 20.3+.

```
openapi/openapi.json     the API document (from https://api.fiz.co/-json)
src/generated/           types and the operation table, generated from it
src/client.ts            HTTP: auth, Idempotency-Key, retries, errors
src/errors.ts            the error classes
src/resources/*.ts       one typed method per API operation
src/index.ts             the Fiz class and public exports
test/                    unit tests (mocked fetch); test/sandbox/ hits the API
examples/quickstart.ts   the runnable example
scripts/                 generate, update-spec, check-readme
```

## Commands

```bash
npm run update-spec   # download the live API document and regenerate
npm run generate      # regenerate src/generated/ from openapi/openapi.json
npm run check         # typecheck, README examples, unit tests, build
FIZ_TEST_API_KEY=fiz_test_… npm run test:sandbox   # against the API sandbox
```

`npm run check` is what CI runs; run it before every push.

## Rules of the code

- **Never edit `src/generated/` by hand.** Change the spec source and run
  `npm run generate`; CI fails when the generated files differ.
- **Every API operation has a resource method.** `test/coverage.test.ts`
  fails until a new operation is wrapped; until then it is reachable through
  `fiz.call('<operationId>')`.
- **The client's safety rules are behaviour, not style.** A change to any of
  them comes with a test that fails on the previous client:
  - one `Idempotency-Key` per call, reused by every retry; an invalid key is
    refused before sending;
  - retries only where a repeat is safe (no response, 429, a 409 with
    `Retry-After` on a keyed write, 502/503/504 on reads), honouring
    `Retry-After`; a known status decides even when its body is lost;
  - a success must be JSON; anything else is a lost response;
  - redirects are not followed with credentials; credentials go only to the
    API origin;
  - the client refuses to start in a browser unless `dangerouslyAllowBrowser`.
- **Fiscal methods say so.** A method that issues, pays, cancels or credits
  (reported to the AT, irreversible with a production key) states it in its
  JSDoc.
- **Examples are safe to copy.** README and `examples/` run against the
  sandbox first, never issue without an explicit step, and issue exactly the
  draft that was reviewed. Every ```ts block of the README compiles
  (`npm run check:readme`).

## Commits, pull requests, releases

- Conventional commits (`feat:`, `fix:`, `docs:`, `chore(spec):`, `ci:`),
  following the public-repository rules above.
- A change a user of the package can notice gets a line in `CHANGELOG.md`.
- Releasing: the version in `package.json`, `src/version.ts` and
  `CHANGELOG.md`, then a `v<version>` tag; the Release workflow publishes
  through npm trusted publishing. Details in the README, "Development".
