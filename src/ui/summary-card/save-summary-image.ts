/**
 * Makes the summary image and hands it to the reader as a PNG file: lays it
 * out, draws it and saves it, through the few things it needs from a browser.
 *
 * Everything happens inside the tab. The image is drawn on a canvas of the
 * page and saved from the page's own memory; nothing is sent anywhere.
 */

import { createTextMeasurer, drawSummaryCard } from './canvas';
import type { CardDrawingContext } from './canvas';
import type { SummaryCardContent } from './content';
import {
  SUMMARY_CARD_HEIGHT,
  SUMMARY_CARD_WIDTH,
  layOutSummaryCard,
  listFontRequests,
} from './layout';
import type { FontRequest } from './layout';

/**
 * The name the image is saved under. It never holds the title of the chat, so
 * an image made with "Hide names" does not carry a name in its file name.
 */
export const SUMMARY_IMAGE_FILE_NAME = 'chat-summary.png';

/** Something to draw on that can be turned into a picture. */
export interface DrawingSurface {
  /** The context the image is drawn with. */
  readonly context: CardDrawingContext;
  /**
   * Encodes what was drawn as a PNG.
   *
   * @returns The picture, or `null` when the browser could not encode it.
   */
  toPngBlob(): Promise<Blob | null>;
}

/** What making the image needs from a browser. */
export interface SummaryImageServices {
  /**
   * Creates a surface of the given size in pixels.
   *
   * @returns The surface, or `null` in a browser that cannot draw.
   */
  createDrawingSurface(width: number, height: number): DrawingSurface | null;
  /** Waits until the fonts are ready to draw the texts they are asked for with. */
  loadFonts(fontRequests: readonly FontRequest[]): Promise<void>;
  /** Offers a file to the reader as a download. */
  saveFile(content: Blob, fileName: string): void;
}

/**
 * How making the image ended: `saved` when the file was offered to the
 * reader, `cannot-draw` when the browser could not draw or encode it.
 */
export type SummaryImageOutcome = 'saved' | 'cannot-draw';

/**
 * Draws the summary image of a chat and offers it as a PNG file.
 *
 * The fonts are asked for first, because both measuring and drawing use
 * whatever font is ready at that moment. If they cannot be loaded the image
 * is drawn all the same, in the fonts of the device that every font stack of
 * the image ends in.
 *
 * @param content - What the image says.
 * @param services - The browser's canvas, fonts and download.
 * @returns How it ended.
 */
export async function saveSummaryImage(
  content: SummaryCardContent,
  services: SummaryImageServices,
): Promise<SummaryImageOutcome> {
  const surface = services.createDrawingSurface(SUMMARY_CARD_WIDTH, SUMMARY_CARD_HEIGHT);
  if (surface === null) {
    return 'cannot-draw';
  }
  try {
    await services.loadFonts(listFontRequests(content));
  } catch {
    /* A font that did not load is replaced by one of the device; the image is still worth having. */
  }
  const instructions = layOutSummaryCard(content, createTextMeasurer(surface.context));
  drawSummaryCard(surface.context, instructions);

  const picture = await surface.toPngBlob();
  if (picture === null) {
    return 'cannot-draw';
  }
  services.saveFile(picture, SUMMARY_IMAGE_FILE_NAME);
  return 'saved';
}
