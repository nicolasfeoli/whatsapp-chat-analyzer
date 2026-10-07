// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { assignPersonColours } from '../../../src/ui/person-colours';
import { mediaCountOfType, renderMediaTypesSection } from '../../../src/ui/sections/media-types';
import type { ChatAnalysis, MediaType } from '../../../src/core/types';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis): HTMLDivElement {
  return parseMarkup(renderMediaTypesSection(analysis, assignPersonColours(analysis.people)));
}

/**
 * Reads the body of the table as rows of cell texts.
 */
function readTableRows(section: ParentNode): string[][] {
  return Array.from(section.querySelectorAll('tbody tr'), (row) => textsOfElements(row, 'td'));
}

/** Ana sends stickers and photos, Bob sends voice notes. */
const anaAndBob = chatAnalysis({
  people: [
    personStatistics({
      name: 'Ana',
      messageCount: 60,
      mediaCountsByType: new Map<MediaType, number>([
        ['sticker', 1200],
        ['photo', 30],
      ]),
    }),
    personStatistics({
      name: 'Bob',
      messageCount: 40,
      mediaCountsByType: new Map<MediaType, number>([['audio', 7]]),
    }),
  ],
});

describe('mediaCountOfType', () => {
  it('returns how many media messages of a type a person sent', () => {
    const ana = personStatistics({
      name: 'Ana',
      mediaCountsByType: new Map<MediaType, number>([['sticker', 3]]),
    });

    expect(mediaCountOfType(ana, 'sticker')).toBe(3);
  });

  it('returns zero for a type the person never sent', () => {
    const ana = personStatistics({ name: 'Ana' });

    expect(mediaCountOfType(ana, 'gif')).toBe(0);
  });
});

describe('renderMediaTypesSection', () => {
  describe('when the export does not say what its media is', () => {
    it('is left out of a chat without media', () => {
      const wordsOnly = chatAnalysis({
        people: [personStatistics({ name: 'Ana', messageCount: 3 })],
      });

      expect(renderMediaTypesSection(wordsOnly, assignPersonColours(wordsOnly.people))).toBe('');
    });

    it('is left out when every placeholder is of an unknown type, as on Android without media', () => {
      const androidWithoutMedia = chatAnalysis({
        people: [
          personStatistics({
            name: 'Ana',
            messageCount: 3,
            mediaCountsByType: new Map<MediaType, number>([['unknown', 3]]),
          }),
        ],
      });

      expect(
        renderMediaTypesSection(
          androidWithoutMedia,
          assignPersonColours(androidWithoutMedia.people),
        ),
      ).toBe('');
    });
  });

  it('is headed "What gets sent"', () => {
    expect(textsOfElements(renderSection(anaAndBob), '.section-heading h2')).toEqual([
      'What gets sent',
    ]);
  });

  it('has a column for each type somebody sent, in a fixed order, and no others', () => {
    expect(textsOfElements(renderSection(anaAndBob), 'thead th')).toEqual([
      'Person',
      'Photos',
      'Voice and audio',
      'Stickers',
    ]);
  });

  it('has a row for each person with their count of each type, zero included', () => {
    expect(readTableRows(renderSection(anaAndBob))).toEqual([
      ['Ana', '30', '0', '1,200'],
      ['Bob', '0', '7', '0'],
    ]);
  });

  it('puts the colour of each person before their name', () => {
    expect(renderSection(anaAndBob).querySelectorAll('tbody .colour-swatch')).toHaveLength(2);
  });

  it('scrolls sideways on a narrow screen instead of widening the page', () => {
    const table = renderSection(anaAndBob).querySelector('table');

    expect(table?.parentElement?.className).toBe('table-wrapper');
  });

  it('draws every type of media under its own heading', () => {
    const everything = chatAnalysis({
      people: [
        personStatistics({
          name: 'Ana',
          messageCount: 10,
          mediaCountsByType: new Map<MediaType, number>([
            ['unknown', 10],
            ['location', 9],
            ['poll', 8],
            ['contact', 7],
            ['document', 6],
            ['gif', 5],
            ['sticker', 4],
            ['audio', 3],
            ['video', 2],
            ['photo', 1],
          ]),
        }),
      ],
    });

    const section = renderSection(everything);

    expect(textsOfElements(section, 'thead th')).toEqual([
      'Person',
      'Photos',
      'Videos',
      'Voice and audio',
      'Stickers',
      'GIFs',
      'Documents',
      'Contacts',
      'Polls',
      'Locations',
      'Not specified',
    ]);
    expect(readTableRows(section)).toEqual([
      ['Ana', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    ]);
  });

  it('keeps the "Not specified" column when only some placeholders name their media', () => {
    const mixed = chatAnalysis({
      people: [
        personStatistics({
          name: 'Ana',
          messageCount: 5,
          mediaCountsByType: new Map<MediaType, number>([
            ['photo', 2],
            ['unknown', 3],
          ]),
        }),
      ],
    });

    expect(textsOfElements(renderSection(mixed), 'thead th')).toEqual([
      'Person',
      'Photos',
      'Not specified',
    ]);
  });

  it('shows the eight most active people of a large group', () => {
    const names = ['Ana', 'Bob', 'Carla', 'Dani', 'Eva', 'Fede', 'Gabi', 'Hugo', 'Ines', 'Juan'];
    const largeGroup = chatAnalysis({
      people: names.map((name, index) =>
        personStatistics({
          name,
          messageCount: 100 - index,
          mediaCountsByType: new Map<MediaType, number>([['photo', 1]]),
        }),
      ),
    });

    expect(renderSection(largeGroup).querySelectorAll('tbody tr')).toHaveLength(8);
  });

  it('writes a name that is markup as text', () => {
    const hostileName = '<img src=x onerror=alert(1)>';
    const hostileChat = chatAnalysis({
      people: [
        personStatistics({
          name: hostileName,
          messageCount: 2,
          mediaCountsByType: new Map<MediaType, number>([['photo', 1]]),
        }),
      ],
    });

    const section = renderSection(hostileChat);

    expect(tagNamesIn(section)).not.toContain('img');
    expect(readTableRows(section)).toEqual([[hostileName, '1']]);
  });
});
