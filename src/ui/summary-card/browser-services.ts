/**
 * What making the summary image needs from a real browser: a canvas, the
 * page's fonts and a download.
 *
 * The download is a link to a `blob:` address of the picture, which lives in
 * the memory of the tab, with the `download` attribute, clicked by the page.
 * The Content-Security-Policy of `index.html` has nothing against it: saving
 * a file the page made opens no connection (`connect-src 'none'` stays), and
 * the picture is never loaded as an image, so `img-src` did not have to learn
 * about `blob:` either.
 */

import type { FontRequest } from './layout';
import type { DrawingSurface, SummaryImageServices } from './save-summary-image';

/** The kind of picture the image is saved as. */
const PNG_MEDIA_TYPE = 'image/png';

/**
 * How long the address of a saved picture is kept before it is given back.
 * The browser reads the picture after the click, not during it, so the
 * address has to outlive the click; a minute is far more than it needs, and
 * afterwards the memory of the picture is free again.
 */
export const OBJECT_URL_LIFETIME_IN_MILLISECONDS = 60_000;

/** The parts of a browser the services are made of. */
export interface SummaryImageBrowser {
  /** The document of the page: it makes the canvas and the link, and has the fonts. */
  readonly document: Document;
  /** Gives a picture a `blob:` address (`URL.createObjectURL`). */
  createObjectUrl(picture: Blob): string;
  /** Gives the address back, which frees the picture (`URL.revokeObjectURL`). */
  revokeObjectUrl(objectUrl: string): void;
  /** Runs a task after a delay. */
  setTimeout(task: () => void, delayInMilliseconds: number): unknown;
}

/**
 * Creates a canvas of the given size and wraps it as a drawing surface.
 *
 * @returns The surface, or `null` when the browser gives the canvas no 2D context.
 */
function createCanvasSurface(
  ownerDocument: Document,
  width: number,
  height: number,
): DrawingSurface | null {
  const canvas = ownerDocument.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) {
    return null;
  }
  return {
    context,
    toPngBlob: (): Promise<Blob | null> =>
      new Promise<Blob | null>((resolve: (picture: Blob | null) => void): void => {
        canvas.toBlob(resolve, PNG_MEDIA_TYPE);
      }),
  };
}

/**
 * Waits until the page's fonts can draw the texts they are asked for with.
 * A browser without the font loading interface draws with what it has.
 */
async function loadDocumentFonts(
  ownerDocument: Document,
  fontRequests: readonly FontRequest[],
): Promise<void> {
  if (!('fonts' in ownerDocument)) {
    return;
  }
  const fontSet = ownerDocument.fonts;
  await Promise.all(
    fontRequests.map((fontRequest: FontRequest): Promise<unknown> =>
      fontSet.load(fontRequest.font, fontRequest.text),
    ),
  );
}

/**
 * Offers a picture to the reader as a download, through a link the page
 * clicks itself. The link is in the document while it is clicked, which some
 * browsers insist on, and is taken out again at once.
 */
function saveThroughLink(browser: SummaryImageBrowser, content: Blob, fileName: string): void {
  const objectUrl = browser.createObjectUrl(content);
  const link = browser.document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.hidden = true;
  browser.document.body.append(link);
  link.click();
  link.remove();
  browser.setTimeout((): void => {
    browser.revokeObjectUrl(objectUrl);
  }, OBJECT_URL_LIFETIME_IN_MILLISECONDS);
}

/**
 * Puts the services together for a browser.
 *
 * @param browser - The document, the two functions of `URL` and a timer.
 * @returns The canvas, the fonts and the download the summary image is made with.
 */
export function createSummaryImageServices(browser: SummaryImageBrowser): SummaryImageServices {
  return {
    createDrawingSurface: (width: number, height: number): DrawingSurface | null =>
      createCanvasSurface(browser.document, width, height),
    loadFonts: (fontRequests: readonly FontRequest[]): Promise<void> =>
      loadDocumentFonts(browser.document, fontRequests),
    saveFile: (content: Blob, fileName: string): void => {
      saveThroughLink(browser, content, fileName);
    },
  };
}
