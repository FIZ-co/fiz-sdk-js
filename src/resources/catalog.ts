import { paginateByOffset } from '../pagination.js';
import type { QueryParams, RequestBody, RequestOptions } from '../types.js';
import { DEFAULT_PAGE_SIZE, Resource, type ListAllQuery } from './base.js';

type CustomerListQuery = QueryParams<'CustomersController_findAll'>;

export class Customers extends Resource {
  create(body: RequestBody<'CustomersController_create'>, options?: RequestOptions) {
    return this.client.call('CustomersController_create', { body }, options);
  }

  list(query?: CustomerListQuery, options?: RequestOptions) {
    return this.client.call('CustomersController_findAll', { query }, options);
  }

  listAll(query: ListAllQuery<CustomerListQuery> = {}, options?: RequestOptions) {
    const { pageSize = DEFAULT_PAGE_SIZE, ...filters } = query;
    return paginateByOffset(
      (offset, limit) => this.list({ ...filters, offset, limit } as CustomerListQuery, options),
      { limit: pageSize },
    );
  }

  retrieve(id: string, options?: RequestOptions) {
    return this.client.call('CustomersController_findOne', { path: { id } }, options);
  }

  update(id: string, body: RequestBody<'CustomersController_update'>, options?: RequestOptions) {
    return this.client.call('CustomersController_update', { path: { id }, body }, options);
  }

  /** Archives the customer; `restore` brings it back. */
  delete(id: string, options?: RequestOptions) {
    return this.client.call('CustomersController_delete', { path: { id } }, options);
  }

  restore(id: string, options?: RequestOptions) {
    return this.client.call('CustomersController_restore', { path: { id } }, options);
  }
}

type ItemListQuery = QueryParams<'ItemsController_findAll'>;

/** Catalogue items (products and services) with their VAT. */
export class Items extends Resource {
  create(body: RequestBody<'ItemsController_create'>, options?: RequestOptions) {
    return this.client.call('ItemsController_create', { body }, options);
  }

  list(query?: ItemListQuery, options?: RequestOptions) {
    return this.client.call('ItemsController_findAll', { query }, options);
  }

  listAll(query: ListAllQuery<ItemListQuery> = {}, options?: RequestOptions) {
    const { pageSize = DEFAULT_PAGE_SIZE, ...filters } = query;
    return paginateByOffset(
      (offset, limit) => this.list({ ...filters, offset, limit } as ItemListQuery, options),
      { limit: pageSize },
    );
  }

  retrieve(id: string, options?: RequestOptions) {
    return this.client.call('ItemsController_findOne', { path: { id } }, options);
  }

  update(id: string, body: RequestBody<'ItemsController_update'>, options?: RequestOptions) {
    return this.client.call('ItemsController_update', { path: { id }, body }, options);
  }

  delete(id: string, options?: RequestOptions) {
    return this.client.call('ItemsController_delete', { path: { id } }, options);
  }
}

/** Invoice series and their AT registration. */
export class Series extends Resource {
  list(options?: RequestOptions) {
    return this.client.call('SeriesController_getAll', {}, options);
  }
}

/** PDF templates: build, validate, preview and install. */
export class Templates extends Resource {
  list(query?: QueryParams<'TemplatesController_getAll'>, options?: RequestOptions) {
    return this.client.call('TemplatesController_getAll', { query }, options);
  }

  create(body: RequestBody<'TemplatesController_create'>, options?: RequestOptions) {
    return this.client.call('TemplatesController_create', { body }, options);
  }

  retrieve(id: string, options?: RequestOptions) {
    return this.client.call('TemplatesController_findOne', { path: { id } }, options);
  }

  /** Replaces the template. */
  update(id: string, body: RequestBody<'TemplatesController_update'>, options?: RequestOptions) {
    return this.client.call('TemplatesController_update', { path: { id }, body }, options);
  }

  delete(id: string, options?: RequestOptions) {
    return this.client.call('TemplatesController_delete', { path: { id } }, options);
  }

  /** The fields a template can print. */
  fields(options?: RequestOptions) {
    return this.client.call('TemplatesController_fields', {}, options);
  }

  starters(options?: RequestOptions) {
    return this.client.call('TemplatesController_starters', {}, options);
  }

  starter(starterId: string, options?: RequestOptions) {
    return this.client.call('TemplatesController_starter', { path: { starterId } }, options);
  }

  /** Answers as `create` would, without storing anything. */
  validate(body: RequestBody<'TemplatesController_validate'>, options?: RequestOptions) {
    return this.client.call('TemplatesController_validate', { body }, options);
  }

  /** Renders the template on a sample document. */
  preview(body: RequestBody<'TemplatesController_preview'>, options?: RequestOptions) {
    return this.client.call('TemplatesController_preview', { body }, options);
  }
}
