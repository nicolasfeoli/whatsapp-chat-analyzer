import { describe, expect, it } from 'vitest';

import { matchMessageLine } from '../../../src/core/parsing/line-pattern';
import type { MessageLineMatch } from '../../../src/core/parsing/line-pattern';
import { androidLine, androidNoticeLine, iphoneLine } from '../../fixtures/export-lines';
import {
  ARABIC_AFTER_NOON_MARKER,
  ARABIC_BEFORE_NOON_MARKER,
  ARABIC_COMMA,
  withArabicIndicDigits,
  withDevanagariDigits,
  withPersianDigits,
} from '../../fixtures/special-characters';

interface LayoutCase {
  readonly description: string;
  readonly line: string;
  readonly expected: MessageLineMatch;
}

/**
 * One row per export layout: the platform, the clock, the separators and the
 * phone language all change how the same kind of line is written.
 */
const LAYOUT_CASES: readonly LayoutCase[] = [
  {
    description: 'iPhone, United States: brackets, slashes, seconds and PM',
    line: '[8/31/26, 1:29:57 PM] Ana: Hola hola',
    expected: {
      firstDateNumber: 8,
      secondDateNumber: 31,
      thirdDateNumber: 26,
      hour: 1,
      minute: 29,
      second: 57,
      meridiem: 'pm',
      content: 'Ana: Hola hola',
    },
  },
  {
    description: 'iPhone, 24-hour clock with a four-digit year',
    line: '[31/12/2023, 22:00:15] Ana: hola',
    expected: {
      firstDateNumber: 31,
      secondDateNumber: 12,
      thirdDateNumber: 2023,
      hour: 22,
      minute: 0,
      second: 15,
      meridiem: null,
      content: 'Ana: hola',
    },
  },
  {
    description: 'iPhone, Germany: dots in the date',
    line: '[31.12.23, 22:00:15] Ana: hallo',
    expected: {
      firstDateNumber: 31,
      secondDateNumber: 12,
      thirdDateNumber: 23,
      hour: 22,
      minute: 0,
      second: 15,
      meridiem: null,
      content: 'Ana: hallo',
    },
  },
  {
    description: 'iPhone, Italy: dots in the time as well',
    line: '[31/12/23, 22.00.15] Ana: ciao',
    expected: {
      firstDateNumber: 31,
      secondDateNumber: 12,
      thirdDateNumber: 23,
      hour: 22,
      minute: 0,
      second: 15,
      meridiem: null,
      content: 'Ana: ciao',
    },
  },
  {
    description: 'iPhone, year first with dashes',
    line: '[2023-12-31, 22:00:15] Ana: hej',
    expected: {
      firstDateNumber: 2023,
      secondDateNumber: 12,
      thirdDateNumber: 31,
      hour: 22,
      minute: 0,
      second: 15,
      meridiem: null,
      content: 'Ana: hej',
    },
  },
  {
    description: 'Android, 24-hour clock without seconds',
    line: '31/12/23, 22:00 - Ana: hola',
    expected: {
      firstDateNumber: 31,
      secondDateNumber: 12,
      thirdDateNumber: 23,
      hour: 22,
      minute: 0,
      second: null,
      meridiem: null,
      content: 'Ana: hola',
    },
  },
  {
    description: 'Android, United States: 12-hour clock with AM',
    line: '1/1/24, 12:05 AM - Carl: hello',
    expected: {
      firstDateNumber: 1,
      secondDateNumber: 1,
      thirdDateNumber: 24,
      hour: 12,
      minute: 5,
      second: null,
      meridiem: 'am',
      content: 'Carl: hello',
    },
  },
  {
    description: 'Android, Spanish: "p. m." with dots and a space',
    line: '31/12/23, 10:00 p. m. - Ana: hola',
    expected: {
      firstDateNumber: 31,
      secondDateNumber: 12,
      thirdDateNumber: 23,
      hour: 10,
      minute: 0,
      second: null,
      meridiem: 'pm',
      content: 'Ana: hola',
    },
  },
  {
    description: 'Android, Brazil: no comma between the date and the time',
    line: '31/12/2023 22:00 - Ana: oi',
    expected: {
      firstDateNumber: 31,
      secondDateNumber: 12,
      thirdDateNumber: 2023,
      hour: 22,
      minute: 0,
      second: null,
      meridiem: null,
      content: 'Ana: oi',
    },
  },
  {
    description: 'Android, Germany: dots in the date',
    line: '31.12.23, 22:00 - Ana: hallo',
    expected: {
      firstDateNumber: 31,
      secondDateNumber: 12,
      thirdDateNumber: 23,
      hour: 22,
      minute: 0,
      second: null,
      meridiem: null,
      content: 'Ana: hallo',
    },
  },
  {
    description: 'Android, the Netherlands: dashes in the date',
    line: '31-12-2023 22:00 - Ana: hoi',
    expected: {
      firstDateNumber: 31,
      secondDateNumber: 12,
      thirdDateNumber: 2023,
      hour: 22,
      minute: 0,
      second: null,
      meridiem: null,
      content: 'Ana: hoi',
    },
  },
  {
    description: 'Android, year first with slashes',
    line: '2023/12/31, 22:00 - Ana: hej',
    expected: {
      firstDateNumber: 2023,
      secondDateNumber: 12,
      thirdDateNumber: 31,
      hour: 22,
      minute: 0,
      second: null,
      meridiem: null,
      content: 'Ana: hej',
    },
  },
];

describe('matchMessageLine', () => {
  describe('export layouts', () => {
    it.each(LAYOUT_CASES)('reads $description', ({ line, expected }) => {
      expect(matchMessageLine(line)).toEqual(expected);
    });
  });

  describe('number of digits in the date', () => {
    it('reads a year-first date whose month and day have a single digit each', () => {
      expect(matchMessageLine('2024/1/5, 22:00 - Ana: hi')).toMatchObject({
        firstDateNumber: 2024,
        secondDateNumber: 1,
        thirdDateNumber: 5,
      });
    });

    it('does not read a third number of five digits as a date', () => {
      expect(matchMessageLine('5/1/20245, 22:00 - Ana: hi')).toBeNull();
    });

    it('does not read a second number of three digits as a date', () => {
      expect(matchMessageLine('5/123/24, 22:00 - Ana: hi')).toBeNull();
    });
  });

  describe('12-hour markers', () => {
    it.each([
      { marker: 'AM', expected: 'am' },
      { marker: 'PM', expected: 'pm' },
      { marker: 'am', expected: 'am' },
      { marker: 'pm', expected: 'pm' },
      { marker: 'a.m.', expected: 'am' },
      { marker: 'p.m.', expected: 'pm' },
      { marker: 'a. m.', expected: 'am' },
      { marker: 'p. m.', expected: 'pm' },
      { marker: 'A. M.', expected: 'am' },
      { marker: ARABIC_BEFORE_NOON_MARKER, expected: 'am' },
      { marker: ARABIC_AFTER_NOON_MARKER, expected: 'pm' },
    ])('reads "$marker" on an Android line as $expected', ({ marker, expected }) => {
      const line = androidLine({ time: `10:00 ${marker}` });

      expect(matchMessageLine(line)?.meridiem).toBe(expected);
    });

    it.each([
      { marker: 'AM', expected: 'am' },
      { marker: 'PM', expected: 'pm' },
      { marker: 'p. m.', expected: 'pm' },
    ])('reads "$marker" on an iPhone line as $expected', ({ marker, expected }) => {
      const line = iphoneLine({ time: `10:00:00 ${marker}` });

      expect(matchMessageLine(line)?.meridiem).toBe(expected);
    });

    it('reads a marker written directly after the time, without a space', () => {
      const line = androidLine({ time: '10:00PM' });

      expect(matchMessageLine(line)?.meridiem).toBe('pm');
    });

    it('reports no marker on a 24-hour clock', () => {
      const line = androidLine({ time: '22:00' });

      expect(matchMessageLine(line)?.meridiem).toBeNull();
    });

    it('does not mistake a sender whose name starts with "Pm" for a marker', () => {
      const line = androidLine({ time: '22:00', sender: 'Pm Office', text: 'hello' });

      const match = matchMessageLine(line);

      expect(match?.meridiem).toBeNull();
      expect(match?.content).toBe('Pm Office: hello');
    });
  });

  describe('seconds', () => {
    it('reads the seconds of an iPhone timestamp', () => {
      const line = iphoneLine({ time: '22:00:15' });

      expect(matchMessageLine(line)?.second).toBe(15);
    });

    it('reports null, not zero, when the timestamp has no seconds', () => {
      const line = androidLine({ time: '22:00' });

      expect(matchMessageLine(line)?.second).toBeNull();
    });

    it('reads seconds written as 00 as zero rather than as missing', () => {
      const line = iphoneLine({ time: '22:00:00' });

      expect(matchMessageLine(line)?.second).toBe(0);
    });
  });

  describe('digits of other scripts', () => {
    it('reads an Arabic timestamp with Arabic-Indic digits, the Arabic comma and the afternoon marker', () => {
      const date = withArabicIndicDigits('31/12/2023');
      const time = withArabicIndicDigits('10:05');
      const line = `${date}${ARABIC_COMMA} ${time} ${ARABIC_AFTER_NOON_MARKER} - Ana: hi`;

      expect(matchMessageLine(line)).toEqual({
        firstDateNumber: 31,
        secondDateNumber: 12,
        thirdDateNumber: 2023,
        hour: 10,
        minute: 5,
        second: null,
        meridiem: 'pm',
        content: 'Ana: hi',
      });
    });

    it('reads a timestamp written in Persian digits', () => {
      const line = withPersianDigits('31/12/2023, 22:06 - ') + 'Bob: hi';

      expect(matchMessageLine(line)).toMatchObject({
        firstDateNumber: 31,
        secondDateNumber: 12,
        thirdDateNumber: 2023,
        hour: 22,
        minute: 6,
      });
    });

    it('reads a timestamp written in Devanagari digits', () => {
      const line = withDevanagariDigits('[31/12/2023, 22:06:09] ') + 'Marta: hi';

      expect(matchMessageLine(line)).toMatchObject({
        firstDateNumber: 31,
        secondDateNumber: 12,
        thirdDateNumber: 2023,
        hour: 22,
        minute: 6,
        second: 9,
      });
    });

    it('keeps the digits a sender typed in the message as they were typed', () => {
      const typedNumber = withArabicIndicDigits('123');
      const line = withArabicIndicDigits('31/12/2023, 22:06 - ') + `Ana: ${typedNumber}`;

      expect(matchMessageLine(line)?.content).toBe(`Ana: ${typedNumber}`);
    });
  });

  describe('content', () => {
    it('returns the text of a system notice, which has no sender, as the content', () => {
      const line = androidNoticeLine({ notice: 'Bob added Carl' });

      expect(matchMessageLine(line)?.content).toBe('Bob added Carl');
    });

    it('returns an empty content for a line that ends after the timestamp', () => {
      expect(matchMessageLine('[31/12/2023, 22:00:00]')?.content).toBe('');
    });

    it('keeps colons and dashes inside the message', () => {
      const line = androidLine({ sender: 'Ana', text: 'see you at 10:30 - or later: you choose' });

      expect(matchMessageLine(line)?.content).toBe('Ana: see you at 10:30 - or later: you choose');
    });

    it('does not include the spaces between the timestamp and the sender', () => {
      expect(matchMessageLine('[31/12/2023, 22:00:00]   Ana: hi')?.content).toBe('Ana: hi');
    });
  });

  describe('lines that are not the start of an entry', () => {
    it.each([
      { description: 'an empty line', line: '' },
      { description: 'the second line of a message', line: 'second line' },
      { description: 'text in brackets that is not a timestamp', line: '[not a date] Ana: hi' },
      { description: 'a date without a time', line: '31/12/23 - Ana: hi' },
      { description: 'a time without a date', line: '22:00 - Ana: hi' },
      { description: 'a date with only two numbers', line: '31/12, 22:00 - Ana: hi' },
      { description: 'a single-digit minute', line: '31/12/23, 22:5 - Ana: hi' },
      {
        description: 'an Android timestamp without the dash after it',
        line: '31/12/23, 22:00 Ana: hi',
      },
      {
        description: 'an iPhone timestamp without the closing bracket',
        line: '[31/12/2023, 22:00:00 Ana: hi',
      },
      {
        description: 'a timestamp in the middle of a line',
        line: 'he wrote 31/12/23, 22:00 - Ana: hi',
      },
      {
        description: 'a line indented with spaces before the timestamp',
        line: '  31/12/23, 22:00 - Ana: hi',
      },
      { description: 'a five-digit year', line: '31/12/20234, 22:00 - Ana: hi' },
    ])('returns null for $description', ({ line }) => {
      expect(matchMessageLine(line)).toBeNull();
    });
  });
});
