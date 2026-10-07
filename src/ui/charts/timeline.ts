/**
 * Draws the timeline: a stacked bar chart of messages over time, as SVG.
 *
 * The chart is redrawn whenever the page width changes, because bar widths and
 * the number of axis labels depend on the width. Drawing is a pure function
 * from the bucket data and a width to an SVG string; attaching the pointer
 * events is a separate step.
 */

import { EMPTY_HTML, escapeHtml, html, joinHtml, setInnerHtml } from '../html';
import type { SafeHtml } from '../html';
import { renderColourSwatch } from '../person-colours';
import { formatWholeNumber } from '../text-formatting';
import { renderTooltipRow, renderTooltipTitle } from '../tooltip';
import type { Tooltip } from '../tooltip';
import { formatBucketAxisLabel, formatBucketTooltipTitle } from './timeline-buckets';
import type { TimelineBucket, TimelineData, TimelineSeries } from './timeline-buckets';

/*
 * The class and attribute names below are written with the `html` tag because
 * they are placed in markup; being strings, they also serve to find the hover
 * bands again, to read their attribute back and to toggle their highlight.
 */

/** The CSS class of the invisible full-height rectangle over each bar that receives pointer events. */
const HOVER_BAND_CLASS: SafeHtml = html`hover-band`;

/** The CSS class that tints the hover band of the bar under the pointer. */
const HIGHLIGHTED_HOVER_BAND_CLASS = 'highlighted';

/** The attribute in which a hover band carries the position of its bar among the buckets. */
const BUCKET_INDEX_ATTRIBUTE: SafeHtml = html`data-bucket-index`;

/** The chart is never drawn narrower than this, even in a very narrow window. */
const MINIMUM_CHART_WIDTH_IN_PIXELS = 300;

/** The fixed height of the chart. */
const CHART_HEIGHT_IN_PIXELS = 250;

/** Room on the left for the count labels of the vertical axis. */
const LEFT_MARGIN_IN_PIXELS = 44;

/** Room on the right so the last date label is not cut off. */
const RIGHT_MARGIN_IN_PIXELS = 26;

/** Room above the tallest bar. */
const TOP_MARGIN_IN_PIXELS = 10;

/** Room below the bars for the date labels. */
const BOTTOM_MARGIN_IN_PIXELS = 24;

/** Bars wider than this get a two pixel gap between them. */
const BAR_WIDTH_FOR_WIDE_GAP_IN_PIXELS = 6;

/** Bars wider than this (but not wide) get a one pixel gap; narrower bars touch. */
const BAR_WIDTH_FOR_NARROW_GAP_IN_PIXELS = 3;

/** The gap between wide bars. */
const WIDE_GAP_IN_PIXELS = 2;

/** The gap between medium bars. */
const NARROW_GAP_IN_PIXELS = 1;

/** A bar is always at least this wide, so it stays visible however many there are. */
const MINIMUM_BAR_WIDTH_IN_PIXELS = 1;

/** A date label needs about this much horizontal room to not touch its neighbour. */
const DATE_LABEL_SPACING_IN_PIXELS = 72;

/**
 * At least this many date labels are drawn, however narrow the chart. With
 * today's minimum chart width and margins there is always room for three, so
 * this floor never binds; it is kept so that a later change to those numbers
 * cannot leave the axis with a single label, or none.
 */
const MINIMUM_DATE_LABEL_COUNT = 2;

/** Distance from the bottom edge of the chart to the baseline of the date labels. */
const DATE_LABEL_BASELINE_OFFSET_IN_PIXELS = 7;

/** Distance from the left margin to the right end of the count labels. */
const COUNT_LABEL_GAP_IN_PIXELS = 6;

/** Count labels are shifted down by this much so their middle sits on the grid line. */
const COUNT_LABEL_VERTICAL_SHIFT_IN_PIXELS = 4;

/** Counts from a thousand up are abbreviated on the axis ("2k"). */
const AXIS_THOUSANDS_THRESHOLD = 1000;

/**
 * Added to the axis maximum when stepping through the grid lines, so that
 * floating-point drift in the repeated addition cannot drop the top line.
 */
const GRID_LINE_ROUNDING_TOLERANCE = 1e-9;

/** The white line separating two stacked layers is this thick. */
const LAYER_SEPARATOR_IN_PIXELS = 1.5;

/** Layers thinner than this get no separator; it would eat most of the layer. */
const THINNEST_LAYER_WITH_SEPARATOR_IN_PIXELS = 3;

/** The top corners of each bar are rounded by at most this radius. */
const LARGEST_CORNER_RADIUS_IN_PIXELS = 3;

/** A layer is drawn at least this tall, so a single message is still a visible sliver. */
const MINIMUM_LAYER_HEIGHT_IN_PIXELS = 0.5;

/** Up to twice the magnitude, the axis steps in halves of the magnitude (0.5, 1, 1.5 ...). */
const LEADING_VALUE_FOR_HALF_STEPS = 2;

/** Up to five times the magnitude, the axis steps in whole magnitudes; beyond, in twos. */
const LEADING_VALUE_FOR_WHOLE_STEPS = 5;

/** Grid lines half a magnitude apart (5, 10, 15 ... for a tallest bar of 20). */
const HALF_STEP_FACTOR = 0.5;

/** Grid lines one magnitude apart (10, 20, 30 ... for a tallest bar of 40). */
const WHOLE_STEP_FACTOR = 1;

/** Grid lines two magnitudes apart (20, 40, 60 ... for a tallest bar of 80). */
const DOUBLE_STEP_FACTOR = 2;

/** The scale of the vertical axis. */
export interface AxisScale {
  /** The distance between two grid lines, in messages. */
  readonly step: number;
  /** The value at the top of the axis: the smallest multiple of the step that fits the data. */
  readonly maximum: number;
}

/** The measurements shared by every part of one drawing of the chart. */
interface TimelineLayout {
  readonly chartWidth: number;
  /** The horizontal room each bucket gets, including its gap. */
  readonly bucketWidth: number;
  /** The empty space between two neighbouring bars. */
  readonly gapWidth: number;
  /** The width of the drawn bar. */
  readonly barWidth: number;
  readonly axisScale: AxisScale;
  /** Every how many buckets a date label is drawn. */
  readonly dateLabelInterval: number;
}

/**
 * Chooses a round step and maximum for the vertical axis.
 *
 * @param largestValue - The tallest bar, in messages.
 * @returns A step of 0.5, 1 or 2 times a power of ten, and the first multiple
 *   of it at or above the largest value.
 */
export function chooseAxisScale(largestValue: number): AxisScale {
  const valueForMagnitude = largestValue === 0 ? 1 : largestValue;
  const magnitude = Math.pow(10, Math.floor(Math.log10(valueForMagnitude)));
  const leadingValue = largestValue / magnitude;

  let stepFactor = DOUBLE_STEP_FACTOR;
  if (leadingValue <= LEADING_VALUE_FOR_HALF_STEPS) {
    stepFactor = HALF_STEP_FACTOR;
  } else if (leadingValue <= LEADING_VALUE_FOR_WHOLE_STEPS) {
    stepFactor = WHOLE_STEP_FACTOR;
  }

  const step = stepFactor * magnitude;
  const maximum = Math.ceil(largestValue / step) * step;
  return { step, maximum };
}

/**
 * Decides how much empty space to leave between bars of a given width.
 */
function chooseGapWidth(bucketWidth: number): number {
  if (bucketWidth > BAR_WIDTH_FOR_WIDE_GAP_IN_PIXELS) {
    return WIDE_GAP_IN_PIXELS;
  }
  if (bucketWidth > BAR_WIDTH_FOR_NARROW_GAP_IN_PIXELS) {
    return NARROW_GAP_IN_PIXELS;
  }
  return 0;
}

/**
 * Works out the measurements of the chart for a given width.
 */
function computeTimelineLayout(timeline: TimelineData, availableWidth: number): TimelineLayout {
  const chartWidth = Math.max(MINIMUM_CHART_WIDTH_IN_PIXELS, availableWidth);
  const plotWidth = chartWidth - LEFT_MARGIN_IN_PIXELS - RIGHT_MARGIN_IN_PIXELS;
  const bucketCount = timeline.buckets.length;
  const bucketWidth = plotWidth / bucketCount;
  const gapWidth = chooseGapWidth(bucketWidth);
  const barWidth = Math.max(MINIMUM_BAR_WIDTH_IN_PIXELS, bucketWidth - gapWidth);

  const bucketTotals = timeline.buckets.map(
    (bucket: TimelineBucket): number => bucket.totalMessageCount,
  );
  const axisScale = chooseAxisScale(Math.max(...bucketTotals, 1));

  const dateLabelsThatFit = Math.max(
    MINIMUM_DATE_LABEL_COUNT,
    Math.floor(plotWidth / DATE_LABEL_SPACING_IN_PIXELS),
  );
  const dateLabelInterval = Math.max(1, Math.ceil(bucketCount / dateLabelsThatFit));

  return { chartWidth, bucketWidth, gapWidth, barWidth, axisScale, dateLabelInterval };
}

/**
 * Converts a message count to a vertical pixel position. Zero is at the bottom
 * of the plot area and the axis maximum at the top.
 */
function verticalPositionOf(messageCount: number, axisScale: AxisScale): number {
  const plotHeight = CHART_HEIGHT_IN_PIXELS - TOP_MARGIN_IN_PIXELS - BOTTOM_MARGIN_IN_PIXELS;
  return TOP_MARGIN_IN_PIXELS + plotHeight * (1 - messageCount / axisScale.maximum);
}

/**
 * Writes a count for the vertical axis, abbreviating thousands.
 */
function formatAxisCount(messageCount: number): string {
  if (messageCount >= AXIS_THOUSANDS_THRESHOLD) {
    return `${messageCount / AXIS_THOUSANDS_THRESHOLD}k`;
  }
  return String(messageCount);
}

/**
 * Draws the horizontal grid lines and the count labels beside them.
 */
function renderGridLines(layout: TimelineLayout): SafeHtml {
  const { axisScale, chartWidth } = layout;
  const lineEnd = chartWidth - RIGHT_MARGIN_IN_PIXELS;
  const labelX = LEFT_MARGIN_IN_PIXELS - COUNT_LABEL_GAP_IN_PIXELS;
  const lastGridValue = axisScale.maximum + GRID_LINE_ROUNDING_TOLERANCE;

  const gridParts: SafeHtml[] = [];
  for (let gridValue = 0; gridValue <= lastGridValue; gridValue += axisScale.step) {
    const y = verticalPositionOf(gridValue, axisScale);
    const labelY = y + COUNT_LABEL_VERTICAL_SHIFT_IN_PIXELS;
    const labelText = escapeHtml(formatAxisCount(gridValue));
    gridParts.push(
      html`<line class="grid-line" x1="${LEFT_MARGIN_IN_PIXELS}" x2="${lineEnd}" y1="${y}" y2="${y}"/>`,
      html`<text class="axis-text" x="${labelX}" y="${labelY}" text-anchor="end">${labelText}</text>`,
    );
  }
  return joinHtml(gridParts);
}

/**
 * Finds the topmost layer of a bar: the last series that has any messages.
 *
 * @returns The series index, or `null` for a bar without messages.
 */
function findTopmostSeriesIndex(messageCountsBySeries: readonly number[]): number | null {
  let topmostSeriesIndex: number | null = null;
  for (const [seriesIndex, messageCount] of messageCountsBySeries.entries()) {
    if (messageCount > 0) {
      topmostSeriesIndex = seriesIndex;
    }
  }
  return topmostSeriesIndex;
}

/**
 * Draws the topmost layer of a bar as a path with rounded top corners.
 *
 * Unlike {@link renderSquareLayer}, no minimum height is applied here. The
 * corner radius already shrinks with the layer, so a very thin top layer is
 * drawn as a flat sliver of its true height, and stretching it would push the
 * top of the bar above the value it stands for.
 */
function renderRoundedLayer(
  colour: string,
  x: number,
  topY: number,
  layerHeight: number,
  barWidth: number,
): SafeHtml {
  const cornerRadius = Math.min(LARGEST_CORNER_RADIUS_IN_PIXELS, layerHeight, barWidth / 2);
  const bottomY = topY + layerHeight;
  const rightX = x + barWidth;
  const leftCurveEndX = x + cornerRadius;
  const rightCurveStartX = rightX - cornerRadius;
  const curveBottomY = topY + cornerRadius;

  const pathCommands = html`M${x},${bottomY}V${curveBottomY}Q${x},${topY} ${leftCurveEndX},${topY}H${rightCurveStartX}Q${rightX},${topY} ${rightX},${curveBottomY}V${bottomY}Z`;
  return html`<path fill="${escapeHtml(colour)}" d="${pathCommands}"/>`;
}

/**
 * Draws a layer that has another layer on top of it, as a plain rectangle.
 * It is drawn at least half a pixel tall, so a single message among thousands
 * still leaves a visible sliver of its colour.
 */
function renderSquareLayer(
  colour: string,
  x: number,
  topY: number,
  layerHeight: number,
  barWidth: number,
): SafeHtml {
  const drawnHeight = Math.max(MINIMUM_LAYER_HEIGHT_IN_PIXELS, layerHeight);
  return html`<rect fill="${escapeHtml(colour)}" x="${x}" y="${topY}" width="${barWidth}" height="${drawnHeight}"/>`;
}

/**
 * Decides how much of a layer's height is given up to the thin line of
 * background that keeps it apart from the layer below.
 *
 * @param fullHeight - The height the layer's messages stand for, in pixels.
 * @param hasLayerBelow - Whether another layer lies under this one.
 * @param layout - The measurements of the chart.
 * @returns The height of the separator, or 0 when the layer gets none.
 */
function chooseSeparatorHeight(
  fullHeight: number,
  hasLayerBelow: boolean,
  layout: TimelineLayout,
): number {
  const isTallEnoughForSeparator = fullHeight > THINNEST_LAYER_WITH_SEPARATOR_IN_PIXELS;
  const hasGapBetweenBars = layout.gapWidth > 0;
  const needsSeparator = hasLayerBelow && isTallEnoughForSeparator && hasGapBetweenBars;
  if (!needsSeparator) {
    return 0;
  }
  return LAYER_SEPARATOR_IN_PIXELS;
}

/**
 * Draws the stacked layers of one bar, bottom to top.
 */
function renderBarLayers(
  bucket: TimelineBucket,
  allSeries: readonly TimelineSeries[],
  x: number,
  layout: TimelineLayout,
): SafeHtml {
  /* Only counts that have a series are drawn, so every layer is certain to have a colour. */
  const messageCountsOfSeries = bucket.messageCountsBySeries.slice(0, allSeries.length);
  const topmostSeriesIndex = findTopmostSeriesIndex(messageCountsOfSeries);
  const layers: SafeHtml[] = [];
  let messagesBelow = 0;

  for (const [seriesIndex, series] of allSeries.entries()) {
    const messageCount = messageCountsOfSeries[seriesIndex] ?? 0;
    if (messageCount === 0) {
      continue;
    }
    const topY = verticalPositionOf(messagesBelow + messageCount, layout.axisScale);
    const bottomY = verticalPositionOf(messagesBelow, layout.axisScale);
    const fullHeight = bottomY - topY;

    const hasLayerBelow = messagesBelow > 0;
    const separatorHeight = chooseSeparatorHeight(fullHeight, hasLayerBelow, layout);
    const layerHeight = fullHeight - separatorHeight;

    messagesBelow += messageCount;

    if (seriesIndex === topmostSeriesIndex) {
      layers.push(renderRoundedLayer(series.colour, x, topY, layerHeight, layout.barWidth));
    } else {
      layers.push(renderSquareLayer(series.colour, x, topY, layerHeight, layout.barWidth));
    }
  }

  return joinHtml(layers);
}

/**
 * Draws the date label under a bar, centred on it.
 */
function renderDateLabel(
  timeline: TimelineData,
  bucket: TimelineBucket,
  barX: number,
  layout: TimelineLayout,
): SafeHtml {
  const labelX = barX + layout.barWidth / 2;
  const labelY = CHART_HEIGHT_IN_PIXELS - DATE_LABEL_BASELINE_OFFSET_IN_PIXELS;
  const labelText = escapeHtml(formatBucketAxisLabel(bucket.start, timeline.granularity));
  return html`<text class="axis-text" x="${labelX}" y="${labelY}" text-anchor="middle">${labelText}</text>`;
}

/**
 * Draws one bucket: its layers, its date label when it is due one, and the
 * invisible full-height band that receives pointer events.
 */
function renderBucket(
  timeline: TimelineData,
  bucket: TimelineBucket,
  bucketIndex: number,
  layout: TimelineLayout,
): SafeHtml {
  const bandX = LEFT_MARGIN_IN_PIXELS + bucketIndex * layout.bucketWidth;
  const barX = bandX + layout.gapWidth / 2;
  const layersHtml = renderBarLayers(bucket, timeline.series, barX, layout);

  const isDueDateLabel = bucketIndex % layout.dateLabelInterval === 0;
  const dateLabelHtml = isDueDateLabel
    ? renderDateLabel(timeline, bucket, barX, layout)
    : EMPTY_HTML;

  const bandHeight = CHART_HEIGHT_IN_PIXELS - TOP_MARGIN_IN_PIXELS - BOTTOM_MARGIN_IN_PIXELS;
  const hoverBandHtml = html`<rect class="${HOVER_BAND_CLASS}" ${BUCKET_INDEX_ATTRIBUTE}="${bucketIndex}" x="${bandX}" y="${TOP_MARGIN_IN_PIXELS}" width="${layout.bucketWidth}" height="${bandHeight}"/>`;
  return html`${layersHtml}${dateLabelHtml}${hoverBandHtml}`;
}

/**
 * Draws the whole timeline as an SVG element.
 *
 * @param timeline - The series and buckets to draw.
 * @param availableWidth - The width of the container, in pixels.
 * @returns The `<svg>` element as markup.
 */
export function renderTimelineSvg(timeline: TimelineData, availableWidth: number): SafeHtml {
  const layout = computeTimelineLayout(timeline, availableWidth);
  const bucketsHtml = joinHtml(
    timeline.buckets.map((bucket: TimelineBucket, bucketIndex: number): SafeHtml =>
      renderBucket(timeline, bucket, bucketIndex, layout),
    ),
  );

  const openingTag = html`<svg viewBox="0 0 ${layout.chartWidth} ${CHART_HEIGHT_IN_PIXELS}" role="img" aria-label="Messages over time by person">`;
  return html`${openingTag}${renderGridLines(layout)}${bucketsHtml}</svg>`;
}

/**
 * Draws the tooltip row of one series: its swatch, its name and its count.
 */
function renderSeriesTooltipRow(series: TimelineSeries, messageCount: number): SafeHtml {
  const swatch = renderColourSwatch(series.colour);
  const label = html`${swatch}${escapeHtml(series.label)}`;
  return renderTooltipRow(label, escapeHtml(formatWholeNumber(messageCount)));
}

/**
 * Builds the tooltip for one bar: its period, the count of each person who
 * wrote in it, and the total when more than one series exists.
 *
 * @param timeline - The series and buckets of the chart.
 * @param bucketIndex - Which bar the pointer is over.
 * @returns The tooltip content as markup; empty for an unknown bar.
 */
export function renderTimelineTooltip(timeline: TimelineData, bucketIndex: number): SafeHtml {
  const bucket = timeline.buckets[bucketIndex];
  if (bucket === undefined) {
    return EMPTY_HTML;
  }

  const title = formatBucketTooltipTitle(bucket.start, timeline.granularity);
  const tooltipParts: SafeHtml[] = [renderTooltipTitle(escapeHtml(title))];

  for (const [seriesIndex, series] of timeline.series.entries()) {
    const messageCount = bucket.messageCountsBySeries[seriesIndex] ?? 0;
    if (messageCount > 0) {
      tooltipParts.push(renderSeriesTooltipRow(series, messageCount));
    }
  }

  const hasSeveralSeries = timeline.series.length > 1;
  if (hasSeveralSeries) {
    const formattedTotal = escapeHtml(formatWholeNumber(bucket.totalMessageCount));
    tooltipParts.push(renderTooltipRow(html`Total`, formattedTotal));
  }
  return joinHtml(tooltipParts);
}

/**
 * Makes one hover band highlight itself and show the tooltip of its bar.
 */
function attachHoverBandEvents(
  hoverBand: SVGElement,
  timeline: TimelineData,
  tooltip: Tooltip,
): void {
  const bucketIndex = Number(hoverBand.getAttribute(BUCKET_INDEX_ATTRIBUTE));

  hoverBand.addEventListener('pointermove', (event: PointerEvent): void => {
    hoverBand.classList.add(HIGHLIGHTED_HOVER_BAND_CLASS);
    tooltip.show(renderTimelineTooltip(timeline, bucketIndex), event);
  });
  hoverBand.addEventListener('pointerleave', (): void => {
    hoverBand.classList.remove(HIGHLIGHTED_HOVER_BAND_CLASS);
    tooltip.hide();
  });
}

/**
 * Draws the timeline into its container at the container's current width and
 * connects the tooltip. Call again after the width changed.
 *
 * @param container - The element that holds the chart (`#timeline`).
 * @param timeline - The series and buckets to draw.
 * @param tooltip - The shared tooltip.
 */
export function drawTimeline(
  container: HTMLElement,
  timeline: TimelineData,
  tooltip: Tooltip,
): void {
  setInnerHtml(container, renderTimelineSvg(timeline, container.clientWidth));

  const hoverBands = container.querySelectorAll<SVGElement>(`.${HOVER_BAND_CLASS}`);
  for (const hoverBand of hoverBands) {
    attachHoverBandEvents(hoverBand, timeline, tooltip);
  }
}
