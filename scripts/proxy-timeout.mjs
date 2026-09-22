/** Largest delay Node's timers accept: 2^31 - 1 ms. A longer delay is
 *  truncated to 1 ms with a TimeoutOverflowWarning. */
export const MAX_TIMER_MS = 2147483647;

/** Milliseconds the proxy waits when the env value is missing or unusable. */
export const DEFAULT_PROXY_TIMEOUT_MS = 30000;

/**
 * Read `MI_BOLT_API_PROXY_TIMEOUT_MS`. A finite number above 0 and at most
 * `MAX_TIMER_MS` is used as given; anything else falls back to
 * `DEFAULT_PROXY_TIMEOUT_MS`.
 *
 * @param {string | undefined} raw the environment value
 * @returns {number} the timeout in milliseconds
 */
export function parseProxyTimeout(raw) {
  const parsed = Number(raw ?? String(DEFAULT_PROXY_TIMEOUT_MS));
  return Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_TIMER_MS
    ? parsed
    : DEFAULT_PROXY_TIMEOUT_MS;
}
