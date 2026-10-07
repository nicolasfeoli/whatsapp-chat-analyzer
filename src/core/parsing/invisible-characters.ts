/**
 * Clean-up of the characters a chat export contains that a reader cannot see:
 * direction marks, byte-order marks, non-breaking spaces and non-Latin digits.
 *
 * Invisible characters are written as `\u` escapes on purpose, so they stay
 * visible in the source and survive any editor.
 */

/**
 * U+200E, the left-to-right mark. iPhone exports put it in front of anything
 * that is not typed text: media placeholders, deleted-message tombstones,
 * system notices, attachments. Typed text never carries it, which makes it the
 * most reliable way to tell "image omitted" the placeholder from "image
 * omitted" the sentence.
 */
export const LEFT_TO_RIGHT_MARK = '\u200e';

/**
 * Every invisible formatting character an export may contain:
 *
 * - U+200E left-to-right mark and U+200F right-to-left mark,
 * - U+202A to U+202E, the directional embedding and override controls that
 *   wrap phone numbers and names in right-to-left locales,
 * - U+FEFF, the byte-order mark some exports start with.
 */
const INVISIBLE_CHARACTERS_PATTERN = /[\u200e\u200f\u202a-\u202e\ufeff]/g;

/**
 * The same set as {@link INVISIBLE_CHARACTERS_PATTERN} without the
 * left-to-right mark, for the one place that needs to see where the mark was.
 */
const INVISIBLE_CHARACTERS_EXCEPT_LEFT_TO_RIGHT_MARK_PATTERN = /[\u200f\u202a-\u202e\ufeff]/g;

/**
 * Spaces that look like a normal space but are not one: U+00A0 no-break space
 * and U+202F narrow no-break space. Recent iPhone and Android exports write
 * the latter between the time and "PM" (`1:29:57\u202fPM`).
 */
const NON_BREAKING_SPACES_PATTERN = /[\u00a0\u202f]/g;

/**
 * Decimal digits of the scripts WhatsApp localises timestamps into:
 * Arabic-Indic (U+0660 to U+0669), Extended Arabic-Indic as used in Persian
 * and Urdu (U+06F0 to U+06F9) and Devanagari (U+0966 to U+096F).
 */
const NON_LATIN_DIGITS_PATTERN = /[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f]/g;

/** Code point of the Arabic-Indic digit zero. */
const ARABIC_INDIC_ZERO_CODE_POINT = 0x660;

/** Code point of the Extended Arabic-Indic (Persian) digit zero. */
const EXTENDED_ARABIC_INDIC_ZERO_CODE_POINT = 0x6f0;

/** Code point of the Devanagari digit zero. */
const DEVANAGARI_ZERO_CODE_POINT = 0x966;

/**
 * Replaces the non-breaking spaces of an export with ordinary spaces.
 */
function replaceNonBreakingSpaces(text: string): string {
  return text.replace(NON_BREAKING_SPACES_PATTERN, ' ');
}

/**
 * Prepares one line of an export for matching: removes every invisible
 * formatting character, including the left-to-right mark, and turns
 * non-breaking spaces into ordinary ones.
 *
 * @param line - One line of the export, without its line break.
 * @returns The line as a reader would see it.
 */
export function removeInvisibleCharacters(line: string): string {
  const withoutInvisibleCharacters = line.replace(INVISIBLE_CHARACTERS_PATTERN, '');
  return replaceNonBreakingSpaces(withoutInvisibleCharacters);
}

/**
 * Like {@link removeInvisibleCharacters}, but leaves every left-to-right mark
 * in place so the caller can check whether one precedes the message body.
 *
 * @param line - One line of the export, without its line break.
 * @returns The line with only the left-to-right marks still present.
 */
export function removeInvisibleCharactersExceptLeftToRightMark(line: string): string {
  const withoutOtherInvisibleCharacters = line.replace(
    INVISIBLE_CHARACTERS_EXCEPT_LEFT_TO_RIGHT_MARK_PATTERN,
    '',
  );
  return replaceNonBreakingSpaces(withoutOtherInvisibleCharacters);
}

/**
 * Finds the code point of the zero of the script a non-Latin digit belongs to.
 * The three supported blocks are in ascending order, so two comparisons decide.
 */
function zeroCodePointOfScript(digitCodePoint: number): number {
  if (digitCodePoint < EXTENDED_ARABIC_INDIC_ZERO_CODE_POINT) {
    return ARABIC_INDIC_ZERO_CODE_POINT;
  }
  if (digitCodePoint < DEVANAGARI_ZERO_CODE_POINT) {
    return EXTENDED_ARABIC_INDIC_ZERO_CODE_POINT;
  }
  return DEVANAGARI_ZERO_CODE_POINT;
}

/**
 * Converts one Arabic-Indic, Persian or Devanagari digit to its ASCII digit.
 */
function convertDigitToAscii(nonLatinDigit: string): string {
  const digitCodePoint = nonLatinDigit.charCodeAt(0);
  const digitValue = digitCodePoint - zeroCodePointOfScript(digitCodePoint);
  return String(digitValue);
}

/**
 * Rewrites Arabic-Indic, Persian and Devanagari digits as `0` to `9`, so one
 * line pattern reads timestamps from every locale. Each digit is replaced by
 * exactly one character, so positions in the result match the input.
 *
 * @param text - Text that may contain non-Latin digits.
 * @returns The same text with only ASCII digits, and the same length.
 */
export function convertDigitsToAscii(text: string): string {
  return text.replace(NON_LATIN_DIGITS_PATTERN, convertDigitToAscii);
}
