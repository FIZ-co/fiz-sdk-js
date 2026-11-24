// The README snippets, compiled by `npm run typecheck` so they cannot drift from the types.
import { Fiz, FizApiError, FizNotFoundError, type RequestBody, type Schemas } from '../src/index.js';

export async function readme(fiz: Fiz, accessToken: string, order: { id: string }) {
  const company = await fiz.company.retrieve();
  if (!company.readiness.ready) console.log(company.readiness.reasons);
  const customer = await fiz.customers.create({ name: 'Example customer', country: 'PT' });
  const item = await fiz.items.create({ name: 'Example service', type: 'SERVICE', unitPrice: 10, vatRate: 'NORMAL' });
  const draftBody: RequestBody<'InvoicesController_create'> = {
    type: 'INVOICE',
    cae: company.cae[0] ?? '',
    customerId: customer.id,
    items: [{ id: item.id, quantity: 1 }],
  };
  const { id } = await fiz.invoices.create(draftBody, { idempotencyKey: `order-${order.id}-invoice` });
  const draft = await fiz.invoices.retrieve(id);
  const pdf: ArrayBuffer = await fiz.invoices.downloadPdf(id);
  const invoice = await fiz.invoices.issue(id, { expectedUpdatedAt: draft.updatedAt });
  console.log(invoice.number, invoice.atcud, pdf.byteLength);
  const series = await fiz.call('SeriesController_getAll');
  for await (const listed of fiz.invoices.listAll({ status: 'ISSUED' })) console.log(listed.number);
  try {
    await fiz.invoices.retrieve(id);
  } catch (error) {
    if (error instanceof FizNotFoundError) return;
    if (error instanceof FizApiError) console.error(error.status, error.code, error.messages, error.requestId);
    throw error;
  }
  type Line = Schemas['InvoiceItemDto'];
  const oauth = new Fiz({ accessToken });
  return { series, oauth, line: undefined as Line | undefined };
}
