import { describe, expect, it } from 'vitest';

import { ratioWhenAtLeast, selectMostFrequent, sumOf } from '../../src/ui/ranking';

describe('selectMostFrequent', () => {
  it('orders entries by count, highest first', () => {
    const counts = new Map([
      ['pizza', 2],
      ['beach', 9],
      ['train', 5],
    ]);

    expect(selectMostFrequent(counts, 3)).toEqual([
      { key: 'beach', count: 9 },
      { key: 'train', count: 5 },
      { key: 'pizza', count: 2 },
    ]);
  });

  it('keeps entries with equal counts in the order they were first seen', () => {
    const counts = new Map([
      ['first', 3],
      ['second', 3],
      ['third', 3],
    ]);

    const keys = selectMostFrequent(counts, 3).map((entry) => entry.key);

    expect(keys).toEqual(['first', 'second', 'third']);
  });

  it('returns no more entries than the limit', () => {
    const counts = new Map([
      ['pizza', 2],
      ['beach', 9],
      ['train', 5],
    ]);

    expect(selectMostFrequent(counts, 2)).toEqual([
      { key: 'beach', count: 9 },
      { key: 'train', count: 5 },
    ]);
  });

  it('returns every entry when the limit exceeds their number', () => {
    expect(selectMostFrequent(new Map([['pizza', 2]]), 10)).toEqual([{ key: 'pizza', count: 2 }]);
  });

  it('returns nothing for an empty table', () => {
    expect(selectMostFrequent(new Map<string, number>(), 5)).toEqual([]);
  });

  it('does not reorder the table it was given', () => {
    const counts = new Map([
      ['pizza', 2],
      ['beach', 9],
    ]);

    selectMostFrequent(counts, 2);

    expect([...counts.keys()]).toEqual(['pizza', 'beach']);
  });
});

describe('sumOf', () => {
  it('adds up the numbers of a list', () => {
    expect(sumOf([1, 2, 3.5])).toBe(6.5);
  });

  it('adds up the values of a map', () => {
    const counts = new Map([
      ['pizza', 2],
      ['beach', 9],
    ]);

    expect(sumOf(counts.values())).toBe(11);
  });

  it('returns zero for an empty list', () => {
    expect(sumOf([])).toBe(0);
  });
});

describe('ratioWhenAtLeast', () => {
  it('divides when the denominator is above the minimum', () => {
    expect(ratioWhenAtLeast(5, 20, 10)).toBe(0.25);
  });

  it('divides when the denominator is exactly the minimum', () => {
    expect(ratioWhenAtLeast(5, 10, 10)).toBe(0.5);
  });

  it('returns null when the denominator is one short of the minimum', () => {
    expect(ratioWhenAtLeast(5, 9, 10)).toBeNull();
  });

  it('returns zero, not null, for a numerator of zero', () => {
    expect(ratioWhenAtLeast(0, 10, 10)).toBe(0);
  });
});
