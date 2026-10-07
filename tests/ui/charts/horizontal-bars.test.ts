// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { renderHorizontalBars } from '../../../src/ui/charts/horizontal-bars';
import type { HorizontalBarRow } from '../../../src/ui/charts/horizontal-bars';
import { parseMarkup, textsOfElements } from '../../fixtures/markup';

/**
 * Builds a row; anything left out takes an unremarkable default.
 */
function barRow(parts: Partial<HorizontalBarRow>): HorizontalBarRow {
  return { label: 'Ana', value: 1, colour: 'var(--s1)', displayValue: '1', ...parts };
}

/**
 * Lists the inline style of every bar in some rendered chart.
 */
function barStylesOf(chartHtml: string): (string | null)[] {
  const bars = parseMarkup(chartHtml).querySelectorAll('.bar');
  return Array.from(bars, (bar) => bar.getAttribute('style'));
}

describe('renderHorizontalBars', () => {
  it('draws a label, a bar in its track and a value for each row', () => {
    const chartHtml = renderHorizontalBars([
      barRow({ label: 'Ana', value: 30, colour: 'var(--s1)', displayValue: '30  75%' }),
    ]);

    expect(chartHtml).toBe(
      '<div class="horizontal-bars">' +
        '<div class="bar-label" title="Ana">Ana</div>' +
        '<div class="bar-track"><div class="bar" style="width:100.0%;background:var(--s1)"></div></div>' +
        '<div class="bar-value">30  75%</div>' +
        '</div>',
    );
  });

  it('keeps the rows in the order given', () => {
    const chart = parseMarkup(
      renderHorizontalBars([
        barRow({ label: 'Bob', value: 1 }),
        barRow({ label: 'Ana', value: 5 }),
        barRow({ label: 'Carla', value: 3 }),
      ]),
    );

    expect(textsOfElements(chart, '.bar-label')).toEqual(['Bob', 'Ana', 'Carla']);
  });

  it('fills the track for the largest value and scales the others against it', () => {
    const chartHtml = renderHorizontalBars([
      barRow({ value: 200 }),
      barRow({ value: 50 }),
      barRow({ value: 0 }),
    ]);

    expect(barStylesOf(chartHtml)).toEqual([
      'width:100.0%;background:var(--s1)',
      'width:25.0%;background:var(--s1)',
      'width:0.0%;background:var(--s1)',
    ]);
  });

  it('rounds the width to one decimal', () => {
    const chartHtml = renderHorizontalBars([barRow({ value: 3 }), barRow({ value: 1 })]);

    expect(barStylesOf(chartHtml)[1]).toBe('width:33.3%;background:var(--s1)');
  });

  it('leaves every bar empty when every value is zero', () => {
    const chartHtml = renderHorizontalBars([barRow({ value: 0 }), barRow({ value: 0 })]);

    expect(barStylesOf(chartHtml)).toEqual([
      'width:0.0%;background:var(--s1)',
      'width:0.0%;background:var(--s1)',
    ]);
  });

  it('draws an empty chart for no rows', () => {
    expect(renderHorizontalBars([])).toBe('<div class="horizontal-bars"></div>');
  });

  describe('untrusted text', () => {
    const hostileRow = barRow({
      label: '<img src=x onerror=alert(1)>',
      displayValue: '<b>1</b>',
      colour: 'red"><script>alert(1)</script>',
    });

    it('shows a label with markup as text, in the element and in its title', () => {
      const chart = parseMarkup(renderHorizontalBars([hostileRow]));
      const label = chart.querySelector('.bar-label');

      expect(label?.textContent).toBe('<img src=x onerror=alert(1)>');
      expect(label?.getAttribute('title')).toBe('<img src=x onerror=alert(1)>');
    });

    it('shows a value with markup as text', () => {
      const chart = parseMarkup(renderHorizontalBars([hostileRow]));

      expect(textsOfElements(chart, '.bar-value')).toEqual(['<b>1</b>']);
    });

    it('creates no element from any of it', () => {
      const chart = parseMarkup(renderHorizontalBars([hostileRow]));

      expect(chart.querySelectorAll('img, script, b')).toHaveLength(0);
    });
  });
});
