import { describe, expect, it } from 'vitest';

import { readExportEntries } from '../../../src/core/parsing/export-entries';
import {
  androidLine,
  androidNoticeLine,
  exportText,
  iphoneLine,
  iphoneNotTypedLine,
  iphoneNoticeLine,
} from '../../fixtures/export-lines';
import {
  BYTE_ORDER_MARK,
  INVENTED_PHONE_NUMBER_GROUPS,
  INVENTED_PHONE_NUMBER_SENDER,
  LEFT_TO_RIGHT_EMBEDDING,
  LEFT_TO_RIGHT_MARK,
  NARROW_NO_BREAK_SPACE,
  NO_BREAK_SPACE,
  POP_DIRECTIONAL_FORMATTING,
} from '../../fixtures/special-characters';

describe('readExportEntries', () => {
  describe('entries', () => {
    it('reads an Android line into an entry with uninterpreted date numbers', () => {
      const rawText = androidLine({
        date: '3/4/24',
        time: '9:05 PM',
        sender: 'Ana',
        text: 'happy new year',
      });

      const { entries } = readExportEntries(rawText);

      expect(entries).toEqual([
        {
          firstDateNumber: 3,
          secondDateNumber: 4,
          thirdDateNumber: 24,
          hour: 9,
          minute: 5,
          second: 0,
          meridiem: 'pm',
          sender: 'Ana',
          text: 'happy new year',
          kind: 'text',
        },
      ]);
    });

    it('reads the seconds of an iPhone line', () => {
      const rawText = iphoneLine({ time: '22:00:15' });

      const { entries } = readExportEntries(rawText);

      expect(entries[0]?.second).toBe(15);
    });

    it('keeps the entries in the order of the file', () => {
      const rawText = exportText([
        androidLine({ time: '22:05', sender: 'Bob' }),
        androidLine({ time: '22:00', sender: 'Ana' }),
        androidLine({ time: '22:03', sender: 'Marta' }),
      ]);

      const { entries } = readExportEntries(rawText);

      expect(entries.map((entry) => entry.sender)).toEqual(['Bob', 'Ana', 'Marta']);
    });

    it('reads a sender whose phone number is wrapped in directional formatting', () => {
      const numberWithNoBreakSpaces = INVENTED_PHONE_NUMBER_GROUPS.join(NO_BREAK_SPACE);
      const wrappedNumber = `${LEFT_TO_RIGHT_EMBEDDING}${numberWithNoBreakSpaces}${POP_DIRECTIONAL_FORMATTING}`;
      const rawText = iphoneLine({ sender: wrappedNumber, text: 'hello' });

      const { entries } = readExportEntries(rawText);

      expect(entries[0]?.sender).toBe(INVENTED_PHONE_NUMBER_SENDER);
    });

    it('reads a timestamp with a narrow no-break space before PM', () => {
      const rawText = iphoneLine({ date: '8/31/26', time: `1:29:57${NARROW_NO_BREAK_SPACE}PM` });

      const { entries } = readExportEntries(rawText);

      expect(entries[0]).toMatchObject({ hour: 1, minute: 29, second: 57, meridiem: 'pm' });
    });

    it('reads the first line of a file that starts with a byte-order mark', () => {
      const rawText = `${BYTE_ORDER_MARK}${iphoneLine({ sender: 'Ana' })}`;

      const { entries, platform } = readExportEntries(rawText);

      expect(entries).toHaveLength(1);
      expect(platform).toBe('iPhone');
    });

    it('returns no entries for an empty text', () => {
      expect(readExportEntries('').entries).toEqual([]);
    });

    it('returns no entries for text that is not a chat export', () => {
      const rawText = exportText(['Shopping list', 'milk', 'eggs']);

      expect(readExportEntries(rawText).entries).toEqual([]);
    });
  });

  describe('line breaks', () => {
    it('splits lines at Unix line breaks', () => {
      const rawText = [androidLine({ sender: 'Ana' }), androidLine({ sender: 'Bob' })].join('\n');

      expect(readExportEntries(rawText).entries).toHaveLength(2);
    });

    it('splits lines at Windows line breaks without leaving a carriage return in the text', () => {
      const rawText = [
        androidLine({ sender: 'Ana', text: 'first' }),
        androidLine({ sender: 'Bob', text: 'second' }),
      ].join('\r\n');

      const { entries } = readExportEntries(rawText);

      expect(entries.map((entry) => entry.text)).toEqual(['first', 'second']);
    });
  });

  describe('multi-line messages', () => {
    it('appends a line without a timestamp to the message before it', () => {
      const rawText = exportText([androidLine({ text: 'same to you' }), 'second line']);

      const { entries } = readExportEntries(rawText);

      expect(entries[0]?.text).toBe('same to you\nsecond line');
    });

    it('appends every continuation line, keeping empty lines in between', () => {
      const rawText = exportText([androidLine({ text: 'list:' }), '- milk', '', '- eggs']);

      const { entries } = readExportEntries(rawText);

      expect(entries[0]?.text).toBe('list:\n- milk\n\n- eggs');
    });

    it('removes invisible characters from a continuation line', () => {
      const rawText = exportText([
        iphoneLine({ text: 'first line' }),
        `${LEFT_TO_RIGHT_MARK}second line`,
      ]);

      const { entries } = readExportEntries(rawText);

      expect(entries[0]?.text).toBe('first line\nsecond line');
    });

    it('attaches a continuation line only to the message directly before it', () => {
      const rawText = exportText([
        androidLine({ sender: 'Ana', text: 'first' }),
        androidLine({ sender: 'Bob', text: 'second' }),
        'continued',
      ]);

      const { entries } = readExportEntries(rawText);

      expect(entries.map((entry) => entry.text)).toEqual(['first', 'second\ncontinued']);
    });

    it('does not count the caption after an attachment as text of the media message', () => {
      const rawText = exportText([
        androidLine({ text: 'IMG-20231231-WA0001.jpg (file attached)' }),
        'what a view',
      ]);

      const { entries } = readExportEntries(rawText);

      expect(entries[0]?.text).toBe('IMG-20231231-WA0001.jpg (file attached)');
    });

    it('does not attach the options of a poll to the poll', () => {
      const rawText = exportText([
        iphoneNotTypedLine({ text: 'POLL:' }),
        'Where do we eat?',
        `${LEFT_TO_RIGHT_MARK}OPTION: pizza (2 votes)`,
      ]);

      const { entries } = readExportEntries(rawText);

      expect(entries).toHaveLength(1);
      expect(entries[0]?.text).toBe('POLL:');
    });

    it('does not attach the lines after a system notice to the message before the notice', () => {
      const rawText = exportText([
        androidLine({ text: 'hello' }),
        androidNoticeLine({ notice: 'Bob changed the group description' }),
        'second line of the description',
      ]);

      const { entries } = readExportEntries(rawText);

      expect(entries[0]?.text).toBe('hello');
    });

    it('ignores lines before the first entry', () => {
      const rawText = exportText(['Exported chat', androidLine({ text: 'hello' })]);

      const { entries } = readExportEntries(rawText);

      expect(entries.map((entry) => entry.text)).toEqual(['hello']);
    });
  });

  describe('message kinds', () => {
    it('marks an Android media placeholder as media', () => {
      const rawText = androidLine({ text: '<Media omitted>' });

      expect(readExportEntries(rawText).entries[0]?.kind).toBe('media');
    });

    it("marks an iPhone 'image omitted' line carrying the left-to-right mark as media", () => {
      const rawText = iphoneNotTypedLine({ text: 'image omitted' });

      expect(readExportEntries(rawText).entries[0]?.kind).toBe('media');
    });

    describe('a photo sent with a caption, which iPhone writes on one line', () => {
      const captionedLine = iphoneLine({
        sender: 'Bob',
        text: `happy birthday Ana ${LEFT_TO_RIGHT_MARK}image omitted`,
      });

      it('is marked as media although the mark does not stand in front of the body', () => {
        expect(readExportEntries(captionedLine).entries[0]?.kind).toBe('media');
      });

      it('keeps the placeholder as the text and leaves the caption out', () => {
        expect(readExportEntries(captionedLine).entries[0]?.text).toBe('image omitted');
      });

      it('keeps the sender', () => {
        expect(readExportEntries(captionedLine).entries[0]?.sender).toBe('Bob');
      });

      it('is recognised when the line itself also starts with the mark', () => {
        const rawText = `${LEFT_TO_RIGHT_MARK}${captionedLine}`;

        expect(readExportEntries(rawText).entries[0]?.kind).toBe('media');
      });

      it('is recognised in a caption that mentions somebody between isolate marks', () => {
        const rawText = iphoneLine({
          text: `look @\u2068Carla\u2069 ${LEFT_TO_RIGHT_MARK}video omitted`,
        });

        expect(readExportEntries(rawText).entries[0]).toMatchObject({
          kind: 'media',
          text: 'video omitted',
        });
      });

      it('is recognised when the caption was edited afterwards', () => {
        const rawText = iphoneLine({
          text: `happy birthday ${LEFT_TO_RIGHT_MARK}image omitted ${LEFT_TO_RIGHT_MARK}<This message was edited>`,
        });

        expect(readExportEntries(rawText).entries[0]).toMatchObject({
          kind: 'media',
          text: 'image omitted',
        });
      });

      it('does not let the lines after it be counted either', () => {
        const rawText = exportText([captionedLine, 'and many more']);

        expect(readExportEntries(rawText).entries[0]?.text).toBe('image omitted');
      });

      describe('with a caption of several lines, which ends in the placeholder', () => {
        const rawText = exportText([
          iphoneLine({ sender: 'Bob', text: 'happy birthday Ana' }),
          'hope you have a great day',
          `and many more ${LEFT_TO_RIGHT_MARK}image omitted`,
          iphoneLine({ sender: 'Ana', text: 'thank you' }),
        ]);

        it('turns the entry the caption started into media', () => {
          expect(readExportEntries(rawText).entries[0]).toMatchObject({
            sender: 'Bob',
            kind: 'media',
            text: 'image omitted',
          });
        });

        it('leaves the message after it alone', () => {
          expect(readExportEntries(rawText).entries[1]).toMatchObject({
            sender: 'Ana',
            kind: 'text',
            text: 'thank you',
          });
        });

        it('still counts every line of the caption as a non-empty line of the file', () => {
          expect(readExportEntries(rawText).nonEmptyLineCount).toBe(4);
        });

        it('accepts a last line that is only the placeholder', () => {
          const captionThenPlaceholder = exportText([
            iphoneLine({ sender: 'Bob', text: 'happy birthday Ana' }),
            `${LEFT_TO_RIGHT_MARK}image omitted`,
          ]);

          expect(readExportEntries(captionThenPlaceholder).entries[0]?.kind).toBe('media');
        });

        it('keeps a typed last line that merely ends in the words as text', () => {
          const typedLines = exportText([
            iphoneLine({ sender: 'Bob', text: 'the report says' }),
            'image omitted',
          ]);

          expect(readExportEntries(typedLines).entries[0]).toMatchObject({
            kind: 'text',
            text: 'the report says\nimage omitted',
          });
        });

        it('does not look for the mark in the continuation lines of an Android export', () => {
          const androidLines = exportText([
            androidLine({ sender: 'Bob', text: 'happy birthday Ana' }),
            `and many more ${LEFT_TO_RIGHT_MARK}image omitted`,
          ]);

          expect(readExportEntries(androidLines).entries[0]?.kind).toBe('text');
        });
      });

      it('is still typed text when no mark separates the words from "image omitted"', () => {
        const rawText = iphoneLine({ text: 'happy birthday image omitted' });

        expect(readExportEntries(rawText).entries[0]?.kind).toBe('text');
      });

      it('is still typed text when the mark is followed by something else', () => {
        const rawText = iphoneLine({
          text: `the part ${LEFT_TO_RIGHT_MARK}that was omitted today`,
        });

        expect(readExportEntries(rawText).entries[0]?.kind).toBe('text');
      });

      it('is not looked for on an Android line, which never carries the mark', () => {
        const rawText = androidLine({ text: `happy birthday ${LEFT_TO_RIGHT_MARK}image omitted` });

        expect(readExportEntries(rawText).entries[0]?.kind).toBe('text');
      });
    });

    it("marks an iPhone 'image omitted' line without the mark as text", () => {
      const rawText = iphoneLine({ text: 'image omitted' });

      expect(readExportEntries(rawText).entries[0]?.kind).toBe('text');
    });

    it('marks an iPhone placeholder as media when the line itself also starts with the mark', () => {
      const rawText = `${LEFT_TO_RIGHT_MARK}${iphoneNotTypedLine({ sender: 'Bob', text: 'sticker omitted' })}`;

      expect(readExportEntries(rawText).entries[0]?.kind).toBe('media');
    });

    it('does not take a mark at the very start of the line for a mark on the body', () => {
      const rawText = `${LEFT_TO_RIGHT_MARK}${iphoneLine({ sender: 'Bob', text: 'sticker omitted' })}`;

      expect(readExportEntries(rawText).entries[0]?.kind).toBe('text');
    });

    it('does not take the mark inside an edited-message note for a mark on the body', () => {
      const rawText = iphoneLine({
        text: `fixed it ${LEFT_TO_RIGHT_MARK}<This message was edited>`,
      });

      const { entries } = readExportEntries(rawText);

      expect(entries[0]?.kind).toBe('text');
    });

    it('finds the mark on the body of a sender whose number is wrapped in directional formatting', () => {
      const numberWithNoBreakSpaces = INVENTED_PHONE_NUMBER_GROUPS.join(NO_BREAK_SPACE);
      const wrappedNumber = `${LEFT_TO_RIGHT_EMBEDDING}${numberWithNoBreakSpaces}${POP_DIRECTIONAL_FORMATTING}`;
      const rawText = iphoneNotTypedLine({ sender: wrappedNumber, text: 'audio omitted' });

      expect(readExportEntries(rawText).entries[0]?.kind).toBe('media');
    });

    it('marks a deleted-message tombstone as deleted', () => {
      const rawText = iphoneNotTypedLine({ text: 'This message was deleted.' });

      expect(readExportEntries(rawText).entries[0]?.kind).toBe('deleted');
    });

    it('marks the word "null" as media on an Android line', () => {
      const rawText = androidLine({ text: 'null' });

      expect(readExportEntries(rawText).entries[0]?.kind).toBe('media');
    });

    it('marks the word "null" as text on an iPhone line', () => {
      const rawText = iphoneLine({ text: 'null' });

      expect(readExportEntries(rawText).entries[0]?.kind).toBe('text');
    });
  });

  describe('system notices', () => {
    it.each([
      {
        description: 'an Android notice without a sender',
        line: androidNoticeLine({ notice: 'Bob added Carl' }),
      },
      {
        description: 'an iPhone notice without a sender',
        line: iphoneNoticeLine({ notice: 'Ana created this group' }),
      },
      {
        description: 'a group rename whose new name contains a colon',
        line: androidNoticeLine({ notice: 'Bob changed the group name to "Party: 2024"' }),
      },
      {
        description: 'an iPhone notice attributed to a sender with the left-to-right mark',
        line: iphoneNotTypedLine({ sender: 'Ana', text: 'Ana is a contact.' }),
      },
      {
        description: 'the encryption banner attributed to a sender',
        line: iphoneNotTypedLine({
          sender: 'Ana',
          text: 'Messages and calls are end-to-end encrypted. Only people in this chat can read them.',
        }),
      },
      {
        description: 'a missed call attributed to a sender on Android',
        line: androidLine({ sender: 'Ana', text: 'Missed voice call' }),
      },
      {
        description: 'a notice whose text before the first colon is longer than a name can be',
        line: androidNoticeLine({
          notice:
            'Messages to this group are now secured with end-to-end encryption: tap for more info',
        }),
      },
    ])('drops $description and counts it', ({ line }) => {
      const reading = readExportEntries(line);

      expect(reading.entries).toEqual([]);
      expect(reading.entryCount).toBe(1);
      expect(reading.systemNoticeCount).toBe(1);
    });

    it.each(['Left Shark', 'Juan Added'])(
      'keeps a message from a contact called "%s"',
      (sender) => {
        const rawText = iphoneLine({ sender, text: 'hi' });

        const { entries, systemNoticeCount } = readExportEntries(rawText);

        expect(entries.map((entry) => entry.sender)).toEqual([sender]);
        expect(systemNoticeCount).toBe(0);
      },
    );
  });

  describe('counts for the parse report', () => {
    it('counts the lines that contain something other than white space', () => {
      const rawText = exportText([
        androidLine({ text: 'hi' }),
        'more',
        '',
        '   ',
        androidLine({ text: 'bye' }),
      ]);

      expect(readExportEntries(rawText).nonEmptyLineCount).toBe(3);
    });

    it('does not count a line made only of invisible characters', () => {
      const rawText = exportText([androidLine({ text: 'hi' }), LEFT_TO_RIGHT_MARK]);

      expect(readExportEntries(rawText).nonEmptyLineCount).toBe(1);
    });

    it('counts lines that are not part of any entry as non-empty lines', () => {
      const rawText = exportText(['Shopping list', 'milk']);

      const reading = readExportEntries(rawText);

      expect(reading.nonEmptyLineCount).toBe(2);
      expect(reading.entryCount).toBe(0);
    });

    it('counts messages and system notices together as entries, but not continuation lines', () => {
      const rawText = exportText([
        androidNoticeLine({ notice: 'Messages and calls are end-to-end encrypted.' }),
        androidLine({ text: 'hi' }),
        'more',
        androidLine({ text: 'bye' }),
      ]);

      const reading = readExportEntries(rawText);

      expect(reading.entryCount).toBe(3);
      expect(reading.systemNoticeCount).toBe(1);
      expect(reading.entries).toHaveLength(2);
    });
  });

  describe('platform', () => {
    it('reports iPhone when the first entry is bracketed', () => {
      expect(readExportEntries(iphoneLine()).platform).toBe('iPhone');
    });

    it('reports Android when the first entry is not bracketed', () => {
      expect(readExportEntries(androidLine()).platform).toBe('Android');
    });

    it('judges the platform from the first entry even when that entry is a system notice', () => {
      const rawText = exportText([
        iphoneNoticeLine({ notice: 'Ana created this group' }),
        androidLine({ text: 'pasted from another phone' }),
      ]);

      expect(readExportEntries(rawText).platform).toBe('iPhone');
    });

    it('reports null when the text has no entry at all', () => {
      expect(readExportEntries('not a chat').platform).toBeNull();
    });
  });

  describe('seconds in timestamps', () => {
    it('reports seconds when a kept message has them', () => {
      expect(readExportEntries(iphoneLine({ time: '22:00:15' })).hasSecondsInTimestamps).toBe(true);
    });

    it('reports seconds when they are written as 00', () => {
      expect(readExportEntries(iphoneLine({ time: '22:00:00' })).hasSecondsInTimestamps).toBe(true);
    });

    it('reports no seconds for an export that only records minutes', () => {
      expect(readExportEntries(androidLine({ time: '22:00' })).hasSecondsInTimestamps).toBe(false);
    });

    it('reports no seconds when the only timestamp with seconds belongs to a system notice', () => {
      const rawText = exportText([
        iphoneNoticeLine({ time: '21:59:30', notice: 'Ana created this group' }),
        androidLine({ time: '22:00' }),
      ]);

      expect(readExportEntries(rawText).hasSecondsInTimestamps).toBe(false);
    });

    it('reports no seconds for an empty text', () => {
      expect(readExportEntries('').hasSecondsInTimestamps).toBe(false);
    });
  });
});
