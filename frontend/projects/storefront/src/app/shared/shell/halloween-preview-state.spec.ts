import { TestBed } from '@angular/core/testing';
import { HalloweenPreviewState } from './halloween-preview-state';

describe('Halloween design preview across normal routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.removeItem('mi-bolt.halloween-preview');
    TestBed.resetTestingModule();
  });

  it('is opt-in and survives a new app instance until explicitly closed', () => {
    const preview = TestBed.inject(HalloweenPreviewState);
    expect(preview.enabled()).toBe(false);
    preview.setEnabled(true);
    TestBed.resetTestingModule();
    const restored = TestBed.inject(HalloweenPreviewState);
    expect(restored.enabled()).toBe(true);
    restored.setEnabled(false);
    TestBed.resetTestingModule();
    expect(TestBed.inject(HalloweenPreviewState).enabled()).toBe(false);
  });

  it('keeps navigation usable when session storage is denied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage denied');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Storage denied');
    });
    const preview = TestBed.inject(HalloweenPreviewState);
    expect(preview.enabled()).toBe(false);
    preview.setEnabled(true);
    expect(preview.enabled()).toBe(true);
    preview.setEnabled(false);
    expect(preview.enabled()).toBe(false);
  });
});
