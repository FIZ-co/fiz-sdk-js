import { describe, expectTypeOf, it } from 'vitest';
import type { Fiz, Invoice, InvoiceListItem, ApiErrorBody } from '../src/index.js';

// Compile-time checks: these fail `npm run typecheck`, not at runtime.
describe('types follow the API document', () => {
  it('types responses', () => {
    expectTypeOf<Awaited<ReturnType<Fiz['invoices']['retrieve']>>>().toEqualTypeOf<Invoice>();
    expectTypeOf<Awaited<ReturnType<Fiz['invoices']['list']>>>().toEqualTypeOf<InvoiceListItem[]>();
    expectTypeOf<ApiErrorBody['statusCode']>().toEqualTypeOf<number>();
  });

  it('accepts a template read back as an import, and a credit-note draft', () => {
    // The API documents both: GET /templates/{id} can be sent to POST as is,
    // and a credit note is issued at once unless issue: false.
    const roundTrip = async (fiz: Fiz, id: string) => fiz.templates.create(await fiz.templates.retrieve(id));
    const creditNoteDraft = (fiz: Fiz, parentInvoiceId: string) =>
      fiz.creditNotes.create({ parentInvoiceId, reasonCode: 'RETURN_GOODS_SERVICES', issue: false });
    expectTypeOf(roundTrip).toBeFunction();
    expectTypeOf(creditNoteDraft).toBeFunction();
  });

  it('types request bodies', () => {
    type CreateCustomer = Parameters<Fiz['customers']['create']>[0];
    expectTypeOf<{ name: string; country: string }>().toMatchTypeOf<CreateCustomer>();
    // @ts-expect-error — `issue` takes expectedUpdatedAt, not arbitrary fields
    const wrong: Parameters<Fiz['invoices']['issue']>[1] = { notAField: true };
    void wrong;
  });
});
