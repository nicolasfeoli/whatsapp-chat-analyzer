import { describe, expect, it } from 'vitest';

import { analyseChat } from '../../../src/core/analysis/analyse-chat';
import {
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
  MILLISECONDS_PER_SECOND,
} from '../../../src/core/time-constants';
import { analyseMessages, findPerson, participantNames } from '../../fixtures/analysis-readers';
import type { ChatMessage } from '../../../src/core/types';
import { PARTY_POPPER, RED_HEART } from '../../fixtures/emojis';
import {
  deletedMessage,
  localMidnight,
  localTime,
  mediaMessage,
  textMessage,
  textsOf,
} from '../../fixtures/messages';

/** Row of the heatmap for Monday; 1 January 2024 was a Monday. */
const MONDAY_ROW = 0;

/** Row of the heatmap for Saturday; 13 January 2024 was a Saturday. */
const SATURDAY_ROW = 5;

/** Row of the heatmap for Sunday; 14 January 2024 was a Sunday. */
const SUNDAY_ROW = 6;

describe('analyseChat', () => {
  describe('a chat without messages', () => {
    it('throws a RangeError, because there is no first day or busiest day to report', () => {
      expect(() => analyseChat([], 'second')).toThrow(RangeError);
    });
  });

  describe('order of the messages', () => {
    it('returns the messages sorted from oldest to newest', () => {
      const messages = [
        textMessage({ sentAt: '2024-01-13 10:05', text: 'third' }),
        textMessage({ sentAt: '2024-01-13 10:00', text: 'first' }),
        textMessage({ sentAt: '2024-01-13 10:03', text: 'second' }),
      ];

      const analysis = analyseMessages(messages);

      expect(textsOf(analysis.messages)).toEqual(['first', 'second', 'third']);
    });

    it('keeps messages sent at the same moment in the order they were given', () => {
      const messages = [
        textMessage({ sentAt: '2024-01-13 10:00', text: 'first in the file' }),
        textMessage({ sentAt: '2024-01-13 10:00', text: 'second in the file' }),
        textMessage({ sentAt: '2024-01-13 10:00', text: 'third in the file' }),
      ];

      const analysis = analyseMessages(messages);

      expect(textsOf(analysis.messages)).toEqual([
        'first in the file',
        'second in the file',
        'third in the file',
      ]);
    });

    it('does not reorder the list it was given', () => {
      const messages = [
        textMessage({ sentAt: '2024-01-13 10:05', text: 'later' }),
        textMessage({ sentAt: '2024-01-13 10:00', text: 'earlier' }),
      ];

      analyseMessages(messages);

      expect(textsOf(messages)).toEqual(['later', 'earlier']);
    });
  });

  describe('span of the chat', () => {
    it('reports the timestamps of the oldest and the newest message', () => {
      const messages = [
        textMessage({ sentAt: '2024-01-15 18:30' }),
        textMessage({ sentAt: '2024-01-13 10:00' }),
        textMessage({ sentAt: '2024-01-14 12:00' }),
      ];

      const analysis = analyseMessages(messages);

      expect(analysis.firstMessageTimestamp).toEqual(localTime('2024-01-13 10:00'));
      expect(analysis.lastMessageTimestamp).toEqual(localTime('2024-01-15 18:30'));
    });

    it('counts the total number of messages of every kind', () => {
      const messages = [
        textMessage({ sentAt: '2024-01-13 10:00' }),
        mediaMessage({ sentAt: '2024-01-13 10:01' }),
        deletedMessage({ sentAt: '2024-01-13 10:02' }),
      ];

      expect(analyseMessages(messages).totalMessageCount).toBe(3);
    });

    it('reports a span of one day for a chat that starts and ends on the same day', () => {
      const messages = [
        textMessage({ sentAt: '2024-01-13 00:05' }),
        textMessage({ sentAt: '2024-01-13 23:55' }),
      ];

      expect(analyseMessages(messages).spanInDays).toBe(1);
    });

    it('counts both the first and the last day in the span', () => {
      const messages = [
        textMessage({ sentAt: '2024-01-13 23:55' }),
        textMessage({ sentAt: '2024-01-20 00:05' }),
      ];

      expect(analyseMessages(messages).spanInDays).toBe(8);
    });

    it('counts only the days that have a message as active', () => {
      const messages = [
        textMessage({ sentAt: '2024-01-13 10:00' }),
        textMessage({ sentAt: '2024-01-13 11:00' }),
        textMessage({ sentAt: '2024-01-20 10:00' }),
      ];

      expect(analyseMessages(messages).activeDayCount).toBe(2);
    });

    it.each(['second', 'minute'] as const)(
      'passes the timestamp resolution "%s" through to the result',
      (timestampResolution) => {
        const analysis = analyseChat([textMessage()], timestampResolution);

        expect(analysis.timestampResolution).toBe(timestampResolution);
      },
    );
  });

  describe('participants', () => {
    it('ranks the participants by number of messages, most first', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:02' }),
        textMessage({ sender: 'Marta', sentAt: '2024-01-13 10:03' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:04' }),
        textMessage({ sender: 'Marta', sentAt: '2024-01-13 10:05' }),
      ];

      expect(participantNames(analyseMessages(messages))).toEqual(['Bob', 'Marta', 'Ana']);
    });

    it('ranks participants with equally many messages by who wrote first', () => {
      const messages = [
        textMessage({ sender: 'Diego', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:01' }),
      ];

      expect(participantNames(analyseMessages(messages))).toEqual(['Diego', 'Ana']);
    });

    it('counts the messages of each kind per participant', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        mediaMessage({ sender: 'Ana', sentAt: '2024-01-13 10:01' }),
        mediaMessage({ sender: 'Ana', sentAt: '2024-01-13 10:02' }),
        deletedMessage({ sender: 'Ana', sentAt: '2024-01-13 10:03' }),
        deletedMessage({ sender: 'Bob', sentAt: '2024-01-13 10:04' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Ana')).toMatchObject({
        messageCount: 4,
        textMessageCount: 1,
        mediaCount: 2,
        deletedCount: 1,
      });
      expect(findPerson(analysis, 'Bob')).toMatchObject({
        messageCount: 1,
        textMessageCount: 0,
        mediaCount: 0,
        deletedCount: 1,
      });
    });

    it('treats names that differ only in letter case as different participants', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'ana', sentAt: '2024-01-13 10:01' }),
      ];

      expect(analyseMessages(messages).people).toHaveLength(2);
    });
  });

  describe('content of typed messages', () => {
    it('counts words, links, questions, emojis and laughs per participant', () => {
      const messages = [
        textMessage({
          sender: 'Ana',
          sentAt: '2024-01-13 10:00',
          text: `jajaja ¿vamos a la playa? ${PARTY_POPPER} https://example.com/map`,
        }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:01', text: 'llevo pizza' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Ana')).toMatchObject({
        wordCount: 7,
        linkCount: 1,
        questionCount: 1,
        emojiCount: 1,
        laughingMessageCount: 1,
      });
    });

    it('counts the significant words of each participant', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'pizza tonight' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01', text: 'pizza again' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:02', text: 'yes pizza' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Ana').wordCounts).toEqual(
        new Map([
          ['pizza', 2],
          ['tonight', 1],
        ]),
      );
    });

    it('counts the significant words of the whole chat', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'pizza tonight' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01', text: 'pizza again' }),
      ];

      const analysis = analyseMessages(messages);

      expect(analysis.wordCounts).toEqual(
        new Map([
          ['pizza', 2],
          ['tonight', 1],
          ['again', 1],
        ]),
      );
    });

    it('counts the emojis of each participant and of the whole chat', () => {
      const messages = [
        textMessage({
          sender: 'Ana',
          sentAt: '2024-01-13 10:00',
          text: `${RED_HEART}${RED_HEART}`,
        }),
        textMessage({
          sender: 'Bob',
          sentAt: '2024-01-13 10:01',
          text: `${RED_HEART}${PARTY_POPPER}`,
        }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Ana').emojiCounts).toEqual(new Map([[RED_HEART, 2]]));
      expect(analysis.emojiCounts).toEqual(
        new Map([
          [RED_HEART, 3],
          [PARTY_POPPER, 1],
        ]),
      );
    });

    it('does not count the placeholder of a media message as words', () => {
      const messages = [mediaMessage({ sender: 'Bob', text: '<Medien ausgeschlossen>' })];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Bob').wordCount).toBe(0);
      expect(analysis.wordCounts.size).toBe(0);
    });

    it('does not count the tombstone of a deleted message as words', () => {
      const messages = [deletedMessage({ sender: 'Bob', text: 'Diese Nachricht wurde gelöscht' })];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Bob').wordCount).toBe(0);
      expect(analysis.wordCounts.size).toBe(0);
    });
  });

  describe('longest message', () => {
    it('is the typed message with the most words', () => {
      const longMessage = textMessage({
        sentAt: '2024-01-13 10:01',
        text: 'this one has quite a few more words in it',
      });
      const messages = [
        textMessage({ sentAt: '2024-01-13 10:00', text: 'short' }),
        longMessage,
        textMessage({ sentAt: '2024-01-13 10:02', text: 'also short' }),
      ];

      const analysis = analyseMessages(messages);

      expect(analysis.longestMessage).toBe(longMessage);
      expect(analysis.longestMessageWordCount).toBe(10);
    });

    it('is the earliest of several equally long messages', () => {
      const messages = [
        textMessage({ sentAt: '2024-01-13 10:00', text: 'one two three' }),
        textMessage({ sentAt: '2024-01-13 10:01', text: 'four five six' }),
      ];

      expect(analyseMessages(messages).longestMessage?.text).toBe('one two three');
    });

    it('does not count the pieces of a link towards the length', () => {
      const messages = [
        textMessage({ sentAt: '2024-01-13 10:00', text: 'https://example.com/a/very/long/path' }),
        textMessage({ sentAt: '2024-01-13 10:01', text: 'two words' }),
      ];

      expect(analyseMessages(messages).longestMessage?.text).toBe('two words');
    });

    it('is null when nobody typed anything', () => {
      const messages = [
        mediaMessage({ sentAt: '2024-01-13 10:00' }),
        deletedMessage({ sentAt: '2024-01-13 10:01' }),
      ];

      const analysis = analyseMessages(messages);

      expect(analysis.longestMessage).toBeNull();
      expect(analysis.longestMessageWordCount).toBe(0);
    });

    it('is null when the typed messages contain no words', () => {
      const messages = [textMessage({ text: `${PARTY_POPPER}${PARTY_POPPER}` })];

      expect(analyseMessages(messages).longestMessage).toBeNull();
    });
  });

  describe('night messages', () => {
    it.each([
      { time: '00:00', description: 'midnight' },
      { time: '03:30', description: 'half past three' },
      { time: '04:59', description: 'a minute before five' },
    ])('counts a message sent at $time ($description) as a night message', ({ time }) => {
      const analysis = analyseMessages([
        textMessage({ sender: 'Ana', sentAt: `2024-01-13 ${time}` }),
      ]);

      expect(findPerson(analysis, 'Ana').nightMessageCount).toBe(1);
    });

    it.each([
      { time: '05:00', description: 'five sharp' },
      { time: '12:00', description: 'noon' },
      { time: '23:59', description: 'a minute before midnight' },
    ])('does not count a message sent at $time ($description) as a night message', ({ time }) => {
      const analysis = analyseMessages([
        textMessage({ sender: 'Ana', sentAt: `2024-01-13 ${time}` }),
      ]);

      expect(findPerson(analysis, 'Ana').nightMessageCount).toBe(0);
    });

    it('counts night messages of every kind', () => {
      const analysis = analyseMessages([
        mediaMessage({ sender: 'Ana', sentAt: '2024-01-13 02:00' }),
      ]);

      expect(findPerson(analysis, 'Ana').nightMessageCount).toBe(1);
    });
  });

  describe("each person's hours and weekdays", () => {
    it('counts the messages of each person by the hour they were sent in', () => {
      const analysis = analyseMessages([
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 09:05' }),
        mediaMessage({ sender: 'Ana', sentAt: '2024-01-14 09:55' }),
        deletedMessage({ sender: 'Ana', sentAt: '2024-01-13 23:59' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 09:30' }),
      ]);

      const { messageCountsByHour } = findPerson(analysis, 'Ana');

      expect(messageCountsByHour).toHaveLength(24);
      expect(messageCountsByHour[9]).toBe(2);
      expect(messageCountsByHour[23]).toBe(1);
      expect(findPerson(analysis, 'Bob').messageCountsByHour[9]).toBe(1);
    });

    it('counts the messages of each person by weekday, Monday first', () => {
      const analysis = analyseMessages([
        textMessage({ sender: 'Ana', sentAt: '2024-01-01 09:00' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-08 21:00' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-14 00:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 12:00' }),
      ]);

      expect(findPerson(analysis, 'Ana').messageCountsByWeekday).toEqual([2, 0, 0, 0, 0, 0, 1]);
      expect(findPerson(analysis, 'Bob').messageCountsByWeekday[SATURDAY_ROW]).toBe(1);
    });

    it('adds up to the messages of the person, and across people to the heatmap', () => {
      const analysis = analyseMessages([
        textMessage({ sender: 'Ana', sentAt: '2024-01-01 09:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-01 09:10' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-02 18:00' }),
      ]);
      const sum = (counts: readonly number[]): number =>
        counts.reduce((total, count) => total + count, 0);

      const ana = findPerson(analysis, 'Ana');
      const bob = findPerson(analysis, 'Bob');

      expect(sum(ana.messageCountsByHour)).toBe(ana.messageCount);
      expect(sum(ana.messageCountsByWeekday)).toBe(ana.messageCount);
      expect((ana.messageCountsByHour[9] ?? 0) + (bob.messageCountsByHour[9] ?? 0)).toBe(
        analysis.weekdayHourHeatmap[MONDAY_ROW]?.[9],
      );
    });
  });

  describe("each person's first and last message", () => {
    const messages = [
      textMessage({ sender: 'Ana', sentAt: '2023-03-14 09:00' }),
      textMessage({ sender: 'Carla', sentAt: '2023-03-15 18:30' }),
      mediaMessage({ sender: 'Carla', sentAt: '2023-06-01 12:00' }),
      textMessage({ sender: 'Bob', sentAt: '2023-07-02 08:00' }),
      deletedMessage({ sender: 'Ana', sentAt: '2024-02-20 23:15:30' }),
    ];

    it('records when each person wrote for the first time', () => {
      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Ana').firstMessageTimestamp).toEqual(
        localTime('2023-03-14 09:00'),
      );
      expect(findPerson(analysis, 'Carla').firstMessageTimestamp).toEqual(
        localTime('2023-03-15 18:30'),
      );
    });

    it('records when each person wrote for the last time, whatever kind of message it was', () => {
      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Carla').lastMessageTimestamp).toEqual(
        localTime('2023-06-01 12:00'),
      );
      expect(findPerson(analysis, 'Ana').lastMessageTimestamp).toEqual(
        localTime('2024-02-20 23:15:30'),
      );
    });

    it('gives somebody who wrote once the same first and last message', () => {
      const bob = findPerson(analyseMessages(messages), 'Bob');

      expect(bob.firstMessageTimestamp).toEqual(localTime('2023-07-02 08:00'));
      expect(bob.lastMessageTimestamp).toEqual(bob.firstMessageTimestamp);
    });

    it('goes by the time of the messages, not by their order in the file', () => {
      const shuffledMessages = [messages[4], messages[2], messages[0], messages[1]].filter(
        (message) => message !== undefined,
      );

      const ana = findPerson(analyseMessages(shuffledMessages), 'Ana');

      expect(ana.firstMessageTimestamp).toEqual(localTime('2023-03-14 09:00'));
      expect(ana.lastMessageTimestamp).toEqual(localTime('2024-02-20 23:15:30'));
    });

    it('ends the chat with the last message of whoever wrote last', () => {
      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Ana').lastMessageTimestamp).toEqual(
        analysis.lastMessageTimestamp,
      );
    });
  });

  describe('milestones', () => {
    /**
     * Builds a chat of one message a minute from 14 March 2023, 08:00 on, in
     * which Ana and Bob take turns: Ana sends the odd messages, Bob the even.
     */
    function chatOfMessageCount(messageCount: number): ChatMessage[] {
      const firstMinute = localTime('2023-03-14 08:00').getTime();
      return Array.from({ length: messageCount }, (_unused, index): ChatMessage => ({
        kind: 'text',
        timestamp: new Date(firstMinute + index * MILLISECONDS_PER_MINUTE),
        sender: index % 2 === 0 ? 'Ana' : 'Bob',
        text: 'hello',
      }));
    }

    it('gives a chat of one message its first message and nothing else', () => {
      const analysis = analyseMessages([
        textMessage({ sender: 'Ana', sentAt: '2023-03-14 08:00' }),
      ]);

      expect(analysis.milestones).toEqual([
        { kind: 'first-message', timestamp: localTime('2023-03-14 08:00'), sender: 'Ana' },
      ]);
    });

    it('takes the oldest message as the first, wherever it stands in the file', () => {
      const analysis = analyseMessages([
        textMessage({ sender: 'Bob', sentAt: '2023-03-14 09:00' }),
        textMessage({ sender: 'Carla', sentAt: '2023-03-14 08:00' }),
      ]);

      expect(analysis.milestones).toEqual([
        { kind: 'first-message', timestamp: localTime('2023-03-14 08:00'), sender: 'Carla' },
      ]);
    });

    it('does not report the half of a chat of 99 messages', () => {
      const kinds = analyseMessages(chatOfMessageCount(99)).milestones.map(
        (milestone) => milestone.kind,
      );

      expect(kinds).toEqual(['first-message']);
    });

    it('reports the message that makes half of a chat of 100 messages', () => {
      const analysis = analyseMessages(chatOfMessageCount(100));

      /* The 50th message is sent 49 minutes after 08:00. */
      expect(analysis.milestones).toEqual([
        { kind: 'first-message', timestamp: localTime('2023-03-14 08:00'), sender: 'Ana' },
        { kind: 'half-of-messages', timestamp: localTime('2023-03-14 08:49'), messageCount: 50 },
      ]);
    });

    it('does not report the 1,000th message of a chat of 999', () => {
      const kinds = analyseMessages(chatOfMessageCount(999)).milestones.map(
        (milestone) => milestone.kind,
      );

      expect(kinds).toEqual(['first-message', 'half-of-messages']);
    });

    it('reports the 1,000th message of a chat of 1,000, with who sent it', () => {
      const analysis = analyseMessages(chatOfMessageCount(1_000));

      /* The 1,000th message is an even one, so it is from Bob, 999 minutes after 08:00: 00:39 the next day. */
      expect(analysis.milestones).toEqual([
        { kind: 'first-message', timestamp: localTime('2023-03-14 08:00'), sender: 'Ana' },
        { kind: 'half-of-messages', timestamp: localTime('2023-03-14 16:19'), messageCount: 500 },
        {
          kind: 'message-count',
          timestamp: localTime('2023-03-15 00:39'),
          sender: 'Bob',
          messageCount: 1_000,
        },
      ]);
    });

    it('reports every round number a large chat reached, and none it did not', () => {
      const analysis = analyseMessages(chatOfMessageCount(50_001));

      const reachedCounts = analysis.milestones
        .filter((milestone) => milestone.kind === 'message-count')
        .map((milestone) => milestone.messageCount);

      expect(reachedCounts).toEqual([1_000, 10_000, 50_000]);
    });

    it('adds the latest anniversary of a chat that lasted more than a year', () => {
      const analysis = analyseMessages([
        textMessage({ sender: 'Ana', sentAt: '2023-03-14 08:00' }),
        textMessage({ sender: 'Bob', sentAt: '2025-06-01 12:00' }),
      ]);

      expect(analysis.milestones).toEqual([
        { kind: 'first-message', timestamp: localTime('2023-03-14 08:00'), sender: 'Ana' },
        { kind: 'anniversary', timestamp: localMidnight('2025-03-14'), years: 2 },
      ]);
    });

    it('lists the milestones in order of time', () => {
      /* A hundred messages on the first day, then one more over a year later. */
      const messages = [
        ...chatOfMessageCount(100),
        textMessage({ sender: 'Bob', sentAt: '2024-04-01 12:00' }),
      ];

      const kinds = analyseMessages(messages).milestones.map((milestone) => milestone.kind);

      expect(kinds).toEqual(['first-message', 'half-of-messages', 'anniversary']);
    });
  });

  describe('heatmap of weekday and hour', () => {
    it('has seven rows of twenty-four hours', () => {
      const { weekdayHourHeatmap } = analyseMessages([textMessage()]);

      expect(weekdayHourHeatmap).toHaveLength(7);
      expect(weekdayHourHeatmap.map((hours) => hours.length)).toEqual([24, 24, 24, 24, 24, 24, 24]);
    });

    it.each([
      { weekday: 'Monday', sentAt: '2024-01-01 09:15', row: MONDAY_ROW, hour: 9 },
      { weekday: 'Saturday', sentAt: '2024-01-13 22:59', row: SATURDAY_ROW, hour: 22 },
      { weekday: 'Sunday', sentAt: '2024-01-14 00:00', row: SUNDAY_ROW, hour: 0 },
    ])(
      'counts a message sent on a $weekday in row $row and column $hour',
      ({ sentAt, row, hour }) => {
        const { weekdayHourHeatmap } = analyseMessages([textMessage({ sentAt })]);

        expect(weekdayHourHeatmap[row]?.[hour]).toBe(1);
      },
    );

    it('adds up the messages sent in the same hour of the same weekday in different weeks', () => {
      const messages = [
        textMessage({ sentAt: '2024-01-01 09:00' }),
        textMessage({ sentAt: '2024-01-08 09:45' }),
        mediaMessage({ sentAt: '2024-01-15 09:30' }),
      ];

      const { weekdayHourHeatmap } = analyseMessages(messages);

      expect(weekdayHourHeatmap[MONDAY_ROW]?.[9]).toBe(3);
    });

    it('leaves every other cell at zero', () => {
      const { weekdayHourHeatmap } = analyseMessages([textMessage({ sentAt: '2024-01-01 09:00' })]);

      const totalOfAllCells = weekdayHourHeatmap.flat().reduce((sum, count) => sum + count, 0);

      expect(totalOfAllCells).toBe(1);
    });
  });

  describe('messages per day', () => {
    it('counts the messages of each calendar day under its YYYYMMDD key', () => {
      const messages = [
        textMessage({ sentAt: '2024-01-13 10:00' }),
        textMessage({ sentAt: '2024-01-13 23:59' }),
        textMessage({ sentAt: '2024-01-14 00:00' }),
      ];

      expect(analyseMessages(messages).messageCountsByDayKey).toEqual(
        new Map([
          [20240113, 2],
          [20240114, 1],
        ]),
      );
    });

    it('reports the day with the most messages as the busiest day', () => {
      const messages = [
        textMessage({ sentAt: '2024-01-13 10:00' }),
        textMessage({ sentAt: '2024-01-14 10:00' }),
        textMessage({ sentAt: '2024-01-14 11:00' }),
        textMessage({ sentAt: '2024-01-15 10:00' }),
      ];

      expect(analyseMessages(messages).busiestDay).toEqual({
        date: localMidnight('2024-01-14'),
        messageCount: 2,
      });
    });

    it('reports the earliest of several equally busy days', () => {
      const messages = [
        textMessage({ sentAt: '2024-01-14 10:00' }),
        textMessage({ sentAt: '2024-01-13 10:00' }),
      ];

      expect(analyseMessages(messages).busiestDay.date).toEqual(localMidnight('2024-01-13'));
    });

    it('reports the longest run of consecutive active days as the longest streak', () => {
      const messages = [
        textMessage({ sentAt: '2024-01-10 10:00' }),
        textMessage({ sentAt: '2024-01-13 10:00' }),
        textMessage({ sentAt: '2024-01-14 10:00' }),
        textMessage({ sentAt: '2024-01-15 10:00' }),
        textMessage({ sentAt: '2024-01-20 10:00' }),
      ];

      expect(analyseMessages(messages).longestStreak).toEqual({
        lengthInDays: 3,
        from: localMidnight('2024-01-13'),
        to: localMidnight('2024-01-15'),
      });
    });
  });

  describe('conversations', () => {
    it('counts the first message of the chat as the start of a conversation', () => {
      const analysis = analyseMessages([textMessage({ sender: 'Ana' })]);

      expect(analysis.conversationCount).toBe(1);
      expect(findPerson(analysis, 'Ana').conversationsStartedCount).toBe(1);
    });

    it('starts a new conversation after exactly eight hours of silence', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 18:00:00' }),
      ];

      const analysis = analyseMessages(messages);

      expect(analysis.conversationCount).toBe(2);
      expect(findPerson(analysis, 'Bob').conversationsStartedCount).toBe(1);
    });

    it('continues the conversation after one second less than eight hours', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 17:59:59' }),
      ];

      const analysis = analyseMessages(messages);

      expect(analysis.conversationCount).toBe(1);
      expect(findPerson(analysis, 'Bob').conversationsStartedCount).toBe(0);
    });

    it('credits a new conversation to whoever breaks the silence, even the last speaker', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 22:00' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-14 08:00' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Ana').conversationsStartedCount).toBe(2);
    });

    it('counts a media message as the start of a conversation too', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        mediaMessage({ sender: 'Bob', sentAt: '2024-01-14 10:00' }),
      ];

      expect(findPerson(analyseMessages(messages), 'Bob').conversationsStartedCount).toBe(1);
    });
  });

  describe('reply delays', () => {
    it('records how long a participant took to answer somebody else', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:02:30' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Bob').replyDelaysInMilliseconds).toEqual([
        2 * MILLISECONDS_PER_MINUTE + 30 * MILLISECONDS_PER_SECOND,
      ]);
    });

    it('records no delay for the first message of the chat', () => {
      const analysis = analyseMessages([textMessage({ sender: 'Ana' })]);

      expect(findPerson(analysis, 'Ana').replyDelaysInMilliseconds).toEqual([]);
    });

    it('records no delay when the same participant writes again', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:05' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Ana').replyDelaysInMilliseconds).toEqual([]);
    });

    it('records one delay per change of speaker, in order', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:04' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:09' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Bob').replyDelaysInMilliseconds).toEqual([
        MILLISECONDS_PER_MINUTE,
        5 * MILLISECONDS_PER_MINUTE,
      ]);
      expect(findPerson(analysis, 'Ana').replyDelaysInMilliseconds).toEqual([
        3 * MILLISECONDS_PER_MINUTE,
      ]);
    });

    it('records a delay of zero for an answer in the same second', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:00:00' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Bob').replyDelaysInMilliseconds).toEqual([0]);
    });

    it('records an answer that comes one second before twelve hours have passed', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 08:00:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 19:59:59' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Bob').replyDelaysInMilliseconds).toEqual([
        12 * MILLISECONDS_PER_HOUR - MILLISECONDS_PER_SECOND,
      ]);
    });

    it('does not record an answer that comes after exactly twelve hours', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 08:00:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 20:00:00' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Bob').replyDelaysInMilliseconds).toEqual([]);
    });

    it('records an answer after nine hours both as a reply and as a new conversation', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 08:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 17:00' }),
      ];

      const bob = findPerson(analyseMessages(messages), 'Bob');

      expect(bob.replyDelaysInMilliseconds).toEqual([9 * MILLISECONDS_PER_HOUR]);
      expect(bob.conversationsStartedCount).toBe(1);
    });
  });

  describe('media by type', () => {
    it('splits the media of each person by what the placeholder stands for', () => {
      const messages = [
        mediaMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'sticker omitted' }),
        mediaMessage({ sender: 'Ana', sentAt: '2024-01-13 10:01', text: 'image omitted' }),
        mediaMessage({ sender: 'Ana', sentAt: '2024-01-13 10:02', text: 'sticker omitted' }),
        mediaMessage({ sender: 'Bob', sentAt: '2024-01-13 10:03', text: 'audio omitted' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Ana').mediaCountsByType).toEqual(
        new Map([
          ['sticker', 2],
          ['photo', 1],
        ]),
      );
      expect(findPerson(analysis, 'Bob').mediaCountsByType).toEqual(new Map([['audio', 1]]));
    });

    it('counts a placeholder that does not name its media as unknown', () => {
      const messages = [mediaMessage({ sender: 'Ana', text: '<Media omitted>' })];

      const ana = findPerson(analyseMessages(messages), 'Ana');

      expect(ana.mediaCountsByType).toEqual(new Map([['unknown', 1]]));
    });

    it('adds up to the number of media messages', () => {
      const messages = [
        mediaMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'GIF omitted' }),
        mediaMessage({ sender: 'Ana', sentAt: '2024-01-13 10:01', text: '<Media omitted>' }),
        mediaMessage({ sender: 'Ana', sentAt: '2024-01-13 10:02', text: 'POLL:' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:03', text: 'sticker omitted' }),
      ];

      const ana = findPerson(analyseMessages(messages), 'Ana');
      const countsByType = [...ana.mediaCountsByType.values()];

      expect(ana.mediaCount).toBe(3);
      expect(countsByType.reduce((total, count) => total + count, 0)).toBe(3);
    });

    it('counts nothing for somebody who only typed', () => {
      const ana = findPerson(analyseMessages([textMessage({ sender: 'Ana' })]), 'Ana');

      expect(ana.mediaCountsByType.size).toBe(0);
    });
  });

  describe('captions of media', () => {
    it('counts the words and emojis of a caption for its sender and for the chat', () => {
      const messages = [
        mediaMessage({
          sender: 'Ana',
          text: 'image omitted',
          caption: `happy birthday Bob ${PARTY_POPPER}`,
        }),
      ];

      const analysis = analyseMessages(messages);
      const ana = findPerson(analysis, 'Ana');

      expect(ana.wordCount).toBe(3);
      expect(ana.emojiCount).toBe(1);
      expect([...ana.wordCounts.keys()]).toEqual(['happy', 'birthday', 'bob']);
      expect([...analysis.wordCounts.keys()]).toEqual(['happy', 'birthday', 'bob']);
      expect(analysis.emojiCounts).toEqual(new Map([[PARTY_POPPER, 1]]));
    });

    it('still counts the message as media and not as typed text', () => {
      const messages = [
        mediaMessage({ sender: 'Ana', text: 'image omitted', caption: 'happy birthday' }),
      ];

      const ana = findPerson(analyseMessages(messages), 'Ana');

      expect(ana.mediaCount).toBe(1);
      expect(ana.textMessageCount).toBe(0);
      expect(ana.mediaCountsByType).toEqual(new Map([['photo', 1]]));
    });

    it('goes by the placeholder for the type of media, whatever the caption says', () => {
      const messages = [
        mediaMessage({ sender: 'Ana', text: 'image omitted', caption: 'my best video' }),
      ];

      const ana = findPerson(analyseMessages(messages), 'Ana');

      expect(ana.mediaCountsByType).toEqual(new Map([['photo', 1]]));
    });

    it('does not let a caption be the longest message', () => {
      const messages = [
        mediaMessage({
          sender: 'Ana',
          sentAt: '2024-01-13 10:00',
          text: 'image omitted',
          caption: 'a long caption with a lot of words in it',
        }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01', text: 'nice one' }),
      ];

      const analysis = analyseMessages(messages);

      expect(analysis.longestMessage?.text).toBe('nice one');
    });

    it('counts nothing for media without a caption', () => {
      const ana = findPerson(analyseMessages([mediaMessage({ sender: 'Ana' })]), 'Ana');

      expect(ana.wordCount).toBe(0);
    });
  });

  describe('mentions', () => {
    it('counts whom each person mentioned, in typed messages and in captions', () => {
      const messages = [
        textMessage({
          sender: 'Ana',
          sentAt: '2024-01-13 10:00',
          text: '@⁨Bob⁩ and @⁨Carla⁩ are you coming?',
        }),
        mediaMessage({
          sender: 'Ana',
          sentAt: '2024-01-13 10:01',
          text: 'image omitted',
          caption: 'look @⁨Bob⁩',
        }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:02', text: 'yes @⁨Ana⁩' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Ana').mentionCountsByName).toEqual(
        new Map([
          ['Bob', 2],
          ['Carla', 1],
        ]),
      );
      expect(findPerson(analysis, 'Bob').mentionCountsByName).toEqual(new Map([['Ana', 1]]));
    });

    it('does not count the mentioned name among the words of the chat', () => {
      const messages = [textMessage({ sender: 'Ana', text: '@⁨Bob⁩ dinner tonight' })];

      expect([...analyseMessages(messages).wordCounts.keys()]).toEqual(['dinner', 'tonight']);
    });
  });

  describe('signature phrases', () => {
    /** Ana keeps saying one thing, Bob another; both also say what everybody says. */
    function messagesWithCatchphrases(): ReturnType<typeof textMessage>[] {
      const messages: ReturnType<typeof textMessage>[] = [];
      for (let minute = 10; minute < 40; minute += 1) {
        const sender = minute % 2 === 0 ? 'Ana' : 'Bob';
        const catchphrase = sender === 'Ana' ? 'count me in' : 'no way dude';
        const text = minute % 3 === 0 ? 'good morning everybody' : catchphrase;
        messages.push(textMessage({ sender, sentAt: `2024-01-13 10:${minute}`, text }));
      }
      return messages;
    }

    it('gives each person the phrases they use far more than the others', () => {
      const analysis = analyseMessages(messagesWithCatchphrases());

      expect(findPerson(analysis, 'Ana').signaturePhrases).toEqual([
        { phrase: 'count me in', count: 10 },
      ]);
      expect(findPerson(analysis, 'Bob').signaturePhrases).toEqual([
        { phrase: 'no way dude', count: 10 },
      ]);
    });

    it('gives nobody a phrase in a chat with a single sender', () => {
      const messages = messagesWithCatchphrases().map((message) => ({ ...message, sender: 'Ana' }));

      expect(findPerson(analyseMessages(messages), 'Ana').signaturePhrases).toEqual([]);
    });

    it('gives no phrase to somebody who only sent media', () => {
      const messages = [
        ...messagesWithCatchphrases(),
        mediaMessage({ sender: 'Carla', sentAt: '2024-01-13 11:00' }),
      ];

      expect(findPerson(analyseMessages(messages), 'Carla').signaturePhrases).toEqual([]);
    });

    it('builds phrases from captions too', () => {
      const messages = messagesWithCatchphrases().map((message) =>
        message.sender === 'Ana' && message.text === 'count me in'
          ? mediaMessage({
              sender: 'Ana',
              sentAt: '2024-01-13 10:00',
              text: 'image omitted',
              caption: 'count me in',
            })
          : message,
      );

      expect(findPerson(analyseMessages(messages), 'Ana').signaturePhrases).toEqual([
        { phrase: 'count me in', count: 10 },
      ]);
    });
  });

  describe('then and now', () => {
    it('compares the first year with the latest year of a chat of two years or more', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2021-01-01 10:00' }),
        textMessage({ sender: 'Ana', sentAt: '2021-06-01 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2021-12-01 10:00' }),
        textMessage({ sender: 'Ana', sentAt: '2022-07-01 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2023-06-01 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-01 10:00' }),
      ];

      const analysis = analyseMessages(messages);
      const ana = findPerson(analysis, 'Ana');
      const bob = findPerson(analysis, 'Bob');

      expect(analysis.comparisonPeriodInDays).toBe(365);
      expect([ana.earlyMessageCount, ana.recentMessageCount]).toEqual([2, 0]);
      expect([bob.earlyMessageCount, bob.recentMessageCount]).toEqual([1, 2]);
    });

    it('splits a chat shorter than two years in two halves that do not overlap', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-01 10:00' }),
        textMessage({ sender: 'Ana', sentAt: '2024-02-01 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-03-01 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-04-10 10:00' }),
      ];

      const analysis = analyseMessages(messages);
      const earlyCounts = analysis.people.map((person) => person.earlyMessageCount);
      const recentCounts = analysis.people.map((person) => person.recentMessageCount);

      expect(analysis.comparisonPeriodInDays).toBe(50);
      expect(earlyCounts.reduce((total, count) => total + count, 0)).toBe(2);
      expect(recentCounts.reduce((total, count) => total + count, 0)).toBe(2);
    });

    it('counts the newest message in the latest period and the oldest in the first', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-01 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-06-01 10:00' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Ana').earlyMessageCount).toBe(1);
      expect(findPerson(analysis, 'Bob').recentMessageCount).toBe(1);
    });

    it('does not compare a chat of less than sixty days', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-01 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-02-28 10:00' }),
      ];

      const analysis = analyseMessages(messages);

      expect(analysis.comparisonPeriodInDays).toBe(0);
      expect(findPerson(analysis, 'Ana').earlyMessageCount).toBe(0);
      expect(findPerson(analysis, 'Bob').recentMessageCount).toBe(0);
    });

    it('compares a chat of exactly sixty days', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-03-01 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-04-30 10:00' }),
      ];

      expect(analyseMessages(messages).comparisonPeriodInDays).toBe(30);
    });
  });

  describe('who replies to whom', () => {
    it('credits a reply to whoever wrote the message just before it', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01' }),
        textMessage({ sender: 'Carla', sentAt: '2024-01-13 10:02' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:03' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:04' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Bob').replyCountsByRecipient).toEqual(new Map([['Ana', 2]]));
      expect(findPerson(analysis, 'Carla').replyCountsByRecipient).toEqual(new Map([['Bob', 1]]));
      expect(findPerson(analysis, 'Ana').replyCountsByRecipient).toEqual(new Map([['Carla', 1]]));
    });

    it('lists the people somebody replied to in order of first reply', () => {
      const messages = [
        textMessage({ sender: 'Carla', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:01' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:02' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:03' }),
      ];

      const ana = findPerson(analyseMessages(messages), 'Ana');

      expect([...ana.replyCountsByRecipient.keys()]).toEqual(['Carla', 'Bob']);
    });

    it('counts one reply per turn, not one per message of the turn', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:02' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:03' }),
      ];

      const bob = findPerson(analyseMessages(messages), 'Bob');

      expect(bob.replyCountsByRecipient).toEqual(new Map([['Ana', 1]]));
    });

    it('counts as many replies in total as it records reply delays', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01' }),
        textMessage({ sender: 'Carla', sentAt: '2024-01-13 10:02' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:03' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-14 10:03' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-14 10:04' }),
      ];

      const bob = findPerson(analyseMessages(messages), 'Bob');
      const replyCounts = [...bob.replyCountsByRecipient.values()];

      expect(bob.replyCountsByRecipient).toEqual(
        new Map([
          ['Ana', 2],
          ['Carla', 1],
        ]),
      );
      expect(replyCounts.reduce((total, count) => total + count, 0)).toBe(
        bob.replyDelaysInMilliseconds.length,
      );
    });

    it('credits nobody when the answer comes after twelve hours or more', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 08:00:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 20:00:00' }),
      ];

      const bob = findPerson(analyseMessages(messages), 'Bob');

      expect(bob.replyCountsByRecipient.size).toBe(0);
    });

    it('credits nobody in a chat with a single sender', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:05' }),
      ];

      const ana = findPerson(analyseMessages(messages), 'Ana');

      expect(ana.replyCountsByRecipient.size).toBe(0);
    });

    it('counts a photo sent in answer as a reply too', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        mediaMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01' }),
      ];

      const bob = findPerson(analyseMessages(messages), 'Bob');

      expect(bob.replyCountsByRecipient).toEqual(new Map([['Ana', 1]]));
    });
  });

  describe('the last word of a conversation', () => {
    it('goes to whoever wrote last before eight hours of silence', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-14 10:00' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Bob').conversationsEndedCount).toBe(1);
      expect(findPerson(analysis, 'Ana').conversationsEndedCount).toBe(0);
    });

    it('is not given for the conversation still open at the end of the export', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Ana').conversationsEndedCount).toBe(0);
      expect(findPerson(analysis, 'Bob').conversationsEndedCount).toBe(0);
    });

    it('is given after exactly eight hours of silence', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 18:00:00' }),
      ];

      expect(findPerson(analyseMessages(messages), 'Ana').conversationsEndedCount).toBe(1);
    });

    it('is not given after one second less than eight hours', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 17:59:59' }),
      ];

      expect(findPerson(analyseMessages(messages), 'Ana').conversationsEndedCount).toBe(0);
    });

    it('goes to the same person who then breaks the silence', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 22:00' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-14 08:00' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-15 08:00' }),
      ];

      expect(findPerson(analyseMessages(messages), 'Ana').conversationsEndedCount).toBe(2);
    });

    it('is given once for every conversation but the last', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-14 10:00' }),
        textMessage({ sender: 'Carla', sentAt: '2024-01-15 10:00' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-16 10:00' }),
      ];

      const analysis = analyseMessages(messages);
      const endedCounts = analysis.people.map((person) => person.conversationsEndedCount);

      expect(analysis.conversationCount).toBe(4);
      expect(endedCounts.reduce((total, count) => total + count, 0)).toBe(3);
    });

    it('can be a photo or a deleted message', () => {
      const messages = [
        mediaMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        deletedMessage({ sender: 'Bob', sentAt: '2024-01-14 10:00' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-15 10:00' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Ana').conversationsEndedCount).toBe(1);
      expect(findPerson(analysis, 'Bob').conversationsEndedCount).toBe(1);
    });
  });

  describe('unanswered questions', () => {
    it('counts a question after which nobody wrote for eight hours', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'anyone up for dinner?' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-14 10:00', text: 'good morning' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Ana').unansweredQuestionCount).toBe(1);
      expect(findPerson(analysis, 'Bob').unansweredQuestionCount).toBe(0);
    });

    it('does not count a question somebody else wrote after', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'anyone up for dinner?' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:05', text: 'yes' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-14 10:00', text: 'good morning' }),
      ];

      expect(findPerson(analyseMessages(messages), 'Ana').unansweredQuestionCount).toBe(0);
    });

    it('does not count an earlier question once the same person has been answered', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'dinner?' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:05', text: 'yes' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:06', text: 'great' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-14 10:00', text: 'good morning' }),
      ];

      expect(findPerson(analyseMessages(messages), 'Ana').unansweredQuestionCount).toBe(0);
    });

    it('counts every question of the closing turn, wherever it stands in the turn', () => {
      const messages = [
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 09:59', text: 'hello' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'dinner?' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:01', text: 'I can book a table' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:02', text: 'hello??' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-14 10:00', text: 'good morning' }),
      ];

      expect(findPerson(analyseMessages(messages), 'Ana').unansweredQuestionCount).toBe(2);
    });

    it('counts a question the same person follows up on after the silence', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 22:00', text: 'dinner tomorrow?' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-14 08:00', text: 'so, dinner?' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-14 08:01', text: 'yes' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-15 08:00', text: 'good morning' }),
      ];

      expect(findPerson(analyseMessages(messages), 'Ana').unansweredQuestionCount).toBe(1);
    });

    it('does not count the question the export ends on', () => {
      const messages = [
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:00', text: 'hello' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:01', text: 'dinner?' }),
      ];

      expect(findPerson(analyseMessages(messages), 'Ana').unansweredQuestionCount).toBe(0);
    });

    it('does not count a closing turn without a question', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'see you tomorrow' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-14 10:00', text: 'good morning' }),
      ];

      expect(findPerson(analyseMessages(messages), 'Ana').unansweredQuestionCount).toBe(0);
    });

    it('never counts more unanswered questions than questions asked', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'dinner?' }),
        mediaMessage({ sender: 'Ana', sentAt: '2024-01-13 10:01' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-14 10:00', text: 'lunch?' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-15 10:00', text: 'sorry, was away' }),
      ];

      const ana = findPerson(analyseMessages(messages), 'Ana');

      expect(ana.questionCount).toBe(2);
      expect(ana.unansweredQuestionCount).toBe(2);
    });
  });

  describe('turns', () => {
    it('counts the first message of the chat as a turn', () => {
      const analysis = analyseMessages([textMessage({ sender: 'Ana' })]);

      expect(findPerson(analysis, 'Ana').turnCount).toBe(1);
    });

    it('counts several messages in a row from one participant as a single turn', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:01' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:02' }),
      ];

      expect(findPerson(analyseMessages(messages), 'Ana').turnCount).toBe(1);
    });

    it('counts a new turn each time the speaker changes', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:02' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:03' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:04' }),
      ];

      const analysis = analyseMessages(messages);

      expect(findPerson(analysis, 'Ana').turnCount).toBe(2);
      expect(findPerson(analysis, 'Bob').turnCount).toBe(2);
    });

    it('does not count a new turn when the same participant returns after a long silence', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-20 10:00' }),
      ];

      expect(findPerson(analyseMessages(messages), 'Ana').turnCount).toBe(1);
    });
  });

  describe('longest silence', () => {
    it('is null for a chat of a single message', () => {
      expect(analyseMessages([textMessage()]).longestSilence).toBeNull();
    });

    it('is null when every message was sent at the same moment', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:00' }),
      ];

      expect(analyseMessages(messages).longestSilence).toBeNull();
    });

    it('is the longest gap between two consecutive messages, with the moments it lasted from and to', () => {
      const messages = [
        textMessage({ sentAt: '2024-01-13 10:00' }),
        textMessage({ sentAt: '2024-01-13 11:00' }),
        textMessage({ sentAt: '2024-01-16 11:00' }),
        textMessage({ sentAt: '2024-01-16 12:00' }),
      ];

      expect(analyseMessages(messages).longestSilence).toEqual({
        durationInMilliseconds: 72 * MILLISECONDS_PER_HOUR,
        from: localTime('2024-01-13 11:00'),
        to: localTime('2024-01-16 11:00'),
      });
    });

    it('is the earliest of several equally long gaps', () => {
      const messages = [
        textMessage({ sentAt: '2024-01-13 10:00' }),
        textMessage({ sentAt: '2024-01-13 12:00' }),
        textMessage({ sentAt: '2024-01-13 14:00' }),
      ];

      expect(analyseMessages(messages).longestSilence?.from).toEqual(localTime('2024-01-13 10:00'));
    });

    it('measures the gap between messages of the same participant too', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 15:00' }),
      ];

      expect(analyseMessages(messages).longestSilence?.durationInMilliseconds).toBe(
        5 * MILLISECONDS_PER_HOUR,
      );
    });
  });
});
