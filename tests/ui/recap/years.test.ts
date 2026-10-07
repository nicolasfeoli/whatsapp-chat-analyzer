import { describe, expect, it } from 'vitest';

import {
  MINIMUM_MESSAGES_FOR_RECAP,
  chooseDefaultRecapYear,
  findYearSummary,
  selectRecapYears,
  summariseYears,
} from '../../../src/ui/recap/years';
import type { YearSummary } from '../../../src/ui/recap/years';
import { chatAnalysis } from '../../fixtures/analysis-builders';
import { localTime } from '../../fixtures/messages';

/**
 * A chat from 14 March 2023 to 20 June 2025: a short first year, a full and
 * busy 2024 and a quiet start of 2025.
 */
const chatOverThreeYears = chatAnalysis({
  firstMessageTimestamp: localTime('2023-03-14 10:00'),
  lastMessageTimestamp: localTime('2025-06-20 18:00'),
  messageCountsByDayKey: new Map([
    [20230314, 60],
    [20231231, 70],
    [20240101, 200],
    [20240615, 300],
    [20250620, 40],
  ]),
});

/** Builds the summary of a year with a number of messages, covered from January to December. */
function yearWith(year: number, messageCount: number): YearSummary {
  return {
    year,
    messageCount,
    period: { firstDayKey: year * 10000 + 101, lastDayKey: year * 10000 + 1231 },
    coveredDayCount: 365,
  };
}

describe('summariseYears', () => {
  it('adds up the messages of each calendar year, oldest first', () => {
    const summaries = summariseYears(chatOverThreeYears);

    expect(summaries.map((summary) => [summary.year, summary.messageCount])).toEqual([
      [2023, 130],
      [2024, 500],
      [2025, 40],
    ]);
  });

  it('cuts the first and the last year down to the days of the chat', () => {
    const summaries = summariseYears(chatOverThreeYears);

    expect(summaries.map((summary) => summary.period)).toEqual([
      { firstDayKey: 20230314, lastDayKey: 20231231 },
      { firstDayKey: 20240101, lastDayKey: 20241231 },
      { firstDayKey: 20250101, lastDayKey: 20250620 },
    ]);
  });

  it('counts the days each year is covered for, a leap year in full', () => {
    const summaries = summariseYears(chatOverThreeYears);

    /* 14 March to 31 December is 293 days; 2024 has 366; 1 January to 20 June 2025 is 171. */
    expect(summaries.map((summary) => summary.coveredDayCount)).toEqual([293, 366, 171]);
  });

  it('leaves out a year in which nobody wrote', () => {
    const chatWithGap = chatAnalysis({
      firstMessageTimestamp: localTime('2021-05-01 10:00'),
      lastMessageTimestamp: localTime('2023-05-01 10:00'),
      messageCountsByDayKey: new Map([
        [20210501, 3],
        [20230501, 4],
      ]),
    });

    expect(summariseYears(chatWithGap).map((summary) => summary.year)).toEqual([2021, 2023]);
  });
});

describe('selectRecapYears', () => {
  it('keeps a year with exactly the minimum and drops one a message short', () => {
    const years = [
      yearWith(2023, MINIMUM_MESSAGES_FOR_RECAP - 1),
      yearWith(2024, MINIMUM_MESSAGES_FOR_RECAP),
    ];

    expect(selectRecapYears(years).map((summary) => summary.year)).toEqual([2024]);
  });

  it('offers nothing for a chat in which no year has enough messages', () => {
    expect(selectRecapYears([yearWith(2024, 12)])).toEqual([]);
  });
});

describe('chooseDefaultRecapYear', () => {
  it('proposes the latest year that is over when it has enough messages', () => {
    const recapYears = selectRecapYears(summariseYears(chatOverThreeYears));

    expect(chooseDefaultRecapYear(recapYears, chatOverThreeYears.lastMessageTimestamp)).toBe(2024);
  });

  it('proposes the year the export ends in when no earlier year is offered', () => {
    const recapYears = [yearWith(2025, 400)];

    expect(chooseDefaultRecapYear(recapYears, localTime('2025-06-20 18:00'))).toBe(2025);
  });

  it('prefers a complete year to a busier year that is still running', () => {
    const recapYears = [yearWith(2024, 150), yearWith(2025, 900)];

    expect(chooseDefaultRecapYear(recapYears, localTime('2025-11-02 09:00'))).toBe(2024);
  });

  it('proposes nothing when no year is offered', () => {
    expect(chooseDefaultRecapYear([], localTime('2025-06-20 18:00'))).toBeNull();
  });
});

describe('findYearSummary', () => {
  it('finds a year of the chat', () => {
    expect(findYearSummary(summariseYears(chatOverThreeYears), 2024)?.messageCount).toBe(500);
  });

  it('returns null for a year without messages', () => {
    expect(findYearSummary(summariseYears(chatOverThreeYears), 2019)).toBeNull();
  });
});
