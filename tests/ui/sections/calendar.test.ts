// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import type { ChatAnalysis } from '../../../src/core/types';
import { buildChatCalendar } from '../../../src/ui/charts/calendar';
import {
  SHORTEST_SPAN_FOR_CALENDAR_IN_DAYS,
  renderCalendarSection,
  renderOlderYearsNote,
} from '../../../src/ui/sections/calendar';
import { chatAnalysis } from '../../fixtures/analysis-builders';
import { findElement, parseMarkup, textsOfElements } from '../../fixtures/markup';
import { localTime } from '../../fixtures/messages';

/**
 * Builds the analysis of a chat from one moment to another, with a busiest day
 * of 1,345 messages at its end.
 */
function chatBetween(
  firstMessageAt: string,
  lastMessageAt: string,
  spanInDays: number,
): ChatAnalysis {
  const lastMessageTimestamp = localTime(lastMessageAt);
  const lastDayKey =
    lastMessageTimestamp.getFullYear() * 10000 +
    (lastMessageTimestamp.getMonth() + 1) * 100 +
    lastMessageTimestamp.getDate();
  return chatAnalysis({
    firstMessageTimestamp: localTime(firstMessageAt),
    lastMessageTimestamp,
    spanInDays,
    messageCountsByDayKey: new Map([[lastDayKey, 1345]]),
  });
}

/** A chat from March 2023 to February 2024. */
const chatOverNewYear = chatBetween('2023-03-10 09:00', '2024-02-20 22:00', 348);

describe('renderCalendarSection', () => {
  it(`is left out of a chat that spans fewer than ${String(SHORTEST_SPAN_FOR_CALENDAR_IN_DAYS)} days`, () => {
    /* 1 to 30 January is 30 days, both included. */
    const thirtyDays = chatBetween('2024-01-01 09:00', '2024-01-30 09:00', 30);

    expect(renderCalendarSection(thirtyDays)).toBe('');
  });

  it('is shown for a chat that spans 31 days', () => {
    const thirtyOneDays = chatBetween('2024-01-01 09:00', '2024-01-31 09:00', 31);

    const section = parseMarkup(renderCalendarSection(thirtyOneDays));

    expect(textsOfElements(section, '.section-heading h2')).toEqual(['Day by day']);
  });

  it('says how to read the squares', () => {
    const caption = findElement(
      parseMarkup(renderCalendarSection(chatOverNewYear)),
      '.section-heading p',
    );

    expect(caption.textContent).toContain('Each square is one day and each column one week');
    expect(caption.textContent).toContain('quiet days are tinted more than their share');
  });

  it('draws one block per calendar year, newest first', () => {
    const section = parseMarkup(renderCalendarSection(chatOverNewYear));

    expect(textsOfElements(section, '.calendar-year h3')).toEqual(['2024', '2023']);
  });

  it('says in the legend how many messages the strongest tint stands for', () => {
    const section = parseMarkup(renderCalendarSection(chatOverNewYear));

    expect(textsOfElements(section, '.heatmap-legend')).toEqual(['11,345 messages in a day']);
  });

  it('shows no note about older years when every year is drawn', () => {
    const section = parseMarkup(renderCalendarSection(chatOverNewYear));

    expect(section.querySelectorAll('.calendar-years-note')).toHaveLength(0);
  });

  it('draws the latest five years of a longer chat and says that older ones are left out', () => {
    const tenYears = chatBetween('2015-06-01 09:00', '2024-06-01 09:00', 3289);

    const section = parseMarkup(renderCalendarSection(tenYears));

    expect(textsOfElements(section, '.calendar-year h3')).toEqual([
      '2024',
      '2023',
      '2022',
      '2021',
      '2020',
    ]);
    expect(textsOfElements(section, '.calendar-years-note')).toEqual([
      'Showing the latest 5 of 10 years. Choose an older year under “Period” to see its calendar.',
    ]);
  });
});

describe('renderOlderYearsNote', () => {
  it('says nothing for a chat of exactly five years', () => {
    const fiveYears = chatBetween('2020-06-01 09:00', '2024-06-01 09:00', 1462);

    expect(renderOlderYearsNote(buildChatCalendar(fiveYears))).toBe('');
  });

  it('speaks up from the sixth year on', () => {
    const sixYears = chatBetween('2019-06-01 09:00', '2024-06-01 09:00', 1828);

    expect(renderOlderYearsNote(buildChatCalendar(sixYears))).toContain(
      'Showing the latest 5 of 6 years.',
    );
  });
});
