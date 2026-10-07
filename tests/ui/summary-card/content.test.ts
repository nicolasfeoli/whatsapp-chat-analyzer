import { describe, expect, it } from 'vitest';

import { anonymiseAnalysis } from '../../../src/ui/anonymise';
import {
  SUMMARY_CARD_AWARD_LIMIT,
  SUMMARY_CARD_PEOPLE_LIMIT,
  collectSummaryCardContent,
} from '../../../src/ui/summary-card/content';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { localMidnight, localTime } from '../../fixtures/messages';

/** Ana writes at night and sends the photos; Bob opens the conversations. */
const anaAndBob = chatAnalysis({
  conversationCount: 30,
  firstMessageTimestamp: localTime('2024-01-13 10:00'),
  lastMessageTimestamp: localTime('2024-03-02 21:30'),
  spanInDays: 50,
  busiestDay: { date: localMidnight('2024-02-14'), messageCount: 124 },
  longestStreak: {
    lengthInDays: 12,
    from: localMidnight('2024-01-20'),
    to: localMidnight('2024-01-31'),
  },
  people: [
    personStatistics({
      name: 'Ana',
      messageCount: 1200,
      nightMessageCount: 300,
      conversationsStartedCount: 9,
      mediaCountsByType: new Map([['photo', 12]]),
    }),
    personStatistics({
      name: 'Bob',
      messageCount: 300,
      nightMessageCount: 5,
      conversationsStartedCount: 21,
    }),
  ],
});

/** A group of seven, each with fewer messages than the one before. */
const groupOfSeven = chatAnalysis({
  people: ['Ana', 'Bob', 'Carla', 'Dani', 'Marta', 'Diego', 'Elena'].map((name, index) =>
    personStatistics({ name, messageCount: 70 - index * 10 }),
  ),
});

describe('collectSummaryCardContent', () => {
  it('carries the title it is given', () => {
    expect(collectSummaryCardContent(anaAndBob, 'Ana and Bob', 'most-active').title).toBe(
      'Ana and Bob',
    );
  });

  it('writes the period as the heading of the report does', () => {
    expect(collectSummaryCardContent(anaAndBob, 'Ana and Bob', 'most-active').period).toBe(
      '13 Jan 2024 to 2 Mar 2024 · 50 days',
    );
  });

  it('writes the number of messages with thousands separators', () => {
    const content = collectSummaryCardContent(anaAndBob, 'Ana and Bob', 'most-active');

    expect(content.messageCount).toBe('1,500');
    expect(content.messageNoun).toBe('messages');
  });

  it('writes "message" for a chat of one message', () => {
    const content = collectSummaryCardContent(chatAnalysis(), 'Ana', 'most-active');

    expect(content.messageCount).toBe('1');
    expect(content.messageNoun).toBe('message');
  });

  it('lists the people with their count and share of all messages', () => {
    /* 1,200 of 1,500 is 80%; 300 of 1,500 is 20%. */
    expect(collectSummaryCardContent(anaAndBob, 'Ana and Bob', 'most-active').people).toEqual([
      { name: 'Ana', messageCount: 1200, countAndShare: '1,200 · 80%' },
      { name: 'Bob', messageCount: 300, countAndShare: '300 · 20%' },
    ]);
  });

  it('says nobody is left out of a chat of two', () => {
    expect(
      collectSummaryCardContent(anaAndBob, 'Ana and Bob', 'most-active').otherPeopleCount,
    ).toBe(0);
  });

  it('lists the five most active of a larger group and counts the others', () => {
    const content = collectSummaryCardContent(groupOfSeven, 'Group', 'most-active');

    expect(content.people.map((person) => person.name)).toEqual([
      'Ana',
      'Bob',
      'Carla',
      'Dani',
      'Marta',
    ]);
    expect(content.people).toHaveLength(SUMMARY_CARD_PEOPLE_LIMIT);
    expect(content.otherPeopleCount).toBe(2);
  });

  it('gives the busiest day and the longest streak as facts', () => {
    expect(collectSummaryCardContent(anaAndBob, 'Ana and Bob', 'most-active').facts).toEqual([
      { label: 'Busiest day', value: '14 Feb 2024', detail: '124 messages' },
      { label: 'Longest streak', value: '12 days in a row', detail: '20 Jan 2024 to 31 Jan 2024' },
    ]);
  });

  it('writes "1 message" for a busiest day with a single message', () => {
    expect(collectSummaryCardContent(chatAnalysis(), 'Ana', 'most-active').facts).toEqual([
      { label: 'Busiest day', value: '13 Jan 2024', detail: '1 message' },
    ]);
  });

  it('leaves out a streak of a single day and keeps one of two', () => {
    const twoDays = chatAnalysis({
      longestStreak: {
        lengthInDays: 2,
        from: localMidnight('2024-01-13'),
        to: localMidnight('2024-01-14'),
      },
    });

    const labelsOfOneDay = collectSummaryCardContent(chatAnalysis(), 'Ana', 'most-active').facts;
    const labelsOfTwoDays = collectSummaryCardContent(twoDays, 'Ana', 'most-active').facts;

    expect(labelsOfOneDay.map((fact) => fact.label)).toEqual(['Busiest day']);
    expect(labelsOfTwoDays.map((fact) => fact.label)).toEqual(['Busiest day', 'Longest streak']);
    expect(labelsOfTwoDays[1]?.value).toBe('2 days in a row');
  });

  it('quotes the awards with their winner and the number that earned them', () => {
    expect(collectSummaryCardContent(anaAndBob, 'Ana and Bob', 'most-active').awards).toEqual([
      {
        title: 'The night owl',
        winnerName: 'Ana',
        reason: '25% of their messages are sent between midnight and 5:00',
      },
      { title: 'The opener', winnerName: 'Bob', reason: 'started 21 of the 30 conversations' },
      { title: 'The photographer', winnerName: 'Ana', reason: '12 photos sent' },
    ]);
  });

  it('stops at three awards when more were given', () => {
    const withStickers = chatAnalysis({
      ...anaAndBob,
      people: [
        personStatistics({
          name: 'Ana',
          messageCount: 1200,
          nightMessageCount: 300,
          conversationsStartedCount: 9,
          mediaCountsByType: new Map([
            ['photo', 12],
            ['sticker', 40],
          ]),
        }),
        personStatistics({ name: 'Bob', messageCount: 300, conversationsStartedCount: 21 }),
      ],
    });

    const awards = collectSummaryCardContent(withStickers, 'Ana and Bob', 'most-active').awards;

    expect(awards).toHaveLength(SUMMARY_CARD_AWARD_LIMIT);
    expect(awards.map((award) => award.title)).toEqual([
      'The night owl',
      'The opener',
      'The sticker dealer',
    ]);
  });

  it('quotes no award for a single sender, who would win everything', () => {
    const monologue = chatAnalysis({
      people: [personStatistics({ name: 'Ana', messageCount: 200, nightMessageCount: 50 })],
    });

    expect(collectSummaryCardContent(monologue, 'Ana', 'most-active').awards).toEqual([]);
  });

  it('lets only the people the report lists compete for the awards', () => {
    /* The ninth person is the only one who writes at night, and is listed only with everyone. */
    const quietPeople = ['Ana', 'Bob', 'Carla', 'Dani', 'Marta', 'Diego', 'Elena', 'Felipe'].map(
      (name, index) => personStatistics({ name, messageCount: 500 - index * 10 }),
    );
    const largeGroup = chatAnalysis({
      people: [
        ...quietPeople,
        personStatistics({ name: 'Gala', messageCount: 100, nightMessageCount: 60 }),
      ],
    });

    expect(collectSummaryCardContent(largeGroup, 'Group', 'most-active').awards).toEqual([]);
    expect(collectSummaryCardContent(largeGroup, 'Group', 'everyone').awards).toEqual([
      {
        title: 'The night owl',
        winnerName: 'Gala',
        reason: '60% of their messages are sent between midnight and 5:00',
      },
    ]);
  });

  it('holds no name when it is made from the copy without names', () => {
    const content = collectSummaryCardContent(
      anonymiseAnalysis(anaAndBob),
      'A chat',
      'most-active',
    );

    expect(content.people.map((person) => person.name)).toEqual(['Person A', 'Person B']);
    expect(content.awards.map((award) => award.winnerName)).toEqual([
      'Person A',
      'Person B',
      'Person A',
    ]);
    expect(JSON.stringify(content)).not.toMatch(/Ana|Bob/u);
  });
});
