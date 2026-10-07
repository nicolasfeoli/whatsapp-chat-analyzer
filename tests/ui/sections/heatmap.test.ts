// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { renderHeatmapSection } from '../../../src/ui/sections/heatmap';
import { chatAnalysis, heatmapWith } from '../../fixtures/analysis-builders';
import { findElement, parseMarkup, textsOfElements } from '../../fixtures/markup';

describe('renderHeatmapSection', () => {
  const analysis = chatAnalysis({
    weekdayHourHeatmap: heatmapWith([
      { weekdayIndex: 2, hour: 20, messageCount: 1234 },
      { weekdayIndex: 4, hour: 9, messageCount: 3 },
    ]),
  });

  it('is headed "When the chat is alive" with a line on how to read it', () => {
    const section = parseMarkup(renderHeatmapSection(analysis));

    expect(textsOfElements(section, '.section-heading h2')).toEqual(['When the chat is alive']);
    expect(textsOfElements(section, '.section-heading p')).toEqual([
      'Rows are the days of the week. Columns are the hours of the day, from midnight on the left to 23:00 on the right. Each square adds up every message sent in that hour on that weekday, and a stronger color means more. Hover or tap a square for its number.',
    ]);
  });

  it('contains the grid of seven days by twenty-four hours', () => {
    const section = parseMarkup(renderHeatmapSection(analysis));

    expect(section.querySelectorAll('.heatmap .heatmap-cell')).toHaveLength(7 * 24);
  });

  it('explains the colour scale from one message to the count of the busiest slot', () => {
    const legend = findElement(parseMarkup(renderHeatmapSection(analysis)), '.heatmap-legend');

    expect(legend.innerHTML).toBe('1<i></i>1,234 messages');
  });

  it('ends the scale at 1 for a chat whose heatmap is empty', () => {
    const legend = findElement(
      parseMarkup(renderHeatmapSection(chatAnalysis())),
      '.heatmap-legend',
    );

    expect(legend.textContent).toBe('11 messages');
  });
});
