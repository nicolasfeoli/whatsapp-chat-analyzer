import { describe, expect, it } from 'vitest';

import {
  createPersonStatisticsAccumulator,
  incrementCount,
  recordCaption,
  recordHourAndWeekday,
  recordTextMessage,
  sortPeopleByMessageCount,
} from '../../../src/core/analysis/person-statistics';
import type { PersonStatisticsAccumulator } from '../../../src/core/analysis/person-statistics';
import type { MessageTextStatistics } from '../../../src/core/analysis/text-statistics';
import { PARTY_POPPER, RED_HEART } from '../../fixtures/emojis';
import { localMidnight } from '../../fixtures/messages';
import { localTime } from '../../fixtures/messages';

/** When the message that introduces a participant was sent, in the tests that are not about it. */
const FIRST_MESSAGE_TIME = localTime('2024-01-13 10:00');

/**
 * Builds what `analyseMessageText` would report for a message; anything left
 * out describes a message in which nothing was found.
 */
function textStatistics(overrides: Partial<MessageTextStatistics> = {}): MessageTextStatistics {
  return {
    linkCount: 0,
    linkSites: [],
    containsQuestion: false,
    emojis: [],
    wordCount: 0,
    significantWords: [],
    containsLaugh: false,
    mentionedNames: [],
    phrases: [],
    isSingleWord: false,
    isEmojiOnly: false,
    ...overrides,
  };
}

/** Builds the totals of a participant who has sent a given number of messages. */
function personWithMessageCount(name: string, messageCount: number): PersonStatisticsAccumulator {
  return { ...createPersonStatisticsAccumulator(name, FIRST_MESSAGE_TIME), messageCount };
}

describe('createPersonStatisticsAccumulator', () => {
  it('starts a participant with their name and every count at zero', () => {
    expect(createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME)).toEqual({
      name: 'Ana',
      messageCount: 0,
      textMessageCount: 0,
      mediaCount: 0,
      mediaCountsByType: new Map<string, number>(),
      deletedCount: 0,
      editedMessageCount: 0,
      wordCount: 0,
      singleWordMessageCount: 0,
      emojiOnlyMessageCount: 0,
      longestMessageWordCount: 0,
      emojiCount: 0,
      questionCount: 0,
      linkCount: 0,
      linkSiteCounts: new Map<string, number>(),
      laughingMessageCount: 0,
      nightMessageCount: 0,
      messageCountsByHour: new Array<number>(24).fill(0),
      messageCountsByWeekday: new Array<number>(7).fill(0),
      firstMessageTimestamp: FIRST_MESSAGE_TIME,
      lastMessageTimestamp: FIRST_MESSAGE_TIME,
      activeDayCount: 0,
      longestStreak: {
        lengthInDays: 0,
        from: localMidnight('2024-01-13'),
        to: localMidnight('2024-01-13'),
      },
      replyDelaysInMilliseconds: [],
      mentionCountsByName: new Map<string, number>(),
      signaturePhrases: [],
      earlyMessageCount: 0,
      recentMessageCount: 0,
      conversationsStartedCount: 0,
      conversationsEndedCount: 0,
      unansweredQuestionCount: 0,
      replyCountsByRecipient: new Map<string, number>(),
      replyDelaysByRecipient: new Map<string, readonly number[]>(),
      turnCount: 0,
      emojiCounts: new Map<string, number>(),
      wordCounts: new Map<string, number>(),
    });
  });

  it('takes the message that introduces a participant as their first and, so far, their last', () => {
    const introducedAt = localTime('2023-03-14 08:30');

    const person = createPersonStatisticsAccumulator('Ana', introducedAt);

    expect(person.firstMessageTimestamp).toEqual(introducedAt);
    expect(person.lastMessageTimestamp).toEqual(introducedAt);
  });

  it('gives every participant their own lists and maps', () => {
    const ana = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);
    const bob = createPersonStatisticsAccumulator('Bob', FIRST_MESSAGE_TIME);

    ana.replyDelaysInMilliseconds.push(1_000);
    ana.wordCounts.set('pizza', 1);

    expect(bob.replyDelaysInMilliseconds).toEqual([]);
    expect(bob.wordCounts.size).toBe(0);
  });

  it('gives every participant their own hours and weekdays', () => {
    const ana = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);
    const bob = createPersonStatisticsAccumulator('Bob', FIRST_MESSAGE_TIME);

    recordHourAndWeekday(ana, 9, 0);

    expect(bob.messageCountsByHour[9]).toBe(0);
    expect(bob.messageCountsByWeekday[0]).toBe(0);
  });
});

describe('recordHourAndWeekday', () => {
  /** The index of Saturday in a week that starts on Monday. */
  const SATURDAY_INDEX = 5;

  it('counts the message in its hour and on its weekday', () => {
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordHourAndWeekday(person, 22, SATURDAY_INDEX);

    expect(person.messageCountsByHour[22]).toBe(1);
    expect(person.messageCountsByWeekday[SATURDAY_INDEX]).toBe(1);
  });

  it('adds up the messages of the same hour on different weekdays', () => {
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordHourAndWeekday(person, 22, SATURDAY_INDEX);
    recordHourAndWeekday(person, 22, 0);

    expect(person.messageCountsByHour[22]).toBe(2);
    expect(person.messageCountsByWeekday).toEqual([1, 0, 0, 0, 0, 1, 0]);
  });

  it('leaves the other hours at zero and keeps twenty-four of them', () => {
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordHourAndWeekday(person, 0, 6);
    recordHourAndWeekday(person, 23, 6);

    expect(person.messageCountsByHour).toHaveLength(24);
    expect(person.messageCountsByHour.filter((count) => count > 0)).toEqual([1, 1]);
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
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordTextMessage(person, textStatistics());

    expect(person.textMessageCount).toBe(1);
  });

  it('adds the links, words and emojis of the message to the totals', () => {
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordTextMessage(
      person,
      textStatistics({ linkCount: 2, wordCount: 7, emojis: [PARTY_POPPER, RED_HEART] }),
    );

    expect(person).toMatchObject({ linkCount: 2, wordCount: 7, emojiCount: 2 });
  });

  it('counts a message with a question once, however many question marks it has', () => {
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordTextMessage(person, textStatistics({ containsQuestion: true }));

    expect(person.questionCount).toBe(1);
  });

  it('counts a message with a laugh once, however many laughs it has', () => {
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordTextMessage(person, textStatistics({ containsLaugh: true }));

    expect(person.laughingMessageCount).toBe(1);
  });

  it('does not count a question or a laugh for a message without one', () => {
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordTextMessage(person, textStatistics());

    expect(person).toMatchObject({ questionCount: 0, laughingMessageCount: 0 });
  });

  it('counts each emoji as often as it appears', () => {
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordTextMessage(person, textStatistics({ emojis: [RED_HEART, PARTY_POPPER, RED_HEART] }));

    expect(person.emojiCounts).toEqual(
      new Map([
        [RED_HEART, 2],
        [PARTY_POPPER, 1],
      ]),
    );
  });

  it('counts each significant word as often as it appears', () => {
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordTextMessage(person, textStatistics({ significantWords: ['pizza', 'playa', 'pizza'] }));

    expect(person.wordCounts).toEqual(
      new Map([
        ['pizza', 2],
        ['playa', 1],
      ]),
    );
  });

  it('counts a message of a single word, and one of emojis only, as such', () => {
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordTextMessage(person, textStatistics({ wordCount: 1, isSingleWord: true }));
    recordTextMessage(person, textStatistics({ emojis: [PARTY_POPPER], isEmojiOnly: true }));
    recordTextMessage(person, textStatistics({ wordCount: 4 }));

    expect(person).toMatchObject({
      textMessageCount: 3,
      singleWordMessageCount: 1,
      emojiOnlyMessageCount: 1,
    });
  });

  it('remembers the number of words of the longest message, not of the latest', () => {
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordTextMessage(person, textStatistics({ wordCount: 4 }));
    recordTextMessage(person, textStatistics({ wordCount: 31 }));
    recordTextMessage(person, textStatistics({ wordCount: 7 }));

    expect(person.longestMessageWordCount).toBe(31);
  });

  it('adds up over several messages', () => {
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordTextMessage(person, textStatistics({ wordCount: 3, significantWords: ['pizza'] }));
    recordTextMessage(person, textStatistics({ wordCount: 4, significantWords: ['pizza'] }));

    expect(person.textMessageCount).toBe(2);
    expect(person.wordCount).toBe(7);
    expect(person.wordCounts.get('pizza')).toBe(2);
  });

  it('does not touch the counts that depend on when the message was sent', () => {
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordTextMessage(person, textStatistics({ wordCount: 3 }));

    expect(person).toMatchObject({
      messageCount: 0,
      nightMessageCount: 0,
      turnCount: 0,
      conversationsStartedCount: 0,
    });
  });
});

describe('recordCaption', () => {
  it('adds the links, words and emojis of a caption to the totals', () => {
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordCaption(
      person,
      textStatistics({
        linkCount: 1,
        wordCount: 3,
        emojis: [PARTY_POPPER, PARTY_POPPER],
        significantWords: ['happy', 'birthday'],
      }),
    );

    expect(person.linkCount).toBe(1);
    expect(person.wordCount).toBe(3);
    expect(person.emojiCount).toBe(2);
    expect(person.emojiCounts).toEqual(new Map([[PARTY_POPPER, 2]]));
    expect(person.wordCounts).toEqual(
      new Map([
        ['happy', 1],
        ['birthday', 1],
      ]),
    );
  });

  it('counts the people mentioned in a caption', () => {
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordCaption(person, textStatistics({ mentionedNames: ['Bob', 'Bob', 'Carla'] }));

    expect(person.mentionCountsByName).toEqual(
      new Map([
        ['Bob', 2],
        ['Carla', 1],
      ]),
    );
  });

  it('does not count a caption as a single word, as emojis only or as the longest message', () => {
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordCaption(person, textStatistics({ wordCount: 1, isSingleWord: true }));
    recordCaption(person, textStatistics({ emojis: [RED_HEART], isEmojiOnly: true }));
    recordCaption(person, textStatistics({ wordCount: 40 }));

    expect(person).toMatchObject({
      singleWordMessageCount: 0,
      emojiOnlyMessageCount: 0,
      longestMessageWordCount: 0,
    });
  });

  it('does not count a caption as a typed message, a question or a laugh', () => {
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordCaption(person, textStatistics({ containsQuestion: true, containsLaugh: true }));

    expect(person.textMessageCount).toBe(0);
    expect(person.questionCount).toBe(0);
    expect(person.laughingMessageCount).toBe(0);
  });
});

describe('recordTextMessage, mentions', () => {
  it('counts the people mentioned in a typed message', () => {
    const person = createPersonStatisticsAccumulator('Ana', FIRST_MESSAGE_TIME);

    recordTextMessage(person, textStatistics({ mentionedNames: ['Bob'] }));
    recordTextMessage(person, textStatistics({ mentionedNames: ['Bob'] }));

    expect(person.mentionCountsByName).toEqual(new Map([['Bob', 2]]));
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
