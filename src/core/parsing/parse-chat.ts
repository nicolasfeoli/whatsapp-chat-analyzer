/**
 * Reads the text of a WhatsApp chat export into messages.
 *
 * The work is done in four steps, each in its own module:
 *
 * 1. `export-entries` splits the text into entries and drops system notices,
 *    keeping those about the group (read by `group-notices`) on the side.
 * 2. `date-order` decides how to read the dates, from the file as a whole.
 * 3. `date-construction` builds a timestamp for every entry and rejects
 *    impossible ones.
 * 4. `pasted-lines` folds lines pasted from another chat into the message
 *    quoting them.
 */

import type {
  AmbiguousDateOrder,
  ChatMessage,
  DateOrder,
  GroupEvent,
  ParsedChat,
  ParseReport,
  TimestampResolution,
} from '../types';
import { buildTimestamp } from './date-construction';
import { detectDateOrder } from './date-order';
import { readExportEntries } from './export-entries';
import type { ExportEntriesReading, ExportEntry, ExportGroupNotice } from './export-entries';
import { removeEditedMessageSuffix } from './message-classification';
import { foldPastedLines } from './pasted-lines';

/** The messages with readable dates, and how many entries had none. */
interface DatedMessages {
  readonly messages: readonly ChatMessage[];
  readonly unreadableDateCount: number;
}

/**
 * Builds the final message for an entry whose timestamp is known. The note of
 * an edited message is taken out of the text and kept as a flag instead.
 */
function createMessage(entry: ExportEntry, timestamp: Date): ChatMessage {
  const messageBase = {
    timestamp,
    sender: entry.sender,
    text: removeEditedMessageSuffix(entry.text),
    isEdited: entry.isEdited,
  };
  if (entry.kind === 'media') {
    return { ...messageBase, kind: 'media', caption: entry.caption };
  }
  return { ...messageBase, kind: entry.kind };
}

/**
 * Gives every entry its timestamp, leaving out the entries whose date or time
 * is impossible under the chosen date order.
 */
function buildDatedMessages(entries: readonly ExportEntry[], dateOrder: DateOrder): DatedMessages {
  const messages: ChatMessage[] = [];
  let unreadableDateCount = 0;

  for (const entry of entries) {
    const timestamp = buildTimestamp(entry, dateOrder);
    if (timestamp === null) {
      unreadableDateCount += 1;
      continue;
    }
    messages.push(createMessage(entry, timestamp));
  }

  return { messages, unreadableDateCount };
}

/**
 * Gives every group notice its timestamp, under the date order chosen from the
 * messages. A notice whose date or time is impossible is left out; it remains
 * counted as a system notice.
 */
function buildGroupEvents(
  groupNotices: readonly ExportGroupNotice[],
  dateOrder: DateOrder,
): GroupEvent[] {
  const groupEvents: GroupEvent[] = [];
  for (const groupNotice of groupNotices) {
    const timestamp = buildTimestamp(groupNotice, dateOrder);
    if (timestamp !== null) {
      groupEvents.push({ timestamp, change: groupNotice.change });
    }
  }
  return groupEvents;
}

/**
 * Assembles the parse report from the counts of each step.
 */
function createParseReport(
  reading: ExportEntriesReading,
  unreadableDateCount: number,
  foldedPastedLineCount: number,
): ParseReport {
  return {
    nonEmptyLineCount: reading.nonEmptyLineCount,
    entryCount: reading.entryCount,
    systemNoticeCount: reading.systemNoticeCount,
    unreadableDateCount,
    foldedPastedLineCount,
    platform: reading.platform,
  };
}

/**
 * The result for a text in which no message was found.
 */
function createEmptyParsedChat(reading: ExportEntriesReading): ParsedChat {
  return {
    messages: [],
    groupEvents: [],
    dateOrder: null,
    isDateOrderAmbiguous: false,
    timestampResolution: 'second',
    report: createParseReport(reading, 0, 0),
  };
}

/**
 * Parses the text of a WhatsApp chat export.
 *
 * Handles iPhone and Android layouts, 12-hour and 24-hour clocks, the three
 * date orders, non-Latin digits, multi-line messages, media placeholders,
 * deleted messages, system notices and lines pasted from other chats.
 *
 * @param rawText - The complete text of the export (`_chat.txt` or `WhatsApp Chat with ….txt`).
 * @param forcedDateOrder - `'dmy'` or `'mdy'` to override the detection when
 *   the user says the dates were read the wrong way round; `null` to detect.
 *   Ignored for year-first exports, which cannot be misread.
 * @param locale - The BCP 47 tag of the browser (`navigator.language`). Only
 *   used as the last tie-break between day/month and month/day.
 * @returns The messages in file order, the notices about the group kept as
 *   events, how the dates were read and a report of what was skipped.
 *   `messages` is empty when the text is not a chat export.
 */
export function parseChat(
  rawText: string,
  forcedDateOrder: AmbiguousDateOrder | null = null,
  locale: string | null = null,
): ParsedChat {
  const reading = readExportEntries(rawText);

  const dateOrderDecision = detectDateOrder(reading.entries, forcedDateOrder, locale);
  if (dateOrderDecision === null) {
    return createEmptyParsedChat(reading);
  }

  const datedMessages = buildDatedMessages(reading.entries, dateOrderDecision.dateOrder);
  const folding = foldPastedLines(datedMessages.messages);
  const timestampResolution: TimestampResolution = reading.hasSecondsInTimestamps
    ? 'second'
    : 'minute';

  return {
    messages: folding.messages,
    groupEvents: buildGroupEvents(reading.groupNotices, dateOrderDecision.dateOrder),
    dateOrder: dateOrderDecision.dateOrder,
    isDateOrderAmbiguous: dateOrderDecision.isAmbiguous,
    timestampResolution,
    report: createParseReport(reading, datedMessages.unreadableDateCount, folding.foldedLineCount),
  };
}
