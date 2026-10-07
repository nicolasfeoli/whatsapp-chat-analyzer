// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { assignPersonColours } from '../../../src/ui/person-colours';
import type { PeopleShown } from '../../../src/ui/sections/featured-people';
import {
  MINIMUM_MESSAGES_FOR_PEAK_TIMES,
  TOO_FEW_MESSAGES_LABEL,
  describePeakTimes,
  findPeakTimes,
  hasPeakTimesWorthShowing,
  renderPeakTimesSection,
} from '../../../src/ui/sections/peak-times';
import type { ChatAnalysis, PersonStatistics } from '../../../src/core/types';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { findElement, parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';

/** The rows of the weekday counts: Monday is 0, Sunday is 6. */
const TUESDAY = 1;
const SATURDAY = 5;
const SUNDAY = 6;

/** One slot of a person's week or day and the messages they sent in it. */
interface BusySlot {
  /** The weekday (0 for Monday) or the hour of the day (0 to 23). */
  readonly index: number;
  readonly messageCount: number;
}

/**
 * Builds a list of counts that is zero except for the slots given.
 */
function countsWith(length: number, slots: readonly BusySlot[]): number[] {
  const counts = new Array<number>(length).fill(0);
  for (const slot of slots) {
    counts[slot.index] = slot.messageCount;
  }
  return counts;
}

/**
 * Builds a person from the messages they sent on some weekdays and in some
 * hours. Both lists must add up to the same number, which becomes the
 * person's message count.
 */
function personWritingIn(
  name: string,
  weekdays: readonly BusySlot[],
  hours: readonly BusySlot[],
): PersonStatistics {
  const messageCountsByWeekday = countsWith(7, weekdays);
  return personStatistics({
    name,
    messageCount: messageCountsByWeekday.reduce((total, count) => total + count, 0),
    messageCountsByWeekday,
    messageCountsByHour: countsWith(24, hours),
  });
}

/** Ana sent 200 messages: 80 of them on Sundays, and 50 of them between 23:00 and 23:59. */
const ana = personWritingIn(
  'Ana',
  [
    { index: SUNDAY, messageCount: 80 },
    { index: TUESDAY, messageCount: 60 },
    { index: SATURDAY, messageCount: 60 },
  ],
  [
    { index: 23, messageCount: 50 },
    { index: 9, messageCount: 40 },
    { index: 14, messageCount: 110 },
  ],
);

/** Bob sent 100 messages, all of them on Tuesdays between 07:00 and 07:59. */
const bob = personWritingIn(
  'Bob',
  [{ index: TUESDAY, messageCount: 100 }],
  [{ index: 7, messageCount: 100 }],
);

/** Carla sent 99 messages, one too few to be placed. */
const carla = personWritingIn(
  'Carla',
  [{ index: SATURDAY, messageCount: 99 }],
  [{ index: 20, messageCount: 99 }],
);

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis, peopleShown?: PeopleShown): HTMLDivElement {
  return parseMarkup(
    renderPeakTimesSection(analysis, assignPersonColours(analysis.people), peopleShown),
  );
}

/**
 * Reads the body of the table as rows of cell texts.
 */
function readTableRows(section: ParentNode): string[][] {
  return Array.from(section.querySelectorAll('tbody tr'), (row) => textsOfElements(row, 'td'));
}

describe('findPeakTimes', () => {
  it('finds the weekday and the hour with the most messages, each on its own', () => {
    /* Ana's busiest hour is 14:00 with 110 of 200 messages; her busiest weekday is Sunday with 80. */
    expect(findPeakTimes(ana)).toEqual({
      weekdayIndex: SUNDAY,
      weekdayShare: 0.4,
      hour: 14,
      hourShare: 0.55,
    });
  });

  it('places somebody with exactly 100 messages', () => {
    expect(bob.messageCount).toBe(MINIMUM_MESSAGES_FOR_PEAK_TIMES);
    expect(findPeakTimes(bob)).toEqual({
      weekdayIndex: TUESDAY,
      weekdayShare: 1,
      hour: 7,
      hourShare: 1,
    });
  });

  it('places nobody with 99 messages', () => {
    expect(carla.messageCount).toBe(MINIMUM_MESSAGES_FOR_PEAK_TIMES - 1);
    expect(findPeakTimes(carla)).toBeNull();
  });

  it('lets the earliest weekday and the earliest hour win a tie', () => {
    const person = personWritingIn(
      'Dani',
      [
        { index: SATURDAY, messageCount: 60 },
        { index: TUESDAY, messageCount: 60 },
      ],
      [
        { index: 22, messageCount: 60 },
        { index: 8, messageCount: 60 },
      ],
    );

    expect(findPeakTimes(person)).toMatchObject({ weekdayIndex: TUESDAY, hour: 8 });
  });

  it('places nobody whose messages were not counted by weekday and hour', () => {
    expect(findPeakTimes(personStatistics({ name: 'Dani', messageCount: 500 }))).toBeNull();
  });
});

describe('describePeakTimes', () => {
  it('names the weekday in the plural and the hour on a 24 hour clock', () => {
    const peakTimes = { weekdayIndex: SUNDAY, weekdayShare: 0.3, hour: 23, hourShare: 0.2 };

    expect(describePeakTimes(peakTimes)).toBe('Mostly on Sundays, around 23:00');
  });

  it('pads an early hour, midnight included', () => {
    const peakTimes = { weekdayIndex: 0, weekdayShare: 0.3, hour: 0, hourShare: 0.2 };

    expect(describePeakTimes(peakTimes)).toBe('Mostly on Mondays, around 00:00');
  });
});

describe('hasPeakTimesWorthShowing', () => {
  it('is true when one of the people listed can be placed', () => {
    expect(hasPeakTimesWorthShowing([ana, carla], [ana, carla])).toBe(true);
  });

  it('is false when nobody listed can be placed', () => {
    expect(hasPeakTimesWorthShowing([carla, ana], [carla])).toBe(false);
  });

  it('is false for a single sender, whose times the heatmap already shows', () => {
    expect(hasPeakTimesWorthShowing([ana], [ana])).toBe(false);
  });
});

describe('renderPeakTimesSection', () => {
  const analysis = chatAnalysis({ people: [ana, bob, carla] });

  it('is left out of a chat with a single sender', () => {
    expect(renderPeakTimesSection(chatAnalysis({ people: [ana] }), new Map())).toBe('');
  });

  it('is left out when nobody has written a hundred messages', () => {
    const smallChat = chatAnalysis({ people: [carla, personStatistics({ name: 'Dani' })] });

    expect(renderPeakTimesSection(smallChat, new Map())).toBe('');
  });

  it('is headed "When each person writes" and names its columns', () => {
    const section = renderSection(analysis);

    expect(textsOfElements(section, '.section-heading h2')).toEqual(['When each person writes']);
    expect(textsOfElements(section, 'thead th')).toEqual([
      'Person',
      'Writes',
      'Sent on that weekday',
      'Sent in that hour',
    ]);
  });

  it('says for each person when they mostly write, with the share of their messages sent then', () => {
    const [anaRow, bobRow] = readTableRows(renderSection(analysis));

    expect(anaRow).toEqual(['Ana', 'Mostly on Sundays, around 14:00', '40%', '55%']);
    expect(bobRow).toEqual(['Bob', 'Mostly on Tuesdays, around 07:00', '100%', '100%']);
  });

  it('says so instead of naming a time for somebody with too few messages', () => {
    const section = renderSection(analysis);

    expect(readTableRows(section)[2]).toEqual(['Carla', TOO_FEW_MESSAGES_LABEL, '–', '–']);
    expect(textsOfElements(section, 'td.peak-times-unknown')).toEqual([TOO_FEW_MESSAGES_LABEL]);
  });

  it('precedes each name with a swatch in the colour of the person', () => {
    const firstCell = findElement(renderSection(analysis), 'tbody tr:nth-child(2) td');

    expect(firstCell.innerHTML).toBe(
      '<i class="colour-swatch" style="background:var(--s2)"></i>Bob',
    );
  });

  it('explains that weekday and hour are counted separately, and from how many messages', () => {
    const [explanation] = textsOfElements(
      renderSection(analysis),
      'p.hint:not(.people-shown-note)',
    );

    expect(explanation).toContain('The weekday and the hour are counted separately');
    expect(explanation).toContain('A person is placed from 100 messages on.');
  });

  describe('a large group', () => {
    const tenPeople = Array.from({ length: 10 }, (_unused, index) =>
      personWritingIn(
        `Person ${index + 1}`,
        [{ index: SUNDAY, messageCount: 1000 - index }],
        [{ index: 21, messageCount: 1000 - index }],
      ),
    );
    const largeGroup = chatAnalysis({ people: tenPeople });

    it('lists the eight most active and says so', () => {
      const section = renderSection(largeGroup);

      expect(readTableRows(section)).toHaveLength(8);
      expect(textsOfElements(section, '.people-shown-note')).toEqual([
        'Showing the 8 most active of 10 people.',
      ]);
    });

    it('lists everyone when asked to', () => {
      const section = renderSection(largeGroup, 'everyone');

      expect(readTableRows(section)).toHaveLength(10);
      expect(textsOfElements(section, '.people-shown-note')).toEqual([]);
    });
  });

  it('writes a name that is markup as text', () => {
    const hostileName = '<img src=x onerror=alert(1)>';
    const hostile = personStatistics({ ...bob, name: hostileName });
    const section = renderSection(chatAnalysis({ people: [ana, hostile] }));

    expect(section.querySelectorAll('img')).toHaveLength(0);
    expect(readTableRows(section)[1]?.[0]).toBe(hostileName);
    expect(tagNamesIn(section)).toEqual([
      'section',
      'div',
      'h2',
      'p',
      'table',
      'thead',
      'tr',
      'th',
      'tbody',
      'td',
      'i',
    ]);
  });
});
