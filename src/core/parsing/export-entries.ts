/**
 * First pass over the text of an export: split it into lines, recognise the
 * entries, drop system notices and attach continuation lines. A notice about
 * who is in the group or what it is called is kept on the side as a group
 * notice; it never becomes an entry.
 *
 * Dates are deliberately left as three uninterpreted numbers here, because
 * whether `03/04/24` is the third of April or the fourth of March can only be
 * decided once every entry of the file has been seen.
 */

import type { Mutable } from '../mutable';
import type { ExportPlatform, GroupChange, MessageKind } from '../types';
import type { TimestampParts } from './date-construction';
import { readGroupNotice } from './group-notices';
import {
  LEFT_TO_RIGHT_MARK,
  removeInvisibleCharacters,
  removeInvisibleCharactersExceptLeftToRightMark,
} from './invisible-characters';
import { matchMessageLine } from './line-pattern';
import type { MessageLineMatch } from './line-pattern';
import {
  classifyMessageBody,
  findTrailingMarkedPlaceholder,
  hasEditedMessageSuffix,
  isSystemNoticeSender,
  splitSenderAndText,
} from './message-classification';

/**
 * A message as read from the file: its timestamp, still as the numbers the
 * export wrote, together with who sent it and what it says.
 */
export interface ExportEntry extends TimestampParts {
  /** The sender's name. */
  readonly sender: string;
  /** The message body including continuation lines. */
  readonly text: string;
  /** What kind of message this is. */
  readonly kind: MessageKind;
  /**
   * For a media message, what was typed in front of its placeholder; empty for
   * media without a caption and for every other kind of message.
   */
  readonly caption: string;
  /**
   * Whether the message ends in the note of an edited message. It is kept
   * here because the note is cut off a captioned placeholder, whose `text`
   * no longer shows it.
   */
  readonly isEdited: boolean;
}

/**
 * A system notice about the group as read from the file: its timestamp, still
 * as the numbers the export wrote, and what it says happened.
 */
export interface ExportGroupNotice extends TimestampParts {
  /** What the notice says happened. */
  readonly change: GroupChange;
}

/** Everything the first pass learns about a file. */
export interface ExportEntriesReading {
  /** The messages in file order; system notices are already left out. */
  readonly entries: readonly ExportEntry[];
  /** Lines that contain something other than white space. */
  readonly nonEmptyLineCount: number;
  /** Lines that start with a timestamp: messages and system notices together. */
  readonly entryCount: number;
  /**
   * The system notices about who is in the group and what it is called, in
   * file order. They are counted in `systemNoticeCount` like every notice.
   */
  readonly groupNotices: readonly ExportGroupNotice[];
  /** Entries that are system notices, whether dropped or kept as group notices. */
  readonly systemNoticeCount: number;
  /** The client that wrote the export, judged from the first entry; `null` when there is none. */
  readonly platform: ExportPlatform | null;
  /** Whether at least one kept message has seconds in its timestamp. */
  readonly hasSecondsInTimestamps: boolean;
}

/** An entry while its continuation lines are still being collected. */
type ExportEntryUnderConstruction = Mutable<ExportEntry>;

/**
 * What has been learnt about the file so far, while its lines are read one
 * after the other. It has the fields of {@link ExportEntriesReading}, writable,
 * plus the one piece of state that links a line to the lines before it.
 */
interface ReadingProgress extends Mutable<ExportEntriesReading> {
  /** Narrowed from the result type so continuation lines can be appended to the entries. */
  entries: ExportEntryUnderConstruction[];
  /** Narrowed from the result type so notices can be appended. */
  groupNotices: ExportGroupNotice[];
  /**
   * The entry that a line without a timestamp would continue, or `null` when
   * such a line belongs to nothing that is kept (the file has not reached its
   * first entry yet, or the last entry was a system notice).
   */
  entryAcceptingContinuationLines: ExportEntryUnderConstruction | null;
}

/** Exports use Windows line breaks on some platforms and Unix ones on others. */
const LINE_BREAK_PATTERN = /\r?\n/;

/** iPhone wraps every timestamp in square brackets; Android never does. */
const IPHONE_LINE_OPENING_BRACKET = '[';

/**
 * Tells whether a cleaned line starts with the iPhone timestamp bracket.
 */
function isBracketedLine(cleanedLine: string): boolean {
  return cleanedLine.startsWith(IPHONE_LINE_OPENING_BRACKET);
}

/**
 * Tells whether the message body of a line is preceded by the left-to-right
 * mark, i.e. whether the original line contains `Sender: <mark>`.
 *
 * The check runs on the original line, because the cleaned line no longer has
 * the mark. It looks for the sender followed by the mark rather than for a
 * mark anywhere, since iPhone also puts one at the very start of some lines
 * and inside edited-message notes, neither of which says anything about the body.
 */
function isBodyMarkedAsNotTyped(originalLine: string, sender: string): boolean {
  const lineWithMarks = removeInvisibleCharactersExceptLeftToRightMark(originalLine);
  return lineWithMarks.includes(`${sender}: ${LEFT_TO_RIGHT_MARK}`);
}

/**
 * Finds the media placeholder at the end of an iPhone line, after the mark
 * that follows a caption (`Sender: happy birthday <mark>image omitted`).
 * Android does not use the mark, so its lines are never searched.
 *
 * @returns The placeholder alone, or `null` when the line does not end in a
 *   marked placeholder.
 */
function findCaptionedPlaceholder(originalLine: string, cleanedLine: string): string | null {
  if (!isBracketedLine(cleanedLine)) {
    return null;
  }
  return findTrailingMarkedPlaceholder(
    removeInvisibleCharactersExceptLeftToRightMark(originalLine),
  );
}

/**
 * Cuts the caption out of the visible text that ends in a placeholder.
 *
 * @param visibleText - The text of a line, or of the body of an entry, without
 *   invisible characters: the caption, the placeholder and possibly the note
 *   of an edited message.
 * @param placeholder - The placeholder found after the last mark of that line.
 * @returns What stands before the placeholder, trimmed; empty when nothing does.
 */
function cutCaptionBeforePlaceholder(visibleText: string, placeholder: string): string {
  const placeholderIndex = visibleText.lastIndexOf(placeholder);
  return visibleText.slice(0, Math.max(placeholderIndex, 0)).trim();
}

/**
 * Copies the numbers of the timestamp out of a matched line.
 */
function timestampPartsOf(lineMatch: MessageLineMatch): TimestampParts {
  return {
    firstDateNumber: lineMatch.firstDateNumber,
    secondDateNumber: lineMatch.secondDateNumber,
    thirdDateNumber: lineMatch.thirdDateNumber,
    hour: lineMatch.hour,
    minute: lineMatch.minute,
    second: lineMatch.second ?? 0,
    meridiem: lineMatch.meridiem,
  };
}

/**
 * Finds the wording of a system notice in a line that was not read as a message.
 *
 * A notice is written in one of two ways. Android, and iPhone at times, write
 * it straight after the timestamp (`31/12/23, 22:00 - Bob added Carl`); a
 * group name with a colon in it can make such a line look as if it had a
 * sender. iPhone otherwise attributes it to the group or to a person and puts
 * the left-to-right mark in front (`[...] Trip: <mark>Bob added Carl`).
 *
 * The mark is required in the second case. Without it somebody typed the
 * words, and the line was dropped for another reason (it mentions a "security
 * code", say); what a person typed is never read as an event.
 *
 * @returns The text of the notice, or `null` when the line holds typed words.
 */
function findNoticeWording(originalLine: string, lineMatch: MessageLineMatch): string | null {
  const senderAndText = splitSenderAndText(lineMatch.content);
  if (senderAndText === null || isSystemNoticeSender(senderAndText.sender)) {
    return lineMatch.content;
  }
  if (isBodyMarkedAsNotTyped(originalLine, senderAndText.sender)) {
    return senderAndText.text;
  }
  return null;
}

/**
 * Reads a line that was not kept as a message as a notice about the group.
 *
 * @returns The notice with its timestamp, or `null` when the line says nothing
 *   about who is in the group or what it is called, in which case it is dropped.
 */
function createGroupNoticeFromLine(
  originalLine: string,
  lineMatch: MessageLineMatch,
): ExportGroupNotice | null {
  const noticeWording = findNoticeWording(originalLine, lineMatch);
  if (noticeWording === null) {
    return null;
  }
  const change = readGroupNotice(noticeWording);
  if (change === null) {
    return null;
  }
  return { ...timestampPartsOf(lineMatch), change };
}

/**
 * Turns a matched line into an entry, or decides that it is a system notice.
 *
 * @returns The entry, or `null` for a system notice.
 */
function createEntryFromLine(
  originalLine: string,
  cleanedLine: string,
  lineMatch: MessageLineMatch,
): ExportEntryUnderConstruction | null {
  const senderAndText = splitSenderAndText(lineMatch.content);
  if (senderAndText === null) {
    return null;
  }
  if (isSystemNoticeSender(senderAndText.sender)) {
    return null;
  }

  const timestampParts = timestampPartsOf(lineMatch);

  const captionedPlaceholder = findCaptionedPlaceholder(originalLine, cleanedLine);
  if (captionedPlaceholder !== null) {
    return {
      ...timestampParts,
      sender: senderAndText.sender,
      text: captionedPlaceholder,
      kind: 'media',
      caption: cutCaptionBeforePlaceholder(senderAndText.text, captionedPlaceholder),
      isEdited: hasEditedMessageSuffix(senderAndText.text),
    };
  }

  const classification = classifyMessageBody(senderAndText.text, {
    isMarkedAsNotTyped: isBodyMarkedAsNotTyped(originalLine, senderAndText.sender),
    isBracketedLine: isBracketedLine(cleanedLine),
  });
  if (classification === 'system-notice') {
    return null;
  }

  return {
    ...timestampParts,
    sender: senderAndText.sender,
    text: senderAndText.text,
    kind: classification,
    caption: '',
    isEdited: hasEditedMessageSuffix(senderAndText.text),
  };
}

/**
 * Creates the progress of a file of which no line has been read yet.
 */
function createReadingProgress(): ReadingProgress {
  return {
    entries: [],
    groupNotices: [],
    nonEmptyLineCount: 0,
    entryCount: 0,
    systemNoticeCount: 0,
    platform: null,
    hasSecondsInTimestamps: false,
    entryAcceptingContinuationLines: null,
  };
}

/**
 * Handles a line that does not start with a timestamp: it continues the entry
 * before it, provided that entry is typed text. The lines after a media
 * placeholder are a caption or poll options and are not counted as words, and
 * the lines after a system notice belong to the notice.
 *
 * On iPhone the line can also reveal that the entry was never typed text. A
 * caption of several lines is exported with the placeholder after its last
 * line (`...and many more <mark>image omitted`), so everything collected so
 * far was the caption of a photo: the entry becomes media, its text becomes
 * the placeholder and what was collected becomes its caption.
 *
 * The note of an edited message stands at the very end of a message, so the
 * line that is now the last one decides whether the entry counts as edited.
 */
function appendContinuationLine(
  progress: ReadingProgress,
  originalLine: string,
  cleanedLine: string,
): void {
  const continuedEntry = progress.entryAcceptingContinuationLines;
  if (continuedEntry?.kind !== 'text') {
    return;
  }

  const captionedPlaceholder =
    progress.platform === 'iPhone'
      ? findTrailingMarkedPlaceholder(removeInvisibleCharactersExceptLeftToRightMark(originalLine))
      : null;
  if (captionedPlaceholder !== null) {
    const lastCaptionLine = cutCaptionBeforePlaceholder(cleanedLine, captionedPlaceholder);
    continuedEntry.caption = `${continuedEntry.text}\n${lastCaptionLine}`.trim();
    continuedEntry.kind = 'media';
    continuedEntry.text = captionedPlaceholder;
    continuedEntry.isEdited = hasEditedMessageSuffix(cleanedLine);
    return;
  }
  continuedEntry.text += `\n${cleanedLine}`;
  continuedEntry.isEdited = hasEditedMessageSuffix(continuedEntry.text);
}

/**
 * Handles a line that starts with a timestamp: counts it, lets the first one
 * decide the platform, and keeps it as an entry unless it is a system notice.
 * A system notice is counted, and kept on the side when it is about the group.
 */
function recordEntryLine(
  progress: ReadingProgress,
  originalLine: string,
  cleanedLine: string,
  lineMatch: MessageLineMatch,
): void {
  progress.entryAcceptingContinuationLines = null;
  progress.entryCount += 1;
  progress.platform ??= isBracketedLine(cleanedLine) ? 'iPhone' : 'Android';

  const entry = createEntryFromLine(originalLine, cleanedLine, lineMatch);
  if (entry === null) {
    progress.systemNoticeCount += 1;
    const groupNotice = createGroupNoticeFromLine(originalLine, lineMatch);
    if (groupNotice !== null) {
      progress.groupNotices.push(groupNotice);
    }
    return;
  }

  if (lineMatch.second !== null) {
    progress.hasSecondsInTimestamps = true;
  }
  progress.entries.push(entry);
  progress.entryAcceptingContinuationLines = entry;
}

/**
 * Reads one line of the export into the progress.
 */
function readLine(progress: ReadingProgress, originalLine: string): void {
  const cleanedLine = removeInvisibleCharacters(originalLine);
  if (cleanedLine.trim() !== '') {
    progress.nonEmptyLineCount += 1;
  }

  const lineMatch = matchMessageLine(cleanedLine);
  if (lineMatch === null) {
    appendContinuationLine(progress, originalLine, cleanedLine);
    return;
  }
  recordEntryLine(progress, originalLine, cleanedLine, lineMatch);
}

/**
 * Reads the text of an export line by line.
 *
 * A line that starts with a timestamp opens a new entry. Any other line
 * continues the entry before it, provided that entry is typed text: the lines
 * after a media placeholder are a caption or poll options and are not counted
 * as words, and the lines after a system notice belong to the notice.
 *
 * @param rawText - The complete text of the export.
 * @returns The messages and the group notices with uninterpreted dates, and
 *   the counts for the parse report.
 */
export function readExportEntries(rawText: string): ExportEntriesReading {
  const progress = createReadingProgress();
  for (const originalLine of rawText.split(LINE_BREAK_PATTERN)) {
    readLine(progress, originalLine);
  }

  return {
    entries: progress.entries,
    groupNotices: progress.groupNotices,
    nonEmptyLineCount: progress.nonEmptyLineCount,
    entryCount: progress.entryCount,
    systemNoticeCount: progress.systemNoticeCount,
    platform: progress.platform,
    hasSecondsInTimestamps: progress.hasSecondsInTimestamps,
  };
}
