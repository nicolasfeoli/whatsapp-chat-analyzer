import { describe, expect, it } from 'vitest';

import { isRecord } from '../../src/core/type-guards';

describe('isRecord', () => {
  it.each([
    { description: 'a plain object', value: { name: 'Ana' } },
    { description: 'an empty object', value: {} },
    { description: 'an array', value: ['Ana'] },
    { description: 'an error', value: new Error('boom') },
    { description: 'a date', value: new Date(2024, 0, 13) },
  ])('accepts $description', ({ value }) => {
    expect(isRecord(value)).toBe(true);
  });

  it.each([
    { description: 'null, although its type is "object"', value: null },
    { description: 'undefined', value: undefined },
    { description: 'a string', value: 'Ana' },
    { description: 'a number', value: 7 },
    { description: 'a boolean', value: true },
    { description: 'a function', value: (): void => undefined },
  ])('refuses $description', ({ value }) => {
    expect(isRecord(value)).toBe(false);
  });
});
