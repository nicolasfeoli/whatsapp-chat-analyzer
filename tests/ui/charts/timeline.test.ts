// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  chooseAxisScale,
  drawTimeline,
  renderTimelineSvg,
  renderTimelineTooltip,
} from '../../../src/ui/charts/timeline';
import type {
  TimelineBucket,
  TimelineData,
  TimelineSeries,
} from '../../../src/ui/charts/timeline-buckets';
import type { Tooltip } from '../../../src/ui/tooltip';
import { localMidnight } from '../../fixtures/messages';
import { findElement, parseMarkup, textsOfElements } from '../../fixtures/markup';

const ANA_SERIES: TimelineSeries = { label: 'Ana', colour: 'var(--s1)' };
const BOB_SERIES: TimelineSeries = { label: 'Bob', colour: 'var(--s2)' };

/**
 * Builds a bucket for a day of 2024 from its counts per series.
 *
 * @param dayOfYear - 1 for 1 January, 2 for 2 January, and on past the end of the month.
 * @param messageCountsBySeries - The messages of each series on that day.
 */
function dayBucket(dayOfYear: number, messageCountsBySeries: readonly number[]): TimelineBucket {
  let totalMessageCount = 0;
  for (const messageCount of messageCountsBySeries) {
    totalMessageCount += messageCount;
  }
  const start = localMidnight('2024-01-01');
  start.setDate(dayOfYear);
  return { start, messageCountsBySeries, totalMessageCount };
}

/**
 * Builds a daily timeline for Ana and Bob from the counts of each day.
 */
function dailyTimeline(countsByDay: readonly (readonly number[])[]): TimelineData {
  return {
    granularity: 'day',
    series: [ANA_SERIES, BOB_SERIES],
    buckets: countsByDay.map((counts, index) => dayBucket(index + 1, counts)),
  };
}

/**
 * Builds a tooltip that only records how it was used.
 */
function createRecordingTooltip() {
  return { show: vi.fn<Tooltip['show']>(), hide: vi.fn<Tooltip['hide']>() };
}

/**
 * Lists the labels of the vertical axis, bottom to top.
 */
function countLabelsOf(svg: ParentNode): string[] {
  return textsOfElements(svg, 'text.axis-text[text-anchor="end"]');
}

/**
 * Lists the labels of the horizontal axis, left to right.
 */
function dateLabelsOf(svg: ParentNode): string[] {
  return textsOfElements(svg, 'text.axis-text[text-anchor="middle"]');
}

describe('chooseAxisScale', () => {
  it.each([
    { largestValue: 1, step: 0.5, maximum: 1 },
    { largestValue: 2, step: 0.5, maximum: 2 },
    { largestValue: 3, step: 1, maximum: 3 },
    { largestValue: 4, step: 1, maximum: 4 },
    { largestValue: 5, step: 1, maximum: 5 },
    { largestValue: 7, step: 2, maximum: 8 },
    { largestValue: 10, step: 5, maximum: 10 },
    { largestValue: 12, step: 5, maximum: 15 },
    { largestValue: 30, step: 10, maximum: 30 },
    { largestValue: 124, step: 50, maximum: 150 },
    { largestValue: 999, step: 200, maximum: 1000 },
    { largestValue: 2300, step: 1000, maximum: 3000 },
  ])(
    'scales a tallest bar of $largestValue in steps of $step up to $maximum',
    ({ largestValue, step, maximum }) => {
      expect(chooseAxisScale(largestValue)).toEqual({ step, maximum });
    },
  );

  /* Values just below, at and just above the points where the step changes. */
  it.each([1, 2, 3, 5, 6, 9, 10, 19, 20, 21, 49, 50, 51, 99, 100, 101, 999, 1000, 1001, 2999])(
    'reaches at least a tallest bar of %i, with less than one step to spare',
    (largestValue) => {
      const { step, maximum } = chooseAxisScale(largestValue);

      expect(maximum).toBeGreaterThanOrEqual(largestValue);
      expect(maximum - largestValue).toBeLessThan(step);
    },
  );

  it('copes with an axis for nothing at all', () => {
    expect(chooseAxisScale(0)).toEqual({ step: 0.5, maximum: 0 });
  });
});

describe('renderTimelineSvg', () => {
  describe('frame', () => {
    it('draws an image as wide as the room available and 250 high, with a description', () => {
      const svg = findElement(parseMarkup(renderTimelineSvg(dailyTimeline([[1, 0]]), 800)), 'svg');

      expect(svg.getAttribute('viewBox')).toBe('0 0 800 250');
      expect(svg.getAttribute('role')).toBe('img');
      expect(svg.getAttribute('aria-label')).toBe('Messages over time by person');
    });

    it('is never narrower than 300 pixels', () => {
      const svg = findElement(parseMarkup(renderTimelineSvg(dailyTimeline([[1, 0]]), 120)), 'svg');

      expect(svg.getAttribute('viewBox')).toBe('0 0 300 250');
    });
  });

  describe('vertical axis', () => {
    it('labels a grid line for every step up to the maximum', () => {
      const svg = parseMarkup(renderTimelineSvg(dailyTimeline([[7, 0]]), 800));

      expect(countLabelsOf(svg)).toEqual(['0', '2', '4', '6', '8']);
      expect(svg.querySelectorAll('line.grid-line')).toHaveLength(5);
    });

    it('uses half steps for a chart whose tallest bar is a single message', () => {
      const svg = parseMarkup(renderTimelineSvg(dailyTimeline([[1, 0]]), 800));

      expect(countLabelsOf(svg)).toEqual(['0', '0.5', '1']);
    });

    it('abbreviates thousands', () => {
      const svg = parseMarkup(renderTimelineSvg(dailyTimeline([[2300, 0]]), 800));

      expect(countLabelsOf(svg)).toEqual(['0', '1k', '2k', '3k']);
    });
  });

  describe('bars', () => {
    it('draws a single layer as a path with rounded top corners', () => {
      const svg = parseMarkup(renderTimelineSvg(dailyTimeline([[4, 0]]), 800));

      expect(svg.querySelectorAll('path')).toHaveLength(1);
      expect(svg.querySelector('path')?.getAttribute('fill')).toBe('var(--s1)');
      expect(svg.querySelectorAll('rect:not(.hover-band)')).toHaveLength(0);
    });

    it('draws the lower layer as a rectangle and only the top layer rounded', () => {
      const svg = parseMarkup(renderTimelineSvg(dailyTimeline([[3, 2]]), 800));

      expect(svg.querySelector('rect:not(.hover-band)')?.getAttribute('fill')).toBe('var(--s1)');
      expect(svg.querySelector('path')?.getAttribute('fill')).toBe('var(--s2)');
    });

    it('rounds the lower series when the series above it has no messages in that bar', () => {
      const svg = parseMarkup(renderTimelineSvg(dailyTimeline([[3, 0]]), 800));

      expect(svg.querySelector('path')?.getAttribute('fill')).toBe('var(--s1)');
    });

    it('draws nothing for a period without messages', () => {
      const svg = parseMarkup(
        renderTimelineSvg(
          dailyTimeline([
            [1, 0],
            [0, 0],
            [0, 1],
          ]),
          800,
        ),
      );

      expect(svg.querySelectorAll('path')).toHaveLength(2);
    });

    it('makes a bar half as tall for half as many messages', () => {
      const svg = parseMarkup(
        renderTimelineSvg(
          dailyTimeline([
            [8, 0],
            [4, 0],
          ]),
          800,
        ),
      );
      const [tallBar, shortBar] = Array.from(svg.querySelectorAll('path'), (path) =>
        path.getAttribute('d'),
      );

      /* The plot is 216 pixels high between y = 10 and y = 226; the axis tops out at 8. */
      expect(tallBar).toMatch(/^M[\d.]+,226V13Q/);
      expect(shortBar).toMatch(/^M[\d.]+,226V121Q/);
    });
  });

  describe('gaps between bars', () => {
    /**
     * Draws a chart of the given number of days, one message each, 800 pixels
     * wide (which leaves 730 for the bars), and returns where the first bar starts.
     */
    function firstBarStartFor(dayCount: number, chartWidth = 800): string | undefined {
      const timeline = dailyTimeline(Array.from({ length: dayCount }, () => [1, 0]));
      const svg = parseMarkup(renderTimelineSvg(timeline, chartWidth));
      const firstBarPath = svg.querySelector('path')?.getAttribute('d') ?? '';
      return /^M([\d.]+),/.exec(firstBarPath)?.[1];
    }

    it('leaves two pixels between wide bars, one on each side of a bar', () => {
      /* 730 / 10 = 73 pixels per bar; the first bar starts one pixel after the margin of 44. */
      expect(firstBarStartFor(10)).toBe('45');
    });

    it('leaves one pixel between bars of four to six pixels', () => {
      /* 730 / 146 = 5 pixels per bar; the first bar starts half a pixel after the margin. */
      expect(firstBarStartFor(146)).toBe('44.5');
    });

    it('lets bars of three pixels or fewer touch', () => {
      /* 730 / 365 = 2 pixels per bar; the first bar starts right at the margin. */
      expect(firstBarStartFor(365)).toBe('44');
    });

    describe('at the exact widths where the gap changes', () => {
      /** A chart 670 pixels wide leaves a round 600 for the bars. */
      const CHART_WIDTH_WITH_600_PIXEL_PLOT = 670;

      it('leaves only one pixel between bars of exactly six pixels', () => {
        /* 600 / 100 = 6 pixels per bar, which is not "wider than six". */
        expect(firstBarStartFor(100, CHART_WIDTH_WITH_600_PIXEL_PLOT)).toBe('44.5');
      });

      it('lets bars of exactly three pixels touch', () => {
        /* 600 / 200 = 3 pixels per bar, which is not "wider than three". */
        expect(firstBarStartFor(200, CHART_WIDTH_WITH_600_PIXEL_PLOT)).toBe('44');
      });
    });
  });

  describe('stacked layers', () => {
    /**
     * Reads where the top layer of the first bar ends at the bottom: the
     * vertical coordinate its path starts from.
     */
    function bottomOfTopLayer(svg: ParentNode): number {
      const pathCommands = svg.querySelector('path')?.getAttribute('d') ?? '';
      return Number(/^M[\d.]+,([\d.]+)V/.exec(pathCommands)?.[1]);
    }

    it('separates a layer taller than three pixels from the one below by a pixel and a half', () => {
      /*
       * 59 + 1 messages on an axis that tops out at 60: the top layer of one
       * message is 216 / 60 = 3.6 pixels tall and starts at y = 10. Without
       * the separator it would end at 13.6; with it, at 13.6 - 1.5 = 12.1.
       */
      const svg = parseMarkup(renderTimelineSvg(dailyTimeline([[59, 1]]), 800));

      expect(bottomOfTopLayer(svg)).toBeCloseTo(12.1);
    });

    it('does not take the separator out of a layer of three pixels or less', () => {
      /* 79 + 1 messages on an axis that tops out at 80: 216 / 80 = 2.7 pixels, ending at 12.7. */
      const svg = parseMarkup(renderTimelineSvg(dailyTimeline([[79, 1]]), 800));

      expect(bottomOfTopLayer(svg)).toBeCloseTo(12.7);
    });

    it('does not separate layers of bars that touch, where the line would look like a stripe', () => {
      /* 365 bars of 2 pixels have no gap; the top layer keeps its full 3.6 pixels. */
      const countsByDay = Array.from({ length: 365 }, () => [59, 1]);
      const svg = parseMarkup(renderTimelineSvg(dailyTimeline(countsByDay), 800));

      expect(bottomOfTopLayer(svg)).toBeCloseTo(13.6);
    });

    it('draws a lower layer at least half a pixel tall, however few its messages', () => {
      /* One message under 999 others would be 216 / 1000 = 0.216 pixels tall. */
      const svg = parseMarkup(renderTimelineSvg(dailyTimeline([[1, 999]]), 800));
      const lowerLayer = findElement(svg, 'rect:not(.hover-band)');

      expect(lowerLayer.getAttribute('height')).toBe('0.5');
    });

    it('draws a lower layer taller than half a pixel at its true height', () => {
      /* 5 of 10 messages are half of the 216 pixel plot. */
      const svg = parseMarkup(renderTimelineSvg(dailyTimeline([[5, 5]]), 800));
      const lowerLayer = findElement(svg, 'rect:not(.hover-band)');

      expect(Number(lowerLayer.getAttribute('height'))).toBeCloseTo(108);
    });

    it('ignores counts for which the timeline has no series', () => {
      const timeline: TimelineData = {
        granularity: 'day',
        series: [ANA_SERIES],
        buckets: [dayBucket(1, [2, 7])],
      };

      const svg = parseMarkup(renderTimelineSvg(timeline, 800));

      expect(svg.querySelectorAll('path, rect:not(.hover-band)')).toHaveLength(1);
      expect(svg.querySelector('path')?.getAttribute('fill')).toBe('var(--s1)');
    });
  });

  describe('hover bands', () => {
    it('lays one invisible band over each bucket, numbered in order', () => {
      const svg = parseMarkup(
        renderTimelineSvg(
          dailyTimeline([
            [1, 0],
            [0, 0],
            [0, 1],
          ]),
          800,
        ),
      );
      const bandIndexes = Array.from(svg.querySelectorAll('rect.hover-band'), (band) =>
        band.getAttribute('data-bucket-index'),
      );

      expect(bandIndexes).toEqual(['0', '1', '2']);
    });

    it('spreads the bands evenly over the plot between the margins', () => {
      const svg = parseMarkup(
        renderTimelineSvg(
          dailyTimeline([
            [1, 0],
            [1, 0],
          ]),
          800,
        ),
      );
      const bands = Array.from(svg.querySelectorAll('rect.hover-band'));

      /* 800 wide minus margins of 44 and 26 leaves 730, so 365 per bucket. */
      expect(bands.map((band) => band.getAttribute('x'))).toEqual(['44', '409']);
      expect(bands.map((band) => band.getAttribute('width'))).toEqual(['365', '365']);
    });
  });

  describe('date labels', () => {
    /** Thirty days with one message each. */
    const thirtyDays = dailyTimeline(Array.from({ length: 30 }, () => [1, 0]));

    it('labels every bucket when there is room', () => {
      const svg = parseMarkup(
        renderTimelineSvg(
          dailyTimeline([
            [1, 0],
            [1, 0],
            [1, 0],
          ]),
          800,
        ),
      );

      expect(dateLabelsOf(svg)).toEqual(['1 Jan', '2 Jan', '3 Jan']);
    });

    it('labels only as many buckets as fit, about one per 72 pixels', () => {
      const svg = parseMarkup(renderTimelineSvg(thirtyDays, 800));

      /* 730 / 72 leaves room for 10 labels, so every third of the 30 days is labelled. */
      expect(dateLabelsOf(svg)).toEqual([
        '1 Jan',
        '4 Jan',
        '7 Jan',
        '10 Jan',
        '13 Jan',
        '16 Jan',
        '19 Jan',
        '22 Jan',
        '25 Jan',
        '28 Jan',
      ]);
    });

    it('fits a label into exactly 72 pixels', () => {
      /*
       * A chart 358 pixels wide leaves 288 for the bars: room for exactly
       * 288 / 72 = 4 labels, so every third of twelve days is labelled.
       */
      const twelveDays = dailyTimeline(Array.from({ length: 12 }, () => [1, 0]));

      const svg = parseMarkup(renderTimelineSvg(twelveDays, 358));

      expect(dateLabelsOf(svg)).toEqual(['1 Jan', '4 Jan', '7 Jan', '10 Jan']);
    });

    it('draws fewer labels on a narrower chart', () => {
      const wideLabelCount = dateLabelsOf(parseMarkup(renderTimelineSvg(thirtyDays, 800))).length;
      const narrowLabelCount = dateLabelsOf(parseMarkup(renderTimelineSvg(thirtyDays, 320))).length;

      expect(narrowLabelCount).toBeLessThan(wideLabelCount);
      expect(narrowLabelCount).toBeGreaterThanOrEqual(2);
    });
  });

  it('escapes the colour of a lower layer that tries to leave its attribute', () => {
    const timeline: TimelineData = {
      granularity: 'day',
      series: [{ label: 'Ana', colour: '"><script>alert(1)</script>' }, BOB_SERIES],
      buckets: [dayBucket(1, [1, 1])],
    };

    const svg = parseMarkup(renderTimelineSvg(timeline, 800));
    const lowerLayer = findElement(svg, 'rect:not(.hover-band)');

    expect(svg.querySelectorAll('script')).toHaveLength(0);
    expect(lowerLayer.getAttribute('fill')).toBe('"><script>alert(1)</script>');
  });

  it('escapes a colour that tries to leave its attribute', () => {
    const timeline: TimelineData = {
      granularity: 'day',
      series: [{ label: 'Ana', colour: '"><script>alert(1)</script>' }],
      buckets: [dayBucket(1, [1])],
    };

    const svg = parseMarkup(renderTimelineSvg(timeline, 800));

    expect(svg.querySelectorAll('script')).toHaveLength(0);
    expect(svg.querySelector('path')?.getAttribute('fill')).toBe('"><script>alert(1)</script>');
  });
});

describe('renderTimelineTooltip', () => {
  it('lists the count of each person and the total under the date', () => {
    const tooltipHtml = renderTimelineTooltip(dailyTimeline([[3, 2]]), 0);

    expect(tooltipHtml).toBe(
      '<div class="tooltip-title">1 Jan 2024</div>' +
        '<div class="tooltip-row"><span><i class="colour-swatch" style="background:var(--s1)"></i>Ana</span><b>3</b></div>' +
        '<div class="tooltip-row"><span><i class="colour-swatch" style="background:var(--s2)"></i>Bob</span><b>2</b></div>' +
        '<div class="tooltip-row"><span>Total</span><b>5</b></div>',
    );
  });

  it('leaves out a person who wrote nothing in that period', () => {
    const tooltip = parseMarkup(renderTimelineTooltip(dailyTimeline([[3, 0]]), 0));

    expect(textsOfElements(tooltip, '.tooltip-row span')).toEqual(['Ana', 'Total']);
  });

  it('shows only the title and a total of zero for a period without messages', () => {
    const tooltip = parseMarkup(renderTimelineTooltip(dailyTimeline([[0, 0]]), 0));

    expect(textsOfElements(tooltip, '.tooltip-row')).toEqual(['Total0']);
  });

  it('leaves out the total when there is only one series', () => {
    const timeline: TimelineData = {
      granularity: 'day',
      series: [ANA_SERIES],
      buckets: [dayBucket(1, [3])],
    };

    const tooltip = parseMarkup(renderTimelineTooltip(timeline, 0));

    expect(textsOfElements(tooltip, '.tooltip-row span')).toEqual(['Ana']);
  });

  it('titles the tooltip according to the length of the bars', () => {
    const timeline: TimelineData = { ...dailyTimeline([[1, 0]]), granularity: 'week' };

    const tooltip = parseMarkup(renderTimelineTooltip(timeline, 0));

    expect(textsOfElements(tooltip, '.tooltip-title')).toEqual(['Week of 1 Jan 2024']);
  });

  it('groups the digits of large counts', () => {
    const tooltip = parseMarkup(renderTimelineTooltip(dailyTimeline([[1200, 34]]), 0));

    expect(textsOfElements(tooltip, '.tooltip-row b')).toEqual(['1,200', '34', '1,234']);
  });

  it('shows a name with markup as text', () => {
    const timeline: TimelineData = {
      granularity: 'day',
      series: [{ label: '<img src=x onerror=alert(1)>', colour: 'var(--s1)' }],
      buckets: [dayBucket(1, [1])],
    };

    const tooltip = parseMarkup(renderTimelineTooltip(timeline, 0));

    expect(tooltip.querySelectorAll('img')).toHaveLength(0);
    expect(textsOfElements(tooltip, '.tooltip-row span')).toEqual(['<img src=x onerror=alert(1)>']);
  });

  it.each([{ bucketIndex: -1 }, { bucketIndex: 5 }, { bucketIndex: Number.NaN }])(
    'returns nothing for bar $bucketIndex, which does not exist',
    ({ bucketIndex }) => {
      expect(renderTimelineTooltip(dailyTimeline([[1, 0]]), bucketIndex)).toBe('');
    },
  );
});

describe('drawTimeline', () => {
  const timeline = dailyTimeline([
    [3, 2],
    [1, 0],
  ]);

  /**
   * Draws the timeline into a new container and returns both.
   */
  function drawIntoNewContainer() {
    const container = document.createElement('div');
    const tooltip = createRecordingTooltip();
    drawTimeline(container, timeline, tooltip);
    return { container, tooltip };
  }

  it('puts the chart into the container', () => {
    const { container } = drawIntoNewContainer();

    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('draws at the width of the container', () => {
    const container = document.createElement('div');
    vi.spyOn(container, 'clientWidth', 'get').mockReturnValue(640);

    drawTimeline(container, timeline, createRecordingTooltip());

    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 640 250');
  });

  it('replaces the previous drawing instead of adding to it', () => {
    const { container, tooltip } = drawIntoNewContainer();

    drawTimeline(container, timeline, tooltip);

    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('highlights a bar and shows its tooltip while the pointer moves over it', () => {
    const { container, tooltip } = drawIntoNewContainer();
    const secondBand = findElement(container, '.hover-band[data-bucket-index="1"]');

    const pointerMove = new MouseEvent('pointermove', { clientX: 40, clientY: 60 });
    secondBand.dispatchEvent(pointerMove);

    expect(secondBand.classList.contains('highlighted')).toBe(true);
    expect(tooltip.show).toHaveBeenCalledExactlyOnceWith(
      renderTimelineTooltip(timeline, 1),
      pointerMove,
    );
  });

  it('shows the tooltip of a bar that is tapped, which arrives as a click, without a highlight', () => {
    const { container, tooltip } = drawIntoNewContainer();
    const secondBand = findElement(container, '.hover-band[data-bucket-index="1"]');

    const tap = new MouseEvent('click', { clientX: 40, clientY: 60 });
    secondBand.dispatchEvent(tap);

    expect(secondBand.classList.contains('highlighted')).toBe(false);
    expect(tooltip.show).toHaveBeenCalledExactlyOnceWith(renderTimelineTooltip(timeline, 1), tap);
  });

  it('removes the highlight and hides the tooltip when the pointer leaves', () => {
    const { container, tooltip } = drawIntoNewContainer();
    const firstBand = findElement(container, '.hover-band[data-bucket-index="0"]');
    firstBand.dispatchEvent(new MouseEvent('pointermove'));

    firstBand.dispatchEvent(new MouseEvent('pointerleave'));

    expect(firstBand.classList.contains('highlighted')).toBe(false);
    expect(tooltip.hide).toHaveBeenCalledOnce();
  });
});
