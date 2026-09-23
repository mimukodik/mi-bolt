import { startAdminMocks } from './browser.production';

describe('startAdminMocks (production stub)', () => {
  it('rejects with the production-build error', async () => {
    await expect(startAdminMocks()).rejects.toThrow(
      'The mock backend is not part of the production build.',
    );
  });
});
