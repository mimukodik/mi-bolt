import { HttpErrorResponse, HttpEventType, provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { provideApiConfiguration } from '../../api/generated/api-configuration';
import type { UploadedImage } from '../../api/generated/models/uploaded-image';

import { MediaUploader } from './media-uploader';
import type { UploadProgress } from './media-uploader';

const UPLOAD_URL = 'http://api.test/api/v1/admin/media';

describe('MediaUploader', () => {
  let uploader: MediaUploader;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideApiConfiguration('http://api.test/api/v1'),
      ],
    });
    uploader = TestBed.inject(MediaUploader);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    controller.verify();
    TestBed.resetTestingModule();
  });

  it('POSTs the file as FormData with progress reporting and an Accept header', () => {
    const file = new File(['abc'], 'a.png', { type: 'image/png' });
    uploader.upload(file).subscribe();

    const request = controller.expectOne(UPLOAD_URL);
    expect(request.request.method).toBe('POST');
    // The generated RequestBuilder (api/generated/request-builder.ts) only ever
    // sets this deprecated flag; the XHR backend still honours it (OR'd with the
    // newer reportUploadProgress/reportDownloadProgress, _module-chunk.mjs:1954-1955).
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    expect(request.request.reportProgress).toBe(true);
    expect(request.request.headers.get('Accept')).toBe('application/json');
    const body: unknown = request.request.body;
    if (!(body instanceof FormData)) {
      throw new Error('expected a FormData body');
    }
    expect(body.get('file')).toBe(file);

    request.flush({});
  });

  it('emits a progress percent for an upload-progress event with a known total', () => {
    const file = new File(['abc'], 'a.png', { type: 'image/png' });
    const events: UploadProgress[] = [];
    uploader.upload(file).subscribe((event) => events.push(event));

    const request = controller.expectOne(UPLOAD_URL);
    request.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 200 });

    expect(events).toEqual([{ kind: 'progress', percent: 25 }]);

    request.flush({});
  });

  it('emits nothing for an upload-progress event with no total', () => {
    const file = new File(['abc'], 'a.png', { type: 'image/png' });
    const events: UploadProgress[] = [];
    uploader.upload(file).subscribe((event) => events.push(event));

    const request = controller.expectOne(UPLOAD_URL);
    request.event({ type: HttpEventType.UploadProgress, loaded: 50 });

    expect(events).toEqual([]);

    request.flush({});
  });

  it('emits done with the image and completes on a 201', () => {
    const file = new File(['abc'], 'a.png', { type: 'image/png' });
    const image: UploadedImage = {
      id: 'abc',
      src: '/api/v1/media/abc',
      contentType: 'image/png',
      width: 10,
      height: 20,
      sizeBytes: 3,
    };
    const events: UploadProgress[] = [];
    let completed = false;
    uploader.upload(file).subscribe({
      next: (event) => events.push(event),
      complete: () => {
        completed = true;
      },
    });

    const request = controller.expectOne(UPLOAD_URL);
    request.flush(image, { status: 201, statusText: 'Created' });

    expect(events).toEqual([{ kind: 'done', image }]);
    expect(completed).toBe(true);
  });

  it('errors with an HttpErrorResponse of status 413 on a 413 answer', () => {
    const file = new File(['abc'], 'a.png', { type: 'image/png' });
    let receivedError: unknown;
    uploader.upload(file).subscribe({
      next: () => undefined,
      error: (error: unknown) => {
        receivedError = error;
      },
    });

    const request = controller.expectOne(UPLOAD_URL);
    request.flush({ code: 'PAYLOAD_TOO_LARGE' }, { status: 413, statusText: 'Payload Too Large' });

    if (!(receivedError instanceof HttpErrorResponse)) {
      throw new Error('expected an HttpErrorResponse');
    }
    expect(receivedError.status).toBe(413);
  });

  it('errors with "Upload answered without a body" on a 201 with a null body', () => {
    // Fails if the `event.body === null` check (media-uploader.ts:32-34) is removed.
    const file = new File(['abc'], 'a.png', { type: 'image/png' });
    let receivedError: unknown;
    uploader.upload(file).subscribe({
      next: () => undefined,
      error: (error: unknown) => {
        receivedError = error;
      },
    });

    const request = controller.expectOne(UPLOAD_URL);
    request.flush(null, { status: 201, statusText: 'Created' });

    if (!(receivedError instanceof Error)) {
      throw new Error('expected an Error');
    }
    expect(receivedError.message).toBe('Upload answered without a body');
  });
});
