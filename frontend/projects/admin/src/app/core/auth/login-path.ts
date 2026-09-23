/** The absolute path to the login route (`app.routes.ts`'s `bejelentkezes`). */
export const LOGIN_PATH = '/bejelentkezes';

/**
 * Whether `url` is the login route itself (its own query string or a child
 * path included), rather than a route that merely shares its prefix.
 */
export function isLoginPath(url: string): boolean {
  return url === LOGIN_PATH || url.startsWith(`${LOGIN_PATH}?`) || url.startsWith(`${LOGIN_PATH}/`);
}
