/**
 * Folds lines pasted from another chat back into the message that quotes them.
 *
 * Somebody copies a few messages from a different chat and pastes them:
 *
 * ```text
 * 1/13/24, 10:00 - Ana: look what he said:
 * 1/12/24, 09:00 - Zed: I never said that
 * 1/12/24, 09:01 - Zed: honest
 * 1/13/24, 10:01 - Bob: wow
 * ```
 *
 * The pasted lines match the line pattern, so they look like messages from a
 * new participant called Zed. Two things give them away together:
 *
 * 1. They form a short run that jumps back in time and then resumes.
 * 2. Their sender never appears outside such runs.
 *
 * Real senders are deliberately left alone even when their messages jump back,
 * because a phone that changes time zone (a flight, a daylight-saving switch)
 * produces exactly the same pattern, and folding those would delete real
 * messages. The price is a known limit: lines pasted from a real participant
 * still count as extra messages from them.
 */

import { MILLISECONDS_PER_MINUTE } from '../time-constants';
import type { ChatMessage } from '../types';

/** The outcome of {@link foldPastedLines}. */
export interface PastedLinesFolding {
  /** The messages that remain, in file order, with pasted lines appended to the message quoting them. */
  readonly messages: readonly ChatMessage[];
  /** How many entries were removed from the list because they were pasted lines. */
  readonly foldedLineCount: number;
}

/** How often a sender appears, and how often inside a run that jumps back in time. */
interface SenderAppearances {
  /** Every message of the sender in the file. */
  totalCount: number;
  /** Those of them that sit inside a short run dated before the message preceding it. */
  countInsideBackwardRuns: number;
}

/**
 * How far back a message may be dated without raising suspicion. Phones in a
 * group disagree about the time by seconds to minutes, and Android exports
 * round to the minute, so messages a few minutes out of order are normal.
 */
const TOLERATED_CLOCK_DISAGREEMENT_IN_MILLISECONDS = 10 * MILLISECONDS_PER_MINUTE;

/**
 * The longest run of out-of-order messages still treated as a paste. People
 * paste a handful of lines; a longer stretch of earlier timestamps is more
 * likely a clock or time-zone change than a quotation.
 */
const LONGEST_PASTED_RUN_LENGTH = 20;

/**
 * Finds where a run of messages dated before a reference moment ends.
 *
 * @returns The index of the first message at or after `runStartIndex` that is
 *   not earlier than the reference, capped at {@link LONGEST_PASTED_RUN_LENGTH}
 *   messages after the start.
 */
function findEndOfBackwardRun(
  messages: readonly ChatMessage[],
  runStartIndex: number,
  referenceTime: number,
): number {
  let runEndIndex = runStartIndex;
  while (runEndIndex < messages.length && runEndIndex - runStartIndex < LONGEST_PASTED_RUN_LENGTH) {
    const candidate = messages[runEndIndex];
    if (candidate === undefined || candidate.timestamp.getTime() >= referenceTime) {
      break;
    }
    runEndIndex += 1;
  }
  return runEndIndex;
}

/**
 * Marks every message that sits in a short run dated before the message
 * preceding the run.
 *
 * @returns One flag per message, `true` for the members of such runs.
 */
function markShortBackwardRuns(messages: readonly ChatMessage[]): readonly boolean[] {
  const isInsideBackwardRun = new Array<boolean>(messages.length).fill(false);

  let index = 1;
  while (index < messages.length) {
    const previousMessage = messages[index - 1];
    const currentMessage = messages[index];
    if (previousMessage === undefined || currentMessage === undefined) {
      break;
    }

    const referenceTime = previousMessage.timestamp.getTime();
    const earliestUnsuspiciousTime = referenceTime - TOLERATED_CLOCK_DISAGREEMENT_IN_MILLISECONDS;
    if (currentMessage.timestamp.getTime() >= earliestUnsuspiciousTime) {
      index += 1;
      continue;
    }

    const runEndIndex = findEndOfBackwardRun(messages, index, referenceTime);
    const runLength = runEndIndex - index;
    if (runLength >= LONGEST_PASTED_RUN_LENGTH) {
      /* Too long to be a paste: leave it alone and look again from the next message. */
      index += 1;
      continue;
    }

    isInsideBackwardRun.fill(true, index, runEndIndex);
    /*
     * The message that ends the run is where time resumes. It is skipped as a
     * possible start of another run, which matches how the run was measured:
     * against the message before the paste, not against the pasted lines.
     */
    index = runEndIndex + 1;
  }

  return isInsideBackwardRun;
}

/**
 * Looks up the appearance counts of a sender, creating them at zero for a
 * sender seen for the first time.
 */
function getOrCreateSenderAppearances(
  appearancesBySender: Map<string, SenderAppearances>,
  sender: string,
): SenderAppearances {
  const existingAppearances = appearancesBySender.get(sender);
  if (existingAppearances !== undefined) {
    return existingAppearances;
  }

  const newAppearances: SenderAppearances = { totalCount: 0, countInsideBackwardRuns: 0 };
  appearancesBySender.set(sender, newAppearances);
  return newAppearances;
}

/**
 * Counts, for every sender, all their messages and those inside backward runs.
 */
function countSenderAppearances(
  messages: readonly ChatMessage[],
  isInsideBackwardRun: readonly boolean[],
): ReadonlyMap<string, SenderAppearances> {
  const appearancesBySender = new Map<string, SenderAppearances>();

  for (const [index, message] of messages.entries()) {
    const appearances = getOrCreateSenderAppearances(appearancesBySender, message.sender);
    appearances.totalCount += 1;
    if (isInsideBackwardRun[index] === true) {
      appearances.countInsideBackwardRuns += 1;
    }
  }

  return appearancesBySender;
}

/**
 * Tells whether a sender only ever appears inside backward runs, i.e. is not a
 * participant of this chat but a name inside pasted text.
 */
function appearsOnlyInsideBackwardRuns(appearances: SenderAppearances | undefined): boolean {
  if (appearances === undefined) {
    return false;
  }
  return appearances.totalCount === appearances.countInsideBackwardRuns;
}

/**
 * Appends a pasted line to the message that quotes it, written the way it
 * looked in the paste: `Sender: text`. A media or deleted message cannot quote
 * anything, so it is returned unchanged and the pasted line is dropped.
 */
function appendPastedLine(quotingMessage: ChatMessage, pastedLine: ChatMessage): ChatMessage {
  if (quotingMessage.kind !== 'text') {
    return quotingMessage;
  }
  return {
    ...quotingMessage,
    text: `${quotingMessage.text}\n${pastedLine.sender}: ${pastedLine.text}`,
  };
}

/**
 * Removes entries that are lines pasted from another chat and appends their
 * text to the message they were pasted in.
 *
 * @param messages - Every message of the export, in file order.
 * @returns The remaining messages and how many entries were folded away.
 */
export function foldPastedLines(messages: readonly ChatMessage[]): PastedLinesFolding {
  const isInsideBackwardRun = markShortBackwardRuns(messages);
  const appearancesBySender = countSenderAppearances(messages, isInsideBackwardRun);
  const keptMessages: ChatMessage[] = [];

  for (const [index, message] of messages.entries()) {
    const isPastedLine =
      isInsideBackwardRun[index] === true &&
      appearsOnlyInsideBackwardRuns(appearancesBySender.get(message.sender));
    const lastKeptIndex = keptMessages.length - 1;
    const quotingMessage = keptMessages[lastKeptIndex];

    if (!isPastedLine || quotingMessage === undefined) {
      keptMessages.push(message);
      continue;
    }
    keptMessages[lastKeptIndex] = appendPastedLine(quotingMessage, message);
  }

  return {
    messages: keptMessages,
    foldedLineCount: messages.length - keptMessages.length,
  };
}
