import { describe, expect, it } from 'vitest';

import { describeThrownValue } from '../../src/core/errors';

const FALLBACK_MESSAGE = 'Something went wrong.';

describe('describeThrownValue', () => {
  it('returns the message of an error', () => {
    expect(describeThrownValue(new Error('Corrupted zip'), FALLBACK_MESSAGE)).toBe('Corrupted zip');
  });

  it('returns the message of an error of a more specific class', () => {
    const thrownValue = new RangeError('Invalid string length');

    expect(describeThrownValue(thrownValue, FALLBACK_MESSAGE)).toBe('Invalid string length');
  });

  it('returns the message of an error-like object that is not an Error', () => {
    /* What a rejection from another realm or a library looks like: a message, no Error prototype. */
    const thrownValue = { message: 'The file could not be read' };

    expect(describeThrownValue(thrownValue, FALLBACK_MESSAGE)).toBe('The file could not be read');
  });

  it.each([
    { description: 'an error with an empty message', thrownValue: new Error('') },
    { description: 'an object with an empty message', thrownValue: { message: '' } },
    { description: 'an object whose message is a number', thrownValue: { message: 404 } },
    { description: 'an object without a message', thrownValue: { code: 'ENOENT' } },
    { description: 'a string', thrownValue: 'out of memory' },
    { description: 'a number', thrownValue: 42 },
    { description: 'null', thrownValue: null },
    { description: 'undefined', thrownValue: undefined },
  ])('returns the fallback for $description', ({ thrownValue }) => {
    expect(describeThrownValue(thrownValue, FALLBACK_MESSAGE)).toBe(FALLBACK_MESSAGE);
  });
});
