import { paginateByOffset } from '../pagination.js';
import type { QueryParams, RequestBody, RequestOptions } from '../types.js';
import { DEFAULT_PAGE_SIZE, Resource, type ListAllQuery } from './base.js';
import { requireUrl } from './invoices.js';

type ProposalListQuery = QueryParams<'ProposalsController_findAll'>;

/**
 * Pro formas: numbered at creation, never reported to the AT, no fiscal
 * effect.
 */
export class Proposals extends Resource {
  create(body: RequestBody<'ProposalsController_create'>, options?: RequestOptions) {
    return this.client.call('ProposalsController_create', { body }, options);
  }

  list(query?: ProposalListQuery, options?: RequestOptions) {
    return this.client.call('ProposalsController_findAll', { query }, options);
  }

  listAll(query: ListAllQuery<ProposalListQuery> = {}, options?: RequestOptions) {
    const { pageSize = DEFAULT_PAGE_SIZE, ...filters } = query;
    return paginateByOffset(
      (offset, limit) => this.list({ ...filters, offset, limit } as ProposalListQuery, options),
      { limit: pageSize },
    );
  }

  retrieve(id: string, options?: RequestOptions) {
    return this.client.call('ProposalsController_findOne', { path: { id } }, options);
  }

  delete(id: string, options?: RequestOptions) {
    return this.client.call('ProposalsController_delete', { path: { id } }, options);
  }

  cancel(id: string, options?: RequestOptions) {
    return this.client.call('ProposalsController_cancel', { path: { id } }, options);
  }

  pdf(id: string, query?: QueryParams<'ProposalsController_getPdf'>, options?: RequestOptions) {
    return this.client.call('ProposalsController_getPdf', { path: { id }, query }, options);
  }

  async downloadPdf(
    id: string,
    query?: QueryParams<'ProposalsController_getPdf'>,
    options?: RequestOptions,
  ): Promise<ArrayBuffer> {
    const file = await this.pdf(id, query, options);
    return this.client.download(requireUrl(file.url, id), options);
  }
}

type TransportListQuery = QueryParams<'TransportDocumentsController_findAll'>;

/** Transport documents (guias de transporte: GR, GT, GA, GC, GD). */
export class TransportDocuments extends Resource {
  /** Creates a draft. `movementStartTime` must be in the future. */
  create(body: RequestBody<'TransportDocumentsController_create'>, options?: RequestOptions) {
    return this.client.call('TransportDocumentsController_create', { body }, options);
  }

  list(query?: TransportListQuery, options?: RequestOptions) {
    return this.client.call('TransportDocumentsController_findAll', { query }, options);
  }

  listAll(query: ListAllQuery<TransportListQuery> = {}, options?: RequestOptions) {
    const { pageSize = DEFAULT_PAGE_SIZE, ...filters } = query;
    return paginateByOffset(
      (offset, limit) =>
        this.list({ ...filters, offset, limit } as TransportListQuery, options) as Promise<unknown[]>,
      { limit: pageSize },
    );
  }

  retrieve(id: string, options?: RequestOptions) {
    return this.client.call('TransportDocumentsController_findOne', { path: { id } }, options);
  }

  update(id: string, body: RequestBody<'TransportDocumentsController_update'>, options?: RequestOptions) {
    return this.client.call('TransportDocumentsController_update', { path: { id }, body }, options);
  }

  delete(id: string, options?: RequestOptions) {
    return this.client.call('TransportDocumentsController_delete', { path: { id } }, options);
  }

  /** Issues the document and reports it to the AT. **Fiscal and irreversible.** */
  issue(id: string, body: RequestBody<'TransportDocumentsController_issue'> = {}, options?: RequestOptions) {
    return this.client.call('TransportDocumentsController_issue', { path: { id }, body }, options);
  }

  /** Cancels an issued document at the AT. **Fiscal and irreversible.** */
  cancel(id: string, options?: RequestOptions) {
    return this.client.call('TransportDocumentsController_cancel', { path: { id } }, options);
  }

  pdf(id: string, query?: QueryParams<'TransportDocumentsController_getPdf'>, options?: RequestOptions) {
    return this.client.call('TransportDocumentsController_getPdf', { path: { id }, query }, options);
  }

  async downloadPdf(
    id: string,
    query?: QueryParams<'TransportDocumentsController_getPdf'>,
    options?: RequestOptions,
  ): Promise<ArrayBuffer> {
    const file = await this.pdf(id, query, options);
    return this.client.download(requireUrl(file.url, id), options);
  }
}
