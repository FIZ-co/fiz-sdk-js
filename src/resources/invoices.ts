import { paginateByOffset, type ListAllQuery } from '../pagination.js';
import type { QueryParams, RequestBody, RequestOptions, ResponseBody } from '../types.js';
import { Resource, requireUrl } from './base.js';

type InvoiceListQuery = QueryParams<'InvoicesController_findAll'>;

/**
 * Invoices, simplified invoices, invoice-receipts and the receipts and credit
 * notes raised from them. A document is created as a draft (no fiscal
 * effect) and becomes a fiscal document only when issued.
 */
export class Invoices extends Resource {
  /** Creates a draft. Not reported to the AT until `issue`. */
  create(body: RequestBody<'InvoicesController_create'>, options?: RequestOptions) {
    return this.client.call('InvoicesController_create', { body }, options);
  }

  /** One page of documents, newest first by default. */
  list(query?: InvoiceListQuery, options?: RequestOptions) {
    return this.client.call('InvoicesController_findAll', { query }, options);
  }

  /** Every document matching the filters, fetching pages as you iterate. */
  listAll(query: ListAllQuery<InvoiceListQuery> = {}, options?: RequestOptions) {
    return paginateByOffset((page: InvoiceListQuery) => this.list(page, options), query);
  }

  retrieve(id: string, options?: RequestOptions) {
    return this.client.call('InvoicesController_findOne', { path: { id } }, options);
  }

  /** Changes a draft. Issued documents cannot be changed. */
  update(id: string, body: RequestBody<'InvoicesController_update'>, options?: RequestOptions) {
    return this.client.call('InvoicesController_update', { path: { id }, body }, options);
  }

  /** Deletes a draft. */
  delete(id: string, options?: RequestOptions) {
    return this.client.call('InvoicesController_delete', { path: { id } }, options);
  }

  /**
   * Issues a draft: numbers it in its series, adds the ATCUD and QR code and
   * reports it to the AT. **Fiscal and irreversible** (with a production key).
   * Pass the draft's `updatedAt` (from `create`, `update` or `retrieve`) as
   * `expectedUpdatedAt`; if it is missing, do not issue. A draft changed
   * since you read it is refused instead of issued.
   */
  issue(id: string, body: RequestBody<'InvoicesController_issue'> = {}, options?: RequestOptions) {
    return this.client.call('InvoicesController_issue', { path: { id }, body }, options);
  }

  /** Records a payment and issues its receipt. **Fiscal and irreversible.** */
  pay(id: string, body: RequestBody<'InvoicesController_pay'>, options?: RequestOptions) {
    return this.client.call('InvoicesController_pay', { path: { id }, body }, options);
  }

  /** Cancels an issued document and reports it to the AT. **Fiscal and irreversible.** */
  cancel(id: string, body: RequestBody<'InvoicesController_cancel'>, options?: RequestOptions) {
    return this.client.call('InvoicesController_cancel', { path: { id }, body }, options);
  }

  /** Link to the document's PDF. Use `downloadPdf` for the bytes. */
  pdf(id: string, query?: QueryParams<'InvoicesController_getPdf'>, options?: RequestOptions) {
    return this.client.call('InvoicesController_getPdf', { path: { id }, query }, options);
  }

  /** The document's PDF file. */
  async downloadPdf(
    id: string,
    query?: QueryParams<'InvoicesController_getPdf'>,
    options?: RequestOptions,
  ): Promise<ArrayBuffer> {
    const file = await this.pdf(id, query, options);
    return this.client.download(requireUrl(file.url, id), options);
  }
}

/** Credit notes on an issued invoice, total or per line. */
export class CreditNotes extends Resource {
  /**
   * Creates a credit note. Without `items` it reverses the invoice in full;
   * with `items` it changes the quantity or price of the given lines.
   *
   * **Issued at once by default**: without `issue: false` the note is
   * numbered and reported to the AT in this call, which with a production key
   * is fiscal and irreversible. Pass `issue: false` for a draft, then
   * `invoices.issue(note.id)` once it has been reviewed.
   */
  create(body: RequestBody<'InvoicesController_createCreditNote'>, options?: RequestOptions) {
    return this.client.call('InvoicesController_createCreditNote', { body }, options);
  }
}

type ScheduledListQuery = QueryParams<'ScheduledInvoicesController_findAll'>;

/**
 * Recurring invoices: a template FIZ issues — and reports to the AT — on its
 * own schedule. Every document it issues carries its id as
 * `scheduleTemplateId` (`invoices.list({ scheduleTemplateId })`).
 */
export class RecurringInvoices extends Resource {
  create(body: RequestBody<'ScheduledInvoicesController_create'>, options?: RequestOptions) {
    return this.client.call('ScheduledInvoicesController_create', { body }, options);
  }

  list(query?: ScheduledListQuery, options?: RequestOptions) {
    return this.client.call('ScheduledInvoicesController_findAll', { query }, options);
  }

  listAll(query: ListAllQuery<ScheduledListQuery> = {}, options?: RequestOptions) {
    return paginateByOffset((page: ScheduledListQuery) => this.list(page, options), query);
  }

  retrieve(id: string, options?: RequestOptions) {
    return this.client.call('ScheduledInvoicesController_findOne', { path: { id } }, options);
  }

  /** Changes the schedule, or pauses and resumes it (`status`). */
  update(id: string, body: RequestBody<'ScheduledInvoicesController_update'>, options?: RequestOptions) {
    return this.client.call('ScheduledInvoicesController_update', { path: { id }, body }, options);
  }

  /** Ends the schedule. Documents already issued are kept. */
  delete(id: string, options?: RequestOptions) {
    return this.client.call('ScheduledInvoicesController_delete', { path: { id } }, options);
  }
}
