// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { assignPersonColours } from '../../../src/ui/person-colours';
import {
  mentionCountBetween,
  normaliseMentionedName,
  renderMentionsSection,
} from '../../../src/ui/sections/mentions';
import type { ChatAnalysis } from '../../../src/core/types';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis): HTMLDivElement {
  return parseMarkup(renderMentionsSection(analysis, assignPersonColours(analysis.people)));
}

/**
 * Reads the grid as rows of cell texts, the row heading first.
 */
function readGridRows(section: ParentNode): string[][] {
  return Array.from(section.querySelectorAll('.person-grid tbody tr'), (row) =>
    textsOfElements(row, 'th, td'),
  );
}

/** Ana keeps calling Bob; Carla is not in the exporter's contacts. */
const threeFriends = chatAnalysis({
  people: [
    personStatistics({
      name: 'Ana',
      messageCount: 60,
      mentionCountsByName: new Map([
        ['Bob', 12],
        ['Carla', 3],
        ['Somebody who left', 9],
      ]),
    }),
    personStatistics({
      name: 'Bob',
      messageCount: 40,
      mentionCountsByName: new Map([['Ana', 4]]),
    }),
    personStatistics({ name: '~ Carla', messageCount: 20 }),
  ],
});

describe('normaliseMentionedName', () => {
  it.each([
    { name: 'Carla', expected: 'Carla' },
    { name: '~ Carla', expected: 'Carla' },
    { name: '~Carla', expected: 'Carla' },
    { name: '  ~  Carla  ', expected: 'Carla' },
    { name: 'Carla ~ Vega', expected: 'Carla ~ Vega' },
  ])('reads "$name" as "$expected"', ({ name, expected }) => {
    expect(normaliseMentionedName(name)).toBe(expected);
  });
});

describe('mentionCountBetween', () => {
  it('returns how often one person mentioned another', () => {
    const [ana, bob] = threeFriends.people;
    if (ana === undefined || bob === undefined) {
      throw new Error('The fixture has lost its people');
    }

    expect(mentionCountBetween(ana, bob)).toBe(12);
  });

  it('matches a mention to a sender written with the "not a contact" tilde', () => {
    const [ana, , carla] = threeFriends.people;
    if (ana === undefined || carla === undefined) {
      throw new Error('The fixture has lost its people');
    }

    expect(mentionCountBetween(ana, carla)).toBe(3);
  });

  it('adds up mentions written with and without the tilde', () => {
    const ana = personStatistics({
      name: 'Ana',
      mentionCountsByName: new Map([
        ['Carla', 3],
        ['~ Carla', 2],
      ]),
    });

    expect(mentionCountBetween(ana, personStatistics({ name: 'Carla' }))).toBe(5);
  });

  it('returns zero for somebody the person never mentioned', () => {
    const [, bob, carla] = threeFriends.people;
    if (bob === undefined || carla === undefined) {
      throw new Error('The fixture has lost its people');
    }

    expect(mentionCountBetween(bob, carla)).toBe(0);
  });
});

describe('renderMentionsSection', () => {
  it('is left out of a chat of two', () => {
    const couple = chatAnalysis({
      people: [
        personStatistics({ name: 'Ana', mentionCountsByName: new Map([['Bob', 9]]) }),
        personStatistics({ name: 'Bob' }),
      ],
    });

    expect(renderMentionsSection(couple, assignPersonColours(couple.people))).toBe('');
  });

  it('is left out of a group in which nobody mentioned anybody, as in an Android export', () => {
    const noMentions = chatAnalysis({
      people: [
        personStatistics({ name: 'Ana', messageCount: 3 }),
        personStatistics({ name: 'Bob', messageCount: 2 }),
        personStatistics({ name: 'Carla', messageCount: 1 }),
      ],
    });

    expect(renderMentionsSection(noMentions, assignPersonColours(noMentions.people))).toBe('');
  });

  it('is left out when the only people mentioned are not among the people shown', () => {
    const mentionsOfOutsiders = chatAnalysis({
      people: [
        personStatistics({
          name: 'Ana',
          messageCount: 3,
          mentionCountsByName: new Map([['Somebody who left', 9]]),
        }),
        personStatistics({ name: 'Bob', messageCount: 2 }),
        personStatistics({ name: 'Carla', messageCount: 1 }),
      ],
    });

    expect(
      renderMentionsSection(mentionsOfOutsiders, assignPersonColours(mentionsOfOutsiders.people)),
    ).toBe('');
  });

  it('is headed "Who mentions whom"', () => {
    expect(textsOfElements(renderSection(threeFriends), '.section-heading h2')).toEqual([
      'Who mentions whom',
    ]);
  });

  it('has a row for each person with their mentions of each of the others', () => {
    expect(readGridRows(renderSection(threeFriends))).toEqual([
      ['Ana', '·', '12', '3'],
      ['Bob', '4', '·', '0'],
      ['~ Carla', '0', '0', '·'],
    ]);
  });

  it('writes a name that is markup as text', () => {
    const hostileName = '<img src=x onerror=alert(1)>';
    const hostileGroup = chatAnalysis({
      people: [
        personStatistics({
          name: 'Ana',
          messageCount: 3,
          mentionCountsByName: new Map([[hostileName, 2]]),
        }),
        personStatistics({ name: hostileName, messageCount: 2 }),
        personStatistics({ name: 'Carla', messageCount: 1 }),
      ],
    });

    const section = renderSection(hostileGroup);

    expect(tagNamesIn(section)).not.toContain('img');
    expect(textsOfElements(section, '.person-grid thead th')).toContain(hostileName);
  });
});
