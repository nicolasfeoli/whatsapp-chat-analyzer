// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { MILLISECONDS_PER_MINUTE, MILLISECONDS_PER_SECOND } from '../../../src/core/time-constants';
import type { ChatAnalysis } from '../../../src/core/types';
import { assignPersonColours } from '../../../src/ui/person-colours';
import { MINIMUM_REPLIES_FOR_TYPICAL_DELAY } from '../../../src/ui/sections/featured-people';
import type { PeopleShown } from '../../../src/ui/sections/featured-people';
import {
  NO_TYPICAL_DELAY,
  hasAnyTypicalReplyDelayBetween,
  renderReplySpeedPairsSection,
  replyDelaysBetween,
  replySpeedWeightOf,
  typicalReplyDelayBetween,
} from '../../../src/ui/sections/reply-speed-pairs';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { findElement, parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';

const ONE_MINUTE = MILLISECONDS_PER_MINUTE;

/**
 * Builds a list of equally long reply delays.
 */
function repliesOf(replyCount: number, delayInMilliseconds: number): number[] {
  return new Array<number>(replyCount).fill(delayInMilliseconds);
}

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis, peopleShown?: PeopleShown): HTMLDivElement {
  return parseMarkup(
    renderReplySpeedPairsSection(analysis, assignPersonColours(analysis.people), peopleShown),
  );
}

/**
 * Reads the grid as rows of cell texts, the row heading first.
 */
function readGridRows(section: ParentNode): string[][] {
  return Array.from(section.querySelectorAll('.person-grid tbody tr'), (row) =>
    textsOfElements(row, 'th, td'),
  );
}

/**
 * Reads one attribute of every cell of one row of the grid, in column order.
 */
function cellAttributesOfRow(
  section: ParentNode,
  rowIndex: number,
  attributeName: string,
): (string | null)[] {
  const row = section.querySelectorAll('.person-grid tbody tr')[rowIndex];
  if (row === undefined) {
    throw new Error(`The grid has no row ${rowIndex}`);
  }
  return Array.from(row.querySelectorAll('td'), (cell) => cell.getAttribute(attributeName));
}

/**
 * Ana answers Bob within a minute and Carla after three; Bob takes twenty
 * minutes for Ana and has answered Carla only four times; Carla answers Ana
 * after forty-five seconds and never answers Bob.
 */
const threeFriends = chatAnalysis({
  people: [
    personStatistics({
      name: 'Ana',
      messageCount: 60,
      replyDelaysByRecipient: new Map([
        ['Bob', repliesOf(12, ONE_MINUTE)],
        ['Carla', repliesOf(5, 3 * ONE_MINUTE)],
      ]),
    }),
    personStatistics({
      name: 'Bob',
      messageCount: 40,
      replyDelaysByRecipient: new Map([
        ['Ana', repliesOf(1200, 20 * ONE_MINUTE)],
        ['Carla', repliesOf(4, ONE_MINUTE)],
      ]),
    }),
    personStatistics({
      name: 'Carla',
      messageCount: 20,
      replyDelaysByRecipient: new Map([['Ana', repliesOf(5, 45 * MILLISECONDS_PER_SECOND)]]),
    }),
  ],
});

describe('replyDelaysBetween', () => {
  const ana = personStatistics({
    name: 'Ana',
    replyDelaysByRecipient: new Map([['Bob', [1000, 2000]]]),
  });

  it('lists the delays of the replies one person wrote to another', () => {
    expect(replyDelaysBetween(ana, 'Bob')).toEqual([1000, 2000]);
  });

  it('is empty for somebody the person never replied to', () => {
    expect(replyDelaysBetween(ana, 'Carla')).toEqual([]);
  });
});

describe('typicalReplyDelayBetween', () => {
  it('is the median of the delays towards that person', () => {
    const ana = personStatistics({
      name: 'Ana',
      /* In order: 1, 2, 3, 30 and 600 seconds; the one in the middle is 3. */
      replyDelaysByRecipient: new Map([['Bob', [600_000, 1000, 3000, 30_000, 2000]]]),
    });

    expect(typicalReplyDelayBetween(ana, 'Bob')).toBe(3000);
  });

  it('is given from five replies on', () => {
    const ana = personStatistics({
      name: 'Ana',
      replyDelaysByRecipient: new Map([
        ['Bob', repliesOf(MINIMUM_REPLIES_FOR_TYPICAL_DELAY, 1000)],
        ['Carla', repliesOf(MINIMUM_REPLIES_FOR_TYPICAL_DELAY - 1, 1000)],
      ]),
    });

    expect(typicalReplyDelayBetween(ana, 'Bob')).toBe(1000);
    expect(typicalReplyDelayBetween(ana, 'Carla')).toBeNull();
  });

  it('is null for somebody the person never replied to', () => {
    expect(typicalReplyDelayBetween(personStatistics({ name: 'Ana' }), 'Bob')).toBeNull();
  });
});

describe('replySpeedWeightOf', () => {
  it('is largest for an answer that took no time at all', () => {
    expect(replySpeedWeightOf(0)).toBe(1);
  });

  it('halves when the delay, counted from one minute, doubles', () => {
    /* 1 min + 1 min is twice the floor of one minute; 3 min + 1 min is four times. */
    expect(replySpeedWeightOf(ONE_MINUTE)).toBe(0.5);
    expect(replySpeedWeightOf(3 * ONE_MINUTE)).toBe(0.25);
  });

  it('stays above zero for the slowest answer that is counted', () => {
    expect(replySpeedWeightOf(12 * 60 * ONE_MINUTE)).toBeGreaterThan(0);
  });
});

describe('hasAnyTypicalReplyDelayBetween', () => {
  it('is true when one pair has replied often enough', () => {
    expect(hasAnyTypicalReplyDelayBetween(threeFriends.people)).toBe(true);
  });

  it('is false when every pair has fewer than five replies', () => {
    const people = [
      personStatistics({
        name: 'Ana',
        replyDelaysByRecipient: new Map([['Bob', repliesOf(4, 1000)]]),
      }),
      personStatistics({ name: 'Bob' }),
    ];

    expect(hasAnyTypicalReplyDelayBetween(people)).toBe(false);
  });

  it('does not take replies to somebody outside these people for a reason to draw the grid', () => {
    const people = [
      personStatistics({
        name: 'Ana',
        replyDelaysByRecipient: new Map([['Dani', repliesOf(9, 1000)]]),
      }),
      personStatistics({ name: 'Bob' }),
    ];

    expect(hasAnyTypicalReplyDelayBetween(people)).toBe(false);
  });
});

describe('renderReplySpeedPairsSection', () => {
  describe('when there is nothing to compare', () => {
    it('is left out of a chat of two, whose reply times are in "Replies and openings"', () => {
      const couple = chatAnalysis({
        people: [
          personStatistics({
            name: 'Ana',
            replyDelaysByRecipient: new Map([['Bob', repliesOf(9, 1000)]]),
          }),
          personStatistics({
            name: 'Bob',
            replyDelaysByRecipient: new Map([['Ana', repliesOf(9, 1000)]]),
          }),
        ],
      });

      expect(renderReplySpeedPairsSection(couple, assignPersonColours(couple.people))).toBe('');
    });

    it('is left out of a group in which no pair has five replies', () => {
      const fewReplies = chatAnalysis({
        people: [
          personStatistics({
            name: 'Ana',
            messageCount: 3,
            replyDelaysByRecipient: new Map([['Bob', repliesOf(4, 1000)]]),
          }),
          personStatistics({ name: 'Bob', messageCount: 2 }),
          personStatistics({ name: 'Carla', messageCount: 1 }),
        ],
      });

      expect(renderReplySpeedPairsSection(fewReplies, assignPersonColours(fewReplies.people))).toBe(
        '',
      );
    });
  });

  describe('the grid', () => {
    it('is headed "How fast each answers whom" and says what a cell holds', () => {
      const section = renderSection(threeFriends);

      expect(textsOfElements(section, '.section-heading h2')).toEqual([
        'How fast each answers whom',
      ]);
      expect(findElement(section, '.section-heading p').textContent).toContain('the median');
      expect(findElement(section, '.section-heading p').textContent).toContain(
        'The stronger the tint, the faster the answer',
      );
    });

    it('has a row for each person with their typical time to answer each of the others', () => {
      expect(readGridRows(renderSection(threeFriends))).toEqual([
        ['Ana', '·', '1 min', '3 min'],
        ['Bob', '20 min', '·', NO_TYPICAL_DELAY],
        ['Carla', '45 s', NO_TYPICAL_DELAY, '·'],
      ]);
    });

    it('has a column for each person, most active first', () => {
      expect(textsOfElements(renderSection(threeFriends), '.person-grid thead th')).toEqual([
        'Ana',
        'Bob',
        'Carla',
      ]);
    });

    it('says in the title of a cell how many replies its time rests on, or why it has none', () => {
      const section = renderSection(threeFriends);

      expect(cellAttributesOfRow(section, 0, 'title')).toEqual([
        null,
        'Median of 12 replies',
        'Median of 5 replies',
      ]);
      expect(cellAttributesOfRow(section, 1, 'title')).toEqual([
        'Median of 1,200 replies',
        null,
        '4 replies, too few for a typical time',
      ]);
      expect(cellAttributesOfRow(section, 2, 'title')).toEqual([
        'Median of 5 replies',
        'No replies',
        null,
      ]);
    });

    it('writes a single reply in the singular', () => {
      const group = chatAnalysis({
        people: [
          personStatistics({
            name: 'Ana',
            messageCount: 3,
            replyDelaysByRecipient: new Map([
              ['Bob', repliesOf(5, 1000)],
              ['Carla', repliesOf(1, 1000)],
            ]),
          }),
          personStatistics({ name: 'Bob', messageCount: 2 }),
          personStatistics({ name: 'Carla', messageCount: 1 }),
        ],
      });

      expect(cellAttributesOfRow(renderSection(group), 0, 'title')[2]).toBe(
        '1 reply, too few for a typical time',
      );
    });

    it('explains the dash, the guess behind a reply and the twelve hours under the grid', () => {
      const section = renderSection(threeFriends);

      expect(textsOfElements(section, 'p.hint')).toEqual([
        'A pair needs 5 replies before a time is written; a dash means there were fewer. As in "Who answers whom", a reply counts towards whoever wrote just before it, and an answer that took twelve hours or more is not counted.',
      ]);
    });

    it('scrolls sideways on a narrow screen instead of widening the page', () => {
      const section = renderSection(threeFriends);

      expect(findElement(section, '.person-grid').parentElement?.className).toBe('table-wrapper');
    });
  });

  describe('the tint of the cells', () => {
    it('is strongest for the person each row answers fastest', () => {
      /*
       * Ana: one minute weighs 1/2 and three minutes 1/4, so the second cell
       * gets 6 + 34 × (1/4 ÷ 1/2) = 23.
       */
      expect(cellAttributesOfRow(renderSection(threeFriends), 0, 'style')).toEqual([
        null,
        'background:color-mix(in oklab,var(--accent) 40%,transparent)',
        'background:color-mix(in oklab,var(--accent) 23%,transparent)',
      ]);
    });

    it('is scaled within each row, so a slow person still shows whom they answer fastest', () => {
      expect(cellAttributesOfRow(renderSection(threeFriends), 1, 'style')[0]).toBe(
        'background:color-mix(in oklab,var(--accent) 40%,transparent)',
      );
    });

    it('is absent from a cell with a dash and from the cell of a person with themselves', () => {
      expect(cellAttributesOfRow(renderSection(threeFriends), 1, 'style')).toEqual([
        expect.any(String),
        null,
        null,
      ]);
    });
  });

  describe('an export that only records minutes', () => {
    const minuteResolutionGroup = chatAnalysis({
      timestampResolution: 'minute',
      people: [
        personStatistics({
          name: 'Ana',
          messageCount: 3,
          replyDelaysByRecipient: new Map([
            ['Bob', repliesOf(5, 0)],
            ['Carla', repliesOf(5, 2 * ONE_MINUTE)],
          ]),
        }),
        personStatistics({ name: 'Bob', messageCount: 2 }),
        personStatistics({ name: 'Carla', messageCount: 1 }),
      ],
    });

    it('writes an answer within the same minute as "under 1 min"', () => {
      expect(readGridRows(renderSection(minuteResolutionGroup))[0]).toEqual([
        'Ana',
        '·',
        'under 1 min',
        '2 min',
      ]);
    });

    it('notes under the grid that times are rounded', () => {
      expect(textsOfElements(renderSection(minuteResolutionGroup), 'p.hint')).toContain(
        'This export records times to the minute, so replies are rounded.',
      );
    });

    it('does not add that note to an export that records seconds', () => {
      expect(textsOfElements(renderSection(threeFriends), 'p.hint')).toHaveLength(1);
    });
  });

  describe('a large group', () => {
    const names = ['Ana', 'Bob', 'Carla', 'Dani', 'Eva', 'Fede', 'Gabi', 'Hugo', 'Ines', 'Juan'];

    /**
     * Builds a group of ten in which everybody answers one person fast.
     */
    function groupAnswering(recipientName: string): ChatAnalysis {
      return chatAnalysis({
        people: names.map((name, index) =>
          personStatistics({
            name,
            messageCount: 100 - index,
            replyDelaysByRecipient: new Map([[recipientName, repliesOf(5, 1000)]]),
          }),
        ),
      });
    }

    it('shows the eight most active people and says so', () => {
      const section = renderSection(groupAnswering('Ana'));

      expect(textsOfElements(section, '.person-grid thead th')).toEqual(names.slice(0, 8));
      expect(textsOfElements(section, '.people-shown-note')).toEqual([
        'Showing the 8 most active of 10 people.',
      ]);
    });

    it('shows all ten when asked for everyone', () => {
      const section = renderSection(groupAnswering('Ana'), 'everyone');

      expect(section.querySelectorAll('.person-grid tbody tr')).toHaveLength(10);
      expect(textsOfElements(section, '.people-shown-note')).toEqual([]);
    });

    it('is left out when the only measured replies went to people who are not shown', () => {
      const group = groupAnswering('Juan');

      expect(renderReplySpeedPairsSection(group, assignPersonColours(group.people))).toBe('');
    });
  });

  describe('names that are markup', () => {
    const hostileName = '<img src=x onerror=alert(1)>';

    it('arrive on the page as text and create no element', () => {
      const hostileGroup = chatAnalysis({
        people: [
          personStatistics({
            name: hostileName,
            messageCount: 3,
            replyDelaysByRecipient: new Map([['Carla', repliesOf(5, 1000)]]),
          }),
          personStatistics({ name: 'Bob', messageCount: 2 }),
          personStatistics({ name: 'Carla', messageCount: 1 }),
        ],
      });

      const section = renderSection(hostileGroup);

      expect(tagNamesIn(section)).not.toContain('img');
      expect(textsOfElements(section, '.person-grid thead th')).toEqual([
        hostileName,
        'Bob',
        'Carla',
      ]);
    });
  });
});
