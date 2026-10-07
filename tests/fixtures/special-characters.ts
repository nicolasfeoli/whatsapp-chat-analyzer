/**
 * The invisible and non-Latin characters a chat export contains, as named
 * constants. They are built from code points on purpose: a reader cannot see a
 * left-to-right mark typed into a string literal, and an editor may silently
 * drop it.
 */

/** U+200E. iPhone exports put it in front of anything that was not typed. */
export const LEFT_TO_RIGHT_MARK = String.fromCodePoint(0x200e);

/** U+200F. Appears in exports from right-to-left locales. */
export const RIGHT_TO_LEFT_MARK = String.fromCodePoint(0x200f);

/** U+202A. Opens the directional wrapping WhatsApp puts around phone numbers. */
export const LEFT_TO_RIGHT_EMBEDDING = String.fromCodePoint(0x202a);

/** U+202B. Opens a right-to-left wrapping. */
export const RIGHT_TO_LEFT_EMBEDDING = String.fromCodePoint(0x202b);

/** U+202C. Closes the directional wrapping around phone numbers. */
export const POP_DIRECTIONAL_FORMATTING = String.fromCodePoint(0x202c);

/** U+202D. Forces left-to-right display. */
export const LEFT_TO_RIGHT_OVERRIDE = String.fromCodePoint(0x202d);

/** U+202E. Forces right-to-left display. */
export const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e);

/** U+FEFF. Some exports start with this byte-order mark. */
export const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);

/** U+00A0. A space that does not break the line. */
export const NO_BREAK_SPACE = String.fromCodePoint(0x00a0);

/** U+202F. Recent exports write this narrow space between the time and AM or PM. */
export const NARROW_NO_BREAK_SPACE = String.fromCodePoint(0x202f);

/** U+060C. The comma Arabic exports write between the date and the time. */
export const ARABIC_COMMA = String.fromCodePoint(0x060c);

/** U+0635. The Arabic abbreviation for "before noon". */
export const ARABIC_BEFORE_NOON_MARKER = String.fromCodePoint(0x0635);

/** U+0645. The Arabic abbreviation for "after noon". */
export const ARABIC_AFTER_NOON_MARKER = String.fromCodePoint(0x0645);

/**
 * The groups of digits of an invented phone number, for the tests of senders
 * who are not in the exporter's contacts. The number lies in the range
 * 555-0100 to 555-0199, which North American numbering reserves for fiction,
 * so it cannot belong to anybody.
 */
export const INVENTED_PHONE_NUMBER_GROUPS: readonly string[] = ['+1', '202', '555', '0143'];

/** The invented phone number as a sender name, with ordinary spaces between its groups. */
export const INVENTED_PHONE_NUMBER_SENDER = INVENTED_PHONE_NUMBER_GROUPS.join(' ');

/** Code point of the Arabic-Indic digit zero (U+0660). */
const ARABIC_INDIC_ZERO_CODE_POINT = 0x0660;

/** Code point of the Extended Arabic-Indic digit zero used in Persian and Urdu (U+06F0). */
const PERSIAN_ZERO_CODE_POINT = 0x06f0;

/** Code point of the Devanagari digit zero (U+0966). */
const DEVANAGARI_ZERO_CODE_POINT = 0x0966;

/** Matches one ASCII digit. */
const ASCII_DIGIT_PATTERN = /[0-9]/g;

/**
 * Rewrites the ASCII digits of a text in another script, leaving everything
 * else alone, so a test can state a timestamp in readable digits.
 */
function writeDigitsInScript(text: string, zeroCodePointOfScript: number): string {
  return text.replace(ASCII_DIGIT_PATTERN, (asciiDigit) =>
    String.fromCodePoint(zeroCodePointOfScript + Number(asciiDigit)),
  );
}

/**
 * Rewrites the digits of a text as Arabic-Indic digits (U+0660 to U+0669).
 *
 * @param text - Text with ASCII digits, such as `31/12/2023`.
 * @returns The same text as an Arabic-language phone writes it.
 */
export function withArabicIndicDigits(text: string): string {
  return writeDigitsInScript(text, ARABIC_INDIC_ZERO_CODE_POINT);
}

/**
 * Rewrites the digits of a text as Persian digits (U+06F0 to U+06F9).
 *
 * @param text - Text with ASCII digits.
 * @returns The same text as a Persian-language phone writes it.
 */
export function withPersianDigits(text: string): string {
  return writeDigitsInScript(text, PERSIAN_ZERO_CODE_POINT);
}

/**
 * Rewrites the digits of a text as Devanagari digits (U+0966 to U+096F).
 *
 * @param text - Text with ASCII digits.
 * @returns The same text as a Hindi-language phone writes it.
 */
export function withDevanagariDigits(text: string): string {
  return writeDigitsInScript(text, DEVANAGARI_ZERO_CODE_POINT);
}
