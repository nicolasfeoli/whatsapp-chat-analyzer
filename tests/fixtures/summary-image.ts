/**
 * Stand-ins for what the summary image needs from a browser. The simulated
 * browser of the tests has no canvas, so the drawing is done on a context
 * that writes down what it was asked to draw.
 */

import type { CardDrawingContext } from '../../src/ui/summary-card/canvas';
import type { FontRequest } from '../../src/ui/summary-card/layout';
import type {
  DrawingSurface,
  SummaryImageServices,
} from '../../src/ui/summary-card/save-summary-image';

/**
 * In the invented font of the tests, every character is half as wide as the
 * font is tall. Real fonts are not far off, and the arithmetic stays easy:
 * ten characters at 20 pixels are 100 pixels wide.
 */
const CHARACTER_WIDTH_PER_FONT_SIZE = 0.5;

/** Finds the size in a font written as CSS writes it, e.g. the 28 of `"600 28px sans-serif"`. */
const FONT_SIZE_PATTERN = /(\d+)px/u;

/**
 * Measures a text in the invented font of the tests.
 *
 * @param text - The text to measure.
 * @param font - The font as CSS writes it; only its size matters.
 * @returns Half the font size for every character.
 */
export function measureInInventedFont(text: string, font: string): number {
  const fontSize = Number(FONT_SIZE_PATTERN.exec(font)?.[1] ?? 0);
  return Array.from(text).length * fontSize * CHARACTER_WIDTH_PER_FONT_SIZE;
}

/** A rectangle the recording context was asked to fill. */
export interface FilledRectangle {
  readonly kind: 'rectangle';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly colour: unknown;
}

/** A text the recording context was asked to write. */
export interface FilledText {
  readonly kind: 'text';
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly font: string;
  readonly colour: unknown;
  readonly alignment: string;
  readonly baseline: string;
}

/**
 * Stands in for the 2D context of a canvas: it keeps the settings it is
 * given and writes down every rectangle and text together with the settings
 * that were in force when it was drawn.
 */
export class RecordingDrawingContext implements CardDrawingContext {
  public fillStyle: string | CanvasGradient | CanvasPattern = '#000000';
  public font = '10px sans-serif';
  public textAlign: CanvasTextAlign = 'start';
  public textBaseline: CanvasTextBaseline = 'top';

  /** Everything that was drawn, in order. */
  public readonly drawn: (FilledRectangle | FilledText)[] = [];

  public fillRect(x: number, y: number, width: number, height: number): void {
    this.drawn.push({ kind: 'rectangle', x, y, width, height, colour: this.fillStyle });
  }

  public fillText(text: string, x: number, y: number): void {
    this.drawn.push({
      kind: 'text',
      text,
      x,
      y,
      font: this.font,
      colour: this.fillStyle,
      alignment: this.textAlign,
      baseline: this.textBaseline,
    });
  }

  public measureText(text: string): { readonly width: number } {
    return { width: measureInInventedFont(text, this.font) };
  }

  /** The texts that were written, in order. */
  public writtenTexts(): string[] {
    return this.drawn.flatMap((drawing) => (drawing.kind === 'text' ? [drawing.text] : []));
  }
}

/** A file the recording services were asked to save. */
export interface SavedFile {
  readonly content: Blob;
  readonly fileName: string;
}

/** Recording services and what they wrote down. */
export interface RecordingSummaryImageServices {
  /** The services to hand to the code under test. */
  readonly services: SummaryImageServices;
  /** The context of the one surface the services hand out. */
  readonly context: RecordingDrawingContext;
  /** The sizes of the surfaces that were asked for, as `[width, height]`. */
  readonly surfaceSizes: [number, number][];
  /** The fonts that were asked for. */
  readonly fontRequests: FontRequest[];
  /** The files that were saved. */
  readonly savedFiles: SavedFile[];
}

/** How a test wants the recording services to behave. */
export interface RecordingServicesOptions {
  /** Whether the browser can draw at all; it can unless stated. */
  readonly canDraw?: boolean;
  /** Whether the drawing can be turned into a picture; it can unless stated. */
  readonly canEncode?: boolean;
  /** Whether the fonts load; they do unless stated. */
  readonly canLoadFonts?: boolean;
}

/**
 * Creates services that draw on a recording context and keep the files they
 * are asked to save.
 *
 * @param options - What the pretended browser cannot do.
 * @returns The services and their records.
 */
export function createRecordingSummaryImageServices(
  options: RecordingServicesOptions = {},
): RecordingSummaryImageServices {
  const context = new RecordingDrawingContext();
  const surfaceSizes: [number, number][] = [];
  const fontRequests: FontRequest[] = [];
  const savedFiles: SavedFile[] = [];
  const surface: DrawingSurface = {
    context,
    toPngBlob: () =>
      Promise.resolve(
        options.canEncode === false ? null : new Blob(['picture'], { type: 'image/png' }),
      ),
  };
  const services: SummaryImageServices = {
    createDrawingSurface: (width, height) => {
      surfaceSizes.push([width, height]);
      return options.canDraw === false ? null : surface;
    },
    loadFonts: (requestedFonts) => {
      fontRequests.push(...requestedFonts);
      return options.canLoadFonts === false
        ? Promise.reject(new Error('the fonts did not load'))
        : Promise.resolve();
    },
    saveFile: (content, fileName) => {
      savedFiles.push({ content, fileName });
    },
  };
  return { services, context, surfaceSizes, fontRequests, savedFiles };
}
