import { describe, expect, it } from 'vitest';

import {
  describeAmbiguousDateOrder,
  describeDateOrder,
  summariseParseReport,
} from '../../src/ui/parse-report';
import {
  analysedResult,
  chatAnalysis,
  parseReport,
  personStatistics,
} from '../fixtures/analysis-builders';
import { groupEvent, namedMember } from '../fixtures/group-events';
import type { AnalysedChatExportResult } from '../../src/core/types';

/**
 * Builds the analysis of a chat in which Ana sent the given number of messages.
 */
function analysisWithMessageCount(messageCount: number) {
  return chatAnalysis({ people: [personStatistics({ name: 'Ana', messageCount })] });
}

describe('describeDateOrder', () => {
  it.each([
    { dateOrder: 'dmy' as const, expected: 'day/month/year' },
    { dateOrder: 'mdy' as const, expected: 'month/day/year' },
    { dateOrder: 'ymd' as const, expected: 'year/month/day' },
  ])('names $dateOrder as $expected', ({ dateOrder, expected }) => {
    expect(describeDateOrder(dateOrder)).toBe(expected);
  });
});

describe('summariseParseReport', () => {
  describe('a file in which nothing was skipped', () => {
    it('says how many messages were read from how many lines of which export', () => {
      const result = analysedResult({
        analysis: analysisWithMessageCount(1204),
        dateOrder: 'dmy',
        report: parseReport({ nonEmptyLineCount: 1310, entryCount: 1204, platform: 'iPhone' }),
      });

      expect(summariseParseReport(result)).toEqual({
        text: 'Read 1,204 messages from 1,310 lines of an iPhone export, dates as day/month/year.',
        isWarning: false,
      });
    });

    it('uses the singular for one message on one line', () => {
      const result = analysedResult({
        analysis: analysisWithMessageCount(1),
        report: parseReport({ nonEmptyLineCount: 1, entryCount: 1 }),
      });

      expect(summariseParseReport(result).text).toBe(
        'Read 1 message from 1 line of an iPhone export, dates as day/month/year.',
      );
    });

    it('names an Android export', () => {
      const result = analysedResult({ report: parseReport({ platform: 'Android' }) });

      expect(summariseParseReport(result).text).toContain('of an Android export');
    });

    it('falls back to "a WhatsApp export" when the platform is unknown', () => {
      const result = analysedResult({ report: parseReport({ platform: null }) });

      expect(summariseParseReport(result).text).toContain('of a WhatsApp export');
    });

    it.each([
      { dateOrder: 'mdy' as const, expected: 'dates as month/day/year.' },
      { dateOrder: 'ymd' as const, expected: 'dates as year/month/day.' },
    ])('names the date order $dateOrder', ({ dateOrder, expected }) => {
      expect(summariseParseReport(analysedResult({ dateOrder })).text).toContain(expected);
    });
  });

  describe('system notices', () => {
    it('says how many were skipped', () => {
      const result = analysedResult({ report: parseReport({ systemNoticeCount: 12 }) });

      expect(summariseParseReport(result).text).toMatch(/ Skipped 12 system notices\.$/);
    });

    it('uses the singular for one notice', () => {
      const result = analysedResult({ report: parseReport({ systemNoticeCount: 1 }) });

      expect(summariseParseReport(result).text).toMatch(/ Skipped 1 system notice\.$/);
    });

    it('does not make the report a warning', () => {
      const result = analysedResult({ report: parseReport({ systemNoticeCount: 12 }) });

      expect(summariseParseReport(result).isWarning).toBe(false);
    });
  });

  describe('pasted lines', () => {
    it('says how many were kept inside the message quoting them', () => {
      const result = analysedResult({ report: parseReport({ foldedPastedLineCount: 3 }) });

      expect(summariseParseReport(result).text).toMatch(
        / 3 pasted lines were kept as part of the message quoting them\.$/,
      );
    });

    it('uses the singular for one pasted line', () => {
      const result = analysedResult({ report: parseReport({ foldedPastedLineCount: 1 }) });

      expect(summariseParseReport(result).text).toMatch(
        / 1 pasted line was kept as part of the message quoting them\.$/,
      );
    });
  });

  describe('dates that could not be read', () => {
    it('mentions a few unreadable dates and marks the report as a warning', () => {
      const result = analysedResult({
        report: parseReport({ entryCount: 1000, unreadableDateCount: 3 }),
      });

      const summary = summariseParseReport(result);

      expect(summary.text).toMatch(/ 3 entries have a date that could not be read\.$/);
      expect(summary.isWarning).toBe(true);
    });

    it('uses the singular for one unreadable date', () => {
      const result = analysedResult({
        report: parseReport({ entryCount: 1000, unreadableDateCount: 1 }),
      });

      expect(summariseParseReport(result).text).toMatch(
        / 1 entry has a date that could not be read\.$/,
      );
    });

    it('says the numbers are incomplete when more than 2% of the entries are affected', () => {
      const result = analysedResult({
        report: parseReport({ entryCount: 1000, unreadableDateCount: 21 }),
      });

      expect(summariseParseReport(result).text).toMatch(
        / 21 entries have a date that could not be read, so the numbers below are incomplete\.$/,
      );
    });

    it('does not say so at exactly 2%', () => {
      const result = analysedResult({
        report: parseReport({ entryCount: 1000, unreadableDateCount: 20 }),
      });

      expect(summariseParseReport(result).text).not.toContain('incomplete');
    });
  });

  it('writes every part, in order, when everything applies at once', () => {
    const result = analysedResult({
      analysis: analysisWithMessageCount(90),
      dateOrder: 'mdy',
      report: parseReport({
        nonEmptyLineCount: 120,
        entryCount: 100,
        systemNoticeCount: 4,
        foldedPastedLineCount: 2,
        unreadableDateCount: 4,
        platform: 'Android',
      }),
    });

    expect(summariseParseReport(result)).toEqual({
      text:
        'Read 90 messages from 120 lines of an Android export, dates as month/day/year.' +
        ' Skipped 4 system notices.' +
        ' 2 pasted lines were kept as part of the message quoting them.' +
        ' 4 entries have a date that could not be read, so the numbers below are incomplete.',
      isWarning: true,
    });
  });
});

describe('describeAmbiguousDateOrder', () => {
  it('says which reading is in use and leads into the switch button', () => {
    expect(describeAmbiguousDateOrder('dmy')).toBe(
      'Dates in this file could be read two ways. Reading them as day/month/year. If the timeline looks wrong:',
    );
  });

  it('names the other reading after a switch', () => {
    expect(describeAmbiguousDateOrder('mdy')).toContain('Reading them as month/day/year.');
  });
});

describe('summariseParseReport, notices kept as group history', () => {
  /**
   * Builds the result of an export with so many system notices, of which so
   * many were kept as events.
   */
  function resultWithNotices(
    systemNoticeCount: number,
    keptCount: number,
  ): AnalysedChatExportResult {
    const groupEvents = Array.from({ length: keptCount }, () =>
      groupEvent('2024-01-13 10:00', { kind: 'left', member: namedMember('Bob') }),
    );
    return analysedResult({
      analysis: chatAnalysis({ groupEvents }),
      report: parseReport({ systemNoticeCount }),
    });
  }

  it('says how many notices were kept and how many skipped, which add up to all of them', () => {
    /* 12 notices, 5 of them events: 7 skipped. */
    expect(summariseParseReport(resultWithNotices(12, 5)).text).toMatch(
      / Kept 5 system notices as group history\. Skipped 7 system notices\.$/,
    );
  });

  it('uses the singular for one notice kept and one skipped', () => {
    expect(summariseParseReport(resultWithNotices(2, 1)).text).toMatch(
      / Kept 1 system notice as group history\. Skipped 1 system notice\.$/,
    );
  });

  it('says nothing about skipping when every notice was kept', () => {
    const { text } = summariseParseReport(resultWithNotices(3, 3));

    expect(text).toMatch(/ Kept 3 system notices as group history\.$/);
    expect(text).not.toContain('Skipped');
  });

  it('does not make the report a warning', () => {
    expect(summariseParseReport(resultWithNotices(3, 3)).isWarning).toBe(false);
  });
});
