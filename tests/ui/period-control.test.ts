// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findPageElements } from '../../src/ui/dom';
import type { PageElements } from '../../src/ui/dom';
import { NO_MESSAGES_IN_PERIOD_STATUS } from '../../src/ui/period';
import type { Period, PeriodPreset } from '../../src/ui/period';
import {
  offerPeriodChoices,
  readChosenPeriod,
  selectCustomPeriod,
  showDisplayedPeriod,
  showPeriodInDateFields,
} from '../../src/ui/period-control';
import { textsOfElements } from '../fixtures/markup';
import { loadIndexHtmlBody } from '../fixtures/page';

/** A chat from 14 March 2023 to 20 June 2024. */
const wholeChat: Period = { firstDayKey: 20230314, lastDayKey: 20240620 };

/** The year 2023 of that chat. */
const year2023: Period = { firstDayKey: 20230314, lastDayKey: 20231231 };

/** The ready-made periods of that chat the tests need. */
const presets: readonly PeriodPreset[] = [
  { value: 'whole-chat', label: 'The whole chat', period: wholeChat },
  { value: 'year-2023', label: '2023', period: year2023 },
];

/**
 * Finds the elements of the page and offers the periods of the chat in its period row.
 */
function offerPeriodsOfChat(): PageElements {
  const elements = findPageElements();
  offerPeriodChoices(elements, presets, wholeChat, true);
  return elements;
}

beforeEach(() => {
  loadIndexHtmlBody();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('offerPeriodChoices', () => {
  it('lists the ready-made periods, followed by the entry for dates typed by hand', () => {
    const elements = offerPeriodsOfChat();

    expect(textsOfElements(elements.periodSelect, 'option')).toEqual([
      'The whole chat',
      '2023',
      'Custom range',
    ]);
  });

  it('limits both date fields to the days of the chat', () => {
    const elements = offerPeriodsOfChat();

    expect(elements.periodFromInput.min).toBe('2023-03-14');
    expect(elements.periodFromInput.max).toBe('2024-06-20');
    expect(elements.periodToInput.min).toBe('2023-03-14');
    expect(elements.periodToInput.max).toBe('2024-06-20');
  });

  it('shows the row for a chat that is worth dividing', () => {
    const elements = offerPeriodsOfChat();

    expect(elements.periodRow.hidden).toBe(false);
  });

  it('hides the row for a chat that is not', () => {
    const elements = findPageElements();

    offerPeriodChoices(elements, presets, wholeChat, false);

    expect(elements.periodRow.hidden).toBe(true);
  });

  it('replaces the periods of the chat that was on display before', () => {
    const elements = offerPeriodsOfChat();

    offerPeriodChoices(elements, presets.slice(0, 1), wholeChat, true);

    expect(textsOfElements(elements.periodSelect, 'option')).toEqual([
      'The whole chat',
      'Custom range',
    ]);
  });
});

describe('showPeriodInDateFields', () => {
  it('writes the first day into "from" and the last day into "to"', () => {
    const elements = offerPeriodsOfChat();

    showPeriodInDateFields(elements, year2023);

    expect(elements.periodFromInput.value).toBe('2023-03-14');
    expect(elements.periodToInput.value).toBe('2023-12-31');
  });
});

describe('showDisplayedPeriod', () => {
  it('selects the whole chat and shows no note for it', () => {
    const elements = offerPeriodsOfChat();

    showDisplayedPeriod(elements, presets, wholeChat, wholeChat);

    expect(elements.periodSelect.value).toBe('whole-chat');
    expect(elements.periodFromInput.value).toBe('2023-03-14');
    expect(elements.periodToInput.value).toBe('2024-06-20');
    expect(elements.periodNote.hidden).toBe(true);
    expect(elements.periodNote.textContent).toBe('');
  });

  it('selects the ready-made period with exactly those days, and names the days in the note', () => {
    const elements = offerPeriodsOfChat();

    showDisplayedPeriod(elements, presets, year2023, wholeChat);

    expect(elements.periodSelect.value).toBe('year-2023');
    expect(elements.periodNote.hidden).toBe(false);
    expect(elements.periodNote.textContent).toBe(
      'Showing 14 Mar 2023 to 31 Dec 2023, not the whole chat.',
    );
  });

  it('selects "Custom range" for days that match no ready-made period', () => {
    const elements = offerPeriodsOfChat();

    showDisplayedPeriod(
      elements,
      presets,
      { firstDayKey: 20230401, lastDayKey: 20230430 },
      wholeChat,
    );

    expect(elements.periodSelect.value).toBe('custom');
    expect(elements.periodFromInput.value).toBe('2023-04-01');
    expect(elements.periodToInput.value).toBe('2023-04-30');
    expect(elements.periodNote.textContent).toBe(
      'Showing 1 Apr 2023 to 30 Apr 2023, not the whole chat.',
    );
  });

  describe('two ready-made periods with the same days', () => {
    /** A chat from 14 March 2022 to 31 December 2023: its last twelve months are the year 2023. */
    const chatEndingOnNewYearsEve: Period = { firstDayKey: 20220314, lastDayKey: 20231231 };

    /** The whole of 2023, which two entries of the list stand for. */
    const allOf2023: Period = { firstDayKey: 20230101, lastDayKey: 20231231 };

    const presetsWithTwins: readonly PeriodPreset[] = [
      { value: 'whole-chat', label: 'The whole chat', period: chatEndingOnNewYearsEve },
      { value: 'last-12-months', label: 'Last 12 months', period: allOf2023 },
      { value: 'year-2023', label: '2023', period: allOf2023 },
    ];

    it('keeps the entry the reader picked, not the first one with those days', () => {
      const elements = findPageElements();
      offerPeriodChoices(elements, presetsWithTwins, chatEndingOnNewYearsEve, true);
      elements.periodSelect.value = 'year-2023';

      showDisplayedPeriod(elements, presetsWithTwins, allOf2023, chatEndingOnNewYearsEve);

      expect(elements.periodSelect.value).toBe('year-2023');
    });

    it('selects the first of them when the list was showing another period', () => {
      const elements = findPageElements();
      offerPeriodChoices(elements, presetsWithTwins, chatEndingOnNewYearsEve, true);
      elements.periodSelect.value = 'whole-chat';

      showDisplayedPeriod(elements, presetsWithTwins, allOf2023, chatEndingOnNewYearsEve);

      expect(elements.periodSelect.value).toBe('last-12-months');
    });
  });

  it('withdraws the note when the whole chat is shown again', () => {
    const elements = offerPeriodsOfChat();
    showDisplayedPeriod(elements, presets, year2023, wholeChat);

    showDisplayedPeriod(elements, presets, wholeChat, wholeChat);

    expect(elements.periodNote.hidden).toBe(true);
    expect(elements.periodNote.textContent).toBe('');
  });
});

describe('readChosenPeriod', () => {
  it('reads a ready-made period from the list, whatever the date fields hold', () => {
    const elements = offerPeriodsOfChat();
    elements.periodSelect.value = 'year-2023';
    elements.periodFromInput.value = '2024-01-01';
    elements.periodToInput.value = '2024-01-31';

    expect(readChosenPeriod(elements, presets, wholeChat)).toEqual({
      kind: 'period',
      period: year2023,
    });
  });

  it('reads the date fields while the list shows "Custom range"', () => {
    const elements = offerPeriodsOfChat();
    selectCustomPeriod(elements);
    elements.periodFromInput.value = '2024-01-01';
    elements.periodToInput.value = '2024-01-31';

    expect(readChosenPeriod(elements, presets, wholeChat)).toEqual({
      kind: 'period',
      period: { firstDayKey: 20240101, lastDayKey: 20240131 },
    });
  });

  it('passes on why typed dates cannot be used', () => {
    const elements = offerPeriodsOfChat();
    selectCustomPeriod(elements);
    elements.periodFromInput.value = '2022-01-01';
    elements.periodToInput.value = '2022-01-31';

    expect(readChosenPeriod(elements, presets, wholeChat)).toEqual({
      kind: 'unusable',
      reason: NO_MESSAGES_IN_PERIOD_STATUS,
    });
  });
});

describe('selectCustomPeriod', () => {
  it('turns the list to "Custom range"', () => {
    const elements = offerPeriodsOfChat();

    selectCustomPeriod(elements);

    expect(elements.periodSelect.value).toBe('custom');
    expect(elements.periodSelect.selectedOptions[0]?.textContent).toBe('Custom range');
  });
});
