import { describe, expect, it } from 'vitest';

import { NO_DOCKER_MESSAGE, smokeDockerProblem } from '../../scripts/smoke-docker-check.mjs';

describe('smokeDockerProblem', () => {
  it.each([
    [undefined, false, NO_DOCKER_MESSAGE],
    ['', false, NO_DOCKER_MESSAGE],
    [undefined, true, null],
    ['', true, null],
    ['http://localhost:4200', false, null],
    ['https://bolt.mimukodik.hu', true, null],
  ])('base URL %j, Docker answers %j gives %j', (baseUrl, docker, expected) => {
    expect(smokeDockerProblem(baseUrl, docker)).toBe(expected);
  });

  it('names the local backend and the mock suite', () => {
    expect(NO_DOCKER_MESSAGE).toBe(
      "e2e:smoke: no Docker answers here, and the smoke needs the local backend ('mise run backend'). Run the mock end-to-end suite with 'npm run e2e', or point E2E_BASE_URL at an app that is already serving.",
    );
  });
});
