// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { renderBarStrip } from '../../../src/ui/charts/bar-strip';
import type { BarStripBar } from '../../../src/ui/charts/bar-strip';
import { findElement, parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';

/**
 * Builds a bar; anything left out takes an unremarkable default.
 */
function stripBar(parts: Partial<BarStripBar>): BarStripBar {
  return { axisLabel: '', slotName: 'Monday', messageCount: 1, ...parts };
}

/**
 * Lists the inline style of every bar in some rendered strip.
 */
function barStylesOf(stripHtml: string): (string | null)[] {
  const bars = parseMarkup(stripHtml).querySelectorAll('.bar-strip-bar');
  return Array.from(bars, (bar) => bar.getAttribute('style'));
}

describe('renderBarStrip', () => {
  it('draws a bar in its track with a label under it, described for the pointer', () => {
    const stripHtml = renderBarStrip(
      [stripBar({ axisLabel: 'Mon', slotName: 'Monday', messageCount: 12 })],
      'var(--s1)',
      'Messages by weekday.',
    );

    expect(stripHtml).toBe(
      '<div class="bar-strip" role="img" aria-label="Messages by weekday.">' +
        '<div class="bar-strip-column" title="Monday: 12 messages">' +
        '<div class="bar-strip-track"><div class="bar-strip-bar" style="height:100.0%;background:var(--s1)"></div></div>' +
        '<div class="bar-strip-label">Mon</div>' +
        '</div>' +
        '</div>',
    );
  });

  it('keeps the bars in the order given', () => {
    const strip = parseMarkup(
      renderBarStrip(
        [stripBar({ axisLabel: 'Mon' }), stripBar({ axisLabel: 'Tue' }), stripBar({})],
        'var(--s1)',
        'Messages by weekday.',
      ),
    );

    expect(textsOfElements(strip, '.bar-strip-label')).toEqual(['Mon', 'Tue', '']);
  });

  it('fills the track for the largest count and scales the others against it', () => {
    const stripHtml = renderBarStrip(
      [
        stripBar({ messageCount: 200 }),
        stripBar({ messageCount: 50 }),
        stripBar({ messageCount: 0 }),
      ],
      'var(--s2)',
      'Messages by weekday.',
    );

    expect(barStylesOf(stripHtml)).toEqual([
      'height:100.0%;background:var(--s2)',
      'height:25.0%;background:var(--s2)',
      'height:0.0%;background:var(--s2)',
    ]);
  });

  it('leaves every bar empty when nothing was counted, instead of dividing by zero', () => {
    const stripHtml = renderBarStrip(
      [stripBar({ messageCount: 0 }), stripBar({ messageCount: 0 })],
      'var(--s1)',
      'Messages by weekday.',
    );

    expect(barStylesOf(stripHtml)).toEqual([
      'height:0.0%;background:var(--s1)',
      'height:0.0%;background:var(--s1)',
    ]);
  });

  it('writes one message in the singular', () => {
    const strip = parseMarkup(
      renderBarStrip(
        [stripBar({ slotName: '21:00 to 21:59', messageCount: 1 })],
        'var(--s1)',
        'Messages by hour of the day.',
      ),
    );

    expect(findElement(strip, '.bar-strip-column').getAttribute('title')).toBe(
      '21:00 to 21:59: 1 message',
    );
  });

  it('says in words what the picture shows, for a reader who cannot see it', () => {
    const strip = parseMarkup(
      renderBarStrip([stripBar({})], 'var(--s1)', 'Messages by weekday. Most active on Mondays.'),
    );

    const picture = findElement(strip, '.bar-strip');

    expect(picture.getAttribute('role')).toBe('img');
    expect(picture.getAttribute('aria-label')).toBe('Messages by weekday. Most active on Mondays.');
  });

  it('writes text that is markup as text', () => {
    const hostileText = '"><img src=x onerror=alert(1)>';
    const strip = parseMarkup(
      renderBarStrip(
        [stripBar({ axisLabel: hostileText, slotName: hostileText })],
        hostileText,
        hostileText,
      ),
    );

    expect(tagNamesIn(strip)).toEqual(['div']);
    expect(textsOfElements(strip, '.bar-strip-label')).toEqual([hostileText]);
    expect(findElement(strip, '.bar-strip').getAttribute('aria-label')).toBe(hostileText);
  });
});
