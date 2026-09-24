import { HttpClient, HttpEventType } from '@angular/common/http';
import type { HttpEvent } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { EMPTY, mergeMap, of, throwError } from 'rxjs';

import { ApiConfiguration } from '../../api/generated/api-configuration';
import { uploadAdminMedia } from '../../api/generated/fn/admin-media/upload-admin-media';
import type { UploadedImage } from '../../api/generated/models/uploaded-image';
import { RequestBuilder } from '../../api/generated/request-builder';

import { withUseXhr } from '../../core/api/transport.interceptor';

/** One event of an in-progress upload: a percent tick, or the finished image. */
export type UploadProgress =
  | { readonly kind: 'progress'; readonly percent: number }
  | { readonly kind: 'done'; readonly image: UploadedImage };

/**
 * Maps one `HttpEvent<UploadedImage>` onto zero or one `UploadProgress`
 * values: an upload-progress event with a known `total` becomes a percent
 * tick, one without a `total` is dropped, the final response becomes `done`
 * (or an error when the server answers with no body), and every other event
 * (the request being sent, headers received, and so on) is dropped too.
 */
function toUploadProgress(event: HttpEvent<UploadedImage>): Observable<UploadProgress> {
  if (event.type === HttpEventType.UploadProgress) {
    if (event.total === undefined) {
      return EMPTY;
    }
    return of({ kind: 'progress', percent: Math.round((event.loaded * 100) / event.total) });
  }
  if (event.type === HttpEventType.Response) {
    if (event.body === null) {
      return throwError(() => new Error('Upload answered without a body'));
    }
    return of({ kind: 'done', image: event.body });
  }
  return EMPTY;
}

/**
 * Uploads a file to `POST /admin/media`. Builds the request with the
 * generated `RequestBuilder` directly, rather than through the generated
 * `uploadAdminMedia` function, because that function's `HttpResponse` filter
 * drops the upload-progress events this control needs. The request carries
 * `USE_XHR`, so `transportInterceptor` sends it through the XHR backend: the
 * default fetch backend reports no upload progress.
 */
@Service()
export class MediaUploader {
  private readonly http = inject(HttpClient);
  private readonly apiConfiguration = inject(ApiConfiguration);

  upload(file: Blob): Observable<UploadProgress> {
    const requestBuilder = new RequestBuilder(
      this.apiConfiguration.rootUrl,
      uploadAdminMedia.PATH,
      'post',
    );
    requestBuilder.body({ file }, 'multipart/form-data');

    return this.http
      .request<UploadedImage>(
        requestBuilder.build({
          responseType: 'json',
          accept: 'application/json',
          reportProgress: true,
          context: withUseXhr(),
        }),
      )
      .pipe(mergeMap((event) => toUploadProgress(event)));
  }
}
