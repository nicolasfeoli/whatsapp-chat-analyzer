/**
 * Tests of the invented example chat the page shows before a file is loaded.
 *
 * The screenshots in the README show this chat, so the tests pin its headline
 * facts: a change to the generator that alters them has to be made on purpose.
 */

import { describe, expect, it } from 'vitest';

import { analyseChatExport } from '../../src/core/index';
import type { ChatAnalysis } from '../../src/core/index';
import { matchMessageLine } from '../../src/core/parsing/line-pattern';
import {
  SAMPLE_CHAT_TITLE,
  createSeededRandomNumberSource,
  generateSampleChatText,
} from '../../src/ui/sample-chat';
import { findPerson, participantNames } from '../fixtures/analysis-readers';
import { localMidnight, localTime } from '../fixtures/messages';

/** How many numbers are drawn when a test looks at a sequence. */
const SEQUENCE_LENGTH = 1000;

/**
 * Draws the first numbers of the sequence a seed produces.
 */
function drawSequence(seed: number): number[] {
  const nextRandomNumber = createSeededRandomNumberSource(seed);
  return Array.from({ length: SEQUENCE_LENGTH }, () => nextRandomNumber());
}

/**
 * Analyses the example chat and fails the test if it could not be read.
 */
function analyseSampleChat(): ChatAnalysis {
  const result = analyseChatExport(generateSampleChatText(), null, 'en-US');
  if (result.kind !== 'analysed') {
    throw new Error('The example chat could not be read');
  }
  return result.analysis;
}

describe('createSeededRandomNumberSource', () => {
  it('produces the same sequence for the same seed', () => {
    expect(drawSequence(20260105)).toEqual(drawSequence(20260105));
  });

  it('produces a different sequence for a different seed', () => {
    expect(drawSequence(20260105)).not.toEqual(drawSequence(20260106));
  });

  it('only produces numbers from zero up to, but not including, one', () => {
    for (const randomNumber of drawSequence(20260105)) {
      expect(randomNumber).toBeGreaterThanOrEqual(0);
      expect(randomNumber).toBeLessThan(1);
    }
  });

  it('follows the "Numerical Recipes" generator: 1013904223 / 2^32 is the first draw from seed 0', () => {
    const nextRandomNumber = createSeededRandomNumberSource(0);

    expect(nextRandomNumber()).toBe(1013904223 / 4294967296);
  });

  it('keeps a separate state for each source', () => {
    const firstSource = createSeededRandomNumberSource(7);
    const secondSource = createSeededRandomNumberSource(7);

    const firstDrawOfFirstSource = firstSource();
    firstSource();

    expect(secondSource()).toBe(firstDrawOfFirstSource);
  });
});

describe('generateSampleChatText', () => {
  it('returns exactly the same text on every call', () => {
    expect(generateSampleChatText()).toBe(generateSampleChatText());
  });

  it('writes every line as a message of an iPhone export', () => {
    const lines = generateSampleChatText().split('\n');

    const linesThatAreNotMessages = lines.filter((line) => matchMessageLine(line) === null);

    expect(linesThatAreNotMessages).toEqual([]);
  });

  it('starts on 5 January 2026 and ends on 3 October 2026', () => {
    const lines = generateSampleChatText().split('\n');

    expect(lines[0]).toBe('[05/01/26, 08:44:17] Diego: I am leaving the office now');
    expect(lines[lines.length - 1]).toBe('[03/10/26, 18:16:35] Diego: that restaurant was amazing');
  });

  it('has the 2,309 messages the README screenshots show, one per line', () => {
    expect(generateSampleChatText().split('\n')).toHaveLength(2309);
  });

  it('is titled as an example', () => {
    expect(SAMPLE_CHAT_TITLE).toBe('Marta and Diego (example)');
  });
});

describe('the example chat, once analysed', () => {
  it('is read completely and without ambiguity', () => {
    const result = analyseChatExport(generateSampleChatText(), null, 'en-US');

    expect(result).toMatchObject({
      kind: 'analysed',
      dateOrder: 'dmy',
      isDateOrderAmbiguous: false,
      report: {
        nonEmptyLineCount: 2309,
        entryCount: 2309,
        systemNoticeCount: 0,
        unreadableDateCount: 0,
        foldedPastedLineCount: 0,
        platform: 'iPhone',
      },
    });
  });

  it('reads the same whatever the language of the browser', () => {
    const readInSpain = analyseChatExport(generateSampleChatText(), null, 'es-ES');
    const readInTheUnitedStates = analyseChatExport(generateSampleChatText(), null, 'en-US');

    expect(readInSpain).toEqual(readInTheUnitedStates);
  });

  it('is a chat between Marta and Diego, in which Marta writes a little more', () => {
    const analysis = analyseSampleChat();

    expect(participantNames(analysis)).toEqual(['Marta', 'Diego']);
    expect(findPerson(analysis, 'Marta').messageCount).toBe(1187);
    expect(findPerson(analysis, 'Diego').messageCount).toBe(1122);
    expect(analysis.totalMessageCount).toBe(2309);
  });

  it('contains media placeholders from both people', () => {
    const analysis = analyseSampleChat();

    expect(findPerson(analysis, 'Marta').mediaCount).toBe(72);
    expect(findPerson(analysis, 'Diego').mediaCount).toBe(48);
  });

  it('has an obvious busiest day on 16 May', () => {
    expect(analyseSampleChat().busiestDay).toEqual({
      date: localMidnight('2026-05-16'),
      messageCount: 124,
    });
  });

  it('has its longest silence over the holiday from 12 to 20 July', () => {
    const silence = analyseSampleChat().longestSilence;

    expect(silence?.from).toEqual(localTime('2026-07-11 12:45:53'));
    expect(silence?.to).toEqual(localTime('2026-07-21 14:11:53'));
  });

  it('has a longest streak of 28 days', () => {
    expect(analyseSampleChat().longestStreak).toEqual({
      lengthInDays: 28,
      from: localMidnight('2026-08-13'),
      to: localMidnight('2026-09-09'),
    });
  });

  it('has the long story as its longest message', () => {
    const analysis = analyseSampleChat();

    expect(analysis.longestMessageWordCount).toBe(59);
    expect(analysis.longestMessage?.kind).toBe('text');
  });
});
