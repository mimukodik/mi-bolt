import { promotionMotion } from './promotion-motion';

describe('promotion entrance and bat swarm lifetime', () => {
  const cancelAnimations: ReturnType<typeof vi.fn>[] = [];
  const animate = vi.fn(() => {
    const cancel = vi.fn();
    cancelAnimations.push(cancel);
    return { cancel };
  });
  const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  let bar: HTMLAnchorElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    cancelAnimations.length = 0;
    animate.mockClear();
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: animate,
    });
    bar = document.createElement('a');
    document.body.appendChild(bar);
  });

  afterEach(() => {
    bar.remove();
    document.querySelectorAll('.sm-batlayer').forEach((layer) => {
      layer.remove();
    });
    if (originalAnimate === undefined) Reflect.deleteProperty(Element.prototype, 'animate');
    else Object.defineProperty(Element.prototype, 'animate', originalAnimate);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('delays the swarm until the entrance completes and removes all 18 bats by its maximum lifetime', () => {
    const stop = promotionMotion(bar);
    expect(animate).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ delay: 640, duration: 620 }),
    );
    vi.advanceTimersByTime(1649);
    expect(document.querySelector('.sm-batlayer')).toBeNull();
    vi.advanceTimersByTime(1);
    const layer = document.querySelector('.sm-batlayer');
    expect(layer?.getAttribute('aria-hidden')).toBe('true');
    expect(layer?.parentElement).toBe(bar);
    expect(layer instanceof HTMLElement && layer.style.overflow).toBe('hidden');
    expect(layer?.querySelectorAll('.sm-batfx')).toHaveLength(18);
    expect(layer?.querySelectorAll('svg.sm-bat')).toHaveLength(18);
    vi.advanceTimersByTime(950);
    expect(cancelAnimations[0]).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(4925);
    expect(document.querySelector('.sm-batlayer')).toBeNull();
    stop();
    expect(cancelAnimations.every((cancel) => cancel.mock.calls.length > 0)).toBe(true);
  });

  it('cancels pending entrance and swarm work when destroyed before spawning', () => {
    const stop = promotionMotion(bar);
    vi.advanceTimersByTime(1000);
    stop();
    vi.advanceTimersByTime(10_000);
    expect(cancelAnimations).toHaveLength(1);
    expect(cancelAnimations[0]).toHaveBeenCalledOnce();
    expect(document.querySelector('.sm-batlayer')).toBeNull();
  });

  it('immediately removes an existing swarm and cancels every animation on destruction', () => {
    const stop = promotionMotion(bar);
    vi.advanceTimersByTime(1650);
    expect(cancelAnimations).toHaveLength(20);
    expect(document.querySelectorAll('.sm-batfx')).toHaveLength(18);
    stop();
    expect(document.querySelector('.sm-batlayer')).toBeNull();
    expect(cancelAnimations.every((cancel) => cancel.mock.calls.length === 1)).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(cancelAnimations.every((cancel) => cancel.mock.calls.length === 1)).toBe(true);
  });
});
