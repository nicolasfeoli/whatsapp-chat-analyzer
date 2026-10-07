// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  OBJECT_URL_LIFETIME_IN_MILLISECONDS,
  createSummaryImageServices,
} from '../../../src/ui/summary-card/browser-services';
import type { SummaryImageBrowser } from '../../../src/ui/summary-card/browser-services';
import type { SummaryImageServices } from '../../../src/ui/summary-card/save-summary-image';
import { RecordingDrawingContext } from '../../fixtures/summary-image';

/** The address the pretended browser gives every picture. */
const OBJECT_URL = 'blob:https://example.test/2f7c1a';

/** Services on the test document, and the stand-ins they were made of. */
interface TestBrowser {
  readonly services: SummaryImageServices;
  readonly createObjectUrl: ReturnType<typeof vi.fn<SummaryImageBrowser['createObjectUrl']>>;
  readonly revokeObjectUrl: ReturnType<typeof vi.fn<SummaryImageBrowser['revokeObjectUrl']>>;
}

/**
 * Creates the services on the document of the test, with a pretended `URL`
 * and the timers of the test runner.
 */
function createTestBrowser(): TestBrowser {
  const createObjectUrl = vi.fn<SummaryImageBrowser['createObjectUrl']>(() => OBJECT_URL);
  const revokeObjectUrl = vi.fn<SummaryImageBrowser['revokeObjectUrl']>();
  const services = createSummaryImageServices({
    document,
    createObjectUrl,
    revokeObjectUrl,
    setTimeout: (task, delayInMilliseconds) => window.setTimeout(task, delayInMilliseconds),
  });
  return { services, createObjectUrl, revokeObjectUrl };
}

/** A canvas that was asked for a context, and the kind of context it was asked for. */
interface ContextRequest {
  readonly canvas: HTMLCanvasElement;
  readonly contextKind: string;
}

/**
 * Gives the canvases of the simulated browser, which cannot draw, a context.
 *
 * @param context - What `getContext` answers; `null` for a browser that refuses.
 * @returns The requests the canvases received, filled in as they come.
 */
function stubCanvasContext(context: RecordingDrawingContext | null): ContextRequest[] {
  const contextRequests: ContextRequest[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    contextKind: string,
  ) {
    contextRequests.push({ canvas: this, contextKind });
    /* The stand-in has only the parts of a real context the image is drawn with. */
    return context as unknown as CanvasRenderingContext2D | null;
  });
  return contextRequests;
}

/** Puts a pretended font set on the document and returns its `load`. */
function stubDocumentFonts(
  load: (font: string, text?: string) => Promise<FontFace[]>,
): ReturnType<typeof vi.fn<typeof load>> {
  const loadFont = vi.fn(load);
  Object.defineProperty(document, 'fonts', { value: { load: loadFont }, configurable: true });
  return loadFont;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'fonts');
  document.body.innerHTML = '';
});

describe('createDrawingSurface', () => {
  it('asks a canvas of the given size for its 2D context', () => {
    const context = new RecordingDrawingContext();
    const contextRequests = stubCanvasContext(context);

    const surface = createTestBrowser().services.createDrawingSurface(1080, 1350);

    expect(surface?.context).toBe(context);
    expect(contextRequests).toHaveLength(1);
    expect(contextRequests[0]?.contextKind).toBe('2d');
    expect(contextRequests[0]?.canvas).toMatchObject({ width: 1080, height: 1350 });
  });

  it('does not put the canvas on the page', () => {
    stubCanvasContext(new RecordingDrawingContext());

    createTestBrowser().services.createDrawingSurface(1080, 1350);

    expect(document.querySelector('canvas')).toBeNull();
  });

  it('gives no surface in a browser that has no 2D context', () => {
    stubCanvasContext(null);

    expect(createTestBrowser().services.createDrawingSurface(1080, 1350)).toBeNull();
  });

  it('encodes the canvas as a PNG picture', async () => {
    stubCanvasContext(new RecordingDrawingContext());
    const picture = new Blob(['picture'], { type: 'image/png' });
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback) => {
        callback(picture);
      });

    const surface = createTestBrowser().services.createDrawingSurface(1080, 1350);

    await expect(surface?.toPngBlob()).resolves.toBe(picture);
    expect(toBlob).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 'image/png');
  });

  it('answers null when the browser cannot encode the canvas', async () => {
    stubCanvasContext(new RecordingDrawingContext());
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(null);
    });

    const surface = createTestBrowser().services.createDrawingSurface(1080, 1350);

    await expect(surface?.toPngBlob()).resolves.toBeNull();
  });
});

describe('loadFonts', () => {
  it('asks the page for each font with the text it has to draw', async () => {
    const loadFont = stubDocumentFonts(() => Promise.resolve([]));

    await createTestBrowser().services.loadFonts([
      { font: '700 68px "Bricolage Grotesque"', text: 'Łukasz and Ana' },
      { font: '400 24px "IBM Plex Sans"', text: 'Łukasz and Ana' },
    ]);

    expect(loadFont.mock.calls).toEqual([
      ['700 68px "Bricolage Grotesque"', 'Łukasz and Ana'],
      ['400 24px "IBM Plex Sans"', 'Łukasz and Ana'],
    ]);
  });

  it('waits until every font has answered', async () => {
    let finishLoading: (fontFaces: FontFace[]) => void = () => undefined;
    stubDocumentFonts(
      () =>
        new Promise<FontFace[]>((resolve) => {
          finishLoading = resolve;
        }),
    );
    let hasFinished = false;

    const loading = createTestBrowser()
      .services.loadFonts([{ font: '400 24px "IBM Plex Sans"', text: 'Ana' }])
      .then(() => {
        hasFinished = true;
      });
    await Promise.resolve();
    expect(hasFinished).toBe(false);

    finishLoading([]);
    await loading;
    expect(hasFinished).toBe(true);
  });

  it('fails when a font cannot be loaded, which the caller answers by drawing anyway', async () => {
    stubDocumentFonts(() => Promise.reject(new Error('the font file is missing')));

    await expect(
      createTestBrowser().services.loadFonts([{ font: '400 24px "IBM Plex Sans"', text: 'Ana' }]),
    ).rejects.toThrow('the font file is missing');
  });

  it('does nothing in a browser without the font loading interface', async () => {
    /* The simulated browser is such a browser: its document has no `fonts`. */
    expect('fonts' in document).toBe(false);

    await expect(
      createTestBrowser().services.loadFonts([{ font: '400 24px "IBM Plex Sans"', text: 'Ana' }]),
    ).resolves.toBeUndefined();
  });
});

describe('saveFile', () => {
  it('clicks a download link to an address of the picture inside the tab', () => {
    const browser = createTestBrowser();
    const picture = new Blob(['picture'], { type: 'image/png' });
    const clickedLinks: { href: string; download: string; isOnPage: boolean }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clickedLinks.push({
        href: this.href,
        download: this.download,
        isOnPage: document.body.contains(this),
      });
    });

    browser.services.saveFile(picture, 'chat-summary.png');

    expect(browser.createObjectUrl).toHaveBeenCalledExactlyOnceWith(picture);
    expect(clickedLinks).toEqual([
      { href: OBJECT_URL, download: 'chat-summary.png', isOnPage: true },
    ]);
  });

  it('leaves no link behind on the page', () => {
    const browser = createTestBrowser();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue(undefined);

    browser.services.saveFile(new Blob(['picture']), 'chat-summary.png');

    expect(document.querySelector('a')).toBeNull();
  });

  it('gives the address back a minute later, and not before the browser has read it', () => {
    vi.useFakeTimers();
    const browser = createTestBrowser();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue(undefined);

    browser.services.saveFile(new Blob(['picture']), 'chat-summary.png');

    vi.advanceTimersByTime(OBJECT_URL_LIFETIME_IN_MILLISECONDS - 1);
    expect(browser.revokeObjectUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(browser.revokeObjectUrl).toHaveBeenCalledExactlyOnceWith(OBJECT_URL);
  });
});
