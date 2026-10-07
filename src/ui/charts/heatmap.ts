/**
 * Draws the weekday-by-hour heatmap: seven rows (Monday first) of twenty-four
 * squares, each coloured by how many messages were sent in that hour slot.
 */

import { HOURS_PER_DAY, MINUTES_PER_HOUR } from '../../core/index';
import type { WeekdayHourHeatmap } from '../../core/index';
import { EMPTY_HTML, escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { formatWholeNumber, padToTwoDigits, weekdayNameOf } from '../text-formatting';
import { renderTooltipRow, renderTooltipTitle } from '../tooltip';
import type { Tooltip } from '../tooltip';

/*
 * The class and attribute names below are written with the `html` tag because
 * they are placed in markup; being strings, they also serve to find the
 * squares again and to read their attributes back.
 */

/** The CSS class of the grid that holds the labels and the squares. */
const HEATMAP_CLASS: SafeHtml = html`heatmap`;

/** The CSS class of one square; also how the squares are found to attach their tooltips. */
const HEATMAP_CELL_CLASS: SafeHtml = html`heatmap-cell`;

/** The attribute in which a square carries the row it is in: 0 for Monday up to 6 for Sunday. */
const WEEKDAY_INDEX_ATTRIBUTE: SafeHtml = html`data-weekday-index`;

/** The attribute in which a square carries its hour of the day, 0 to 23. */
const HOUR_ATTRIBUTE: SafeHtml = html`data-hour`;

/** The attribute in which a square carries how many messages were sent in its slot. */
const MESSAGE_COUNT_ATTRIBUTE: SafeHtml = html`data-message-count`;

/** Only every third hour is labelled above the grid (00, 03, 06 ...); more would crowd. */
const HOUR_LABEL_INTERVAL = 3;

/** Row labels show the first three letters of the weekday ("Mon"). */
const WEEKDAY_LABEL_LENGTH = 3;

/**
 * A slot with a single message is already tinted this many percent towards the
 * strongest colour, so it is clearly told apart from an empty slot.
 */
const FAINTEST_TINT_PERCENT = 6;

/** The remaining range of the tint, spread linearly up to the busiest slot. */
const TINT_RANGE_PERCENT = 94;

/** The last minute of an hour, for the "20:00 to 20:59" wording of the tooltip. */
const LAST_MINUTE_OF_HOUR = MINUTES_PER_HOUR - 1;

/**
 * The count the tints are scaled against when the heatmap has no messages at
 * all, so the scaling never divides by zero.
 */
const SMALLEST_TINT_SCALE = 1;

/** One hour slot of the week together with its message count. */
export interface HeatmapSlot {
  /** 0 for Monday up to 6 for Sunday. */
  readonly weekdayIndex: number;
  /** The hour of the day, 0 to 23. */
  readonly hour: number;
  /** Messages sent in that slot over the whole chat. */
  readonly messageCount: number;
}

/**
 * Finds the hour slot with the most messages; the earliest one wins a tie.
 *
 * @param heatmap - Message counts by weekday (Monday first) and hour.
 * @returns The busiest slot, or `null` for a heatmap without any cells.
 */
export function findBusiestSlot(heatmap: WeekdayHourHeatmap): HeatmapSlot | null {
  let busiestSlot: HeatmapSlot | null = null;
  for (const [weekdayIndex, hourCounts] of heatmap.entries()) {
    for (const [hour, messageCount] of hourCounts.entries()) {
      if (busiestSlot === null || messageCount > busiestSlot.messageCount) {
        busiestSlot = { weekdayIndex, hour, messageCount };
      }
    }
  }
  return busiestSlot;
}

/**
 * Finds the highest count in the heatmap.
 *
 * @param heatmap - Message counts by weekday and hour.
 * @returns The count of the busiest slot, and at least 1 so it can be divided by.
 */
export function findBusiestSlotCount(heatmap: WeekdayHourHeatmap): number {
  const busiestSlot = findBusiestSlot(heatmap);
  if (busiestSlot === null) {
    return SMALLEST_TINT_SCALE;
  }
  return Math.max(busiestSlot.messageCount, SMALLEST_TINT_SCALE);
}

/**
 * Draws the label above one column: the hour for every third column, nothing
 * for the columns in between.
 */
function renderHourLabel(hour: number): SafeHtml {
  const isLabelled = hour % HOUR_LABEL_INTERVAL === 0;
  if (!isLabelled) {
    return html`<div class="hour-label"></div>`;
  }
  return html`<div class="hour-label">${escapeHtml(padToTwoDigits(hour))}</div>`;
}

/**
 * Draws the row of hour labels above the grid, after the empty corner cell.
 */
function renderHourLabels(): SafeHtml {
  const cornerCellHtml = html`<div></div>`;
  const labels: SafeHtml[] = [cornerCellHtml];
  for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
    labels.push(renderHourLabel(hour));
  }
  return joinHtml(labels);
}

/**
 * Writes the `style` attribute that tints a square, with its leading space.
 * An empty slot gets no attribute and keeps the background of the stylesheet.
 */
function renderTintAttribute(messageCount: number, busiestSlotCount: number): SafeHtml {
  if (messageCount <= 0) {
    return EMPTY_HTML;
  }
  const tintPercent =
    FAINTEST_TINT_PERCENT + (TINT_RANGE_PERCENT * messageCount) / busiestSlotCount;
  const roundedTintPercent = escapeHtml(tintPercent.toFixed(0));
  return html` style="background:color-mix(in oklab,var(--heat-hi) ${roundedTintPercent}%,var(--heat-lo))"`;
}

/**
 * Draws one square. The counts travel in `data-` attributes so the tooltip can
 * read them back without a lookup table.
 */
function renderHeatmapCell(slot: HeatmapSlot, busiestSlotCount: number): SafeHtml {
  const tintAttribute = renderTintAttribute(slot.messageCount, busiestSlotCount);
  return html`<div class="${HEATMAP_CELL_CLASS}" ${WEEKDAY_INDEX_ATTRIBUTE}="${slot.weekdayIndex}" ${HOUR_ATTRIBUTE}="${slot.hour}" ${MESSAGE_COUNT_ATTRIBUTE}="${slot.messageCount}"${tintAttribute}></div>`;
}

/**
 * Draws one weekday: its label and its twenty-four squares.
 */
function renderHeatmapRow(
  hourCounts: readonly number[],
  weekdayIndex: number,
  busiestSlotCount: number,
): SafeHtml {
  const weekdayLabel = weekdayNameOf(weekdayIndex).slice(0, WEEKDAY_LABEL_LENGTH);
  const cellsHtml = joinHtml(
    hourCounts.map((messageCount: number, hour: number): SafeHtml =>
      renderHeatmapCell({ weekdayIndex, hour, messageCount }, busiestSlotCount),
    ),
  );
  return html`<div class="weekday-label">${escapeHtml(weekdayLabel)}</div>${cellsHtml}`;
}

/**
 * Draws the heatmap grid.
 *
 * @param heatmap - Message counts by weekday (Monday first) and hour.
 * @returns A `<div class="heatmap">` element as markup.
 */
export function renderHeatmapGrid(heatmap: WeekdayHourHeatmap): SafeHtml {
  const busiestSlotCount = findBusiestSlotCount(heatmap);
  const rowsHtml = joinHtml(
    heatmap.map((hourCounts: readonly number[], weekdayIndex: number): SafeHtml =>
      renderHeatmapRow(hourCounts, weekdayIndex, busiestSlotCount),
    ),
  );
  return html`<div class="${HEATMAP_CLASS}">${renderHourLabels()}${rowsHtml}</div>`;
}

/**
 * Builds the tooltip for one square.
 *
 * @param slot - The weekday, the hour and the message count of the square.
 * @returns The tooltip content as markup.
 */
export function renderHeatmapTooltip(slot: HeatmapSlot): SafeHtml {
  const paddedHour = padToTwoDigits(slot.hour);
  const title = `${weekdayNameOf(slot.weekdayIndex)}, ${paddedHour}:00 to ${paddedHour}:${LAST_MINUTE_OF_HOUR}`;
  const formattedCount = formatWholeNumber(slot.messageCount);

  const titleHtml = renderTooltipTitle(escapeHtml(title));
  const rowHtml = renderTooltipRow(html`Messages`, escapeHtml(formattedCount));
  return html`${titleHtml}${rowHtml}`;
}

/**
 * Reads back the slot a square was drawn for from its `data-` attributes.
 */
function readHeatmapSlot(cell: HTMLElement): HeatmapSlot {
  return {
    weekdayIndex: Number(cell.getAttribute(WEEKDAY_INDEX_ATTRIBUTE)),
    hour: Number(cell.getAttribute(HOUR_ATTRIBUTE)),
    messageCount: Number(cell.getAttribute(MESSAGE_COUNT_ATTRIBUTE)),
  };
}

/**
 * Makes one square show its tooltip while the pointer is over it.
 */
function attachHeatmapCellEvents(cell: HTMLElement, tooltip: Tooltip): void {
  const slot = readHeatmapSlot(cell);

  cell.addEventListener('pointermove', (event: PointerEvent): void => {
    tooltip.show(renderHeatmapTooltip(slot), event);
  });
  cell.addEventListener('pointerleave', (): void => {
    tooltip.hide();
  });
}

/**
 * Connects the tooltip to every square of the heatmaps inside a container.
 *
 * @param container - The element the report was rendered into.
 * @param tooltip - The shared tooltip.
 */
export function attachHeatmapTooltips(container: ParentNode, tooltip: Tooltip): void {
  const cells = container.querySelectorAll<HTMLElement>(`.${HEATMAP_CLASS} .${HEATMAP_CELL_CLASS}`);
  for (const cell of cells) {
    attachHeatmapCellEvents(cell, tooltip);
  }
}
