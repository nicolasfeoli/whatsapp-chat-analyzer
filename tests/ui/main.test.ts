// @vitest-environment jsdom

/**
 * Tests of the entry script: that importing it starts a page on the real
 * `index.html` with what the real browser offers.
 *
 * What the page then does is tested in `page-controller.test.ts`; this file
 * only checks the wiring. The entry script starts the page when it is
 * imported, so every test puts a fresh copy of the markup in place and imports
 * the script anew. Nothing here fires events at the window, which all of
 * these pages share.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { androidLine, exportText } from '../fixtures/export-lines';
import { textsOfElements } from '../fixtures/markup';
import { loadIndexHtmlBody } from '../fixtures/page';

/** An invented export whose dates can be read both ways: 1 February or 2 January. */
const AMBIGUOUS_CHAT_TEXT = exportText([
  androidLine({ date: '1/2/24', time: '10:00', sender: 'Carla', text: 'are we still on?' }),
  androidLine({ date: '1/2/24', time: '10:01', sender: 'Dani', text: 'yes, see you there' }),
]);

/**
 * Finds an element of the page by its `id`.
 */
function pageElement(elementId: string): HTMLElement {
  const element = document.getElementById(elementId);
  if (element === null) {
    throw new Error(`The page has no element with id "${elementId}"`);
  }
  return element;
}

/**
 * Puts the markup of `index.html` in place and runs the entry script on it.
 */
async function openPage(): Promise<void> {
  loadIndexHtmlBody();
  vi.resetModules();
  await import('../../src/ui/main');
}

/**
 * Chooses the ambiguous export in the file picker and waits for its report.
 */
async function loadAmbiguousFile(): Promise<void> {
  const fileInput = pageElement('file-input');
  const file = new File([AMBIGUOUS_CHAT_TEXT], 'WhatsApp Chat with Carla.txt');
  Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
  fileInput.dispatchEvent(new Event('change'));

  await vi.waitFor(() => {
    expect(textsOfElements(pageElement('report'), '.chat-heading h2')).toEqual(['Carla']);
  });
}

describe('the entry script', () => {
  beforeEach(() => {
    /* The simulated browser has no Worker; say so explicitly, whatever a later version adds. */
    vi.stubGlobal('Worker', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('starts the page, which shows the example chat', async () => {
    await openPage();

    expect(textsOfElements(pageElement('report'), '.chat-heading h2')).toEqual([
      'Marta and Diego (example)',
    ]);
    expect(pageElement('timeline').querySelectorAll('svg')).toHaveLength(1);
  });

  it('analyses a chosen file on the main thread in a browser without workers', async () => {
    await openPage();

    await loadAmbiguousFile();

    expect(pageElement('parse-report').textContent).toContain('Read 2 messages from 2 lines');
    expect(pageElement('status-line').hidden).toBe(true);
  });

  it.each([
    { language: 'en-US', reading: 'month/day/year' },
    { language: 'es-CR', reading: 'day/month/year' },
  ])(
    'reads ambiguous dates as $reading where the browser is set to $language',
    async ({ language, reading }) => {
      vi.spyOn(navigator, 'language', 'get').mockReturnValue(language);
      await openPage();

      await loadAmbiguousFile();

      expect(pageElement('date-order-message').textContent).toContain(
        `Reading them as ${reading}.`,
      );
    },
  );

  it('hands a chosen file to a Web Worker in a browser that has them', async () => {
    const postedMessages: unknown[] = [];
    /** Stands in for the browser's `Worker`: it only records what the page posts to it. */
    class RecordingWorker extends EventTarget {
      public postMessage(message: unknown): void {
        postedMessages.push(message);
      }
    }
    vi.stubGlobal('Worker', RecordingWorker);
    await openPage();

    const fileInput = pageElement('file-input');
    const file = new File([AMBIGUOUS_CHAT_TEXT], 'WhatsApp Chat with Carla.txt');
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fileInput.dispatchEvent(new Event('change'));

    await vi.waitFor(() => {
      expect(postedMessages).toHaveLength(1);
    });
    expect(postedMessages[0]).toMatchObject({
      kind: 'analyse-new-text',
      rawText: AMBIGUOUS_CHAT_TEXT,
      forcedDateOrder: null,
    });
    /* The worker of this test never answers, so the example stays on display. */
    expect(textsOfElements(pageElement('report'), '.chat-heading h2')).toEqual([
      'Marta and Diego (example)',
    ]);
  });

  it('fails by name when index.html lacks an element the page needs', async () => {
    loadIndexHtmlBody();
    pageElement('tooltip').remove();
    vi.resetModules();

    await expect(import('../../src/ui/main')).rejects.toThrow('with id "tooltip"');
  });
});
