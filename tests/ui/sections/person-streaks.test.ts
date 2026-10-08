// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import type { ChatAnalysis, PersonStatistics } from '../../../src/core/types';
import { assignPersonColours } from '../../../src/ui/person-colours';
import type { PeopleShown } from '../../../src/ui/sections/featured-people';
import {
  SHORTEST_SPAN_FOR_STREAKS_IN_DAYS,
  areStreaksWorthShowing,
  formatStreakDates,
  formatStreakLength,
  renderPersonStreaksSection,
  sortByLongestStreak,
} from '../../../src/ui/sections/person-streaks';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { localMidnight } from '../../fixtures/messages';
import { parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';

/**
 * Builds a person whose longest streak ran from one local day for a number of
 * days, and who wrote on a given number of days in all.
 */
function personWithStreak(
  name: string,
  messageCount: number,
  firstDay: string,
  lastDay: string,
  lengthInDays: number,
  activeDayCount: number,
): PersonStatistics {
  return personStatistics({
    name,
    messageCount,
    activeDayCount,
    longestStreak: { lengthInDays, from: localMidnight(firstDay), to: localMidnight(lastDay) },
  });
}

const ana = personWithStreak('Ana', 900, '2024-03-03', '2024-03-14', 12, 150);
const bob = personWithStreak('Bob', 500, '2024-01-01', '2024-01-30', 30, 100);
const carla = personWithStreak('Carla', 20, '2024-05-05', '2024-05-05', 1, 8);

/** A chat of two hundred days between Ana, Bob and Carla, most messages first. */
const group = chatAnalysis({ people: [ana, bob, carla], spanInDays: 200 });

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis, peopleShown?: PeopleShown): HTMLDivElement {
  return parseMarkup(
    renderPersonStreaksSection(analysis, assignPersonColours(analysis.people), peopleShown),
  );
}

/**
 * Reads the table of the section as rows of cell texts.
 */
function readTableRows(section: ParentNode): string[][] {
  return Array.from(section.querySelectorAll('tbody tr'), (row) => textsOfElements(row, 'td'));
}

describe('areStreaksWorthShowing', () => {
  it('needs more than one sender', () => {
    expect(areStreaksWorthShowing(chatAnalysis({ people: [ana], spanInDays: 200 }))).toBe(false);
  });

  it('needs a chat of at least fourteen days', () => {
    expect(SHORTEST_SPAN_FOR_STREAKS_IN_DAYS).toBe(14);
    expect(areStreaksWorthShowing(chatAnalysis({ people: [ana, bob], spanInDays: 13 }))).toBe(
      false,
    );
    expect(areStreaksWorthShowing(chatAnalysis({ people: [ana, bob], spanInDays: 14 }))).toBe(true);
  });
});

describe('formatStreakLength', () => {
  it('writes one day in the singular and more in the plural', () => {
    expect(formatStreakLength(carla.longestStreak)).toBe('1 day');
    expect(formatStreakLength(ana.longestStreak)).toBe('12 days');
  });
});

describe('formatStreakDates', () => {
  it('writes the first and the last day of a run', () => {
    expect(formatStreakDates(ana.longestStreak)).toBe('3 Mar 2024 to 14 Mar 2024');
  });

  it('writes the one date of a run of a single day', () => {
    expect(formatStreakDates(carla.longestStreak)).toBe('5 May 2024');
  });
});

describe('sortByLongestStreak', () => {
  it('puts the longest streak first', () => {
    const sortedPeople = sortByLongestStreak([ana, bob, carla]);

    expect(sortedPeople.map((person) => person.name)).toEqual(['Bob', 'Ana', 'Carla']);
  });

  it('keeps people with equally long streaks in their order', () => {
    const dani = personWithStreak('Dani', 5, '2024-06-01', '2024-06-12', 12, 12);

    const sortedPeople = sortByLongestStreak([carla, ana, dani]);

    expect(sortedPeople.map((person) => person.name)).toEqual(['Ana', 'Dani', 'Carla']);
  });

  it('leaves the given list in its order', () => {
    const people = [ana, bob];

    sortByLongestStreak(people);

    expect(people.map((person) => person.name)).toEqual(['Ana', 'Bob']);
  });
});

describe('renderPersonStreaksSection', () => {
  it('is headed "Who shows up" with a line that names the span of the chat', () => {
    const section = renderSection(group);

    expect(textsOfElements(section, '.section-heading h2')).toEqual(['Who shows up']);
    expect(textsOfElements(section, '.section-heading p')).toEqual([
      'Each person’s longest run of days in a row with at least one message of their own, and on how many of the 200 days the chat spans they wrote at all.',
    ]);
  });

  it('has a column for the streak, its dates, the days active and their share', () => {
    expect(textsOfElements(renderSection(group), 'thead th')).toEqual([
      'Person',
      'Longest streak',
      'When',
      'Days active',
      'Share of days',
    ]);
  });

  it('lists each person with their numbers, the longest streak first', () => {
    expect(readTableRows(renderSection(group))).toEqual([
      ['Bob', '30 days', '1 Jan 2024 to 30 Jan 2024', '100', '50%'],
      ['Ana', '12 days', '3 Mar 2024 to 14 Mar 2024', '150', '75%'],
      ['Carla', '1 day', '5 May 2024', '8', '4.0%'],
    ]);
  });

  it('is empty for a chat with a single sender', () => {
    expect(renderSection(chatAnalysis({ people: [ana], spanInDays: 200 })).innerHTML).toBe('');
  });

  it('is empty for a chat of under fourteen days', () => {
    expect(renderSection(chatAnalysis({ people: [ana, bob], spanInDays: 13 })).innerHTML).toBe('');
  });

  it('lists the most active people only by default, and says so', () => {
    const tenPeople = Array.from({ length: 10 }, (_unused, index) =>
      personWithStreak(
        `Person ${String(index + 1)}`,
        100 - index,
        '2024-01-01',
        '2024-01-02',
        2,
        5,
      ),
    );
    const largeGroup = chatAnalysis({ people: tenPeople, spanInDays: 200 });

    const section = renderSection(largeGroup);

    expect(readTableRows(section)).toHaveLength(8);
    expect(textsOfElements(section, '.people-shown-note')).toEqual([
      'Showing the 8 most active of 10 people.',
    ]);
    expect(readTableRows(renderSection(largeGroup, 'everyone'))).toHaveLength(10);
  });

  it('shows a name made of markup as text', () => {
    const hostile = personWithStreak(
      '<img src=x onerror=alert(1)>',
      5,
      '2024-01-01',
      '2024-01-01',
      1,
      1,
    );

    const section = renderSection(chatAnalysis({ people: [ana, hostile], spanInDays: 200 }));

    expect(tagNamesIn(section)).not.toContain('img');
    expect(section.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
