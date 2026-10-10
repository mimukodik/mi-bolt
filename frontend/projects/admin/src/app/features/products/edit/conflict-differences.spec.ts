import { describe, expect, it } from 'vitest';
import { conflictDifferences } from './conflict-differences';

describe('conflict comparison', () => {
  it('shows each differing variant price even when the total is unchanged', () => {
    const local = { variants: [{ salePriceHuf: 10 }, { salePriceHuf: 20 }] };
    const server = { variants: [{ salePriceHuf: 20 }, { salePriceHuf: 10 }] };
    expect(conflictDifferences(local, server)).toEqual([
      { label: 'Változatok 1 Akciós ár', local: '10', server: '20' },
      { label: 'Változatok 2 Akciós ár', local: '20', server: '10' },
    ]);
  });
  it('compares added/removed values, booleans and unchanged records', () => {
    expect(
      conflictDifferences(
        { promotion: { enabled: false } },
        { promotion: { enabled: true, text: 'Új' } },
      ),
    ).toEqual([
      { label: 'Promóció Engedélyezés', local: 'Nem', server: 'Igen' },
      { label: 'Promóció Szöveg', local: 'Nincs megadva', server: 'Új' },
    ]);
    expect(conflictDifferences({ name: 'same' }, { name: 'same' })).toEqual([]);
    expect(conflictDifferences([1], undefined)).toEqual([
      { label: ' 1', local: '1', server: 'Nincs megadva' },
    ]);
  });
});
