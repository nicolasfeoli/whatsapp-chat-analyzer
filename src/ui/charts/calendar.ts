/**
 * Draws the calendar of the chat: one block per calendar year, one square per
 * day, the weeks as columns and the weekdays as rows (Monday on top), each
 * square tinted by how many messages were sent on that day.
 *
 * Laying the days out is a pure function of the message counts
 * ({@link buildChatCalendar}), and the markup is built as one string. The
 * tooltips are not attached square by square: a chat of five years has more
 * than 1,800 of them, so each calendar listens once and finds the square under
 * the pointer when it moves.
 */

import {
  dateFromDayKey,
  DAYS_PER_WEEK,
  dayKeyFromDate,
  mondayFirstWeekdayIndexOf,
  sortableDayNumber,
} from '../../core/index';
import type { ChatAnalysis } from '../../core/index';
import { EMPTY_HTML, escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import {
  formatCountWithNoun,
  formatLongDate,
  formatWholeNumber,
  MONTH_ABBREVIATIONS,
  weekdayNameOf,
} from '../text-formatting';
import { renderTooltipRow, renderTooltipTitle } from '../tooltip';
import type { Tooltip } from '../tooltip';

/*
 * The class and attribute names below are written with the `html` tag because
 * they are placed in markup; being strings, they also serve to find the
 * squares again and to read their attributes back.
 */

/** The CSS class of the element that holds every year; also what listens for the pointer. */
const CALENDAR_CLASS: SafeHtml = html`calendar`;

/** The CSS class of one square. */
const CALENDAR_DAY_CLASS: SafeHtml = html`calendar-day`;

/** The attribute in which a square carries its day, written as the number `YYYYMMDD`. */
const DAY_KEY_ATTRIBUTE: SafeHtml = html`data-day-key`;

/** The attribute in which a square carries how many messages were sent on its day. */
const MESSAGE_COUNT_ATTRIBUTE: SafeHtml = html`data-message-count`;

/**
 * How many years the calendar draws at most, counted back from the latest.
 * Five years are 1,826 squares and about five screens of a phone; a chat of
 * fifteen would bury the sections below it.
 */
export const CALENDAR_YEAR_LIMIT = 5;

/** The months of a year, for walking through them. */
const MONTHS_PER_YEAR = 12;

/** Row labels show the first three letters of the weekday ("Mon"). */
const WEEKDAY_LABEL_LENGTH = 3;

/** Only every second row is labelled (Monday, Wednesday, Friday); seven labels would crowd. */
const WEEKDAY_LABEL_INTERVAL = 2;

/**
 * A day with a single message is already tinted this many percent towards the
 * strongest colour, so it is clearly told apart from a day without any.
 */
const FAINTEST_TINT_PERCENT = 12;

/** The remaining range of the tint, spread up to the busiest day. */
const TINT_RANGE_PERCENT = 88;

/** One day of the calendar. */
export interface CalendarDay {
  /** The day written as the number `YYYYMMDD`. */
  readonly dayKey: number;
  /** Messages sent on that day; zero for a day without any. */
  readonly messageCount: number;
  /**
   * Whether the day lies between the first and the last message of the chat.
   * A day outside has no count to show: the export says nothing about it.
   */
  readonly isWithinChat: boolean;
}

/** One column of the calendar: a week from Monday to Sunday. */
export interface CalendarWeek {
  /** The month whose first day falls in this week ("Mar"), or an empty string. */
  readonly monthLabel: string;
  /**
   * Seven entries, Monday first. `null` stands for a weekday that belongs to
   * the year before or after, in the first and the last week.
   */
  readonly days: readonly (CalendarDay | null)[];
}

/** One calendar year laid out in weeks. */
export interface CalendarYear {
  /** The year, with its century. */
  readonly year: number;
  /** The weeks that hold a day of the year, in order: 53 or 54 of them. */
  readonly weeks: readonly CalendarWeek[];
  /** Messages sent in the year. */
  readonly messageCount: number;
  /** Days of the year with at least one message. */
  readonly activeDayCount: number;
  /** Messages sent on the busiest day of the year; zero for a year without messages. */
  readonly busiestDayMessageCount: number;
}

/** The years of a chat that the calendar draws. */
export interface ChatCalendar {
  /** The years drawn, newest first; at most {@link CALENDAR_YEAR_LIMIT}. */
  readonly years: readonly CalendarYear[];
  /** How many calendar years the chat touches, the ones not drawn included. */
  readonly yearCountOfChat: number;
  /** Messages sent on the busiest day of the years drawn, and at least 1 so it can be divided by. */
  readonly busiestDayMessageCount: number;
}

/** What a square says about itself: its day and its count. */
export interface CalendarDayCount {
  /** The day written as the number `YYYYMMDD`. */
  readonly dayKey: number;
  /** Messages sent on that day. */
  readonly messageCount: number;
}

/**
 * Counts the days of a month.
 *
 * @param year - The year, with its century.
 * @param monthIndex - 0 for January up to 11 for December.
 * @returns 28 to 31.
 */
function countDaysOfMonth(year: number, monthIndex: number): number {
  /* Day zero of the next month is the last day of this one. */
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Fills a week that the year does not fill with empty slots, up to Sunday.
 */
function padWeek(days: readonly (CalendarDay | null)[]): (CalendarDay | null)[] {
  const emptySlots = new Array<null>(DAYS_PER_WEEK - days.length).fill(null);
  return [...days, ...emptySlots];
}

/**
 * Lays one calendar year out in weeks.
 *
 * @param year - The year, with its century.
 * @param messageCountsByDayKey - Messages per day, keyed by `YYYYMMDD`.
 * @param firstDayKey - The day of the first message of the chat.
 * @param lastDayKey - The day of the last message of the chat.
 * @returns The weeks of the year and its totals.
 */
export function buildCalendarYear(
  year: number,
  messageCountsByDayKey: ReadonlyMap<number, number>,
  firstDayKey: number,
  lastDayKey: number,
): CalendarYear {
  const weeks: CalendarWeek[] = [];
  const emptySlotsBeforeNewYear = mondayFirstWeekdayIndexOf(new Date(year, 0, 1));
  let days: (CalendarDay | null)[] = new Array<null>(emptySlotsBeforeNewYear).fill(null);
  let monthLabel = '';
  let messageCount = 0;
  let activeDayCount = 0;
  let busiestDayMessageCount = 0;

  for (let monthIndex = 0; monthIndex < MONTHS_PER_YEAR; monthIndex += 1) {
    const dayCount = countDaysOfMonth(year, monthIndex);
    for (let dayOfMonth = 1; dayOfMonth <= dayCount; dayOfMonth += 1) {
      if (dayOfMonth === 1) {
        monthLabel = MONTH_ABBREVIATIONS[monthIndex] ?? '';
      }
      const dayKey = sortableDayNumber(year, monthIndex + 1, dayOfMonth);
      const messageCountOfDay = messageCountsByDayKey.get(dayKey) ?? 0;
      const isWithinChat = dayKey >= firstDayKey && dayKey <= lastDayKey;
      days.push({ dayKey, messageCount: messageCountOfDay, isWithinChat });

      messageCount += messageCountOfDay;
      activeDayCount += messageCountOfDay > 0 ? 1 : 0;
      busiestDayMessageCount = Math.max(busiestDayMessageCount, messageCountOfDay);

      if (days.length === DAYS_PER_WEEK) {
        weeks.push({ monthLabel, days });
        days = [];
        monthLabel = '';
      }
    }
  }
  if (days.length > 0) {
    weeks.push({ monthLabel, days: padWeek(days) });
  }

  return { year, weeks, messageCount, activeDayCount, busiestDayMessageCount };
}

/**
 * Lays out the latest years of a chat.
 *
 * @param analysis - The analysed chat.
 * @param yearLimit - How many years to lay out at most; five unless stated.
 * @returns The years from the last message back, newest first, a year without
 *   messages between two others included.
 */
export function buildChatCalendar(
  analysis: ChatAnalysis,
  yearLimit: number = CALENDAR_YEAR_LIMIT,
): ChatCalendar {
  const firstYear = analysis.firstMessageTimestamp.getFullYear();
  const lastYear = analysis.lastMessageTimestamp.getFullYear();
  const firstDayKey = dayKeyFromDate(analysis.firstMessageTimestamp);
  const lastDayKey = dayKeyFromDate(analysis.lastMessageTimestamp);
  const yearCountOfChat = lastYear - firstYear + 1;
  const oldestYearDrawn = Math.max(firstYear, lastYear - yearLimit + 1);

  const years: CalendarYear[] = [];
  let busiestDayMessageCount = 1;
  for (let year = lastYear; year >= oldestYearDrawn; year -= 1) {
    const calendarYear = buildCalendarYear(
      year,
      analysis.messageCountsByDayKey,
      firstDayKey,
      lastDayKey,
    );
    years.push(calendarYear);
    busiestDayMessageCount = Math.max(busiestDayMessageCount, calendarYear.busiestDayMessageCount);
  }
  return { years, yearCountOfChat, busiestDayMessageCount };
}

/**
 * Works out how strongly a day is tinted.
 *
 * The tint grows with the square root of the count. Scaled in a straight line,
 * one day of a thousand messages would leave every ordinary day of thirty
 * looking empty; the root keeps the order of the days and lets the quiet ones
 * show.
 *
 * @param messageCount - Messages sent on the day; at least 1.
 * @param busiestDayMessageCount - Messages sent on the busiest day drawn; at least 1.
 * @returns A whole percentage from 12 for the quietest day up to 100 for the busiest.
 */
export function calendarTintPercentOf(
  messageCount: number,
  busiestDayMessageCount: number,
): number {
  const shareOfBusiestDay = Math.min(messageCount / busiestDayMessageCount, 1);
  return Math.round(FAINTEST_TINT_PERCENT + TINT_RANGE_PERCENT * Math.sqrt(shareOfBusiestDay));
}

/**
 * Writes the `style` attribute that tints a square, with its leading space.
 * A day without messages gets no attribute and keeps the background of the stylesheet.
 */
function renderTintAttribute(messageCount: number, busiestDayMessageCount: number): SafeHtml {
  if (messageCount <= 0) {
    return EMPTY_HTML;
  }
  const tintPercent = calendarTintPercentOf(messageCount, busiestDayMessageCount);
  return html` style="background:color-mix(in oklab,var(--heat-hi) ${tintPercent}%,var(--heat-lo))"`;
}

/**
 * Draws one slot of a week: nothing visible for a weekday of another year, an
 * outline for a day the chat does not reach, and a square with its count in
 * `data-` attributes for a day of the chat.
 */
function renderCalendarSlot(day: CalendarDay | null, busiestDayMessageCount: number): SafeHtml {
  if (day === null) {
    return html`<div></div>`;
  }
  if (!day.isWithinChat) {
    return html`<div class="${CALENDAR_DAY_CLASS} calendar-day-outside"></div>`;
  }
  const tintAttribute = renderTintAttribute(day.messageCount, busiestDayMessageCount);
  return html`<div class="${CALENDAR_DAY_CLASS}" ${DAY_KEY_ATTRIBUTE}="${day.dayKey}" ${MESSAGE_COUNT_ATTRIBUTE}="${day.messageCount}"${tintAttribute}></div>`;
}

/**
 * Draws one column: the month label above it and its seven slots.
 */
function renderCalendarWeek(week: CalendarWeek, busiestDayMessageCount: number): SafeHtml {
  const slotsHtml = joinHtml(
    week.days.map((day: CalendarDay | null): SafeHtml =>
      renderCalendarSlot(day, busiestDayMessageCount),
    ),
  );
  return html`<div class="calendar-month-label">${escapeHtml(week.monthLabel)}</div>${slotsHtml}`;
}

/**
 * Draws the first column: the empty corner above it and the weekday labels.
 */
function renderWeekdayLabels(): SafeHtml {
  const labels: SafeHtml[] = [html`<div></div>`];
  for (let weekdayIndex = 0; weekdayIndex < DAYS_PER_WEEK; weekdayIndex += 1) {
    const isLabelled = weekdayIndex % WEEKDAY_LABEL_INTERVAL === 0;
    const label = isLabelled ? weekdayNameOf(weekdayIndex).slice(0, WEEKDAY_LABEL_LENGTH) : '';
    labels.push(html`<div class="calendar-weekday-label">${escapeHtml(label)}</div>`);
  }
  return joinHtml(labels);
}

/**
 * Puts the totals of a year into words.
 *
 * @param calendarYear - The year laid out.
 * @returns For example `"12,345 messages on 301 days"`.
 */
export function describeCalendarYear(calendarYear: CalendarYear): string {
  const messages = formatCountWithNoun(calendarYear.messageCount, 'message', 'messages');
  const days = formatCountWithNoun(calendarYear.activeDayCount, 'day', 'days');
  return `${messages} on ${days}`;
}

/**
 * Draws the block of one year: its heading, its totals and its grid, which
 * scrolls sideways inside its own wrapper when the screen is narrower.
 */
function renderCalendarYear(calendarYear: CalendarYear, busiestDayMessageCount: number): SafeHtml {
  const totals = describeCalendarYear(calendarYear);
  const weeksHtml = joinHtml(
    calendarYear.weeks.map((week: CalendarWeek): SafeHtml =>
      renderCalendarWeek(week, busiestDayMessageCount),
    ),
  );
  const headingHtml = html`<div class="calendar-year-heading"><h3>${calendarYear.year}</h3><p>${escapeHtml(totals)}</p></div>`;
  const description = escapeHtml(`${String(calendarYear.year)}: ${totals}`);
  const gridHtml = html`<div class="calendar-grid" role="img" aria-label="${description}">${renderWeekdayLabels()}${weeksHtml}</div>`;
  return html`<div class="calendar-year">${headingHtml}<div class="calendar-scroll">${gridHtml}</div></div>`;
}

/**
 * Draws the calendar.
 *
 * @param calendar - The years laid out by {@link buildChatCalendar}.
 * @returns A `<div class="calendar">` element as markup.
 */
export function renderCalendar(calendar: ChatCalendar): SafeHtml {
  const yearsHtml = joinHtml(
    calendar.years.map((calendarYear: CalendarYear): SafeHtml =>
      renderCalendarYear(calendarYear, calendar.busiestDayMessageCount),
    ),
  );
  return html`<div class="${CALENDAR_CLASS}">${yearsHtml}</div>`;
}

/**
 * Builds the tooltip for one square.
 *
 * @param day - The day of the square and its message count.
 * @returns The tooltip content as markup.
 */
export function renderCalendarTooltip(day: CalendarDayCount): SafeHtml {
  const date = dateFromDayKey(day.dayKey);
  const title = `${weekdayNameOf(mondayFirstWeekdayIndexOf(date))}, ${formatLongDate(date)}`;
  const formattedCount = formatWholeNumber(day.messageCount);
  const rowHtml = renderTooltipRow(html`Messages`, escapeHtml(formattedCount));
  return html`${renderTooltipTitle(escapeHtml(title))}${rowHtml}`;
}

/**
 * Finds the day of the square an event happened on.
 *
 * @param eventTarget - What the pointer was over.
 * @returns The day and its count, or `null` when the pointer was over a label,
 *   a gap or a day outside the chat.
 */
export function findCalendarDayAt(eventTarget: EventTarget | null): CalendarDayCount | null {
  if (!(eventTarget instanceof Element)) {
    return null;
  }
  const square = eventTarget.closest(`.${CALENDAR_DAY_CLASS}[${DAY_KEY_ATTRIBUTE}]`);
  if (square === null) {
    return null;
  }
  return {
    dayKey: Number(square.getAttribute(DAY_KEY_ATTRIBUTE)),
    messageCount: Number(square.getAttribute(MESSAGE_COUNT_ATTRIBUTE)),
  };
}

/**
 * Makes one calendar show the tooltip of the square under the pointer, and of
 * a square that is tapped: a finger never hovers, and its tap arrives as a
 * click after the pointer has already left. Three listeners serve all of its
 * squares.
 */
function attachCalendarEvents(calendarElement: HTMLElement, tooltip: Tooltip): void {
  const showTooltipAt = (event: MouseEvent): void => {
    const day = findCalendarDayAt(event.target);
    if (day === null) {
      tooltip.hide();
      return;
    }
    tooltip.show(renderCalendarTooltip(day), event);
  };
  calendarElement.addEventListener('pointermove', showTooltipAt);
  calendarElement.addEventListener('click', showTooltipAt);
  calendarElement.addEventListener('pointerleave', (): void => {
    tooltip.hide();
  });
}

/**
 * Connects the tooltip to the calendars inside a container.
 *
 * @param container - The element the report was rendered into.
 * @param tooltip - The shared tooltip.
 */
export function attachCalendarTooltips(container: ParentNode, tooltip: Tooltip): void {
  const calendarElements = container.querySelectorAll<HTMLElement>(`.${CALENDAR_CLASS}`);
  for (const calendarElement of calendarElements) {
    attachCalendarEvents(calendarElement, tooltip);
  }
}
