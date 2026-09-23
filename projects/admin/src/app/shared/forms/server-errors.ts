import { isFieldTree } from '@angular/forms/signals';
import type { FieldTree, ValidationError } from '@angular/forms/signals';

import { SERVER_FIELD_FALLBACK, SERVER_FIELD_MESSAGES } from './messages';

/**
 * One field-level error of the admin API's 422 answer. Structurally the
 * generated `FieldError` of the admin SDK that F4 adds; kept local so this
 * primitive carries no dependency on the generated client.
 */
export interface WireFieldError {
  /** JSON pointer into the request body, e.g. `/variants/1/priceHuf`. */
  readonly path: string;
  /** Machine code, keyed into `SERVER_FIELD_MESSAGES`. */
  readonly code: string;
  /** Values a message template may interpolate, e.g. `{ max: 80 }`. */
  readonly params?: Readonly<Record<string, unknown>>;
}

/** A `{name}` placeholder inside a message template. */
const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Reads a child field off a field tree. A field tree is a callable proxy whose
 * property access resolves a child field by key (an array item included, by its
 * index as the key); `Reflect.get` performs that property access without a type
 * assertion.
 */
function childOf(field: FieldTree<unknown>, segment: string): FieldTree<unknown> | undefined {
  const child: unknown = Reflect.get(field, segment);
  return isFieldTree(child) ? child : undefined;
}

/** Walks `pointer` from `root`, or `undefined` where a segment does not resolve. */
function resolve(root: FieldTree<unknown>, pointer: string): FieldTree<unknown> | undefined {
  let current = root;
  for (const segment of pointer.split('/').filter((part) => part !== '')) {
    const next = childOf(current, segment);
    if (next === undefined) {
      return undefined;
    }
    current = next;
  }
  return current;
}

/** The Hungarian message for a wire code, with its placeholders filled in. */
function messageFor(error: WireFieldError): string {
  const template = SERVER_FIELD_MESSAGES[error.code] ?? SERVER_FIELD_FALLBACK;
  const params = error.params;
  if (params === undefined) {
    return template;
  }
  return template.replace(PLACEHOLDER, (placeholder, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder,
  );
}

/**
 * Maps the 422 field errors of the admin API onto the field trees they name,
 * ready to be returned from a Signal Forms submit action (R7). An error whose
 * pointer does not resolve attaches to `root`, so a renamed field shows its
 * error on the form rather than nowhere.
 */
export function toServerErrors(
  root: FieldTree<unknown>,
  errors: readonly WireFieldError[],
): ValidationError.WithFieldTree[] {
  return errors.map((error) => {
    const field = resolve(root, error.path) ?? root;
    return { kind: 'server', message: messageFor(error), fieldTree: field };
  });
}
