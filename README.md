# FIZ SDK for JavaScript and TypeScript

Issue **AT-certified invoices in Portugal** from your code. FIZ is invoicing
software certified by the Autoridade Tributária (No. 3041): it numbers each
document in its series, adds the ATCUD and the QR code, reports it to the AT
when it is issued and returns the number and the PDF.

This is the official client for the [FIZ API](https://api.fiz.co): every
operation typed from the API's OpenAPI document, with safe retries built in.

[Português](#português) · [API reference](https://api.fiz.co) ·
[Quickstart](https://api.fiz.co/docs/quickstart) ·
[Changelog](https://api.fiz.co/docs/changelog)

```bash
npm install @fiz-co/sdk
```

Node.js 20.3 or later (CI tests 20, 22 and 24). Server-side only: an API key acts for the
whole company and must never reach a browser, so the client refuses to start in one
(`dangerouslyAllowBrowser: true` overrides it).

## Quickstart

Run it with a **sandbox key**: create one at [app.fiz.co → Settings → Integrations](https://app.fiz.co/settings/integrations)
and put it in `FIZ_API_KEY`. A key starting with `fiz_test_` sends documents
to the AT test services, with no fiscal effect. The walkthrough below stops on
any other key, because its last step issues a real invoice with a production
key.

```ts
import { Fiz } from '@fiz-co/sdk';

const fiz = new Fiz(); // reads FIZ_API_KEY
if (fiz.environment !== 'sandbox') {
  throw new Error('Use a sandbox key (fiz_test_…) for this walkthrough.');
}

// Which company is this, and can it issue yet?
const company = await fiz.company.retrieve();
if (!company.readiness.ready) console.log(company.readiness.reasons);

const customer = await fiz.customers.create({ name: 'Example customer', country: 'PT' });
const item = await fiz.items.create({
  name: 'Example service',
  type: 'SERVICE',
  unitPrice: 10,
  vatRate: 'NORMAL',
});

// A draft has no number and no fiscal effect.
const draft = await fiz.invoices.create({
  type: 'INVOICE',
  cae: company.cae[0],
  customerId: customer.id,
  items: [{ id: item.id, quantity: 1 }],
});
const pdf = await fiz.invoices.downloadPdf(draft.id); // ArrayBuffer

// Issuing is fiscal and irreversible with a production key: numbered, ATCUD,
// reported to the AT. expectedUpdatedAt issues exactly the draft you looked
// at, and refuses it if it changed since.
const invoice = await fiz.invoices.issue(draft.id, { expectedUpdatedAt: draft.updatedAt });
console.log(invoice.number, invoice.atcud);
```

A runnable version is in [`examples/quickstart.ts`](examples/quickstart.ts).
It issues in two runs: the first creates the draft and saves its PDF, the
second issues that draft by its id, after you have looked at it.

## What it covers

| | |
|---|---|
| `fiz.invoices` | invoices, simplified invoices, invoice-receipts: `create`, `list`, `listAll`, `retrieve`, `update`, `delete`, `issue`, `pay`, `cancel`, `pdf`, `downloadPdf` |
| `fiz.creditNotes` | full or per-line credit notes (issued at once unless `issue: false`) |
| `fiz.recurringInvoices` | invoices FIZ issues on a schedule |
| `fiz.proposals` | pro formas (no fiscal effect) |
| `fiz.transportDocuments` | guias de transporte (GR, GT, GA, GC, GD) |
| `fiz.customers`, `fiz.items` | customers and the item catalogue |
| `fiz.series`, `fiz.templates` | invoice series, PDF templates |
| `fiz.company`, `fiz.vat` | the company and issuance readiness, VAT rules |
| `fiz.expenses`, `fiz.bank` | e-Fatura expenses, bank transactions |
| `fiz.exports` | SAF-T PT export |

Methods marked **fiscal and irreversible** in their documentation (`issue`,
`pay`, `cancel`, credit notes) report to the AT when used with a production
key.

Any operation of the API is also reachable by its OpenAPI `operationId`,
typed the same way, including ones newer than your SDK version:

```ts
const series = await fiz.call('SeriesController_getAll');
```

## Errors

Every failed request throws a `FizApiError` subclass. Branch on `status` and
`code`; `message` is for people and its wording may change.

```ts
import { FizApiError, FizNotFoundError } from '@fiz-co/sdk';

try {
  await fiz.invoices.retrieve(id);
} catch (error) {
  if (error instanceof FizNotFoundError) {
    // 404
  } else if (error instanceof FizApiError) {
    console.error(error.status, error.code, error.messages);
    console.error('Quote to support:', error.requestId);
  }
  throw error;
}
```

| Class | Status |
|---|---|
| `FizBadRequestError` | 400 — refused as invalid; `messages` has one line per field |
| `FizAuthenticationError` | 401 — key or token missing, invalid or revoked |
| `FizPermissionError` | 403 — scope, plan or permission |
| `FizNotFoundError` | 404 |
| `FizConflictError` | 409 — see [Retries](#retries-and-idempotency) |
| `FizUnprocessableEntityError` | 422 — Idempotency-Key reused with a different request |
| `FizRateLimitError` | 429 |
| `FizServerError` | 5xx |
| `FizConnectionError`, `FizTimeoutError` | no response |

## Retries and idempotency

Every write carries an `Idempotency-Key`. The API remembers it for 30 days
and answers a repeat with the original response, so a timeout never costs a
duplicate invoice. The SDK generates one per call (a UUID) and reuses it for
its own retries. Pass yours to make retries safe across restarts too, for
example the id of the order the invoice is for:

```ts
await fiz.invoices.create(draft, { idempotencyKey: `order-${order.id}-invoice` });
```

The SDK retries (default `maxRetries: 2`) only what is safe to repeat:

- no response at all, on a read or a write carrying a key;
- `429`, after `Retry-After` (a wait longer than a minute is not taken: the error is thrown);
- `409` with `Retry-After`: the first attempt is still running, and the same
  key returns its result;
- `502`, `503`, `504` on a read.

It does **not** retry a `409` without `Retry-After` or a `5xx` on a write:
the first attempt may have taken effect. Check whether it did (list the
documents), then repeat with a **new** key. `error.idempotencyKey` tells you
which key was spent.

## Pagination

`list` returns one page. `listAll` walks every page as you iterate:

```ts
for await (const invoice of fiz.invoices.listAll({ status: 'ISSUED' })) {
  console.log(invoice.number);
}
```

## OAuth apps

A [registered app](https://api.fiz.co/docs/apps) calls the API on behalf of
the companies that installed it, with an OAuth access token:

```ts
const fiz = new Fiz({ accessToken });
```

Getting and refreshing the token is your app's part of the flow; see the
[partner guide](https://api.fiz.co/docs/apps).

## Options

```ts
new Fiz({
  apiKey: 'fiz_…',          // default: process.env.FIZ_API_KEY
  accessToken: '…',         // instead of apiKey
  baseUrl: 'https://api.fiz.co',
  maxRetries: 2,
  timeout: 60_000,          // per attempt, ms
  fetch,                    // custom fetch
  appInfo: { name: 'my-shop', version: '1.2.0' }, // added to the User-Agent
});
```

Each method also takes per-call options: `idempotencyKey`, `maxRetries`,
`timeout`, `signal` and `headers`.

## TypeScript

Request and response types come from the API's OpenAPI document. Named
aliases cover the common ones (`Invoice`, `Customer`, `Item`, `Company`, …);
every schema is in `Schemas`:

```ts
import type { Schemas, RequestBody } from '@fiz-co/sdk';

type Line = Schemas['InvoiceItemDto'];
type NewInvoice = RequestBody<'InvoicesController_create'>;
```

## Coding agents

Using Claude Code, Cursor or Codex? Point the agent at
[`api.fiz.co/llms.txt`](https://api.fiz.co/llms.txt): it routes the agent by
task and states the fiscal rules first. The FIZ connector for Claude and
ChatGPT is described at [api.fiz.co/docs/mcp](https://api.fiz.co/docs/mcp).

## Development

```bash
npm install
npm run update-spec   # download https://api.fiz.co/-json and regenerate
npm run check         # typecheck, unit tests, build
FIZ_TEST_API_KEY=fiz_test_… npm run test:sandbox
```

`src/generated/` is generated from `openapi/openapi.json`; never edit it by
hand. When the API adds an operation, `npm test` fails until a resource
method wraps it.

## Português

**Faturação certificada em Portugal a partir do seu código.** O FIZ é um
programa de faturação certificado pela AT (n.º 3041): numera cada documento
na série, junta o ATCUD e o código QR, comunica-o à AT no momento da emissão
e devolve o número e o PDF. Este é o cliente oficial da
[API FIZ](https://api.fiz.co/?lang=pt) para JavaScript e TypeScript.

```bash
npm install @fiz-co/sdk
```

1. Crie uma chave API em [app.fiz.co → Definições → Integrações](https://app.fiz.co/settings/integrations)
   e guarde-a em `FIZ_API_KEY`. Uma chave `fiz_test_` usa o **sandbox**:
   serviços de teste da AT, sem efeito fiscal.
2. Siga o exemplo do [Quickstart](#quickstart) com uma chave de sandbox:
   cliente e artigo → rascunho e PDF → emissão. Um rascunho não tem efeito
   fiscal; com uma chave de produção, a emissão é irreversível e comunicada à
   AT.
3. Cada escrita leva uma `Idempotency-Key`, reutilizada nas repetições
   automáticas: um timeout nunca dá origem a uma fatura duplicada.

Os erros trazem `status`, `code` e `requestId` (indique-o ao suporte). Guia
completo em [api.fiz.co/docs/quickstart?lang=pt](https://api.fiz.co/docs/quickstart?lang=pt).

## License

MIT
