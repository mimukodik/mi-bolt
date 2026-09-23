/**
 * Spec for `parseScenario` (projects/admin/src/mocks/scenario.ts).
 *
 * `?mi-scenario=<name>` round-trips for every name in `SCENARIOS`,
 * an unknown name falls back to `default`, and an empty search
 * falls back to `default`. Each case asserts the exact
 * `ScenarioName` value the parser is supposed to return; a fallback
 * that resolved to something other than `default` would silently
 * mask a bad query string and break the boot-time scenario switch.
 */
import { describe, expect, it } from 'vitest';

import { SCENARIOS, parseScenario } from './scenario';

describe('parseScenario', () => {
  it.each([
    ['default', '?mi-scenario=default'],
    ['empty-catalog', '?mi-scenario=empty-catalog'],
    ['list-error', '?mi-scenario=list-error'],
    ['save-conflict', '?mi-scenario=save-conflict'],
    ['upload-error', '?mi-scenario=upload-error'],
  ] as const)('returns %s for the matching query parameter', (name, search) => {
    expect(parseScenario(search)).toBe(name);
  });

  it('falls back to default for an unknown name', () => {
    expect(parseScenario('?mi-scenario=nope')).toBe('default');
  });

  it('falls back to default for an empty search', () => {
    expect(parseScenario('')).toBe('default');
  });

  it('exposes every scenario the boot list promises', () => {
    expect(SCENARIOS).toEqual([
      'default',
      'empty-catalog',
      'list-error',
      'save-conflict',
      'upload-error',
    ]);
  });
});
