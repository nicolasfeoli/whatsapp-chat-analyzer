// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  CALENDAR_YEAR_LIMIT,
  attachCalendarTooltips,
  buildCalendarYear,
  buildChatCalendar,
  calendarTintPercentOf,
  describeCalendarYear,
  findCalendarDayAt,
  renderCalendar,
  renderCalendarTooltip,
} from '../../../src/ui/charts/calendar';
import type { CalendarDay, CalendarYear } from '../../../src/ui/charts/calendar';
import type { ChatAnalysis } from '../../../src/core/types';
import type { Tooltip } from '../../../src/ui/tooltip';
import { chatAnalysis } from '../../fixtures/analysis-builders';
import { findElement, parseMarkup, textsOfElements } from '../../fixtures/markup';
import { localTime } from '../../fixtures/messages';

/** Positions of weekdays in a week that starts on Monday. */
const MONDAY = 0;
const SATURDAY = 5;
const SUNDAY = 6;

/** The first day of 2024, as a day key. */
const FIRST_DAY_OF_2024 = 20240101;

/**
 * Builds a tooltip that only records how it was used.
 */
function createRecordingTooltip() {
  return { show: vi.fn<Tooltip['show']>(), hide: vi.fn<Tooltip['hide']>() };
}

/**
 * Lays out a year of a chat that covers the whole of it.
 */
function buildWholeYear(year: number, counts: ReadonlyMap<number, number>): CalendarYear {
  return buildCalendarYear(year, counts, year * 10000 + 101, year * 10000 + 1231);
}

/**
 * Lists the days of a laid-out year in order, without the empty slots.
 */
function daysOf(calendarYear: CalendarYear): CalendarDay[] {
  return calendarYear.weeks
    .flatMap((week) => week.days)
    .filter((day): day is CalendarDay => day !== null);
}

/**
 * Builds the analysis of a chat between two moments with the given counts per day.
 */
function chatBetween(
  firstMessageAt: string,
  lastMessageAt: string,
  counts: readonly (readonly [number, number])[],
): ChatAnalysis {
  return chatAnalysis({
    firstMessageTimestamp: localTime(firstMessageAt),
    lastMessageTimestamp: localTime(lastMessageAt),
    messageCountsByDayKey: new Map(counts),
  });
}

/** A chat from March 2023 to February 2024 with three days of messages. */
const chatOverNewYear = chatBetween('2023-03-10 09:00', '2024-02-20 22:00', [
  [20230310, 4],
  [20231231, 100],
  [20240220, 25],
]);

/**
 * Finds the square of one day in a rendered calendar.
 */
function findSquare(container: ParentNode, dayKey: number): Element {
  return findElement(container, `.calendar-day[data-day-key="${String(dayKey)}"]`);
}

describe('buildCalendarYear', () => {
  it('holds every day of an ordinary year once, in order', () => {
    const days = daysOf(buildWholeYear(2023, new Map()));

    expect(days).toHaveLength(365);
    expect(days[0]?.dayKey).toBe(20230101);
    expect(days[58]?.dayKey).toBe(20230228);
    expect(days[59]?.dayKey).toBe(20230301);
    expect(days[364]?.dayKey).toBe(20231231);
  });

  it('holds the 29th of February of a leap year', () => {
    const days = daysOf(buildWholeYear(2024, new Map()));

    expect(days).toHaveLength(366);
    expect(days[59]?.dayKey).toBe(20240229);
  });

  it('gives every week seven slots, Monday first', () => {
    const calendarYear = buildWholeYear(2023, new Map());

    expect(calendarYear.weeks.every((week) => week.days.length === 7)).toBe(true);
  });

  it('starts a year that begins on a Sunday in the last row of its first week', () => {
    /* 1 January 2023 was a Sunday, so six slots before it belong to 2022. */
    const firstWeek = buildWholeYear(2023, new Map()).weeks[0];

    expect(firstWeek?.days.slice(MONDAY, SUNDAY)).toEqual([null, null, null, null, null, null]);
    expect(firstWeek?.days.at(SUNDAY)?.dayKey).toBe(20230101);
  });

  it('starts a year that begins on a Monday without empty slots', () => {
    /* 1 January 2024 was a Monday. */
    const firstWeek = buildWholeYear(2024, new Map()).weeks[0];

    expect(firstWeek?.days.map((day) => day?.dayKey)).toEqual([
      20240101, 20240102, 20240103, 20240104, 20240105, 20240106, 20240107,
    ]);
  });

  it('leaves the slots after New Year’s Eve empty', () => {
    /* 31 December 2024 was a Tuesday. */
    const weeks = buildWholeYear(2024, new Map()).weeks;
    const lastWeek = weeks[weeks.length - 1];

    expect(lastWeek?.days.map((day) => day?.dayKey ?? null)).toEqual([
      20241230,
      20241231,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('has 53 weeks in most years and 54 when a leap year begins on a Sunday', () => {
    expect(buildWholeYear(2023, new Map()).weeks).toHaveLength(53);
    expect(buildWholeYear(2024, new Map()).weeks).toHaveLength(53);
    /* 2012 began on a Sunday and had 366 days: 1 + 52 full weeks + 1. */
    expect(buildWholeYear(2012, new Map()).weeks).toHaveLength(54);
  });

  it('labels the week in which each month begins, and no other', () => {
    const labels = buildWholeYear(2024, new Map())
      .weeks.map((week) => week.monthLabel)
      .filter((label) => label !== '');

    expect(labels).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]);
  });

  it('puts the label of February on the week that holds the 1st of February', () => {
    const weekOfFebruary = buildWholeYear(2024, new Map()).weeks.find(
      (week) => week.monthLabel === 'Feb',
    );

    /* 1 February 2024 was a Thursday, the fourth row. */
    expect(weekOfFebruary?.days[3]?.dayKey).toBe(20240201);
  });

  it('gives each day its message count, and zero to a day without messages', () => {
    const counts = new Map([
      [20240113, 7],
      [20241231, 2],
    ]);
    const days = daysOf(buildWholeYear(2024, counts));

    expect(days.find((day) => day.dayKey === 20240113)?.messageCount).toBe(7);
    expect(days.find((day) => day.dayKey === 20240114)?.messageCount).toBe(0);
  });

  it('adds up the messages, the active days and the busiest day of the year only', () => {
    const counts = new Map([
      [20231231, 500],
      [20240113, 7],
      [20240114, 12],
      [20250101, 900],
    ]);
    const calendarYear = buildWholeYear(2024, counts);

    expect(calendarYear.messageCount).toBe(19);
    expect(calendarYear.activeDayCount).toBe(2);
    expect(calendarYear.busiestDayMessageCount).toBe(12);
  });

  it('marks the days before the first and after the last message as outside the chat', () => {
    const days = daysOf(buildCalendarYear(2024, new Map(), 20240310, 20241120));
    const isWithinChatOn = (dayKey: number): boolean | undefined =>
      days.find((day) => day.dayKey === dayKey)?.isWithinChat;

    expect(isWithinChatOn(20240309)).toBe(false);
    expect(isWithinChatOn(20240310)).toBe(true);
    expect(isWithinChatOn(20241120)).toBe(true);
    expect(isWithinChatOn(20241121)).toBe(false);
  });
});

describe('buildChatCalendar', () => {
  it('lays out every year the chat touches, newest first', () => {
    const calendar = buildChatCalendar(chatOverNewYear);

    expect(calendar.years.map((calendarYear) => calendarYear.year)).toEqual([2024, 2023]);
    expect(calendar.yearCountOfChat).toBe(2);
  });

  it('includes a year without a single message between two others', () => {
    const chatWithSilentYear = chatBetween('2022-12-30 09:00', '2024-01-02 09:00', [
      [20221230, 1],
      [20240102, 1],
    ]);

    const years = buildChatCalendar(chatWithSilentYear).years;

    expect(years.map((calendarYear) => calendarYear.year)).toEqual([2024, 2023, 2022]);
    expect(years[1]?.messageCount).toBe(0);
    expect(
      years[1]?.weeks.flatMap((week) => week.days).some((day) => day?.isWithinChat === false),
    ).toBe(false);
  });

  it(`stops at the latest ${String(CALENDAR_YEAR_LIMIT)} years and keeps count of all of them`, () => {
    /* 2015 to 2024 are ten calendar years. */
    const tenYears = chatBetween('2015-06-01 09:00', '2024-06-01 09:00', [[20150601, 1]]);

    const calendar = buildChatCalendar(tenYears);

    expect(calendar.years.map((calendarYear) => calendarYear.year)).toEqual([
      2024, 2023, 2022, 2021, 2020,
    ]);
    expect(calendar.yearCountOfChat).toBe(10);
  });

  it('draws exactly five years of a chat of exactly five', () => {
    const fiveYears = chatBetween('2020-06-01 09:00', '2024-06-01 09:00', []);

    const calendar = buildChatCalendar(fiveYears);

    expect(calendar.years).toHaveLength(5);
    expect(calendar.yearCountOfChat).toBe(5);
  });

  it('scales the tints against the busiest day of the years it draws', () => {
    expect(buildChatCalendar(chatOverNewYear).busiestDayMessageCount).toBe(100);
    /* With one year drawn, the 100 messages of 2023 are out of the picture. */
    expect(buildChatCalendar(chatOverNewYear, 1).busiestDayMessageCount).toBe(25);
  });

  it('never scales against zero, so the tint can be divided', () => {
    const silentChat = chatBetween('2024-01-01 09:00', '2024-03-01 09:00', []);

    expect(buildChatCalendar(silentChat).busiestDayMessageCount).toBe(1);
  });
});

describe('calendarTintPercentOf', () => {
  it.each([
    /* 12 + 88 × √(1/1). */
    { messageCount: 100, busiest: 100, expected: 100 },
    /* 12 + 88 × √(25/100) = 12 + 44. */
    { messageCount: 25, busiest: 100, expected: 56 },
    /* 12 + 88 × √(1/100) = 12 + 8.8. */
    { messageCount: 1, busiest: 100, expected: 21 },
    /* 12 + 88 × √(1/10000) = 12 + 0.88. */
    { messageCount: 1, busiest: 10000, expected: 13 },
  ])(
    'tints a day of $messageCount against a busiest day of $busiest at $expected%',
    ({ messageCount, busiest, expected }) => {
      expect(calendarTintPercentOf(messageCount, busiest)).toBe(expected);
    },
  );

  it('does not go beyond the strongest tint for a count above the scale', () => {
    expect(calendarTintPercentOf(500, 100)).toBe(100);
  });
});

describe('describeCalendarYear', () => {
  it('counts the messages and the days they were sent on', () => {
    const counts = new Map([
      [20240113, 1200],
      [20240114, 145],
    ]);

    expect(describeCalendarYear(buildWholeYear(2024, counts))).toBe('1,345 messages on 2 days');
  });

  it('uses the singular for one message on one day', () => {
    expect(describeCalendarYear(buildWholeYear(2024, new Map([[20240113, 1]])))).toBe(
      '1 message on 1 day',
    );
  });
});

describe('renderCalendar', () => {
  const calendar = parseMarkup(renderCalendar(buildChatCalendar(chatOverNewYear)));

  it('draws one block per year, newest first, each with its totals', () => {
    expect(textsOfElements(calendar, '.calendar-year h3')).toEqual(['2024', '2023']);
    expect(textsOfElements(calendar, '.calendar-year-heading p')).toEqual([
      '25 messages on 1 day',
      '104 messages on 2 days',
    ]);
  });

  it('describes each year in words for a screen reader', () => {
    const descriptions = Array.from(calendar.querySelectorAll('.calendar-grid'), (grid) =>
      grid.getAttribute('aria-label'),
    );

    expect(descriptions).toEqual(['2024: 25 messages on 1 day', '2023: 104 messages on 2 days']);
  });

  it('draws a square for every day between the first and the last message', () => {
    /* 10 March to 31 December 2023 is 297 days; 1 January to 20 February 2024 is 51. */
    expect(calendar.querySelectorAll('.calendar-day[data-day-key]')).toHaveLength(297 + 51);
  });

  it('outlines the days of the year the chat does not reach, without a count', () => {
    /* The rest of the two years: 365 − 297 and 366 − 51. */
    const squaresOutside = calendar.querySelectorAll('.calendar-day.calendar-day-outside');

    expect(squaresOutside).toHaveLength(68 + 315);
    expect(squaresOutside[0]?.hasAttribute('data-day-key')).toBe(false);
    expect(squaresOutside[0]?.hasAttribute('data-message-count')).toBe(false);
  });

  it('puts a week into eight cells: the month label and seven slots', () => {
    const grid = findElement(calendar, '.calendar-year:nth-child(2) .calendar-grid');

    /* The column of weekday labels and the 53 weeks of 2023. */
    expect(grid.children).toHaveLength(8 + 53 * 8);
  });

  it('labels Monday, Wednesday, Friday and Sunday down the side', () => {
    const grid = findElement(calendar, '.calendar-grid');

    expect(textsOfElements(grid, '.calendar-weekday-label')).toEqual([
      'Mon',
      '',
      'Wed',
      '',
      'Fri',
      '',
      'Sun',
    ]);
  });

  it('labels the months along the top', () => {
    const grid = findElement(calendar, '.calendar-grid');
    const monthLabels = textsOfElements(grid, '.calendar-month-label').filter(
      (label) => label !== '',
    );

    expect(monthLabels).toHaveLength(12);
    expect(monthLabels[0]).toBe('Jan');
    expect(monthLabels[11]).toBe('Dec');
  });

  it('tints a day by its count and leaves a day without messages untinted', () => {
    expect(findSquare(calendar, 20231231).getAttribute('style')).toBe(
      'background:color-mix(in oklab,var(--heat-hi) 100%,var(--heat-lo))',
    );
    /* 12 + 88 × √(25/100). */
    expect(findSquare(calendar, 20240220).getAttribute('style')).toBe(
      'background:color-mix(in oklab,var(--heat-hi) 56%,var(--heat-lo))',
    );
    expect(findSquare(calendar, 20230311).hasAttribute('style')).toBe(false);
  });

  it('carries the count of each day on its square', () => {
    expect(findSquare(calendar, 20231231).getAttribute('data-message-count')).toBe('100');
    expect(findSquare(calendar, 20230311).getAttribute('data-message-count')).toBe('0');
  });
});

describe('renderCalendarTooltip', () => {
  it('names the weekday and the date, and gives the count', () => {
    expect(renderCalendarTooltip({ dayKey: 20240113, messageCount: 5 })).toBe(
      '<div class="tooltip-title">Saturday, 13 Jan 2024</div><div class="tooltip-row"><span>Messages</span><b>5</b></div>',
    );
  });

  it('groups the digits of a large count', () => {
    expect(renderCalendarTooltip({ dayKey: 20231231, messageCount: 12345 })).toContain(
      '<b>12,345</b>',
    );
  });

  it.each([
    { dayKey: FIRST_DAY_OF_2024, weekdayIndex: MONDAY, title: 'Monday, 1 Jan 2024' },
    { dayKey: 20240113, weekdayIndex: SATURDAY, title: 'Saturday, 13 Jan 2024' },
    { dayKey: 20241229, weekdayIndex: SUNDAY, title: 'Sunday, 29 Dec 2024' },
  ])('says $title for the square in row $weekdayIndex', ({ dayKey, weekdayIndex, title }) => {
    const week = buildWholeYear(2024, new Map()).weeks.find((candidate) =>
      candidate.days.some((day) => day?.dayKey === dayKey),
    );

    expect(week?.days[weekdayIndex]?.dayKey).toBe(dayKey);
    expect(renderCalendarTooltip({ dayKey, messageCount: 0 })).toContain(title);
  });
});

describe('findCalendarDayAt', () => {
  const calendar = parseMarkup(renderCalendar(buildChatCalendar(chatOverNewYear)));

  it('reads the day and the count back from a square', () => {
    expect(findCalendarDayAt(findSquare(calendar, 20231231))).toEqual({
      dayKey: 20231231,
      messageCount: 100,
    });
  });

  it('finds nothing on a month label, a day outside the chat or the calendar itself', () => {
    expect(findCalendarDayAt(findElement(calendar, '.calendar-month-label'))).toBeNull();
    expect(findCalendarDayAt(findElement(calendar, '.calendar-day-outside'))).toBeNull();
    expect(findCalendarDayAt(findElement(calendar, '.calendar'))).toBeNull();
  });

  it('finds nothing when the event has no element as its target', () => {
    expect(findCalendarDayAt(null)).toBeNull();
    expect(findCalendarDayAt(document)).toBeNull();
  });
});

describe('attachCalendarTooltips', () => {
  /**
   * Renders the calendar of the chat over New Year and connects a recording tooltip.
   */
  function renderConnectedCalendar(): {
    container: HTMLDivElement;
    tooltip: ReturnType<typeof createRecordingTooltip>;
  } {
    const container = parseMarkup(renderCalendar(buildChatCalendar(chatOverNewYear)));
    const tooltip = createRecordingTooltip();
    attachCalendarTooltips(container, tooltip);
    return { container, tooltip };
  }

  it('shows the tooltip of the square the pointer moves over', () => {
    const { container, tooltip } = renderConnectedCalendar();

    const pointerMove = new MouseEvent('pointermove', { bubbles: true, clientX: 40, clientY: 60 });
    findSquare(container, 20231231).dispatchEvent(pointerMove);

    expect(tooltip.show).toHaveBeenCalledExactlyOnceWith(
      renderCalendarTooltip({ dayKey: 20231231, messageCount: 100 }),
      pointerMove,
    );
  });

  it('hides the tooltip when the pointer moves on to a gap, a label or a day outside the chat', () => {
    const { container, tooltip } = renderConnectedCalendar();

    findElement(container, '.calendar-day-outside').dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true }),
    );

    expect(tooltip.show).not.toHaveBeenCalled();
    expect(tooltip.hide).toHaveBeenCalledOnce();
  });

  it('hides the tooltip when the pointer leaves the calendar', () => {
    const { container, tooltip } = renderConnectedCalendar();

    findElement(container, '.calendar').dispatchEvent(new MouseEvent('pointerleave'));

    expect(tooltip.hide).toHaveBeenCalledOnce();
  });

  it('listens on the calendar, not on each of its squares', () => {
    /* Ten years, of which five are drawn: 366 + 365 × 3 + 366 squares, less the days after 1 June 2024. */
    const tenYears = chatBetween('2015-06-01 09:00', '2024-06-01 09:00', [[20240601, 3]]);
    const container = parseMarkup(renderCalendar(buildChatCalendar(tenYears)));
    const listenerSpy = vi.spyOn(EventTarget.prototype, 'addEventListener');

    attachCalendarTooltips(container, createRecordingTooltip());
    const listenedEvents = listenerSpy.mock.calls.map(([eventName]) => eventName);
    listenerSpy.mockRestore();

    expect(container.querySelectorAll('.calendar-day[data-day-key]').length).toBeGreaterThan(1600);
    expect(listenedEvents).toEqual(['pointermove', 'pointerleave']);
  });

  it('connects nothing in a container without a calendar', () => {
    const tooltip = createRecordingTooltip();
    const container = parseMarkup(
      '<p class="calendar-day" data-day-key="20240113" data-message-count="1">No chart here</p>',
    );

    attachCalendarTooltips(container, tooltip);
    findElement(container, 'p').dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));

    expect(tooltip.show).not.toHaveBeenCalled();
    expect(tooltip.hide).not.toHaveBeenCalled();
  });
});
