// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { assignPersonColours } from '../../../src/ui/person-colours';
import {
  renderChatHeading,
  renderHeadlineStatistics,
  renderSummarySection,
} from '../../../src/ui/sections/summary';
import type { ChatAnalysis } from '../../../src/core/types';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { localTime } from '../../fixtures/messages';
import { findElement, parseMarkup, textsOfElements } from '../../fixtures/markup';

/** Eight invented names, in order of activity. */
const EIGHT_NAMES = ['Ana', 'Bob', 'Carla', 'Dani', 'Eva', 'Fede', 'Gus', 'Hugo'];

/**
 * Builds the analysis of a group chat with the first few of the eight names.
 */
function analysisWithPeople(peopleCount: number): ChatAnalysis {
  const people = EIGHT_NAMES.slice(0, peopleCount).map((name) =>
    personStatistics({ name, messageCount: 1 }),
  );
  return chatAnalysis({ people });
}

/**
 * Renders the heading of a chat and parses it.
 */
function renderHeading(analysis: ChatAnalysis, title = 'Family group'): HTMLDivElement {
  return parseMarkup(renderChatHeading(analysis, title, assignPersonColours(analysis.people)));
}

/**
 * Reads the headline numbers as pairs of value and caption.
 */
function readStatistics(analysis: ChatAnalysis): [string, string][] {
  const statistics = parseMarkup(renderHeadlineStatistics(analysis)).querySelectorAll(
    '.headline-statistic',
  );
  return Array.from(statistics, (statistic) => [
    findElement(statistic, 'b').textContent,
    findElement(statistic, 'span').textContent,
  ]);
}

describe('renderChatHeading', () => {
  describe('title', () => {
    it('shows the title as the heading', () => {
      const heading = renderHeading(chatAnalysis(), 'Family group');

      expect(textsOfElements(heading, 'h2')).toEqual(['Family group']);
    });

    it('shows a title with markup as text', () => {
      const heading = renderHeading(chatAnalysis(), '<img src=x onerror=alert(1)>');

      expect(heading.querySelectorAll('img')).toHaveLength(0);
      expect(textsOfElements(heading, 'h2')).toEqual(['<img src=x onerror=alert(1)>']);
    });
  });

  describe('period', () => {
    it('gives the first and last day and the number of days between them', () => {
      const analysis = chatAnalysis({
        firstMessageTimestamp: localTime('2026-01-05 08:44'),
        lastMessageTimestamp: localTime('2026-10-03 18:16'),
        spanInDays: 272,
      });

      expect(textsOfElements(renderHeading(analysis), '.chat-period')).toEqual([
        '5 Jan 2026 to 3 Oct 2026 · 272 days',
      ]);
    });

    it('says "1 day" for a chat that starts and ends on the same day', () => {
      const analysis = chatAnalysis({ spanInDays: 1 });

      expect(textsOfElements(renderHeading(analysis), '.chat-period')).toEqual([
        '13 Jan 2024 to 13 Jan 2024 · 1 day',
      ]);
    });

    it('groups the digits of a long span', () => {
      const analysis = chatAnalysis({ spanInDays: 3650 });

      expect(findElement(renderHeading(analysis), '.chat-period').textContent).toContain(
        '3,650 days',
      );
    });
  });

  describe('legend', () => {
    it('lists each person with a swatch in their colour', () => {
      const legend = findElement(renderHeading(analysisWithPeople(2)), '.legend');

      expect(legend.innerHTML).toBe(
        '<span><i class="colour-swatch" style="background:var(--s1)"></i>Ana</span>' +
          '<span><i class="colour-swatch" style="background:var(--s2)"></i>Bob</span>',
      );
    });

    it('lists six people without an entry for others', () => {
      const heading = renderHeading(analysisWithPeople(6));

      expect(textsOfElements(heading, '.legend span')).toEqual(EIGHT_NAMES.slice(0, 6));
    });

    it('lists the first six of eight people and counts the rest as "2 others"', () => {
      const heading = renderHeading(analysisWithPeople(8));

      expect(textsOfElements(heading, '.legend span')).toEqual([
        'Ana',
        'Bob',
        'Carla',
        'Dani',
        'Eva',
        'Fede',
        '2 others',
      ]);
    });

    it('draws the entry for the others in the muted colour', () => {
      const heading = renderHeading(analysisWithPeople(8));
      const othersSwatch = findElement(heading, '.legend span:last-child .colour-swatch');

      expect(othersSwatch.getAttribute('style')).toBe('background:var(--other)');
    });

    it('writes "1 others" for a single extra person, wording kept from the original page', () => {
      const heading = renderHeading(analysisWithPeople(7));

      expect(findElement(heading, '.legend span:last-child').textContent).toBe('1 others');
    });

    it('shows a name with markup as text', () => {
      const analysis = chatAnalysis({
        people: [personStatistics({ name: '<script>alert(1)</script>', messageCount: 1 })],
      });
      const heading = renderHeading(analysis);

      expect(heading.querySelectorAll('script')).toHaveLength(0);
      expect(textsOfElements(heading, '.legend span')).toEqual(['<script>alert(1)</script>']);
    });
  });
});

describe('renderHeadlineStatistics', () => {
  it('shows six numbers with their captions, in a fixed order', () => {
    const analysis = chatAnalysis({
      people: [
        personStatistics({ name: 'Ana', messageCount: 1500, wordCount: 9000, mediaCount: 70 }),
        personStatistics({ name: 'Bob', messageCount: 900, wordCount: 3345, mediaCount: 50 }),
      ],
      activeDayCount: 200,
      spanInDays: 272,
      conversationCount: 226,
    });

    expect(readStatistics(analysis)).toEqual([
      ['2,400', 'messages'],
      ['12,345', 'words'],
      ['200', 'active days of 272'],
      ['12.0', 'messages per active day'],
      ['226', 'conversations'],
      ['120', 'photos, audios and files'],
    ]);
  });

  it('shows the messages per active day with one decimal', () => {
    const analysis = chatAnalysis({
      people: [personStatistics({ name: 'Ana', messageCount: 10 })],
      activeDayCount: 3,
    });

    expect(readStatistics(analysis)[3]).toEqual(['3.3', 'messages per active day']);
  });

  it('shows zeros for a chat without words or media', () => {
    const statistics = readStatistics(chatAnalysis());

    expect(statistics[1]).toEqual(['0', 'words']);
    expect(statistics[5]).toEqual(['0', 'photos, audios and files']);
  });
});

describe('renderSummarySection', () => {
  it('puts the heading before the headline numbers', () => {
    const analysis = chatAnalysis();
    const summary = parseMarkup(
      renderSummarySection(analysis, 'Family group', assignPersonColours(analysis.people)),
    );

    const classNames = Array.from(summary.children, (child) => child.className);

    expect(classNames).toEqual(['chat-heading', 'headline-statistics']);
  });
});
