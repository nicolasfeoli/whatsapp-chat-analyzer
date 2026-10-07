// @vitest-environment jsdom

/**
 * Tests of the "What stands out" sentences. Each sentence has a threshold
 * below which it is left out, so every describe block states the sentence once
 * and then walks along the edge of its threshold.
 */

import { describe, expect, it } from 'vitest';

import {
  collectInsights,
  findQuietestWeekdayIndex,
  renderInsightsSection,
} from '../../../src/ui/sections/insights';
import type { ChatAnalysis, PersonStatistics } from '../../../src/core/types';
import {
  chatAnalysis,
  emptyHeatmap,
  heatmapWith,
  personStatistics,
} from '../../fixtures/analysis-builders';
import { localMidnight, localTime } from '../../fixtures/messages';
import { parseMarkup, textsOfElements } from '../../fixtures/markup';

/** One second, one minute, one hour and one day, in milliseconds. */
const ONE_SECOND = 1000;
const ONE_MINUTE = 60 * ONE_SECOND;
const ONE_HOUR = 60 * ONE_MINUTE;
const ONE_DAY = 24 * ONE_HOUR;

/** Row indexes of the heatmap, which starts on Monday. */
const MONDAY = 0;
const TUESDAY = 1;
const WEDNESDAY = 2;

/**
 * Builds five reply delays of the same length: enough for a typical delay.
 */
function fiveRepliesOf(delayInMilliseconds: number): number[] {
  return new Array<number>(5).fill(delayInMilliseconds);
}

/**
 * Builds the analysis of a chat between the people given.
 */
function analysisOf(
  people: readonly PersonStatistics[],
  parts: Partial<ChatAnalysis> = {},
): ChatAnalysis {
  return chatAnalysis({ ...parts, people });
}

/**
 * Finds the one sentence that starts with or contains a phrase.
 *
 * @returns The sentence, or `undefined` when the chat has no such insight.
 */
function findInsight(analysis: ChatAnalysis, phrase: string): string | undefined {
  return collectInsights(analysis).find((sentence) => sentence.includes(phrase));
}

describe('findQuietestWeekdayIndex', () => {
  it('finds the weekday with the fewest messages across all its hours', () => {
    const heatmap = emptyHeatmap().map((_hourCounts, weekdayIndex) => {
      const hourCounts = new Array<number>(24).fill(1);
      if (weekdayIndex === WEDNESDAY) {
        hourCounts[20] = 0;
      }
      return hourCounts;
    });

    expect(findQuietestWeekdayIndex(heatmap)).toBe(WEDNESDAY);
  });

  it('prefers the earliest weekday when several are equally quiet', () => {
    const heatmap = heatmapWith([{ weekdayIndex: MONDAY, hour: 9, messageCount: 4 }]);

    expect(findQuietestWeekdayIndex(heatmap)).toBe(TUESDAY);
  });
});

describe('collectInsights', () => {
  describe('who writes the most', () => {
    it('names the most active person and their share', () => {
      const analysis = analysisOf([
        personStatistics({ name: 'Ana', messageCount: 60 }),
        personStatistics({ name: 'Bob', messageCount: 25 }),
        personStatistics({ name: 'Carla', messageCount: 15 }),
      ]);

      expect(collectInsights(analysis)[0]).toBe('<b>Ana</b> writes the most: 60% of all messages.');
    });

    it('adds a ratio per ten messages in a chat of two', () => {
      const analysis = analysisOf([
        personStatistics({ name: 'Ana', messageCount: 75 }),
        personStatistics({ name: 'Bob', messageCount: 25 }),
      ]);

      expect(collectInsights(analysis)[0]).toBe(
        '<b>Ana</b> writes the most: 75% of all messages. For every 10 from Bob, Ana sends 30.',
      );
    });

    it('is left out of a chat with a single sender', () => {
      const analysis = analysisOf([personStatistics({ name: 'Ana', messageCount: 5 })]);

      expect(findInsight(analysis, 'writes the most')).toBeUndefined();
    });
  });

  describe('when the chat is most alive', () => {
    it('names the weekday and hour of the busiest slot', () => {
      const analysis = chatAnalysis({
        weekdayHourHeatmap: heatmapWith([
          { weekdayIndex: WEDNESDAY, hour: 20, messageCount: 1234 },
        ]),
      });

      expect(findInsight(analysis, 'most alive')).toBe(
        'The chat is most alive on <b>Wednesdays around 20:00</b>, with 1,234 messages in that hour slot.',
      );
    });

    it('pads a morning hour with a zero', () => {
      const analysis = chatAnalysis({
        weekdayHourHeatmap: heatmapWith([{ weekdayIndex: MONDAY, hour: 7, messageCount: 3 }]),
      });

      expect(findInsight(analysis, 'most alive')).toContain('<b>Mondays around 07:00</b>');
    });
  });

  describe('the quietest weekday', () => {
    it('is always named', () => {
      const analysis = chatAnalysis({
        weekdayHourHeatmap: heatmapWith([{ weekdayIndex: MONDAY, hour: 9, messageCount: 4 }]),
      });

      expect(findInsight(analysis, 'quietest')).toBe(
        'The quietest day of the week is <b>Tuesday</b>.',
      );
    });
  });

  describe('who replies fastest', () => {
    const fastAna = personStatistics({
      name: 'Ana',
      messageCount: 60,
      replyDelaysInMilliseconds: fiveRepliesOf(45 * ONE_SECOND),
    });
    const slowBob = personStatistics({
      name: 'Bob',
      messageCount: 40,
      replyDelaysInMilliseconds: fiveRepliesOf(12 * ONE_MINUTE),
    });

    it('names the fastest and the slowest person with their typical reply times', () => {
      expect(findInsight(analysisOf([fastAna, slowBob]), 'replies fastest')).toBe(
        '<b>Ana</b> replies fastest, typically in <b>45 s</b>. <b>Bob</b> takes 12 min.',
      );
    });

    it('names the fastest first whoever is the more talkative', () => {
      const talkativeButSlowBob = { ...slowBob, messageCount: 90 };

      expect(findInsight(analysisOf([talkativeButSlowBob, fastAna]), 'replies fastest')).toContain(
        '<b>Ana</b> replies fastest',
      );
    });

    it('skips the people in the middle of a larger group', () => {
      const carla = personStatistics({
        name: 'Carla',
        messageCount: 30,
        replyDelaysInMilliseconds: fiveRepliesOf(3 * ONE_MINUTE),
      });

      expect(findInsight(analysisOf([fastAna, slowBob, carla]), 'replies fastest')).toBe(
        '<b>Ana</b> replies fastest, typically in <b>45 s</b>. <b>Bob</b> takes 12 min.',
      );
    });

    it('writes "under 1 min" for a same-minute reply in an export that records only minutes', () => {
      const instantAna = { ...fastAna, replyDelaysInMilliseconds: fiveRepliesOf(0) };
      const analysis = analysisOf([instantAna, slowBob], { timestampResolution: 'minute' });

      expect(findInsight(analysis, 'replies fastest')).toBe(
        '<b>Ana</b> replies fastest, typically in <b>under 1 min</b>. <b>Bob</b> takes 12 min.',
      );
    });

    it('is left out when only one person has replied five times', () => {
      const bobWithFourReplies = {
        ...slowBob,
        replyDelaysInMilliseconds: [ONE_MINUTE, ONE_MINUTE, ONE_MINUTE, ONE_MINUTE],
      };

      expect(
        findInsight(analysisOf([fastAna, bobWithFourReplies]), 'replies fastest'),
      ).toBeUndefined();
    });
  });

  describe('who starts the conversations', () => {
    it('names the person who opened the most, with their share', () => {
      const analysis = analysisOf(
        [
          personStatistics({ name: 'Ana', messageCount: 60, conversationsStartedCount: 1 }),
          personStatistics({ name: 'Bob', messageCount: 40, conversationsStartedCount: 3 }),
        ],
        { conversationCount: 4 },
      );

      expect(findInsight(analysis, 'of the conversations')).toBe(
        '<b>Bob</b> starts <b>75%</b> of the conversations (3 of 4).',
      );
    });

    it('names the more talkative person when two opened equally many', () => {
      const analysis = analysisOf(
        [
          personStatistics({ name: 'Ana', messageCount: 60, conversationsStartedCount: 2 }),
          personStatistics({ name: 'Bob', messageCount: 40, conversationsStartedCount: 2 }),
        ],
        { conversationCount: 4 },
      );

      expect(findInsight(analysis, 'of the conversations')).toContain(
        '<b>Ana</b> starts <b>50%</b>',
      );
    });

    it('is left out of a chat with a single sender', () => {
      const analysis = analysisOf([
        personStatistics({ name: 'Ana', messageCount: 5, conversationsStartedCount: 1 }),
      ]);

      expect(findInsight(analysis, 'of the conversations')).toBeUndefined();
    });
  });

  describe('the longest streak', () => {
    it('gives its length and its first and last day', () => {
      const analysis = chatAnalysis({
        longestStreak: {
          lengthInDays: 28,
          from: localMidnight('2026-08-13'),
          to: localMidnight('2026-09-09'),
        },
      });

      expect(findInsight(analysis, 'Longest streak')).toBe(
        'Longest streak: <b>28 days in a row</b>, from 13 Aug 2026 to 9 Sep 2026.',
      );
    });

    it('is mentioned from two days on', () => {
      const analysis = chatAnalysis({
        longestStreak: {
          lengthInDays: 2,
          from: localMidnight('2024-01-12'),
          to: localMidnight('2024-01-13'),
        },
      });

      expect(findInsight(analysis, 'Longest streak')).toContain('<b>2 days in a row</b>');
    });

    it('is left out when no two active days are adjacent', () => {
      expect(findInsight(chatAnalysis(), 'Longest streak')).toBeUndefined();
    });
  });

  describe('the longest silence', () => {
    it('gives its length and the days it lies between', () => {
      const analysis = chatAnalysis({
        longestSilence: {
          durationInMilliseconds: 10 * ONE_DAY,
          from: localTime('2026-07-11 12:45'),
          to: localTime('2026-07-21 12:45'),
        },
      });

      expect(findInsight(analysis, 'Longest silence')).toBe(
        'Longest silence: <b>10 days</b>, between 11 Jul 2026 and 21 Jul 2026.',
      );
    });

    it('is left out when it lasted exactly one day', () => {
      const analysis = chatAnalysis({
        longestSilence: {
          durationInMilliseconds: ONE_DAY,
          from: localTime('2024-01-12 10:00'),
          to: localTime('2024-01-13 10:00'),
        },
      });

      expect(findInsight(analysis, 'Longest silence')).toBeUndefined();
    });

    it('is mentioned as soon as it lasted longer than a day', () => {
      const analysis = chatAnalysis({
        longestSilence: {
          durationInMilliseconds: ONE_DAY + ONE_HOUR,
          from: localTime('2024-01-12 09:00'),
          to: localTime('2024-01-13 10:00'),
        },
      });

      expect(findInsight(analysis, 'Longest silence')).toContain('<b>25 h</b>');
    });

    it('is left out of a chat without any silence', () => {
      expect(
        findInsight(chatAnalysis({ longestSilence: null }), 'Longest silence'),
      ).toBeUndefined();
    });
  });

  describe('the busiest day', () => {
    it('is always named, with its message count', () => {
      const analysis = chatAnalysis({
        busiestDay: { date: localMidnight('2026-05-16'), messageCount: 1240 },
      });

      expect(findInsight(analysis, 'Busiest day')).toBe(
        'Busiest day: <b>16 May 2026</b> with 1,240 messages.',
      );
    });
  });

  describe('who laughs the most', () => {
    it('names the person with the largest share of messages that contain a laugh', () => {
      const analysis = analysisOf([
        personStatistics({
          name: 'Ana',
          messageCount: 50,
          textMessageCount: 50,
          laughingMessageCount: 5,
        }),
        personStatistics({
          name: 'Bob',
          messageCount: 20,
          textMessageCount: 20,
          laughingMessageCount: 6,
        }),
      ]);

      expect(findInsight(analysis, 'laughs the most')).toBe(
        '<b>Bob</b> laughs the most in writing: 30% of their messages contain a laugh such as jaja or haha.',
      );
    });

    it('ignores people with fewer than ten typed messages', () => {
      const analysis = analysisOf([
        personStatistics({
          name: 'Ana',
          messageCount: 50,
          textMessageCount: 50,
          laughingMessageCount: 5,
        }),
        personStatistics({
          name: 'Bob',
          messageCount: 9,
          textMessageCount: 9,
          laughingMessageCount: 9,
        }),
      ]);

      expect(findInsight(analysis, 'laughs the most')).toContain('<b>Ana</b>');
    });

    it('is also shown for a chat with a single sender', () => {
      const analysis = analysisOf([
        personStatistics({
          name: 'Ana',
          messageCount: 10,
          textMessageCount: 10,
          laughingMessageCount: 1,
        }),
      ]);

      expect(findInsight(analysis, 'laughs the most')).toContain('<b>Ana</b>');
    });

    it('is left out when nobody ever laughed in writing', () => {
      const analysis = analysisOf([
        personStatistics({ name: 'Ana', messageCount: 50, textMessageCount: 50 }),
        personStatistics({ name: 'Bob', messageCount: 20, textMessageCount: 20 }),
      ]);

      expect(findInsight(analysis, 'laughs the most')).toBeUndefined();
    });
  });

  describe('who writes the longest messages', () => {
    it('sets the wordiest person against the tersest', () => {
      const analysis = analysisOf([
        personStatistics({ name: 'Ana', messageCount: 50, textMessageCount: 50, wordCount: 200 }),
        personStatistics({ name: 'Bob', messageCount: 20, textMessageCount: 20, wordCount: 250 }),
      ]);

      expect(findInsight(analysis, 'longest messages')).toBe(
        '<b>Bob</b> writes the longest messages, 12.5 words on average against 4.0 for Ana.',
      );
    });

    it('is left out when only one person has typed ten messages', () => {
      const analysis = analysisOf([
        personStatistics({ name: 'Ana', messageCount: 50, textMessageCount: 50, wordCount: 200 }),
        personStatistics({ name: 'Bob', messageCount: 9, textMessageCount: 9, wordCount: 250 }),
      ]);

      expect(findInsight(analysis, 'longest messages')).toBeUndefined();
    });
  });

  describe('the night owl', () => {
    it('names the person with the largest share of messages after midnight', () => {
      const analysis = analysisOf([
        personStatistics({ name: 'Ana', messageCount: 100, nightMessageCount: 4 }),
        personStatistics({ name: 'Bob', messageCount: 50, nightMessageCount: 6 }),
      ]);

      expect(findInsight(analysis, 'night owl')).toBe(
        '<b>Bob</b> is the night owl: 12% of their messages are sent between midnight and 5:00.',
      );
    });

    it('ignores people with fewer than twenty messages', () => {
      const analysis = analysisOf([
        personStatistics({ name: 'Ana', messageCount: 100, nightMessageCount: 4 }),
        personStatistics({ name: 'Bob', messageCount: 19, nightMessageCount: 19 }),
      ]);

      expect(findInsight(analysis, 'night owl')).toContain('<b>Ana</b>');
    });

    it('accepts someone with exactly twenty messages', () => {
      const analysis = analysisOf([
        personStatistics({ name: 'Ana', messageCount: 100, nightMessageCount: 4 }),
        personStatistics({ name: 'Bob', messageCount: 20, nightMessageCount: 10 }),
      ]);

      expect(findInsight(analysis, 'night owl')).toBe(
        '<b>Bob</b> is the night owl: 50% of their messages are sent between midnight and 5:00.',
      );
    });

    it('names someone whose night share is exactly 3%', () => {
      const analysis = analysisOf([
        personStatistics({ name: 'Ana', messageCount: 100, nightMessageCount: 3 }),
      ]);

      expect(findInsight(analysis, 'night owl')).toContain('3.0% of their messages');
    });

    it('is left out when nobody reaches 3%', () => {
      const analysis = analysisOf([
        personStatistics({ name: 'Ana', messageCount: 100, nightMessageCount: 2 }),
      ]);

      expect(findInsight(analysis, 'night owl')).toBeUndefined();
    });
  });

  describe('who sends the most messages in a row', () => {
    it('names the person with the most messages per turn', () => {
      const analysis = analysisOf([
        personStatistics({ name: 'Ana', messageCount: 50, turnCount: 20 }),
        personStatistics({ name: 'Bob', messageCount: 20, turnCount: 20 }),
      ]);

      expect(findInsight(analysis, 'in a row before')).toBe(
        '<b>Ana</b> sends the most messages in a row before anyone answers: 2.5 per turn.',
      );
    });

    it('ignores people with fewer than five turns', () => {
      const analysis = analysisOf([
        personStatistics({ name: 'Ana', messageCount: 40, turnCount: 4 }),
        personStatistics({ name: 'Bob', messageCount: 10, turnCount: 5 }),
      ]);

      expect(findInsight(analysis, 'in a row before')).toContain('<b>Bob</b>');
    });

    it('is left out of a chat with a single sender', () => {
      const analysis = analysisOf([
        personStatistics({ name: 'Ana', messageCount: 50, turnCount: 20 }),
      ]);

      expect(findInsight(analysis, 'in a row before')).toBeUndefined();
    });
  });

  describe('which sentences a chat gets', () => {
    it('gives the smallest possible chat the three sentences that always apply', () => {
      expect(collectInsights(chatAnalysis())).toEqual([
        'The chat is most alive on <b>Mondays around 00:00</b>, with 0 messages in that hour slot.',
        'The quietest day of the week is <b>Monday</b>.',
        'Busiest day: <b>13 Jan 2024</b> with 1 messages.',
      ]);
    });

    it('lists all twelve sentences, in a fixed order, for a chat that qualifies for each', () => {
      const analysis = analysisOf(
        [
          personStatistics({
            name: 'Ana',
            messageCount: 75,
            textMessageCount: 70,
            wordCount: 700,
            laughingMessageCount: 7,
            nightMessageCount: 15,
            turnCount: 25,
            conversationsStartedCount: 6,
            replyDelaysInMilliseconds: fiveRepliesOf(45 * ONE_SECOND),
          }),
          personStatistics({
            name: 'Bob',
            messageCount: 25,
            textMessageCount: 25,
            wordCount: 100,
            turnCount: 25,
            conversationsStartedCount: 2,
            replyDelaysInMilliseconds: fiveRepliesOf(12 * ONE_MINUTE),
          }),
        ],
        {
          conversationCount: 8,
          longestStreak: {
            lengthInDays: 3,
            from: localMidnight('2024-01-11'),
            to: localMidnight('2024-01-13'),
          },
          longestSilence: {
            durationInMilliseconds: 3 * ONE_DAY,
            from: localTime('2024-01-05 10:00'),
            to: localTime('2024-01-08 10:00'),
          },
        },
      );

      const openingWords = collectInsights(analysis).map((sentence) =>
        sentence.replace(/<[^>]+>/g, '').slice(0, 24),
      );

      expect(openingWords).toEqual([
        'Ana writes the most: 75%',
        'The chat is most alive o',
        'The quietest day of the ',
        'Ana replies fastest, typ',
        'Ana starts 75% of the co',
        'Longest streak: 3 days i',
        'Longest silence: 3 days,',
        'Busiest day: 13 Jan 2024',
        'Ana laughs the most in w',
        'Ana writes the longest m',
        'Ana is the night owl: 20',
        'Ana sends the most messa',
      ]);
    });
  });

  describe('names with markup', () => {
    const hostileName = '<img src=x onerror=alert(1)>';
    const analysis = analysisOf(
      [
        personStatistics({
          name: hostileName,
          messageCount: 75,
          textMessageCount: 70,
          wordCount: 700,
          laughingMessageCount: 7,
          nightMessageCount: 15,
          turnCount: 25,
          conversationsStartedCount: 6,
          replyDelaysInMilliseconds: fiveRepliesOf(45 * ONE_SECOND),
        }),
        personStatistics({
          name: '<script>alert(2)</script>',
          messageCount: 25,
          textMessageCount: 25,
          wordCount: 100,
          turnCount: 25,
          conversationsStartedCount: 2,
          replyDelaysInMilliseconds: fiveRepliesOf(12 * ONE_MINUTE),
        }),
      ],
      { conversationCount: 8 },
    );

    it('never appear unescaped in any sentence', () => {
      const sentences = collectInsights(analysis);
      const sentencesNamingSomeone = sentences.filter((sentence) => sentence.includes('&lt;'));

      /* All seven sentences that can name a person do so for this chat, so the check is not an empty one. */
      expect(sentencesNamingSomeone).toHaveLength(7);
      expect(sentences.join('\n')).not.toMatch(/<img|<script/);
    });

    it('create no element when the section is put on the page', () => {
      const section = parseMarkup(renderInsightsSection(analysis));

      expect(section.querySelectorAll('img, script')).toHaveLength(0);
      expect(section.textContent).toContain(`${hostileName} writes the most`);
    });
  });
});

describe('renderInsightsSection', () => {
  it('is headed "What stands out" and lists one item per sentence', () => {
    const analysis = chatAnalysis();
    const section = parseMarkup(renderInsightsSection(analysis));

    expect(textsOfElements(section, '.section-heading h2')).toEqual(['What stands out']);
    expect(section.querySelectorAll('ul.insights > li')).toHaveLength(
      collectInsights(analysis).length,
    );
  });

  it('keeps the emphasis of each sentence', () => {
    const section = parseMarkup(renderInsightsSection(chatAnalysis()));

    expect(textsOfElements(section, 'li b')).toEqual([
      'Mondays around 00:00',
      'Monday',
      '13 Jan 2024',
    ]);
  });
});
