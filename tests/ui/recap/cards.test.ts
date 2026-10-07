import { describe, expect, it } from 'vitest';

import type { ChatAnalysis } from '../../../src/core/types';
import { anonymiseAnalysis } from '../../../src/ui/anonymise';
import {
  MINIMUM_DISTINCTIVE_RATIO,
  MINIMUM_OTHER_WORDS_FOR_COMPARISON,
  MINIMUM_USES_FOR_TERM_OF_YEAR,
  buildRecapCards,
  countMessagesByMonth,
  describePaceAgainstPreviousYear,
  findTermOfYear,
  formatDailyPace,
  formatTimesAsOften,
} from '../../../src/ui/recap/cards';
import type { RecapCard, RecapCardKind, RecapContext } from '../../../src/ui/recap/cards';
import type { YearSummary } from '../../../src/ui/recap/years';
import { chatAnalysis, heatmapWith, personStatistics } from '../../fixtures/analysis-builders';
import { localMidnight } from '../../fixtures/messages';

/** Builds the summary of a year the chat runs through from January to December. */
function wholeYear(year: number, messageCount: number): YearSummary {
  return {
    year,
    messageCount,
    period: { firstDayKey: year * 10000 + 101, lastDayKey: year * 10000 + 1231 },
    coveredDayCount: 365,
  };
}

/**
 * The year 2025 of a group of four: 1,000 messages, most of them in March,
 * with a streak, a night owl and a word the other years hardly know.
 */
const year2025 = chatAnalysis({
  totalMessageCount: 1000,
  activeDayCount: 240,
  conversationCount: 310,
  messageCountsByDayKey: new Map([
    [20250110, 100],
    [20250314, 250],
    [20250315, 350],
    [20250720, 300],
  ]),
  busiestDay: { date: localMidnight('2025-03-15'), messageCount: 350 },
  longestStreak: {
    lengthInDays: 23,
    from: localMidnight('2025-03-01'),
    to: localMidnight('2025-03-23'),
  },
  weekdayHourHeatmap: heatmapWith([
    { weekdayIndex: 6, hour: 21, messageCount: 90 },
    { weekdayIndex: 5, hour: 12, messageCount: 80 },
    { weekdayIndex: 5, hour: 13, messageCount: 70 },
    { weekdayIndex: 2, hour: 21, messageCount: 20 },
  ]),
  wordCounts: new Map([
    ['dinner', 40],
    ['lisbon', 30],
    ['maybe', 3],
  ]),
  emojiCounts: new Map([
    ['😂', 60],
    ['🎉', 12],
  ]),
  people: [
    personStatistics({
      name: 'Ana',
      messageCount: 500,
      wordCount: 3000,
      nightMessageCount: 100,
      conversationsStartedCount: 200,
    }),
    personStatistics({
      name: 'Bob',
      messageCount: 300,
      wordCount: 1500,
      nightMessageCount: 3,
      conversationsStartedCount: 100,
    }),
    personStatistics({ name: 'Carla', messageCount: 150, wordCount: 400 }),
    personStatistics({ name: 'Dani', messageCount: 50, wordCount: 100 }),
  ],
});

/** The whole chat that year belongs to: "dinner" is said every year, "lisbon" only in 2025. */
const wholeChat = chatAnalysis({
  wordCounts: new Map([
    ['dinner', 640],
    ['lisbon', 31],
    ['maybe', 400],
    ['work', 600],
  ]),
  emojiCounts: new Map([
    ['😂', 400],
    ['🎉', 14],
    ['👍', 200],
  ]),
});

/** What the cards of 2025 are told about the chat around the year. */
const contextOf2025: RecapContext = {
  yearSummary: wholeYear(2025, 1000),
  previousYearSummary: wholeYear(2024, 800),
  wholeChatAnalysis: wholeChat,
  peopleShown: 'most-active',
};

/** Finds a card by what it is about and fails the test when it was left out. */
function cardOf(cards: readonly RecapCard[], kind: RecapCardKind): RecapCard {
  const card = cards.find((candidate) => candidate.kind === kind);
  if (card === undefined) {
    throw new Error(`The recap has no "${kind}" card`);
  }
  return card;
}

/** Lists what the cards are about, in order. */
function kindsOf(cards: readonly RecapCard[]): RecapCardKind[] {
  return cards.map((card) => card.kind);
}

/** Builds the cards of an analysis that stands for 2025, with the parts of the context a test changes. */
function cardsFor(analysis: ChatAnalysis, context: Partial<RecapContext> = {}): RecapCard[] {
  return buildRecapCards(analysis, { ...contextOf2025, ...context });
}

describe('buildRecapCards', () => {
  it('tells a full year of a group in nine cards, from the numbers to the closing', () => {
    expect(kindsOf(cardsFor(year2025))).toEqual([
      'messages',
      'busiest',
      'people',
      'rhythm',
      'word',
      'emoji',
      'streak',
      'awards',
      'closing',
    ]);
  });

  it('gives every card a label, a headline and between one and three lines', () => {
    for (const card of cardsFor(year2025)) {
      expect(card.label).not.toBe('');
      expect(card.headline).not.toBe('');
      expect(card.lines.length).toBeGreaterThanOrEqual(1);
      expect(card.lines.length).toBeLessThanOrEqual(3);
    }
  });

  describe('the opening card', () => {
    it('leads with the messages of the year and the days somebody wrote on', () => {
      const card = cardOf(cardsFor(year2025), 'messages');

      expect(card.headline).toBe('1,000 messages in 2025');
      expect(card.lines[0]).toBe('Somebody wrote on 240 of its 365 days.');
    });

    it('compares the pace with the year before', () => {
      const card = cardOf(cardsFor(year2025), 'messages');

      /* 1,000 / 365 = 2.74 a day against 800 / 365 = 2.19: a quarter more. */
      expect(card.lines[1]).toBe('25% more a day than in 2024: 2.2 a day then, 2.7 now.');
    });

    it('says nothing about a year before when the chat has none', () => {
      const card = cardOf(cardsFor(year2025, { previousYearSummary: null }), 'messages');

      expect(card.lines).toHaveLength(1);
    });

    it('says that the export covers only part of the year it starts or ends in', () => {
      const partOfYear: YearSummary = {
        year: 2025,
        messageCount: 1000,
        period: { firstDayKey: 20250101, lastDayKey: 20250720 },
        coveredDayCount: 201,
      };

      const card = cardOf(cardsFor(year2025, { yearSummary: partOfYear }), 'messages');

      expect(card.lines[0]).toBe(
        'Somebody wrote on 240 of the 201 days of 2025 that this export covers.',
      );
    });
  });

  describe('the card of the peaks', () => {
    it('names the busiest month with its share, and the busiest day', () => {
      const card = cardOf(cardsFor(year2025), 'busiest');

      expect(card.headline).toBe('March was the busiest month');
      expect(card.lines).toEqual([
        '600 messages, 60% of the year.',
        'The busiest single day was 15 Mar 2025, with 350 messages.',
      ]);
    });

    it('leads with the day when every message of the year falls in one month', () => {
      const oneMonth = chatAnalysis({
        messageCountsByDayKey: new Map([
          [20250314, 250],
          [20250315, 350],
        ]),
        busiestDay: { date: localMidnight('2025-03-15'), messageCount: 350 },
      });

      const card = cardOf(cardsFor(oneMonth), 'busiest');

      expect(card.headline).toBe('15 Mar 2025 was the busiest day');
      expect(card.lines).toEqual(['350 messages on that one day.']);
    });
  });

  describe('the card of who wrote most', () => {
    it('lists the first three people with their messages and shares', () => {
      const card = cardOf(cardsFor(year2025), 'people');

      expect(card.headline).toBe('Ana wrote the most');
      expect(card.lines).toEqual([
        '1. Ana: 500 messages, 50%',
        '2. Bob: 300 messages, 30%',
        '3. Carla: 150 messages, 15%',
      ]);
    });

    it('lists both people of a chat of two', () => {
      const chatOfTwo = chatAnalysis({
        people: [
          personStatistics({ name: 'Marta', messageCount: 60 }),
          personStatistics({ name: 'Diego', messageCount: 40 }),
        ],
      });

      expect(cardOf(cardsFor(chatOfTwo), 'people').lines).toEqual([
        '1. Marta: 60 messages, 60%',
        '2. Diego: 40 messages, 40%',
      ]);
    });

    it('calls nobody first when the two most active wrote exactly as much', () => {
      const levelChat = chatAnalysis({
        people: [
          personStatistics({ name: 'Marta', messageCount: 50 }),
          personStatistics({ name: 'Diego', messageCount: 50 }),
        ],
      });

      expect(cardOf(cardsFor(levelChat), 'people').headline).toBe(
        'Marta and Diego wrote exactly as much',
      );
    });

    it('is left out, with the titles, of a year in which one person wrote alone', () => {
      const monologue = chatAnalysis({
        people: [personStatistics({ name: 'Ana', messageCount: 200, nightMessageCount: 50 })],
      });

      const kinds = kindsOf(cardsFor(monologue));

      expect(kinds).not.toContain('people');
      expect(kinds).not.toContain('awards');
    });
  });

  describe('the card of the rhythm', () => {
    it('names the busiest hour of the week, then the busiest weekday and hour on their own', () => {
      const card = cardOf(cardsFor(year2025), 'rhythm');

      /* Sunday 21:00 is the fullest slot; Saturday has 150 in all, and 21:00 has 110 over the week. */
      expect(card.headline).toBe('Most alive on Sundays around 21:00');
      expect(card.lines).toEqual([
        '90 messages of the year landed in that one hour of the week.',
        'Taken on their own, Saturday was the busiest weekday and 21:00 to 21:59 the busiest hour.',
      ]);
    });

    it('is left out when the hours of the year are not known', () => {
      expect(kindsOf(cardsFor(chatAnalysis()))).not.toContain('rhythm');
    });
  });

  describe('the cards of the word and the emoji', () => {
    it('pick the word that sets the year apart and say how it was picked', () => {
      const card = cardOf(cardsFor(year2025), 'word');

      expect(card.label).toBe('Word of the year');
      expect(card.headline).toBe('“lisbon”');
      /* The year counts 73 words and the other years 1,598, one of them "lisbon": 30 × 1,598 / 73 = 657. */
      expect(card.lines[0]).toBe(
        'Written 30 times in 2025: 657 times as often as in the rest of the chat.',
      );
      expect(card.lines[1]).toBe(
        'Picked as the word that sets 2025 apart, not as the one used most.',
      );
    });

    it('pick the emoji that sets the year apart', () => {
      const card = cardOf(cardsFor(year2025), 'emoji');

      expect(card.label).toBe('Emoji of the year');
      expect(card.headline).toBe('🎉');
      expect(card.lines[0]).toContain('Sent 12 times in 2025');
    });

    it('fall back to the most used ones, and say so, when the chat has no other year', () => {
      const cards = cardsFor(year2025, { wholeChatAnalysis: year2025 });

      expect(cardOf(cards, 'word').label).toBe('Most used word');
      expect(cardOf(cards, 'word').headline).toBe('“dinner”');
      expect(cardOf(cards, 'word').lines).toEqual([
        'Written 40 times in 2025, more than any other word, the small words every chat is full of aside.',
        'It is the word used most, not one picked for standing out.',
      ]);
      expect(cardOf(cards, 'emoji').label).toBe('Most used emoji');
      expect(cardOf(cards, 'emoji').headline).toBe('😂');
      expect(cardOf(cards, 'emoji').lines[0]).toBe(
        'Sent 60 times in 2025, more than any other emoji.',
      );
    });

    it('are left out of a year without a word or an emoji used often enough', () => {
      const quietYear = chatAnalysis({
        wordCounts: new Map([['dinner', MINIMUM_USES_FOR_TERM_OF_YEAR - 1]]),
      });

      const kinds = kindsOf(cardsFor(quietYear, { wholeChatAnalysis: quietYear }));

      expect(kinds).not.toContain('word');
      expect(kinds).not.toContain('emoji');
    });
  });

  describe('the card of the streak', () => {
    it('gives the length and the days of the longest streak', () => {
      const card = cardOf(cardsFor(year2025), 'streak');

      expect(card.headline).toBe('23 days in a row');
      expect(card.lines).toEqual([
        'From 1 Mar 2025 to 23 Mar 2025, not a day went by without a message.',
      ]);
    });

    it('is left out when no two days in a row had a message', () => {
      expect(kindsOf(cardsFor(chatAnalysis()))).not.toContain('streak');
    });
  });

  describe('the card of the titles', () => {
    it('names the first three awards of the year with their winners and numbers', () => {
      const card = cardOf(cardsFor(year2025), 'awards');

      expect(card.headline).toBe('The titles of 2025');
      expect(card.lines).toEqual([
        'The night owl: Ana (20% of their messages are sent between midnight and 5:00)',
        'The opener: Ana (started 200 of the 310 conversations)',
      ]);
    });

    it('is left out when nobody qualifies for a title', () => {
      const smallYear = chatAnalysis({
        people: [
          personStatistics({ name: 'Ana', messageCount: 3 }),
          personStatistics({ name: 'Bob', messageCount: 2 }),
        ],
      });

      expect(kindsOf(cardsFor(smallYear))).not.toContain('awards');
    });

    it('lets everyone compete only when everyone is shown', () => {
      const nightOwlInNinthPlace = chatAnalysis({
        people: [
          ...['Ana', 'Bob', 'Carla', 'Dani', 'Marta', 'Diego', 'Elena', 'Félix'].map((name) =>
            personStatistics({ name, messageCount: 100 }),
          ),
          personStatistics({ name: 'Gala', messageCount: 40, nightMessageCount: 20 }),
        ],
      });

      expect(kindsOf(cardsFor(nightOwlInNinthPlace))).not.toContain('awards');
      expect(
        cardOf(cardsFor(nightOwlInNinthPlace, { peopleShown: 'everyone' }), 'awards').lines,
      ).toEqual(['The night owl: Gala (50% of their messages are sent between midnight and 5:00)']);
    });
  });

  describe('the closing card', () => {
    it('adds up the people, the conversations and the words of the year', () => {
      const card = cardOf(cardsFor(year2025), 'closing');

      expect(card.headline).toBe('That was 2025');
      expect(card.lines).toEqual([
        '4 people, 310 conversations and 5,000 words typed.',
        'Thank you for a year of talking. Here is to the next one.',
      ]);
    });

    it('writes one person and one conversation in the singular', () => {
      const card = cardOf(cardsFor(chatAnalysis()), 'closing');

      expect(card.lines[0]).toBe('1 person, 1 conversation and 0 words typed.');
    });
  });

  describe('with names hidden', () => {
    it('writes labels wherever a card names somebody', () => {
      const cards = buildRecapCards(anonymiseAnalysis(year2025), {
        ...contextOf2025,
        wholeChatAnalysis: anonymiseAnalysis(wholeChat),
      });

      const everyText = cards.flatMap((card) => [card.label, card.headline, ...card.lines]);
      expect(cardOf(cards, 'people').headline).toBe('Person A wrote the most');
      expect(cardOf(cards, 'awards').lines[0]).toContain('The night owl: Person A (');
      for (const name of ['Ana', 'Bob', 'Carla', 'Dani']) {
        expect(everyText.join('\n')).not.toContain(name);
      }
    });
  });
});

describe('findTermOfYear', () => {
  /** Enough other words to compare with, spread over one filler word. */
  const FILLER_COUNT = MINIMUM_OTHER_WORDS_FOR_COMPARISON;

  it('returns null when nothing was used often enough', () => {
    const yearCounts = new Map([['dinner', MINIMUM_USES_FOR_TERM_OF_YEAR - 1]]);

    expect(findTermOfYear(yearCounts, yearCounts, 0)).toBeNull();
  });

  it('takes a term with exactly the minimum of uses', () => {
    const yearCounts = new Map([['dinner', MINIMUM_USES_FOR_TERM_OF_YEAR]]);

    expect(findTermOfYear(yearCounts, yearCounts, 0)?.term).toBe('dinner');
  });

  it('takes the most used term when the rest of the chat is one term short of comparable', () => {
    const yearCounts = new Map([
      ['dinner', 40],
      ['lisbon', 30],
    ]);
    const wholeChatCounts = new Map([
      ['dinner', 40 + FILLER_COUNT - 1],
      ['lisbon', 30],
    ]);

    expect(findTermOfYear(yearCounts, wholeChatCounts, FILLER_COUNT)).toEqual({
      term: 'dinner',
      count: 40,
      kind: 'most-used',
      timesAsOften: null,
    });
  });

  it('takes the distinctive term once the rest of the chat is large enough', () => {
    const yearCounts = new Map([
      ['dinner', 40],
      ['lisbon', 30],
    ]);
    const wholeChatCounts = new Map([
      ['dinner', 40 + FILLER_COUNT],
      ['lisbon', 30],
    ]);

    expect(findTermOfYear(yearCounts, wholeChatCounts, FILLER_COUNT)).toEqual({
      term: 'lisbon',
      count: 30,
      kind: 'distinctive',
      timesAsOften: null,
    });
  });

  it('measures a term against what the rest of the chat would lead one to expect', () => {
    /* The year holds 100 terms and the rest 1,000. "trip" is 10 of the rest, so 1 would be expected; 20 is 20 times that. */
    const yearCounts = new Map([
      ['trip', 20],
      ['work', 80],
    ]);
    const wholeChatCounts = new Map([
      ['trip', 30],
      ['work', 1070],
    ]);

    expect(findTermOfYear(yearCounts, wholeChatCounts, 500)).toEqual({
      term: 'trip',
      count: 20,
      kind: 'distinctive',
      timesAsOften: 20,
    });
  });

  it('prefers the term with the most uses beyond the expected to a rarer new one', () => {
    /* Year 200 terms, rest 1,000. "beach": expected 20 × 0.2 = 4, excess 56. "ferry": never before, excess 6. */
    const yearCounts = new Map([
      ['beach', 60],
      ['ferry', 6],
      ['work', 134],
    ]);
    const wholeChatCounts = new Map([
      ['beach', 80],
      ['ferry', 6],
      ['work', 1114],
    ]);

    expect(findTermOfYear(yearCounts, wholeChatCounts, 500)?.term).toBe('beach');
  });

  it('counts a term as distinctive at exactly one and a half times the expected, not below', () => {
    /* Year 100 terms, rest 1,000: a term with 100 uses in the rest is expected 10 times. */
    const wholeChatWith = (yearCount: number): Map<string, number> =>
      new Map([
        ['trip', 100 + yearCount],
        ['work', 900 + (100 - yearCount)],
      ]);
    const atThreshold = 10 * MINIMUM_DISTINCTIVE_RATIO;
    const yearWith = (yearCount: number): Map<string, number> =>
      new Map([
        ['trip', yearCount],
        ['work', 100 - yearCount],
      ]);

    expect(findTermOfYear(yearWith(atThreshold), wholeChatWith(atThreshold), 500)?.kind).toBe(
      'distinctive',
    );
    expect(
      findTermOfYear(yearWith(atThreshold - 1), wholeChatWith(atThreshold - 1), 500)?.term,
    ).toBe('work');
  });

  it('falls back to the most used term when nothing stands out', () => {
    const yearCounts = new Map([
      ['work', 60],
      ['home', 40],
    ]);
    const wholeChatCounts = new Map([
      ['work', 660],
      ['home', 440],
    ]);

    expect(findTermOfYear(yearCounts, wholeChatCounts, 500)).toEqual({
      term: 'work',
      count: 60,
      kind: 'most-used',
      timesAsOften: null,
    });
  });

  it('never picks a term the whole chat no longer lists, as a name is with names hidden', () => {
    const yearCounts = new Map([
      ['félix', 90],
      ['dinner', 10],
    ]);
    const wholeChatCountsWithoutNames = new Map([
      ['dinner', 20],
      ['work', 1000],
    ]);

    expect(findTermOfYear(yearCounts, wholeChatCountsWithoutNames, 500)?.term).toBe('dinner');
    expect(findTermOfYear(new Map([['félix', 90]]), wholeChatCountsWithoutNames, 500)).toBeNull();
  });
});

describe('describePaceAgainstPreviousYear', () => {
  it('calls a change of under a twentieth about the same pace', () => {
    /* 1,040 against 1,000 over the same days is 4% more. */
    expect(describePaceAgainstPreviousYear(wholeYear(2025, 1040), wholeYear(2024, 1000))).toBe(
      'About the same pace as in 2024: 2.7 a day then, 2.8 now.',
    );
  });

  it('names a change of a twentieth and more', () => {
    /* 1,060 against 1,000 is 6% more. */
    expect(describePaceAgainstPreviousYear(wholeYear(2025, 1060), wholeYear(2024, 1000))).toBe(
      '6.0% more a day than in 2024: 2.7 a day then, 2.9 now.',
    );
  });

  it('says fewer when the year was quieter', () => {
    expect(describePaceAgainstPreviousYear(wholeYear(2025, 600), wholeYear(2024, 1000))).toBe(
      '40% fewer a day than in 2024: 2.7 a day then, 1.6 now.',
    );
  });

  it('tells a pace of twice and more as so many times', () => {
    expect(describePaceAgainstPreviousYear(wholeYear(2025, 7300), wholeYear(2024, 2920))).toBe(
      '2.5 times as many a day as in 2024: 8.0 a day then, 20 now.',
    );
  });

  it('compares by the days the export covers, so a year the chat started in is not taken for a quiet one', () => {
    const startedInNovember: YearSummary = {
      year: 2024,
      messageCount: 200,
      period: { firstDayKey: 20241112, lastDayKey: 20241231 },
      coveredDayCount: 50,
    };

    /* 200 in 50 days is 4 a day; 1,460 in 365 days is 4 a day as well. */
    expect(describePaceAgainstPreviousYear(wholeYear(2025, 1460), startedInNovember)).toBe(
      'About the same pace as in 2024: 4.0 a day then, 4.0 now.',
    );
  });
});

describe('formatDailyPace', () => {
  it('writes one decimal below ten a day and none from ten on', () => {
    expect(formatDailyPace(9.94)).toBe('9.9');
    expect(formatDailyPace(10)).toBe('10');
    expect(formatDailyPace(1234.4)).toBe('1,234');
  });
});

describe('formatTimesAsOften', () => {
  it('writes one decimal below ten times and a whole number from ten on', () => {
    expect(formatTimesAsOften(2.44)).toBe('2.4');
    expect(formatTimesAsOften(10)).toBe('10');
    expect(formatTimesAsOften(656.7)).toBe('657');
  });
});

describe('countMessagesByMonth', () => {
  it('adds the days of a month up, January first', () => {
    const countsByMonth = countMessagesByMonth(
      new Map([
        [20250110, 100],
        [20250314, 250],
        [20250315, 350],
        [20251231, 7],
      ]),
    );

    expect(countsByMonth).toEqual([100, 0, 600, 0, 0, 0, 0, 0, 0, 0, 0, 7]);
  });
});
