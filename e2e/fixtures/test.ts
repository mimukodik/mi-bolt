/**
 * e2e/fixtures/test.ts — extended Playwright test for T02.
 *
 * Each scenario gets a fresh browser context with
 * `serviceWorkers: 'allow'` so the MSW worker can register, a
 * `ScenarioDescriptor` fixture carrying the deterministic
 * `fixedNow` / `seed` / `handlerOverrides` payload required by
 * the spec, and a `coverage` fixture that collects v8 coverage
 * for every page navigation. The companion `coverage.ts`
 * combines the page fixture with the segment flush policy from
 * the spec (T02-AC03) and the open-sockets assertion.
 */
import { test as base, type TestInfo } from '@playwright/test';

import { coverageFixture, type CoverageFixture } from './coverage';

export type ScenarioDescriptor = {
  readonly scenarioId: string;
  readonly fixedNow: string;
  readonly seed: number;
  readonly handlerOverrides: readonly string[];
};

type Fixtures = {
  scenario: ScenarioDescriptor;
  coverage: CoverageFixture;
};

export const test = base.extend<Fixtures>({
  scenario: async ({}, use, testInfo: TestInfo): Promise<void> => {
    const titlePath = testInfo.titlePath.join(' › ');
    const descriptor: ScenarioDescriptor = {
      scenarioId: testInfo.title.replace(/\s+/g, '-').toLowerCase(),
      fixedNow: '2026-09-14T12:00:00.000Z',
      seed: hashSeed(titlePath),
      handlerOverrides: [],
    };
    await use(descriptor);
  },

  coverage: coverageFixture,
});

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

export { expect } from '@playwright/test';