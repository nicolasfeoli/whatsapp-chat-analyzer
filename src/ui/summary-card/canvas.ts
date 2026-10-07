/**
 * Draws the summary image on a canvas: the thin shell around `layout.ts`,
 * which has already decided what goes where.
 */

import type { DrawInstruction } from './layout';
import type { MeasureTextWidth } from './text-fitting';

/**
 * The parts of a canvas's 2D context the image is drawn with. Naming them,
 * instead of asking for a whole `CanvasRenderingContext2D`, says exactly what
 * the drawing touches and lets a test stand in for the canvas, which the
 * simulated browser of the tests does not have.
 */
export interface CardDrawingContext {
  /** The colour the next rectangle or text is filled with. */
  fillStyle: string | CanvasGradient | CanvasPattern;
  /** The font of the next text, as CSS writes it. */
  font: string;
  /** Whether the x coordinate of a text is its left or its right end. */
  textAlign: CanvasTextAlign;
  /** Which line of a text its y coordinate is. */
  textBaseline: CanvasTextBaseline;
  /** Fills a rectangle with the current colour. */
  fillRect(x: number, y: number, width: number, height: number): void;
  /** Writes a line of text in the current font and colour. */
  fillText(text: string, x: number, y: number): void;
  /** Measures a text in the current font. */
  measureText(text: string): { readonly width: number };
}

/**
 * Makes the function the layout measures text with, out of a canvas context.
 *
 * @param context - The context the image will be drawn on.
 * @returns A function that sets the font on the context and measures the text in it.
 */
export function createTextMeasurer(context: CardDrawingContext): MeasureTextWidth {
  return (text: string, font: string): number => {
    context.font = font;
    return context.measureText(text).width;
  };
}

/**
 * Carries out the instructions of a layout, in their order.
 *
 * @param context - The context to draw on.
 * @param instructions - What to draw, as `layOutSummaryCard` listed it.
 */
export function drawSummaryCard(
  context: CardDrawingContext,
  instructions: readonly DrawInstruction[],
): void {
  /* The layout gives the baseline of every text. */
  context.textBaseline = 'alphabetic';
  for (const instruction of instructions) {
    context.fillStyle = instruction.colour;
    switch (instruction.kind) {
      case 'rectangle':
        context.fillRect(instruction.x, instruction.y, instruction.width, instruction.height);
        break;
      case 'text':
        context.font = instruction.font;
        context.textAlign = instruction.alignment;
        context.fillText(instruction.text, instruction.x, instruction.y);
        break;
    }
  }
}
