import { describe, expect, it } from 'vitest';

import { detectDateOrder } from '../../../src/core/parsing/date-order';
import type { UninterpretedDate } from '../../../src/core/parsing/date-order';

/** The size of the chat that used to overflow the call stack. */
const LARGE_CHAT_DATE_COUNT = 400_000;

/**
 * Writes the three numbers of a date in the order the export wrote them, so a
 * list of dates in a test reads like the left edge of an export.
 */
function dateWritten(
  firstDateNumber: number,
  secondDateNumber: number,
  thirdDateNumber: number,
): UninterpretedDate {
  return { firstDateNumber, secondDateNumber, thirdDateNumber };
}

describe('detectDateOrder', () => {
  describe('no dates', () => {
    it('returns null when there is nothing to read', () => {
      expect(detectDateOrder([], null, 'en-US')).toBeNull();
    });
  });

  describe('year-first exports', () => {
    it('reads a first number above 31 as a year', () => {
      const dates = [dateWritten(2023, 12, 31), dateWritten(2024, 1, 1)];

      expect(detectDateOrder(dates, null, null)).toEqual({ dateOrder: 'ymd', isAmbiguous: false });
    });

    it('ignores a forced order, because a year cannot be misread', () => {
      const dates = [dateWritten(2023, 12, 31)];

      expect(detectDateOrder(dates, 'mdy', 'en-US')).toEqual({
        dateOrder: 'ymd',
        isAmbiguous: false,
      });
    });

    it('reads a first number of 32, the smallest that cannot be a day, as a year', () => {
      const dates = [dateWritten(32, 1, 5)];

      expect(detectDateOrder(dates, null, null)).toEqual({ dateOrder: 'ymd', isAmbiguous: false });
    });

    it('lets only the first entry decide, so a stray year-first line later on changes nothing', () => {
      const dates = [dateWritten(5, 1, 24), dateWritten(6, 1, 24), dateWritten(2024, 1, 7)];

      /* Not year first; the 2024 in first position then merely settles "day first". */
      expect(detectDateOrder(dates, null, null)).toEqual({ dateOrder: 'dmy', isAmbiguous: false });
    });

    it('does not read a first number of exactly 31 as a year', () => {
      const dates = [dateWritten(31, 12, 23)];

      expect(detectDateOrder(dates, null, null)?.dateOrder).toBe('dmy');
    });
  });

  describe('forced order', () => {
    it.each(['dmy', 'mdy'] as const)(
      'uses the forced order %s for a file that could be read both ways',
      (forcedDateOrder) => {
        const dates = [dateWritten(1, 2, 24), dateWritten(1, 3, 24), dateWritten(1, 4, 24)];

        expect(detectDateOrder(dates, forcedDateOrder, 'en-US')?.dateOrder).toBe(forcedDateOrder);
      },
    );

    it('keeps the file marked as ambiguous, so the switch stays on the page', () => {
      const dates = [dateWritten(1, 2, 24)];

      expect(detectDateOrder(dates, 'dmy', 'en-US')?.isAmbiguous).toBe(true);
    });

    it('uses the forced order even when the numbers contradict it', () => {
      const dates = [dateWritten(31, 12, 23)];

      expect(detectDateOrder(dates, 'mdy', null)).toEqual({ dateOrder: 'mdy', isAmbiguous: true });
    });
  });

  describe('a number that cannot be a month', () => {
    it('reads day first when a first number is above 12', () => {
      const dates = [dateWritten(1, 2, 24), dateWritten(13, 2, 24)];

      expect(detectDateOrder(dates, null, 'en-US')).toEqual({
        dateOrder: 'dmy',
        isAmbiguous: false,
      });
    });

    it('reads month first when a second number is above 12', () => {
      const dates = [dateWritten(1, 2, 24), dateWritten(1, 13, 24)];

      expect(detectDateOrder(dates, null, 'es-CR')).toEqual({
        dateOrder: 'mdy',
        isAmbiguous: false,
      });
    });

    it('finds the telling number anywhere in the file, not only at its ends', () => {
      const dates = [dateWritten(1, 2, 24), dateWritten(1, 25, 24), dateWritten(2, 1, 24)];

      expect(detectDateOrder(dates, null, null)?.dateOrder).toBe('mdy');
    });

    it('does not take a number of exactly 12 as telling', () => {
      const dates = [dateWritten(12, 12, 24)];

      expect(detectDateOrder(dates, null, null)?.isAmbiguous).toBe(true);
    });

    it('prefers day first when both positions hold a number above 12', () => {
      const dates = [dateWritten(13, 1, 24), dateWritten(1, 13, 24)];

      expect(detectDateOrder(dates, null, 'en-US')?.dateOrder).toBe('dmy');
    });
  });

  describe('both readings possible: the one in which time runs forward wins', () => {
    it('reads month first when reading day first would step back in time', () => {
      /* 9 January, 10 January, 1 February; read day first: 1 September, 1 October, 2 January. */
      const dates = [dateWritten(1, 9, 24), dateWritten(1, 10, 24), dateWritten(2, 1, 24)];

      expect(detectDateOrder(dates, null, 'es-CR')).toEqual({
        dateOrder: 'mdy',
        isAmbiguous: true,
      });
    });

    it('reads day first when reading month first would step back in time', () => {
      /* 9 January, 10 January, 1 February; read month first: 1 September, 1 October, 2 January. */
      const dates = [dateWritten(9, 1, 24), dateWritten(10, 1, 24), dateWritten(1, 2, 24)];

      expect(detectDateOrder(dates, null, 'en-US')).toEqual({
        dateOrder: 'dmy',
        isAmbiguous: true,
      });
    });

    it('prefers the reading with fewer steps back when neither is perfectly in order', () => {
      /* Month first has one step back (the third date); day first has three. */
      const dates = [
        dateWritten(1, 9, 24),
        dateWritten(1, 10, 24),
        dateWritten(1, 8, 24),
        dateWritten(2, 1, 24),
        dateWritten(2, 2, 24),
        dateWritten(3, 1, 24),
      ];

      expect(detectDateOrder(dates, null, 'es-CR')?.dateOrder).toBe('mdy');
    });

    it('takes the year into account, so December followed by January is not a step back', () => {
      /*
       * 1 December 2023 then 2 January 2024. Without the year, month first would
       * look like a step back and lose; with it, neither reading steps back and
       * month first wins on the shorter span.
       */
      const dates = [dateWritten(12, 1, 23), dateWritten(1, 2, 24)];

      expect(detectDateOrder(dates, null, 'es-CR')?.dateOrder).toBe('mdy');
    });
  });

  describe('both readings in order: the shorter overall span wins', () => {
    it('reads month first when that makes the chat three days long rather than three months', () => {
      const dates = [dateWritten(1, 2, 24), dateWritten(1, 3, 24), dateWritten(1, 4, 24)];

      expect(detectDateOrder(dates, null, 'es-CR')).toEqual({
        dateOrder: 'mdy',
        isAmbiguous: true,
      });
    });

    it('reads day first when that makes the chat three days long rather than three months', () => {
      const dates = [dateWritten(1, 2, 24), dateWritten(2, 2, 24), dateWritten(3, 2, 24)];

      expect(detectDateOrder(dates, null, 'en-US')).toEqual({
        dateOrder: 'dmy',
        isAmbiguous: true,
      });
    });
  });

  describe('both readings equally plausible: the region of the browser decides', () => {
    const singleDay = [dateWritten(1, 2, 24), dateWritten(1, 2, 24)];

    it.each([
      { locale: 'en-US', expected: 'mdy' },
      { locale: 'es-US', expected: 'mdy' },
      { locale: 'en-us', expected: 'mdy' },
      { locale: 'es-CR', expected: 'dmy' },
      { locale: 'en-GB', expected: 'dmy' },
      { locale: 'en', expected: 'dmy' },
      { locale: 'en-US-posix', expected: 'dmy' },
      { locale: '', expected: 'dmy' },
      { locale: null, expected: 'dmy' },
    ])('reads $expected for the locale $locale', ({ locale, expected }) => {
      expect(detectDateOrder(singleDay, null, locale)).toEqual({
        dateOrder: expected,
        isAmbiguous: true,
      });
    });

    it('falls back to the region for a chat of a single message', () => {
      const dates = [dateWritten(3, 4, 24)];

      expect(detectDateOrder(dates, null, 'en-US')?.dateOrder).toBe('mdy');
    });

    it('falls back to the region when both readings span the same time', () => {
      /* 1 January to 2 February either way. */
      const dates = [dateWritten(1, 1, 24), dateWritten(2, 2, 24)];

      expect(detectDateOrder(dates, null, 'en-US')?.dateOrder).toBe('mdy');
    });
  });

  describe('large chats', () => {
    it('reads four hundred thousand dates without overflowing the call stack', () => {
      const dates = new Array<UninterpretedDate>(LARGE_CHAT_DATE_COUNT).fill(dateWritten(1, 2, 24));

      expect(detectDateOrder(dates, null, 'en-US')?.dateOrder).toBe('mdy');
    });
  });
});
