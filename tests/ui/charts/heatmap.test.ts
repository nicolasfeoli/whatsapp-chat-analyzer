// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  attachHeatmapTooltips,
  findBusiestSlot,
  findBusiestSlotCount,
  renderHeatmapGrid,
  renderHeatmapTooltip,
} from '../../../src/ui/charts/heatmap';
import type { Tooltip } from '../../../src/ui/tooltip';
import { emptyHeatmap, heatmapWith } from '../../fixtures/analysis-builders';
import { findElement, parseMarkup, textsOfElements } from '../../fixtures/markup';

/** Row index of Monday, the first row of the heatmap. */
const MONDAY = 0;

/** Row index of Tuesday. */
const TUESDAY = 1;

/** Row index of Wednesday. */
const WEDNESDAY = 2;

/** Row index of Sunday. */
const SUNDAY = 6;

/**
 * Builds a tooltip that only records how it was used.
 */
function createRecordingTooltip() {
  return { show: vi.fn<Tooltip['show']>(), hide: vi.fn<Tooltip['hide']>() };
}

/**
 * Finds the square of one hour slot in a rendered grid.
 */
function findCell(grid: ParentNode, weekdayIndex: number, hour: number): Element {
  return findElement(
    grid,
    `.heatmap-cell[data-weekday-index="${weekdayIndex}"][data-hour="${hour}"]`,
  );
}

describe('findBusiestSlot', () => {
  it('finds the weekday and hour with the most messages', () => {
    const heatmap = heatmapWith([
      { weekdayIndex: MONDAY, hour: 9, messageCount: 4 },
      { weekdayIndex: WEDNESDAY, hour: 20, messageCount: 17 },
    ]);

    expect(findBusiestSlot(heatmap)).toEqual({
      weekdayIndex: WEDNESDAY,
      hour: 20,
      messageCount: 17,
    });
  });

  it('prefers the earliest slot of the week when two are equally busy', () => {
    const heatmap = heatmapWith([
      { weekdayIndex: WEDNESDAY, hour: 20, messageCount: 17 },
      { weekdayIndex: TUESDAY, hour: 23, messageCount: 17 },
    ]);

    expect(findBusiestSlot(heatmap)).toEqual({ weekdayIndex: TUESDAY, hour: 23, messageCount: 17 });
  });

  it('settles on Monday at midnight for a heatmap without messages', () => {
    expect(findBusiestSlot(emptyHeatmap())).toEqual({
      weekdayIndex: MONDAY,
      hour: 0,
      messageCount: 0,
    });
  });

  it('finds nothing in a heatmap without rows', () => {
    expect(findBusiestSlot([])).toBeNull();
  });
});

describe('findBusiestSlotCount', () => {
  it('returns 1 for a heatmap without rows', () => {
    expect(findBusiestSlotCount([])).toBe(1);
  });

  it('returns the highest count of any slot', () => {
    const heatmap = heatmapWith([
      { weekdayIndex: 0, hour: 9, messageCount: 4 },
      { weekdayIndex: SUNDAY, hour: 23, messageCount: 17 },
    ]);

    expect(findBusiestSlotCount(heatmap)).toBe(17);
  });

  it('returns 1 for an empty heatmap, so it can be divided by', () => {
    expect(findBusiestSlotCount(emptyHeatmap())).toBe(1);
  });
});

describe('renderHeatmapGrid', () => {
  it('draws seven rows of twenty-four squares', () => {
    const grid = parseMarkup(renderHeatmapGrid(emptyHeatmap()));

    expect(grid.querySelectorAll('.heatmap-cell')).toHaveLength(7 * 24);
  });

  it('labels the rows with the first three letters of each weekday, Monday first', () => {
    const grid = parseMarkup(renderHeatmapGrid(emptyHeatmap()));

    expect(textsOfElements(grid, '.weekday-label')).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
  });

  it('labels every third hour and leaves the others blank', () => {
    const grid = parseMarkup(renderHeatmapGrid(emptyHeatmap()));
    const hourLabels = textsOfElements(grid, '.hour-label');

    expect(hourLabels).toHaveLength(24);
    expect(hourLabels.filter((label) => label !== '')).toEqual([
      '00',
      '03',
      '06',
      '09',
      '12',
      '15',
      '18',
      '21',
    ]);
    expect(hourLabels[1]).toBe('');
  });

  it('starts with an empty corner cell above the weekday labels', () => {
    const grid = findElement(parseMarkup(renderHeatmapGrid(emptyHeatmap())), '.heatmap');

    expect(grid.firstElementChild?.outerHTML).toBe('<div></div>');
  });

  it('records the weekday, hour and count of each square for the tooltip', () => {
    const heatmap = heatmapWith([{ weekdayIndex: WEDNESDAY, hour: 20, messageCount: 5 }]);

    const cell = findCell(parseMarkup(renderHeatmapGrid(heatmap)), WEDNESDAY, 20);

    expect(cell.getAttribute('data-message-count')).toBe('5');
  });

  describe('colour', () => {
    it('leaves an empty slot without a background of its own', () => {
      const grid = parseMarkup(renderHeatmapGrid(emptyHeatmap()));

      expect(findCell(grid, 0, 0).hasAttribute('style')).toBe(false);
    });

    it('gives the busiest slot the full strength of the colour', () => {
      const heatmap = heatmapWith([{ weekdayIndex: WEDNESDAY, hour: 20, messageCount: 50 }]);

      const grid = renderHeatmapGrid(heatmap);

      expect(grid).toContain(
        '<div class="heatmap-cell" data-weekday-index="2" data-hour="20" data-message-count="50" style="background:color-mix(in oklab,var(--heat-hi) 100%,var(--heat-lo))"></div>',
      );
    });

    it('tints the other slots in proportion to the busiest, starting from 6%', () => {
      const heatmap = heatmapWith([
        { weekdayIndex: WEDNESDAY, hour: 20, messageCount: 100 },
        { weekdayIndex: WEDNESDAY, hour: 21, messageCount: 50 },
        { weekdayIndex: WEDNESDAY, hour: 22, messageCount: 1 },
      ]);

      const grid = renderHeatmapGrid(heatmap);

      /* 6 + 94 × 50 / 100 = 53, and 6 + 94 × 1 / 100 = 6.94, which rounds to 7. */
      expect(grid).toContain(
        'data-hour="21" data-message-count="50" style="background:color-mix(in oklab,var(--heat-hi) 53%,',
      );
      expect(grid).toContain(
        'data-hour="22" data-message-count="1" style="background:color-mix(in oklab,var(--heat-hi) 7%,',
      );
    });
  });
});

describe('renderHeatmapTooltip', () => {
  it('names the weekday and the hour, and gives the count', () => {
    expect(renderHeatmapTooltip({ weekdayIndex: WEDNESDAY, hour: 20, messageCount: 5 })).toBe(
      '<div class="tooltip-title">Wednesday, 20:00 to 20:59</div><div class="tooltip-row"><span>Messages</span><b>5</b></div>',
    );
  });

  it('pads a morning hour with a zero', () => {
    expect(renderHeatmapTooltip({ weekdayIndex: 0, hour: 7, messageCount: 0 })).toContain(
      'Monday, 07:00 to 07:59',
    );
  });

  it('groups the digits of a large count', () => {
    expect(renderHeatmapTooltip({ weekdayIndex: SUNDAY, hour: 23, messageCount: 12345 })).toContain(
      '<b>12,345</b>',
    );
  });
});

describe('attachHeatmapTooltips', () => {
  it('shows the tooltip of a square while the pointer moves over it', () => {
    const heatmap = heatmapWith([{ weekdayIndex: WEDNESDAY, hour: 20, messageCount: 5 }]);
    const container = parseMarkup(renderHeatmapGrid(heatmap));
    const tooltip = createRecordingTooltip();
    attachHeatmapTooltips(container, tooltip);

    const pointerMove = new MouseEvent('pointermove', { clientX: 40, clientY: 60 });
    findCell(container, WEDNESDAY, 20).dispatchEvent(pointerMove);

    expect(tooltip.show).toHaveBeenCalledExactlyOnceWith(
      renderHeatmapTooltip({ weekdayIndex: WEDNESDAY, hour: 20, messageCount: 5 }),
      pointerMove,
    );
  });

  it('hides the tooltip when the pointer leaves the square', () => {
    const container = parseMarkup(renderHeatmapGrid(emptyHeatmap()));
    const tooltip = createRecordingTooltip();
    attachHeatmapTooltips(container, tooltip);

    findCell(container, 0, 0).dispatchEvent(new MouseEvent('pointerleave'));

    expect(tooltip.hide).toHaveBeenCalledOnce();
  });

  it('connects nothing in a container without a heatmap', () => {
    const tooltip = createRecordingTooltip();
    const container = parseMarkup('<p class="heatmap-cell">No chart here</p>');

    attachHeatmapTooltips(container, tooltip);
    findElement(container, 'p').dispatchEvent(new MouseEvent('pointermove'));
    findElement(container, 'p').dispatchEvent(new MouseEvent('pointerleave'));

    expect(tooltip.show).not.toHaveBeenCalled();
    expect(tooltip.hide).not.toHaveBeenCalled();
  });
});
