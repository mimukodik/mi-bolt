/**
 * Test helpers shared by the admin mock specs (`src/mocks/*.spec.ts`). Each
 * helper was copied verbatim in two or more specs; the owner asked for one
 * copy (MIM-296). Behaviour is unchanged: the specs call the same code.
 */
import { expect } from 'vitest';

import type { AdminProduct } from '../app/api/generated/models/admin-product';
import type { AdminProductInput } from '../app/api/generated/models/admin-product-input';
import type { ProblemCode } from '../app/api/generated/models/problem-code';
import { isRecord } from '../app/core/is-record';

import { createDb } from '../mocks/db';
import type { MockDb } from '../mocks/db';
import { XSRF_HEADER, issueXsrfCookie } from '../mocks/guards';
import { adminHandlers } from '../mocks/handlers';
import { productsWriteHandlers } from '../mocks/products-write.handlers';
import type { ScenarioName } from '../mocks/scenario';
import { SEED_ADMIN } from '../mocks/seed';
import { server } from './msw-server';

// Shared by the auth and users mock specs.

/** The random `traceId` of every Problem body, typed `unknown` so an object literal may carry it. */
export const ANY_TRACE_ID: unknown = expect.any(String);

export const SESSION_URL = new URL('/api/v1/admin/auth/session', document.baseURI).href;

export function xsrfCookie(): string | null {
  const jar = document.cookie.split('; ');
  for (const cookie of jar) {
    const eq = cookie.indexOf('=');
    if (eq < 0) continue;
    if (cookie.slice(0, eq) === 'XSRF-TOKEN') return cookie.slice(eq + 1);
  }
  return null;
}

/** Reads a JSON response body as a record, asserting the wire shape first. */
export async function jsonRecord(res: Response): Promise<Record<string, unknown>> {
  const body: unknown = await res.json();
  expect(isRecord(body)).toBe(true);
  return isRecord(body) ? body : {};
}

// Shared by the products-write mock specs.

export function productsUrl(): string {
  return new URL('/api/v1/admin/products', document.baseURI).href;
}

export function productUrl(id: number | string): string {
  return new URL(`/api/v1/admin/products/${String(id)}`, document.baseURI).href;
}

export function archiveUrl(id: number | string): string {
  return new URL(`/api/v1/admin/products/${String(id)}/archive`, document.baseURI).href;
}

export function restoreUrl(id: number | string): string {
  return new URL(`/api/v1/admin/products/${String(id)}/restore`, document.baseURI).href;
}

export function setup(scenario: ScenarioName = 'default'): MockDb {
  const db = createDb(scenario);
  db.sessionAdminId = SEED_ADMIN.id;
  issueXsrfCookie(db);
  server?.use(...productsWriteHandlers(db));
  return db;
}

export function requireProduct(db: MockDb, id: number): AdminProduct {
  const product = db.products.get(id);
  if (product === undefined) throw new Error(`product ${String(id)} missing from seed`);
  return product;
}

/** Maps an `AdminProduct` back to a valid `AdminProductInput`, as the edit form would. */
export function inputOf(product: AdminProduct): AdminProductInput {
  return {
    slug: product.slug,
    brand: product.brand,
    name: product.name,
    description: product.description,
    is5g: product.is5g,
    releasedAt: product.releasedAt,
    rank: product.rank,
    popularityScore: product.popularityScore,
    featured: product.featured,
    highlights: product.highlights,
    colors: product.colors.map((color) => ({
      code: color.code,
      name: color.name,
      swatchHex: color.swatchHex,
      imageId: color.image.id,
      alt: color.image.alt,
    })),
    variants: product.variants.map((variant) => ({
      slug: variant.slug,
      colorCode: variant.colorCode,
      storageGb: variant.storageGb,
      price: variant.price,
      stock: variant.stock,
    })),
    specGroups: product.specGroups,
  };
}

export function headersFor(
  db: MockDb,
  overrides: Record<string, string | undefined> = {},
): HeadersInit {
  const merged: Record<string, string | undefined> = {
    'content-type': 'application/json',
    [XSRF_HEADER]: db.xsrfToken ?? '',
    ...overrides,
  };
  const present = Object.entries(merged).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  return Object.fromEntries(present);
}

export function post(
  url: string,
  db: MockDb,
  body: unknown,
  headerOverrides: Record<string, string | undefined> = {},
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: headersFor(db, headerOverrides),
    body: JSON.stringify(body),
  });
}

export function put(
  url: string,
  db: MockDb,
  body: unknown,
  headerOverrides: Record<string, string | undefined> = {},
): Promise<Response> {
  return fetch(url, {
    method: 'PUT',
    headers: headersFor(db, headerOverrides),
    body: JSON.stringify(body),
  });
}

export function action(
  url: string,
  db: MockDb,
  headerOverrides: Record<string, string | undefined> = {},
): Promise<Response> {
  return fetch(url, { method: 'POST', headers: headersFor(db, headerOverrides) });
}

export function expectRecord(value: unknown): asserts value is Record<string, unknown> {
  expect(isRecord(value)).toBe(true);
}

export function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  expect(typeof value).toBe('string');
  if (typeof value !== 'string') throw new Error(`${key} is not a string`);
  return value;
}

export function readNumber(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  expect(typeof value).toBe('number');
  if (typeof value !== 'number') throw new Error(`${key} is not a number`);
  return value;
}

export function readArray(body: Record<string, unknown>, key: string): unknown[] {
  const value = body[key];
  expect(Array.isArray(value)).toBe(true);
  if (!Array.isArray(value)) throw new Error(`${key} is not an array`);
  return value;
}

export function fieldErrorsOf(body: Record<string, unknown>): Record<string, unknown>[] {
  return readArray(body, 'fieldErrors').map((item) => {
    expectRecord(item);
    return item;
  });
}

export async function readJsonRecord(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  expectRecord(body);
  return body;
}

export async function expectProblem(
  response: Response,
  status: number,
  code: ProblemCode,
): Promise<Record<string, unknown>> {
  expect(response.status).toBe(status);
  const body = await readJsonRecord(response);
  expect(readString(body, 'code')).toBe(code);
  return body;
}

// Shared by the products-read mock specs.

export const LIST_URL = new URL('/api/v1/admin/products', document.baseURI).href;

export const detailUrl = (id: number): string =>
  new URL(`/api/v1/admin/products/${String(id)}`, document.baseURI).href;

export function signedIn(scenario: 'default' | 'empty-catalog' | 'list-error' = 'default'): MockDb {
  const db = createDb(scenario);
  db.sessionAdminId = SEED_ADMIN.id;
  server?.use(...adminHandlers(db));
  return db;
}

export interface JsonResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Headers;
}

export async function getJson(url: string): Promise<JsonResponse> {
  const response = await fetch(url);
  return { status: response.status, body: await response.json(), headers: response.headers };
}

export function arrayOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

export function numberOf(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

export function stringOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export interface ListItemShape {
  readonly id: number;
  readonly slug: string;
  readonly brand: string;
  readonly featured: boolean;
}

export function asListItem(value: unknown): ListItemShape {
  if (!isRecord(value)) throw new Error('expected list item');
  return {
    id: numberOf(value['id']),
    slug: stringOf(value['slug']),
    brand: stringOf(value['brand']),
    featured: value['featured'] === true,
  };
}

export interface ListPageShape {
  readonly items: readonly ListItemShape[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

export function asListPage(value: unknown): ListPageShape {
  if (!isRecord(value)) throw new Error('expected list page');
  return {
    items: arrayOf(value['items']).map(asListItem),
    page: numberOf(value['page']),
    pageSize: numberOf(value['pageSize']),
    totalElements: numberOf(value['totalElements']),
    totalPages: numberOf(value['totalPages']),
  };
}

/** The five fields every `Problem` rejection is pinned on: status, code, title, detail, params. */
export interface ProblemShape {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail: string;
  readonly params: unknown;
}

export function asProblem(value: unknown): ProblemShape {
  if (!isRecord(value)) throw new Error('expected a problem');
  return {
    status: numberOf(value['status']),
    code: stringOf(value['code']),
    title: stringOf(value['title']),
    detail: stringOf(value['detail']),
    params: value['params'],
  };
}
