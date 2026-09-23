import { MESSAGES } from './messages';

describe('MESSAGES', () => {
  it('writes the length limit into the max-length message', () => {
    // Fails if messages.ts changes the maxLength template or drops the number.
    expect(MESSAGES.maxLength(80)).toBe('Legfeljebb 80 karakter.');
  });
});
