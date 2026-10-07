import { describe, expect, it } from 'vitest';

import { createTextMeasurer, drawSummaryCard } from '../../../src/ui/summary-card/canvas';
import type { DrawInstruction } from '../../../src/ui/summary-card/layout';
import { RecordingDrawingContext } from '../../fixtures/summary-image';

describe('createTextMeasurer', () => {
  it('measures a text in the font it is asked about', () => {
    const context = new RecordingDrawingContext();
    const measureTextWidth = createTextMeasurer(context);

    /* The invented font of the recording context is half as wide as it is tall: 3 × 10 and 3 × 20. */
    expect(measureTextWidth('Ana', '400 20px sans-serif')).toBe(30);
    expect(measureTextWidth('Ana', '400 40px sans-serif')).toBe(60);
    expect(context.font).toBe('400 40px sans-serif');
  });
});

describe('drawSummaryCard', () => {
  it('draws nothing for an empty layout', () => {
    const context = new RecordingDrawingContext();

    drawSummaryCard(context, []);

    expect(context.drawn).toEqual([]);
  });

  it('fills a rectangle where the instruction says, in its colour', () => {
    const context = new RecordingDrawingContext();

    drawSummaryCard(context, [
      { kind: 'rectangle', x: 10, y: 20, width: 300, height: 40, colour: '#2a78d6' },
    ]);

    expect(context.drawn).toEqual([
      { kind: 'rectangle', x: 10, y: 20, width: 300, height: 40, colour: '#2a78d6' },
    ]);
  });

  it('writes a text on its baseline, in its font, colour and alignment', () => {
    const context = new RecordingDrawingContext();

    drawSummaryCard(context, [
      {
        kind: 'text',
        text: 'Ana and Bob',
        x: 1000,
        y: 150,
        font: '700 68px sans-serif',
        colour: '#111917',
        alignment: 'right',
      },
    ]);

    expect(context.drawn).toEqual([
      {
        kind: 'text',
        text: 'Ana and Bob',
        x: 1000,
        y: 150,
        font: '700 68px sans-serif',
        colour: '#111917',
        alignment: 'right',
        baseline: 'alphabetic',
      },
    ]);
  });

  it('draws in the order of the layout, so that a text lands on top of its tile', () => {
    const context = new RecordingDrawingContext();
    const instructions: DrawInstruction[] = [
      { kind: 'rectangle', x: 0, y: 0, width: 100, height: 100, colour: '#fcfdfc' },
      {
        kind: 'text',
        text: 'Busiest day',
        x: 10,
        y: 30,
        font: '600 20px sans-serif',
        colour: '#74807c',
        alignment: 'left',
      },
      { kind: 'rectangle', x: 0, y: 200, width: 50, height: 10, colour: '#eb6834' },
    ];

    drawSummaryCard(context, instructions);

    expect(context.drawn.map((drawing) => [drawing.kind, drawing.colour])).toEqual([
      ['rectangle', '#fcfdfc'],
      ['text', '#74807c'],
      ['rectangle', '#eb6834'],
    ]);
  });

  it('writes text as it is, markup included: a canvas draws letters, not elements', () => {
    const context = new RecordingDrawingContext();

    drawSummaryCard(context, [
      {
        kind: 'text',
        text: '<img src=x onerror=alert(1)>',
        x: 0,
        y: 0,
        font: '400 20px sans-serif',
        colour: '#111917',
        alignment: 'left',
      },
    ]);

    expect(context.writtenTexts()).toEqual(['<img src=x onerror=alert(1)>']);
  });
});
