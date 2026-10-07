import { describe, expect, it } from 'vitest';

import {
  ELLIPSIS,
  fitTextToWidth,
  wrapTextToLines,
} from '../../../src/ui/summary-card/text-fitting';
import { measureInInventedFont } from '../../fixtures/summary-image';

/** In the invented font of the tests, a character at this size is 10 pixels wide. */
const FONT = '400 20px sans-serif';

describe('fitTextToWidth', () => {
  it('leaves a text that fits as it is', () => {
    /* "Ana and Bob" has 11 characters: 110 pixels. */
    expect(fitTextToWidth('Ana and Bob', FONT, 110, measureInInventedFont)).toBe('Ana and Bob');
  });

  it('cuts a text that is one pixel too wide and marks the cut', () => {
    /* 109 pixels hold 10 characters: nine of the text and the ellipsis. */
    expect(fitTextToWidth('Ana and Bob', FONT, 109, measureInInventedFont)).toBe('Ana and B…');
  });

  it('leaves no space in front of the ellipsis', () => {
    /* 80 pixels hold "Ana and" and the ellipsis; "Ana and …" with its space would not be cut cleanly. */
    expect(fitTextToWidth('Ana and Bob', FONT, 80, measureInInventedFont)).toBe('Ana and…');
  });

  it('never cuts an emoji in half', () => {
    /* Each of the three emojis is two code units; 30 pixels hold two characters and the ellipsis. */
    expect(fitTextToWidth('🎉🎉🎉🎉', FONT, 30, measureInInventedFont)).toBe('🎉🎉…');
  });

  it('gives the ellipsis alone when not even one character fits beside it', () => {
    expect(fitTextToWidth('Ana and Bob', FONT, 5, measureInInventedFont)).toBe(ELLIPSIS);
  });
});

describe('wrapTextToLines', () => {
  it('keeps a text that fits on one line', () => {
    expect(wrapTextToLines('Ana and Bob', FONT, 110, 2, measureInInventedFont)).toEqual([
      'Ana and Bob',
    ]);
  });

  it('breaks at a space when the next word does not fit', () => {
    /* "Ana and Bob" needs 110 pixels; 100 hold "Ana and". */
    expect(wrapTextToLines('Ana and Bob', FONT, 100, 2, measureInInventedFont)).toEqual([
      'Ana and',
      'Bob',
    ]);
  });

  it('cuts the last line short when the text needs more lines than there are', () => {
    expect(
      wrapTextToLines('Ana and Bob and Carla and Dani', FONT, 100, 2, measureInInventedFont),
    ).toEqual(['Ana and', 'Bob and C…']);
  });

  it('cuts the only line short when there is room for one', () => {
    expect(wrapTextToLines('Ana and Bob', FONT, 100, 1, measureInInventedFont)).toEqual([
      'Ana and B…',
    ]);
  });

  it('cuts a single word that is wider than a line', () => {
    expect(
      wrapTextToLines('Ana Supercalifragilistic', FONT, 100, 3, measureInInventedFont),
    ).toEqual(['Ana', 'Supercali…']);
  });

  it('treats any run of white space as one space', () => {
    expect(wrapTextToLines('  Ana \n  and\tBob ', FONT, 200, 2, measureInInventedFont)).toEqual([
      'Ana and Bob',
    ]);
  });

  it('gives no line for a text without a word', () => {
    expect(wrapTextToLines('   ', FONT, 100, 2, measureInInventedFont)).toEqual([]);
  });
});
