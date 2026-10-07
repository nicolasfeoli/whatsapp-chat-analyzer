// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { assignPersonColours } from '../../../src/ui/person-colours';
import {
  GONE_QUIET_LABEL,
  STILL_WRITING_LABEL,
  countSilentDaysAtEnd,
  formatSilence,
  hasGoneQuiet,
  isPresenceWorthShowing,
  renderWhoIsStillHereSection,
  sortByLastMessage,
} from '../../../src/ui/sections/who-is-still-here';
import type { ChatAnalysis, PersonStatistics } from '../../../src/core/types';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { localTime } from '../../fixtures/messages';
import { parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';

/**
 * Builds a person who wrote from one local day to another.
 */
function personWriting(
  name: string,
  messageCount: number,
  firstDay: string,
  lastDay: string,
): PersonStatistics {
  return personStatistics({
    name,
    messageCount,
    firstMessageTimestamp: localTime(`${firstDay} 09:00`),
    lastMessageTimestamp: localTime(`${lastDay} 21:30`),
  });
}

/**
 * Builds a chat that runs from 1 January 2024 to a last day, both included,
 * between the people given.
 */
function chatUntil(
  lastDay: string,
  spanInDays: number,
  people: readonly PersonStatistics[],
): ChatAnalysis {
  return chatAnalysis({
    people,
    spanInDays,
    firstMessageTimestamp: localTime('2024-01-01 09:00'),
    lastMessageTimestamp: localTime(`${lastDay} 22:00`),
  });
}

/**
 * A chat of the whole of 2024 (366 days). Ana and Bob write to the end, Dani
 * stopped ten days before it, and Carla stopped on 14 March.
 */
const yearLongChat = chatUntil('2024-12-31', 366, [
  personWriting('Ana', 400, '2024-01-01', '2024-12-31'),
  personWriting('Carla', 300, '2024-01-02', '2024-03-14'),
  personWriting('Bob', 200, '2024-02-10', '2024-12-30'),
  personWriting('Dani', 100, '2024-01-05', '2024-12-21'),
]);

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis): HTMLDivElement {
  return parseMarkup(renderWhoIsStillHereSection(analysis, assignPersonColours(analysis.people)));
}

/**
 * Reads the body of the table as rows of cell texts.
 */
function readTableRows(section: ParentNode): string[][] {
  return Array.from(section.querySelectorAll('tbody tr'), (row) => textsOfElements(row, 'td'));
}

/**
 * Finds a person of a chat by name and fails the test when they are missing.
 */
function personOf(analysis: ChatAnalysis, name: string): PersonStatistics {
  const person = analysis.people.find((candidate) => candidate.name === name);
  if (person === undefined) {
    throw new Error(`No participant called ${name}`);
  }
  return person;
}

describe('countSilentDaysAtEnd', () => {
  it('is zero for somebody who wrote on the last day of the chat, at any time of it', () => {
    expect(countSilentDaysAtEnd(personOf(yearLongChat, 'Ana'), yearLongChat)).toBe(0);
  });

  it('counts calendar days, so the evening before the last day is one day', () => {
    /* Bob last wrote on 30 December at 21:30; the chat ends on 31 December at 22:00. */
    expect(countSilentDaysAtEnd(personOf(yearLongChat, 'Bob'), yearLongChat)).toBe(1);
  });

  it('counts the days from the last message to the end of the chat', () => {
    /* 14 March to 31 December 2024: 17 days left in March, then 275 from April to December. */
    expect(countSilentDaysAtEnd(personOf(yearLongChat, 'Carla'), yearLongChat)).toBe(292);
  });
});

describe('formatSilence', () => {
  it.each([
    { silentDays: 0, expected: 'none' },
    { silentDays: 1, expected: '1 day' },
    { silentDays: 59, expected: '59 days' },
    /* 60 / 30.4375 = 1.97 */
    { silentDays: 60, expected: '2 months' },
    /* 292 / 30.4375 = 9.59 */
    { silentDays: 292, expected: '10 months' },
    /* 729 / 30.4375 = 23.95 */
    { silentDays: 729, expected: '24 months' },
    /* 730 / 365.25 = 2.00 */
    { silentDays: 730, expected: '2.0 years' },
    /* 1,200 / 365.25 = 3.29 */
    { silentDays: 1200, expected: '3.3 years' },
  ])('writes $silentDays days as "$expected"', ({ silentDays, expected }) => {
    expect(formatSilence(silentDays)).toBe(expected);
  });
});

describe('isPresenceWorthShowing', () => {
  const ana = personWriting('Ana', 5, '2024-01-01', '2024-06-28');
  const bob = personWriting('Bob', 3, '2024-01-01', '2024-01-02');

  it('is true from a span of 180 days', () => {
    /* 1 January to 28 June 2024, both included: 31 + 29 + 31 + 30 + 31 + 28 = 180 days. */
    expect(isPresenceWorthShowing(chatUntil('2024-06-28', 180, [ana, bob]))).toBe(true);
  });

  it('is false for a span of 179 days', () => {
    expect(isPresenceWorthShowing(chatUntil('2024-06-27', 179, [ana, bob]))).toBe(false);
  });

  it('is false for a single sender, however long they wrote', () => {
    expect(isPresenceWorthShowing(chatUntil('2024-12-31', 366, [ana]))).toBe(false);
  });
});

describe('hasGoneQuiet', () => {
  it('is false for somebody silent for exactly 90 days', () => {
    /* 2 October to 31 December 2024: 29 + 30 + 31 = 90 days. */
    const chat = chatUntil('2024-12-31', 366, [
      personWriting('Ana', 5, '2024-01-01', '2024-12-31'),
      personWriting('Bob', 3, '2024-01-01', '2024-10-02'),
    ]);

    expect(hasGoneQuiet(personOf(chat, 'Bob'), chat)).toBe(false);
  });

  it('is true for somebody silent for 91 days', () => {
    const chat = chatUntil('2024-12-31', 366, [
      personWriting('Ana', 5, '2024-01-01', '2024-12-31'),
      personWriting('Bob', 3, '2024-01-01', '2024-10-01'),
    ]);

    expect(hasGoneQuiet(personOf(chat, 'Bob'), chat)).toBe(true);
  });

  describe('in a chat of ten years, where a tenth of the span is longer than 90 days', () => {
    /* 1 January 2015 to 31 December 2024 is 3,653 days; a tenth of it is 365.3 days. */
    const SPAN_IN_DAYS = 3653;

    it('is false for somebody silent for 365 days, a little under a tenth', () => {
      /* 2024 is a leap year, so 1 January to 31 December is 365 days. */
      const chat = chatUntil('2024-12-31', SPAN_IN_DAYS, [
        personWriting('Ana', 5, '2015-01-01', '2024-12-31'),
        personWriting('Bob', 3, '2015-01-01', '2024-01-01'),
      ]);

      expect(countSilentDaysAtEnd(personOf(chat, 'Bob'), chat)).toBe(365);
      expect(hasGoneQuiet(personOf(chat, 'Bob'), chat)).toBe(false);
    });

    it('is true for somebody silent for 366 days, a little over a tenth', () => {
      const chat = chatUntil('2024-12-31', SPAN_IN_DAYS, [
        personWriting('Ana', 5, '2015-01-01', '2024-12-31'),
        personWriting('Bob', 3, '2015-01-01', '2023-12-31'),
      ]);

      expect(hasGoneQuiet(personOf(chat, 'Bob'), chat)).toBe(true);
    });
  });

  it('is false for everybody in a chat too short to judge', () => {
    /* A chat of 150 days in which Bob only wrote on the first two: silent for 148 days. */
    const chat = chatUntil('2024-05-29', 150, [
      personWriting('Ana', 5, '2024-01-01', '2024-05-29'),
      personWriting('Bob', 3, '2024-01-01', '2024-01-02'),
    ]);

    expect(countSilentDaysAtEnd(personOf(chat, 'Bob'), chat)).toBe(148);
    expect(hasGoneQuiet(personOf(chat, 'Bob'), chat)).toBe(false);
  });
});

describe('sortByLastMessage', () => {
  it('puts whoever wrote most recently first', () => {
    const names = sortByLastMessage(yearLongChat.people).map((person) => person.name);

    expect(names).toEqual(['Ana', 'Bob', 'Dani', 'Carla']);
  });

  it('keeps people who last wrote at the same moment in their order', () => {
    const people = [
      personWriting('Ana', 5, '2024-01-01', '2024-03-01'),
      personWriting('Bob', 3, '2024-01-01', '2024-03-01'),
      personWriting('Carla', 1, '2024-01-01', '2024-03-01'),
    ];

    expect(sortByLastMessage(people).map((person) => person.name)).toEqual(['Ana', 'Bob', 'Carla']);
  });

  it('does not reorder the list it was given', () => {
    sortByLastMessage(yearLongChat.people);

    expect(yearLongChat.people.map((person) => person.name)).toEqual([
      'Ana',
      'Carla',
      'Bob',
      'Dani',
    ]);
  });
});

describe('renderWhoIsStillHereSection', () => {
  it('is left out of a chat with a single sender', () => {
    const monologue = chatUntil('2024-12-31', 366, [
      personWriting('Ana', 5, '2024-01-01', '2024-12-31'),
    ]);

    expect(renderWhoIsStillHereSection(monologue, assignPersonColours(monologue.people))).toBe('');
  });

  it('is left out of a chat spanning fewer than 180 days', () => {
    const shortChat = chatUntil('2024-06-27', 179, [
      personWriting('Ana', 5, '2024-01-01', '2024-06-27'),
      personWriting('Bob', 3, '2024-01-01', '2024-01-02'),
    ]);

    expect(renderWhoIsStillHereSection(shortChat, assignPersonColours(shortChat.people))).toBe('');
  });

  it('is headed "Who is still here" and names its columns', () => {
    const section = renderSection(yearLongChat);

    expect(textsOfElements(section, '.section-heading h2')).toEqual(['Who is still here']);
    expect(textsOfElements(section, 'thead th')).toEqual([
      'Person',
      'First message',
      'Last message',
      'Silent at the end',
      'Status',
    ]);
  });

  it('lists each person with their first and last day, the most recent first', () => {
    expect(readTableRows(renderSection(yearLongChat))).toEqual([
      ['Ana', '1 Jan 2024', '31 Dec 2024', 'none', STILL_WRITING_LABEL],
      ['Bob', '10 Feb 2024', '30 Dec 2024', '1 day', STILL_WRITING_LABEL],
      ['Dani', '5 Jan 2024', '21 Dec 2024', '10 days', STILL_WRITING_LABEL],
      ['Carla', '2 Jan 2024', '14 Mar 2024', '10 months', GONE_QUIET_LABEL],
    ]);
  });

  it('says in words who has gone quiet, not by colour alone', () => {
    const section = renderSection(yearLongChat);

    expect(textsOfElements(section, 'td.presence-gone-quiet')).toEqual(['Gone quiet']);
    expect(textsOfElements(section, 'tbody td:last-child')).toEqual([
      'Still writing',
      'Still writing',
      'Still writing',
      'Gone quiet',
    ]);
  });

  it('says what "gone quiet" means and when the chat ends', () => {
    const section = renderSection(yearLongChat);

    expect(textsOfElements(section, 'p.hint')).toEqual([
      '“Gone quiet” means no message for more than 90 days and for at least the last tenth of ' +
        'the chat, counted back from its last message on 31 Dec 2024. It does not mean somebody ' +
        'left the group, which the page does not read from an export.',
    ]);
  });

  it('lists the eight most active of a large group, ordered by last message, and says so', () => {
    const names = ['Ana', 'Bob', 'Carla', 'Dani', 'Eva', 'Fede', 'Gabi', 'Hugo', 'Ines', 'Juan'];
    /* The more somebody wrote, the earlier in December they stopped: Ana on the 1st, Juan on the 10th. */
    const largeGroup = chatUntil(
      '2024-12-31',
      366,
      names.map((name, index) =>
        personWriting(
          name,
          100 - index,
          '2024-01-01',
          `2024-12-${String(index + 1).padStart(2, '0')}`,
        ),
      ),
    );

    const section = renderSection(largeGroup);

    expect(readTableRows(section).map((row) => row[0])).toEqual([
      'Hugo',
      'Gabi',
      'Fede',
      'Eva',
      'Dani',
      'Carla',
      'Bob',
      'Ana',
    ]);
    expect(textsOfElements(section, '.people-shown-note')).toEqual([
      'Showing the 8 most active of 10 people.',
    ]);
  });

  it('lists everyone when asked to', () => {
    const names = ['Ana', 'Bob', 'Carla', 'Dani', 'Eva', 'Fede', 'Gabi', 'Hugo', 'Ines', 'Juan'];
    const largeGroup = chatUntil(
      '2024-12-31',
      366,
      names.map((name, index) => personWriting(name, 100 - index, '2024-01-01', '2024-12-31')),
    );

    const section = parseMarkup(
      renderWhoIsStillHereSection(largeGroup, assignPersonColours(largeGroup.people), 'everyone'),
    );

    expect(readTableRows(section)).toHaveLength(10);
    expect(textsOfElements(section, '.people-shown-note')).toEqual([]);
  });

  it('writes a name that is markup as text', () => {
    const hostileName = '<img src=x onerror=alert(1)>';
    const hostileChat = chatUntil('2024-12-31', 366, [
      personWriting(hostileName, 5, '2024-01-01', '2024-12-31'),
      personWriting('Bob', 3, '2024-01-01', '2024-06-01'),
    ]);

    const section = renderSection(hostileChat);

    expect(tagNamesIn(section)).not.toContain('img');
    expect(readTableRows(section)[0]?.[0]).toBe(hostileName);
  });
});
