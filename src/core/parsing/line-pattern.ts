/**
 * The one pattern that recognises the start of an entry in every export layout.
 *
 * A chat export is not a documented format. WhatsApp writes it differently per
 * platform, per phone language and per region; the same instant can appear as:
 *
 * ```text
 * [8/31/26, 1:29:57 PM] Ana: hola          iPhone, en-US
 * 31/12/23, 22:00 - Ana: hola              Android, es
 * 31/12/23, 10:00 p. m. - Ana: hola        Android, es, 12-hour clock
 * [31.12.23, 22:00:15] Ana: hola           iPhone, de
 * 31/12/2023 22:00 - Ana: oi               Android, pt-BR (no comma)
 * ```
 */

import type { UninterpretedDate } from './date-order';
import { convertDigitsToAscii } from './invisible-characters';

/** Whether a 12-hour clock time is before or after noon. */
export type Meridiem = 'am' | 'pm';

/**
 * The hour, the minute and the am/pm marker of a timestamp as the export wrote
 * them. Seconds are kept apart, because whether a line has any is itself a
 * finding (iPhone records them, Android does not).
 */
export interface WrittenClockTime {
  /** The hour as written, on a 12-hour or 24-hour clock. */
  readonly hour: number;
  /** The minute of the hour, as written. */
  readonly minute: number;
  /** The am/pm marker of a 12-hour clock, or `null` on a 24-hour clock. */
  readonly meridiem: Meridiem | null;
}

/** The pieces of an entry's first line, before anyone decides what they mean. */
export interface MessageLineMatch extends UninterpretedDate, WrittenClockTime {
  /** The second, or `null` when the export only records minutes (Android). */
  readonly second: number | null;
  /** Everything after the timestamp: `Sender: text` for a message, free text for a system notice. */
  readonly content: string;
}

/** `ص` (U+0635), the Arabic abbreviation for "before noon". */
const ARABIC_BEFORE_NOON_MARKER = '\u0635';

/**
 * Matches the first line of an entry and captures its timestamp and content.
 *
 * Piece by piece:
 *
 * - `^\[?` — iPhone wraps the timestamp in square brackets, Android does not.
 * - `(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})` — three numbers separated by
 *   `/`, `.` or `-`. The first and last allow four digits because the year is
 *   first in year-first locales and last everywhere else.
 * - `[,\u060c]?\s+` — an optional comma (the Latin one or the Arabic comma
 *   U+060C) and the space before the time. Brazilian exports have no comma.
 * - `(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?` — hour, minute and, on iPhone,
 *   second, separated by `:` or by `.` as some European locales write it.
 * - `\s*(?:([ap])\.?\s?m\.?|([\u0635\u0645]))?` — an optional 12-hour marker:
 *   `AM`, `pm`, the Spanish `a. m.` and `p.m.`, or the Arabic `ص` (U+0635,
 *   before noon) and `م` (U+0645, after noon).
 * - `\s*(?:\]|\s-)\s*` — the end of the timestamp: the closing bracket on
 *   iPhone, a space and a dash on Android.
 * - `(.*)$` — the rest of the line.
 *
 * The pattern is case-insensitive for the am/pm marker. It must be applied to
 * a line whose invisible characters were removed and whose digits were
 * converted to ASCII, since `\d` only matches `0` to `9`.
 */
const MESSAGE_LINE_PATTERN =
  /^\[?(?<firstDateNumber>\d{1,4})[/.-](?<secondDateNumber>\d{1,2})[/.-](?<thirdDateNumber>\d{1,4})[,\u060c]?\s+(?<hour>\d{1,2})[:.](?<minute>\d{2})(?:[:.](?<second>\d{2}))?\s*(?:(?<latinMeridiem>[ap])\.?\s?m\.?|(?<arabicMeridiem>[\u0635\u0645]))?\s*(?:\]|\s-)\s*(?<content>.*)$/i;

/**
 * Works out the am/pm marker from whichever of the two meridiem groups matched.
 */
function readMeridiem(
  latinMeridiemLetter: string | undefined,
  arabicMeridiemLetter: string | undefined,
): Meridiem | null {
  if (latinMeridiemLetter !== undefined && latinMeridiemLetter !== '') {
    return latinMeridiemLetter.toLowerCase() === 'a' ? 'am' : 'pm';
  }
  if (arabicMeridiemLetter !== undefined && arabicMeridiemLetter !== '') {
    return arabicMeridiemLetter === ARABIC_BEFORE_NOON_MARKER ? 'am' : 'pm';
  }
  return null;
}

/**
 * Tries to read a line as the first line of an entry.
 *
 * @param cleanedLine - A line with invisible characters already removed (see
 *   `removeInvisibleCharacters`). Non-Latin digits are handled here.
 * @returns The timestamp pieces and the content, or `null` when the line does
 *   not start with a timestamp (it is then a continuation of the previous
 *   message, or not part of a chat at all).
 */
export function matchMessageLine(cleanedLine: string): MessageLineMatch | null {
  const lineWithAsciiDigits = convertDigitsToAscii(cleanedLine);
  const match = MESSAGE_LINE_PATTERN.exec(lineWithAsciiDigits);
  const groups = match?.groups;
  if (groups === undefined) {
    return null;
  }

  const contentWithAsciiDigits = groups['content'] ?? '';
  /*
   * The content is cut from the cleaned line rather than taken from the match,
   * so a message typed with Arabic or Devanagari digits keeps them. Digit
   * conversion never changes the length of the line, so the content occupies
   * the same final characters in both.
   */
  const contentStartIndex = cleanedLine.length - contentWithAsciiDigits.length;
  const content = cleanedLine.slice(contentStartIndex);

  const secondText = groups['second'];

  return {
    firstDateNumber: Number(groups['firstDateNumber']),
    secondDateNumber: Number(groups['secondDateNumber']),
    thirdDateNumber: Number(groups['thirdDateNumber']),
    hour: Number(groups['hour']),
    minute: Number(groups['minute']),
    second: secondText === undefined ? null : Number(secondText),
    meridiem: readMeridiem(groups['latinMeridiem'], groups['arabicMeridiem']),
    content,
  };
}
