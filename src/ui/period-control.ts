/**
 * The row of the page in which the reader picks a period: a list of
 * ready-made periods, a "from" and a "to" date field, and a note that says
 * which days the report shows.
 *
 * This module only writes to those elements and reads them back. What a
 * choice sets in motion is decided by `page-controller.ts`; which periods
 * exist and what the dates mean is decided by `period.ts`.
 */

import type { PageElements } from './dom';
import {
  CUSTOM_PERIOD_LABEL,
  CUSTOM_PERIOD_VALUE,
  dateFieldValueOfDayKey,
  describePeriod,
  findPresetOfPeriod,
  isSamePeriod,
  readPeriodFromDateFields,
} from './period';
import type { Period, PeriodPreset, PeriodReading } from './period';

/** The elements of the period row. */
export type PeriodControlElements = Pick<
  PageElements,
  'periodRow' | 'periodSelect' | 'periodFromInput' | 'periodToInput' | 'periodNote'
>;

/**
 * Adds one entry to the period list.
 */
function addPeriodOption(periodSelect: HTMLSelectElement, value: string, label: string): void {
  const option = periodSelect.ownerDocument.createElement('option');
  option.value = value;
  option.textContent = label;
  periodSelect.append(option);
}

/**
 * Prepares the period row for a chat that has just been shown: lists its
 * ready-made periods followed by the entry for dates typed by hand, limits
 * the date fields to the days of the chat, and shows or hides the row.
 *
 * @param elements - The elements of the row.
 * @param presets - The ready-made periods of the chat; the first is the whole chat.
 * @param wholeChat - The period of the whole chat.
 * @param isOffered - Whether the chat is worth dividing; the row is hidden when not.
 */
export function offerPeriodChoices(
  elements: PeriodControlElements,
  presets: readonly PeriodPreset[],
  wholeChat: Period,
  isOffered: boolean,
): void {
  const { periodRow, periodSelect, periodFromInput, periodToInput } = elements;
  periodRow.hidden = !isOffered;

  periodSelect.replaceChildren();
  for (const preset of presets) {
    addPeriodOption(periodSelect, preset.value, preset.label);
  }
  addPeriodOption(periodSelect, CUSTOM_PERIOD_VALUE, CUSTOM_PERIOD_LABEL);

  const firstDay = dateFieldValueOfDayKey(wholeChat.firstDayKey);
  const lastDay = dateFieldValueOfDayKey(wholeChat.lastDayKey);
  for (const dateField of [periodFromInput, periodToInput]) {
    dateField.min = firstDay;
    dateField.max = lastDay;
  }
}

/**
 * Writes the days of a period into the two date fields.
 *
 * @param elements - The elements of the row.
 * @param period - The period to show.
 */
export function showPeriodInDateFields(elements: PeriodControlElements, period: Period): void {
  elements.periodFromInput.value = dateFieldValueOfDayKey(period.firstDayKey);
  elements.periodToInput.value = dateFieldValueOfDayKey(period.lastDayKey);
}

/**
 * Makes the row state the period the report is drawn for: the list shows the
 * ready-made period with exactly those days, or "Custom range" when there is
 * none; the date fields hold its first and last day; and the note names the
 * days unless the period is the whole chat.
 *
 * @param elements - The elements of the row.
 * @param presets - The ready-made periods of the chat.
 * @param period - The period on display.
 * @param wholeChat - The period of the whole chat.
 */
export function showDisplayedPeriod(
  elements: PeriodControlElements,
  presets: readonly PeriodPreset[],
  period: Period,
  wholeChat: Period,
): void {
  const { periodSelect, periodNote } = elements;
  periodSelect.value = findPresetOfPeriod(presets, period)?.value ?? CUSTOM_PERIOD_VALUE;
  showPeriodInDateFields(elements, period);

  const isWholeChat = isSamePeriod(period, wholeChat);
  periodNote.hidden = isWholeChat;
  periodNote.textContent = isWholeChat ? '' : describePeriod(period);
}

/**
 * Reads the period the reader has chosen: the ready-made period selected in
 * the list, or, for "Custom range", the dates of the two fields.
 *
 * @param elements - The elements of the row.
 * @param presets - The ready-made periods of the chat.
 * @param wholeChat - The period of the whole chat.
 * @returns The period, or the reason the dates cannot be used.
 */
export function readChosenPeriod(
  elements: PeriodControlElements,
  presets: readonly PeriodPreset[],
  wholeChat: Period,
): PeriodReading {
  const { periodSelect, periodFromInput, periodToInput } = elements;
  const chosenPreset = presets.find(
    (preset: PeriodPreset): boolean => preset.value === periodSelect.value,
  );
  if (chosenPreset !== undefined) {
    return { kind: 'period', period: chosenPreset.period };
  }
  return readPeriodFromDateFields(periodFromInput.value, periodToInput.value, wholeChat);
}

/**
 * Marks the dates as typed by hand, when the reader edits a date field.
 *
 * @param elements - The elements of the row.
 */
export function selectCustomPeriod(elements: PeriodControlElements): void {
  elements.periodSelect.value = CUSTOM_PERIOD_VALUE;
}
