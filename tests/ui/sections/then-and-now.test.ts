// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { assignPersonColours } from '../../../src/ui/person-colours';
import {
  describeComparisonPeriods,
  formatShareChange,
  renderThenAndNowSection,
} from '../../../src/ui/sections/then-and-now';
import type { ChatAnalysis } from '../../../src/core/types';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis): HTMLDivElement {
  return parseMarkup(renderThenAndNowSection(analysis, assignPersonColours(analysis.people)));
}

/**
 * Reads the body of the table as rows of cell texts.
 */
function readTableRows(section: ParentNode): string[][] {
  return Array.from(section.querySelectorAll('tbody tr'), (row) => textsOfElements(row, 'td'));
}

/** Ana wrote most of the first year; Bob took over in the latest one. */
const anaAndBob = chatAnalysis({
  comparisonPeriodInDays: 365,
  people: [
    personStatistics({
      name: 'Ana',
      messageCount: 60,
      earlyMessageCount: 75,
      recentMessageCount: 10,
    }),
    personStatistics({
      name: 'Bob',
      messageCount: 40,
      earlyMessageCount: 25,
      recentMessageCount: 30,
    }),
  ],
});

describe('describeComparisonPeriods', () => {
  it('calls a period of 365 days a year', () => {
    expect(describeComparisonPeriods(365)).toEqual({ early: 'First year', recent: 'Latest year' });
  });

  it('counts the days of a shorter period', () => {
    expect(describeComparisonPeriods(90)).toEqual({
      early: 'First 90 days',
      recent: 'Latest 90 days',
    });
  });
});

describe('formatShareChange', () => {
  it.each([
    { earlyShare: 0.12, recentShare: 0.34, expected: '+22 pts' },
    { earlyShare: 0.34, recentShare: 0.12, expected: '−22 pts' },
    { earlyShare: 0, recentShare: 1, expected: '+100 pts' },
    { earlyShare: 0.5, recentShare: 0.5, expected: 'no change' },
    { earlyShare: 0.5, recentShare: 0.504, expected: 'no change' },
    { earlyShare: 0.5, recentShare: 0.505, expected: '+1 pts' },
    { earlyShare: 0.5, recentShare: 0.496, expected: 'no change' },
  ])(
    'writes the change from $earlyShare to $recentShare as "$expected"',
    ({ earlyShare, recentShare, expected }) => {
      expect(formatShareChange(earlyShare, recentShare)).toBe(expected);
    },
  );
});

describe('renderThenAndNowSection', () => {
  it('is left out of a chat with a single sender', () => {
    const monologue = chatAnalysis({
      comparisonPeriodInDays: 365,
      people: [personStatistics({ name: 'Ana', messageCount: 3, earlyMessageCount: 2 })],
    });

    expect(renderThenAndNowSection(monologue, assignPersonColours(monologue.people))).toBe('');
  });

  it('is left out of a chat too short to compare', () => {
    const shortChat = chatAnalysis({
      comparisonPeriodInDays: 0,
      people: [
        personStatistics({ name: 'Ana', messageCount: 3 }),
        personStatistics({ name: 'Bob', messageCount: 2 }),
      ],
    });

    expect(renderThenAndNowSection(shortChat, assignPersonColours(shortChat.people))).toBe('');
  });

  it('is headed "Then and now" and names the two periods', () => {
    const section = renderSection(anaAndBob);

    expect(textsOfElements(section, '.section-heading h2')).toEqual(['Then and now']);
    expect(textsOfElements(section, 'thead th')).toEqual([
      'Person',
      'First year',
      'Latest year',
      'Change',
    ]);
  });

  it('shows the share of each person in both periods and the change between them', () => {
    expect(readTableRows(renderSection(anaAndBob))).toEqual([
      ['Ana', '75%', '25%', '−50 pts'],
      ['Bob', '25%', '75%', '+50 pts'],
    ]);
  });

  it('names periods shorter than a year by their length in days', () => {
    const fourMonths = chatAnalysis({ ...anaAndBob, comparisonPeriodInDays: 60 });

    expect(textsOfElements(renderSection(fourMonths), 'thead th')).toEqual([
      'Person',
      'First 60 days',
      'Latest 60 days',
      'Change',
    ]);
  });

  it('measures the shares against everybody, also the people a large group does not show', () => {
    const names = ['Ana', 'Bob', 'Carla', 'Dani', 'Eva', 'Fede', 'Gabi', 'Hugo', 'Ines', 'Juan'];
    const largeGroup = chatAnalysis({
      comparisonPeriodInDays: 365,
      people: names.map((name, index) =>
        personStatistics({
          name,
          messageCount: 100 - index,
          earlyMessageCount: 10,
          recentMessageCount: 10,
        }),
      ),
    });

    const rows = readTableRows(renderSection(largeGroup));

    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual(['Ana', '10%', '10%', 'no change']);
  });

  it('shows zero for a period in which nobody wrote', () => {
    const emptyRecentPeriod = chatAnalysis({
      comparisonPeriodInDays: 365,
      people: [
        personStatistics({ name: 'Ana', messageCount: 2, earlyMessageCount: 1 }),
        personStatistics({ name: 'Bob', messageCount: 1, earlyMessageCount: 1 }),
      ],
    });

    expect(readTableRows(renderSection(emptyRecentPeriod))[0]).toEqual([
      'Ana',
      '50%',
      '0.0%',
      '−50 pts',
    ]);
  });

  it('writes a name that is markup as text', () => {
    const hostileName = '<img src=x onerror=alert(1)>';
    const hostileChat = chatAnalysis({
      comparisonPeriodInDays: 365,
      people: [
        personStatistics({ name: hostileName, messageCount: 2, earlyMessageCount: 1 }),
        personStatistics({ name: 'Bob', messageCount: 1, recentMessageCount: 1 }),
      ],
    });

    const section = renderSection(hostileChat);

    expect(tagNamesIn(section)).not.toContain('img');
    expect(readTableRows(section)[0]?.[0]).toBe(hostileName);
  });
});
