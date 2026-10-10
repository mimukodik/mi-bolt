import type { DestroyRef } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PriceRefresh } from './price-refresh';

afterEach(() => {
  vi.useRealTimers();
});

describe('server-relative price refresh', () => {
  it('refreshes at the server boundary despite a different browser clock and cancels superseded timers', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2040-01-01T00:00:00Z'));
    let destroy = (): void => undefined;
    const ref: DestroyRef = {
      destroyed: false,
      onDestroy(callback) {
        destroy = callback;
        return (): void => undefined;
      },
    };
    const refresh = vi.fn();
    const watcher = new PriceRefresh(ref, refresh);
    watcher.schedule('2026-10-30T11:59:58Z', '2026-10-30T12:00:00Z');
    vi.advanceTimersByTime(2000);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(refresh).toHaveBeenCalledTimes(1);
    watcher.schedule('2026-10-30T12:00:00Z', '2026-10-30T12:00:01Z');
    watcher.schedule('2026-10-30T12:00:00Z', '2026-10-30T12:00:03Z');
    vi.advanceTimersByTime(1050);
    expect(refresh).toHaveBeenCalledTimes(1);
    destroy();
    vi.advanceTimersByTime(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it('does not use invalid timestamps and refreshes when the browser returns', () => {
    let destroy = (): void => undefined;
    const ref: DestroyRef = {
      destroyed: false,
      onDestroy(callback) {
        destroy = callback;
        return (): void => undefined;
      },
    };
    const refresh = vi.fn();
    const watcher = new PriceRefresh(ref, refresh);
    watcher.schedule('invalid', 'invalid');
    window.dispatchEvent(new Event('pageshow'));
    expect(refresh).toHaveBeenCalledTimes(1);
    destroy();
    window.dispatchEvent(new Event('pageshow'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
