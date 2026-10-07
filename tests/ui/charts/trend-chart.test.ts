// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  NOTHING_MEASURED_LABEL,
  attachTrendChartTooltips,
  collectTrendTooltipContent,
  findTrendBucketAt,
  renderTrendChart,
  renderTrendTooltip,
} from '../../../src/ui/charts/trend-chart';
import type { Tooltip } from '../../../src/ui/tooltip';
import type { TrendChartData } from '../../../src/ui/trends';
import { findElement, parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';

/** A chart of two people's shares over four months; Bob has no point in March. */
const shareChart: TrendChartData = {
  kind: 'message-share',
  title: 'Share of the messages',
  unit: 'share',
  series: [
    { label: 'Ana', colour: 'var(--s1)', values: [0.8, 0.6, 0.5, 0.4] },
    { label: 'Bob', colour: 'var(--s2)', values: [0.2, 0.4, null, 0.6] },
  ],
  bucketLabels: ['Jan 2024', 'Feb 2024', 'Mar 2024', 'Apr 2024'],
  reading:
    "Ana's share of the messages went from about 70% in Jan–Feb 2024 to about 45% in Mar–Apr 2024.",
  timestampResolution: 'second',
};

/** A chart of one person's reply times, from one minute to a hundred. */
const replyChart: TrendChartData = {
  kind: 'reply-time',
  title: 'Typical reply time',
  unit: 'duration',
  series: [{ label: 'Bob', colour: 'var(--s2)', values: [60_000, 600_000, 6_000_000] }],
  bucketLabels: ['2022', '2023', '2024'],
  reading: null,
  timestampResolution: 'second',
};

/**
 * Builds a tooltip that only records how it was used.
 */
function recordingTooltip() {
  return { show: vi.fn<Tooltip['show']>(), hide: vi.fn<Tooltip['hide']>() };
}

/** Renders a chart and parses it. */
function renderChart(chart: TrendChartData): HTMLDivElement {
  return parseMarkup(renderTrendChart(chart));
}

/** Reads the `d` attribute of every path of a class. */
function pathsOf(container: ParentNode, className: string): (string | null)[] {
  return Array.from(container.querySelectorAll(`path.${className}`), (path) =>
    path.getAttribute('d'),
  );
}

describe('renderTrendChart', () => {
  it('draws a figure with the heading of the chart and says which chart it is', () => {
    const chart = renderChart(shareChart);

    expect(findElement(chart, 'figure.trend-chart').getAttribute('data-trend-chart')).toBe(
      'message-share',
    );
    expect(findElement(chart, 'figcaption h3').textContent).toBe('Share of the messages');
  });

  it('lists the lines in a legend with their colours', () => {
    const chart = renderChart(shareChart);

    expect(textsOfElements(chart, '.trend-legend span')).toEqual(['Ana', 'Bob']);
    expect(
      Array.from(chart.querySelectorAll('.trend-legend .colour-swatch'), (swatch) =>
        swatch.getAttribute('style'),
      ),
    ).toEqual(['background:var(--s1)', 'background:var(--s2)']);
  });

  it('needs no legend for a single line', () => {
    expect(renderChart(replyChart).querySelector('.trend-legend')).toBeNull();
  });

  it('places a share between zero at the bottom and the highest value at the top', () => {
    const chart = renderChart(shareChart);

    /* The highest share is 0.8: it sits at the top (0), 0.4 half way down (50). */
    expect(pathsOf(chart, 'trend-line')[0]).toBe('M0 0.00L1 25.00L2 37.50L3 50.00');
    expect(textsOfElements(chart, '.trend-scale span')).toEqual(['80%', '0%']);
  });

  it('breaks a line where a bucket was not measured, and still puts a dot on every point', () => {
    const chart = renderChart(shareChart);

    expect(pathsOf(chart, 'trend-line')[1]).toBe('M0 75.00L1 50.00M3 25.00');
    expect(pathsOf(chart, 'trend-dots')[1]).toBe('M0 75.00h0M1 50.00h0M3 25.00h0');
  });

  it('places times on a scale of factors, from the shortest to the longest', () => {
    const chart = renderChart(replyChart);

    /* One minute, ten and a hundred are a factor of ten apart each: bottom, middle, top. */
    expect(pathsOf(chart, 'trend-line')).toEqual(['M0 100.00L1 50.00L2 0.00']);
    expect(textsOfElements(chart, '.trend-scale span')).toEqual(['1.7 h', '1 min']);
  });

  it('puts a line of equal times in the middle', () => {
    const flatChart: TrendChartData = {
      ...replyChart,
      series: [{ label: 'Bob', colour: 'var(--s2)', values: [60_000, 60_000, 60_000] }],
    };

    expect(pathsOf(renderChart(flatChart), 'trend-line')).toEqual(['M0 50.00L1 50.00L2 50.00']);
  });

  it('writes a plain zero under a chart of words', () => {
    const wordsChart: TrendChartData = {
      ...replyChart,
      kind: 'words-per-message',
      unit: 'words',
      series: [{ label: 'Words per message', colour: 'var(--accent)', values: [4, 6, 8] }],
    };

    expect(textsOfElements(renderChart(wordsChart), '.trend-scale span')).toEqual(['8.0', '0']);
  });

  it('names the first and the last bucket under the lines', () => {
    expect(textsOfElements(renderChart(shareChart), '.trend-axis span')).toEqual([
      'Jan 2024',
      'Apr 2024',
    ]);
  });

  it('stretches to the width it is given, with one unit per bucket', () => {
    const svg = findElement(renderChart(shareChart), 'svg.trend-svg');

    expect(svg.getAttribute('viewBox')).toBe('-0.5 -8 4 116');
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
  });

  it('writes the sentence under the chart and reads it out in place of the lines', () => {
    const chart = renderChart(shareChart);
    const svg = findElement(chart, 'svg.trend-svg');

    expect(findElement(chart, '.trend-reading').textContent).toBe(shareChart.reading);
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe(
      `Share of the messages from Jan 2024 to Apr 2024. ${shareChart.reading ?? ''}`,
    );
  });

  it('leaves the sentence out when there is none, and tells a screen reader so', () => {
    const chart = renderChart(replyChart);

    expect(chart.querySelector('.trend-reading')).toBeNull();
    expect(findElement(chart, 'svg').getAttribute('aria-label')).toBe(
      'Typical reply time from 2022 to 2024. No clear change between the start and the end.',
    );
  });

  it('lays one band over each bucket', () => {
    const bands = renderChart(shareChart).querySelectorAll('rect.trend-band');

    expect(Array.from(bands, (band) => band.getAttribute('x'))).toEqual([
      '-0.5',
      '0.5',
      '1.5',
      '2.5',
    ]);
    expect(Array.from(bands, (band) => band.getAttribute('data-bucket-label'))).toEqual(
      shareChart.bucketLabels,
    );
  });

  it('creates no element from a name made of markup', () => {
    const markupName = '<img src=x onerror=alert(1)>';
    const chart = renderChart({
      ...shareChart,
      series: [
        { label: markupName, colour: 'var(--s1)', values: [0.8, 0.6, 0.5, 0.4] },
        { label: 'Bob', colour: 'var(--s2)', values: [0.2, 0.4, 0.5, 0.6] },
      ],
      reading: `${markupName}'s share of the messages went up.`,
    });

    expect(tagNamesIn(chart)).not.toContain('img');
    expect(textsOfElements(chart, '.trend-legend span')).toEqual([markupName, 'Bob']);
    expect(findTrendBucketAt(chart.querySelector('rect.trend-band'))?.rows[0]?.label).toBe(
      markupName,
    );
  });
});

describe('the tooltip of a bucket', () => {
  it('has a row for each line with a point in the bucket', () => {
    expect(collectTrendTooltipContent(shareChart, 1)).toEqual({
      bucketLabel: 'Feb 2024',
      rows: [
        { label: 'Ana', formattedValue: '60%', colour: 'var(--s1)' },
        { label: 'Bob', formattedValue: '40%', colour: 'var(--s2)' },
      ],
    });
  });

  it('leaves out a line without a point in the bucket', () => {
    expect(collectTrendTooltipContent(shareChart, 2).rows).toEqual([
      { label: 'Ana', formattedValue: '50%', colour: 'var(--s1)' },
    ]);
  });

  it('is read back from the band the pointer is over', () => {
    const chart = renderChart(shareChart);
    const secondBand = chart.querySelectorAll('rect.trend-band')[1] ?? null;

    expect(findTrendBucketAt(secondBand)).toEqual(collectTrendTooltipContent(shareChart, 1));
  });

  it('is not found over anything else', () => {
    const chart = renderChart(shareChart);

    expect(findTrendBucketAt(chart.querySelector('h3'))).toBeNull();
    expect(findTrendBucketAt(null)).toBeNull();
  });

  it('has no rows when the attribute holds something else than rows', () => {
    const chart = renderChart(shareChart);
    const band = findElement(chart, 'rect.trend-band');

    band.setAttribute('data-bucket-rows', 'not json');
    expect(findTrendBucketAt(band)?.rows).toEqual([]);

    band.setAttribute('data-bucket-rows', '{"label":"Ana"}');
    expect(findTrendBucketAt(band)?.rows).toEqual([]);

    band.setAttribute('data-bucket-rows', '[{"label":"Ana"},7]');
    expect(findTrendBucketAt(band)?.rows).toEqual([]);

    band.removeAttribute('data-bucket-rows');
    expect(findTrendBucketAt(band)?.rows).toEqual([]);
  });

  it('shows the bucket as its title and a swatch, a name and a value per row', () => {
    const tooltip = parseMarkup(renderTrendTooltip(collectTrendTooltipContent(shareChart, 1)));

    expect(findElement(tooltip, '.tooltip-title').textContent).toBe('Feb 2024');
    expect(textsOfElements(tooltip, '.tooltip-row span')).toEqual(['Ana', 'Bob']);
    expect(textsOfElements(tooltip, '.tooltip-row b')).toEqual(['60%', '40%']);
    expect(tooltip.querySelectorAll('.colour-swatch')).toHaveLength(2);
  });

  it('says that there was too little to measure when no line has a point', () => {
    const tooltip = parseMarkup(renderTrendTooltip({ bucketLabel: 'Mar 2024', rows: [] }));

    expect(textsOfElements(tooltip, '.tooltip-row span')).toEqual([NOTHING_MEASURED_LABEL]);
  });

  it('escapes a name made of markup', () => {
    const tooltip = parseMarkup(
      renderTrendTooltip({
        bucketLabel: 'Mar 2024',
        rows: [{ label: '<b>Ana</b>', formattedValue: '60%', colour: 'var(--s1)' }],
      }),
    );

    expect(textsOfElements(tooltip, '.tooltip-row span')).toEqual(['<b>Ana</b>']);
  });
});

describe('attachTrendChartTooltips', () => {
  it('shows the tooltip of the bucket under the pointer, with one pair of listeners per chart', () => {
    const container = renderChart(shareChart);
    const tooltip = recordingTooltip();
    attachTrendChartTooltips(container, tooltip);
    const secondBand = container.querySelectorAll('rect.trend-band')[1];

    const event = new Event('pointermove', { bubbles: true });
    secondBand?.dispatchEvent(event);

    expect(tooltip.show).toHaveBeenCalledExactlyOnceWith(
      renderTrendTooltip(collectTrendTooltipContent(shareChart, 1)),
      event,
    );
  });

  it('hides the tooltip over the heading and when the pointer leaves the chart', () => {
    const container = renderChart(shareChart);
    const tooltip = recordingTooltip();
    attachTrendChartTooltips(container, tooltip);

    findElement(container, 'h3').dispatchEvent(new Event('pointermove', { bubbles: true }));
    expect(tooltip.hide).toHaveBeenCalledOnce();
    expect(tooltip.show).not.toHaveBeenCalled();

    findElement(container, '.trend-chart').dispatchEvent(new Event('pointerleave'));
    expect(tooltip.hide).toHaveBeenCalledTimes(2);
  });
});
