// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { BREADCRUMB_VISIBLE } from './breadcrumb-visibility';

/**
 * The case exists so switching the breadcrumb back on is a deliberate,
 * visible change: a test that fails on the new value carries the decision
 * through review and CI rather than letting it slip in unnoticed.
 */
describe('breadcrumb visibility constant', () => {
  it('MIM-234: the breadcrumb is switched off', () => {
    expect(BREADCRUMB_VISIBLE).toBe(false);
  });
});
