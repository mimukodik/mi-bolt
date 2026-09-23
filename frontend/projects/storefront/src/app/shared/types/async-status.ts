/** `docs/spec/components.md:7` — the async lifecycle shared by every component
 *  that renders a loading / success / empty / error surface. */
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';
