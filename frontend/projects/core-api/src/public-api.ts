/*
 * Public API surface of core-api: the API root the storefront, the admin and
 * the demo payment app all resolve their SDK against, plus the demo-session
 * interceptor the storefront and the demo payment app share. The admin keeps
 * its own If-Match interceptor and sends no X-Demo-Session header.
 */

export * from './api-root';
export * from './demo-session.interceptor';
