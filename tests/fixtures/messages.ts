/**
 * Builders for invented messages and local moments, for the tests of the
 * analysis, which starts from messages rather than from the text of an export.
 */

import type { ChatMessage, DeletedMessage, MediaMessage, TextMessage } from '../../src/core/types';

/** The parts of a message; anything left out takes an unremarkable default. */
export interface MessageParts {
  /** The sender's name. */
  readonly sender?: string;
  /** When the message was sent, written as `YYYY-MM-DD HH:MM` or `YYYY-MM-DD HH:MM:SS` in local time. */
  readonly sentAt?: string;
  /** The message body. */
  readonly text?: string;
}

/**
 * A local date and time written as `YYYY-MM-DD HH:MM` with optional `:SS`.
 * The named groups are the six numbers.
 */
const LOCAL_TIME_PATTERN =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2}) (?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2}))?$/;

/** A Saturday morning with nothing special about it. */
const DEFAULT_SENT_AT = '2024-01-13 10:00';

const DEFAULT_SENDER = 'Ana';
const DEFAULT_TEXT = 'hello';

/**
 * Builds a moment in the local time zone from readable text, the way the
 * parser builds timestamps.
 *
 * @param localDateAndTime - `YYYY-MM-DD HH:MM` or `YYYY-MM-DD HH:MM:SS`.
 * @returns That moment in the time zone of the machine running the tests.
 * @throws Error when the text is not written in that form.
 */
export function localTime(localDateAndTime: string): Date {
  const groups = LOCAL_TIME_PATTERN.exec(localDateAndTime)?.groups;
  if (groups === undefined) {
    throw new Error(`Write the time as "YYYY-MM-DD HH:MM[:SS]", not "${localDateAndTime}"`);
  }
  return new Date(
    Number(groups['year']),
    Number(groups['month']) - 1,
    Number(groups['day']),
    Number(groups['hour']),
    Number(groups['minute']),
    Number(groups['second'] ?? '0'),
  );
}

/**
 * Builds midnight at the start of a local day.
 *
 * @param localDate - `YYYY-MM-DD`.
 * @returns 00:00:00 of that day in local time.
 */
export function localMidnight(localDate: string): Date {
  return localTime(`${localDate} 00:00`);
}

/**
 * Builds a typed message.
 *
 * @param parts - The parts the test cares about.
 * @returns A message of kind `text`.
 */
export function textMessage(parts: MessageParts = {}): TextMessage {
  return {
    kind: 'text',
    timestamp: localTime(parts.sentAt ?? DEFAULT_SENT_AT),
    sender: parts.sender ?? DEFAULT_SENDER,
    text: parts.text ?? DEFAULT_TEXT,
  };
}

/**
 * Builds a media placeholder message.
 *
 * @param parts - The parts the test cares about.
 * @returns A message of kind `media`.
 */
export function mediaMessage(parts: MessageParts = {}): MediaMessage {
  return {
    kind: 'media',
    timestamp: localTime(parts.sentAt ?? DEFAULT_SENT_AT),
    sender: parts.sender ?? DEFAULT_SENDER,
    text: parts.text ?? '<Media omitted>',
  };
}

/**
 * Builds a deleted-message tombstone.
 *
 * @param parts - The parts the test cares about.
 * @returns A message of kind `deleted`.
 */
export function deletedMessage(parts: MessageParts = {}): DeletedMessage {
  return {
    kind: 'deleted',
    timestamp: localTime(parts.sentAt ?? DEFAULT_SENT_AT),
    sender: parts.sender ?? DEFAULT_SENDER,
    text: parts.text ?? 'This message was deleted',
  };
}

/**
 * Lists the senders of some messages, in order, to state who is left after a
 * step in one readable assertion.
 *
 * @param messages - Any messages.
 * @returns The sender of each message.
 */
export function sendersOf(messages: readonly ChatMessage[]): string[] {
  return messages.map((message) => message.sender);
}

/**
 * Lists the texts of some messages, in order.
 *
 * @param messages - Any messages.
 * @returns The text of each message.
 */
export function textsOf(messages: readonly ChatMessage[]): string[] {
  return messages.map((message) => message.text);
}
