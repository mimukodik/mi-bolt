// tests/contract/sdk-split.spec.ts — MIM-331, plan F4 D13.
//
// Pins the admin SDK split:
//   - the shop generator's excludeTags equals the admin generator's
//     includeTags equals the `ADMIN_TAGS` constant;
//   - every operation under a path beginning with `/admin/` carries
//     exactly one tag and that tag is one of `ADMIN_TAGS`;
//   - every operation carrying an `ADMIN_TAGS` tag sits under `/admin/`;
//   - the spec declares exactly 15 admin operations and 17 others;
//   - no admin `operationId` is exported by the shop SDK functions module;
//   - every admin `operationId` is exported by the admin SDK functions
//     module.
//
// The three tag lists being identical is the property the two
// `ng-openapi-gen*.json` configurations enforce together with
// `tests/contract/admin-tags.ts`; a drift in any of the three is caught
// by these checks.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import '@angular/compiler';

import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';

import { ADMIN_TAGS } from './admin-tags';
import * as shopOperations from '../../src/app/api/generated/functions';
import * as adminOperations from '../../projects/admin/src/app/api/generated/functions';

interface ShopConfig {
  excludeTags?: unknown;
}

interface AdminConfig {
  includeTags?: unknown;
}

interface OperationObject {
  operationId?: unknown;
  tags?: unknown;
}

interface PathItem {
  get?: OperationObject;
  put?: OperationObject;
  post?: OperationObject;
  delete?: OperationObject;
  options?: OperationObject;
  head?: OperationObject;
  patch?: OperationObject;
  trace?: OperationObject;
}

interface OpenApiSpec {
  paths?: Record<string, PathItem>;
}

const REPO_ROOT = resolve(__dirname, '../..');
const SHOP_CONFIG_PATH = resolve(REPO_ROOT, 'ng-openapi-gen.json');
const ADMIN_CONFIG_PATH = resolve(REPO_ROOT, 'ng-openapi-gen.admin.json');
const SPEC_PATH = resolve(REPO_ROOT, 'docs/api/openapi.yaml');

const HTTP_METHODS: (keyof Omit<PathItem, never>)[] = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
];

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function operationMatches(operation: OperationObject): string[] {
  return asStringList(operation.tags);
}

function isAdminPath(path: string): boolean {
  return path.startsWith('/admin') && (path.length === 6 || path[6] === '/');
}

describe('sdk-split: tag lists and admin coverage', () => {
  it('the shop excludeTags, the admin includeTags, and ADMIN_TAGS are equal', async () => {
    const [shopRaw, adminRaw] = await Promise.all([
      readFile(SHOP_CONFIG_PATH, 'utf8'),
      readFile(ADMIN_CONFIG_PATH, 'utf8'),
    ]);
    const shopConfig = JSON.parse(shopRaw) as ShopConfig;
    const adminConfig = JSON.parse(adminRaw) as AdminConfig;
    expect(asStringList(shopConfig.excludeTags)).toEqual([...ADMIN_TAGS]);
    expect(asStringList(adminConfig.includeTags)).toEqual([...ADMIN_TAGS]);
  });

  it('every /admin/ operation carries exactly one admin tag and that tag is in ADMIN_TAGS', async () => {
    const specRaw = await readFile(SPEC_PATH, 'utf8');
    const spec = yaml.load(specRaw) as OpenApiSpec;
    const paths = spec.paths ?? {};
    for (const [pathKey, pathItem] of Object.entries(paths)) {
      if (!isAdminPath(pathKey)) continue;
      for (const method of HTTP_METHODS) {
        const op = pathItem[method];
        if (!op) continue;
        const tags = operationMatches(op);
        const adminTagHits = tags.filter((tag) =>
          (ADMIN_TAGS as readonly string[]).includes(tag),
        );
        expect(
          adminTagHits.length,
          `${method.toUpperCase()} ${pathKey} should carry exactly one admin tag; saw ${JSON.stringify(tags)}`,
        ).toBe(1);
      }
    }
  });

  it('every operation carrying an ADMIN_TAGS tag sits under /admin/', async () => {
    const specRaw = await readFile(SPEC_PATH, 'utf8');
    const spec = yaml.load(specRaw) as OpenApiSpec;
    const paths = spec.paths ?? {};
    for (const [pathKey, pathItem] of Object.entries(paths)) {
      for (const method of HTTP_METHODS) {
        const op = pathItem[method];
        if (!op) continue;
        const tags = operationMatches(op);
        if (!tags.some((tag) => (ADMIN_TAGS as readonly string[]).includes(tag))) continue;
        expect(
          isAdminPath(pathKey),
          `${method.toUpperCase()} ${pathKey} is admin-tagged but not under /admin/`,
        ).toBe(true);
      }
    }
  });

  it('declares exactly 15 admin operations and 17 others', async () => {
    const specRaw = await readFile(SPEC_PATH, 'utf8');
    const spec = yaml.load(specRaw) as OpenApiSpec;
    const paths = spec.paths ?? {};
    let adminCount = 0;
    let otherCount = 0;
    for (const [pathKey, pathItem] of Object.entries(paths)) {
      for (const method of HTTP_METHODS) {
        const op = pathItem[method];
        if (!op) continue;
        const tags = operationMatches(op);
        if (tags.some((tag) => (ADMIN_TAGS as readonly string[]).includes(tag))) {
          adminCount += 1;
        } else {
          otherCount += 1;
        }
      }
    }
    expect(adminCount).toBe(15);
    expect(otherCount).toBe(17);
  });
});

describe('sdk-split: SDK exports', () => {
  it('no admin operationId is exported by the shop functions module', async () => {
    const specRaw = await readFile(SPEC_PATH, 'utf8');
    const spec = yaml.load(specRaw) as OpenApiSpec;
    const paths = spec.paths ?? {};
    const adminIds = new Set<string>();
    for (const pathItem of Object.values(paths)) {
      for (const method of HTTP_METHODS) {
        const op = pathItem[method];
        if (!op) continue;
        const tags = operationMatches(op);
        if (!tags.some((tag) => (ADMIN_TAGS as readonly string[]).includes(tag))) continue;
        if (typeof op.operationId === 'string') adminIds.add(op.operationId);
      }
    }
    const shopExports = shopOperations as unknown as Record<string, unknown>;
    const offenders: string[] = [];
    for (const id of adminIds) {
      const matches = Object.keys(shopExports).filter(
        (name) => name === id || name.startsWith(`${id}$`),
      );
      if (matches.length > 0) offenders.push(`${id} -> ${matches.join(',')}`);
    }
    expect(offenders, `shop SDK exports admin operationId(s): ${offenders.join('; ')}`).toEqual(
      [],
    );
  });

  it('every admin operationId is exported by the admin functions module', async () => {
    const specRaw = await readFile(SPEC_PATH, 'utf8');
    const spec = yaml.load(specRaw) as OpenApiSpec;
    const paths = spec.paths ?? {};
    const adminIds: string[] = [];
    for (const pathItem of Object.values(paths)) {
      for (const method of HTTP_METHODS) {
        const op = pathItem[method];
        if (!op) continue;
        const tags = operationMatches(op);
        if (!tags.some((tag) => (ADMIN_TAGS as readonly string[]).includes(tag))) continue;
        if (typeof op.operationId === 'string') adminIds.push(op.operationId);
      }
    }
    const adminExports = adminOperations as unknown as Record<string, unknown>;
    const missing: string[] = [];
    for (const id of adminIds) {
      const matches = Object.keys(adminExports).filter(
        (name) => name === id || name.startsWith(`${id}$`),
      );
      if (matches.length === 0) missing.push(id);
    }
    expect(
      missing,
      `admin SDK functions missing for: ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
