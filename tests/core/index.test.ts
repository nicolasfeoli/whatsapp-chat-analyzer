/**
 * Tests of the public API: `analyseChatExport`, which goes from the text of an
 * export to everything the page draws, and whole invented chats that exercise
 * the parser and the analysis together.
 *
 * Every chat line here is invented. Never add a real export to this folder.
 */

import { describe, expect, it } from 'vitest';

import * as core from '../../src/core/index';
import { analyseChatExport, median } from '../../src/core/index';
import type {
  AmbiguousDateOrder,
  AnalysedChatExportResult,
  ChatAnalysis,
} from '../../src/core/index';
import { findPerson, participantNames } from '../fixtures/analysis-readers';
import {
  androidLine,
  androidNoticeLine,
  exportText,
  iphoneLine,
  iphoneNotTypedLine,
} from '../fixtures/export-lines';
import { localTime, textsOf } from '../fixtures/messages';
import { LEFT_TO_RIGHT_MARK, NARROW_NO_BREAK_SPACE } from '../fixtures/special-characters';

/** The number of messages in the chat that used to overflow the call stack. */
const LARGE_CHAT_MESSAGE_COUNT = 400_000;

/** Parsing and analysing four hundred thousand messages takes a few seconds. */
const LARGE_CHAT_TIMEOUT_IN_MILLISECONDS = 120_000;

/** The largest day of the month used in the large chat, so every date reads both ways. */
const LARGE_CHAT_DAYS_IN_CYCLE = 9;

/**
 * Analyses an export and fails the test when no message could be read, so the
 * test does not need to narrow the result itself.
 */
function analyseExport(
  rawText: string,
  forcedDateOrder: AmbiguousDateOrder | null = null,
  locale: string | null = null,
): AnalysedChatExportResult {
  const result = analyseChatExport(rawText, forcedDateOrder, locale);
  if (result.kind !== 'analysed') {
    throw new Error('Expected the export to contain messages');
  }
  return result;
}

/** Analyses the lines of an export and returns only the analysis. */
function analysisOf(lines: readonly string[]): ChatAnalysis {
  return analyseExport(exportText(lines)).analysis;
}

/**
 * Writes the lines of a chat of `LARGE_CHAT_MESSAGE_COUNT` one-letter messages
 * that alternate between two people and cycle through nine days.
 */
function largeChatLines(): string[] {
  const lines = new Array<string>(LARGE_CHAT_MESSAGE_COUNT);
  for (let i = 0; i < LARGE_CHAT_MESSAGE_COUNT; i++) {
    const day = 1 + (i % LARGE_CHAT_DAYS_IN_CYCLE);
    const sender = i % 2 === 1 ? 'Ana' : 'Bob';
    lines[i] = `1/${day}/24, 10:00 - ${sender}: m`;
  }
  return lines;
}

describe('analyseChatExport', () => {
  describe('text without messages', () => {
    it.each([
      { description: 'an empty text', rawText: '' },
      { description: 'text that is not a chat', rawText: 'not a chat' },
      {
        description: 'an export with only system notices',
        rawText: androidNoticeLine({ notice: 'Bob added Carl' }),
      },
      {
        description: 'an export in which every date is impossible',
        rawText: androidLine({ date: '31/02/24' }),
      },
    ])('returns the empty result for $description', ({ rawText }) => {
      expect(analyseChatExport(rawText, null, 'en-US')).toEqual({ kind: 'empty' });
    });
  });

  describe('a chat with messages', () => {
    it('returns the analysis, the date order and the parse report', () => {
      const rawText = androidLine({
        date: '12/31/23',
        time: '10:00 PM',
        sender: 'Ana',
        text: 'hi',
      });

      const result = analyseExport(rawText, null, 'en-US');

      expect(result.kind).toBe('analysed');
      expect(result.analysis.totalMessageCount).toBe(1);
      expect(result.dateOrder).toBe('mdy');
      expect(result.isDateOrderAmbiguous).toBe(false);
      expect(result.report).toEqual({
        nonEmptyLineCount: 1,
        entryCount: 1,
        systemNoticeCount: 0,
        unreadableDateCount: 0,
        foldedPastedLineCount: 0,
        platform: 'Android',
      });
    });

    it('passes the minute resolution of an Android export to the analysis', () => {
      const result = analyseExport(androidLine({ time: '22:00' }));

      expect(result.analysis.timestampResolution).toBe('minute');
    });

    it('passes the second resolution of an iPhone export to the analysis', () => {
      const result = analyseExport(iphoneLine({ time: '22:00:15' }));

      expect(result.analysis.timestampResolution).toBe('second');
    });

    it('uses the locale to break a tie between the two date orders', () => {
      const rawText = androidLine({ date: '1/2/24' });

      expect(analyseExport(rawText, null, 'en-US').dateOrder).toBe('mdy');
      expect(analyseExport(rawText, null, 'es-CR').dateOrder).toBe('dmy');
    });

    it('reads day first and detects the order when called with the text alone', () => {
      const result = analyseChatExport(androidLine({ date: '1/2/24' }));

      expect(result).toMatchObject({
        kind: 'analysed',
        dateOrder: 'dmy',
        isDateOrderAmbiguous: true,
      });
    });

    it('uses the date order the user forced', () => {
      const rawText = androidLine({ date: '1/2/24', time: '10:00' });

      const result = analyseExport(rawText, 'mdy', 'es-CR');

      expect(result.dateOrder).toBe('mdy');
      expect(result.analysis.firstMessageTimestamp).toEqual(localTime('2024-01-02 10:00'));
    });

    it('sorts the messages of the analysis even when the file is out of order', () => {
      const rawText = exportText([
        androidLine({ time: '22:05', sender: 'Bob', text: 'second' }),
        androidLine({ time: '22:00', sender: 'Ana', text: 'first' }),
      ]);

      expect(textsOf(analyseExport(rawText).analysis.messages)).toEqual(['first', 'second']);
    });

    it('returns plain data that survives the structured clone to and from the worker', () => {
      const rawText = exportText([
        iphoneLine({ date: '30/12/2023', time: '22:00:00', sender: 'Ana', text: 'pizza? 🍕' }),
        iphoneNotTypedLine({
          date: '30/12/2023',
          time: '22:00:30',
          sender: 'Bob',
          text: 'image omitted',
        }),
        iphoneNotTypedLine({
          date: '31/12/2023',
          time: '09:00:00',
          sender: 'Bob',
          text: 'This message was deleted.',
        }),
      ]);
      const result = analyseExport(rawText);
      const messageKinds = result.analysis.messages.map((message) => message.kind);

      const clonedResult = structuredClone(result);

      /* The chat is only a fair sample when it holds every kind of message and a silence. */
      expect(messageKinds).toEqual(['text', 'media', 'deleted']);
      expect(result.analysis.longestSilence).not.toBeNull();
      /*
       * `toStrictEqual` also compares prototypes: a class instance anywhere in
       * the result would come back from the clone as a plain object and fail here.
       */
      expect(clonedResult).toStrictEqual(result);
    });
  });
});

describe('an iPhone export from the United States', () => {
  const afternoon = (time: string): string => `${time}${NARROW_NO_BREAK_SPACE}PM`;
  const lines = [
    iphoneNotTypedLine({
      date: '8/31/26',
      time: afternoon('1:29:57'),
      sender: 'Ana',
      text: 'Messages and calls are end-to-end encrypted. Only people in this chat can read them.',
    }),
    iphoneNotTypedLine({
      date: '8/31/26',
      time: afternoon('1:29:57'),
      sender: 'Ana',
      text: 'Ana is a contact.',
    }),
    iphoneLine({ date: '8/31/26', time: afternoon('1:12:41'), sender: 'Ana', text: 'Hola hola' }),
    `${LEFT_TO_RIGHT_MARK}${iphoneNotTypedLine({ date: '8/31/26', time: afternoon('1:13:00'), sender: 'Bob', text: 'sticker omitted' })}`,
    `${LEFT_TO_RIGHT_MARK}${iphoneNotTypedLine({ date: '8/31/26', time: afternoon('1:13:10'), sender: 'Bob', text: '<attached: 00001-PHOTO.jpg>' })}`,
    iphoneNotTypedLine({
      date: '8/31/26',
      time: afternoon('1:13:20'),
      sender: 'Ana',
      text: 'This message was deleted.',
    }),
    iphoneNotTypedLine({
      date: '8/31/26',
      time: afternoon('1:13:30'),
      sender: 'Bob',
      text: 'You deleted this message.',
    }),
    iphoneNotTypedLine({
      date: '8/31/26',
      time: afternoon('1:13:40'),
      sender: 'Bob',
      text: 'Location: https://maps.google.com/?q=1,2',
    }),
    iphoneNotTypedLine({
      date: '8/31/26',
      time: afternoon('1:13:50'),
      sender: 'Ana',
      text: 'POLL:',
    }),
    `${LEFT_TO_RIGHT_MARK}OPTION: yes (2 votes)`,
    iphoneLine({
      date: '8/31/26',
      time: afternoon('1:14:00'),
      sender: 'Ana',
      text: `fixed it ${LEFT_TO_RIGHT_MARK}<This message was edited>`,
    }),
    iphoneLine({
      date: '8/31/26',
      time: afternoon('1:14:10'),
      sender: 'Bob',
      text: 'that part was omitted',
    }),
  ];
  const result = analyseExport(lines.join('\r\n'));

  it('is read month first, to the second', () => {
    expect(result.dateOrder).toBe('mdy');
    expect(result.analysis.timestampResolution).toBe('second');
  });

  it('drops the two system notices and keeps the nine messages', () => {
    expect(result.report.systemNoticeCount).toBe(2);
    expect(result.analysis.totalMessageCount).toBe(9);
  });

  it('counts one deleted message for each participant', () => {
    expect(findPerson(result.analysis, 'Ana').deletedCount).toBe(1);
    expect(findPerson(result.analysis, 'Bob').deletedCount).toBe(1);
  });

  it('counts the poll as media for Ana, and the sticker, the photo and the location for Bob', () => {
    expect(findPerson(result.analysis, 'Ana').mediaCount).toBe(1);
    expect(findPerson(result.analysis, 'Bob').mediaCount).toBe(3);
  });

  it('keeps the sentence that merely ends in "omitted" as text', () => {
    expect(findPerson(result.analysis, 'Bob').textMessageCount).toBe(1);
  });

  it('removes the edited note from the message it was appended to', () => {
    expect(textsOf(result.analysis.messages)).toContain('fixed it');
  });

  it('counts that message as edited for Ana, and none for Bob', () => {
    expect(findPerson(result.analysis, 'Ana').editedMessageCount).toBe(1);
    expect(findPerson(result.analysis, 'Bob').editedMessageCount).toBe(0);
  });

  it('reads 1:12 PM as hour 13', () => {
    expect(result.analysis.firstMessageTimestamp).toEqual(localTime('2026-08-31 13:12:41'));
  });
});

describe('an Android export from the United States on a 12-hour clock', () => {
  const evening = (time: string): string => `${time}${NARROW_NO_BREAK_SPACE}PM`;
  const afterMidnight = (time: string): string => `${time}${NARROW_NO_BREAK_SPACE}AM`;
  const lines = [
    androidNoticeLine({
      date: '12/31/23',
      time: evening('9:58'),
      notice: 'Messages and calls are end-to-end encrypted. Tap to learn more.',
    }),
    androidLine({
      date: '12/31/23',
      time: evening('10:00'),
      sender: 'Ana',
      text: 'happy new year',
    }),
    androidLine({ date: '12/31/23', time: evening('10:00'), sender: 'Bob', text: 'same to you' }),
    'second line',
    androidLine({
      date: '12/31/23',
      time: evening('10:01'),
      sender: 'Ana',
      text: '<Media omitted>',
    }),
    androidLine({
      date: '12/31/23',
      time: evening('10:02'),
      sender: 'Bob',
      text: 'This message was deleted',
    }),
    androidLine({
      date: '12/31/23',
      time: evening('10:03'),
      sender: 'Ana',
      text: 'IMG-20231231-WA0001.jpg (file attached)',
    }),
    'caption',
    androidNoticeLine({ date: '1/1/24', time: afterMidnight('12:05'), notice: 'Bob added Carl' }),
    androidNoticeLine({
      date: '1/1/24',
      time: afterMidnight('12:06'),
      notice: 'Bob changed the group name to "Party: 2024"',
    }),
    androidLine({ date: '1/1/24', time: afterMidnight('12:07'), sender: 'Carl', text: 'hello' }),
    androidLine({ date: '1/1/24', time: afterMidnight('12:08'), sender: 'Bob', text: 'null' }),
    androidLine({
      date: '1/1/24',
      time: afterMidnight('12:09'),
      sender: 'Ana',
      text: 'Missed voice call',
    }),
  ];
  const result = analyseExport(lines.join('\r\n'));

  it('is read month first, to the minute', () => {
    expect(result.dateOrder).toBe('mdy');
    expect(result.analysis.timestampResolution).toBe('minute');
  });

  it('finds the three people who wrote, and nobody named after a notice', () => {
    expect(participantNames(result.analysis)).toEqual(['Ana', 'Bob', 'Carl']);
  });

  it('keeps seven messages and drops four system notices', () => {
    expect(result.analysis.totalMessageCount).toBe(7);
    expect(result.report.systemNoticeCount).toBe(4);
  });

  it('joins the second line to the message it continues', () => {
    expect(textsOf(result.analysis.messages)).toContain('same to you\nsecond line');
  });

  it('counts the placeholder and the attachment as media for Ana', () => {
    expect(findPerson(result.analysis, 'Ana').mediaCount).toBe(2);
  });

  it('counts the "null" line as media and the tombstone as deleted for Bob', () => {
    expect(findPerson(result.analysis, 'Bob')).toMatchObject({ mediaCount: 1, deletedCount: 1 });
  });

  it('does not count the caption of the attachment as words', () => {
    expect(findPerson(result.analysis, 'Ana').wordCount).toBe(3);
  });

  it('reads 12:08 AM as eight minutes past midnight', () => {
    expect(result.analysis.lastMessageTimestamp).toEqual(localTime('2024-01-01 00:08'));
  });
});

describe('exports in other languages', () => {
  it('reads a Spanish Android export with "p. m." times, a placeholder and a tombstone', () => {
    const analysis = analysisOf([
      androidLine({ date: '31/12/23', time: '10:00 p. m.', sender: 'Ana', text: 'hola' }),
      androidLine({
        date: '31/12/23',
        time: '10:01 p. m.',
        sender: 'Bob',
        text: '<Multimedia omitido>',
      }),
      androidLine({
        date: '1/1/24',
        time: '12:02 a. m.',
        sender: 'Bob',
        text: 'Se eliminó este mensaje',
      }),
    ]);

    expect(analysis.firstMessageTimestamp).toEqual(localTime('2023-12-31 22:00'));
    expect(analysis.lastMessageTimestamp).toEqual(localTime('2024-01-01 00:02'));
    expect(findPerson(analysis, 'Bob')).toMatchObject({ mediaCount: 1, deletedCount: 1 });
  });

  it('does not count German placeholders and tombstones as words', () => {
    const analysis = analysisOf([
      '31.12.23, 22:00 - Ana: hallo',
      '31.12.23, 22:01 - Bob: <Medien ausgeschlossen>',
      '31.12.23, 22:02 - Bob: Diese Nachricht wurde gelöscht',
    ]);

    expect(findPerson(analysis, 'Bob')).toMatchObject({
      mediaCount: 1,
      deletedCount: 1,
      wordCount: 0,
    });
  });

  it('does not count Portuguese placeholders of either platform as words', () => {
    const analysis = analysisOf([
      '31/12/2023 22:00 - Ana: oi',
      '31/12/2023 22:01 - Bob: <Mídia oculta>',
      iphoneNotTypedLine({
        date: '31/12/2023',
        time: '22:02:00',
        sender: 'Bob',
        text: 'imagem ocultada',
      }),
    ]);

    expect(findPerson(analysis, 'Bob')).toMatchObject({ mediaCount: 2, wordCount: 0 });
  });
});

describe('senders named like the verb of a group notice', () => {
  it('keeps "Left Shark" and "Juan Added" and drops the notice about a changed subject', () => {
    const analysis = analysisOf([
      iphoneLine({ time: '22:00:00', sender: 'Left Shark', text: 'hi' }),
      iphoneLine({ time: '22:00:05', sender: 'Juan Added', text: 'hi' }),
      androidNoticeLine({
        date: '31/12/2023',
        time: '22:01',
        notice: 'Bob changed the subject from "a" to "b: c"',
      }),
    ]);

    expect(participantNames(analysis)).toEqual(['Left Shark', 'Juan Added']);
  });
});

describe('an export that only records minutes', () => {
  it('gives a typical reply time of zero when answers come within the same minute', () => {
    const analysis = analysisOf([
      androidLine({ date: '1/13/24', time: '10:00', sender: 'Bob', text: 'msg' }),
      androidLine({ date: '1/13/24', time: '10:00', sender: 'Ana', text: 'msg' }),
      androidLine({ date: '1/13/24', time: '10:00', sender: 'Bob', text: 'msg' }),
      androidLine({ date: '1/13/24', time: '10:00', sender: 'Ana', text: 'msg' }),
      androidLine({ date: '1/13/24', time: '10:01', sender: 'Bob', text: 'msg' }),
      androidLine({ date: '1/13/24', time: '10:01', sender: 'Ana', text: 'msg' }),
    ]);

    expect(analysis.timestampResolution).toBe('minute');
    expect(median(findPerson(analysis, 'Ana').replyDelaysInMilliseconds)).toBe(0);
  });
});

describe('a chat of four hundred thousand messages', () => {
  it(
    'is parsed and analysed without overflowing the call stack',
    () => {
      const rawText = largeChatLines().join('\r\n');

      const result = analyseExport(rawText);

      expect(result.analysis.totalMessageCount).toBe(LARGE_CHAT_MESSAGE_COUNT);
      expect(result.report.entryCount).toBe(LARGE_CHAT_MESSAGE_COUNT);
    },
    LARGE_CHAT_TIMEOUT_IN_MILLISECONDS,
  );
});

describe('public API', () => {
  it('exports exactly these functions and constants', () => {
    /*
     * The list is spelt out so that adding to, or removing from, what the page
     * and the worker may import is a decision somebody has to write down here.
     */
    expect(Object.keys(core).sort()).toEqual([
      'DAYS_PER_WEEK',
      'HOURS_PER_DAY',
      'LEFT_TO_RIGHT_MARK',
      'MILLISECONDS_PER_DAY',
      'MILLISECONDS_PER_HOUR',
      'MILLISECONDS_PER_MINUTE',
      'MILLISECONDS_PER_SECOND',
      'MINUTES_PER_HOUR',
      'SECONDS_PER_MINUTE',
      'analyseChat',
      'analyseChatExport',
      'analyseMessageText',
      'calendarDaysBetween',
      'countLinks',
      'dateFromDayKey',
      'dayKeyFromDate',
      'describeThrownValue',
      'extractEmojis',
      'extractWords',
      'formatDuration',
      'isLaugh',
      'isRecord',
      'isStopWord',
      'median',
      'mondayFirstWeekdayIndexOf',
      'parseChat',
      'removeLinks',
      'sortableDayNumber',
      'startOfDay',
    ]);
  });
});
