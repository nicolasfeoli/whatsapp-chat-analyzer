import { describe, expect, it } from 'vitest';

import { parseChat } from '../../../src/core/parsing/parse-chat';
import {
  androidLine,
  androidNoticeLine,
  exportText,
  iphoneLine,
  iphoneNotTypedLine,
} from '../../fixtures/export-lines';
import { localTime, sendersOf, textsOf } from '../../fixtures/messages';
import {
  ARABIC_AFTER_NOON_MARKER,
  ARABIC_COMMA,
  LEFT_TO_RIGHT_MARK,
  NARROW_NO_BREAK_SPACE,
  withArabicIndicDigits,
  withDevanagariDigits,
  withPersianDigits,
} from '../../fixtures/special-characters';

describe('parseChat', () => {
  describe('text that is not a chat', () => {
    it.each([
      { description: 'an empty text', rawText: '' },
      { description: 'ordinary prose', rawText: 'not a chat\njust some notes' },
      {
        description: 'an export that contains only system notices',
        rawText: androidNoticeLine({ notice: 'Messages and calls are end-to-end encrypted.' }),
      },
    ])('returns no messages and no date order for $description', ({ rawText }) => {
      const parsedChat = parseChat(rawText);

      expect(parsedChat.messages).toEqual([]);
      expect(parsedChat.dateOrder).toBeNull();
      expect(parsedChat.isDateOrderAmbiguous).toBe(false);
    });

    it('still reports what it saw in a text without messages', () => {
      const rawText = exportText([
        'Exported chat',
        androidNoticeLine({ notice: 'Messages and calls are end-to-end encrypted.' }),
      ]);

      expect(parseChat(rawText).report).toEqual({
        nonEmptyLineCount: 2,
        entryCount: 1,
        systemNoticeCount: 1,
        unreadableDateCount: 0,
        foldedPastedLineCount: 0,
        platform: 'Android',
      });
    });

    it('reports no platform when no line looks like an entry', () => {
      expect(parseChat('not a chat').report.platform).toBeNull();
    });
  });

  describe('messages', () => {
    it('builds a message with its timestamp, sender, text and kind', () => {
      const rawText = iphoneLine({
        date: '31/12/2023',
        time: '22:00:15',
        sender: 'Ana',
        text: 'feliz año',
      });

      expect(parseChat(rawText).messages).toEqual([
        {
          kind: 'text',
          timestamp: localTime('2023-12-31 22:00:15'),
          sender: 'Ana',
          text: 'feliz año',
        },
      ]);
    });

    it('joins the lines of a multi-line message with line breaks', () => {
      const rawText = exportText([androidLine({ text: 'same to you' }), 'second line']);

      expect(textsOf(parseChat(rawText).messages)).toEqual(['same to you\nsecond line']);
    });

    it('keeps the messages in the order of the file, even when their times are not', () => {
      const rawText = exportText([
        androidLine({ time: '22:05', sender: 'Bob' }),
        androidLine({ time: '22:00', sender: 'Ana' }),
        androidLine({ time: '22:03', sender: 'Bob' }),
      ]);

      expect(sendersOf(parseChat(rawText).messages)).toEqual(['Bob', 'Ana', 'Bob']);
    });

    it('leaves system notices out of the messages', () => {
      const rawText = exportText([
        androidNoticeLine({ time: '21:58', notice: 'Bob added Carl' }),
        androidLine({ time: '22:00', sender: 'Carl', text: 'hello' }),
      ]);

      expect(sendersOf(parseChat(rawText).messages)).toEqual(['Carl']);
    });

    it('keeps media placeholders and deleted tombstones as messages of their own kind', () => {
      const rawText = exportText([
        androidLine({ time: '22:00', text: 'hello' }),
        androidLine({ time: '22:01', text: '<Media omitted>' }),
        androidLine({ time: '22:02', text: 'This message was deleted' }),
      ]);

      const kinds = parseChat(rawText).messages.map((message) => message.kind);

      expect(kinds).toEqual(['text', 'media', 'deleted']);
    });
  });

  describe('edited messages', () => {
    it('removes the note iPhone appends to an edited message, mark included', () => {
      const rawText = iphoneLine({
        text: `fixed it ${LEFT_TO_RIGHT_MARK}<This message was edited>`,
      });

      expect(textsOf(parseChat(rawText).messages)).toEqual(['fixed it']);
    });

    it('removes the Spanish note', () => {
      const rawText = androidLine({ text: 'ya lo arreglé <Se editó este mensaje.>' });

      expect(textsOf(parseChat(rawText).messages)).toEqual(['ya lo arreglé']);
    });

    it('removes the note from the end of a multi-line message', () => {
      const rawText = exportText([
        androidLine({ text: 'first line' }),
        'second line <This message was edited>',
      ]);

      expect(textsOf(parseChat(rawText).messages)).toEqual(['first line\nsecond line']);
    });
  });

  describe('time of day', () => {
    it.each([
      {
        description: 'an iPhone PM time after a narrow no-break space',
        line: iphoneLine({ date: '8/31/26', time: `1:29:57${NARROW_NO_BREAK_SPACE}PM` }),
        expected: '2026-08-31 13:29:57',
      },
      {
        description: 'an Android AM time just after midnight',
        line: androidLine({ date: '12/31/23', time: '12:05 AM' }),
        expected: '2023-12-31 00:05',
      },
      {
        description: 'a Spanish "p. m." time',
        line: androidLine({ date: '31/12/23', time: '10:00 p. m.' }),
        expected: '2023-12-31 22:00',
      },
      {
        description: 'a Spanish "a. m." time just after midnight',
        line: androidLine({ date: '31/12/23', time: '12:02 a. m.' }),
        expected: '2023-12-31 00:02',
      },
      {
        description: 'a German 24-hour time with dots in the date',
        line: '31.12.23, 22:00 - Ana: hallo',
        expected: '2023-12-31 22:00',
      },
      {
        description: 'a Brazilian line without a comma after the date',
        line: '31/12/2023 22:00 - Ana: oi',
        expected: '2023-12-31 22:00',
      },
    ])('reads $description', ({ line, expected }) => {
      const { messages } = parseChat(line);

      expect(messages[0]?.timestamp).toEqual(localTime(expected));
    });
  });

  describe('digits of other scripts', () => {
    it('reads an Arabic line with Arabic-Indic digits, the Arabic comma and the afternoon marker', () => {
      const date = withArabicIndicDigits('31/12/2023');
      const time = withArabicIndicDigits('10:05');
      const rawText = `${date}${ARABIC_COMMA} ${time} ${ARABIC_AFTER_NOON_MARKER} - Ana: hi`;

      const { messages } = parseChat(rawText);

      expect(messages[0]?.timestamp).toEqual(localTime('2023-12-31 22:05'));
    });

    it('reads a line with Persian digits', () => {
      const rawText = `${withPersianDigits('31/12/2023, 22:06')} - Bob: hi`;

      const { messages } = parseChat(rawText);

      expect(messages[0]?.timestamp).toEqual(localTime('2023-12-31 22:06'));
    });

    it('reads a line with Devanagari digits', () => {
      const rawText = `${withDevanagariDigits('31/12/2023, 22:07')} - Marta: hi`;

      const { messages } = parseChat(rawText);

      expect(messages[0]?.timestamp).toEqual(localTime('2023-12-31 22:07'));
    });
  });

  describe('date order', () => {
    it('reads day first when a first number is above 12', () => {
      const rawText = androidLine({ date: '31/12/23' });

      const parsedChat = parseChat(rawText);

      expect(parsedChat.dateOrder).toBe('dmy');
      expect(parsedChat.isDateOrderAmbiguous).toBe(false);
    });

    it('reads month first when a second number is above 12', () => {
      const rawText = androidLine({ date: '12/31/23' });

      const parsedChat = parseChat(rawText);

      expect(parsedChat.dateOrder).toBe('mdy');
      expect(parsedChat.isDateOrderAmbiguous).toBe(false);
    });

    it('reads year first when the date starts with a four-digit year', () => {
      const rawText = iphoneLine({ date: '2023-12-31', time: '22:00:15' });

      const parsedChat = parseChat(rawText);

      expect(parsedChat.dateOrder).toBe('ymd');
      expect(parsedChat.messages[0]?.timestamp).toEqual(localTime('2023-12-31 22:00:15'));
    });

    it('decides from the whole file, so one telling date fixes every other date', () => {
      const rawText = exportText([
        androidLine({ date: '3/4/24', time: '10:00' }),
        androidLine({ date: '13/4/24', time: '10:00' }),
      ]);

      const { messages } = parseChat(rawText);

      expect(messages[0]?.timestamp).toEqual(localTime('2024-04-03 10:00'));
    });

    it('chooses the reading with the shorter span when both are possible, and says it was unsure', () => {
      const rawText = exportText([
        androidLine({ date: '1/2/24', sender: 'Ana' }),
        androidLine({ date: '1/3/24', sender: 'Bob' }),
        androidLine({ date: '1/4/24', sender: 'Ana' }),
      ]);

      const parsedChat = parseChat(rawText, null, 'es-CR');

      expect(parsedChat.dateOrder).toBe('mdy');
      expect(parsedChat.isDateOrderAmbiguous).toBe(true);
    });

    it('chooses day first when that is the reading with the shorter span', () => {
      const rawText = exportText([
        androidLine({ date: '1/2/24', sender: 'Ana' }),
        androidLine({ date: '2/2/24', sender: 'Bob' }),
        androidLine({ date: '3/2/24', sender: 'Ana' }),
      ]);

      expect(parseChat(rawText, null, 'en-US').dateOrder).toBe('dmy');
    });

    it.each([
      { locale: 'en-US', expected: 'mdy' },
      { locale: 'es-CR', expected: 'dmy' },
    ])(
      'reads a single ambiguous day as $expected in a browser set to $locale',
      ({ locale, expected }) => {
        const rawText = exportText([
          androidLine({ date: '1/2/24', time: '10:00', sender: 'Ana' }),
          androidLine({ date: '1/2/24', time: '10:01', sender: 'Bob' }),
        ]);

        expect(parseChat(rawText, null, locale).dateOrder).toBe(expected);
      },
    );

    it('reads day first when no locale is given', () => {
      const rawText = androidLine({ date: '1/2/24' });

      expect(parseChat(rawText).dateOrder).toBe('dmy');
    });

    it('uses the order the user forced, against both the file and the locale', () => {
      const rawText = exportText([
        androidLine({ date: '1/2/24', sender: 'Ana' }),
        androidLine({ date: '1/3/24', sender: 'Bob' }),
        androidLine({ date: '1/4/24', sender: 'Ana' }),
      ]);

      const parsedChat = parseChat(rawText, 'dmy', 'en-US');

      expect(parsedChat.dateOrder).toBe('dmy');
      expect(parsedChat.isDateOrderAmbiguous).toBe(true);
      expect(parsedChat.messages[2]?.timestamp).toEqual(localTime('2024-04-01 22:00'));
    });

    it('ignores a forced order for a year-first export', () => {
      const rawText = androidLine({ date: '2023/12/31' });

      expect(parseChat(rawText, 'mdy').dateOrder).toBe('ymd');
    });
  });

  describe('two-digit years', () => {
    it('reads a two-digit year as a year of this century', () => {
      const rawText = androidLine({ date: '31/12/09', time: '22:00' });

      const { messages } = parseChat(rawText);

      expect(messages[0]?.timestamp).toEqual(localTime('2009-12-31 22:00'));
    });
  });

  describe('impossible dates', () => {
    it('rejects 31 February instead of rolling it over into March', () => {
      const rawText = exportText([
        androidLine({ date: '31/02/24', sender: 'Ana' }),
        androidLine({ date: '13/03/24', sender: 'Bob' }),
      ]);

      const parsedChat = parseChat(rawText);

      expect(sendersOf(parsedChat.messages)).toEqual(['Bob']);
      expect(parsedChat.report.unreadableDateCount).toBe(1);
    });

    it('rejects an impossible time of day', () => {
      const rawText = exportText([
        androidLine({ time: '24:30', sender: 'Ana' }),
        androidLine({ time: '22:61', sender: 'Marta' }),
        androidLine({ time: '22:00', sender: 'Bob' }),
      ]);

      const parsedChat = parseChat(rawText);

      expect(sendersOf(parsedChat.messages)).toEqual(['Bob']);
      expect(parsedChat.report.unreadableDateCount).toBe(2);
    });

    it('returns no messages but keeps the date order when every date is impossible', () => {
      const rawText = androidLine({ date: '31/02/24' });

      const parsedChat = parseChat(rawText);

      expect(parsedChat.messages).toEqual([]);
      expect(parsedChat.dateOrder).toBe('dmy');
      expect(parsedChat.report.unreadableDateCount).toBe(1);
    });

    it('counts every date as unreadable when the user forces the wrong order', () => {
      const rawText = exportText([
        androidLine({ date: '30/12/23' }),
        androidLine({ date: '31/12/23' }),
      ]);

      const parsedChat = parseChat(rawText, 'mdy');

      expect(parsedChat.report.unreadableDateCount).toBe(2);
    });
  });

  describe('timestamp resolution', () => {
    it('reports second resolution for an iPhone export', () => {
      expect(parseChat(iphoneLine({ time: '22:00:15' })).timestampResolution).toBe('second');
    });

    it('reports minute resolution for an Android export', () => {
      expect(parseChat(androidLine({ time: '22:00' })).timestampResolution).toBe('minute');
    });

    it('reports second resolution as soon as one message has seconds', () => {
      const rawText = exportText([
        androidLine({ time: '22:00', sender: 'Ana' }),
        iphoneLine({ time: '22:00:15', sender: 'Bob' }),
      ]);

      expect(parseChat(rawText).timestampResolution).toBe('second');
    });

    it('reports second resolution for a text without messages', () => {
      expect(parseChat('').timestampResolution).toBe('second');
    });
  });

  describe('lines pasted from another chat', () => {
    it('folds the lines of a stranger into the message quoting them and counts them', () => {
      const rawText = exportText([
        androidLine({ date: '1/13/24', time: '10:00', sender: 'Ana', text: 'look what he said:' }),
        androidLine({ date: '1/12/24', time: '09:00', sender: 'Zed', text: 'I never said that' }),
        androidLine({ date: '1/12/24', time: '09:01', sender: 'Zed', text: 'honest' }),
        androidLine({ date: '1/13/24', time: '10:01', sender: 'Bob', text: 'wow' }),
      ]);

      const parsedChat = parseChat(rawText);

      expect(textsOf(parsedChat.messages)).toEqual([
        'look what he said:\nZed: I never said that\nZed: honest',
        'wow',
      ]);
      expect(parsedChat.report.foldedPastedLineCount).toBe(2);
    });

    it('keeps a real participant whose clock jumps back', () => {
      const rawText = exportText([
        androidLine({ date: '1/13/24', time: '10:00', sender: 'Ana', text: 'boarding' }),
        androidLine({ date: '1/13/24', time: '04:00', sender: 'Ana', text: 'landed' }),
        androidLine({ date: '1/13/24', time: '04:30', sender: 'Bob', text: 'welcome' }),
        androidLine({ date: '1/13/24', time: '11:00', sender: 'Bob', text: 'dinner?' }),
      ]);

      const parsedChat = parseChat(rawText);

      expect(parsedChat.messages).toHaveLength(4);
      expect(parsedChat.report.foldedPastedLineCount).toBe(0);
    });
  });

  describe('parse report', () => {
    it('counts what was read and what was skipped', () => {
      const rawText = [
        androidNoticeLine({
          date: '12/31/23',
          time: '9:58 PM',
          notice: 'Messages and calls are end-to-end encrypted.',
        }),
        androidLine({ date: '12/31/23', time: '10:00 PM', sender: 'Ana', text: 'hi' }),
        'more',
        '',
        androidLine({ date: '2/30/23', time: '10:01 PM', sender: 'Bob', text: 'bad date' }),
        androidLine({ date: '12/31/23', time: '10:02 PM', sender: 'Bob', text: 'ok' }),
      ].join('\r\n');

      expect(parseChat(rawText).report).toEqual({
        nonEmptyLineCount: 5,
        entryCount: 4,
        systemNoticeCount: 1,
        unreadableDateCount: 1,
        foldedPastedLineCount: 0,
        platform: 'Android',
      });
    });

    it('names iPhone as the platform of a bracketed export', () => {
      expect(parseChat(iphoneLine()).report.platform).toBe('iPhone');
    });

    it('counts an iPhone notice carrying the left-to-right mark as a system notice', () => {
      const rawText = exportText([
        iphoneNotTypedLine({ sender: 'Ana', text: 'Ana is a contact.' }),
        iphoneLine({ sender: 'Ana', text: 'hello' }),
      ]);

      expect(parseChat(rawText).report.systemNoticeCount).toBe(1);
    });
  });
});
