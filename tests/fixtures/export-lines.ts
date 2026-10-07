/**
 * Builders for invented lines of a chat export, so each test states only the
 * part of the line it is about.
 *
 * Every line produced here is made up. Never add a real export to this folder.
 */

import { LEFT_TO_RIGHT_MARK } from './special-characters';

/** The parts of a message line; anything left out takes an unremarkable default. */
export interface ExportLineParts {
  /** The date exactly as the export writes it, e.g. `31/12/2023` or `12/31/23`. */
  readonly date?: string;
  /** The time exactly as the export writes it, e.g. `22:00:15` or `10:00 PM`. */
  readonly time?: string;
  /** The sender's name. */
  readonly sender?: string;
  /** The message body. */
  readonly text?: string;
}

/** The parts of a system notice line, which has no sender. */
export interface NoticeLineParts {
  /** The date exactly as the export writes it. */
  readonly date?: string;
  /** The time exactly as the export writes it. */
  readonly time?: string;
  /** The text of the notice. */
  readonly notice: string;
}

/** An unambiguous day-first date with a four-digit year, as iPhone writes it in most of the world. */
const DEFAULT_IPHONE_DATE = '31/12/2023';

/** A 24-hour time with seconds, which only iPhone exports record. */
const DEFAULT_IPHONE_TIME = '22:00:00';

/** An unambiguous day-first date with a two-digit year, as Android writes it in most of the world. */
const DEFAULT_ANDROID_DATE = '31/12/23';

/** A 24-hour time without seconds, which is all an Android export records. */
const DEFAULT_ANDROID_TIME = '22:00';

const DEFAULT_SENDER = 'Ana';
const DEFAULT_TEXT = 'hello';

/**
 * Writes a message the way an iPhone export does: `[date, time] Sender: text`.
 *
 * @param parts - The parts the test cares about.
 * @returns One line of an iPhone export.
 */
export function iphoneLine(parts: ExportLineParts = {}): string {
  const date = parts.date ?? DEFAULT_IPHONE_DATE;
  const time = parts.time ?? DEFAULT_IPHONE_TIME;
  const sender = parts.sender ?? DEFAULT_SENDER;
  const text = parts.text ?? DEFAULT_TEXT;
  return `[${date}, ${time}] ${sender}: ${text}`;
}

/**
 * Writes an iPhone line whose body was not typed (a media placeholder, a
 * deleted-message tombstone or a system notice): the body is preceded by the
 * left-to-right mark.
 *
 * @param parts - The parts the test cares about; `text` is the placeholder.
 * @returns One line of an iPhone export with the mark in front of the body.
 */
export function iphoneNotTypedLine(parts: ExportLineParts = {}): string {
  const text = parts.text ?? DEFAULT_TEXT;
  return iphoneLine({ ...parts, text: `${LEFT_TO_RIGHT_MARK}${text}` });
}

/**
 * Writes a message the way an Android export does: `date, time - Sender: text`.
 *
 * @param parts - The parts the test cares about.
 * @returns One line of an Android export.
 */
export function androidLine(parts: ExportLineParts = {}): string {
  const date = parts.date ?? DEFAULT_ANDROID_DATE;
  const time = parts.time ?? DEFAULT_ANDROID_TIME;
  const sender = parts.sender ?? DEFAULT_SENDER;
  const text = parts.text ?? DEFAULT_TEXT;
  return `${date}, ${time} - ${sender}: ${text}`;
}

/**
 * Writes an Android system notice, which has a timestamp but no sender:
 * `date, time - Bob added Carl`.
 *
 * @param parts - The notice and, optionally, its date and time.
 * @returns One line of an Android export.
 */
export function androidNoticeLine(parts: NoticeLineParts): string {
  const date = parts.date ?? DEFAULT_ANDROID_DATE;
  const time = parts.time ?? DEFAULT_ANDROID_TIME;
  return `${date}, ${time} - ${parts.notice}`;
}

/**
 * Writes an iPhone system notice without a sender: `[date, time] notice`.
 *
 * @param parts - The notice and, optionally, its date and time.
 * @returns One line of an iPhone export.
 */
export function iphoneNoticeLine(parts: NoticeLineParts): string {
  const date = parts.date ?? DEFAULT_IPHONE_DATE;
  const time = parts.time ?? DEFAULT_IPHONE_TIME;
  return `[${date}, ${time}] ${LEFT_TO_RIGHT_MARK}${parts.notice}`;
}

/**
 * Joins lines into the text of an export with Unix line breaks.
 *
 * @param lines - The lines of the file, in order.
 * @returns The text as `parseChat` receives it.
 */
export function exportText(lines: readonly string[]): string {
  return lines.join('\n');
}
