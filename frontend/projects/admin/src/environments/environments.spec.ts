import { environment as production } from './environment';
import { environment as development } from './environment.development';
import { environment as localBackend } from './environment.local-backend';

/**
 * The pair of flags decides what a build ships: `demo` starts the mock worker
 * and `production` asks for the optimised bundle. The Angular CLI swaps these
 * files by configuration, so a wrong pair here is invisible everywhere else.
 */
describe('admin environments', () => {
  it('ships the optimised bundle without the demo mock by default', () => {
    expect(production.production).toBe(true);
    expect(production.demo).toBe(false);
  });

  it('starts the demo mock in the development configuration', () => {
    expect(development.production).toBe(false);
    expect(development.demo).toBe(true);
  });

  it('reaches the local backend without the demo mock', () => {
    expect(localBackend.production).toBe(false);
    expect(localBackend.demo).toBe(false);
  });
});
