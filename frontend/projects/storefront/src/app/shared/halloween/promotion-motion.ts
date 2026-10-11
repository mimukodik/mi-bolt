/** One mounted promotion plays once; cleanup also handles preference changes. */
export function promotionMotion(bar: HTMLElement): () => void {
  const timers: number[] = [];
  const animations: Animation[] = [];
  let layer: HTMLDivElement | undefined;
  const later = (callback: () => void, delay: number): void => {
    timers.push(window.setTimeout(callback, delay));
  };
  animations.push(
    bar.animate(
      [
        { opacity: 0, transform: 'translateY(18px) scale(.97)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 620, delay: 640, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' },
    ),
  );
  later(() => {
    animations.push(
      bar.animate([{ boxShadow: '0 0 0 0 #8b5cf699' }, { boxShadow: '0 0 0 16px #8b5cf600' }], {
        duration: 900,
        easing: 'ease-out',
      }),
    );
    const r = bar.getBoundingClientRect(),
      width = window.innerWidth;
    layer = document.createElement('div');
    layer.className = 'halloween sm--motion sm-batlayer';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;overflow:hidden;pointer-events:none;z-index:0;background:transparent';
    bar.prepend(layer);
    let end = 0;
    for (let i = 0; i < 18; i++) {
      const el = document.createElement('div');
      el.className = 'sm-batfx';
      el.innerHTML =
        '<svg class="sm-bat " viewBox="0 0 40 20" aria-hidden="true" focusable="false"><g class="sm-bat__wing"><path d="M22.6 7.4C25.4 4.2 31 2.6 39 3.6C37.4 4.8 36.8 6.4 37.2 8.2C35.8 7.2 34.2 7.2 33 8.4C32.4 7 31 6.4 29.6 6.8C28.4 7.6 27.8 9 27.6 10.6C26.4 9.6 25 9.6 24 10.8Z"/></g><g transform="translate(40 0) scale(-1 1)"><g class="sm-bat__wing"><path d="M22.6 7.4C25.4 4.2 31 2.6 39 3.6C37.4 4.8 36.8 6.4 37.2 8.2C35.8 7.2 34.2 7.2 33 8.4C32.4 7 31 6.4 29.6 6.8C28.4 7.6 27.8 9 27.6 10.6C26.4 9.6 25 9.6 24 10.8Z"/></g></g><path d="M17.4 2L19.3 4.6H20.7L22.6 2C23.2 3.8 23.2 5.4 22.6 6.6C23.6 7.4 24 8.6 24 9.8C24 12.4 22.4 14.6 20 16.6C17.6 14.6 16 12.4 16 9.8C16 8.6 16.4 7.4 17.4 6.6C16.8 5.4 16.8 3.8 17.4 2Z"/><circle class="sm-bat__eye" cx="18.9" cy="7.6" r=".8"/><circle class="sm-bat__eye" cx="21.1" cy="7.6" r=".8"/></svg>';
      const size = 32 + Math.random() * 30;
      el.style.width = `${size.toString()}px`;
      el.style.height = `${(size / 2).toString()}px`;
      el.style.opacity = '0';
      layer.appendChild(el);
      const sx = r.width * (0.12 + Math.random() * 0.76) - size / 2,
        sy = r.height * (0.2 + Math.random() * 0.5);
      const ex = sx + (Math.random() - 0.5) * width * 0.95,
        ey = -90 - Math.random() * 80,
        phase = Math.random() * 6.28,
        amplitude = 28 + Math.random() * 46,
        flip = Math.random() < 0.5 ? -1 : 1;
      const frames = [0, 0.14, 0.3, 0.5, 0.72, 1].map((t) => ({
        transform: `translate(${(sx + (ex - sx) * t + Math.sin(t * 9 + phase) * amplitude).toFixed(1)}px, ${(sy + (ey - sy) * Math.pow(t, 0.85) + Math.cos(t * 11 + phase) * amplitude * 0.45).toFixed(1)}px) scaleX(${((Math.sin(t * 9 + phase) > 0 ? 1 : -1) * flip * (1 + t * 0.5)).toString()}) scaleY(${(1 + t * 0.5).toString()})`,
        opacity: t === 0 ? 0 : t > 0.88 ? 0 : 1,
        offset: t,
      }));
      const duration = 2300 + Math.random() * 1500,
        delay = i * 75 + Math.random() * 200;
      animations.push(el.animate(frames, { duration, delay, easing: 'ease-in', fill: 'both' }));
      end = Math.max(end, duration + delay);
    }
    later(() => {
      layer?.remove();
    }, end + 600);
  }, 1650);
  later(() => {
    animations[0]?.cancel();
  }, 2600);
  return (): void => {
    timers.forEach((timer) => {
      window.clearTimeout(timer);
    });
    animations.forEach((animation) => {
      animation.cancel();
    });
    layer?.remove();
  };
}
