// tests/web-image/nginx-api-gzip.spec.ts — the web image's nginx never
// gzips a proxied /api/ response.
//
// gzip weakens a strong ETag (RFC 7232 §2.3: a representation altered by
// a content-coding gets a weak validator), so a compressed /api/ response
// carries `ETag: W/"n"` instead of the backend's `ETag: "n"`. The admin's
// PUT/DELETE requests echo that ETag back as If-Match, and
// contracts/commerce/openapi.yaml's ProductIfMatch pattern (`^"[0-9]+"$`)
// rejects the weak form with 400 INVALID_REQUEST (MIM-417). This spec reads
// frontend/nginx/default.conf.template and asserts the `location ^~ /api/`
// block turns gzip off, while the server-level `gzip on;` still stands for
// the static assets it was written for.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, it, expect, beforeAll } from 'vitest';

const TEMPLATE_PATH = resolve(__dirname, '../../nginx/default.conf.template');

function extractApiLocationBlock(template: string): string {
  const startMarker = 'location ^~ /api/ {';
  const startIndex = template.indexOf(startMarker);
  if (startIndex === -1) {
    throw new Error(`could not find "${startMarker}" in ${TEMPLATE_PATH}`);
  }
  const braceStart = startIndex + startMarker.length - 1;
  let depth = 0;
  for (let i = braceStart; i < template.length; i++) {
    if (template[i] === '{') {
      depth++;
    } else if (template[i] === '}') {
      depth--;
      if (depth === 0) {
        return template.slice(startIndex, i + 1);
      }
    }
  }
  throw new Error(`unterminated "${startMarker}" block in ${TEMPLATE_PATH}`);
}

describe('web image nginx /api/ gzip', () => {
  let template: string;
  let apiBlock: string;

  beforeAll(async () => {
    template = await readFile(TEMPLATE_PATH, 'utf-8');
    apiBlock = extractApiLocationBlock(template);
  });

  it('turns gzip off inside the /api/ location block', () => {
    expect(apiBlock).toMatch(/\bgzip off;/);
  });

  it('still turns gzip on at the server level, for everything but /api/', () => {
    expect(template).toMatch(/\bgzip on;/);
  });
});
