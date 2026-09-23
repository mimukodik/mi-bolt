/**
 * Spec for `mediaHandlers` (projects/admin/src/mocks/media.handlers.ts):
 * the admin upload endpoint (`POST /admin/media`) and the public media
 * endpoint (`GET /media/:imageId`), driven through the Node MSW server
 * the way `guards.spec.ts` does it.
 *
 * The PNG fixture is the PNG signature followed by the ASCII of
 * `mibolt-f9`, 17 bytes whose SHA-256 is computed outside the code
 * under test (`PNG_FIXTURE_ID` below).
 */
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { useMswServer, server } from '../testing/msw-server';
import { createDb } from './db';
import { issueXsrfCookie } from './guards';
import { mediaHandlers, type ImageSizeReader, type SeedFetcher } from './media.handlers';
import { SEED_ADMIN, seedCatalog } from './seed';

useMswServer();

/**
 * The admin mock runs in the browser, where `Blob` and `File` are one set.
 * This spec runs under jsdom, whose `Blob`/`File` are not the classes
 * Node's own `fetch` parses a multipart body into: Node's undici captures
 * the native `File` once when it loads, before jsdom replaces the global,
 * then compares every part it parses out of a request body against that
 * captured class. Swapping the globals to Node's own `Blob`/`File` for the
 * spec's duration is what lets an upload's `FormData` survive the round
 * trip through `fetch` and the handler's `request.formData()`. The upload
 * bodies below are built by hand rather than with `FormData`, because
 * jsdom's own `FormData` stringifies a `Blob` that is not its own.
 */
let originalBlob!: typeof globalThis.Blob;
let originalFile!: typeof globalThis.File;

beforeAll(() => {
  originalBlob = globalThis.Blob;
  originalFile = globalThis.File;
  Object.defineProperty(globalThis, 'Blob', {
    value: NodeBlob,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'File', {
    value: NodeFile,
    configurable: true,
    writable: true,
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, 'Blob', {
    value: originalBlob,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'File', {
    value: originalFile,
    configurable: true,
    writable: true,
  });
});

const UPLOAD_URL = new URL('/api/v1/admin/media', document.baseURI).href;
const PNG_FIXTURE_ID = '39e24595c57a13b2e5a463285d9ad8f3028fb55183e521729d7156f7dd274a58';
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_FIXTURE_BYTES = new Uint8Array([
  ...PNG_SIGNATURE,
  ...new TextEncoder().encode('mibolt-f9'),
]);

function mediaUrl(id: string): string {
  return new URL(`/api/v1/media/${id}`, document.baseURI).href;
}

function readSizeStub(): ImageSizeReader {
  return () => Promise.resolve({ width: 300, height: 600 });
}

function throwingReadSizeStub(): ImageSizeReader {
  return () => Promise.reject(new Error('cannot read image size'));
}

function fetchSeedStub(): { readonly fetchSeed: SeedFetcher; readonly urls: URL[] } {
  const urls: URL[] = [];
  const fetchSeed: SeedFetcher = (url) => {
    urls.push(url);
    return Promise.resolve(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    );
  };
  return { fetchSeed, urls };
}

const MULTIPART_BOUNDARY = 'mibolt-f9-boundary';
const MULTIPART_CONTENT_TYPE = `multipart/form-data; boundary=${MULTIPART_BOUNDARY}`;

interface MultipartPart {
  readonly name: string;
  readonly filename?: string;
  readonly type?: string;
  readonly bytes: Uint8Array<ArrayBuffer> | string;
}

/** A multipart/form-data body built by hand, for the reason above the swap. */
function multipartBody(parts: readonly MultipartPart[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  for (const part of parts) {
    chunks.push(encoder.encode(`--${MULTIPART_BOUNDARY}\r\n`));
    const filenameHeader = part.filename === undefined ? '' : `; filename="${part.filename}"`;
    chunks.push(
      encoder.encode(`Content-Disposition: form-data; name="${part.name}"${filenameHeader}\r\n`),
    );
    if (part.type !== undefined) {
      chunks.push(encoder.encode(`Content-Type: ${part.type}\r\n`));
    }
    chunks.push(encoder.encode('\r\n'));
    chunks.push(typeof part.bytes === 'string' ? encoder.encode(part.bytes) : part.bytes);
    chunks.push(encoder.encode('\r\n'));
  }
  chunks.push(encoder.encode(`--${MULTIPART_BOUNDARY}--\r\n`));

  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}

function uploadFileBody(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  return multipartBody([
    { name: 'file', filename: 'upload.bin', type: 'application/octet-stream', bytes },
  ]);
}

function uploadWithoutFileBody(): Uint8Array<ArrayBuffer> {
  return multipartBody([{ name: 'other', bytes: 'not a file' }]);
}

function uploadImagePartOnlyBody(): Uint8Array<ArrayBuffer> {
  return multipartBody([
    { name: 'image', filename: 'photo.png', type: 'image/png', bytes: PNG_FIXTURE_BYTES },
  ]);
}

function uploadWithTextFilePartBody(): Uint8Array<ArrayBuffer> {
  return multipartBody([{ name: 'file', bytes: 'not a file' }]);
}

/** The exact `Problem` body `problem()` (media.handlers.ts) builds, for `toEqual` assertions. */
function expectedProblem(
  status: number,
  code: string,
  title: string,
  detail: string,
  params?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: `urn:mi-bolt:problem:${code.toLowerCase().replace(/_/g, '-')}`,
    title,
    status,
    code,
    detail,
    traceId: expect.any(String),
    fieldErrors: [],
    ...(params === undefined ? {} : { params }),
  };
}

function setUpMediaHandlers(
  db: ReturnType<typeof createDb>,
  readSize: ImageSizeReader = readSizeStub(),
  fetchSeed: SeedFetcher = fetchSeedStub().fetchSeed,
): string {
  db.sessionAdminId = SEED_ADMIN.id;
  issueXsrfCookie(db);
  server?.use(...mediaHandlers(db, readSize, fetchSeed));
  return db.xsrfToken ?? '';
}

describe('POST /admin/media', () => {
  it('201s a new PNG upload, stores it and answers the UploadedImage body', async () => {
    const db = createDb();
    const token = setUpMediaHandlers(db);

    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: uploadFileBody(PNG_FIXTURE_BYTES),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('Location')).toBe(`/api/v1/media/${PNG_FIXTURE_ID}`);
    expect(await response.json()).toEqual({
      id: PNG_FIXTURE_ID,
      src: `/api/v1/media/${PNG_FIXTURE_ID}`,
      contentType: 'image/png',
      width: 300,
      height: 600,
      sizeBytes: 17,
    });
    expect(db.images.get(PNG_FIXTURE_ID)).toBeDefined();
  });

  it('200s the same bytes again with no Location header', async () => {
    const db = createDb();
    db.images.set(PNG_FIXTURE_ID, {
      bytes: PNG_FIXTURE_BYTES,
      seedFile: null,
      contentType: 'image/png',
      width: 300,
      height: 600,
    });
    const token = setUpMediaHandlers(db);

    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: uploadFileBody(PNG_FIXTURE_BYTES),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Location')).toBeNull();
    expect(await response.json()).toEqual({
      id: PNG_FIXTURE_ID,
      src: `/api/v1/media/${PNG_FIXTURE_ID}`,
      contentType: 'image/png',
      width: 300,
      height: 600,
      sizeBytes: 17,
    });
  });

  it('201s a JPEG upload', async () => {
    const db = createDb();
    const token = setUpMediaHandlers(db);
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]);

    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: uploadFileBody(bytes),
    });

    expect(response.status).toBe(201);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ contentType: 'image/jpeg' });
  });

  it('201s a WebP upload', async () => {
    const db = createDb();
    const token = setUpMediaHandlers(db);
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3, 4,
    ]);

    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: uploadFileBody(bytes),
    });

    expect(response.status).toBe(201);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ contentType: 'image/webp' });
  });

  it('422s a text file as UNSUPPORTED_IMAGE_TYPE', async () => {
    const db = createDb();
    const token = setUpMediaHandlers(db);

    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: uploadFileBody(new TextEncoder().encode('hello')),
    });

    expect(response.status).toBe(422);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      fieldErrors: [{ path: '/file', code: 'UNSUPPORTED_IMAGE_TYPE' }],
    });
  });

  it('422s an empty file as EMPTY_FILE', async () => {
    const db = createDb();
    const token = setUpMediaHandlers(db);

    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: uploadFileBody(new Uint8Array(0)),
    });

    expect(response.status).toBe(422);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ fieldErrors: [{ path: '/file', code: 'EMPTY_FILE' }] });
  });

  it('422s an unreadable image as IMAGE_UNREADABLE', async () => {
    const db = createDb();
    const token = setUpMediaHandlers(db, throwingReadSizeStub());

    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: uploadFileBody(PNG_FIXTURE_BYTES),
    });

    expect(response.status).toBe(422);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ fieldErrors: [{ path: '/file', code: 'IMAGE_UNREADABLE' }] });
  });

  it('413s an upload over the size limit', async () => {
    const db = createDb();
    const token = setUpMediaHandlers(db);
    const bytes = new Uint8Array(1048577);
    bytes.set(PNG_SIGNATURE, 0);

    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: uploadFileBody(bytes),
    });

    expect(response.status).toBe(413);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', params: { maxBytes: 1048576 } });
  });

  // Fails if the size-loop in handleUpload (media.handlers.ts) runs after the query-key check.
  it('413s an oversized part before an unknown query key', async () => {
    const db = createDb();
    const token = setUpMediaHandlers(db);
    const bytes = new Uint8Array(1048577);
    bytes.set(PNG_SIGNATURE, 0);

    const response = await fetch(`${UPLOAD_URL}?x=1`, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: uploadFileBody(bytes),
    });

    expect(response.status).toBe(413);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', params: { maxBytes: 1048576 } });
  });

  // Fails if handleUpload's `form.get('file')` check (media.handlers.ts) stops answering
  // "Missing required request part" for a request with no `file` part.
  it('400s a request with no file part', async () => {
    const db = createDb();
    const token = setUpMediaHandlers(db);

    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: uploadImagePartOnlyBody(),
    });

    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    expect(body).toEqual(
      expectedProblem(400, 'INVALID_REQUEST', 'Invalid request', 'Missing required request part', {
        part: 'file',
      }),
    );
  });

  // Fails if the `for (const [name, value] of form.entries())` loop in handleUpload
  // (media.handlers.ts) stops answering an unknown parameter for a text part.
  it('400s a text part as an unknown parameter', async () => {
    const db = createDb();
    const token = setUpMediaHandlers(db);

    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: uploadWithoutFileBody(),
    });

    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    expect(body).toEqual(
      expectedProblem(400, 'INVALID_REQUEST', 'Invalid request', 'Unknown query parameter', {
        parameter: 'other',
      }),
    );
  });

  // Fails if the text-part loop in handleUpload (media.handlers.ts) skips a part named
  // `file` that carries no filename (a string value, not a Blob).
  it('400s a text part named file as an unknown parameter', async () => {
    const db = createDb();
    const token = setUpMediaHandlers(db);

    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: uploadWithTextFilePartBody(),
    });

    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    expect(body).toEqual(
      expectedProblem(400, 'INVALID_REQUEST', 'Invalid request', 'Unknown query parameter', {
        parameter: 'file',
      }),
    );
  });

  // Fails if handleUpload's query-key check (media.handlers.ts) runs after the text-part loop.
  it('400s an unknown query key before the text parts', async () => {
    const db = createDb();
    const token = setUpMediaHandlers(db);

    const response = await fetch(`${UPLOAD_URL}?x=1`, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: uploadWithoutFileBody(),
    });

    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    expect(body).toEqual(
      expectedProblem(400, 'INVALID_REQUEST', 'Invalid request', 'Unknown query parameter', {
        parameter: 'x',
      }),
    );
  });

  // Fails if handleUpload's query-key check (media.handlers.ts) is skipped for an otherwise
  // valid upload, or if the upload is stored before that check runs.
  it('400s an unknown query key on a valid upload', async () => {
    const db = createDb();
    const token = setUpMediaHandlers(db);

    const response = await fetch(`${UPLOAD_URL}?x=1`, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: uploadFileBody(PNG_FIXTURE_BYTES),
    });

    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    expect(body).toEqual(
      expectedProblem(400, 'INVALID_REQUEST', 'Invalid request', 'Unknown query parameter', {
        parameter: 'x',
      }),
    );
    expect(db.images.has(PNG_FIXTURE_ID)).toBe(false);
  });

  // Fails if the try/catch around `request.formData()` in handleUpload (media.handlers.ts)
  // stops catching a body that is not valid multipart.
  it('400s a malformed multipart body', async () => {
    const db = createDb();
    const token = setUpMediaHandlers(db);

    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: 'not multipart',
    });

    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    expect(body).toEqual(
      expectedProblem(400, 'INVALID_REQUEST', 'Invalid request', 'Malformed multipart request'),
    );
  });

  // Fails if the query-key check in handleUpload (media.handlers.ts) runs after the
  // `db.scenario === 'upload-error'` check.
  it('400s an unknown query key before the upload-error scenario', async () => {
    const db = createDb('upload-error');
    const token = setUpMediaHandlers(db);

    const response = await fetch(`${UPLOAD_URL}?x=1`, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: uploadFileBody(PNG_FIXTURE_BYTES),
    });

    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    expect(body).toEqual(
      expectedProblem(400, 'INVALID_REQUEST', 'Invalid request', 'Unknown query parameter', {
        parameter: 'x',
      }),
    );
  });

  it('403s without the XSRF header', async () => {
    const db = createDb();
    setUpMediaHandlers(db);

    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: uploadFileBody(PNG_FIXTURE_BYTES),
    });

    expect(response.status).toBe(403);
  });

  it('401s with no signed-in admin', async () => {
    const db = createDb();
    const token = setUpMediaHandlers(db);
    db.sessionAdminId = null;

    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: uploadFileBody(PNG_FIXTURE_BYTES),
    });

    expect(response.status).toBe(401);
  });

  // Fails if the 503 detail differs from the backend's ProblemAdvice wording.
  it('503s in the upload-error scenario', async () => {
    const db = createDb('upload-error');
    const token = setUpMediaHandlers(db);

    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token, 'Content-Type': MULTIPART_CONTENT_TYPE },
      body: uploadFileBody(PNG_FIXTURE_BYTES),
    });

    expect(response.status).toBe(503);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      title: 'Service unavailable',
      detail: 'The service is temporarily unavailable',
    });
  });
});

describe('GET /media/:imageId', () => {
  it('200s an uploaded id with the exact bytes and cache headers', async () => {
    const db = createDb();
    db.images.set(PNG_FIXTURE_ID, {
      bytes: PNG_FIXTURE_BYTES,
      seedFile: null,
      contentType: 'image/png',
      width: 300,
      height: 600,
    });
    setUpMediaHandlers(db);

    const response = await fetch(mediaUrl(PNG_FIXTURE_ID));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_FIXTURE_BYTES);
  });

  it('404s an unknown id', async () => {
    const db = createDb();
    setUpMediaHandlers(db);

    const response = await fetch(mediaUrl('abc'));

    expect(response.status).toBe(404);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ params: { imageId: 'abc' } });
  });

  // Fails if handleGet's query-key check (media.handlers.ts) runs after the `db.images.get` lookup.
  it('400s an unknown query key before the id lookup', async () => {
    const db = createDb();
    setUpMediaHandlers(db);

    const response = await fetch(`${mediaUrl('abc')}?x=1&y=2`);

    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    expect(body).toEqual(
      expectedProblem(400, 'INVALID_REQUEST', 'Invalid request', 'Unknown query parameter', {
        parameter: 'x',
      }),
    );
  });

  it('serves a seed id through the seed fetcher', async () => {
    const db = createDb();
    const stub = fetchSeedStub();
    db.sessionAdminId = SEED_ADMIN.id;
    issueXsrfCookie(db);
    server?.use(...mediaHandlers(db, readSizeStub(), stub.fetchSeed));
    const seedImageId = seedCatalog().products[0].colors[0].image.id;

    const response = await fetch(mediaUrl(seedImageId));

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(stub.urls).toHaveLength(1);
    expect(stub.urls[0]?.href.endsWith(`/media/${seedImageId}.png`)).toBe(true);
  });

  // Fails if handleGet (media.handlers.ts) serves a seed from `imageId` plus a fixed
  // extension instead of from the entry's own `seedFile`.
  it('serves a .jpeg seed from its own file name', async () => {
    const db = createDb();
    const stub = fetchSeedStub();
    db.images.set('jpeg-seed', {
      bytes: null,
      seedFile: 'jpeg-seed.jpeg',
      contentType: 'image/jpeg',
      width: 1,
      height: 1,
    });
    db.sessionAdminId = SEED_ADMIN.id;
    issueXsrfCookie(db);
    server?.use(...mediaHandlers(db, readSizeStub(), stub.fetchSeed));

    const response = await fetch(mediaUrl('jpeg-seed'));

    expect(response.status).toBe(200);
    expect(stub.urls).toHaveLength(1);
    expect(stub.urls[0]?.href.endsWith('/media/jpeg-seed.jpeg')).toBe(true);
  });
});
