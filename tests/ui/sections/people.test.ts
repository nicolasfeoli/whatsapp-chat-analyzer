// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { assignPersonColours } from '../../../src/ui/person-colours';
import { renderPeopleSection } from '../../../src/ui/sections/people';
import type { ChatAnalysis } from '../../../src/core/types';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { FACE_WITH_TEARS_OF_JOY, PARTY_POPPER, RED_HEART } from '../../fixtures/emojis';
import { findElement, parseMarkup, textsOfElements } from '../../fixtures/markup';

/** Thumbs up and a rocket, two more emojis for the tests of the "Top emojis" column. */
const THUMBS_UP = String.fromCodePoint(0x1f44d);
const ROCKET = String.fromCodePoint(0x1f680);

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis): HTMLDivElement {
  return parseMarkup(renderPeopleSection(analysis, assignPersonColours(analysis.people)));
}

/**
 * Reads the table of the section as rows of cell texts.
 */
function readTableRows(section: ParentNode): string[][] {
  return Array.from(section.querySelectorAll('tbody tr'), (row) => textsOfElements(row, 'td'));
}

/** A chat in which Ana sent three quarters of the messages. */
const anaAndBob = chatAnalysis({
  people: [
    personStatistics({
      name: 'Ana',
      messageCount: 1500,
      textMessageCount: 1400,
      wordCount: 9100,
      mediaCount: 70,
      emojiCount: 320,
      questionCount: 210,
      linkCount: 12,
      deletedCount: 30,
      emojiCounts: new Map([
        [RED_HEART, 2],
        [FACE_WITH_TEARS_OF_JOY, 9],
      ]),
    }),
    personStatistics({ name: 'Bob', messageCount: 500, textMessageCount: 500, wordCount: 1250 }),
  ],
});

describe('renderPeopleSection', () => {
  it('is headed "Who says what" with a line of explanation', () => {
    const section = renderSection(anaAndBob);

    expect(textsOfElements(section, '.section-heading h2')).toEqual(['Who says what']);
    expect(textsOfElements(section, '.section-heading p')).toEqual([
      'Messages sent by each person, then the detail behind them.',
    ]);
  });

  describe('message bars', () => {
    it('draws a bar per person with their count and their share of the chat', () => {
      const section = renderSection(anaAndBob);

      expect(textsOfElements(section, '.horizontal-bars .bar-label')).toEqual(['Ana', 'Bob']);
      expect(textsOfElements(section, '.horizontal-bars .bar-value')).toEqual([
        '1,500  75%',
        '500  25%',
      ]);
    });

    it('scales the bars against the most talkative person, in each person’s colour', () => {
      const bars = renderSection(anaAndBob).querySelectorAll('.horizontal-bars .bar');

      expect(Array.from(bars, (bar) => bar.getAttribute('style'))).toEqual([
        'width:100.0%;background:var(--s1)',
        'width:33.3%;background:var(--s2)',
      ]);
    });

    it('shows a small share with one decimal', () => {
      const analysis = chatAnalysis({
        people: [
          personStatistics({ name: 'Ana', messageCount: 958 }),
          personStatistics({ name: 'Bob', messageCount: 42 }),
        ],
      });

      expect(textsOfElements(renderSection(analysis), '.horizontal-bars .bar-value')).toEqual([
        '958  96%',
        '42  4.2%',
      ]);
    });
  });

  describe('table', () => {
    it('has a column for each statistic', () => {
      expect(textsOfElements(renderSection(anaAndBob), 'thead th')).toEqual([
        'Person',
        'Messages',
        'Words',
        'Words / msg',
        'Media',
        'Emojis',
        'Questions',
        'Links',
        'Deleted',
        'Top emojis',
      ]);
    });

    it('fills a row with the numbers of each person', () => {
      const [anaRow] = readTableRows(renderSection(anaAndBob));

      expect(anaRow).toEqual([
        'Ana',
        '1,500',
        '9,100',
        '6.5',
        '70',
        '320',
        '210',
        '12',
        '30',
        `${FACE_WITH_TEARS_OF_JOY} ${RED_HEART}`,
      ]);
    });

    it('precedes the name with a swatch in the colour of the person', () => {
      const firstCell = findElement(renderSection(anaAndBob), 'tbody tr:nth-child(2) td');

      expect(firstCell.innerHTML).toBe(
        '<i class="colour-swatch" style="background:var(--s2)"></i>Bob',
      );
    });

    it('averages words over typed messages only, leaving media and deleted ones out', () => {
      const analysis = chatAnalysis({
        people: [
          personStatistics({
            name: 'Ana',
            messageCount: 100,
            textMessageCount: 20,
            mediaCount: 70,
            deletedCount: 10,
            wordCount: 50,
          }),
        ],
      });

      const [anaRow] = readTableRows(renderSection(analysis));

      expect(anaRow?.[3]).toBe('2.5');
    });

    it('writes 0 words per message for someone who only sent media', () => {
      const analysis = chatAnalysis({
        people: [personStatistics({ name: 'Ana', messageCount: 5, mediaCount: 5 })],
      });

      const [anaRow] = readTableRows(renderSection(analysis));

      expect(anaRow?.[3]).toBe('0');
    });

    it('lists at most four favourite emojis, the most used first', () => {
      const analysis = chatAnalysis({
        people: [
          personStatistics({
            name: 'Ana',
            messageCount: 1,
            emojiCounts: new Map([
              [ROCKET, 1],
              [RED_HEART, 5],
              [THUMBS_UP, 4],
              [PARTY_POPPER, 3],
              [FACE_WITH_TEARS_OF_JOY, 2],
            ]),
          }),
        ],
      });

      const [anaRow] = readTableRows(renderSection(analysis));

      expect(anaRow?.[9]).toBe(
        `${RED_HEART} ${THUMBS_UP} ${PARTY_POPPER} ${FACE_WITH_TEARS_OF_JOY}`,
      );
    });

    it('leaves the emoji cell empty for someone who used none', () => {
      const [, bobRow] = readTableRows(renderSection(anaAndBob));

      expect(bobRow?.[9]).toBe('');
    });
  });

  describe('edited messages', () => {
    /** A chat in which Ana corrected twelve of her messages and Bob none of his. */
    const withEditedMessages = chatAnalysis({
      people: [
        personStatistics({
          name: 'Ana',
          messageCount: 1500,
          deletedCount: 30,
          editedMessageCount: 1200,
          emojiCounts: new Map([[RED_HEART, 2]]),
        }),
        personStatistics({ name: 'Bob', messageCount: 500 }),
      ],
    });

    it('has no "Edited" column when the export marks no message as edited', () => {
      expect(textsOfElements(renderSection(anaAndBob), 'thead th')).not.toContain('Edited');
      expect(readTableRows(renderSection(anaAndBob))[0]).toHaveLength(10);
    });

    it('adds an "Edited" column between "Deleted" and "Top emojis" when one message is', () => {
      expect(textsOfElements(renderSection(withEditedMessages), 'thead th').slice(-3)).toEqual([
        'Deleted',
        'Edited',
        'Top emojis',
      ]);
    });

    it('fills it with each person’s count, zero included', () => {
      const [anaRow, bobRow] = readTableRows(renderSection(withEditedMessages));

      expect(anaRow?.slice(-3)).toEqual(['30', '1,200', RED_HEART]);
      expect(bobRow?.slice(-3)).toEqual(['0', '0', '']);
    });

    it('gives every row as many cells as there are headings', () => {
      const section = renderSection(withEditedMessages);

      expect(textsOfElements(section, 'thead th')).toHaveLength(11);
      expect(readTableRows(section).map((row) => row.length)).toEqual([11, 11]);
    });

    it('shows the column when a single message in the whole chat was edited', () => {
      const analysis = chatAnalysis({
        people: [
          personStatistics({ name: 'Ana', messageCount: 10 }),
          personStatistics({ name: 'Bob', messageCount: 5, editedMessageCount: 1 }),
        ],
      });

      expect(textsOfElements(renderSection(analysis), 'thead th')).toContain('Edited');
    });

    it('shows the column when only somebody beyond the eight listed edited a message', () => {
      const people = Array.from({ length: 10 }, (_unused, index) =>
        personStatistics({
          name: `Person ${index + 1}`,
          messageCount: 10 - index,
          editedMessageCount: index === 9 ? 1 : 0,
        }),
      );
      const section = renderSection(chatAnalysis({ people }));

      expect(textsOfElements(section, 'thead th')).toContain('Edited');
      expect(readTableRows(section).map((row) => row[9])).toEqual(new Array(8).fill('0'));
    });
  });

  describe('a large group', () => {
    const tenPeople = Array.from({ length: 10 }, (_unused, index) =>
      personStatistics({ name: `Person ${index + 1}`, messageCount: 10 - index }),
    );
    const section = renderSection(chatAnalysis({ people: tenPeople }));

    it('shows the eight most talkative people only', () => {
      expect(textsOfElements(section, '.horizontal-bars .bar-label')).toHaveLength(8);
      expect(readTableRows(section)).toHaveLength(8);
      expect(textsOfElements(section, '.horizontal-bars .bar-label')).not.toContain('Person 9');
    });

    it('still measures shares against the whole chat, not the eight shown', () => {
      /* The ten people sent 55 messages in total, of which the first sent 10. */
      expect(textsOfElements(section, '.horizontal-bars .bar-value')[0]).toBe('10  18%');
    });

    it('draws the seventh and eighth person in the muted colour', () => {
      const bars = Array.from(section.querySelectorAll('.horizontal-bars .bar'), (bar) =>
        bar.getAttribute('style'),
      );

      expect(bars[5]).toContain('background:var(--s6)');
      expect(bars[6]).toContain('background:var(--other)');
      expect(bars[7]).toContain('background:var(--other)');
    });
  });

  it('shows an emoji with markup as text in the last column', () => {
    /* No emoji the parser finds contains markup, but the table accepts any table of counts. */
    const hostileEmoji = '<u onclick=alert(1)>x</u>';
    const analysis = chatAnalysis({
      people: [
        personStatistics({
          name: 'Ana',
          messageCount: 1,
          emojiCounts: new Map([[hostileEmoji, 2]]),
        }),
      ],
    });

    const section = renderSection(analysis);
    const cellsOfAna = readTableRows(section)[0] ?? [];

    expect(section.querySelectorAll('u')).toHaveLength(0);
    expect(cellsOfAna[cellsOfAna.length - 1]).toBe(hostileEmoji);
  });

  it('shows a name with markup as text, in the bars and in the table', () => {
    const hostileName = '<img src=x onerror=alert(1)>';
    const analysis = chatAnalysis({
      people: [personStatistics({ name: hostileName, messageCount: 1 })],
    });

    const section = renderSection(analysis);

    expect(section.querySelectorAll('img')).toHaveLength(0);
    expect(textsOfElements(section, '.horizontal-bars .bar-label')).toEqual([hostileName]);
    expect(readTableRows(section)[0]?.[0]).toBe(hostileName);
  });
});
