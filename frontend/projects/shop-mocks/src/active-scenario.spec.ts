/**
 * The active scenario the shop's tab remembers.
 *
 * `resolveActiveScenario` is what the storefront bootstrap calls: the URL's
 * `?mi-scenario=` wins and is written to `sessionStorage` under
 * `mi-bolt.scenario`, a query-less page load resumes the stored name, and
 * with neither the default runs. `readActiveScenarioName` is the reader side
 * the demo payment page uses; it never writes the key.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  ACTIVE_SCENARIO_KEY,
  DEFAULT_SCENARIO,
  browserSessionStorage,
  readActiveScenarioName,
  resolveActiveScenario,
  type ScenarioStorage,
} from './scenarios';

/** In-memory `sessionStorage` stand-in that records what was written. */
function memoryStorage(): { store: Map<string, string>; storage: ScenarioStorage } {
  const store = new Map<string, string>();
  return {
    store,
    storage: {
      getItem(key: string): string | null {
        return store.get(key) ?? null;
      },
      setItem(key: string, value: string): void {
        store.set(key, value);
      },
    },
  };
}

/** A storage whose every call is denied. */
function throwingStorage(): ScenarioStorage {
  return {
    getItem(): string | null {
      throw new Error('denied');
    },
    setItem(): void {
      throw new Error('denied');
    },
  };
}

/** Runs `run` with `globalThis.location.search` set to `search`, restoring it in `finally`. */
function withSearch(search: string, run: () => void): void {
  const original = (globalThis as { location?: Location }).location;
  (globalThis as { location?: unknown }).location = { search };
  try {
    run();
  } finally {
    if (original === undefined) {
      delete (globalThis as { location?: unknown }).location;
    } else {
      (globalThis as { location?: Location }).location = original;
    }
  }
}

afterEach(() => {
  sessionStorage.clear();
});

describe('active scenario', () => {
  it('AS-01: a URL scenario is remembered under the active-scenario key', () => {
    const { store, storage } = memoryStorage();
    withSearch('?mi-scenario=fail-order-read', () => {
      expect(resolveActiveScenario(storage).name).toBe('fail-order-read');
    });
    expect(store.get(ACTIVE_SCENARIO_KEY)).toBe('fail-order-read');
  });

  it('AS-02: a query-less load resumes the remembered scenario', () => {
    const { store, storage } = memoryStorage();
    store.set(ACTIVE_SCENARIO_KEY, 'fail-order-read');
    withSearch('', () => {
      expect(resolveActiveScenario(storage).name).toBe('fail-order-read');
    });
    expect(store.get(ACTIVE_SCENARIO_KEY)).toBe('fail-order-read');
  });

  it('AS-03: an explicit default in the URL switches the tab back', () => {
    const { store, storage } = memoryStorage();
    store.set(ACTIVE_SCENARIO_KEY, 'fail-order-read');
    withSearch('?mi-scenario=default', () => {
      expect(resolveActiveScenario(storage).name).toBe('default');
    });
    expect(store.get(ACTIVE_SCENARIO_KEY)).toBe('default');
  });

  it('AS-04: with no query and nothing stored the default runs and nothing is written', () => {
    const { store, storage } = memoryStorage();
    withSearch('', () => {
      expect(resolveActiveScenario(storage).name).toBe('default');
    });
    expect(store.has(ACTIVE_SCENARIO_KEY)).toBe(false);
  });

  it('AS-05: the URL scenario overwrites a different remembered name', () => {
    const { store, storage } = memoryStorage();
    store.set(ACTIVE_SCENARIO_KEY, 'lost-once-order');
    withSearch('?mi-scenario=payment-pending-resolves', () => {
      expect(resolveActiveScenario(storage).name).toBe('payment-pending-resolves');
    });
    expect(store.get(ACTIVE_SCENARIO_KEY)).toBe('payment-pending-resolves');
  });

  it('AS-06: an empty query value falls back to the remembered scenario', () => {
    const { store, storage } = memoryStorage();
    store.set(ACTIVE_SCENARIO_KEY, 'fail-order-read');
    withSearch('?mi-scenario=', () => {
      expect(resolveActiveScenario(storage).name).toBe('fail-order-read');
    });
  });

  it('AS-07: with no storage the URL is the only source', () => {
    withSearch('?mi-scenario=fail-order-read', () => {
      expect(resolveActiveScenario(undefined).name).toBe('fail-order-read');
    });
    withSearch('', () => {
      expect(resolveActiveScenario(undefined).name).toBe('default');
    });
  });

  it('AS-08: a denied storage does not throw and the URL stays the only source', () => {
    const storage = throwingStorage();
    withSearch('?mi-scenario=fail-order-read', () => {
      expect(() => resolveActiveScenario(storage)).not.toThrow();
      expect(resolveActiveScenario(storage).name).toBe('fail-order-read');
    });
    withSearch('', () => {
      expect(resolveActiveScenario(storage).name).toBe('default');
    });
  });

  it('AS-09: a retired remembered name is resumed on the default seed', () => {
    const { storage } = memoryStorage();
    storage?.setItem(ACTIVE_SCENARIO_KEY, 'retired-scenario');
    withSearch('', () => {
      const scenario = resolveActiveScenario(storage);
      expect(scenario.name).toBe('retired-scenario');
      expect(scenario.seed).toBe(DEFAULT_SCENARIO.seed);
    });
  });

  it('AS-10: readActiveScenarioName reads without writing and answers null where there is none', () => {
    const { store, storage } = memoryStorage();
    store.set(ACTIVE_SCENARIO_KEY, 'lost-once-order');
    expect(readActiveScenarioName(storage)).toBe('lost-once-order');
    const empty = memoryStorage();
    empty.store.set(ACTIVE_SCENARIO_KEY, '');
    expect(readActiveScenarioName(empty.storage)).toBeNull();
    expect(readActiveScenarioName(memoryStorage().storage)).toBeNull();
    expect(readActiveScenarioName(throwingStorage())).toBeNull();
    expect(readActiveScenarioName(undefined)).toBeNull();
    expect(store.size).toBe(1);
    expect(store.get(ACTIVE_SCENARIO_KEY)).toBe('lost-once-order');
  });

  it('AS-11: browserSessionStorage returns the page sessionStorage', () => {
    browserSessionStorage()?.setItem(ACTIVE_SCENARIO_KEY, 'x');
    expect(sessionStorage.getItem(ACTIVE_SCENARIO_KEY)).toBe('x');
  });
});
