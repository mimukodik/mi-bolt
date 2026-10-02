// Run before `npm run e2e:smoke`: the smoke drives the local backend, whose
// PostgreSQL runs in a container, so without Docker it stops here with what
// to use instead, before Playwright starts a dev server. A supplied
// E2E_BASE_URL targets an app that is already serving, so no Docker is needed
// then; an empty value counts as unset, as in playwright.config.ts.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const NO_DOCKER_MESSAGE =
  "e2e:smoke: no Docker answers here, and the smoke needs the local backend ('mise run backend'). Run the mock end-to-end suite with 'npm run e2e', or point E2E_BASE_URL at an app that is already serving.";

/** The message to stop with, or null when the smoke may run. */
export function smokeDockerProblem(baseUrl, dockerAnswers) {
  if (baseUrl) return null;
  return dockerAnswers ? null : NO_DOCKER_MESSAGE;
}

function dockerAnswers() {
  const result = spawnSync('docker', ['info'], { stdio: 'ignore' });
  return result.error === undefined && result.status === 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problem = smokeDockerProblem(process.env['E2E_BASE_URL'], dockerAnswers());
  if (problem !== null) {
    console.error(problem);
    process.exit(1);
  }
}
