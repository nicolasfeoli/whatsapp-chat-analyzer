import { describe, expect, it } from 'vitest';

import {
  MINIMUM_USES_FOR_SIGNATURE_PHRASE,
  SIGNATURE_PHRASES_PER_PERSON,
  findSignaturePhrases,
} from '../../../src/core/analysis/signature-phrases';

/**
 * Adds two tables of counts up, the way the chat's table holds everybody's phrases.
 */
function chatCountsOf(
  ...tables: readonly ReadonlyMap<string, number>[]
): ReadonlyMap<string, number> {
  const chatCounts = new Map<string, number>();
  for (const table of tables) {
    for (const [phrase, count] of table) {
      chatCounts.set(phrase, (chatCounts.get(phrase) ?? 0) + count);
    }
  }
  return chatCounts;
}

/** What the others in the chat say: ordinary phrases, used a lot. */
const others = new Map([
  ['good morning', 40],
  ['see you', 30],
  ['thank you', 30],
]);

describe('findSignaturePhrases', () => {
  it('finds a phrase the person uses and the others never do', () => {
    const ana = new Map([
      ['no way dude', 12],
      ['good morning', 10],
    ]);

    expect(findSignaturePhrases(ana, chatCountsOf(ana, others))).toEqual([
      { phrase: 'no way dude', count: 12 },
    ]);
  });

  it('leaves out a phrase everybody uses as much as the person does', () => {
    const ana = new Map(others);

    expect(findSignaturePhrases(ana, chatCountsOf(ana, others))).toEqual([]);
  });

  it('leaves out a phrase used fewer times than the minimum', () => {
    const ana = new Map([
      ['no way dude', MINIMUM_USES_FOR_SIGNATURE_PHRASE - 1],
      ['good morning', 20],
    ]);

    expect(findSignaturePhrases(ana, chatCountsOf(ana, others))).toEqual([]);
  });

  it('accepts a phrase used exactly the minimum number of times', () => {
    const ana = new Map([
      ['no way dude', MINIMUM_USES_FOR_SIGNATURE_PHRASE],
      ['good morning', 20],
    ]);

    expect(findSignaturePhrases(ana, chatCountsOf(ana, others))).toEqual([
      { phrase: 'no way dude', count: MINIMUM_USES_FOR_SIGNATURE_PHRASE },
    ]);
  });

  it('puts the most distinctive phrase first', () => {
    const ana = new Map([
      ['count me in', 8],
      ['no way dude', 30],
      ['good morning', 10],
    ]);

    const phrases = findSignaturePhrases(ana, chatCountsOf(ana, others));

    expect(phrases.map((signaturePhrase) => signaturePhrase.phrase)).toEqual([
      'no way dude',
      'count me in',
    ]);
  });

  it('keeps the longer of two overlapping phrases that are equally distinctive', () => {
    const ana = new Map([
      ['see you there', 12],
      ['you there', 12],
      ['good morning', 10],
    ]);

    expect(findSignaturePhrases(ana, chatCountsOf(ana, others))).toEqual([
      { phrase: 'see you there', count: 12 },
    ]);
  });

  it('keeps the more distinctive of two overlapping phrases, even when it is the shorter', () => {
    const ana = new Map([
      ['way dude', 30],
      ['no way dude', 10],
      ['good morning', 10],
    ]);

    expect(findSignaturePhrases(ana, chatCountsOf(ana, others))).toEqual([
      { phrase: 'way dude', count: 30 },
    ]);
  });

  it('does not take a phrase for part of another when only letters overlap', () => {
    const ana = new Map([
      ['the cat', 12],
      ['the catalogue', 12],
      ['good morning', 10],
    ]);

    const phrases = findSignaturePhrases(ana, chatCountsOf(ana, others));

    expect(phrases.map((signaturePhrase) => signaturePhrase.phrase).sort()).toEqual([
      'the cat',
      'the catalogue',
    ]);
  });

  it('returns at most five phrases', () => {
    const ana = new Map<string, number>([['good morning', 10]]);
    for (const word of ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf']) {
      ana.set(`${word} time`, 10);
    }

    expect(findSignaturePhrases(ana, chatCountsOf(ana, others))).toHaveLength(
      SIGNATURE_PHRASES_PER_PERSON,
    );
  });

  it('returns nothing for a person without phrases', () => {
    expect(findSignaturePhrases(new Map(), others)).toEqual([]);
  });

  it('counts a phrase missing from the table of the chat as used by nobody else', () => {
    const ana = new Map([['no way dude', 12]]);

    expect(findSignaturePhrases(ana, others)).toEqual([{ phrase: 'no way dude', count: 12 }]);
  });
});
