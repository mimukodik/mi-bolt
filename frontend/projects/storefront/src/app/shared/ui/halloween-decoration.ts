import { Component, input } from '@angular/core';

@Component({
  selector: 'app-halloween-decoration',
  host: { 'aria-hidden': 'true', style: 'pointer-events:none;display:inline-flex;flex-shrink:0' },
  template: `
    <svg aria-hidden="true" focusable="false" height="100%" viewBox="0 0 100 100" width="100%">
      @switch (kind()) {
        @case ('spider') {
          <path
            d="M50 0V35M40 48L15 30 5 45M39 55L12 48 2 65M40 64L15 68 8 90M60 48L85 30 95 45M61 55L88 48 98 65M60 64L85 68 92 90"
            fill="none"
            stroke="#c084fc"
            stroke-linecap="round"
            stroke-width="5"
          />
          <ellipse cx="50" cy="61" fill="#7e22ce" rx="18" ry="24" />
          <circle cx="44" cy="50" fill="#ffad5c" r="3" />
          <circle cx="56" cy="50" fill="#ffad5c" r="3" />
        }
        @case ('bat') {
          <path
            d="M2 18Q24 20 40 42L43 28 50 35 57 28 60 42Q76 20 98 18L88 65Q74 48 64 69L50 84 36 69Q26 48 12 65Z"
            fill="#c084fc"
          />
          <circle cx="46" cy="48" fill="#ffad5c" r="2" />
          <circle cx="54" cy="48" fill="#ffad5c" r="2" />
        }
        @case ('moon') {
          <path d="M73 8A44 44 0 1 0 92 77A40 40 0 0 1 73 8Z" fill="#ffad5c" />
          <circle cx="30" cy="43" fill="#ed9243" r="7" />
          <circle cx="39" cy="76" fill="#ed9243" r="5" />
        }
        @case ('pumpkin') {
          <path d="M48 25Q48 12 60 8" fill="none" stroke="#c084fc" stroke-width="9" />
          <path
            d="M50 30C15 12 0 48 12 76Q24 98 50 90Q76 98 88 76C100 48 85 12 50 30Z"
            fill="#ffad5c"
          />
          <path
            d="M22 53L40 41 39 59ZM78 53L60 41 61 59ZM27 70L40 74 45 68 53 77 61 69 75 67Q61 94 27 70"
            fill="#2d124c"
          />
        }
      }
    </svg>
  `,
})
export class HalloweenDecoration {
  readonly kind = input.required<'spider' | 'bat' | 'moon' | 'pumpkin'>();
}
