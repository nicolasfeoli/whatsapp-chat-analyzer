/**
 * A small line chart of one measure over time, hand-written SVG. The section
 * "How things changed" draws several of them side by side.
 *
 * The drawing stretches to whatever width it is given, so nothing has to be
 * measured and nothing scrolls sideways: the SVG holds only lines and dots,
 * with strokes that keep their width, and every text (the two ends of the
 * scale to its left, the first and the last bucket under it, the legend) is
 * ordinary HTML around it.
 *
 * Over each bucket lies an invisible band that carries what its tooltip
 * says, so one pair of listeners per chart serves every point.
 */

import { isRecord } from '../../core/index';
import { escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { renderColourSwatch } from '../person-colours';
import { renderTooltipRow, renderTooltipTitle } from '../tooltip';
import type { Tooltip } from '../tooltip';
import { formatTrendValue } from '../trends';
import type { TrendChartData, TrendSeries, TrendUnit } from '../trends';

/** The CSS class of a chart; also used to find the charts again. */
const TREND_CHART_CLASS: SafeHtml = html`trend-chart`;

/** The CSS class of the invisible band over one bucket. */
const TREND_BAND_CLASS: SafeHtml = html`trend-band`;

/** The attribute of a band that names its bucket. */
const BUCKET_LABEL_ATTRIBUTE: SafeHtml = html`data-bucket-label`;

/** The attribute of a band that holds the rows of its tooltip, as JSON. */
const BUCKET_ROWS_ATTRIBUTE: SafeHtml = html`data-bucket-rows`;

/** The height of the drawing in its own units; values are placed between 0 (top) and this (bottom). */
const PLOT_HEIGHT = 100;

/** The room above and below the drawing, so a dot on the highest or lowest value is not cut off. */
const PLOT_MARGIN = 8;

/** A time is placed on a logarithmic scale, on which nothing is below one second. */
const SHORTEST_DURATION_ON_SCALE = 1000;

/** What a tooltip says when a bucket has no measured point. */
export const NOTHING_MEASURED_LABEL = 'Too little to measure';

/** One row of the tooltip of a bucket. */
export interface TrendTooltipRow {
  /** Whose value it is, or what it measures; untrusted. */
  readonly label: string;
  /** The value as it is shown. */
  readonly formattedValue: string;
  /** The CSS colour of the line it belongs to. */
  readonly colour: string;
}

/** What the tooltip of one bucket of a chart says. */
export interface TrendTooltipContent {
  /** The name of the bucket, e.g. `"Mar 2022"`. */
  readonly bucketLabel: string;
  /** One row per line that has a point in the bucket. */
  readonly rows: readonly TrendTooltipRow[];
}

/** The lowest and the highest value of a chart, which its scale runs between. */
interface TrendScale {
  readonly unit: TrendUnit;
  readonly lowest: number;
  readonly highest: number;
}

/**
 * Lists every measured value of a chart.
 */
function measuredValuesOf(series: readonly TrendSeries[]): number[] {
  return series.flatMap((line: TrendSeries): number[] =>
    line.values.filter((value: number | null): value is number => value !== null),
  );
}

/**
 * Works out the scale of a chart. Shares and averages run from zero to the
 * highest value. Times run from the shortest to the longest on a logarithmic
 * scale, because a chat holds replies of seconds and of hours and a straight
 * scale would press all but the slowest person flat against the bottom.
 */
function scaleOf(chart: TrendChartData): TrendScale {
  const values = measuredValuesOf(chart.series);
  const highest = Math.max(...values);
  if (chart.unit === 'duration') {
    return { unit: chart.unit, lowest: Math.min(...values), highest };
  }
  return { unit: chart.unit, lowest: 0, highest };
}

/**
 * Places a value between the bottom (0) and the top (1) of the scale.
 */
function fractionOnScale(value: number, scale: TrendScale): number {
  if (scale.unit !== 'duration') {
    return scale.highest === 0 ? 0 : value / scale.highest;
  }
  const lowestLog = Math.log(Math.max(scale.lowest, SHORTEST_DURATION_ON_SCALE));
  const highestLog = Math.log(Math.max(scale.highest, SHORTEST_DURATION_ON_SCALE));
  if (highestLog === lowestLog) {
    return 1 / 2;
  }
  const valueLog = Math.log(Math.max(value, SHORTEST_DURATION_ON_SCALE));
  return (valueLog - lowestLog) / (highestLog - lowestLog);
}

/**
 * Writes the place of a point as SVG coordinates: the position of its bucket
 * across, and its value down from the top.
 */
function coordinatesOf(bucketIndex: number, value: number, scale: TrendScale): string {
  const y = PLOT_HEIGHT - fractionOnScale(value, scale) * PLOT_HEIGHT;
  return `${String(bucketIndex)} ${y.toFixed(2)}`;
}

/**
 * Draws one line: a stroke through each run of neighbouring measured points,
 * and a dot on every point, so a point between two gaps is still seen.
 */
function renderLine(line: TrendSeries, scale: TrendScale): SafeHtml {
  let strokePath = '';
  let dotPath = '';
  let isInsideRun = false;
  for (const [bucketIndex, value] of line.values.entries()) {
    if (value === null) {
      isInsideRun = false;
      continue;
    }
    const coordinates = coordinatesOf(bucketIndex, value, scale);
    strokePath += `${isInsideRun ? 'L' : 'M'}${coordinates}`;
    dotPath += `M${coordinates}h0`;
    isInsideRun = true;
  }
  const colour = escapeHtml(line.colour);
  return html`<path class="trend-line" d="${escapeHtml(strokePath)}" stroke="${colour}"/><path class="trend-dots" d="${escapeHtml(dotPath)}" stroke="${colour}"/>`;
}

/**
 * Collects what the tooltip of one bucket says.
 *
 * @param chart - The chart.
 * @param bucketIndex - The position of the bucket.
 * @returns The name of the bucket and one row per line with a point in it.
 */
export function collectTrendTooltipContent(
  chart: TrendChartData,
  bucketIndex: number,
): TrendTooltipContent {
  const rows: TrendTooltipRow[] = [];
  for (const line of chart.series) {
    const value = line.values[bucketIndex];
    if (value !== null && value !== undefined) {
      rows.push({
        label: line.label,
        formattedValue: formatTrendValue(value, chart.unit, chart.timestampResolution),
        colour: line.colour,
      });
    }
  }
  return { bucketLabel: chart.bucketLabels[bucketIndex] ?? '', rows };
}

/**
 * Draws the invisible band over one bucket, which carries its tooltip.
 */
function renderBand(chart: TrendChartData, bucketIndex: number): SafeHtml {
  const content = collectTrendTooltipContent(chart, bucketIndex);
  const bandTop = -PLOT_MARGIN;
  const bandHeight = PLOT_HEIGHT + 2 * PLOT_MARGIN;
  const bandLeft = escapeHtml((bucketIndex - 1 / 2).toFixed(1));
  const label = escapeHtml(content.bucketLabel);
  const rows = escapeHtml(JSON.stringify(content.rows));
  return html`<rect class="${TREND_BAND_CLASS}" x="${bandLeft}" y="${bandTop}" width="1" height="${bandHeight}" ${BUCKET_LABEL_ATTRIBUTE}="${label}" ${BUCKET_ROWS_ATTRIBUTE}="${rows}"/>`;
}

/**
 * Draws the legend of a chart with several lines: a swatch and a name each.
 * A chart with one line needs none; its heading says what the line is.
 */
function renderLegend(series: readonly TrendSeries[]): SafeHtml {
  if (series.length < 2) {
    return html``;
  }
  const entriesHtml = joinHtml(
    series.map(
      (line: TrendSeries): SafeHtml =>
        html`<span>${renderColourSwatch(line.colour)}${escapeHtml(line.label)}</span>`,
    ),
  );
  return html`<div class="trend-legend">${entriesHtml}</div>`;
}

/**
 * Writes the lower end of the scale: the shortest time of a chart of times,
 * and a plain zero for the others.
 */
function formatLowestOfScale(scale: TrendScale, chart: TrendChartData): string {
  switch (scale.unit) {
    case 'duration':
      return formatTrendValue(scale.lowest, chart.unit, chart.timestampResolution);
    case 'share':
      return '0%';
    case 'words':
      return '0';
  }
}

/**
 * Draws one chart: its heading, its legend, the lines between the two ends
 * of its scale, the first and the last bucket under them, and the sentence
 * that reads it.
 *
 * @param chart - The chart, from `buildTrendCharts`.
 * @returns A `<figure class="trend-chart">` element as markup.
 */
export function renderTrendChart(chart: TrendChartData): SafeHtml {
  const scale = scaleOf(chart);
  const bucketCount = chart.bucketLabels.length;
  const viewBox = escapeHtml(
    `${String(-1 / 2)} ${String(-PLOT_MARGIN)} ${String(bucketCount)} ${String(PLOT_HEIGHT + 2 * PLOT_MARGIN)}`,
  );
  const linesHtml = joinHtml(
    chart.series.map((line: TrendSeries): SafeHtml => renderLine(line, scale)),
  );
  const bandsHtml = joinHtml(
    chart.bucketLabels.map((_label: string, bucketIndex: number): SafeHtml =>
      renderBand(chart, bucketIndex),
    ),
  );

  const firstLabel = chart.bucketLabels[0] ?? '';
  const lastLabel = chart.bucketLabels[bucketCount - 1] ?? '';
  const description = `${chart.title} from ${firstLabel} to ${lastLabel}. ${chart.reading ?? 'No clear change between the start and the end.'}`;
  const highestHtml = escapeHtml(
    formatTrendValue(scale.highest, chart.unit, chart.timestampResolution),
  );
  const lowestHtml = escapeHtml(formatLowestOfScale(scale, chart));
  const readingHtml =
    chart.reading === null
      ? html``
      : html`<p class="trend-reading">${escapeHtml(chart.reading)}</p>`;

  const scaleHtml = html`<div class="trend-scale"><span>${highestHtml}</span><span>${lowestHtml}</span></div>`;
  const svgHtml = html`<svg class="trend-svg" viewBox="${viewBox}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(description)}">${linesHtml}${bandsHtml}</svg>`;
  const axisHtml = html`<div class="trend-axis"><span>${escapeHtml(firstLabel)}</span><span>${escapeHtml(lastLabel)}</span></div>`;
  const plotHtml = html`<div class="trend-plot">${scaleHtml}${svgHtml}${axisHtml}</div>`;
  return html`<figure class="${TREND_CHART_CLASS}" data-trend-chart="${escapeHtml(chart.kind)}"><figcaption><h3>${escapeHtml(chart.title)}</h3></figcaption>${renderLegend(chart.series)}${plotHtml}${readingHtml}</figure>`;
}

/**
 * Tells whether a value read back from an attribute is a row of a tooltip.
 */
function isTrendTooltipRow(value: unknown): value is TrendTooltipRow {
  return (
    isRecord(value) &&
    typeof value['label'] === 'string' &&
    typeof value['formattedValue'] === 'string' &&
    typeof value['colour'] === 'string'
  );
}

/**
 * Reads the rows of a tooltip back from the attribute of a band.
 */
function readTrendTooltipRows(serialisedRows: string | null): TrendTooltipRow[] {
  try {
    const rows: unknown = JSON.parse(serialisedRows ?? '');
    return Array.isArray(rows) ? rows.filter(isTrendTooltipRow) : [];
  } catch {
    return [];
  }
}

/**
 * Finds the bucket of the band an event happened on.
 *
 * @param eventTarget - What the pointer was over.
 * @returns What the tooltip of that bucket says, or `null` when the pointer
 *   was not over a band.
 */
export function findTrendBucketAt(eventTarget: EventTarget | null): TrendTooltipContent | null {
  if (!(eventTarget instanceof Element)) {
    return null;
  }
  const band = eventTarget.closest(`.${TREND_BAND_CLASS}`);
  if (band === null) {
    return null;
  }
  return {
    bucketLabel: band.getAttribute(BUCKET_LABEL_ATTRIBUTE) ?? '',
    rows: readTrendTooltipRows(band.getAttribute(BUCKET_ROWS_ATTRIBUTE)),
  };
}

/**
 * Builds the tooltip of one bucket.
 *
 * @param content - The name of the bucket and its rows; the labels are untrusted.
 * @returns The tooltip content as markup.
 */
export function renderTrendTooltip(content: TrendTooltipContent): SafeHtml {
  const titleHtml = renderTooltipTitle(escapeHtml(content.bucketLabel));
  if (content.rows.length === 0) {
    return html`${titleHtml}${renderTooltipRow(escapeHtml(NOTHING_MEASURED_LABEL), html``)}`;
  }
  const rowsHtml = joinHtml(
    content.rows.map((row: TrendTooltipRow): SafeHtml =>
      renderTooltipRow(
        html`${renderColourSwatch(row.colour)}${escapeHtml(row.label)}`,
        escapeHtml(row.formattedValue),
      ),
    ),
  );
  return html`${titleHtml}${rowsHtml}`;
}

/**
 * Connects the tooltip to the charts inside a container. Two listeners per
 * chart serve all of its buckets.
 *
 * @param container - The element the report was rendered into.
 * @param tooltip - The shared tooltip.
 */
export function attachTrendChartTooltips(container: ParentNode, tooltip: Tooltip): void {
  const chartElements = container.querySelectorAll<HTMLElement>(`.${TREND_CHART_CLASS}`);
  for (const chartElement of chartElements) {
    chartElement.addEventListener('pointermove', (event: PointerEvent): void => {
      const content = findTrendBucketAt(event.target);
      if (content === null) {
        tooltip.hide();
        return;
      }
      tooltip.show(renderTrendTooltip(content), event);
    });
    chartElement.addEventListener('pointerleave', (): void => {
      tooltip.hide();
    });
  }
}
