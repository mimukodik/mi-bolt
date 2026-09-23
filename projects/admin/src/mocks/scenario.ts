export const SCENARIOS = [
  'default',
  'empty-catalog',
  'list-error',
  'save-conflict',
  'upload-error',
] as const;

export type ScenarioName = (typeof SCENARIOS)[number];

function isScenarioName(value: string | null): value is ScenarioName {
  return SCENARIOS.some((name) => name === value);
}

/** Reads `?mi-scenario=<name>` from a location search string; anything else is `default`. */
export function parseScenario(search: string): ScenarioName {
  const value = new URLSearchParams(search).get('mi-scenario');
  return isScenarioName(value) ? value : 'default';
}
