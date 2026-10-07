// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { assignPersonColours } from '../../../src/ui/person-colours';
import {
  findSignatureWords,
  renderWordsAndEmojisSection,
} from '../../../src/ui/sections/words-and-emojis';
import type { ChatAnalysis } from '../../../src/core/types';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { FACE_WITH_TEARS_OF_JOY, FAMILY_MAN_WOMAN_GIRL, RED_HEART } from '../../fixtures/emojis';
import { parseMarkup, textsOfElements } from '../../fixtures/markup';

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis): HTMLDivElement {
  return parseMarkup(renderWordsAndEmojisSection(analysis, assignPersonColours(analysis.people)));
}

/**
 * Finds one of the two columns of the section by its heading.
 */
function findColumn(section: ParentNode, heading: string): Element {
  const columns = Array.from(section.querySelectorAll('.two-columns > div'));
  const column = columns.find(
    (candidate) => candidate.querySelector('h3')?.textContent === heading,
  );
  if (column === undefined) {
    throw new Error(`No column headed "${heading}"`);
  }
  return column;
}

/**
 * Builds a table of invented words, each used a different number of times:
 * `word1` once, `word2` twice, and so on.
 */
function numberedCounts(prefix: string, entryCount: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (let number = 1; number <= entryCount; number += 1) {
    counts.set(`${prefix}${number}`, number);
  }
  return counts;
}

/**
 * A chat in which Ana keeps saying "beach" and Bob keeps saying "football",
 * while both say "dinner" about equally often.
 */
const anaWordCounts = new Map([
  ['beach', 8],
  ['dinner', 5],
  ['train', 3],
]);
const bobWordCounts = new Map([
  ['football', 6],
  ['dinner', 5],
  ['beach', 1],
]);
const chatWordCounts = new Map([
  ['beach', 9],
  ['dinner', 10],
  ['train', 3],
  ['football', 6],
]);
const ana = personStatistics({ name: 'Ana', messageCount: 20, wordCounts: anaWordCounts });
const bob = personStatistics({ name: 'Bob', messageCount: 15, wordCounts: bobWordCounts });
const anaAndBob = chatAnalysis({ people: [ana, bob], wordCounts: chatWordCounts });

describe('findSignatureWords', () => {
  it('finds the words a person uses far more than the others do', () => {
    const signatureWords = findSignatureWords(ana, chatWordCounts);

    expect(signatureWords.map((signatureWord) => signatureWord.word)).toEqual(['beach']);
  });

  it('reports how often the person used the word and by how much they stand out', () => {
    const [beach] = findSignatureWords(ana, chatWordCounts);

    /*
     * Ana used "beach" 8 times among her 16 words; the others used it once
     * among their 12. With one added to each count and the vocabulary of 4
     * added to each total: (9 / 20) / (2 / 16) = 3.6.
     */
    expect(beach?.count).toBe(8);
    expect(beach?.ratio).toBeCloseTo(3.6);
  });

  it('leaves out a word that everybody uses about as much', () => {
    const words = findSignatureWords(ana, chatWordCounts).map(
      (signatureWord) => signatureWord.word,
    );

    expect(words).not.toContain('dinner');
  });

  it('leaves out a word the person used fewer than four times, however distinctive', () => {
    const words = findSignatureWords(ana, chatWordCounts).map(
      (signatureWord) => signatureWord.word,
    );

    expect(words).not.toContain('train');
  });

  it('accepts a word used exactly four times', () => {
    const person = personStatistics({ name: 'Ana', wordCounts: new Map([['olives', 4]]) });
    const wholeChat = new Map([
      ['olives', 4],
      ['football', 20],
    ]);

    expect(findSignatureWords(person, wholeChat)).toHaveLength(1);
  });

  describe('the ratio a word must exceed: 1.6', () => {
    it('leaves out a word whose ratio is exactly 1.6', () => {
      /*
       * The person used "olives" 7 times among 10 words; the others used it 4
       * times among their 10. With one added to each count and the vocabulary
       * of 3 added to each total: (8 / 13) / (5 / 13) = 1.6, which is not
       * "more than" 1.6.
       */
      const person = personStatistics({
        name: 'Ana',
        wordCounts: new Map([
          ['olives', 7],
          ['beach', 3],
        ]),
      });
      const wholeChat = new Map([
        ['olives', 11],
        ['beach', 3],
        ['train', 6],
      ]);

      expect(findSignatureWords(person, wholeChat)).toEqual([]);
    });

    it('accepts the same word once the others write a little more of other things', () => {
      /*
       * One more "train" from the others lowers their rate for "olives":
       * (8 / 13) / (5 / 14) = 112 / 65, about 1.72.
       */
      const person = personStatistics({
        name: 'Ana',
        wordCounts: new Map([
          ['olives', 7],
          ['beach', 3],
        ]),
      });
      const wholeChat = new Map([
        ['olives', 11],
        ['beach', 3],
        ['train', 7],
      ]);

      const [olives] = findSignatureWords(person, wholeChat);

      expect(olives?.word).toBe('olives');
      expect(olives?.ratio).toBeCloseTo(112 / 65);
    });
  });

  it('gives a finite ratio for a word nobody else ever used', () => {
    const [football] = findSignatureWords(bob, chatWordCounts);

    expect(football?.word).toBe('football');
    expect(Number.isFinite(football?.ratio)).toBe(true);
  });

  it('puts the most distinctive word first and returns seven at most', () => {
    const personWordCounts = numberedCounts('word', 12);
    const wholeChat = new Map(personWordCounts);
    wholeChat.set('common', 500);

    const signatureWords = findSignatureWords(
      personStatistics({ name: 'Ana', wordCounts: personWordCounts }),
      wholeChat,
    );

    expect(signatureWords.map((signatureWord) => signatureWord.word)).toEqual([
      'word12',
      'word11',
      'word10',
      'word9',
      'word8',
      'word7',
      'word6',
    ]);
  });

  it('finds nothing for someone who typed no significant word', () => {
    expect(findSignatureWords(personStatistics({ name: 'Ana' }), chatWordCounts)).toEqual([]);
  });
});

describe('renderWordsAndEmojisSection', () => {
  it('is headed "Words and emojis" and says which words are left out', () => {
    const section = renderSection(anaAndBob);

    expect(textsOfElements(section, '.section-heading h2')).toEqual(['Words and emojis']);
    expect(textsOfElements(section, '.section-heading p')).toEqual([
      'Common filler words in English and Spanish are left out.',
    ]);
  });

  describe('most used words', () => {
    it('draws a bar per word, the most used first, in a neutral colour', () => {
      const column = findColumn(renderSection(anaAndBob), 'Most used words');

      expect(textsOfElements(column, '.bar-label')).toEqual([
        'dinner',
        'beach',
        'football',
        'train',
      ]);
      expect(textsOfElements(column, '.bar-value')).toEqual(['10', '9', '6', '3']);
      expect(column.querySelector('.bar')?.getAttribute('style')).toBe(
        'width:100.0%;background:var(--neutral-bar)',
      );
    });

    it('shows fifteen words at most', () => {
      const analysis = chatAnalysis({ wordCounts: numberedCounts('word', 20) });

      const column = findColumn(renderSection(analysis), 'Most used words');

      expect(textsOfElements(column, '.bar-label')).toHaveLength(15);
      expect(textsOfElements(column, '.bar-label')[0]).toBe('word20');
    });

    it('groups the digits of a large count', () => {
      const analysis = chatAnalysis({ wordCounts: new Map([['dinner', 12345]]) });

      const column = findColumn(renderSection(analysis), 'Most used words');

      expect(textsOfElements(column, '.bar-value')).toEqual(['12,345']);
    });

    it('says so when the chat has no words', () => {
      const column = findColumn(renderSection(chatAnalysis()), 'Most used words');

      expect(textsOfElements(column, '.hint')).toEqual(['No words found.']);
      expect(column.querySelectorAll('.horizontal-bars')).toHaveLength(0);
    });
  });

  describe('most used emojis', () => {
    it('draws a chip per emoji with its count, the most used first', () => {
      const analysis = chatAnalysis({
        emojiCounts: new Map([
          [RED_HEART, 3],
          [FACE_WITH_TEARS_OF_JOY, 1200],
        ]),
      });

      const column = findColumn(renderSection(analysis), 'Most used emojis');

      expect(textsOfElements(column, '.chips .chip')).toEqual([
        `${FACE_WITH_TEARS_OF_JOY}1,200`,
        `${RED_HEART}3`,
      ]);
      expect(textsOfElements(column, '.chip small')).toEqual(['1,200', '3']);
    });

    it('keeps an emoji made of several code points in one piece', () => {
      const analysis = chatAnalysis({ emojiCounts: new Map([[FAMILY_MAN_WOMAN_GIRL, 2]]) });

      const column = findColumn(renderSection(analysis), 'Most used emojis');

      expect(textsOfElements(column, '.chip')).toEqual([`${FAMILY_MAN_WOMAN_GIRL}2`]);
    });

    it('shows sixteen emojis at most', () => {
      const analysis = chatAnalysis({ emojiCounts: numberedCounts('emoji', 20) });

      const column = findColumn(renderSection(analysis), 'Most used emojis');

      expect(textsOfElements(column, '.chip')).toHaveLength(16);
    });

    it('says so when the chat has no emojis', () => {
      const column = findColumn(renderSection(chatAnalysis()), 'Most used emojis');

      expect(textsOfElements(column, '.hint')).toEqual(['No emojis in this chat.']);
    });
  });

  describe('signature words', () => {
    it('lists the signature words of each person, with the person’s swatch', () => {
      const section = renderSection(anaAndBob);
      const rows = Array.from(section.querySelectorAll('.signature-row'), (row) => ({
        who: textsOfElements(row, '.person-name'),
        chips: textsOfElements(row, '.chip'),
      }));

      expect(rows).toEqual([
        { who: ['Ana'], chips: ['beach8'] },
        { who: ['Bob'], chips: ['football6'] },
      ]);
      expect(
        section.querySelector('.signature-row .person-name .colour-swatch')?.getAttribute('style'),
      ).toBe('background:var(--s1)');
    });

    it('explains what a signature word is', () => {
      const section = renderSection(anaAndBob);

      expect(textsOfElements(section, 'h3')).toContain('Signature words');
      expect(textsOfElements(section, '.hint')).toContain(
        'Words each person uses far more than the others.',
      );
    });

    it('leaves out a person who has none', () => {
      const carla = personStatistics({
        name: 'Carla',
        messageCount: 5,
        wordCounts: new Map([['dinner', 1]]),
      });
      const analysis = chatAnalysis({ people: [ana, bob, carla], wordCounts: chatWordCounts });

      expect(textsOfElements(renderSection(analysis), '.signature-row .person-name')).toEqual([
        'Ana',
        'Bob',
      ]);
    });

    it('leaves out the whole block when nobody has one', () => {
      const analysis = chatAnalysis({
        people: [
          personStatistics({ name: 'Ana', messageCount: 2, wordCounts: new Map([['dinner', 1]]) }),
          personStatistics({ name: 'Bob', messageCount: 1, wordCounts: new Map([['dinner', 1]]) }),
        ],
        wordCounts: new Map([['dinner', 2]]),
      });

      const section = renderSection(analysis);

      expect(textsOfElements(section, 'h3')).toEqual(['Most used words', 'Most used emojis']);
      expect(section.querySelectorAll('.signature-words')).toHaveLength(0);
    });

    it('leaves out the block in a chat with a single sender, who has nobody to differ from', () => {
      /*
       * Taken on its own, the arithmetic would give a lone sender signature
       * words: with nobody else writing, every frequent word of theirs stands
       * out against an empty rest. The section must not show them.
       */
      const loneSender = personStatistics({
        name: 'Ana',
        messageCount: 60,
        wordCounts: new Map([['olives', 40], ...numberedCounts('filler', 4)]),
      });
      const analysis = chatAnalysis({ people: [loneSender], wordCounts: loneSender.wordCounts });

      expect(findSignatureWords(loneSender, analysis.wordCounts)).not.toHaveLength(0);
      expect(renderSection(analysis).querySelectorAll('.signature-words')).toHaveLength(0);
      expect(textsOfElements(renderSection(analysis), 'h3')).not.toContain('Signature words');
    });

    it('is only worked out for the six people who have a colour', () => {
      const sevenPeople = Array.from({ length: 7 }, (_unused, index) => {
        const ownWord = `hobby${index + 1}`;
        return personStatistics({
          name: `Person ${index + 1}`,
          messageCount: 10 - index,
          wordCounts: new Map([[ownWord, 10]]),
        });
      });
      const wholeChat = new Map(sevenPeople.map((_person, index) => [`hobby${index + 1}`, 10]));

      const section = renderSection(chatAnalysis({ people: sevenPeople, wordCounts: wholeChat }));

      expect(textsOfElements(section, '.signature-row .person-name')).toEqual([
        'Person 1',
        'Person 2',
        'Person 3',
        'Person 4',
        'Person 5',
        'Person 6',
      ]);
    });
  });

  describe('words and emojis that contain markup', () => {
    /*
     * The parser cannot produce such a word or emoji, but the section accepts
     * any table of counts, so it must not rely on that.
     */
    const hostileWord = '<img src=x onerror=alert(1)>';
    const hostileEmoji = '<script>alert(2)</script>';
    const hostileAna = personStatistics({
      name: 'Ana',
      messageCount: 20,
      wordCounts: new Map([[hostileWord, 9]]),
    });
    const quietBob = personStatistics({
      name: 'Bob',
      messageCount: 10,
      wordCounts: new Map([['dinner', 5]]),
    });
    const analysis = chatAnalysis({
      people: [hostileAna, quietBob],
      wordCounts: new Map([
        [hostileWord, 9],
        ['dinner', 5],
      ]),
      emojiCounts: new Map([[hostileEmoji, 3]]),
    });

    it('creates no element from them', () => {
      const section = renderSection(analysis);

      expect(section.querySelectorAll('img, script')).toHaveLength(0);
    });

    it('shows the emoji as text in its chip', () => {
      const column = findColumn(renderSection(analysis), 'Most used emojis');

      expect(textsOfElements(column, '.chips:first-of-type .chip')).toEqual([`${hostileEmoji}3`]);
    });

    it('shows the word as text in the chip of the person whose signature it is', () => {
      const section = renderSection(analysis);

      expect(textsOfElements(section, '.signature-row .chip')).toEqual([
        `${hostileWord}9`,
        'dinner5',
      ]);
    });
  });

  it('shows a name with markup as text', () => {
    const hostileAna = { ...ana, name: '<img src=x onerror=alert(1)>' };
    const analysis = chatAnalysis({ people: [hostileAna, bob], wordCounts: chatWordCounts });

    const section = renderSection(analysis);

    expect(section.querySelectorAll('img')).toHaveLength(0);
    expect(textsOfElements(section, '.signature-row .person-name')[0]).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });
});
