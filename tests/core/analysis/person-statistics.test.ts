import { describe, expect, it } from 'vitest';

import {
  createPersonStatisticsAccumulator,
  incrementCount,
  recordTextMessage,
  sortPeopleByMessageCount,
} from '../../../src/core/analysis/person-statistics';
import type { PersonStatisticsAccumulator } from '../../../src/core/analysis/person-statistics';
import type { MessageTextStatistics } from '../../../src/core/analysis/text-statistics';
import { PARTY_POPPER, RED_HEART } from '../../fixtures/emojis';

/**
 * Builds what `analyseMessageText` would report for a message; anything left
 * out describes a message in which nothing was found.
 */
function textStatistics(overrides: Partial<MessageTextStatistics> = {}): MessageTextStatistics {
  return {
    linkCount: 0,
    containsQuestion: false,
    emojis: [],
    wordCount: 0,
    significantWords: [],
    containsLaugh: false,
    ...overrides,
  };
}

/** Builds the totals of a participant who has sent a given number of messages. */
function personWithMessageCount(name: string, messageCount: number): PersonStatisticsAccumulator {
  return { ...createPersonStatisticsAccumulator(name), messageCount };
}

describe('createPersonStatisticsAccumulator', () => {
  it('starts a participant with their name and every count at zero', () => {
    expect(createPersonStatisticsAccumulator('Ana')).toEqual({
      name: 'Ana',
      messageCount: 0,
      textMessageCount: 0,
      mediaCount: 0,
      deletedCount: 0,
      wordCount: 0,
      emojiCount: 0,
      questionCount: 0,
      linkCount: 0,
      laughingMessageCount: 0,
      nightMessageCount: 0,
      replyDelaysInMilliseconds: [],
      conversationsStartedCount: 0,
      conversationsEndedCount: 0,
      unansweredQuestionCount: 0,
      replyCountsByRecipient: new Map<string, number>(),
      turnCount: 0,
      emojiCounts: new Map<string, number>(),
      wordCounts: new Map<string, number>(),
    });
  });

  it('gives every participant their own lists and maps', () => {
    const ana = createPersonStatisticsAccumulator('Ana');
    const bob = createPersonStatisticsAccumulator('Bob');

    ana.replyDelaysInMilliseconds.push(1_000);
    ana.wordCounts.set('pizza', 1);

    expect(bob.replyDelaysInMilliseconds).toEqual([]);
    expect(bob.wordCounts.size).toBe(0);
  });
});

describe('incrementCount', () => {
  it('starts a new key at one', () => {
    const counts = new Map<string, number>();

    incrementCount(counts, 'pizza');

    expect(counts.get('pizza')).toBe(1);
  });

  it('adds one to a key that is already counted', () => {
    const counts = new Map<string, number>([['pizza', 4]]);

    incrementCount(counts, 'pizza');

    expect(counts.get('pizza')).toBe(5);
  });

  it('leaves the other keys alone', () => {
    const counts = new Map<string, number>([['playa', 2]]);

    incrementCount(counts, 'pizza');

    expect(counts.get('playa')).toBe(2);
  });

  it('keeps the keys in order of first use', () => {
    const counts = new Map<number, number>();

    incrementCount(counts, 20240113);
    incrementCount(counts, 20240112);
    incrementCount(counts, 20240113);

    expect([...counts.keys()]).toEqual([20240113, 20240112]);
  });
});

describe('recordTextMessage', () => {
  it('counts the message as a text message', () => {
    const person = createPersonStatisticsAccumulator('Ana');

    recordTextMessage(person, textStatistics());

    expect(person.textMessageCount).toBe(1);
  });

  it('adds the links, words and emojis of the message to the totals', () => {
    const person = createPersonStatisticsAccumulator('Ana');

    recordTextMessage(
      person,
      textStatistics({ linkCount: 2, wordCount: 7, emojis: [PARTY_POPPER, RED_HEART] }),
    );

    expect(person).toMatchObject({ linkCount: 2, wordCount: 7, emojiCount: 2 });
  });

  it('counts a message with a question once, however many question marks it has', () => {
    const person = createPersonStatisticsAccumulator('Ana');

    recordTextMessage(person, textStatistics({ containsQuestion: true }));

    expect(person.questionCount).toBe(1);
  });

  it('counts a message with a laugh once, however many laughs it has', () => {
    const person = createPersonStatisticsAccumulator('Ana');

    recordTextMessage(person, textStatistics({ containsLaugh: true }));

    expect(person.laughingMessageCount).toBe(1);
  });

  it('does not count a question or a laugh for a message without one', () => {
    const person = createPersonStatisticsAccumulator('Ana');

    recordTextMessage(person, textStatistics());

    expect(person).toMatchObject({ questionCount: 0, laughingMessageCount: 0 });
  });

  it('counts each emoji as often as it appears', () => {
    const person = createPersonStatisticsAccumulator('Ana');

    recordTextMessage(person, textStatistics({ emojis: [RED_HEART, PARTY_POPPER, RED_HEART] }));

    expect(person.emojiCounts).toEqual(
      new Map([
        [RED_HEART, 2],
        [PARTY_POPPER, 1],
      ]),
    );
  });

  it('counts each significant word as often as it appears', () => {
    const person = createPersonStatisticsAccumulator('Ana');

    recordTextMessage(person, textStatistics({ significantWords: ['pizza', 'playa', 'pizza'] }));

    expect(person.wordCounts).toEqual(
      new Map([
        ['pizza', 2],
        ['playa', 1],
      ]),
    );
  });

  it('adds up over several messages', () => {
    const person = createPersonStatisticsAccumulator('Ana');

    recordTextMessage(person, textStatistics({ wordCount: 3, significantWords: ['pizza'] }));
    recordTextMessage(person, textStatistics({ wordCount: 4, significantWords: ['pizza'] }));

    expect(person.textMessageCount).toBe(2);
    expect(person.wordCount).toBe(7);
    expect(person.wordCounts.get('pizza')).toBe(2);
  });

  it('does not touch the counts that depend on when the message was sent', () => {
    const person = createPersonStatisticsAccumulator('Ana');

    recordTextMessage(person, textStatistics({ wordCount: 3 }));

    expect(person).toMatchObject({
      messageCount: 0,
      nightMessageCount: 0,
      turnCount: 0,
      conversationsStartedCount: 0,
    });
  });
});

describe('sortPeopleByMessageCount', () => {
  it('puts the participant with the most messages first', () => {
    const people = [
      personWithMessageCount('Ana', 2),
      personWithMessageCount('Bob', 9),
      personWithMessageCount('Marta', 5),
    ];

    const sortedPeople = sortPeopleByMessageCount(people);

    expect(sortedPeople.map((person) => person.name)).toEqual(['Bob', 'Marta', 'Ana']);
  });

  it('keeps participants with equally many messages in order of first appearance', () => {
    const people = [
      personWithMessageCount('Diego', 3),
      personWithMessageCount('Ana', 3),
      personWithMessageCount('Bob', 3),
    ];

    const sortedPeople = sortPeopleByMessageCount(people);

    expect(sortedPeople.map((person) => person.name)).toEqual(['Diego', 'Ana', 'Bob']);
  });

  it('accepts any iterable, such as the values of a map', () => {
    const peopleByName = new Map([
      ['Ana', personWithMessageCount('Ana', 1)],
      ['Bob', personWithMessageCount('Bob', 2)],
    ]);

    const sortedPeople = sortPeopleByMessageCount(peopleByName.values());

    expect(sortedPeople.map((person) => person.name)).toEqual(['Bob', 'Ana']);
  });

  it('returns a new array and leaves the given one in its order', () => {
    const people = [personWithMessageCount('Ana', 1), personWithMessageCount('Bob', 2)];

    sortPeopleByMessageCount(people);

    expect(people.map((person) => person.name)).toEqual(['Ana', 'Bob']);
  });

  it('returns nothing for no participants', () => {
    expect(sortPeopleByMessageCount([])).toEqual([]);
  });
});
