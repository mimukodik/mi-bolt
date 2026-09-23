/**
 * Type guards for the `EventTarget` carried by a DOM event handler. An
 * unchecked cast of `event.target` to a concrete element type is an
 * assertion the code never checks, and `EventTarget` is genuinely wider
 * than the element the handler expects — a handler can be invoked with a
 * target that is not that element. The two guards below narrow
 * `event.target` to the concrete element type the handler reads, so the
 * call site can use `.value` / `.checked` without an unchecked cast.
 *
 * `instanceof` is the check here rather than a duck-typed property test
 * because the handlers run against the real DOM in the browser and
 * against jsdom's DOM in the unit suite, and both provide the
 * constructors.
 */
export function isHTMLInputElement(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement;
}

export function isHTMLSelectElement(target: EventTarget | null): target is HTMLSelectElement {
  return target instanceof HTMLSelectElement;
}
