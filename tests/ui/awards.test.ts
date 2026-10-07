import { describe, expect, it } from 'vitest';

import type { PersonStatistics } from '../../src/core/types';
import {
  AWARD_RULES,
  MINIMUM_CONVERSATIONS_FOR_AWARD,
  MINIMUM_MEDIA_FOR_AWARD,
  MINIMUM_UNANSWERED_QUESTIONS_FOR_AWARD,
  collectAwards,
  countWhenAtLeast,
  findAwardWinner,
} from '../../src/ui/awards';
import type { Award, AwardRule } from '../../src/ui/awards';
import { chatAnalysis, personStatistics } from '../fixtures/analysis-builders';
import type { PersonStatisticsParts } from '../fixtures/analysis-builders';

/** One second and one minute, for reply delays. */
const SECOND = 1000;
const MINUTE = 60 * SECOND;

/**
 * Finds the rule of an award by its title and fails the test when there is none.
 */
function ruleCalled(title: string): AwardRule {
  const rule = AWARD_RULES.find((candidate) => candidate.title === title);
  if (rule === undefined) {
    throw new Error(`There is no award called "${title}"`);
  }
  return rule;
}

/**
 * Gives out one award in a chat of Ana and Bob, Ana being the more active, and
 * writes the result as "name: reason"; `null` when nobody takes it.
 */
function giveAward(
  title: string,
  anaParts: Partial<PersonStatistics>,
  bobParts: Partial<PersonStatistics>,
): string | null {
  const analysis = chatAnalysis({
    conversationCount: 40,
    people: [
      personStatistics({ name: 'Ana', messageCount: 200, ...anaParts }),
      personStatistics({ name: 'Bob', messageCount: 100, ...bobParts }),
    ],
  });
  const award = collectAwards(analysis, 'most-active', [ruleCalled(title)])[0];
  return award === undefined ? null : `${award.winner.name}: ${award.reason}`;
}

/** Five reply delays whose median is the third. */
function fiveRepliesAround(medianDelay: number): number[] {
  return [SECOND, 2 * SECOND, medianDelay, 20 * MINUTE, 30 * MINUTE];
}

describe('countWhenAtLeast', () => {
  it('keeps a count that reaches the minimum', () => {
    expect(countWhenAtLeast(10, 10)).toBe(10);
  });

  it('leaves out a count below the minimum', () => {
    expect(countWhenAtLeast(9, 10)).toBeNull();
  });
});

describe('AWARD_RULES', () => {
  it('lists the awards in the order the page shows them', () => {
    expect(AWARD_RULES.map((rule) => rule.title)).toEqual([
      'The night owl',
      'The novelist',
      'The lightning',
      'The opener',
      'The last word',
      'The sticker dealer',
      'The photographer',
      'The voice',
      'The comedian',
      'The question mark',
      'The emoji fan',
      'The cliffhanger',
    ]);
  });

  it('gives every award a title of its own', () => {
    const titles = AWARD_RULES.map((rule) => rule.title);

    expect(new Set(titles).size).toBe(titles.length);
  });

  describe('"The night owl"', () => {
    it('goes to the largest share of night messages, not the largest count', () => {
      /* Ana: 30 of 200 is 15%. Bob: 25 of 100 is 25%. */
      expect(giveAward('The night owl', { nightMessageCount: 30 }, { nightMessageCount: 25 })).toBe(
        'Bob: 25% of their messages are sent between midnight and 5:00',
      );
    });

    it('needs twenty messages: nineteen do not count, twenty do', () => {
      const nineteen = { messageCount: 19, nightMessageCount: 19 };
      const twenty = { messageCount: 20, nightMessageCount: 20 };

      expect(giveAward('The night owl', {}, nineteen)).toBeNull();
      expect(giveAward('The night owl', {}, twenty)).toContain('Bob: 100%');
    });

    it('needs 3% of the messages at night: 5 of 200 is 2.5%, 6 of 200 is 3%', () => {
      expect(giveAward('The night owl', { nightMessageCount: 5 }, {})).toBeNull();
      expect(giveAward('The night owl', { nightMessageCount: 6 }, {})).toContain('Ana: 3.0%');
    });
  });

  describe('"The novelist"', () => {
    it('goes to the most words per typed message', () => {
      /* Ana: 300 words in 100 messages is 3.0. Bob: 620 in 50 is 12.4. */
      expect(
        giveAward(
          'The novelist',
          { textMessageCount: 100, wordCount: 300 },
          { textMessageCount: 50, wordCount: 620 },
        ),
      ).toBe('Bob: 12.4 words per message on average');
    });

    it('needs ten typed messages: nine do not count, ten do', () => {
      const nine = { textMessageCount: 9, wordCount: 900 };
      const ten = { textMessageCount: 10, wordCount: 900 };

      expect(giveAward('The novelist', {}, nine)).toBeNull();
      expect(giveAward('The novelist', {}, ten)).toBe('Bob: 90.0 words per message on average');
    });
  });

  describe('"The lightning"', () => {
    it('goes to the shortest typical reply time', () => {
      expect(
        giveAward(
          'The lightning',
          { replyDelaysInMilliseconds: fiveRepliesAround(4 * MINUTE) },
          { replyDelaysInMilliseconds: fiveRepliesAround(45 * SECOND) },
        ),
      ).toBe('Bob: typically replies in 45 s');
    });

    it('needs five replies: four do not count', () => {
      const fourFastReplies = [SECOND, SECOND, SECOND, SECOND];

      expect(
        giveAward(
          'The lightning',
          { replyDelaysInMilliseconds: fiveRepliesAround(4 * MINUTE) },
          { replyDelaysInMilliseconds: fourFastReplies },
        ),
      ).toBe('Ana: typically replies in 4 min');
    });

    it('does not claim seconds for an export that records minutes only', () => {
      const analysis = chatAnalysis({
        timestampResolution: 'minute',
        people: [
          personStatistics({ name: 'Ana', replyDelaysInMilliseconds: [0, 0, 0, 0, 0] }),
          personStatistics({ name: 'Bob' }),
        ],
      });

      expect(collectAwards(analysis, 'most-active', [ruleCalled('The lightning')])).toEqual([
        {
          title: 'The lightning',
          winner: analysis.people[0],
          reason: 'typically replies in under 1 min',
        },
      ]);
    });
  });

  describe('"The opener"', () => {
    it('goes to whoever started the most conversations, out of all of them', () => {
      expect(
        giveAward(
          'The opener',
          { conversationsStartedCount: 12 },
          { conversationsStartedCount: 28 },
        ),
      ).toBe('Bob: started 28 of the 40 conversations');
    });

    it(`needs ${String(MINIMUM_CONVERSATIONS_FOR_AWARD)} conversations started: four do not count, five do`, () => {
      expect(giveAward('The opener', { conversationsStartedCount: 4 }, {})).toBeNull();
      expect(giveAward('The opener', { conversationsStartedCount: 5 }, {})).toContain('Ana');
    });
  });

  describe('"The last word"', () => {
    it('goes to whoever closed the most conversations', () => {
      expect(
        giveAward(
          'The last word',
          { conversationsEndedCount: 25 },
          { conversationsEndedCount: 14 },
        ),
      ).toBe('Ana: wrote the last message of 25 conversations');
    });

    it('needs five conversations closed: four do not count, five do', () => {
      expect(giveAward('The last word', {}, { conversationsEndedCount: 4 })).toBeNull();
      expect(giveAward('The last word', {}, { conversationsEndedCount: 5 })).toContain('Bob');
    });
  });

  describe.each([
    { title: 'The sticker dealer', mediaType: 'sticker', reason: '1,340 stickers sent' },
    { title: 'The photographer', mediaType: 'photo', reason: '1,340 photos sent' },
    { title: 'The voice', mediaType: 'audio', reason: '1,340 voice and audio messages sent' },
  ] as const)('"$title"', ({ title, mediaType, reason }) => {
    it('goes to whoever sent the most of them', () => {
      expect(
        giveAward(
          title,
          { mediaCountsByType: new Map([[mediaType, 20]]) },
          { mediaCountsByType: new Map([[mediaType, 1340]]) },
        ),
      ).toBe(`Bob: ${reason}`);
    });

    it(`needs ${String(MINIMUM_MEDIA_FOR_AWARD)} of them: nine do not count, ten do`, () => {
      expect(giveAward(title, { mediaCountsByType: new Map([[mediaType, 9]]) }, {})).toBeNull();
      expect(giveAward(title, { mediaCountsByType: new Map([[mediaType, 10]]) }, {})).toContain(
        'Ana: 10 ',
      );
    });

    it('does not count media of another type', () => {
      expect(giveAward(title, { mediaCountsByType: new Map([['video', 500]]) }, {})).toBeNull();
    });
  });

  describe.each([
    {
      title: 'The comedian',
      field: 'laughingMessageCount',
      reason: '40% of their messages contain a laugh such as jaja or haha',
    },
    {
      title: 'The question mark',
      field: 'questionCount',
      reason: '40% of their messages ask a question',
    },
  ] as const)('"$title"', ({ title, field, reason }) => {
    it('goes to the largest share of typed messages, not the largest count', () => {
      /* Ana: 30 of 150 is 20%. Bob: 20 of 50 is 40%. */
      expect(
        giveAward(
          title,
          { textMessageCount: 150, [field]: 30 },
          { textMessageCount: 50, [field]: 20 },
        ),
      ).toBe(`Bob: ${reason}`);
    });

    it('needs ten typed messages: nine do not count, ten do', () => {
      expect(giveAward(title, {}, { textMessageCount: 9, [field]: 9 })).toBeNull();
      expect(giveAward(title, {}, { textMessageCount: 10, [field]: 9 })).toContain('Bob: 90%');
    });

    it('is not given when nobody has any', () => {
      expect(giveAward(title, { textMessageCount: 150 }, { textMessageCount: 50 })).toBeNull();
    });
  });

  describe('"The emoji fan"', () => {
    it('goes to the most emojis per typed message', () => {
      /* Ana: 60 emojis in 150 messages is 0.4. Bob: 90 in 50 is 1.8. */
      expect(
        giveAward(
          'The emoji fan',
          { textMessageCount: 150, emojiCount: 60 },
          { textMessageCount: 50, emojiCount: 90 },
        ),
      ).toBe('Bob: 1.8 emojis per typed message');
    });

    it('is not given in a chat without emojis', () => {
      expect(
        giveAward('The emoji fan', { textMessageCount: 150 }, { textMessageCount: 50 }),
      ).toBeNull();
    });
  });

  describe('"The cliffhanger"', () => {
    it('goes to whoever has the most questions left without an answer', () => {
      expect(
        giveAward(
          'The cliffhanger',
          { unansweredQuestionCount: 4 },
          { unansweredQuestionCount: 12 },
        ),
      ).toBe('Bob: 12 questions still waiting for an answer');
    });

    it(`needs ${String(MINIMUM_UNANSWERED_QUESTIONS_FOR_AWARD)} such questions: two do not count, three do`, () => {
      expect(giveAward('The cliffhanger', { unansweredQuestionCount: 2 }, {})).toBeNull();
      expect(giveAward('The cliffhanger', { unansweredQuestionCount: 3 }, {})).toBe(
        'Ana: 3 questions still waiting for an answer',
      );
    });
  });
});

describe('findAwardWinner', () => {
  /** An award for the highest, and one for the lowest, number of deleted messages. */
  const mostDeleted: AwardRule = {
    title: 'Most deleted',
    preference: 'highest',
    scoreOf: (person) => (person.deletedCount === 0 ? null : person.deletedCount),
    describe: (score) => `${String(score)} deleted`,
  };
  const fewestDeleted: AwardRule = {
    ...mostDeleted,
    title: 'Fewest deleted',
    preference: 'lowest',
  };

  /** Builds a chat of the people given, in their order. */
  function chatOf(...parts: PersonStatisticsParts[]): ReturnType<typeof chatAnalysis> {
    return chatAnalysis({ people: parts.map((part) => personStatistics(part)) });
  }

  it('picks the highest score when the rule prefers it', () => {
    const analysis = chatOf({ name: 'Ana', deletedCount: 2 }, { name: 'Bob', deletedCount: 7 });

    const winner = findAwardWinner(mostDeleted, analysis.people, analysis);

    expect(winner?.person.name).toBe('Bob');
    expect(winner?.value).toBe(7);
  });

  it('picks the lowest score when the rule prefers that', () => {
    const analysis = chatOf({ name: 'Ana', deletedCount: 2 }, { name: 'Bob', deletedCount: 7 });

    expect(findAwardWinner(fewestDeleted, analysis.people, analysis)?.person.name).toBe('Ana');
  });

  it.each([mostDeleted, fewestDeleted])(
    'gives a tie to the person listed first, who wrote more ($title)',
    (rule) => {
      const analysis = chatOf(
        { name: 'Ana', messageCount: 90, deletedCount: 1 },
        { name: 'Bob', messageCount: 50, deletedCount: 4 },
        { name: 'Carla', messageCount: 10, deletedCount: 4 },
        { name: 'Dani', messageCount: 5, deletedCount: 1 },
      );

      const expectedWinner = rule.preference === 'highest' ? 'Bob' : 'Ana';

      expect(findAwardWinner(rule, analysis.people, analysis)?.person.name).toBe(expectedWinner);
    },
  );

  it('passes over the people who do not qualify', () => {
    const analysis = chatOf({ name: 'Ana' }, { name: 'Bob', deletedCount: 1 });

    expect(findAwardWinner(fewestDeleted, analysis.people, analysis)?.person.name).toBe('Bob');
  });

  it('finds no winner when nobody qualifies', () => {
    const analysis = chatOf({ name: 'Ana' }, { name: 'Bob' });

    expect(findAwardWinner(mostDeleted, analysis.people, analysis)).toBeNull();
  });
});

describe('collectAwards', () => {
  /** Ten people; the tenth sent every sticker of the chat. */
  const tenPeople = Array.from({ length: 10 }, (_unused, index) =>
    personStatistics({
      name: `Person ${String(index + 1)}`,
      messageCount: 1000 - index * 100,
      mediaCountsByType: new Map([['sticker', index === 9 ? 80 : 0]]),
      conversationsStartedCount: 10 - index,
    }),
  );
  const largeGroup = chatAnalysis({ people: tenPeople, conversationCount: 55 });

  /** Writes the awards as "title: name". */
  function summarise(awards: readonly Award[]): string[] {
    return awards.map((award) => `${award.title}: ${award.winner.name}`);
  }

  it('gives only the awards somebody qualifies for, in the order of the rules', () => {
    expect(summarise(collectAwards(largeGroup, 'everyone'))).toEqual([
      'The opener: Person 1',
      'The sticker dealer: Person 10',
    ]);
  });

  it('lets only the most active people compete unless asked for everyone', () => {
    expect(summarise(collectAwards(largeGroup))).toEqual(['The opener: Person 1']);
  });

  it('gives nothing in a chat where nobody has enough to show', () => {
    expect(collectAwards(chatAnalysis())).toEqual([]);
  });
});
