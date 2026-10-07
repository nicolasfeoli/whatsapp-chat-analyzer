import { describe, expect, it } from 'vitest';

import { analyseChat } from '../../../src/core/analysis/analyse-chat';
import {
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
  MILLISECONDS_PER_SECOND,
} from '../../../src/core/time-constants';
import { analyseMessages, findPerson, participantNames } from '../../fixtures/analysis-readers';
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
