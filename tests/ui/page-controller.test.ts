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
  ANALYSING_PERIOD_STATUS,
  DRAWING_SUMMARY_IMAGE_STATUS,
  NO_MESSAGES_FOUND_STATUS,
  PERIOD_ANALYSIS_DELAY_IN_MILLISECONDS,
  PREPARING_RECAP_STATUS,
  READING_MESSAGES_STATUS,
  SUMMARY_IMAGE_FAILED_STATUS,
  TIMELINE_REDRAW_DELAY_IN_MILLISECONDS,
  WORD_SEARCH_DELAY_IN_MILLISECONDS,
  startPage,
} from '../../src/ui/page-controller';
import type { PageWindow, ProgressListener } from '../../src/ui/page-controller';
import {
  NO_MESSAGES_IN_PERIOD_STATUS,
  PERIOD_ENDS_BEFORE_IT_STARTS_STATUS,
} from '../../src/ui/period';
import { WORD_SEARCH_HINT } from '../../src/ui/sections/word-search';
import { createTooltip } from '../../src/ui/tooltip';
import { analysedResult } from '../fixtures/analysis-builders';
import {
  androidLine,
  androidNoticeLine,
  exportText,
  iphoneLine,
  iphoneNotTypedLine,
} from '../fixtures/export-lines';
import { findElement, textsOfElements } from '../fixtures/markup';
import { loadIndexHtmlBody } from '../fixtures/page';
import { createRecordingSummaryImageServices } from '../fixtures/summary-image';
import type {
  RecordingServicesOptions,
  RecordingSummaryImageServices,
} from '../fixtures/summary-image';
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
 * it, its timers are the test runner's, so a test can control the clock, and
 * its print dialog only records that it was asked for.
 */
class FakeWindow extends EventTarget implements PageWindow {
  public setTimeout(task: () => void, delayInMilliseconds: number): number {
    return window.setTimeout(task, delayInMilliseconds);
  }

  public clearTimeout(timerId: number | undefined): void {
    window.clearTimeout(timerId);
  }

  /** Stands in for the print dialog: it only counts how often it was opened. */
  public readonly print = vi.fn<() => void>();
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
  /** What the browser cannot do when it is asked for the summary image; it can do everything unless stated. */
  readonly summaryImage?: RecordingServicesOptions;
}

/** A started page and the handles a test acts on it through. */
interface TestPage {
  readonly elements: PageElements;
  readonly browserWindow: FakeWindow;
  /** The listener the page gave to its analysis client, to report progress through. */
  readonly reportProgress: ProgressListener;
  /** The analysis the page was given for the example chat. */
  readonly analyseOnMainThread: ReturnType<typeof vi.fn<MainThreadAnalysis>>;
  /** The stand-in the page draws its summary image on, and what it drew and saved. */
  readonly summaryImage: RecordingSummaryImageServices;
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
  const summaryImage = createRecordingSummaryImageServices(options.summaryImage);

  startPage({
    summaryImageServices: summaryImage.services,
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
    summaryImage,
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

  it('appears over a square of the calendar under the pointer', () => {
    const page = startTestPage();
    /* The example chat begins on Monday 5 January 2026. */
    const firstDay = findElement(
      page.elements.reportContainer,
      '.calendar .calendar-day[data-day-key="20260105"]',
    );

    firstDay.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, clientX: 50, clientY: 50 }),
    );

    expect(page.elements.tooltip.hidden).toBe(false);
    expect(page.elements.tooltip.textContent).toContain('Monday, 5 Jan 2026');
  });

  it('follows the pointer to the calendar that a redraw put in place of the old one', () => {
    const page = startTestPage();
    page.elements.hideNamesCheckbox.click();

    const firstDay = findElement(
      page.elements.reportContainer,
      '.calendar .calendar-day[data-day-key="20260105"]',
    );
    firstDay.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));

    expect(page.elements.tooltip.textContent).toContain('Monday, 5 Jan 2026');
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

describe('showing everyone in a large group', () => {
  /** The names of nine invented people; the last ones write least. */
  const NINE_NAMES = ['Ana', 'Bob', 'Carla', 'Dani', 'Elena', 'Fede', 'Gabi', 'Hugo', 'Irene'];

  /**
   * A file in which each of the nine people writes one message fewer than the
   * one before, so Irene, with a single message, is the least active.
   */
  function fileOfNinePeople(): File {
    const lines: string[] = [];
    for (const [index, sender] of NINE_NAMES.entries()) {
      const messageCount = NINE_NAMES.length - index;
      for (let messageIndex = 0; messageIndex < messageCount; messageIndex++) {
        const minute = String(index * 6 + messageIndex).padStart(2, '0');
        lines.push(iphoneLine({ date: '13/01/2024', time: `10:${minute}:00`, sender }));
      }
    }
    return new File([exportText(lines)], 'WhatsApp Chat with The group.txt');
  }

  /** Ticks or unticks the checkbox the way a click does. */
  function setShowEveryone(page: TestPage, isChecked: boolean): void {
    page.elements.showEveryoneCheckbox.checked = isChecked;
    page.elements.showEveryoneCheckbox.dispatchEvent(new Event('change'));
  }

  /** The names in the first column of the "Who says what" table, the first table of the report. */
  function namesInPeopleTable(page: TestPage): string[] {
    const peopleTable = findElement(page.elements.reportContainer, 'table');
    return textsOfElements(peopleTable, 'tbody tr td:first-child');
  }

  it('is not offered for a chat in which nobody is left out', () => {
    const page = startTestPage();

    expect(page.elements.showEveryoneRow.hidden).toBe(true);
  });

  it('is offered, unticked, for a chat with more people than the report lists', async () => {
    const page = startTestPage();

    await loadFile(page, fileOfNinePeople(), 'The group');

    expect(page.elements.showEveryoneRow.hidden).toBe(false);
    expect(page.elements.showEveryoneCheckbox.checked).toBe(false);
    expect(namesInPeopleTable(page)).toEqual(NINE_NAMES.slice(0, 8));
    expect(page.elements.reportContainer.textContent).toContain(
      'Showing the 8 most active of 9 people.',
    );
  });

  it('lists everyone when ticked, without reading the file again', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfNinePeople(), 'The group');

    setShowEveryone(page, true);

    expect(namesInPeopleTable(page)).toEqual(NINE_NAMES);
    expect(page.elements.reportContainer.textContent).not.toContain('most active of');
    expect(page.analyseOnMainThread).toHaveBeenCalledOnce();
  });

  it('goes back to the most active when unticked', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfNinePeople(), 'The group');
    setShowEveryone(page, true);

    setShowEveryone(page, false);

    expect(namesInPeopleTable(page)).toEqual(NINE_NAMES.slice(0, 8));
  });

  it('works together with hidden names', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfNinePeople(), 'The group');
    page.elements.hideNamesCheckbox.checked = true;

    setShowEveryone(page, true);

    const report = page.elements.reportContainer;
    expect(report.textContent).toContain('Person I');
    expect(report.textContent).not.toContain('Irene');
  });

  it('is withdrawn, and has no effect, when a small chat is loaded next', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfNinePeople(), 'The group');
    setShowEveryone(page, true);

    await loadFile(page, fileOfAna(), 'Ana');

    expect(page.elements.showEveryoneRow.hidden).toBe(true);
    expect(textsOfElements(page.elements.reportContainer, '.legend span')).toEqual(['Ana', 'Bob']);
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

describe('choosing a period', () => {
  /**
   * A file that runs from 14 March 2023 to 20 June 2024. Ana and Bob both
   * wrote in 2023; in 2024 Bob wrote alone.
   */
  function fileOverTwoYears(): File {
    const lines = [
      iphoneLine({ date: '14/03/2023', time: '10:00:00', sender: 'Ana', text: 'spring plans' }),
      iphoneLine({ date: '14/03/2023', time: '10:01:00', sender: 'Bob', text: 'count me in' }),
      iphoneLine({ date: '31/12/2023', time: '23:00:00', sender: 'Ana', text: 'happy new year' }),
      iphoneLine({ date: '01/01/2024', time: '00:05:00', sender: 'Bob', text: 'same to you' }),
      iphoneLine({ date: '20/06/2024', time: '18:00:00', sender: 'Bob', text: 'anybody there' }),
    ];
    return new File([exportText(lines)], 'WhatsApp Chat with Two years.txt');
  }

  /**
   * A file whose dates read two ways, more than a year apart either way:
   * 1 February 2023 to 5 June 2024, or 2 January 2023 to 6 May 2024.
   */
  function ambiguousFileOverTwoYears(): File {
    const lines = [
      androidLine({ date: '1/2/23', time: '10:00', sender: 'Carla', text: 'are we still on?' }),
      androidLine({ date: '5/6/24', time: '10:01', sender: 'Dani', text: 'yes, see you there' }),
    ];
    return new File([exportText(lines)], 'WhatsApp Chat with Carla.txt');
  }

  /** Picks an entry of the period list the way the reader does. */
  function choosePeriod(page: TestPage, value: string): void {
    page.elements.periodSelect.value = value;
    page.elements.periodSelect.dispatchEvent(new Event('change'));
  }

  /** Types a date into one of the two date fields and leaves the field. */
  function enterDate(dateField: HTMLInputElement, value: string): void {
    dateField.value = value;
    dateField.dispatchEvent(new Event('change'));
  }

  /** Waits until the line under the title says the report covers the given days. */
  async function waitForReportPeriod(page: TestPage, period: string): Promise<void> {
    await vi.waitFor(() => {
      expect(reportPeriod(page)).toBe(period);
    });
  }

  /** Loads the file over two years and shows the report of one of its periods. */
  async function showPeriodOfTwoYearFile(
    page: TestPage,
    value: string,
    expectedReportPeriod: string,
  ): Promise<void> {
    await loadFile(page, fileOverTwoYears(), 'Two years');
    choosePeriod(page, value);
    await waitForReportPeriod(page, expectedReportPeriod);
  }

  /** What the line under the title says for the whole of the file over two years. */
  const WHOLE_FILE_PERIOD = '14 Mar 2023 to 20 Jun 2024 · 465 days';

  /** What it says for the year 2023 of that file. */
  const YEAR_2023_PERIOD = '14 Mar 2023 to 31 Dec 2023 · 293 days';

  /** What it says for the year 2024 of that file. */
  const YEAR_2024_PERIOD = '1 Jan 2024 to 20 Jun 2024 · 172 days';

  describe('what is offered', () => {
    it('offers the example chat, nine months within one year, its whole span and typed dates', () => {
      const page = startTestPage();
      const { periodRow, periodSelect, periodFromInput, periodToInput, periodNote } = page.elements;

      expect(periodRow.hidden).toBe(false);
      expect(textsOfElements(periodSelect, 'option')).toEqual(['The whole chat', 'Custom range']);
      expect(periodSelect.value).toBe('whole-chat');
      expect(periodFromInput.value).toBe('2026-01-05');
      expect(periodToInput.value).toBe('2026-10-03');
      expect(periodNote.hidden).toBe(true);
    });

    it('is not offered for a chat of a single evening', async () => {
      const page = startTestPage();

      await loadFile(page, fileOfAna(), 'Ana');

      expect(page.elements.periodRow.hidden).toBe(true);
    });

    it('lists the last twelve months and each year of a chat over two years', async () => {
      const page = startTestPage();

      await loadFile(page, fileOverTwoYears(), 'Two years');

      expect(page.elements.periodRow.hidden).toBe(false);
      expect(textsOfElements(page.elements.periodSelect, 'option')).toEqual([
        'The whole chat',
        'Last 12 months',
        '2023',
        '2024',
        'Custom range',
      ]);
    });

    it('starts at the whole chat, with the date fields limited to its days', async () => {
      const page = startTestPage();

      await loadFile(page, fileOverTwoYears(), 'Two years');

      const { periodSelect, periodFromInput, periodToInput } = page.elements;
      expect(periodSelect.value).toBe('whole-chat');
      expect(reportPeriod(page)).toBe(WHOLE_FILE_PERIOD);
      expect(periodFromInput.value).toBe('2023-03-14');
      expect(periodToInput.value).toBe('2024-06-20');
      expect(periodFromInput.min).toBe('2023-03-14');
      expect(periodToInput.max).toBe('2024-06-20');
    });
  });

  describe('a year from the list', () => {
    it('redraws the report for that year only, without reading the file again', async () => {
      const page = startTestPage();

      await showPeriodOfTwoYearFile(page, 'year-2024', YEAR_2024_PERIOD);

      const report = page.elements.reportContainer;
      expect(reportTitle(page)).toBe('Two years');
      expect(textsOfElements(report, '.legend span')).toEqual(['Bob']);
      expect(report.textContent).not.toContain('spring plans');
      expect(page.analyseOnMainThread).toHaveBeenCalledOnce();
    });

    it('fills the date fields with the first and last day of the year within the chat', async () => {
      const page = startTestPage();

      await showPeriodOfTwoYearFile(page, 'year-2023', YEAR_2023_PERIOD);

      expect(page.elements.periodFromInput.value).toBe('2023-03-14');
      expect(page.elements.periodToInput.value).toBe('2023-12-31');
      expect(page.elements.periodSelect.value).toBe('year-2023');
    });

    it('says next to the fields which days the report shows', async () => {
      const page = startTestPage();

      await showPeriodOfTwoYearFile(page, 'year-2023', YEAR_2023_PERIOD);

      expect(page.elements.periodNote.hidden).toBe(false);
      expect(page.elements.periodNote.textContent).toBe(
        'Showing 14 Mar 2023 to 31 Dec 2023, not the whole chat.',
      );
    });

    it('leaves the line about the file as it was, because it describes the whole file', async () => {
      const page = startTestPage();
      await loadFile(page, fileOverTwoYears(), 'Two years');
      const parseReportOfWholeFile = page.elements.parseReport.textContent;

      choosePeriod(page, 'year-2023');
      await waitForReportPeriod(page, YEAR_2023_PERIOD);

      expect(parseReportOfWholeFile).toContain('Read 5 messages');
      expect(page.elements.parseReport.textContent).toBe(parseReportOfWholeFile);
      expect(page.elements.parseReport.hidden).toBe(false);
    });

    it('shows that work is under way before it starts, and fills the date fields meanwhile', async () => {
      const page = startTestPage();
      await loadFile(page, fileOverTwoYears(), 'Two years');

      choosePeriod(page, 'year-2023');

      expect(page.elements.statusLine.textContent).toBe(ANALYSING_PERIOD_STATUS);
      expect(page.elements.statusLine.classList.contains('busy')).toBe(true);
      expect(page.elements.periodToInput.value).toBe('2023-12-31');
      expect(reportPeriod(page)).toBe(WHOLE_FILE_PERIOD);
    });

    it('starts the work 30 milliseconds later, so the status can be painted first', async () => {
      const page = startTestPage();
      await loadFile(page, fileOverTwoYears(), 'Two years');
      vi.useFakeTimers();
      choosePeriod(page, 'year-2023');

      vi.advanceTimersByTime(PERIOD_ANALYSIS_DELAY_IN_MILLISECONDS - 1);
      expect(reportPeriod(page)).toBe(WHOLE_FILE_PERIOD);

      vi.advanceTimersByTime(1);
      expect(reportPeriod(page)).toBe(YEAR_2023_PERIOD);
    });

    it('clears the status once the report is drawn', async () => {
      const page = startTestPage();

      await showPeriodOfTwoYearFile(page, 'year-2023', YEAR_2023_PERIOD);

      expect(page.elements.statusLine.hidden).toBe(true);
      expect(page.elements.statusLine.classList.contains('busy')).toBe(false);
    });

    it('draws only the later of two choices made in quick succession', async () => {
      const page = startTestPage();
      await loadFile(page, fileOverTwoYears(), 'Two years');
      vi.useFakeTimers();

      choosePeriod(page, 'year-2023');
      choosePeriod(page, 'year-2024');
      vi.advanceTimersByTime(PERIOD_ANALYSIS_DELAY_IN_MILLISECONDS);

      expect(reportPeriod(page)).toBe(YEAR_2024_PERIOD);
      expect(page.elements.periodSelect.value).toBe('year-2024');
      expect(vi.getTimerCount()).toBe(0);
    });

    it('draws the last twelve months from the day after the same date a year earlier', async () => {
      const page = startTestPage();

      await showPeriodOfTwoYearFile(
        page,
        'last-12-months',
        '31 Dec 2023 to 20 Jun 2024 · 173 days',
      );

      expect(page.elements.periodFromInput.value).toBe('2023-06-21');
      expect(page.elements.periodNote.textContent).toBe(
        'Showing 21 Jun 2023 to 20 Jun 2024, not the whole chat.',
      );
    });
  });

  describe('going back to the whole chat', () => {
    it('redraws it at once, from the analysis the page kept', async () => {
      const page = startTestPage();
      await showPeriodOfTwoYearFile(page, 'year-2023', YEAR_2023_PERIOD);

      choosePeriod(page, 'whole-chat');

      expect(reportPeriod(page)).toBe(WHOLE_FILE_PERIOD);
      expect(page.elements.periodFromInput.value).toBe('2023-03-14');
      expect(page.elements.periodToInput.value).toBe('2024-06-20');
      expect(page.elements.periodNote.hidden).toBe(true);
      expect(page.elements.statusLine.hidden).toBe(true);
      expect(page.analyseOnMainThread).toHaveBeenCalledOnce();
    });

    it('gives up a period that was chosen a moment earlier and is not drawn yet', async () => {
      const page = startTestPage();
      await loadFile(page, fileOverTwoYears(), 'Two years');
      vi.useFakeTimers();
      choosePeriod(page, 'year-2023');

      choosePeriod(page, 'whole-chat');
      vi.advanceTimersByTime(PERIOD_ANALYSIS_DELAY_IN_MILLISECONDS);

      expect(reportPeriod(page)).toBe(WHOLE_FILE_PERIOD);
      expect(page.elements.statusLine.hidden).toBe(true);
    });
  });

  describe('dates typed by hand', () => {
    it('turn the list to "Custom range" and redraw the report for the days between them', async () => {
      const page = startTestPage();
      await loadFile(page, fileOverTwoYears(), 'Two years');

      enterDate(page.elements.periodFromInput, '2023-12-31');
      expect(page.elements.periodSelect.value).toBe('custom');
      await waitForReportPeriod(page, '31 Dec 2023 to 20 Jun 2024 · 173 days');

      expect(page.elements.periodSelect.value).toBe('custom');
      expect(page.elements.periodNote.textContent).toBe(
        'Showing 31 Dec 2023 to 20 Jun 2024, not the whole chat.',
      );
    });

    it('include the messages of both the first and the last day', async () => {
      const page = startTestPage();
      await loadFile(page, fileOverTwoYears(), 'Two years');

      enterDate(page.elements.periodFromInput, '2023-12-31');
      enterDate(page.elements.periodToInput, '2024-01-01');
      await waitForReportPeriod(page, '31 Dec 2023 to 1 Jan 2024 · 2 days');

      /* Ana wrote at 23:00 on the first day and Bob at 00:05 on the last. */
      const report = page.elements.reportContainer;
      expect(textsOfElements(report, '.legend span')).toEqual(['Ana', 'Bob']);
      expect(textsOfElements(report, '.bubble-text')).toContain('happy new year');
    });

    it('show the list entry of a ready-made period when they match one exactly', async () => {
      const page = startTestPage();
      await loadFile(page, fileOverTwoYears(), 'Two years');

      enterDate(page.elements.periodToInput, '2023-12-31');
      await waitForReportPeriod(page, YEAR_2023_PERIOD);

      expect(page.elements.periodSelect.value).toBe('year-2023');
    });

    it('take an emptied field as the end of the chat on that side', async () => {
      const page = startTestPage();
      await showPeriodOfTwoYearFile(page, 'year-2024', YEAR_2024_PERIOD);

      enterDate(page.elements.periodFromInput, '');

      expect(reportPeriod(page)).toBe(WHOLE_FILE_PERIOD);
      expect(page.elements.periodFromInput.value).toBe('2023-03-14');
      expect(page.elements.periodSelect.value).toBe('whole-chat');
    });

    it('redraw the example chat for a month of it', async () => {
      const page = startTestPage();

      enterDate(page.elements.periodFromInput, '2026-03-01');
      enterDate(page.elements.periodToInput, '2026-03-31');
      await vi.waitFor(() => {
        expect(page.elements.periodNote.textContent).toBe(
          'Showing 1 Mar 2026 to 31 Mar 2026, not the whole chat.',
        );
      });

      expect(reportPeriod(page)).toMatch(/^\d+ Mar 2026 to \d+ Mar 2026 · \d+ days$/);
      expect(page.elements.sampleNote.hidden).toBe(false);
      expect(page.analyseOnMainThread).toHaveBeenCalledOnce();
    });
  });

  describe('dates that cannot be used', () => {
    it('leave the report as it is and say so when "from" is after "to"', async () => {
      const page = startTestPage();
      await showPeriodOfTwoYearFile(page, 'year-2023', YEAR_2023_PERIOD);

      enterDate(page.elements.periodFromInput, '2024-01-01');

      expect(page.elements.statusLine.textContent).toBe(PERIOD_ENDS_BEFORE_IT_STARTS_STATUS);
      expect(page.elements.statusLine.hidden).toBe(false);
      expect(page.elements.statusLine.classList.contains('busy')).toBe(false);
      expect(reportPeriod(page)).toBe(YEAR_2023_PERIOD);
    });

    it('keep the typed dates in the fields, so they can be corrected, and the note on what is shown', async () => {
      const page = startTestPage();
      await showPeriodOfTwoYearFile(page, 'year-2023', YEAR_2023_PERIOD);

      enterDate(page.elements.periodFromInput, '2024-01-01');

      expect(page.elements.periodFromInput.value).toBe('2024-01-01');
      expect(page.elements.periodToInput.value).toBe('2023-12-31');
      expect(page.elements.periodSelect.value).toBe('custom');
      expect(page.elements.periodNote.textContent).toBe(
        'Showing 14 Mar 2023 to 31 Dec 2023, not the whole chat.',
      );
    });

    it('leave the report as it is and say so when nobody wrote between the dates', async () => {
      const page = startTestPage();
      await loadFile(page, fileOverTwoYears(), 'Two years');

      enterDate(page.elements.periodFromInput, '2023-04-01');
      enterDate(page.elements.periodToInput, '2023-11-30');

      expect(await waitForFinalStatus(page)).toBe(NO_MESSAGES_IN_PERIOD_STATUS);
      expect(reportPeriod(page)).toBe(WHOLE_FILE_PERIOD);
      expect(page.elements.periodNote.hidden).toBe(true);
    });

    it('say the same at once when both dates lie before the chat began', async () => {
      const page = startTestPage();
      await loadFile(page, fileOverTwoYears(), 'Two years');
      page.elements.periodToInput.value = '2022-12-31';

      enterDate(page.elements.periodFromInput, '2022-01-01');

      expect(page.elements.statusLine.textContent).toBe(NO_MESSAGES_IN_PERIOD_STATUS);
      expect(reportPeriod(page)).toBe(WHOLE_FILE_PERIOD);
    });

    it('drop the message again when a usable period is chosen next', async () => {
      const page = startTestPage();
      await showPeriodOfTwoYearFile(page, 'year-2023', YEAR_2023_PERIOD);
      enterDate(page.elements.periodFromInput, '2024-01-01');

      choosePeriod(page, 'year-2023');

      expect(page.elements.statusLine.hidden).toBe(true);
      expect(page.elements.periodFromInput.value).toBe('2023-03-14');
      expect(reportPeriod(page)).toBe(YEAR_2023_PERIOD);
    });
  });

  describe('together with the other switches', () => {
    it('hides the names of the period on display, not of the whole chat', async () => {
      const page = startTestPage();
      await showPeriodOfTwoYearFile(page, 'year-2024', YEAR_2024_PERIOD);

      page.elements.hideNamesCheckbox.checked = true;
      page.elements.hideNamesCheckbox.dispatchEvent(new Event('change'));

      const report = page.elements.reportContainer;
      expect(reportTitle(page)).toBe('A chat');
      expect(reportPeriod(page)).toBe(YEAR_2024_PERIOD);
      expect(textsOfElements(report, '.legend span')).toEqual(['Person A']);
    });

    it('draws a period that is chosen while names are hidden without names', async () => {
      const page = startTestPage();
      await loadFile(page, fileOverTwoYears(), 'Two years');
      page.elements.hideNamesCheckbox.checked = true;

      choosePeriod(page, 'year-2023');
      await waitForReportPeriod(page, YEAR_2023_PERIOD);

      const report = page.elements.reportContainer;
      expect(textsOfElements(report, '.legend span')).toEqual(['Person A', 'Person B']);
      expect(report.textContent).not.toContain('Ana');
      expect(report.textContent).not.toContain('happy new year');
    });

    it('keeps the period when "show everyone" is ticked', async () => {
      const page = startTestPage();
      await showPeriodOfTwoYearFile(page, 'year-2023', YEAR_2023_PERIOD);

      page.elements.showEveryoneCheckbox.checked = true;
      page.elements.showEveryoneCheckbox.dispatchEvent(new Event('change'));

      expect(reportPeriod(page)).toBe(YEAR_2023_PERIOD);
    });
  });

  describe('when the chat on display changes', () => {
    it('goes back to the whole chat for the next file that is loaded', async () => {
      const page = startTestPage();
      await showPeriodOfTwoYearFile(page, 'year-2023', YEAR_2023_PERIOD);

      await loadFile(page, ambiguousFileOverTwoYears(), 'Carla');

      expect(page.elements.periodSelect.value).toBe('whole-chat');
      expect(page.elements.periodNote.hidden).toBe(true);
      expect(page.elements.periodFromInput.value).toBe('2023-02-01');
      expect(page.elements.periodToInput.value).toBe('2024-06-05');
      expect(reportPeriod(page)).toContain('1 Feb 2023 to 5 Jun 2024');
    });

    it('withdraws the row when a chat of a single evening is loaded next', async () => {
      const page = startTestPage();
      await showPeriodOfTwoYearFile(page, 'year-2023', YEAR_2023_PERIOD);

      await loadFile(page, fileOfAna(), 'Ana');

      expect(page.elements.periodRow.hidden).toBe(true);
      expect(page.elements.periodNote.hidden).toBe(true);
    });

    it('goes back to the whole chat when the date order is switched', async () => {
      const page = startTestPage();
      await loadFile(page, ambiguousFileOverTwoYears(), 'Carla');
      choosePeriod(page, 'year-2023');
      await waitForReportPeriod(page, '1 Feb 2023 to 1 Feb 2023 · 1 day');

      page.elements.switchDateOrderButton.click();
      await vi.waitFor(() => {
        expect(page.elements.dateOrderMessage.textContent).toContain(
          'Reading them as month/day/year.',
        );
      });

      expect(page.elements.periodSelect.value).toBe('whole-chat');
      expect(page.elements.periodNote.hidden).toBe(true);
      expect(page.elements.periodFromInput.value).toBe('2023-01-02');
      expect(reportPeriod(page)).toContain('2 Jan 2023 to 6 May 2024');
    });

    it('gives up a period that is not drawn yet when another file is chosen', () => {
      const scriptedClient = createScriptedClient();
      const page = startTestPage({ scriptedClient });
      const exampleChatPeriod = reportPeriod(page);
      vi.useFakeTimers();
      enterDate(page.elements.periodFromInput, '2026-03-01');

      chooseFile(page, fileOfAna());
      vi.advanceTimersByTime(PERIOD_ANALYSIS_DELAY_IN_MILLISECONDS);

      expect(reportPeriod(page)).toBe(exampleChatPeriod);
      expect(page.elements.statusLine.textContent).toBe('Opening WhatsApp Chat with Ana.txt …');
      expect(page.elements.periodSelect.value).toBe('whole-chat');
      expect(page.elements.periodFromInput.value).toBe('2026-01-05');
    });

    it('gives up a period that is not drawn yet when the date order is switched', async () => {
      const page = startTestPage();
      await loadFile(page, ambiguousFileOverTwoYears(), 'Carla');
      choosePeriod(page, 'year-2023');

      page.elements.switchDateOrderButton.click();
      await vi.waitFor(() => {
        expect(reportPeriod(page)).toContain('2 Jan 2023 to 6 May 2024');
      });
      await new Promise((resolve) => {
        window.setTimeout(resolve, PERIOD_ANALYSIS_DELAY_IN_MILLISECONDS * 2);
      });

      expect(reportPeriod(page)).toContain('2 Jan 2023 to 6 May 2024');
      expect(page.elements.periodSelect.value).toBe('whole-chat');
    });
  });

  it('does nothing while no chat is on display', () => {
    const page = startTestPage({ analyseOnMainThread: () => ({ kind: 'empty' }) });
    vi.useFakeTimers();

    choosePeriod(page, 'custom');
    enterDate(page.elements.periodFromInput, '2024-01-01');
    vi.runAllTimers();

    expect(page.elements.statusLine.textContent).toBe(NO_MESSAGES_FOUND_STATUS);
    expect(page.elements.reportContainer.textContent).toBe('');
  });
});

describe('saving a summary image', () => {
  /** Presses the button and waits until the page has handed a file to the browser. */
  async function saveImage(page: TestPage): Promise<void> {
    const savedBefore = page.summaryImage.savedFiles.length;
    page.elements.saveSummaryImageButton.click();
    await vi.waitFor(() => {
      expect(page.summaryImage.savedFiles).toHaveLength(savedBefore + 1);
    });
  }

  /** The texts the page wrote on the image. */
  function imageTexts(page: TestPage): string[] {
    return page.summaryImage.context.writtenTexts();
  }

  /** Ticks or unticks "hide names" the way a click does. */
  function setHideNames(page: TestPage, isChecked: boolean): void {
    page.elements.hideNamesCheckbox.checked = isChecked;
    page.elements.hideNamesCheckbox.dispatchEvent(new Event('change'));
  }

  /**
   * A file that runs from 14 March 2023 to 20 June 2024. Ana and Bob both
   * wrote in 2023; in 2024 Bob wrote alone.
   */
  function fileOverTwoYears(): File {
    const lines = [
      iphoneLine({ date: '14/03/2023', time: '10:00:00', sender: 'Ana', text: 'spring plans' }),
      iphoneLine({ date: '14/03/2023', time: '10:01:00', sender: 'Bob', text: 'count me in' }),
      iphoneLine({ date: '31/12/2023', time: '23:00:00', sender: 'Ana', text: 'happy new year' }),
      iphoneLine({ date: '01/01/2024', time: '00:05:00', sender: 'Bob', text: 'same to you' }),
      iphoneLine({ date: '20/06/2024', time: '18:00:00', sender: 'Bob', text: 'anybody there' }),
    ];
    return new File([exportText(lines)], 'WhatsApp Chat with Two years.txt');
  }

  it('draws nothing until the button is pressed', () => {
    const page = startTestPage();

    expect(page.summaryImage.surfaceSizes).toEqual([]);
    expect(page.summaryImage.savedFiles).toEqual([]);
  });

  it('saves one PNG file of the chat on display, the example at first', async () => {
    const page = startTestPage();

    await saveImage(page);

    expect(page.summaryImage.savedFiles.map((savedFile) => savedFile.fileName)).toEqual([
      'chat-summary.png',
    ]);
    expect(page.summaryImage.surfaceSizes).toEqual([[1080, 1350]]);
    expect(imageTexts(page)).toEqual(
      expect.arrayContaining(['Marta and Diego (example)', 'Marta', 'Diego', 'MOST ACTIVE']),
    );
  });

  it('writes the title, the period, the total and the people of a loaded file', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfAna(), 'Ana');

    await saveImage(page);

    expect(imageTexts(page)).toEqual(
      expect.arrayContaining([
        'Ana',
        '31 Dec 2023 to 31 Dec 2023 · 1 day',
        '2',
        'messages',
        '1 · 50%',
        'Bob',
        'BUSIEST DAY',
        '31 Dec 2023',
        '2 messages',
      ]),
    );
  });

  it('does not read the file again', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfAna(), 'Ana');

    await saveImage(page);

    expect(page.analyseOnMainThread).toHaveBeenCalledOnce();
  });

  it('leaves the status line empty once the file is saved', async () => {
    const page = startTestPage();

    await saveImage(page);

    await vi.waitFor(() => {
      expect(page.elements.statusLine.hidden).toBe(true);
    });
  });

  it('says that it is drawing while it draws', () => {
    const page = startTestPage();

    page.elements.saveSummaryImageButton.click();

    expect(page.elements.statusLine.textContent).toBe(DRAWING_SUMMARY_IMAGE_STATUS);
    expect(page.elements.statusLine.classList.contains('busy')).toBe(true);
  });

  it('writes neutral labels and a neutral title while names are hidden', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfAna(), 'Ana');
    setHideNames(page, true);

    await saveImage(page);

    /* Whole words only: the footer of the image names the "Analyzer". */
    const texts = imageTexts(page);
    expect(texts).toEqual(expect.arrayContaining(['A chat', 'Person A', 'Person B']));
    expect(texts.join(' ')).not.toMatch(/\b(Ana|Bob)\b/u);
    expect(page.summaryImage.savedFiles[0]?.fileName).not.toMatch(/\b(Ana|Bob)\b/u);
  });

  it('asks for the fonts with the labels, not with the names, while names are hidden', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfAna(), 'Ana');
    setHideNames(page, true);

    await saveImage(page);

    const requestedTexts = page.summaryImage.fontRequests.map((fontRequest) => fontRequest.text);
    expect(requestedTexts.join(' ')).toContain('Person A');
    expect(requestedTexts.join(' ')).not.toMatch(/\b(Ana|Bob)\b/u);
  });

  it('writes the names again once they are shown again', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfAna(), 'Ana');
    setHideNames(page, true);
    setHideNames(page, false);

    await saveImage(page);

    expect(imageTexts(page)).toEqual(expect.arrayContaining(['Ana', 'Bob']));
    expect(imageTexts(page)).not.toContain('Person A');
  });

  it('draws the period on display, not the whole chat', async () => {
    const page = startTestPage();
    await loadFile(page, fileOverTwoYears(), 'Two years');
    page.elements.periodSelect.value = 'year-2024';
    page.elements.periodSelect.dispatchEvent(new Event('change'));
    await vi.waitFor(() => {
      expect(reportPeriod(page)).toBe('1 Jan 2024 to 20 Jun 2024 · 172 days');
    });

    await saveImage(page);

    const texts = imageTexts(page);
    expect(texts).toEqual(
      expect.arrayContaining(['Two years', '1 Jan 2024 to 20 Jun 2024 · 172 days', 'Bob']),
    );
    /* Ana wrote in 2023 only. */
    expect(texts).not.toContain('Ana');
    expect(texts).toContain('2 · 100%');
  });

  it('draws a new image each time the button is pressed', async () => {
    const page = startTestPage();

    await saveImage(page);
    await saveImage(page);

    expect(page.summaryImage.savedFiles).toHaveLength(2);
  });

  it('says so and saves nothing in a browser that cannot draw', async () => {
    const page = startTestPage({ summaryImage: { canDraw: false } });

    page.elements.saveSummaryImageButton.click();

    await waitForStatus(page, SUMMARY_IMAGE_FAILED_STATUS);
    expect(page.elements.statusLine.classList.contains('busy')).toBe(false);
    expect(page.summaryImage.savedFiles).toEqual([]);
  });

  it('says so when the browser refuses the download', async () => {
    const page = startTestPage();
    vi.spyOn(page.summaryImage.services, 'saveFile').mockImplementation(() => {
      throw new Error('downloads are blocked');
    });

    page.elements.saveSummaryImageButton.click();

    await waitForStatus(page, SUMMARY_IMAGE_FAILED_STATUS);
  });

  it('keeps the report on display whatever happens to the image', async () => {
    const page = startTestPage({ summaryImage: { canEncode: false } });
    await loadFile(page, fileOfAna(), 'Ana');

    page.elements.saveSummaryImageButton.click();
    await waitForStatus(page, SUMMARY_IMAGE_FAILED_STATUS);

    expect(reportTitle(page)).toBe('Ana');
  });
});

describe('printing the report', () => {
  it('does not open the print dialog until the button is pressed', async () => {
    const page = startTestPage();

    await loadFile(page, fileOfAna(), 'Ana');

    expect(page.browserWindow.print).not.toHaveBeenCalled();
  });

  it('opens the print dialog of the window when the button is pressed', () => {
    const page = startTestPage();

    page.elements.printButton.click();

    expect(page.browserWindow.print).toHaveBeenCalledExactlyOnceWith();
  });

  it('opens it again for every press', () => {
    const page = startTestPage();

    page.elements.printButton.click();
    page.elements.printButton.click();

    expect(page.browserWindow.print).toHaveBeenCalledTimes(2);
  });

  it('prints the report as it is on display: nothing is redrawn or read again', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfAna(), 'Ana');
    const reportBefore = page.elements.reportContainer.innerHTML;

    page.elements.printButton.click();

    expect(page.elements.reportContainer.innerHTML).toBe(reportBefore);
    expect(page.analyseOnMainThread).toHaveBeenCalledOnce();
    expect(page.elements.statusLine.hidden).toBe(true);
  });

  it('draws no summary image', () => {
    const page = startTestPage();

    page.elements.printButton.click();

    expect(page.summaryImage.surfaceSizes).toEqual([]);
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

describe('looking at one person up close', () => {
  /** The names of nine invented people; the last ones write least. */
  const NINE_NAMES = ['Ana', 'Bob', 'Carla', 'Dani', 'Elena', 'Fede', 'Gabi', 'Hugo', 'Irene'];

  /** The position of Irene, who writes least and is left out of the other sections. */
  const IRENE_INDEX = 8;

  /**
   * A file in which each of the nine people writes one message fewer than the
   * one before, so Irene, with a single message, is the least active.
   */
  function fileOfNinePeople(): File {
    const lines: string[] = [];
    for (const [index, sender] of NINE_NAMES.entries()) {
      const messageCount = NINE_NAMES.length - index;
      for (let messageIndex = 0; messageIndex < messageCount; messageIndex++) {
        const minute = String(index * 6 + messageIndex).padStart(2, '0');
        lines.push(iphoneLine({ date: '13/01/2024', time: `10:${minute}:00`, sender }));
      }
    }
    return new File([exportText(lines)], 'WhatsApp Chat with The group.txt');
  }

  /**
   * A file that runs from 14 March 2023 to 20 June 2024. Bob wrote most
   * overall, Ana wrote most in 2023, and in 2024 Bob wrote alone.
   */
  function fileOverTwoYears(): File {
    const lines = [
      iphoneLine({ date: '14/03/2023', time: '10:00:00', sender: 'Ana', text: 'spring plans' }),
      iphoneLine({ date: '14/03/2023', time: '10:01:00', sender: 'Bob', text: 'count me in' }),
      iphoneLine({ date: '31/12/2023', time: '23:00:00', sender: 'Ana', text: 'happy new year' }),
      iphoneLine({ date: '01/01/2024', time: '00:05:00', sender: 'Bob', text: 'same to you' }),
      iphoneLine({ date: '20/06/2024', time: '18:00:00', sender: 'Bob', text: 'anybody there' }),
    ];
    return new File([exportText(lines)], 'WhatsApp Chat with Two years.txt');
  }

  /** The list of people in the report on display. */
  function personSelect(page: TestPage): HTMLSelectElement {
    const select = findElement(page.elements.reportContainer, '#person-profile-select');
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('The list of people is not a select');
    }
    return select;
  }

  /** Picks a person in the list the way the reader does. */
  function choosePerson(page: TestPage, personIndex: number): void {
    const select = personSelect(page);
    select.value = String(personIndex);
    select.dispatchEvent(new Event('change'));
  }

  /** The name at the top of the profile on display. */
  function profiledName(page: TestPage): string | undefined {
    return textsOfElements(page.elements.reportContainer, '#person-profile .profile-name b')[0];
  }

  /** Picks an entry of the period list and waits for the report of that period. */
  async function showPeriod(page: TestPage, value: string, expectedPeriod: string): Promise<void> {
    page.elements.periodSelect.value = value;
    page.elements.periodSelect.dispatchEvent(new Event('change'));
    await vi.waitFor(() => {
      expect(reportPeriod(page)).toBe(expectedPeriod);
    });
  }

  it('starts with the most active person of the example chat, and offers both', () => {
    const page = startTestPage();

    const options = textsOfElements(personSelect(page), 'option');

    expect(options).toHaveLength(2);
    expect(options[0]).toContain(profiledName(page));
    expect(personSelect(page).value).toBe('0');
  });

  it('offers everyone in a large group, whatever the other sections list', async () => {
    const page = startTestPage();

    await loadFile(page, fileOfNinePeople(), 'The group');

    expect(page.elements.showEveryoneCheckbox.checked).toBe(false);
    expect(textsOfElements(personSelect(page), 'option')).toEqual([
      'Ana (9 messages)',
      'Bob (8 messages)',
      'Carla (7 messages)',
      'Dani (6 messages)',
      'Elena (5 messages)',
      'Fede (4 messages)',
      'Gabi (3 messages)',
      'Hugo (2 messages)',
      'Irene (1 message)',
    ]);
  });

  it('draws the profile of the person picked, without reading the file again', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfNinePeople(), 'The group');

    choosePerson(page, IRENE_INDEX);

    const profile = findElement(page.elements.reportContainer, '#person-profile');
    expect(profiledName(page)).toBe('Irene');
    expect(profile.textContent).toContain('Rank 9 of 9 by messages sent');
    expect(page.analyseOnMainThread).toHaveBeenCalledOnce();
  });

  it('leaves the rest of the report, and the list itself, in place', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfNinePeople(), 'The group');
    const selectBefore = personSelect(page);
    const headingBefore = findElement(page.elements.reportContainer, '.chat-heading');

    choosePerson(page, IRENE_INDEX);

    expect(personSelect(page)).toBe(selectBefore);
    expect(findElement(page.elements.reportContainer, '.chat-heading')).toBe(headingBefore);
  });

  it('keeps the person picked on display when everyone is listed', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfNinePeople(), 'The group');
    choosePerson(page, IRENE_INDEX);

    page.elements.showEveryoneCheckbox.checked = true;
    page.elements.showEveryoneCheckbox.dispatchEvent(new Event('change'));

    expect(profiledName(page)).toBe('Irene');
    expect(personSelect(page).value).toBe(String(IRENE_INDEX));
  });

  it('relabels the list and the profile when names are hidden, keeping the person picked', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfNinePeople(), 'The group');
    choosePerson(page, IRENE_INDEX);

    page.elements.hideNamesCheckbox.checked = true;
    page.elements.hideNamesCheckbox.dispatchEvent(new Event('change'));

    expect(profiledName(page)).toBe('Person I');
    expect(textsOfElements(personSelect(page), 'option')[IRENE_INDEX]).toBe('Person I (1 message)');
    expect(page.elements.reportContainer.textContent).not.toContain('Irene');
  });

  it('shows a label, not a name, for a person picked while names are hidden', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfNinePeople(), 'The group');
    page.elements.hideNamesCheckbox.checked = true;
    page.elements.hideNamesCheckbox.dispatchEvent(new Event('change'));

    choosePerson(page, 1);

    expect(profiledName(page)).toBe('Person B');
    expect(page.elements.reportContainer.textContent).not.toContain('Bob');
  });

  it('shows the same person by name again when the names come back', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfNinePeople(), 'The group');
    page.elements.hideNamesCheckbox.checked = true;
    page.elements.hideNamesCheckbox.dispatchEvent(new Event('change'));
    choosePerson(page, 1);

    page.elements.hideNamesCheckbox.checked = false;
    page.elements.hideNamesCheckbox.dispatchEvent(new Event('change'));

    expect(profiledName(page)).toBe('Bob');
  });

  it('goes back to the most active person when another file is loaded', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfNinePeople(), 'The group');
    choosePerson(page, 1);

    await loadFile(page, fileOfAna(), 'Ana');

    expect(profiledName(page)).toBe('Ana');
    expect(personSelect(page).value).toBe('0');
  });

  it('follows the person picked into a period in which they rank differently', async () => {
    const page = startTestPage();
    await loadFile(page, fileOverTwoYears(), 'Two years');
    /* Over the whole file Bob wrote three messages and Ana two, so Ana is second. */
    choosePerson(page, 1);
    expect(profiledName(page)).toBe('Ana');

    await showPeriod(page, 'year-2023', '14 Mar 2023 to 31 Dec 2023 · 293 days');

    /* In 2023 Ana wrote two messages and Bob one, so Ana is first. */
    expect(profiledName(page)).toBe('Ana');
    expect(personSelect(page).value).toBe('0');
  });

  it('remembers the person picked across a period in which only one person wrote', async () => {
    const page = startTestPage();
    await loadFile(page, fileOverTwoYears(), 'Two years');
    choosePerson(page, 1);

    await showPeriod(page, 'year-2024', '1 Jan 2024 to 20 Jun 2024 · 172 days');

    expect(page.elements.reportContainer.querySelector('#person-profile-select')).toBeNull();

    await showPeriod(page, 'whole-chat', '14 Mar 2023 to 20 Jun 2024 · 465 days');

    expect(profiledName(page)).toBe('Ana');
  });

  it('leaves the profile as it is for a choice that stands for nobody', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfNinePeople(), 'The group');
    const select = personSelect(page);
    select.append(new Option('Nobody', '99'));

    choosePerson(page, 99);

    expect(profiledName(page)).toBe('Ana');
  });
});

describe('looking up a word', () => {
  /** The names of nine invented people; the last ones write least. */
  const NINE_NAMES = ['Ana', 'Bob', 'Carla', 'Dani', 'Elena', 'Fede', 'Gabi', 'Hugo', 'Irene'];

  /**
   * A file that runs from 14 March 2023 to 20 June 2024. "spring" is in three
   * of its five messages: one from Ana and one from Bob in 2023, and one from
   * Bob, who wrote alone that year, in 2024.
   */
  function fileAboutSpring(): File {
    const lines = [
      iphoneLine({ date: '14/03/2023', time: '10:00:00', sender: 'Ana', text: 'Spring plans' }),
      iphoneLine({ date: '14/03/2023', time: '10:01:00', sender: 'Bob', text: 'spring it is' }),
      iphoneLine({ date: '31/12/2023', time: '23:00:00', sender: 'Ana', text: 'happy new year' }),
      iphoneLine({ date: '01/01/2024', time: '00:05:00', sender: 'Bob', text: 'same to you' }),
      iphoneLine({ date: '20/06/2024', time: '18:00:00', sender: 'Bob', text: 'spring is over' }),
    ];
    return new File([exportText(lines)], 'WhatsApp Chat with Two years.txt');
  }

  /**
   * A file in which each of the nine people writes "hello" one time fewer
   * than the one before, so Irene, with a single message, is the least active.
   */
  function fileOfNinePeople(): File {
    const lines: string[] = [];
    for (const [index, sender] of NINE_NAMES.entries()) {
      const messageCount = NINE_NAMES.length - index;
      for (let messageIndex = 0; messageIndex < messageCount; messageIndex++) {
        const minute = String(index * 6 + messageIndex).padStart(2, '0');
        lines.push(iphoneLine({ date: '13/01/2024', time: `10:${minute}:00`, sender }));
      }
    }
    return new File([exportText(lines)], 'WhatsApp Chat with The group.txt');
  }

  /** A file of two stickers and not one typed word. */
  function fileOfStickers(): File {
    const lines = [
      iphoneNotTypedLine({
        date: '13/01/2024',
        time: '10:00:00',
        sender: 'Ana',
        text: 'sticker omitted',
      }),
      iphoneNotTypedLine({
        date: '13/01/2024',
        time: '10:01:00',
        sender: 'Bob',
        text: 'sticker omitted',
      }),
    ];
    return new File([exportText(lines)], 'WhatsApp Chat with Stickers.txt');
  }

  /** The field of the report on display. */
  function searchField(page: TestPage): HTMLInputElement {
    const field = findElement(page.elements.reportContainer, '#word-search-input');
    if (!(field instanceof HTMLInputElement)) {
      throw new Error('The search field is not an input');
    }
    return field;
  }

  /** Types into the field the way the reader does: the text changes and an `input` event fires. */
  function typeWords(page: TestPage, words: string): void {
    const field = searchField(page);
    field.value = words;
    field.dispatchEvent(new Event('input'));
  }

  /** Types into the field and waits out the pause after which the page searches. */
  function lookUp(page: TestPage, words: string): void {
    vi.useFakeTimers();
    typeWords(page, words);
    vi.advanceTimersByTime(WORD_SEARCH_DELAY_IN_MILLISECONDS);
    vi.useRealTimers();
  }

  /** The paragraphs under the field. */
  function outcomeParagraphs(page: TestPage): string[] {
    return textsOfElements(page.elements.reportContainer, '#word-search-result p');
  }

  /** The sentence that sums the search up, when there is one. */
  function outcomeSummary(page: TestPage): string | undefined {
    return textsOfElements(
      page.elements.reportContainer,
      '#word-search-result .word-search-summary',
    )[0];
  }

  /** The names next to the bars of "Who says it most". */
  function namesNextToBars(page: TestPage): string[] {
    return textsOfElements(page.elements.reportContainer, '#word-search-result .bar-label');
  }

  /** Ticks or unticks a checkbox the way a click does. */
  function setChecked(checkbox: HTMLInputElement, isChecked: boolean): void {
    checkbox.checked = isChecked;
    checkbox.dispatchEvent(new Event('change'));
  }

  it('starts with an empty field and a hint under it', () => {
    const page = startTestPage();

    expect(searchField(page).value).toBe('');
    expect(outcomeParagraphs(page)).toEqual([WORD_SEARCH_HINT]);
  });

  it('searches 250 milliseconds after the last keystroke, and not before', async () => {
    const page = startTestPage();
    await loadFile(page, fileAboutSpring(), 'Two years');
    vi.useFakeTimers();

    typeWords(page, 'spring');
    vi.advanceTimersByTime(WORD_SEARCH_DELAY_IN_MILLISECONDS - 1);
    expect(outcomeParagraphs(page)).toEqual([WORD_SEARCH_HINT]);

    vi.advanceTimersByTime(1);
    /* Three of the five messages are 60%. */
    expect(outcomeSummary(page)).toBe('“spring” is in 3 of 5 written messages (60%).');
  });

  it('searches once for a word typed letter by letter, counting the pause from the last letter', async () => {
    const page = startTestPage();
    await loadFile(page, fileAboutSpring(), 'Two years');
    vi.useFakeTimers();

    typeWords(page, 'spr');
    vi.advanceTimersByTime(WORD_SEARCH_DELAY_IN_MILLISECONDS - 1);
    typeWords(page, 'spring');
    vi.advanceTimersByTime(WORD_SEARCH_DELAY_IN_MILLISECONDS - 1);
    expect(outcomeParagraphs(page)).toEqual([WORD_SEARCH_HINT]);

    vi.advanceTimersByTime(1);
    expect(outcomeSummary(page)).toBe('“spring” is in 3 of 5 written messages (60%).');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows who says it most and how its use changed', async () => {
    const page = startTestPage();
    await loadFile(page, fileAboutSpring(), 'Two years');

    lookUp(page, 'spring');

    const outcome = findElement(page.elements.reportContainer, '#word-search-result');
    expect(namesNextToBars(page)).toEqual(['Bob', 'Ana']);
    /* March 2023 to June 2024 are sixteen months, one bar each. */
    expect(outcome.querySelectorAll('.bar-strip-column')).toHaveLength(16);
    expect(outcome.textContent).toContain('Written most in Mar 2023: 2 messages.');
  });

  it('does not read the file again, and leaves the field and the rest of the report in place', async () => {
    const page = startTestPage();
    await loadFile(page, fileAboutSpring(), 'Two years');
    const fieldBefore = searchField(page);
    const headingBefore = findElement(page.elements.reportContainer, '.chat-heading');

    lookUp(page, 'spring');

    expect(searchField(page)).toBe(fieldBefore);
    expect(findElement(page.elements.reportContainer, '.chat-heading')).toBe(headingBefore);
    expect(page.analyseOnMainThread).toHaveBeenCalledOnce();
  });

  it('says so when no message contains the word', async () => {
    const page = startTestPage();
    await loadFile(page, fileAboutSpring(), 'Two years');

    lookUp(page, 'autumn');

    expect(outcomeParagraphs(page)).toEqual([
      'No message contains “autumn”. 5 written messages were searched.',
    ]);
  });

  it('shows the hint again when the field is emptied', async () => {
    const page = startTestPage();
    await loadFile(page, fileAboutSpring(), 'Two years');
    lookUp(page, 'spring');

    lookUp(page, '');

    expect(outcomeParagraphs(page)).toEqual([WORD_SEARCH_HINT]);
  });

  it('shows typed markup as text', async () => {
    const page = startTestPage();
    await loadFile(page, fileAboutSpring(), 'Two years');

    lookUp(page, '<img src=x onerror=alert(1)>');

    const outcome = findElement(page.elements.reportContainer, '#word-search-result');
    expect(outcome.querySelectorAll('img')).toHaveLength(0);
    expect(outcome.textContent).toContain('No message contains “img src x onerror alert”.');
  });

  it('keeps nothing of what was typed in the storage of the browser', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const page = startTestPage();
    await loadFile(page, fileAboutSpring(), 'Two years');

    lookUp(page, 'spring');

    expect(outcomeSummary(page)).toContain('“spring”');
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
  });

  describe('together with the other switches', () => {
    it('keeps the words and labels the people when names are hidden', async () => {
      const page = startTestPage();
      await loadFile(page, fileAboutSpring(), 'Two years');
      lookUp(page, 'spring');

      setChecked(page.elements.hideNamesCheckbox, true);

      expect(searchField(page).value).toBe('spring');
      expect(outcomeSummary(page)).toBe('“spring” is in 3 of 5 written messages (60%).');
      expect(namesNextToBars(page)).toEqual(['Person A', 'Person B']);
      expect(page.elements.reportContainer.textContent).not.toContain('Bob');
      expect(page.elements.reportContainer.textContent).not.toContain('spring it is');
    });

    it('searches the real messages for a word typed while names are hidden', async () => {
      const page = startTestPage();
      await loadFile(page, fileAboutSpring(), 'Two years');
      setChecked(page.elements.hideNamesCheckbox, true);

      lookUp(page, 'spring');

      expect(outcomeSummary(page)).toBe('“spring” is in 3 of 5 written messages (60%).');
      expect(namesNextToBars(page)).toEqual(['Person A', 'Person B']);
    });

    it('shows the names next to the bars again when they come back', async () => {
      const page = startTestPage();
      await loadFile(page, fileAboutSpring(), 'Two years');
      setChecked(page.elements.hideNamesCheckbox, true);
      lookUp(page, 'spring');

      setChecked(page.elements.hideNamesCheckbox, false);

      expect(namesNextToBars(page)).toEqual(['Bob', 'Ana']);
    });

    it('lists the most active people, and everyone once that is ticked', async () => {
      const page = startTestPage();
      await loadFile(page, fileOfNinePeople(), 'The group');
      lookUp(page, 'hello');
      expect(namesNextToBars(page)).toEqual(NINE_NAMES.slice(0, 8));
      expect(outcomeParagraphs(page)).toContain(
        '1 more message with it is from people who are not listed.',
      );

      setChecked(page.elements.showEveryoneCheckbox, true);

      expect(searchField(page).value).toBe('hello');
      expect(namesNextToBars(page)).toEqual(NINE_NAMES);
    });

    it('searches the period on display, not the whole chat', async () => {
      const page = startTestPage();
      await loadFile(page, fileAboutSpring(), 'Two years');
      lookUp(page, 'spring');

      page.elements.periodSelect.value = 'year-2023';
      page.elements.periodSelect.dispatchEvent(new Event('change'));
      await vi.waitFor(() => {
        expect(reportPeriod(page)).toBe('14 Mar 2023 to 31 Dec 2023 · 293 days');
      });

      /* In 2023 "spring" is in two of the three messages, one from each. */
      expect(searchField(page).value).toBe('spring');
      expect(outcomeSummary(page)).toBe('“spring” is in 2 of 3 written messages (67%).');
      expect(namesNextToBars(page)).toEqual(['Ana', 'Bob']);
    });

    it('searches the period for a word typed after the period was chosen', async () => {
      const page = startTestPage();
      await loadFile(page, fileAboutSpring(), 'Two years');
      page.elements.periodSelect.value = 'year-2024';
      page.elements.periodSelect.dispatchEvent(new Event('change'));
      await vi.waitFor(() => {
        expect(reportPeriod(page)).toBe('1 Jan 2024 to 20 Jun 2024 · 172 days');
      });

      lookUp(page, 'spring');

      /* In 2024 Bob wrote alone: two messages, one with "spring", and nobody to compare him with. */
      expect(outcomeSummary(page)).toBe('“spring” is in 1 of 2 written messages (50%).');
      expect(namesNextToBars(page)).toEqual([]);
    });

    it('draws the outcome at once, and only once, when the report is redrawn before the pause is over', async () => {
      const page = startTestPage();
      await loadFile(page, fileAboutSpring(), 'Two years');
      vi.useFakeTimers();
      typeWords(page, 'spring');

      setChecked(page.elements.hideNamesCheckbox, true);

      expect(outcomeSummary(page)).toBe('“spring” is in 3 of 5 written messages (60%).');
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('when the chat on display changes', () => {
    it('empties the field for the next file that is loaded', async () => {
      const page = startTestPage();
      await loadFile(page, fileAboutSpring(), 'Two years');
      lookUp(page, 'spring');

      await loadFile(page, fileOfAna(), 'Ana');

      expect(searchField(page).value).toBe('');
      expect(outcomeParagraphs(page)).toEqual([WORD_SEARCH_HINT]);
    });

    it('has no field, and nothing to connect, for a chat without a typed word', async () => {
      const page = startTestPage();

      await loadFile(page, fileOfStickers(), 'Stickers');

      expect(page.elements.reportContainer.querySelector('#word-search-input')).toBeNull();
      expect(textsOfElements(page.elements.reportContainer, 'h2')).not.toContain('Look up a word');
    });
  });
});

describe('the history of a group', () => {
  /**
   * A group export: Ana creates "Lake trip" and adds Bob and Dani, the two
   * write on new year's eve, Dani leaves without a word, and the description
   * is changed, which is not group history.
   */
  const GROUP_CHAT_TEXT = exportText([
    androidNoticeLine({ date: '30/12/23', time: '21:00', notice: 'Ana created group "Lake trip"' }),
    androidNoticeLine({ date: '30/12/23', time: '21:01', notice: 'Ana added Bob and Dani' }),
    androidLine({ date: '31/12/23', time: '22:00', sender: 'Ana', text: 'happy new year' }),
    androidLine({ date: '31/12/23', time: '22:01', sender: 'Bob', text: 'same to you' }),
    androidNoticeLine({ date: '31/12/23', time: '23:00', notice: 'Dani left' }),
    androidNoticeLine({
      date: '31/12/23',
      time: '23:05',
      notice: 'Bob changed the group description',
    }),
  ]);

  /** The group export as a file called "Lake trip". */
  function fileOfTheGroup(): File {
    return new File([GROUP_CHAT_TEXT], 'Lake trip.txt', { type: 'text/plain' });
  }

  /** Lists what the events of "Group history" read, newest first; empty without the section. */
  function groupHistoryOf(page: TestPage): string[] {
    return textsOfElements(page.elements.reportContainer, '.group-history .milestone-description');
  }

  it('lists the events of a group export, newest first', async () => {
    const page = startTestPage();

    await loadFile(page, fileOfTheGroup(), 'Lake trip');

    expect(groupHistoryOf(page)).toEqual([
      'Dani left',
      'Ana added Bob and Dani',
      'Ana created the group “Lake trip”',
    ]);
  });

  it('counts only the two people who wrote', async () => {
    const page = startTestPage();

    await loadFile(page, fileOfTheGroup(), 'Lake trip');

    expect(textsOfElements(page.elements.reportContainer, '.legend span')).toEqual(['Ana', 'Bob']);
  });

  it('says in the line under the picker how many notices were kept and how many skipped', async () => {
    const page = startTestPage();

    await loadFile(page, fileOfTheGroup(), 'Lake trip');

    /* 6 lines: 2 messages, 3 notices kept as events, 1 skipped. */
    expect(page.elements.parseReport.textContent).toBe(
      'Read 2 messages from 6 lines of an Android export, dates as day/month/year. Kept 3 system notices as group history. Skipped 1 system notice.',
    );
  });

  it('shows no such section for a chat without group notices', async () => {
    const page = startTestPage();

    await loadFile(page, fileOfAna(), 'Ana');

    expect(groupHistoryOf(page)).toEqual([]);
    expect(textsOfElements(page.elements.reportContainer, 'h2')).not.toContain('Group history');
  });

  it('relabels everybody and hides the group name when names are hidden', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfTheGroup(), 'Lake trip');

    page.elements.hideNamesCheckbox.checked = true;
    page.elements.hideNamesCheckbox.dispatchEvent(new Event('change'));

    expect(groupHistoryOf(page)).toEqual([
      'Member 1 left',
      'Person A added Person B and Member 1',
      'Person A created the group',
    ]);
    for (const name of ['Ana', 'Bob', 'Dani', 'Lake']) {
      expect(page.elements.reportContainer.textContent).not.toContain(name);
    }
  });
});

describe('the recap of a year', () => {
  /** How many messages each of the two full years of the invented group holds. */
  const MESSAGES_PER_FULL_YEAR = 120;

  /**
   * Writes the lines of the first months of one year of an invented group:
   * one message at noon on each of the first ten days of a month, three of
   * them from Bob, one from Carla and six from Ana. Twelve months make 120
   * messages: Ana 72, Bob 36, Carla 12.
   */
  function linesOfYear(year: number, monthCount: number): string[] {
    const sendersOfTenDays = [
      'Bob',
      'Bob',
      'Bob',
      'Ana',
      'Ana',
      'Ana',
      'Ana',
      'Ana',
      'Ana',
      'Carla',
    ];
    const lines: string[] = [];
    for (let month = 1; month <= monthCount; month += 1) {
      for (const [dayIndex, sender] of sendersOfTenDays.entries()) {
        const day = String(dayIndex + 1).padStart(2, '0');
        const date = `${day}/${String(month).padStart(2, '0')}/${String(year)}`;
        lines.push(iphoneLine({ date, time: '12:00:00', sender, text: 'lunch' }));
      }
    }
    return lines;
  }

  /**
   * A file of a group over three years: all of 2023 and 2024 with 120
   * messages each (Ana 72, Bob 36, Carla 12), and two months of 2025 with 20.
   */
  function fileOfThreeYears(): File {
    const lines = [...linesOfYear(2023, 12), ...linesOfYear(2024, 12), ...linesOfYear(2025, 2)];
    return new File([exportText(lines)], 'WhatsApp Chat with Lunch club.txt');
  }

  /** Presses the button that opens the recap and waits until its dialog is on display. */
  async function openRecap(page: TestPage): Promise<void> {
    page.elements.openRecapButton.click();
    await vi.waitFor(() => {
      expect(page.elements.recapOverlay.hidden).toBe(false);
    });
  }

  /** Loads the group over three years and opens the recap of the proposed year. */
  async function openRecapOfThreeYearFile(page: TestPage): Promise<void> {
    await loadFile(page, fileOfThreeYears(), 'Lunch club');
    await openRecap(page);
  }

  /** Presses a key inside the dialog and returns the event, to see whether it was taken. */
  function pressKey(page: TestPage, key: string, shiftKey = false): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
    (document.activeElement ?? page.elements.recapPanel).dispatchEvent(event);
    return event;
  }

  /** The headline of the card on display. */
  function cardHeadline(page: TestPage): string | undefined {
    return textsOfElements(page.elements.recapCard, '.recap-card-headline')[0];
  }

  /** What the card on display is about. */
  function cardKind(page: TestPage): string | null {
    return findElement(page.elements.recapCard, '[data-recap-card]').getAttribute(
      'data-recap-card',
    );
  }

  /** Presses Next until the last card is on display. */
  function goToLastCard(page: TestPage): void {
    while (!page.elements.recapNextButton.disabled) {
      page.elements.recapNextButton.click();
    }
  }

  describe('what is offered', () => {
    it('offers the one year of the example chat on a button, without a choice of year', () => {
      const page = startTestPage();
      const { recapEntry, recapYearChoice, openRecapButton, recapOverlay } = page.elements;

      expect(recapEntry.hidden).toBe(false);
      expect(recapYearChoice.hidden).toBe(true);
      expect(openRecapButton.textContent).toBe('See 2026 in this chat');
      expect(recapOverlay.hidden).toBe(true);
    });

    it('is not offered for a chat of two messages', async () => {
      const page = startTestPage();

      await loadFile(page, fileOfAna(), 'Ana');

      expect(page.elements.recapEntry.hidden).toBe(true);
    });

    it('lists the years with enough messages, newest first, and proposes the latest complete one', async () => {
      const page = startTestPage();

      await loadFile(page, fileOfThreeYears(), 'Lunch club');

      /* 2025 has 20 messages, which is not enough; 2024 is the latest year that is over. */
      const { recapYearChoice, recapYearSelect, openRecapButton } = page.elements;
      expect(recapYearChoice.hidden).toBe(false);
      expect(textsOfElements(recapYearSelect, 'option')).toEqual(['2024', '2023']);
      expect(recapYearSelect.value).toBe('2024');
      expect(openRecapButton.textContent).toBe('See 2024 in this chat');
    });

    it('writes the chosen year on the button', async () => {
      const page = startTestPage();
      await loadFile(page, fileOfThreeYears(), 'Lunch club');

      page.elements.recapYearSelect.value = '2023';
      page.elements.recapYearSelect.dispatchEvent(new Event('change'));

      expect(page.elements.openRecapButton.textContent).toBe('See 2023 in this chat');
    });
  });

  describe('opening it', () => {
    it('shows that work is under way before the year is counted', async () => {
      const page = startTestPage();
      await loadFile(page, fileOfThreeYears(), 'Lunch club');

      page.elements.openRecapButton.click();

      expect(page.elements.statusLine.textContent).toBe(PREPARING_RECAP_STATUS);
      expect(page.elements.statusLine.classList.contains('busy')).toBe(true);
      expect(page.elements.recapOverlay.hidden).toBe(true);
    });

    it('counts the year 30 milliseconds later, then clears the status and opens the dialog', async () => {
      const page = startTestPage();
      await loadFile(page, fileOfThreeYears(), 'Lunch club');
      vi.useFakeTimers();
      page.elements.openRecapButton.click();

      vi.advanceTimersByTime(PERIOD_ANALYSIS_DELAY_IN_MILLISECONDS - 1);
      expect(page.elements.recapOverlay.hidden).toBe(true);

      vi.advanceTimersByTime(1);
      expect(page.elements.recapOverlay.hidden).toBe(false);
      expect(page.elements.statusLine.hidden).toBe(true);
    });

    it('starts on the first card of the year, titled by the year', async () => {
      const page = startTestPage();

      await openRecapOfThreeYearFile(page);

      expect(page.elements.recapTitle.textContent).toBe('2024 in this chat');
      expect(cardHeadline(page)).toBe(`${String(MESSAGES_PER_FULL_YEAR)} messages in 2024`);
      expect(page.elements.recapPosition.textContent).toBe('Card 1 of 8');
    });

    it('is a labelled modal dialog that takes the focus', async () => {
      const page = startTestPage();

      await openRecapOfThreeYearFile(page);

      const { recapPanel } = page.elements;
      expect(recapPanel.getAttribute('role')).toBe('dialog');
      expect(recapPanel.getAttribute('aria-modal')).toBe('true');
      expect(recapPanel.getAttribute('aria-labelledby')).toBe(page.elements.recapTitle.id);
      expect(document.activeElement).toBe(recapPanel);
    });

    it('opens a year a second time at once, without counting it again', async () => {
      const page = startTestPage();
      await openRecapOfThreeYearFile(page);
      page.elements.recapCloseButton.click();

      page.elements.openRecapButton.click();

      expect(page.elements.recapOverlay.hidden).toBe(false);
      expect(page.elements.statusLine.hidden).toBe(true);
      expect(page.elements.recapPosition.textContent).toBe('Card 1 of 8');
    });

    it('opens the year chosen from the list', async () => {
      const page = startTestPage();
      await loadFile(page, fileOfThreeYears(), 'Lunch club');
      page.elements.recapYearSelect.value = '2023';
      page.elements.recapYearSelect.dispatchEvent(new Event('change'));

      await openRecap(page);

      expect(page.elements.recapTitle.textContent).toBe('2023 in this chat');
      expect(cardHeadline(page)).toBe('120 messages in 2023');
    });

    it('never reads the file again', async () => {
      const page = startTestPage();

      await openRecapOfThreeYearFile(page);

      expect(page.analyseOnMainThread).toHaveBeenCalledOnce();
    });
  });

  describe('moving between the cards', () => {
    it('goes forward and back with the buttons, and says where it is', async () => {
      const page = startTestPage();
      await openRecapOfThreeYearFile(page);

      page.elements.recapNextButton.click();
      expect(cardKind(page)).toBe('busiest');
      expect(page.elements.recapPosition.textContent).toBe('Card 2 of 8');

      page.elements.recapBackButton.click();
      expect(cardKind(page)).toBe('messages');
      expect(page.elements.recapPosition.textContent).toBe('Card 1 of 8');
    });

    it('goes forward and back with the arrow keys', async () => {
      const page = startTestPage();
      await openRecapOfThreeYearFile(page);

      pressKey(page, 'ArrowRight');
      pressKey(page, 'ArrowRight');
      expect(cardKind(page)).toBe('people');

      pressKey(page, 'ArrowLeft');
      expect(cardKind(page)).toBe('busiest');
    });

    it('has nowhere to go back to on the first card', async () => {
      const page = startTestPage();
      await openRecapOfThreeYearFile(page);

      pressKey(page, 'ArrowLeft');

      expect(page.elements.recapBackButton.disabled).toBe(true);
      expect(page.elements.recapNextButton.disabled).toBe(false);
      expect(cardKind(page)).toBe('messages');
    });

    it('ends on the closing card, where Next is switched off and the focus moves to the dialog', async () => {
      const page = startTestPage();
      await openRecapOfThreeYearFile(page);
      page.elements.recapNextButton.focus();

      goToLastCard(page);
      pressKey(page, 'ArrowRight');

      expect(cardKind(page)).toBe('closing');
      expect(page.elements.recapPosition.textContent).toBe('Card 8 of 8');
      expect(page.elements.recapNextButton.disabled).toBe(true);
      expect(page.elements.recapBackButton.disabled).toBe(false);
      expect(document.activeElement).toBe(page.elements.recapPanel);
    });

    it('leaves other keys alone', async () => {
      const page = startTestPage();
      await openRecapOfThreeYearFile(page);

      const event = pressKey(page, 'a');

      expect(event.defaultPrevented).toBe(false);
      expect(cardKind(page)).toBe('messages');
    });

    it('keeps the Tab key inside the dialog, in both directions', async () => {
      const page = startTestPage();
      await openRecapOfThreeYearFile(page);
      const { recapCloseButton, recapNextButton } = page.elements;

      /* On the first card Back is switched off: Close is the first control and Next the last. */
      const backwardsFromDialog = pressKey(page, 'Tab', true);
      expect(backwardsFromDialog.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(recapNextButton);

      const forwardsFromLast = pressKey(page, 'Tab');
      expect(forwardsFromLast.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(recapCloseButton);

      const forwardsFromFirst = pressKey(page, 'Tab');
      expect(forwardsFromFirst.defaultPrevented).toBe(false);

      const backwardsFromFirst = pressKey(page, 'Tab', true);
      expect(backwardsFromFirst.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(recapNextButton);
    });
  });

  describe('closing it', () => {
    it('closes on Escape and gives the focus back to the button that opened it', async () => {
      const page = startTestPage();
      await openRecapOfThreeYearFile(page);

      pressKey(page, 'Escape');

      expect(page.elements.recapOverlay.hidden).toBe(true);
      expect(document.activeElement).toBe(page.elements.openRecapButton);
    });

    it('closes on the Close button', async () => {
      const page = startTestPage();
      await openRecapOfThreeYearFile(page);

      page.elements.recapCloseButton.click();

      expect(page.elements.recapOverlay.hidden).toBe(true);
      expect(document.activeElement).toBe(page.elements.openRecapButton);
    });

    it('closes on a press beside the panel, but not on one inside it', async () => {
      const page = startTestPage();
      await openRecapOfThreeYearFile(page);

      page.elements.recapCard.click();
      expect(page.elements.recapOverlay.hidden).toBe(false);

      page.elements.recapOverlay.click();
      expect(page.elements.recapOverlay.hidden).toBe(true);
    });

    it('starts at the first card again when it is opened anew', async () => {
      const page = startTestPage();
      await openRecapOfThreeYearFile(page);
      page.elements.recapNextButton.click();
      page.elements.recapCloseButton.click();

      await openRecap(page);

      expect(cardKind(page)).toBe('messages');
    });
  });

  describe('together with the other switches', () => {
    it('names people while names are shown', async () => {
      const page = startTestPage();
      await openRecapOfThreeYearFile(page);

      pressKey(page, 'ArrowRight');
      pressKey(page, 'ArrowRight');

      expect(cardHeadline(page)).toBe('Ana wrote the most');
      expect(textsOfElements(page.elements.recapCard, 'li')).toEqual([
        '1. Ana: 72 messages, 60%',
        '2. Bob: 36 messages, 30%',
        '3. Carla: 12 messages, 10%',
      ]);
    });

    it('writes labels and no name on any card while names are hidden', async () => {
      const page = startTestPage();
      await loadFile(page, fileOfThreeYears(), 'Lunch club');
      page.elements.hideNamesCheckbox.checked = true;
      page.elements.hideNamesCheckbox.dispatchEvent(new Event('change'));

      await openRecap(page);

      const cardTexts: string[] = [page.elements.recapCard.textContent];
      while (!page.elements.recapNextButton.disabled) {
        page.elements.recapNextButton.click();
        cardTexts.push(page.elements.recapCard.textContent);
      }
      const everything = `${page.elements.recapTitle.textContent}\n${cardTexts.join('\n')}`;
      expect(everything).toContain('Person A wrote the most');
      for (const name of ['Ana', 'Bob', 'Carla', 'Lunch club']) {
        expect(everything).not.toContain(name);
      }
    });

    it('covers its calendar year whatever period the report shows', async () => {
      const page = startTestPage();
      await loadFile(page, fileOfThreeYears(), 'Lunch club');
      page.elements.periodSelect.value = 'year-2023';
      page.elements.periodSelect.dispatchEvent(new Event('change'));
      await vi.waitFor(() => {
        expect(reportPeriod(page)).toContain('1 Jan 2023 to 10 Dec 2023');
      });

      await openRecap(page);

      expect(page.elements.recapTitle.textContent).toBe('2024 in this chat');
      expect(cardHeadline(page)).toBe('120 messages in 2024');
      expect(reportPeriod(page)).toContain('1 Jan 2023 to 10 Dec 2023');
    });

    it('writes nothing to the storage of the browser', async () => {
      const page = startTestPage();

      await openRecapOfThreeYearFile(page);

      expect(window.localStorage).toHaveLength(0);
      expect(window.sessionStorage).toHaveLength(0);
    });
  });

  describe('when the chat on display changes', () => {
    it('closes when another file is dropped on the page, and offers the years of that file', async () => {
      const page = startTestPage();
      await openRecapOfThreeYearFile(page);

      dropFiles(page, [fileOfAna()]);
      await waitForReportTitled(page, 'Ana');

      expect(page.elements.recapOverlay.hidden).toBe(true);
      expect(page.elements.recapEntry.hidden).toBe(true);
    });

    it('gives up a recap that was still being prepared when another file is chosen', async () => {
      const page = startTestPage();
      await loadFile(page, fileOfThreeYears(), 'Lunch club');
      page.elements.openRecapButton.click();

      await loadFile(page, fileOfAna(), 'Ana');
      await new Promise((resolve) => {
        window.setTimeout(resolve, PERIOD_ANALYSIS_DELAY_IN_MILLISECONDS * 2);
      });

      expect(page.elements.recapOverlay.hidden).toBe(true);
    });

    it('closes and starts over when the date order is switched', async () => {
      const lines = [
        ...Array.from({ length: 60 }, () =>
          androidLine({ date: '1/2/23', time: '10:00', sender: 'Carla', text: 'are we still on?' }),
        ),
        ...Array.from({ length: 60 }, () =>
          androidLine({ date: '5/6/23', time: '10:01', sender: 'Dani', text: 'yes' }),
        ),
      ];
      const page = startTestPage();
      await loadFile(page, new File([exportText(lines)], 'WhatsApp Chat with Carla.txt'), 'Carla');
      await openRecap(page);
      expect(cardHeadline(page)).toBe('120 messages in 2023');

      page.elements.switchDateOrderButton.click();
      await vi.waitFor(() => {
        expect(page.elements.dateOrderMessage.textContent).toContain(
          'Reading them as month/day/year.',
        );
      });

      expect(page.elements.recapOverlay.hidden).toBe(true);
      expect(page.elements.recapEntry.hidden).toBe(false);
    });
  });
});

describe('how things changed', () => {
  /**
   * A file of eight months of 2024 with thirty messages each. In the first
   * four months Ana writes twenty-four of them and Bob six; in the last four
   * it is the other way round. Bob adds a party emoji from May on.
   */
  function fileOfEightMonths(): File {
    const lines: string[] = [];
    for (let month = 1; month <= 8; month += 1) {
      const isEarly = month <= 4;
      for (let index = 0; index < 30; index += 1) {
        const isFromMajority = index % 5 !== 0;
        const sender = isFromMajority === isEarly ? 'Ana' : 'Bob';
        const date = `${String(index + 1).padStart(2, '0')}/${String(month).padStart(2, '0')}/2024`;
        const text = sender === 'Bob' && !isEarly ? 'see you saturday 🎉' : 'see you saturday';
        lines.push(iphoneLine({ date, time: '12:00:00', sender, text }));
      }
    }
    return new File([exportText(lines)], 'WhatsApp Chat with Saturdays.txt');
  }

  /** Finds the section by its heading; `null` when the report has none. */
  function trendsSectionOf(page: TestPage): Element | null {
    const heading = Array.from(page.elements.reportContainer.querySelectorAll('h2')).find(
      (candidate) => candidate.textContent === 'How things changed',
    );
    return heading?.closest('section') ?? null;
  }

  /** The sentences under the charts of the section. */
  function readingsOf(page: TestPage): string[] {
    const section = trendsSectionOf(page);
    return section === null ? [] : textsOfElements(section, '.trend-reading');
  }

  it('is part of the report of the example chat, which spans ten months', () => {
    const page = startTestPage();
    const section = trendsSectionOf(page);

    expect(section).not.toBeNull();
    expect(section?.querySelector('.section-heading p')?.textContent).toContain(
      'month by month, from Jan 2026 to Oct 2026',
    );
    expect(section?.querySelectorAll('.trend-chart').length).toBeGreaterThanOrEqual(3);
  });

  it('is left out of a chat of a single evening', async () => {
    const page = startTestPage();

    await loadFile(page, fileOfAna(), 'Ana');

    expect(trendsSectionOf(page)).toBeNull();
  });

  it('puts the change of a loaded chat into words', async () => {
    const page = startTestPage();

    await loadFile(page, fileOfEightMonths(), 'Saturdays');

    /* 24 of 30 messages are 80%, 6 of 30 are 20%. Both wrote 120 in all; Bob wrote first and is listed first. */
    expect(readingsOf(page)).toEqual([
      "Bob's share of the messages went from about 20% in Jan–Feb 2024 to about 80% in Jul–Aug 2024.",
    ]);
  });

  it('follows the most used words and emojis month by month', async () => {
    const page = startTestPage();

    await loadFile(page, fileOfEightMonths(), 'Saturdays');

    const section = trendsSectionOf(page);
    expect(section === null ? [] : textsOfElements(section, '.term-trend-name')).toEqual([
      'saturday',
      '🎉',
    ]);
    const emojiStrip = section?.querySelectorAll('.term-trend .bar-strip')[1];
    expect(emojiStrip?.querySelector('.bar-strip-column')?.getAttribute('title')).toBe(
      'Jan 2024: 0 messages',
    );
    expect(emojiStrip?.querySelector('.bar-strip-column:last-child')?.getAttribute('title')).toBe(
      'Aug 2024: 24 messages',
    );
  });

  it('shows the numbers of a month in the shared tooltip while the pointer is over it', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfEightMonths(), 'Saturdays');
    const bands = trendsSectionOf(page)?.querySelectorAll(
      '[data-trend-chart="message-share"] .trend-band',
    );

    bands?.[7]?.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));

    expect(page.elements.tooltip.hidden).toBe(false);
    expect(textsOfElements(page.elements.tooltip, '.tooltip-title')).toEqual(['Aug 2024']);
    expect(textsOfElements(page.elements.tooltip, '.tooltip-row')).toEqual(['Bob80%', 'Ana20%']);

    trendsSectionOf(page)
      ?.querySelector('.trend-chart')
      ?.dispatchEvent(new MouseEvent('pointerleave'));
    expect(page.elements.tooltip.hidden).toBe(true);
  });

  it('writes labels instead of names while names are hidden', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfEightMonths(), 'Saturdays');

    page.elements.hideNamesCheckbox.checked = true;
    page.elements.hideNamesCheckbox.dispatchEvent(new Event('change'));

    /* Bob, who is listed first, is Person A. */
    expect(readingsOf(page)).toEqual([
      "Person A's share of the messages went from about 20% in Jan–Feb 2024 to about 80% in Jul–Aug 2024.",
    ]);
    expect(trendsSectionOf(page)?.textContent).not.toContain('Ana');
    expect(trendsSectionOf(page)?.textContent).not.toContain('Bob');
  });

  it('covers the chosen period only, and goes when the period is too short for it', async () => {
    const page = startTestPage();
    await loadFile(page, fileOfEightMonths(), 'Saturdays');
    const { periodFromInput, periodToInput } = page.elements;

    periodFromInput.value = '2024-03-01';
    periodFromInput.dispatchEvent(new Event('change'));
    await vi.waitFor(() => {
      expect(reportPeriod(page)).toContain('1 Mar 2024 to 30 Aug 2024');
    });
    /* Six months are left: March and April at 80%, July and August at 20%. */
    expect(trendsSectionOf(page)?.querySelector('.section-heading p')?.textContent).toContain(
      'from Mar 2024 to Aug 2024',
    );
    expect(readingsOf(page)).toEqual([
      "Bob's share of the messages went from about 20% in Mar–Apr 2024 to about 80% in Jul–Aug 2024.",
    ]);

    periodToInput.value = '2024-07-31';
    periodToInput.dispatchEvent(new Event('change'));
    await vi.waitFor(() => {
      expect(reportPeriod(page)).toContain('1 Mar 2024 to 30 Jul 2024');
    });
    expect(trendsSectionOf(page)).toBeNull();
  });
});
