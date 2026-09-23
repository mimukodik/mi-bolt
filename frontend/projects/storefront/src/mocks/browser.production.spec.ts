import { startMockWorker } from './browser.production';

describe('startMockWorker (production stub)', () => {
  it('rejects with the production-build error', async () => {
    await expect(startMockWorker()).rejects.toThrow(
      'The mock backend is not part of the production build.',
    );
  });
});
