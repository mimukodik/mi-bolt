import { HttpContextToken, HttpXhrBackend } from '@angular/common/http';
import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

/**
 * Marks a request for the XHR backend. HttpClient sends every other request
 * through its default fetch backend; fetch cannot report upload progress, so
 * the image upload (`MediaUploader`) sets this to `true`
 * (https://angular.dev/guide/http/setup#withxhr).
 */
export const USE_XHR = new HttpContextToken<boolean>(() => false);

/**
 * Hands a request marked with `USE_XHR` to `HttpXhrBackend` and passes every
 * other request on. It stays last in `withInterceptors([...])` (app.config.ts),
 * so every interceptor before it, and HttpClient's own XSRF interceptor, still
 * sees the marked request.
 */
export const transportInterceptor: HttpInterceptorFn = (request, next) =>
  request.context.get(USE_XHR) ? inject(HttpXhrBackend).handle(request) : next(request);
