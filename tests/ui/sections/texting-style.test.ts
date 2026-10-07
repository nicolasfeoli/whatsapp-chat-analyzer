// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import type { ChatAnalysis } from '../../../src/core/types';
import { assignPersonColours } from '../../../src/ui/person-colours';
import type { PeopleShown } from '../../../src/ui/sections/featured-people';
import {
  MINIMUM_TEXT_MESSAGES_FOR_STYLE_SHARES,
  NO_VALUE,
  findTextingStyle,
  formatLongestMessage,
  formatStyleShare,
  hasTextingStyleWorthShowing,
  renderTextingStyleSection,
} from '../../../src/ui/sections/texting-style';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { findElement, parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';

/** Ana typed 200 messages: 80 of one word, 9 of emojis only, the longest of 1,250 words. */
const ana = personStatistics({
  name: 'Ana',
  messageCount: 260,
  textMessageCount: 200,
  singleWordMessageCount: 80,
  emojiOnlyMessageCount: 9,
  longestMessageWordCount: 1250,
});

/** Bob typed exactly fifty messages, none of them a single word or emojis only. */
const bob = personStatistics({
  name: 'Bob',
  messageCount: 50,
  textMessageCount: 50,
  longestMessageWordCount: 1,
});

/** Carla typed 49 messages, one too few for her shares, however many photos she sent. */
const carla = personStatistics({
  name: 'Carla',
  messageCount: 400,
  textMessageCount: 49,
  singleWordMessageCount: 40,
  emojiOnlyMessageCount: 5,
  longestMessageWordCount: 12,
});

/** Dani only ever sent photos. */
const dani = personStatistics({ name: 'Dani', messageCount: 30, mediaCount: 30 });

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis, peopleShown?: PeopleShown): HTMLDivElement {
  return parseMarkup(
    renderTextingStyleSection(analysis, assignPersonColours(analysis.people), peopleShown),
  );
}

/**
 * Reads the body of the table as rows of cell texts.
 */
function readTableRows(section: ParentNode): string[][] {
  return Array.from(section.querySelectorAll('tbody tr'), (row) => textsOfElements(row, 'td'));
}

describe('findTextingStyle', () => {
  it('works out the two shares of the typed messages, not of all messages', () => {
    /* 80 and 9 of the 200 typed messages; the 60 photos do not count. */
    expect(findTextingStyle(ana)).toEqual({ singleWordShare: 0.4, emojiOnlyShare: 0.045 });
  });

  it('gives shares to somebody with exactly fifty typed messages', () => {
    expect(bob.textMessageCount).toBe(MINIMUM_TEXT_MESSAGES_FOR_STYLE_SHARES);
    expect(findTextingStyle(bob)).toEqual({ singleWordShare: 0, emojiOnlyShare: 0 });
  });

  it('gives none to somebody with 49 typed messages, whatever else they sent', () => {
    expect(carla.textMessageCount).toBe(MINIMUM_TEXT_MESSAGES_FOR_STYLE_SHARES - 1);
    expect(findTextingStyle(carla)).toBeNull();
  });

  it('gives none to somebody who never typed', () => {
    expect(findTextingStyle(dani)).toBeNull();
  });
});

describe('formatLongestMessage', () => {
  it('writes the number of words with a thousands separator', () => {
    expect(formatLongestMessage(ana)).toBe('1,250 words');
  });

  it('writes a single word in the singular', () => {
    expect(formatLongestMessage(bob)).toBe('1 word');
  });

  it('writes a dash for somebody who never typed a word', () => {
    expect(formatLongestMessage(dani)).toBe(NO_VALUE);
  });
});

describe('formatStyleShare', () => {
  it.each([
    { share: 0, expected: '0%' },
    { share: 0.0004, expected: '0.0%' },
    { share: 0.045, expected: '4.5%' },
    { share: 0.4, expected: '40%' },
    { share: 1, expected: '100%' },
  ])('writes $share as "$expected"', ({ share, expected }) => {
    expect(formatStyleShare(share)).toBe(expected);
  });
});

describe('hasTextingStyleWorthShowing', () => {
  it('is true when one of the people listed has typed enough', () => {
    expect(hasTextingStyleWorthShowing([ana, carla], [ana, carla])).toBe(true);
  });

  it('is false when nobody listed has typed enough', () => {
    expect(hasTextingStyleWorthShowing([carla, ana], [carla])).toBe(false);
  });

  it('is false for a single sender, who has nobody to be compared with', () => {
    expect(hasTextingStyleWorthShowing([ana], [ana])).toBe(false);
  });
});

describe('renderTextingStyleSection', () => {
  const analysis = chatAnalysis({ people: [carla, ana, bob, dani] });

  it('is left out of a chat with a single sender', () => {
    expect(renderTextingStyleSection(chatAnalysis({ people: [ana] }), new Map())).toBe('');
  });

  it('is left out when nobody has typed fifty messages', () => {
    const smallChat = chatAnalysis({ people: [carla, dani] });

    expect(renderTextingStyleSection(smallChat, new Map())).toBe('');
  });

  it('is headed "How each person writes" and names its columns', () => {
    const section = renderSection(analysis);

    expect(textsOfElements(section, '.section-heading h2')).toEqual(['How each person writes']);
    expect(textsOfElements(section, 'thead th')).toEqual([
      'Person',
      'One-word messages',
      'Emoji-only messages',
      'Longest message',
    ]);
  });

  it('has a row for each person in the order of the chat, with their shares and longest message', () => {
    expect(readTableRows(renderSection(analysis))).toEqual([
      ['Carla', NO_VALUE, NO_VALUE, '12 words'],
      ['Ana', '40%', '4.5%', '1,250 words'],
      ['Bob', '0%', '0%', '1 word'],
      ['Dani', NO_VALUE, NO_VALUE, NO_VALUE],
    ]);
  });

  it('puts the colour of each person before their name', () => {
    expect(renderSection(analysis).querySelectorAll('tbody .colour-swatch')).toHaveLength(4);
  });

  it('says under the table what is counted and from how many messages on', () => {
    const hint = findElement(renderSection(analysis), 'p.hint').textContent;

    expect(hint).toContain('shares of the messages that person typed');
    expect(hint).toContain('A one-word message has exactly one word');
    expect(hint).toContain('The shares are written from 50 typed messages on');
  });

  it('scrolls sideways on a narrow screen instead of widening the page', () => {
    expect(findElement(renderSection(analysis), 'table').parentElement?.className).toBe(
      'table-wrapper',
    );
  });

  describe('a large group', () => {
    const names = ['Ana', 'Bob', 'Carla', 'Dani', 'Eva', 'Fede', 'Gabi', 'Hugo', 'Ines', 'Juan'];
    const largeGroup = chatAnalysis({
      people: names.map((name, index) =>
        personStatistics({
          name,
          messageCount: 1000 - index,
          textMessageCount: 100,
          singleWordMessageCount: 10 * index,
        }),
      ),
    });

    it('lists the eight most active people and says so', () => {
      const section = renderSection(largeGroup);

      expect(section.querySelectorAll('tbody tr')).toHaveLength(8);
      expect(textsOfElements(section, '.people-shown-note')).toEqual([
        'Showing the 8 most active of 10 people.',
      ]);
    });

    it('lists all ten when asked for everyone', () => {
      const section = renderSection(largeGroup, 'everyone');

      expect(readTableRows(section)[9]).toEqual(['Juan', '90%', '0%', NO_VALUE]);
      expect(textsOfElements(section, '.people-shown-note')).toEqual([]);
    });

    it('is left out when only people who are not listed have typed enough', () => {
      const quietTyper = chatAnalysis({
        people: names.map((name, index) =>
          personStatistics({
            name,
            messageCount: 1000 - index,
            textMessageCount: index === 9 ? 100 : 10,
          }),
        ),
      });

      expect(renderTextingStyleSection(quietTyper, assignPersonColours(quietTyper.people))).toBe(
        '',
      );
      expect(
        renderTextingStyleSection(quietTyper, assignPersonColours(quietTyper.people), 'everyone'),
      ).not.toBe('');
    });
  });

  it('writes a name that is markup as text', () => {
    const hostileName = '<img src=x onerror=alert(1)>';
    const hostileChat = chatAnalysis({
      people: [ana, personStatistics({ name: hostileName, messageCount: 5 })],
    });

    const section = renderSection(hostileChat);

    expect(tagNamesIn(section)).not.toContain('img');
    expect(readTableRows(section)[1]?.[0]).toBe(hostileName);
  });
});
