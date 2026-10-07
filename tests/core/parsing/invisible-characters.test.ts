import { describe, expect, it } from 'vitest';

import {
  LEFT_TO_RIGHT_MARK as CORE_LEFT_TO_RIGHT_MARK,
  convertDigitsToAscii,
  removeInvisibleCharacters,
  removeInvisibleCharactersExceptLeftToRightMark,
} from '../../../src/core/parsing/invisible-characters';
import {
  BYTE_ORDER_MARK,
  INVENTED_PHONE_NUMBER_GROUPS,
  INVENTED_PHONE_NUMBER_SENDER,
  LEFT_TO_RIGHT_EMBEDDING,
  LEFT_TO_RIGHT_MARK,
  LEFT_TO_RIGHT_OVERRIDE,
  NARROW_NO_BREAK_SPACE,
  NO_BREAK_SPACE,
  POP_DIRECTIONAL_FORMATTING,
  RIGHT_TO_LEFT_EMBEDDING,
  RIGHT_TO_LEFT_MARK,
  RIGHT_TO_LEFT_OVERRIDE,
  withArabicIndicDigits,
  withDevanagariDigits,
  withPersianDigits,
} from '../../fixtures/special-characters';

/** Every invisible formatting character other than the left-to-right mark. */
const OTHER_INVISIBLE_CHARACTERS = [
  { name: 'the right-to-left mark (U+200F)', character: RIGHT_TO_LEFT_MARK },
  { name: 'the left-to-right embedding (U+202A)', character: LEFT_TO_RIGHT_EMBEDDING },
  { name: 'the right-to-left embedding (U+202B)', character: RIGHT_TO_LEFT_EMBEDDING },
  { name: 'the pop directional formatting (U+202C)', character: POP_DIRECTIONAL_FORMATTING },
  { name: 'the left-to-right override (U+202D)', character: LEFT_TO_RIGHT_OVERRIDE },
  { name: 'the right-to-left override (U+202E)', character: RIGHT_TO_LEFT_OVERRIDE },
  { name: 'the byte-order mark (U+FEFF)', character: BYTE_ORDER_MARK },
];

const NON_BREAKING_SPACES = [
  { name: 'the no-break space (U+00A0)', character: NO_BREAK_SPACE },
  { name: 'the narrow no-break space (U+202F)', character: NARROW_NO_BREAK_SPACE },
];

describe('LEFT_TO_RIGHT_MARK', () => {
  it('is the single character U+200E', () => {
    expect(CORE_LEFT_TO_RIGHT_MARK).toBe(String.fromCodePoint(0x200e));
  });
});

describe('removeInvisibleCharacters', () => {
  it('removes the left-to-right mark', () => {
    const line = `Bob: ${LEFT_TO_RIGHT_MARK}image omitted`;

    expect(removeInvisibleCharacters(line)).toBe('Bob: image omitted');
  });

  it.each(OTHER_INVISIBLE_CHARACTERS)('removes $name', ({ character }) => {
    const line = `Ana${character}: hello`;

    expect(removeInvisibleCharacters(line)).toBe('Ana: hello');
  });

  it.each(NON_BREAKING_SPACES)('turns $name into an ordinary space', ({ character }) => {
    const line = `1:29:57${character}PM`;

    expect(removeInvisibleCharacters(line)).toBe('1:29:57 PM');
  });

  it('removes every occurrence, not only the first', () => {
    const line = `${LEFT_TO_RIGHT_MARK}[date] Bob: ${LEFT_TO_RIGHT_MARK}sticker omitted`;

    expect(removeInvisibleCharacters(line)).toBe('[date] Bob: sticker omitted');
  });

  it('unwraps a phone number wrapped in directional formatting', () => {
    const numberWithNoBreakSpaces = INVENTED_PHONE_NUMBER_GROUPS.join(NO_BREAK_SPACE);
    const line = `${LEFT_TO_RIGHT_EMBEDDING}${numberWithNoBreakSpaces}${POP_DIRECTIONAL_FORMATTING}: hello`;

    expect(removeInvisibleCharacters(line)).toBe(`${INVENTED_PHONE_NUMBER_SENDER}: hello`);
  });

  it('leaves a line without invisible characters unchanged', () => {
    expect(removeInvisibleCharacters('Ana: ¿cómo estás? 100%')).toBe('Ana: ¿cómo estás? 100%');
  });

  it('returns an empty string for a line made only of invisible characters', () => {
    expect(removeInvisibleCharacters(`${BYTE_ORDER_MARK}${LEFT_TO_RIGHT_MARK}`)).toBe('');
  });
});

describe('removeInvisibleCharactersExceptLeftToRightMark', () => {
  it('keeps the left-to-right mark where it was', () => {
    const line = `Bob: ${LEFT_TO_RIGHT_MARK}image omitted`;

    expect(removeInvisibleCharactersExceptLeftToRightMark(line)).toBe(line);
  });

  it.each(OTHER_INVISIBLE_CHARACTERS)('removes $name', ({ character }) => {
    const line = `Ana${character}: ${LEFT_TO_RIGHT_MARK}hello`;

    expect(removeInvisibleCharactersExceptLeftToRightMark(line)).toBe(
      `Ana: ${LEFT_TO_RIGHT_MARK}hello`,
    );
  });

  it.each(NON_BREAKING_SPACES)('turns $name into an ordinary space', ({ character }) => {
    const line = `Ana:${character}${LEFT_TO_RIGHT_MARK}hello`;

    expect(removeInvisibleCharactersExceptLeftToRightMark(line)).toBe(
      `Ana: ${LEFT_TO_RIGHT_MARK}hello`,
    );
  });
});

describe('convertDigitsToAscii', () => {
  it.each([
    { script: 'Arabic-Indic', text: withArabicIndicDigits('0123456789') },
    { script: 'Persian', text: withPersianDigits('0123456789') },
    { script: 'Devanagari', text: withDevanagariDigits('0123456789') },
  ])('converts every $script digit to its ASCII digit', ({ text }) => {
    expect(convertDigitsToAscii(text)).toBe('0123456789');
  });

  it('converts the digits of a whole timestamp and leaves its punctuation alone', () => {
    const timestamp = withArabicIndicDigits('31/12/2023, 10:05');

    expect(convertDigitsToAscii(timestamp)).toBe('31/12/2023, 10:05');
  });

  it('converts digits of different scripts in the same text', () => {
    const text = `${withArabicIndicDigits('12')}-${withPersianDigits('34')}-${withDevanagariDigits('56')}`;

    expect(convertDigitsToAscii(text)).toBe('12-34-56');
  });

  it('leaves ASCII digits and letters unchanged', () => {
    expect(convertDigitsToAscii('Ana: 12 años')).toBe('Ana: 12 años');
  });

  it('keeps the length of the text, one character per digit', () => {
    const text = withDevanagariDigits('31/12/2023, 22:06 - Ana: 7');

    expect(convertDigitsToAscii(text)).toHaveLength(text.length);
  });
});
