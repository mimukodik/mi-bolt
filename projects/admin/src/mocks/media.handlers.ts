/**
 * MSW handlers for the admin media slice (MIM-336): `uploadAdminMedia`
 * (`POST /admin/media`) and `getMedia` (`GET /media/{imageId}`), the way
 * the backend's media service will answer (unit B14 takes these same
 * rules; B3's multipart answers are already on the backend).
 *
 * An upload is stored under the lower-case hex SHA-256 of its bytes, so
 * uploading the same bytes twice answers 200 rather than storing a second
 * copy. The type is read from the bytes' magic numbers, never from the
 * declared part type. `GET` is public and serves either the stored bytes
 * or, for a seed image (`bytes === null`), the fixture file under
 * `public/media/`.
 */
import { HttpResponse, bypass, http, type HttpHandler } from 'msw';

import type { Problem } from '../app/api/generated/models/problem';
import type { UploadedImage } from '../app/api/generated/models/uploaded-image';
import type { MockDb } from './db';
import { csrfRejection, sessionRejection } from './guards';
import { problem } from './problem';

export type ImageSizeReader = (
  blob: Blob,
) => Promise<{ readonly width: number; readonly height: number }>;
export type SeedFetcher = (url: URL) => Promise<Response>;

/** `spring.servlet.multipart.max-file-size` default `1MB` (`ProblemAdvice.java:66-67`). */
const MAX_UPLOAD_BYTES = 1048576;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50] as const;

const EXTENSION_BY_CONTENT_TYPE: Record<UploadedImage['contentType'], string> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
};

async function readImageSize(
  blob: Blob,
): Promise<{ readonly width: number; readonly height: number }> {
  const bitmap = await createImageBitmap(blob);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

function fetchSeedFile(url: URL): Promise<Response> {
  return fetch(bypass(url));
}

function matchesSignature(
  bytes: Uint8Array,
  signature: readonly number[],
  offset: number,
): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/** The type from the bytes' magic numbers; never from the declared part type. */
function detectContentType(bytes: Uint8Array): UploadedImage['contentType'] | undefined {
  if (matchesSignature(bytes, PNG_SIGNATURE, 0)) return 'image/png';
  if (matchesSignature(bytes, JPEG_SIGNATURE, 0)) return 'image/jpeg';
  if (matchesSignature(bytes, RIFF_SIGNATURE, 0) && matchesSignature(bytes, WEBP_SIGNATURE, 8)) {
    return 'image/webp';
  }
  return undefined;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function mediaUrl(id: string): string {
  return `/api/v1/media/${id}`;
}

function buildUploadedImage(
  id: string,
  contentType: UploadedImage['contentType'],
  width: number,
  height: number,
  sizeBytes: number,
): UploadedImage {
  return { id, src: mediaUrl(id), contentType, width, height, sizeBytes };
}

/** The 422 shape every rejected upload field answers with. */
function fieldRejected(code: string): HttpResponse<Problem> {
  return problem(422, 'VALIDATION_FAILED', 'Section rejected', {
    detail: 'One or more supplied fields are not acceptable',
    fieldErrors: [{ path: '/file', code }],
  });
}

async function handleUpload(
  db: MockDb,
  request: Request,
  readSize: ImageSizeReader,
): Promise<Response> {
  const csrf = csrfRejection(db, request);
  if (csrf !== undefined) return csrf;
  const session = sessionRejection(db);
  if (session !== undefined) return session;

  if (db.scenario === 'upload-error') {
    return problem(503, 'SERVICE_UNAVAILABLE', 'Service unavailable', {
      detail: 'The service is temporarily unavailable',
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return problem(400, 'INVALID_REQUEST', 'Invalid request', {
      detail: 'Malformed multipart request',
    });
  }

  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return problem(400, 'INVALID_REQUEST', 'Invalid request', {
      detail: 'Missing required request part',
      params: { part: 'file' },
    });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return problem(413, 'PAYLOAD_TOO_LARGE', 'Upload too large', {
      detail: 'The upload exceeds the size limit',
      params: { maxBytes: MAX_UPLOAD_BYTES },
    });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) return fieldRejected('EMPTY_FILE');

  const contentType = detectContentType(bytes);
  if (contentType === undefined) return fieldRejected('UNSUPPORTED_IMAGE_TYPE');

  const id = await sha256Hex(bytes);
  const existing = db.images.get(id);
  if (existing !== undefined) {
    return HttpResponse.json(
      buildUploadedImage(id, existing.contentType, existing.width, existing.height, bytes.length),
      { status: 200 },
    );
  }

  let size: { readonly width: number; readonly height: number };
  try {
    size = await readSize(new Blob([bytes], { type: contentType }));
  } catch {
    return fieldRejected('IMAGE_UNREADABLE');
  }

  db.images.set(id, { bytes, contentType, width: size.width, height: size.height });

  return HttpResponse.json(
    buildUploadedImage(id, contentType, size.width, size.height, bytes.length),
    { status: 201, headers: { Location: mediaUrl(id) } },
  );
}

async function handleGet(db: MockDb, imageId: string, fetchSeed: SeedFetcher): Promise<Response> {
  const entry = db.images.get(imageId);
  if (entry === undefined) {
    return problem(404, 'NOT_FOUND', 'Resource not found', {
      detail: `image not found: ${imageId}`,
      params: { imageId },
    });
  }

  if (entry.bytes !== null) {
    return new HttpResponse(entry.bytes.slice(), {
      status: 200,
      headers: {
        'Content-Type': entry.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  const extension = EXTENSION_BY_CONTENT_TYPE[entry.contentType];
  return await fetchSeed(new URL(`media/${imageId}.${extension}`, document.baseURI));
}

export function mediaHandlers(
  db: MockDb,
  readSize: ImageSizeReader = readImageSize,
  fetchSeed: SeedFetcher = fetchSeedFile,
): HttpHandler[] {
  return [
    http.post('*/api/v1/admin/media', ({ request }) => handleUpload(db, request, readSize)),
    http.get('*/api/v1/media/:imageId', ({ params }) => {
      const imageId = String(params['imageId']);
      return handleGet(db, imageId, fetchSeed);
    }),
  ];
}
