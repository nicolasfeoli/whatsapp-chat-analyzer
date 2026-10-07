// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { TIMELINE_CONTAINER_ID, renderTimelineSection } from '../../../src/ui/sections/timeline';
import { findElement, parseMarkup, textsOfElements } from '../../fixtures/markup';

describe('renderTimelineSection', () => {
  it('is headed "Activity over time"', () => {
    const section = parseMarkup(renderTimelineSection('day'));

    expect(textsOfElements(section, '.section-heading h2')).toEqual(['Activity over time']);
  });

  it.each([
    { granularity: 'day' as const },
    { granularity: 'week' as const },
    { granularity: 'month' as const },
    { granularity: 'year' as const },
  ])('says that each bar is one $granularity', ({ granularity }) => {
    const section = parseMarkup(renderTimelineSection(granularity));

    expect(textsOfElements(section, '.section-heading p')).toEqual([
      `Messages per ${granularity}, stacked by person. Hover or tap a bar for the exact counts.`,
    ]);
  });

  it('holds an empty container for the chart, which is drawn once the width is known', () => {
    const section = parseMarkup(renderTimelineSection('day'));
    const container = findElement(section, `#${TIMELINE_CONTAINER_ID}`);

    expect(TIMELINE_CONTAINER_ID).toBe('timeline');
    expect(container.childNodes).toHaveLength(0);
  });
});
