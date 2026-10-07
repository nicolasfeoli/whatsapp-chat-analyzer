// @vitest-environment jsdom

/**
 * Tests of what happens on the page, and when: the real markup of
 * `index.html`, the real page controller and invented files, in a simulated
 * browser.
 *
 * Every test starts a page of its own, with its own window, and arranges
 * whatever it needs on it, so each can be read and run without the others.
 * Unless a test says otherwise, files are analysed by the real analysis on the
 * main thread, the path the page keeps for browsers without workers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { analyseChatExport } from '../../src/core/index';
import { createAnalysisClient } from '../../src/ui/analysis-client';
import type {
  AnalysisClient,
  AnalysisOutcome,
  MainThreadAnalysis,
} from '../../src/ui/analysis-client';
import { findPageElements } from '../../src/ui/dom';
import type { PageElements } from '../../src/ui/dom';
import {
  NO_MESSAGES_FOUND_STATUS,
  READING_MESSAGES_STATUS,
  TIMELINE_REDRAW_DELAY_IN_MILLISECONDS,
  startPage,
} from '../../src/ui/page-controller';
import type { PageWindow, ProgressListener } from '../../src/ui/page-controller';
import { createTooltip } from '../../src/ui/tooltip';
import { analysedResult } from '../fixtures/analysis-builders';
import { androidLine, exportText, iphoneLine } from '../fixtures/export-lines';
import { findElement, textsOfElements } from '../fixtures/markup';
import { loadIndexHtmlBody } from '../fixtures/page';
import { buildZipFile } from '../fixtures/zip-files';

/** An invented export whose dates can only be read day first. */
const UNAMBIGUOUS_CHAT_TEXT = exportText([
  iphoneLine({ date: '31/12/2023', time: '22:00:00', sender: 'Ana', text: 'happy new year' }),
  iphoneLine({ date: '31/12/2023', time: '22:00:30', sender: 'Bob', text: 'same to you' }),
]);

/** An invented export whose dates can be read both ways: 1 February or 2 January. */
const AMBIGUOUS_CHAT_TEXT = exportText([
  androidLine({ date: '1/2/24', time: '10:00', sender: 'Carla', text: 'are we still on?' }),
  androidLine({ date: '1/2/24', time: '10:01', sender: 'Dani', text: 'yes, see you there' }),
]);

/** An invented export in which one of three entries is dated 31 February. */
const CHAT_TEXT_WITH_IMPOSSIBLE_DATE = exportText([
  iphoneLine({ date: '31/12/2023', time: '22:00:00', sender: 'Ana', text: 'happy new year' }),
  iphoneLine({ date: '31/02/2024', time: '09:00:00', sender: 'Bob', text: 'what day is it' }),
  iphoneLine({ date: '01/03/2024', time: '09:00:00', sender: 'Ana', text: 'the first of March' }),
]);

/** A file of the unambiguous export, named the way Android names it. */
function fileOfAna(): File {
  return new File([UNAMBIGUOUS_CHAT_TEXT], 'WhatsApp Chat with Ana.txt');
}

/** A file of the ambiguous export. */
function fileOfCarla(): File {
  return new File([AMBIGUOUS_CHAT_TEXT], 'WhatsApp Chat with Carla.txt');
}

/**
 * Stands in for the browser's window: it receives the events a test fires at
 * it, and its timers are the test runner's, so a test can control the clock.
 */
class FakeWindow extends EventTarget implements PageWindow {
  public setTimeout(task: () => void, delayInMilliseconds: number): number {
    return window.setTimeout(task, delayInMilliseconds);
  }

  public clearTimeout(timerId: number | undefined): void {
    window.clearTimeout(timerId);
  }
}

/** An analysis client whose answers the test decides. */
interface ScriptedAnalysisClient extends AnalysisClient {
  readonly analyseNewText: ReturnType<typeof vi.fn<AnalysisClient['analyseNewText']>>;
  readonly reanalyseRetainedText: ReturnType<typeof vi.fn<AnalysisClient['reanalyseRetainedText']>>;
}

/** How one test wants its page set up. */
interface TestPageOptions {
  /** The language the browser reports; British English unless stated. */
  readonly locale?: string | null;
  /** The analysis used for the example chat; the real one unless stated. */
  readonly analyseOnMainThread?: MainThreadAnalysis;
  /** A client the test scripts; without it, loaded files go through the real analysis. */
  readonly scriptedClient?: ScriptedAnalysisClient;
}

/** A started page and the handles a test acts on it through. */
interface TestPage {
  readonly elements: PageElements;
  readonly browserWindow: FakeWindow;
  /** The listener the page gave to its analysis client, to report progress through. */
  readonly reportProgress: ProgressListener;
  /** The analysis the page was given for the example chat. */
  readonly analyseOnMainThread: ReturnType<typeof vi.fn<MainThreadAnalysis>>;
}

/**
 * Creates a client whose two methods never answer until the test makes them.
 */
function createScriptedClient(): ScriptedAnalysisClient {
  const neverAnswered = new Promise<AnalysisOutcome>(() => undefined);
  return {
    analyseNewText: vi.fn<AnalysisClient['analyseNewText']>(() => neverAnswered),
    reanalyseRetainedText: vi.fn<AnalysisClient['reanalyseRetainedText']>(() => neverAnswered),
  };
}

/**
 * Starts a page on the markup of `index.html`, which `beforeEach` has put in
 * place.
 */
function startTestPage(options: TestPageOptions = {}): TestPage {
  const elements = findPageElements();
  const browserWindow = new FakeWindow();
  const locale = options.locale === undefined ? 'en-GB' : options.locale;
  const analyseOnMainThread = vi.fn<MainThreadAnalysis>(
    options.analyseOnMainThread ?? analyseChatExport,
  );
  let reportProgress: ProgressListener = () => undefined;

  startPage({
    pageElements: elements,
    tooltip: createTooltip(elements.tooltip),
    browserWindow,
    getLocale: () => locale,
    analyseOnMainThread,
    createAnalysisClient: (onProgress) => {
      reportProgress = onProgress;
      if (options.scriptedClient !== undefined) {
        return options.scriptedClient;
      }
      return createAnalysisClient({
        startWorker: null,
        analyseOnMainThread: analyseChatExport,
        runLater: (task, delayInMilliseconds) => {
          window.setTimeout(task, delayInMilliseconds);
        },
        getLocale: () => locale,
        onProgress,
      });
    },
  });

  return {
    elements,
    browserWindow,
    reportProgress: (statusMessage) => {
      reportProgress(statusMessage);
    },
    analyseOnMainThread,
  };
}

/**
 * Chooses a file in the file picker, the way the browser reports it: the
 * input's list of files changes and a `change` event fires.
 */
function chooseFile(page: TestPage, file: File): void {
  Object.defineProperty(page.elements.fileInput, 'files', { value: [file], configurable: true });
  page.elements.fileInput.dispatchEvent(new Event('change'));
}

/**
 * Drops something on the page and returns the event, so a test can see
 * whether the page took it.
 */
function dropFiles(page: TestPage, files: readonly File[]): Event {
  const dropEvent = new Event('drop', { cancelable: true });
  Object.defineProperty(dropEvent, 'dataTransfer', { value: { files } });
  page.browserWindow.dispatchEvent(dropEvent);
  return dropEvent;
}

/** The title of the report on display. */
function reportTitle(page: TestPage): string | undefined {
  return textsOfElements(page.elements.reportContainer, '.chat-heading h2')[0];
}

/** The line under the title that says which days the chat covers. */
function reportPeriod(page: TestPage): string | undefined {
  return textsOfElements(page.elements.reportContainer, '.chat-period')[0];
}

/**
 * Waits until the report on the page is titled as expected, which is when
 * reading, analysing and rendering a file have all finished.
 */
async function waitForReportTitled(page: TestPage, title: string): Promise<void> {
  await vi.waitFor(() => {
    expect(reportTitle(page)).toBe(title);
  });
}

/**
 * Chooses a file and waits for its report.
 */
async function loadFile(page: TestPage, file: File, expectedTitle: string): Promise<void> {
  chooseFile(page, file);
  await waitForReportTitled(page, expectedTitle);
}

/**
 * Waits until the status line shows a message and is no longer busy.
 *
 * @returns The message.
 */
async function waitForFinalStatus(page: TestPage): Promise<string> {
  const { statusLine } = page.elements;
  await vi.waitFor(() => {
    expect(statusLine.hidden).toBe(false);
    expect(statusLine.classList.contains('busy')).toBe(false);
  });
  return statusLine.textContent;
}

/**
 * Waits until the status line shows the given message.
 */
async function waitForStatus(page: TestPage, message: string): Promise<void> {
  await vi.waitFor(() => {
    expect(page.elements.statusLine.textContent).toBe(message);
  });
}

beforeEach(() => {
  loadIndexHtmlBody();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('a page that has just started', () => {
  it('shows the invented example chat', () => {
    const page = startTestPage();

    expect(reportTitle(page)).toBe('Marta and Diego (example)');
  });

  it('says that the chat on display is an example', () => {
    const page = startTestPage();

    expect(page.elements.sampleNote.hidden).toBe(false);
  });

  it('shows neither a status, nor a parse report, nor the date-order switch', () => {
    const page = startTestPage();

    expect(page.elements.statusLine.hidden).toBe(true);
    expect(page.elements.parseReport.hidden).toBe(true);
    expect(page.elements.dateOrderRow.hidden).toBe(true);
  });

  it('has drawn the timeline into its container', () => {
    const page = startTestPage();

    expect(page.elements.reportContainer.querySelectorAll('#timeline svg')).toHaveLength(1);
  });

  it('analyses the example directly, in the language of the browser, without a forced order', () => {
    const page = startTestPage({ locale: 'es-CR' });

    expect(page.analyseOnMainThread).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('] Marta: '),
      null,
      'es-CR',
    );
  });

  it('does not offer the date-order switch for the example, even if its dates read two ways', () => {
    const page = startTestPage({
      analyseOnMainThread: () => analysedResult({ isDateOrderAmbiguous: true }),
    });

    expect(page.elements.dateOrderRow.hidden).toBe(true);
    expect(page.elements.sampleNote.hidden).toBe(false);
  });

  it('opens the file picker when the visible button is pressed', () => {
    const page = startTestPage();
    const openPicker = vi.spyOn(page.elements.fileInput, 'click').mockReturnValue(undefined);

    page.elements.chooseFileButton.click();

    expect(openPicker).toHaveBeenCalledOnce();
  });
});

describe('choosing a text file', () => {
  it('replaces the example by the report of the file, titled after its name', async () => {
    const page = startTestPage();

    await loadFile(page, fileOfAna(), 'Ana');

    expect(textsOfElements(page.elements.reportContainer, '.legend span')).toEqual(['Ana', 'Bob']);
    expect(page.elements.sampleNote.hidden).toBe(true);
  });

  it('says what was read from the file', async () => {
    const page = startTestPage();

    await loadFile(page, fileOfAna(), 'Ana');

    expect(page.elements.parseReport.hidden).toBe(false);
    expect(page.elements.parseReport.textContent).toBe(
      'Read 2 messages from 2 lines of an iPhone export, dates as day/month/year.',
    );
    expect(page.elements.parseReport.classList.contains('warning')).toBe(false);
  });

  it('clears the status line and does not offer the date-order switch', async () => {
    const page = startTestPage();

    await loadFile(page, fileOfAna(), 'Ana');

    expect(page.elements.statusLine.hidden).toBe(true);
    expect(page.elements.statusLine.classList.contains('busy')).toBe(false);
    expect(page.elements.dateOrderRow.hidden).toBe(true);
  });

  it('empties the file input, so that choosing the same file again is noticed', () => {
    const page = startTestPage({ scriptedClient: createScriptedClient() });
    const setInputValue = vi.spyOn(page.elements.fileInput, 'value', 'set');

    chooseFile(page, fileOfAna());

    expect(setInputValue).toHaveBeenCalledExactlyOnceWith('');
  });

  it('loads the same file again when it is chosen a second time', async () => {
    const scriptedClient = createScriptedClient();
    const page = startTestPage({ scriptedClient });
    const file = fileOfAna();

    chooseFile(page, file);
    chooseFile(page, file);

    await vi.waitFor(() => {
      expect(scriptedClient.analyseNewText).toHaveBeenCalledTimes(2);
    });
    expect(scriptedClient.analyseNewText).toHaveBeenLastCalledWith(UNAMBIGUOUS_CHAT_TEXT);
  });
});

describe('the status line while a file is loading', () => {
  it('names the file as soon as it is chosen, and shows that work is under way', () => {
    const page = startTestPage({ scriptedClient: createScriptedClient() });

    chooseFile(page, fileOfAna());

    expect(page.elements.statusLine.hidden).toBe(false);
    expect(page.elements.statusLine.textContent).toBe('Opening WhatsApp Chat with Ana.txt …');
    expect(page.elements.statusLine.classList.contains('busy')).toBe(true);
  });

  it('says that the messages are being read once the text of the file is at hand', async () => {
    const scriptedClient = createScriptedClient();
    const page = startTestPage({ scriptedClient });

    chooseFile(page, fileOfAna());
    await waitForStatus(page, READING_MESSAGES_STATUS);

    expect(READING_MESSAGES_STATUS).toBe('Reading messages …');
    expect(page.elements.statusLine.classList.contains('busy')).toBe(true);
    expect(scriptedClient.analyseNewText).toHaveBeenCalledExactlyOnceWith(UNAMBIGUOUS_CHAT_TEXT);
  });

  it('passes on what the analysis reports about its progress', () => {
    const page = startTestPage({ scriptedClient: createScriptedClient() });

    page.reportProgress('Analysing the chat …');

    expect(page.elements.statusLine.hidden).toBe(false);
    expect(page.elements.statusLine.textContent).toBe('Analysing the chat …');
    expect(page.elements.statusLine.classList.contains('busy')).toBe(true);
  });

  it('keeps the example on display until the analysis has answered', async () => {
    const page = startTestPage({ scriptedClient: createScriptedClient() });

    chooseFile(page, fileOfAna());
    await waitForStatus(page, READING_MESSAGES_STATUS);

    expect(reportTitle(page)).toBe('Marta and Diego (example)');
    expect(page.elements.sampleNote.hidden).toBe(false);
  });
});

describe('a file with a date that cannot be read', () => {
  it('reports the skipped entry as a warning', async () => {
    const page = startTestPage();

    await loadFile(page, new File([CHAT_TEXT_WITH_IMPOSSIBLE_DATE], 'odd dates.txt'), 'odd dates');

    expect(page.elements.parseReport.textContent).toContain(
      '1 entry has a date that could not be read',
    );
    expect(page.elements.parseReport.classList.contains('warning')).toBe(true);
  });

  it('drops the warning again when a file without such dates is loaded next', async () => {
    const page = startTestPage();
    await loadFile(page, new File([CHAT_TEXT_WITH_IMPOSSIBLE_DATE], 'odd dates.txt'), 'odd dates');

    await loadFile(page, fileOfAna(), 'Ana');

    expect(page.elements.parseReport.classList.contains('warning')).toBe(false);
  });
});

describe('the tooltip of the charts', () => {
  /**
   * Loads the chat of two messages sent in the same hour and moves the
   * pointer over the heatmap square of that hour.
   */
  async function loadFileAndPointAtBusiestSquare(): Promise<TestPage> {
    const page = startTestPage();
    await loadFile(page, fileOfAna(), 'Ana');
    const busiestSquare = findElement(
      page.elements.reportContainer,
      '.heatmap .heatmap-cell[data-message-count="2"]',
    );
    busiestSquare.dispatchEvent(new MouseEvent('pointermove', { clientX: 50, clientY: 50 }));
    return page;
  }

  it('appears over a heatmap square under the pointer', async () => {
    const page = await loadFileAndPointAtBusiestSquare();

    expect(page.elements.tooltip.hidden).toBe(false);
    expect(page.elements.tooltip.textContent).toContain('22:00 to 22:59');
  });

  it('is hidden when the page is scrolled, because it would no longer sit over its square', async () => {
    const page = await loadFileAndPointAtBusiestSquare();

    page.browserWindow.dispatchEvent(new Event('scroll'));

    expect(page.elements.tooltip.hidden).toBe(true);
  });

  it('listens to scrolling passively, so the page never holds a scroll back', () => {
    const browserWindowPrototype = vi.spyOn(FakeWindow.prototype, 'addEventListener');

    startTestPage();

    expect(browserWindowPrototype).toHaveBeenCalledWith('scroll', expect.any(Function), {
      passive: true,
    });
  });
});

describe('a file whose dates can be read two ways', () => {
  it('offers the switch and says which reading is in use', async () => {
    const page = startTestPage({ locale: 'en-US' });

    await loadFile(page, fileOfCarla(), 'Carla');

    expect(page.elements.dateOrderRow.hidden).toBe(false);
    expect(page.elements.dateOrderMessage.textContent).toContain('Reading them as month/day/year.');
    expect(reportPeriod(page)).toContain('2 Jan 2024');
  });

  it('reads the dates day first where the browser is not set to the United States', async () => {
    const page = startTestPage({ locale: 'en-GB' });

    await loadFile(page, fileOfCarla(), 'Carla');

    expect(page.elements.dateOrderMessage.textContent).toContain('Reading them as day/month/year.');
    expect(reportPeriod(page)).toContain('1 Feb 2024');
  });

  it('re-reads the same file the other way when "Switch" is pressed', async () => {
    const page = startTestPage({ locale: 'en-US' });
    await loadFile(page, fileOfCarla(), 'Carla');

    page.elements.switchDateOrderButton.click();
    await vi.waitFor(() => {
      expect(page.elements.dateOrderMessage.textContent).toContain(
        'Reading them as day/month/year.',
      );
    });

    expect(reportTitle(page)).toBe('Carla');
    expect(reportPeriod(page)).toContain('1 Feb 2024');
    expect(page.elements.parseReport.textContent).toContain('dates as day/month/year.');
    expect(page.elements.dateOrderRow.hidden).toBe(false);
  });

  it('switches back on a second press', async () => {
    const page = startTestPage({ locale: 'en-US' });
    await loadFile(page, fileOfCarla(), 'Carla');
    page.elements.switchDateOrderButton.click();
    await vi.waitFor(() => {
      expect(reportPeriod(page)).toContain('1 Feb 2024');
    });

    page.elements.switchDateOrderButton.click();

    await vi.waitFor(() => {
      expect(reportPeriod(page)).toContain('2 Jan 2024');
    });
    expect(page.elements.dateOrderMessage.textContent).toContain('Reading them as month/day/year.');
  });

  it('asks the analysis for the order that is not in use, and shows that work is under way', () => {
    const scriptedClient = createScriptedClient();
    const page = startTestPage({
      scriptedClient,
      analyseOnMainThread: () => analysedResult({ dateOrder: 'mdy' }),
    });

    page.elements.switchDateOrderButton.click();

    expect(scriptedClient.reanalyseRetainedText).toHaveBeenCalledExactlyOnceWith('dmy');
    expect(page.elements.statusLine.textContent).toBe(READING_MESSAGES_STATUS);
    expect(page.elements.statusLine.classList.contains('busy')).toBe(true);
  });

  it('asks for month first when the dates on display were read day first', () => {
    const scriptedClient = createScriptedClient();
    const page = startTestPage({
      scriptedClient,
      analyseOnMainThread: () => analysedResult({ dateOrder: 'dmy' }),
    });

    page.elements.switchDateOrderButton.click();

    expect(scriptedClient.reanalyseRetainedText).toHaveBeenCalledExactlyOnceWith('mdy');
  });

  it('does nothing when "Switch" is pressed while no chat is on display', () => {
    const scriptedClient = createScriptedClient();
    const page = startTestPage({ scriptedClient, analyseOnMainThread: () => ({ kind: 'empty' }) });

    page.elements.switchDateOrderButton.click();

    expect(scriptedClient.reanalyseRetainedText).not.toHaveBeenCalled();
    expect(page.elements.statusLine.textContent).toBe(NO_MESSAGES_FOUND_STATUS);
  });
});

describe('dragging a file over the page', () => {
  it('highlights the loader, and tells the browser that the page takes drops', () => {
    const page = startTestPage();
    const dragOver = new Event('dragover', { cancelable: true });

    page.browserWindow.dispatchEvent(dragOver);

    expect(page.elements.loader.classList.contains('dragging')).toBe(true);
    expect(dragOver.defaultPrevented).toBe(true);
  });

  it('keeps the highlight while the file moves from one element of the page to another', () => {
    const page = startTestPage();
    page.browserWindow.dispatchEvent(new Event('dragover', { cancelable: true }));

    page.browserWindow.dispatchEvent(new MouseEvent('dragleave', { relatedTarget: document.body }));

    expect(page.elements.loader.classList.contains('dragging')).toBe(true);
  });

  it('removes the highlight when the file leaves the window', () => {
    const page = startTestPage();
    page.browserWindow.dispatchEvent(new Event('dragover', { cancelable: true }));

    page.browserWindow.dispatchEvent(new MouseEvent('dragleave', { relatedTarget: null }));

    expect(page.elements.loader.classList.contains('dragging')).toBe(false);
  });
});

describe('dropping a file on the page', () => {
  it('takes the drop, so the browser does not navigate to the file instead', () => {
    const page = startTestPage({ scriptedClient: createScriptedClient() });

    const dropEvent = dropFiles(page, [fileOfAna()]);

    expect(dropEvent.defaultPrevented).toBe(true);
  });

  it('removes the highlight of the loader', () => {
    const page = startTestPage({ scriptedClient: createScriptedClient() });
    page.browserWindow.dispatchEvent(new Event('dragover', { cancelable: true }));

    dropFiles(page, [fileOfAna()]);

    expect(page.elements.loader.classList.contains('dragging')).toBe(false);
  });

  it('reads the chat inside a dropped zip, ignoring a text file somebody sent in the chat', async () => {
    const page = startTestPage();
    const zipFile = await buildZipFile(
      new Map([
        ['attachment.txt', 'shopping list: bread, olives'],
        ['_chat.txt', UNAMBIGUOUS_CHAT_TEXT],
      ]),
      'WhatsApp Chat - Family.zip',
    );

    dropFiles(page, [zipFile]);
    await waitForReportTitled(page, 'Family');

    expect(page.elements.parseReport.textContent).toContain('Read 2 messages from 2 lines');
    expect(page.elements.dateOrderRow.hidden).toBe(true);
  });

  it('takes a drop without a file, such as dragged text, and leaves the page as it is', () => {
    const scriptedClient = createScriptedClient();
    const page = startTestPage({ scriptedClient });

    const dropEvent = dropFiles(page, []);

    expect(dropEvent.defaultPrevented).toBe(true);
    expect(page.elements.statusLine.hidden).toBe(true);
    expect(scriptedClient.analyseNewText).not.toHaveBeenCalled();
  });
});

describe('files that cannot be shown', () => {
  it('says so when the file holds no messages, and keeps the previous report', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfAna(), 'Ana');

    chooseFile(page, new File(['just some notes, not a chat'], 'notes.txt'));

    await expect(waitForFinalStatus(page)).resolves.toBe(
      'No messages found in that file. Check that it is a WhatsApp chat export (.txt or .zip).',
    );
    expect(reportTitle(page)).toBe('Ana');
  });

  it('explains a zip without a chat inside', async () => {
    const page = startTestPage();
    const zipFile = await buildZipFile(
      new Map([['IMG-0001.jpg', 'not really a picture']]),
      'photos.zip',
    );

    chooseFile(page, zipFile);

    await expect(waitForFinalStatus(page)).resolves.toBe('That zip has no .txt chat file inside.');
  });

  it('shows the explanation of a file the browser could not read, whatever kind of error it is', async () => {
    const page = startTestPage();
    const unreadableFile = fileOfAna();
    /* A rejection that carries a message without being an Error of this page. */
    vi.spyOn(unreadableFile, 'text').mockRejectedValue({
      message: 'The file has been moved or deleted.',
    });

    chooseFile(page, unreadableFile);

    await expect(waitForFinalStatus(page)).resolves.toBe('The file has been moved or deleted.');
    expect(reportTitle(page)).toBe('Marta and Diego (example)');
  });

  it('shows a general sentence when reading fails without any explanation', async () => {
    const page = startTestPage();
    const unreadableFile = fileOfAna();
    vi.spyOn(unreadableFile, 'text').mockRejectedValue(undefined);

    chooseFile(page, unreadableFile);

    await expect(waitForFinalStatus(page)).resolves.toBe('Could not read that file.');
  });

  it('shows the reason when the analysis fails, and keeps the previous report', async () => {
    const scriptedClient = createScriptedClient();
    scriptedClient.analyseNewText.mockResolvedValue({
      kind: 'failed',
      errorMessage: 'The analysis stopped unexpectedly. Load the file again.',
    });
    const page = startTestPage({ scriptedClient });

    chooseFile(page, fileOfAna());

    await expect(waitForFinalStatus(page)).resolves.toBe(
      'The analysis stopped unexpectedly. Load the file again.',
    );
    expect(reportTitle(page)).toBe('Marta and Diego (example)');
    expect(page.elements.sampleNote.hidden).toBe(false);
  });

  it('clears the message again when the next file loads', async () => {
    const page = startTestPage();
    chooseFile(page, new File(['just some notes, not a chat'], 'notes.txt'));
    await waitForFinalStatus(page);

    await loadFile(page, fileOfAna(), 'Ana');

    expect(page.elements.statusLine.hidden).toBe(true);
  });
});

describe('a file that is replaced by another before its analysis has finished', () => {
  it('leaves the page to the newer file: the status stays busy and the report unchanged', async () => {
    const scriptedClient = createScriptedClient();
    scriptedClient.analyseNewText.mockResolvedValueOnce({ kind: 'superseded' });
    const page = startTestPage({ scriptedClient });

    chooseFile(page, fileOfAna());
    await vi.waitFor(() => {
      expect(scriptedClient.analyseNewText).toHaveBeenCalledOnce();
    });
    /* Let the superseded outcome reach the page. */
    await Promise.resolve();
    await Promise.resolve();

    expect(page.elements.statusLine.textContent).toBe(READING_MESSAGES_STATUS);
    expect(page.elements.statusLine.classList.contains('busy')).toBe(true);
    expect(reportTitle(page)).toBe('Marta and Diego (example)');
  });
});

describe('a file with markup in its name and in its messages', () => {
  it('shows all of it as text', async () => {
    const page = startTestPage();
    const hostileText = exportText([
      iphoneLine({ sender: '<img src=x onerror=alert(1)>', text: '<script>alert(2)</script>' }),
    ]);

    await loadFile(
      page,
      new File([hostileText], '<svg onload=alert(3)>.txt'),
      '<svg onload=alert(3)>',
    );

    const { reportContainer } = page.elements;
    expect(reportContainer.querySelectorAll('img, script')).toHaveLength(0);
    expect(reportContainer.querySelectorAll('svg')).toHaveLength(1);
    expect(textsOfElements(reportContainer, '.legend span')).toEqual([
      '<img src=x onerror=alert(1)>',
    ]);
  });
});

describe('hiding names for a screenshot', () => {
  /** Ticks or unticks the checkbox the way a click does. */
  function setHideNames(page: TestPage, isChecked: boolean): void {
    page.elements.hideNamesCheckbox.checked = isChecked;
    page.elements.hideNamesCheckbox.dispatchEvent(new Event('change'));
  }

  it('starts unticked, with the names on display', () => {
    const page = startTestPage();

    expect(page.elements.hideNamesCheckbox.checked).toBe(false);
    expect(reportTitle(page)).toBe('Marta and Diego (example)');
  });

  it('replaces the title, the names and the message texts when ticked', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfAna(), 'Ana');

    setHideNames(page, true);

    const report = page.elements.reportContainer;
    expect(reportTitle(page)).toBe('A chat');
    expect(textsOfElements(report, '.legend span')).toEqual(['Person A', 'Person B']);
    expect(textsOfElements(report, '.bubble-text')).toEqual(['Message hidden', 'Message hidden']);
    expect(report.textContent).not.toContain('Ana');
    expect(report.textContent).not.toContain('happy new year');
  });

  it('brings the names back when unticked, without reading the file again', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfAna(), 'Ana');
    setHideNames(page, true);

    setHideNames(page, false);

    expect(reportTitle(page)).toBe('Ana');
    expect(textsOfElements(page.elements.reportContainer, '.legend span')).toEqual(['Ana', 'Bob']);
    expect(page.analyseOnMainThread).toHaveBeenCalledOnce();
  });

  it('keeps hiding names for the next file that is loaded', async () => {
    const page = startTestPage();
    setHideNames(page, true);

    chooseFile(page, fileOfAna());
    await vi.waitFor(() => {
      expect(page.elements.parseReport.hidden).toBe(false);
    });

    expect(reportTitle(page)).toBe('A chat');
    expect(page.elements.reportContainer.textContent).not.toContain('Ana');
  });

  it('draws the timeline of the report without names', () => {
    const page = startTestPage();

    setHideNames(page, true);

    expect(page.elements.reportContainer.querySelectorAll('#timeline svg')).toHaveLength(1);
  });
});

describe('closing the file picker without choosing a file', () => {
  it('leaves the page as it is', () => {
    const scriptedClient = createScriptedClient();
    const page = startTestPage({ scriptedClient });
    Object.defineProperty(page.elements.fileInput, 'files', { value: [], configurable: true });

    page.elements.fileInput.dispatchEvent(new Event('change'));

    expect(page.elements.statusLine.hidden).toBe(true);
    expect(scriptedClient.analyseNewText).not.toHaveBeenCalled();
    expect(reportTitle(page)).toBe('Marta and Diego (example)');
  });
});

describe('resizing the window', () => {
  /**
   * Starts a page whose timeline container reports a width the test chooses,
   * and counts how often the timeline is drawn from then on: every drawing
   * reads the width of the container exactly once.
   */
  function startPageWithMeasuredTimeline(widthInPixels: number) {
    const page = startTestPage();
    const timelineContainer = findElement(page.elements.reportContainer, '#timeline');
    const readWidth = vi
      .spyOn(timelineContainer, 'clientWidth', 'get')
      .mockReturnValue(widthInPixels);
    const drawnViewBox = (): string | null | undefined =>
      timelineContainer.querySelector('svg')?.getAttribute('viewBox');
    return { page, readWidth, drawnViewBox };
  }

  it('redraws the timeline at the new width', () => {
    vi.useFakeTimers();
    const { page, drawnViewBox } = startPageWithMeasuredTimeline(640);

    page.browserWindow.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(TIMELINE_REDRAW_DELAY_IN_MILLISECONDS);

    expect(drawnViewBox()).toBe('0 0 640 250');
  });

  it('waits until the resizing has paused for 120 milliseconds', () => {
    vi.useFakeTimers();
    const { page, readWidth } = startPageWithMeasuredTimeline(640);

    page.browserWindow.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(119);

    expect(TIMELINE_REDRAW_DELAY_IN_MILLISECONDS).toBe(120);
    expect(readWidth).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(readWidth).toHaveBeenCalledOnce();
  });

  it('redraws once for a burst of resize events, counting the pause from the last of them', () => {
    vi.useFakeTimers();
    const { page, readWidth } = startPageWithMeasuredTimeline(640);

    page.browserWindow.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(100);
    page.browserWindow.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(100);

    expect(readWidth).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);

    expect(readWidth).toHaveBeenCalledOnce();
  });

  it('draws nothing when no chat is on display', () => {
    vi.useFakeTimers();
    const page = startTestPage({ analyseOnMainThread: () => ({ kind: 'empty' }) });

    page.browserWindow.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(TIMELINE_REDRAW_DELAY_IN_MILLISECONDS);

    expect(page.elements.reportContainer.innerHTML).toBe('');
  });
});
