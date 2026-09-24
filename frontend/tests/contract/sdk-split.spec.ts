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

import { isRecord } from '../../projects/storefront/src/mocks/is-record';
import { ADMIN_TAGS, HTTP_METHOD_KEYS, isAdminTag } from './admin-tags';
import * as shopOperations from '../../projects/shop-api/src/generated/functions';
import * as adminOperations from '../../projects/admin/src/app/api/generated/functions';

interface SpecOperation {
  readonly path: string;
  readonly method: string;
  readonly operationId: string | undefined;
  readonly tags: readonly string[];
}

const REPO_ROOT = resolve(__dirname, '../..');
const SHOP_CONFIG_PATH = resolve(REPO_ROOT, 'ng-openapi-gen.json');
const ADMIN_CONFIG_PATH = resolve(REPO_ROOT, 'ng-openapi-gen.admin.json');
const SPEC_PATH = resolve(REPO_ROOT, '../contracts/commerce/openapi.yaml');

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

async function configList(path: string, key: string): Promise<string[]> {
  const config: unknown = JSON.parse(await readFile(path, 'utf8'));
  return asStringList(isRecord(config) ? config[key] : undefined);
}

async function loadOperations(): Promise<SpecOperation[]> {
  const spec: unknown = yaml.load(await readFile(SPEC_PATH, 'utf8'));
  const paths = isRecord(spec) ? spec['paths'] : undefined;
  if (!isRecord(paths)) return [];
  const operations: SpecOperation[] = [];
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) continue;
    for (const method of HTTP_METHOD_KEYS) {
      const operation = pathItem[method];
      if (!isRecord(operation)) continue;
      const operationId = operation['operationId'];
      operations.push({
        path,
        method,
        operationId: typeof operationId === 'string' ? operationId : undefined,
        tags: asStringList(operation['tags']),
      });
    }
  }
  return operations;
}

function isAdminTagged(operation: SpecOperation): boolean {
  return operation.tags.some(isAdminTag);
}

function adminOperationIds(operations: readonly SpecOperation[]): string[] {
  return operations
    .filter(isAdminTagged)
    .map((operation) => operation.operationId)
    .filter((id): id is string => id !== undefined);
}

function exportsFor(moduleExports: object, operationId: string): string[] {
  return Object.keys(moduleExports).filter(
    (name) => name === operationId || name.startsWith(`${operationId}$`),
  );
}

function isAdminPath(path: string): boolean {
  return path.startsWith('/admin') && (path.length === 6 || path[6] === '/');
}

describe('sdk-split: tag lists and admin coverage', () => {
  it('the shop excludeTags, the admin includeTags, and ADMIN_TAGS are equal', async () => {
    expect(await configList(SHOP_CONFIG_PATH, 'excludeTags')).toEqual([...ADMIN_TAGS]);
    expect(await configList(ADMIN_CONFIG_PATH, 'includeTags')).toEqual([...ADMIN_TAGS]);
  });

  it('every /admin/ operation carries exactly one admin tag and that tag is in ADMIN_TAGS', async () => {
    for (const operation of await loadOperations()) {
      if (!isAdminPath(operation.path)) continue;
      expect(
        operation.tags.filter(isAdminTag).length,
        `${operation.method.toUpperCase()} ${operation.path} should carry exactly one admin tag; saw ${JSON.stringify(operation.tags)}`,
      ).toBe(1);
    }
  });

  it('every operation carrying an ADMIN_TAGS tag sits under /admin/', async () => {
    for (const operation of await loadOperations()) {
      if (!isAdminTagged(operation)) continue;
      expect(
        isAdminPath(operation.path),
        `${operation.method.toUpperCase()} ${operation.path} is admin-tagged but not under /admin/`,
      ).toBe(true);
    }
  });

  it('declares exactly 15 admin operations and 17 others', async () => {
    const operations = await loadOperations();
    expect(operations.filter(isAdminTagged)).toHaveLength(15);
    expect(operations.filter((operation) => !isAdminTagged(operation))).toHaveLength(17);
  });
});

describe('sdk-split: SDK exports', () => {
  it('no admin operationId is exported by the shop functions module', async () => {
    const offenders = adminOperationIds(await loadOperations())
      .map((id) => ({ id, matches: exportsFor(shopOperations, id) }))
      .filter(({ matches }) => matches.length > 0)
      .map(({ id, matches }) => `${id} -> ${matches.join(',')}`);
    expect(offenders, `shop SDK exports admin operationId(s): ${offenders.join('; ')}`).toEqual([]);
  });

  it('every admin operationId is exported by the admin functions module', async () => {
    const ids = adminOperationIds(await loadOperations());
    expect(ids).toHaveLength(15);
    const missing = ids.filter((id) => exportsFor(adminOperations, id).length === 0);
    expect(missing, `admin SDK functions missing for: ${missing.join(', ')}`).toEqual([]);
  });
});
