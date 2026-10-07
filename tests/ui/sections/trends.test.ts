// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import type { ChatAnalysis, ChatTrends } from '../../../src/core/types';
import { assignPersonColours } from '../../../src/ui/person-colours';
import {
  MINIMUM_TREND_BUCKETS,
  TERM_TRENDS_SHOWN,
  renderTrendPeopleNote,
  renderTrendsSection,
} from '../../../src/ui/sections/trends';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { findElement, parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';
import { trendsByMonth } from '../../fixtures/trends';
import type { MonthOfAnaAndBob } from '../../fixtures/trends';

/** A month in which Ana writes most and nothing else is special. */
const EARLY_MONTH: MonthOfAnaAndBob = { ana: 80, bob: 20, wordsPerMessage: 8 };

/** A month in which Bob has taken over. */
const LATE_MONTH: MonthOfAnaAndBob = { ana: 20, bob: 80, wordsPerMessage: 8 };

/** Builds the trends of so many months, the first half early ones and the rest late ones. */
function trendsOfMonths(monthCount: number): ChatTrends {
  const months = Array.from({ length: monthCount }, (_month, index) =>
    index < monthCount / 2 ? EARLY_MONTH : LATE_MONTH,
  );
  return trendsByMonth('2024-01', months);
}

/** Builds the analysis of a chat between the people named, with the given trends. */
function chatWith(trends: ChatTrends, names: readonly string[] = ['Ana', 'Bob']): ChatAnalysis {
  return chatAnalysis({
    trends,
    people: names.map((name, index) => personStatistics({ name, messageCount: 1000 - index })),
  });
}

/** Renders the section for an analysis and parses it. */
function renderSection(analysis: ChatAnalysis): HTMLDivElement {
  return parseMarkup(renderTrendsSection(analysis, assignPersonColours(analysis.people)));
}

/** Six months with the five most used words and emojis and three more of each. */
const trendsWithTerms: ChatTrends = {
  ...trendsOfMonths(6),
  wordTrends: ['dinner', 'lisbon', 'train', 'tickets', 'saturday', 'maybe', 'coffee', 'lake'].map(
    (term, index) => ({ term, messageCountsByBucket: [index, 0, 4, 1, 0, 2] }),
  ),
  emojiTrends: ['😂', '👍', '🎉'].map((term) => ({
    term,
    messageCountsByBucket: [1, 1, 1, 0, 0, 3],
  })),
};

describe('renderTrendsSection', () => {
  it('is shown from six buckets on and left out of a chat of five', () => {
    expect(MINIMUM_TREND_BUCKETS).toBe(6);
    expect(textsOfElements(renderSection(chatWith(trendsOfMonths(6))), 'h2')).toEqual([
      'How things changed',
    ]);
    expect(renderTrendsSection(chatWith(trendsOfMonths(5)), new Map())).toBe('');
  });

  it('is left out of a chat so thin that no chart has a line, whatever words it has', () => {
    const thinChat: ChatTrends = {
      ...trendsWithTerms,
      buckets: trendsByMonth(
        '2024-01',
        Array.from({ length: 6 }, () => ({ ana: 2, bob: 1 })),
      ).buckets,
    };

    expect(renderTrendsSection(chatWith(thinChat), new Map())).toBe('');
  });

  it('says which bucket is used and which stretch the charts cover', () => {
    const section = renderSection(chatWith(trendsOfMonths(6)));

    expect(findElement(section, '.section-heading p').textContent).toBe(
      'The habits of the chat month by month, from Jan 2024 to Jun 2024. Hover or tap a chart for the numbers.',
    );
  });

  it('names quarters when the chat is counted by quarter', () => {
    const byQuarter: ChatTrends = { ...trendsOfMonths(6), granularity: 'quarter' };

    const section = renderSection(chatWith(byQuarter));

    expect(findElement(section, '.section-heading p').textContent).toContain(
      'quarter by quarter, from Q1 2024 to Q2 2024',
    );
  });

  it('draws one chart per measure that has a line, each with its sentence', () => {
    const section = renderSection(chatWith(trendsOfMonths(8)));

    expect(textsOfElements(section, '.trend-chart h3')).toEqual([
      'Share of the messages',
      'Words per typed message',
    ]);
    expect(textsOfElements(section, '.trend-reading')).toEqual([
      "Ana's share of the messages went from about 80% in Jan–Feb 2024 to about 20% in Jul–Aug 2024.",
    ]);
  });

  it('states the thresholds and the rule of the sentences under the charts', () => {
    const section = renderSection(chatWith(trendsOfMonths(6)));

    expect(textsOfElements(section, '.trend-charts + .hint')).toEqual([
      'A month has a point when it holds at least 20 messages, and a person a reply time when they replied at least 5 times in it. Reply times are drawn on a scale that grows in steps of times ten. The sentence under a chart compares its first fourth with its last fourth and is left out when the change is small.',
    ]);
  });

  describe('the most used words and emojis', () => {
    it('gives the first five words and the first five emojis a strip each', () => {
      const section = renderSection(chatWith(trendsWithTerms));

      expect(TERM_TRENDS_SHOWN).toBe(5);
      expect(textsOfElements(section, '.term-trends h3')).toEqual([
        'Most used words',
        'Most used emojis',
      ]);
      expect(textsOfElements(section, '.term-trend-name')).toEqual([
        'dinner',
        'lisbon',
        'train',
        'tickets',
        'saturday',
        '😂',
        '👍',
        '🎉',
      ]);
    });

    it('draws one bar per bucket, named by its month, for the messages that contain the word', () => {
      const section = renderSection(chatWith(trendsWithTerms));
      const secondStrip = section.querySelectorAll('.term-trend .bar-strip')[1];

      expect(secondStrip?.getAttribute('aria-label')).toBe(
        'Messages that contain "lisbon" per month, from Jan 2024 to Jun 2024.',
      );
      expect(
        Array.from(secondStrip?.querySelectorAll('.bar-strip-column') ?? [], (column) =>
          column.getAttribute('title'),
        ),
      ).toEqual([
        'Jan 2024: 1 message',
        'Feb 2024: 0 messages',
        'Mar 2024: 4 messages',
        'Apr 2024: 1 message',
        'May 2024: 0 messages',
        'Jun 2024: 2 messages',
      ]);
    });

    it('says how to read the strips', () => {
      const section = renderSection(chatWith(trendsWithTerms));

      expect(textsOfElements(section, '.two-columns + .hint')).toEqual([
        'One bar per month, for the messages that contain the word or the emoji. Each strip is scaled to its own tallest bar, and a busy month has more of everything.',
      ]);
    });

    it('are left out, with their hint, of a chat without a word or an emoji', () => {
      const section = renderSection(chatWith(trendsOfMonths(6)));

      expect(section.querySelector('.term-trends')).toBeNull();
      expect(section.querySelector('.two-columns')).toBeNull();
    });

    it('creates no element from a word made of markup', () => {
      const markupTrends: ChatTrends = {
        ...trendsOfMonths(6),
        wordTrends: [{ term: '<img src=x>', messageCountsByBucket: [1, 0, 0, 0, 0, 1] }],
      };

      const section = renderSection(chatWith(markupTrends));

      expect(tagNamesIn(section)).not.toContain('img');
      expect(textsOfElements(section, '.term-trend-name')).toEqual(['<img src=x>']);
    });
  });

  describe('in a large group', () => {
    const names = ['Ana', 'Bob', 'Carla', 'Dani', 'Marta', 'Diego', 'Elena', 'Félix'];

    it('says that six people have a line and the others are merged', () => {
      const section = renderSection(chatWith(trendsOfMonths(6), names));

      expect(textsOfElements(section, '.people-shown-note')).toEqual([
        'The 6 most active of 8 people have a line each. The other 2 are added up as "Others" in the share of the messages and have no line for reply times.',
      ]);
    });

    it('needs no note when everybody has a line', () => {
      expect(renderTrendPeopleNote(6)).toBe('');
      expect(
        renderSection(chatWith(trendsOfMonths(6))).querySelector('.people-shown-note'),
      ).toBeNull();
    });
  });
});
