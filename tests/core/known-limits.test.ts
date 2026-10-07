/**
 * A catalogue of inputs the parser and the analysis are known to get wrong.
 *
 * Every test here pins behaviour that is NOT what a reader would hope for. The
 * behaviour is inherited unchanged from the original JavaScript implementation
 * (the port to TypeScript was required to keep its results identical), and
 * each case is listed under "Known limits" in `ROADMAP.md`.
 *
 * The tests exist for two reasons: so that nobody mistakes one of these for a
 * regression, and so that whoever fixes one has to change a test on purpose
 * and move the case to the suite of the module that now handles it.
 *
 * Every chat line here is invented. Never add a real export to this folder.
 */

import { describe, expect, it } from 'vitest';

import { extractWords } from '../../src/core/analysis/text-statistics';
import { analyseChatExport } from '../../src/core/index';
import { parseChat } from '../../src/core/parsing/parse-chat';
import { androidLine, exportText, iphoneLine } from '../fixtures/export-lines';
import { localTime, sendersOf, textsOf } from '../fixtures/messages';
import { LEFT_TO_RIGHT_MARK } from '../fixtures/special-characters';

/** U+2019, the curly apostrophe an iPhone keyboard types by default. */
const RIGHT_SINGLE_QUOTATION_MARK = String.fromCodePoint(0x2019);

/** U+0301, the accent that follows a plain letter in decomposed text. */
const COMBINING_ACUTE_ACCENT = String.fromCodePoint(0x0301);

describe('known limits of the parser', () => {
  describe('messages mistaken for system notices', () => {
    it.each([
      { phrase: 'security code', text: 'did the security code arrive?' },
      { phrase: 'missed video call', text: 'sorry, missed video call from you' },
      { phrase: 'end-to-end encrypted', text: 'is this end-to-end encrypted or not' },
      { phrase: 'código de seguridad', text: 'me llegó el código de seguridad' },
    ])('drops a typed message that contains "$phrase"', ({ text }) => {
      const parsedChat = parseChat(androidLine({ text }));

      expect(parsedChat.messages).toEqual([]);
      expect(parsedChat.report.systemNoticeCount).toBe(1);
    });

    it('drops a sender whose three-word name has a group verb in the middle', () => {
      const parsedChat = parseChat(androidLine({ sender: 'Uncle Left Shark', text: 'hi' }));

      expect(parsedChat.messages).toEqual([]);
      expect(parsedChat.report.systemNoticeCount).toBe(1);
    });

    it('still keeps the two-word names around that case', () => {
      const rawText = exportText([
        androidLine({ sender: 'Left Shark', text: 'hi' }),
        androidLine({ sender: 'Juan Added', text: 'hi' }),
      ]);

      expect(sendersOf(parseChat(rawText).messages)).toEqual(['Left Shark', 'Juan Added']);
    });
  });

  describe('messages mistaken for typed text', () => {
    it('counts "deleted by admin" as typed text, because the tombstone must match whole', () => {
      const rawText = androidLine({ text: 'This message was deleted by admin Bob' });

      expect(parseChat(rawText).messages[0]?.kind).toBe('text');
    });

    it('does not count the caption of a photo, on the same line or the next, as typed words', () => {
      const rawText = exportText([
        `[31/12/2023, 22:00:00] Ana: happy birthday ${LEFT_TO_RIGHT_MARK}image omitted`,
        'and many more',
      ]);

      const [message] = parseChat(rawText).messages;

      expect(message?.kind).toBe('media');
      expect(message?.text).toBe('image omitted');
    });
  });

  describe('continuation lines that look like entries', () => {
    it('invents a sender from a typed line that starts like a timestamp', () => {
      const rawText = exportText([
        androidLine({ sender: 'Ana', text: 'agenda' }),
        '01/01/24 10:00 - breakfast with Bob: yes',
      ]);

      expect(sendersOf(parseChat(rawText).messages)).toEqual(['Ana', 'breakfast with Bob']);
    });
  });

  describe('pasted lines', () => {
    it('folds away a real participant whose only messages are dated before the one above', () => {
      const rawText = exportText([
        androidLine({ date: '1/13/24', time: '10:00', sender: 'Ana', text: 'hi' }),
        androidLine({ date: '1/13/24', time: '10:05', sender: 'Bob', text: 'hello' }),
        androidLine({ date: '1/13/24', time: '09:00', sender: 'Marta', text: 'late joiner' }),
      ]);

      const parsedChat = parseChat(rawText);

      expect(sendersOf(parsedChat.messages)).toEqual(['Ana', 'Bob']);
      expect(textsOf(parsedChat.messages)).toEqual(['hi', 'hello\nMarta: late joiner']);
      expect(parsedChat.report.foldedPastedLineCount).toBe(1);
    });

    it('loses the text of a line pasted after a media message, but still counts it as folded', () => {
      const rawText = exportText([
        androidLine({ date: '1/13/24', time: '10:00', sender: 'Ana', text: '<Media omitted>' }),
        androidLine({ date: '1/12/24', time: '09:00', sender: 'Zed', text: 'pasted' }),
        androidLine({ date: '1/13/24', time: '10:01', sender: 'Bob', text: 'wow' }),
      ]);

      const parsedChat = parseChat(rawText);

      expect(textsOf(parsedChat.messages)).toEqual(['<Media omitted>', 'wow']);
      expect(parsedChat.report.foldedPastedLineCount).toBe(1);
    });
  });

  describe('times that should be rejected', () => {
    it('rolls seconds above 59 over into the next minute', () => {
      const rawText = iphoneLine({ date: '31/12/2023', time: '22:00:75' });

      expect(parseChat(rawText).messages[0]?.timestamp).toEqual(localTime('2023-12-31 22:01:15'));
    });

    it('reads "13:00 AM" as one in the morning', () => {
      const rawText = androidLine({ date: '12/31/23', time: '13:00 AM' });

      expect(parseChat(rawText).messages[0]?.timestamp).toEqual(localTime('2023-12-31 01:00'));
    });
  });

  describe('year-first dates with a two-digit year', () => {
    it('reads 24/12/31 as the 24th of December 2031', () => {
      const parsedChat = parseChat(androidLine({ date: '24/12/31', time: '22:00' }));

      expect(parsedChat.dateOrder).toBe('dmy');
      expect(parsedChat.messages[0]?.timestamp).toEqual(localTime('2031-12-24 22:00'));
    });

    it('reads 45/12/31 as year first, in the year 1945 rather than 2045', () => {
      const parsedChat = parseChat(androidLine({ date: '45/12/31', time: '22:00' }));

      expect(parsedChat.dateOrder).toBe('ymd');
      expect(parsedChat.messages[0]?.timestamp).toEqual(localTime('1945-12-31 22:00'));
    });
  });

  describe('a forced date order that the file contradicts', () => {
    it('rejects every date instead of ignoring the forced order', () => {
      const parsedChat = parseChat(androidLine({ date: '31/12/23' }), 'mdy');

      expect(parsedChat.messages).toEqual([]);
      expect(parsedChat.dateOrder).toBe('mdy');
      expect(parsedChat.report.unreadableDateCount).toBe(1);
    });

    it('reports such a file as empty, without its parse report', () => {
      const result = analyseChatExport(androidLine({ date: '31/12/23' }), 'mdy');

      expect(result).toEqual({ kind: 'empty' });
    });
  });
});

describe('known limits of the word statistics', () => {
  it('splits a word at a curly apostrophe', () => {
    expect(extractWords(`don${RIGHT_SINGLE_QUOTATION_MARK}t`)).toEqual(['don', 't']);
  });

  it('keeps a word with a straight apostrophe whole, for contrast', () => {
    expect(extractWords("don't")).toEqual(["don't"]);
  });

  it('splits a word at an accent typed as a separate combining character', () => {
    expect(extractWords(`ma${COMBINING_ACUTE_ACCENT}s`)).toEqual(['ma', 's']);
  });
});
