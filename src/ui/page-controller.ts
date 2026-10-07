/**
 * What happens on the page, and when: connects the file picker, drag and
 * drop, the date-order switch and the window events to the analysis and the
 * report.
 *
 * The modules this file draws on are pure wherever possible; the DOM work is
 * gathered here so there is one place to look for "what happens when".
 * Everything the controller needs from its surroundings is passed to
 * {@link startPage}, so nothing runs when this module is imported and a test
 * can start as many independent pages as it likes. `main.ts` supplies the
 * real browser.
 */

import type { AmbiguousDateOrder, AnalysedChatExportResult, DateOrder } from '../core/index';
import type { AnalysisClient, AnalysisOutcome, MainThreadAnalysis } from './analysis-client';
import { attachHeatmapTooltips } from './charts/heatmap';
import { drawTimeline } from './charts/timeline';
import type { TimelineData } from './charts/timeline-buckets';
import { renderChatReport } from './chat-report';
import type { PageElements } from './dom';
import { cleanChatTitle, describeFileLoadingFailure, readChatTextFromFile } from './file-loading';
import { setInnerHtml } from './html';
import { describeAmbiguousDateOrder, summariseParseReport } from './parse-report';
import { SAMPLE_CHAT_TITLE, generateSampleChatText } from './sample-chat';
import { TIMELINE_CONTAINER_ID } from './sections/timeline';
import type { Tooltip } from './tooltip';

/**
 * How long the page waits after the last resize event before redrawing the
 * timeline. Resizing fires many events per second; redrawing on each would
 * make dragging the window edge stutter.
 */
export const TIMELINE_REDRAW_DELAY_IN_MILLISECONDS = 120;

/** Shown while the file's text is handed to the analysis. */
export const READING_MESSAGES_STATUS = 'Reading messages …';

/** Shown when the file was read but held nothing that looks like a message. */
export const NO_MESSAGES_FOUND_STATUS =
  'No messages found in that file. Check that it is a WhatsApp chat export (.txt or .zip).';

/** The CSS class that makes the status line show its "work in progress" colour. */
const BUSY_STATUS_CLASS = 'busy';

/** The CSS class that styles the parse report as a warning. */
const WARNING_PARSE_REPORT_CLASS = 'warning';

/** The CSS class that highlights the loader while a file is dragged over the page. */
const DRAGGING_LOADER_CLASS = 'dragging';

/**
 * The parts of the browser's window the page uses: the events of dragging,
 * dropping, resizing and scrolling, and its timers. Naming them, instead of
 * asking for a whole `Window`, says exactly what the page touches and lets a
 * test hand each page a window of its own.
 */
export interface PageWindow {
  /** Registers a listener for an event of the window. */
  readonly addEventListener: Window['addEventListener'];
  /** Runs a task after a delay and returns the number that identifies the timer. */
  setTimeout(task: () => void, delayInMilliseconds: number): number;
  /** Cancels a timer that has not run yet; does nothing for `undefined`. */
  clearTimeout(timerId: number | undefined): void;
}

/** Receives the sentences the analysis reports while it works, for the status line. */
export type ProgressListener = (statusMessage: string) => void;

/** Everything the page needs from its surroundings. */
export interface PageDependencies {
  /** The fixed elements of `index.html`. */
  readonly pageElements: PageElements;
  /** The tooltip shared by the charts. */
  readonly tooltip: Tooltip;
  /** The window whose drag, drop, resize and scroll events the page reacts to, and whose timers it uses. */
  readonly browserWindow: PageWindow;
  /** The BCP 47 tag of the browser (`navigator.language`), read each time it is needed. */
  readonly getLocale: () => string | null;
  /** Analyses the example chat directly, so the page has content from its first frame. */
  readonly analyseOnMainThread: MainThreadAnalysis;
  /**
   * Creates the client that analyses loaded files. The page hands it the
   * listener that puts the client's progress messages in the status line.
   */
  readonly createAnalysisClient: (onProgress: ProgressListener) => AnalysisClient;
}

/** What the page remembers about the chat on display. */
interface DisplayedChat {
  /** The title above the report, reused when the date order is switched. */
  readonly title: string;
  /** The order the dates were read in, so the switch knows which one is "the other". */
  readonly dateOrder: DateOrder;
}

/** Where a chat came from, which decides what surrounds the report. */
type ChatOrigin = 'sample' | 'loaded-file';

/**
 * The state of one page and the reactions to everything that can happen on it.
 */
class PageController {
  private readonly pageElements: PageElements;
  private readonly tooltip: Tooltip;
  private readonly browserWindow: PageWindow;
  private readonly getLocale: () => string | null;
  private readonly analyseOnMainThread: MainThreadAnalysis;
  private readonly analysisClient: AnalysisClient;

  /** The chat on display; `null` until the first one has been rendered. */
  private displayedChat: DisplayedChat | null = null;

  /** The timeline of the chat on display, kept so it can be redrawn at a new width. */
  private displayedTimeline: TimelineData | null = null;

  /** The timer of the pending timeline redraw, if a resize is in progress. */
  private timelineRedrawTimer: number | undefined = undefined;

  public constructor(dependencies: PageDependencies) {
    this.pageElements = dependencies.pageElements;
    this.tooltip = dependencies.tooltip;
    this.browserWindow = dependencies.browserWindow;
    this.getLocale = dependencies.getLocale;
    this.analyseOnMainThread = dependencies.analyseOnMainThread;
    this.analysisClient = dependencies.createAnalysisClient((statusMessage: string): void => {
      this.showStatus(statusMessage, true);
    });
  }

  /**
   * Connects every event of the page and shows the example chat.
   */
  public start(): void {
    this.connectFilePicker();
    this.connectDragAndDrop();
    this.connectDateOrderSwitch();
    this.connectWindowEvents();
    this.showSampleChat();
  }

  /**
   * Sets the status line.
   *
   * @param message - What to show; an empty string hides the line.
   * @param isBusy - Whether work is in progress, which changes the colour of the line.
   */
  private showStatus(message: string, isBusy: boolean): void {
    const { statusLine } = this.pageElements;
    statusLine.hidden = message === '';
    statusLine.textContent = message;
    statusLine.classList.toggle(BUSY_STATUS_CLASS, isBusy);
  }

  /**
   * Shows what was read from a loaded file and what was skipped.
   */
  private showParseReport(result: AnalysedChatExportResult): void {
    const summary = summariseParseReport(result);
    const { parseReport } = this.pageElements;
    parseReport.hidden = false;
    parseReport.textContent = summary.text;
    parseReport.classList.toggle(WARNING_PARSE_REPORT_CLASS, summary.isWarning);
  }

  /**
   * Draws the timeline of the chat on display at the current width of its
   * container. Does nothing when no chat is on display.
   */
  private drawDisplayedTimeline(): void {
    if (this.displayedTimeline === null) {
      return;
    }
    const timelineContainer = this.pageElements.reportContainer.querySelector<HTMLElement>(
      `#${TIMELINE_CONTAINER_ID}`,
    );
    if (timelineContainer === null) {
      return;
    }
    drawTimeline(timelineContainer, this.displayedTimeline, this.tooltip);
  }

  /**
   * Renders the report into the page and connects its interactive parts.
   */
  private showChatReport(result: AnalysedChatExportResult, title: string): void {
    const renderedReport = renderChatReport(result.analysis, title);
    this.displayedTimeline = renderedReport.timeline;
    setInnerHtml(this.pageElements.reportContainer, renderedReport.html);

    this.drawDisplayedTimeline();
    attachHeatmapTooltips(this.pageElements.reportContainer, this.tooltip);
  }

  /**
   * Shows the row that offers to switch the date order, when the file's dates
   * can be read two ways. The example chat never offers it.
   */
  private showDateOrderSwitch(result: AnalysedChatExportResult, isSample: boolean): void {
    this.pageElements.dateOrderRow.hidden = !result.isDateOrderAmbiguous || isSample;
    if (result.isDateOrderAmbiguous) {
      this.pageElements.dateOrderMessage.textContent = describeAmbiguousDateOrder(result.dateOrder);
    }
  }

  /**
   * Shows a successfully analysed chat together with everything around it.
   */
  private showAnalysedChat(
    result: AnalysedChatExportResult,
    title: string,
    origin: ChatOrigin,
  ): void {
    this.displayedChat = { title, dateOrder: result.dateOrder };
    this.showStatus('', false);

    const isSample = origin === 'sample';
    this.pageElements.sampleNote.hidden = !isSample;
    this.showDateOrderSwitch(result, isSample);

    if (isSample) {
      /* The example was not read from a file, so there is nothing to report about its parsing. */
      this.pageElements.parseReport.hidden = true;
    } else {
      this.showParseReport(result);
    }
    this.showChatReport(result, title);
  }

  /**
   * Shows the outcome of an analysis: the report, or the reason there is none.
   * A failure leaves the previous report in place.
   */
  private showAnalysisOutcome(outcome: AnalysisOutcome, title: string, origin: ChatOrigin): void {
    switch (outcome.kind) {
      case 'failed':
        this.showStatus(outcome.errorMessage, false);
        return;
      case 'empty':
        this.showStatus(NO_MESSAGES_FOUND_STATUS, false);
        return;
      case 'superseded':
        /* A newer request is under way and will report for itself. */
        return;
      case 'analysed':
        this.showAnalysedChat(outcome, title, origin);
        return;
    }
  }

  /**
   * Reads a file the user picked or dropped, analyses it and shows the result.
   * Every failure ends up in the status line; this method does not throw.
   */
  private async loadChatFile(file: File): Promise<void> {
    try {
      this.showStatus(`Opening ${file.name} …`, true);
      const rawText = await readChatTextFromFile(file);

      this.showStatus(READING_MESSAGES_STATUS, true);
      const outcome = await this.analysisClient.analyseNewText(rawText);
      this.showAnalysisOutcome(outcome, cleanChatTitle(file.name), 'loaded-file');
    } catch (thrownValue: unknown) {
      this.showStatus(describeFileLoadingFailure(thrownValue), false);
    }
  }

  /**
   * Re-reads the loaded file with the other of the two ambiguous date orders.
   */
  private async switchDateOrder(): Promise<void> {
    if (this.displayedChat === null) {
      return;
    }
    const { title, dateOrder } = this.displayedChat;
    const otherDateOrder: AmbiguousDateOrder = dateOrder === 'dmy' ? 'mdy' : 'dmy';

    this.showStatus(READING_MESSAGES_STATUS, true);
    const outcome = await this.analysisClient.reanalyseRetainedText(otherDateOrder);
    this.showAnalysisOutcome(outcome, title, 'loaded-file');
  }

  /**
   * Analyses and shows the invented example chat. It is small, so it is
   * analysed directly on the main thread and the page has content from its
   * first frame.
   */
  private showSampleChat(): void {
    const result = this.analyseOnMainThread(generateSampleChatText(), null, this.getLocale());
    this.showAnalysisOutcome(result, SAMPLE_CHAT_TITLE, 'sample');
  }

  /**
   * Connects the visible button to the hidden file input.
   */
  private connectFilePicker(): void {
    const { chooseFileButton, fileInput } = this.pageElements;

    chooseFileButton.addEventListener('click', (): void => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (): void => {
      const chosenFile = fileInput.files?.[0];
      if (chosenFile !== undefined) {
        void this.loadChatFile(chosenFile);
      }
      /* Cleared so that choosing the same file again fires another change event. */
      fileInput.value = '';
    });
  }

  /**
   * Lets a file be dropped anywhere on the page.
   */
  private connectDragAndDrop(): void {
    const { loader } = this.pageElements;

    this.browserWindow.addEventListener('dragover', (event: DragEvent): void => {
      /* Without this the browser would refuse the drop and navigate to the file instead. */
      event.preventDefault();
      loader.classList.add(DRAGGING_LOADER_CLASS);
    });

    this.browserWindow.addEventListener('dragleave', (event: DragEvent): void => {
      /* The event also fires when moving between elements; only leaving the window has no target. */
      const hasLeftWindow = event.relatedTarget === null;
      if (hasLeftWindow) {
        loader.classList.remove(DRAGGING_LOADER_CLASS);
      }
    });

    this.browserWindow.addEventListener('drop', (event: DragEvent): void => {
      /* Without this the browser would navigate to the dropped file. */
      event.preventDefault();
      loader.classList.remove(DRAGGING_LOADER_CLASS);
      const droppedFile = event.dataTransfer?.files[0];
      if (droppedFile !== undefined) {
        void this.loadChatFile(droppedFile);
      }
    });
  }

  /**
   * Connects the "Switch" button of the date-order row.
   */
  private connectDateOrderSwitch(): void {
    this.pageElements.switchDateOrderButton.addEventListener('click', (): void => {
      void this.switchDateOrder();
    });
  }

  /**
   * Keeps the timeline and the tooltip in step with the window.
   */
  private connectWindowEvents(): void {
    this.browserWindow.addEventListener('resize', (): void => {
      this.browserWindow.clearTimeout(this.timelineRedrawTimer);
      this.timelineRedrawTimer = this.browserWindow.setTimeout((): void => {
        this.drawDisplayedTimeline();
      }, TIMELINE_REDRAW_DELAY_IN_MILLISECONDS);
    });

    /* The tooltip is positioned in viewport coordinates and would float away from its bar. */
    this.browserWindow.addEventListener(
      'scroll',
      (): void => {
        this.tooltip.hide();
      },
      { passive: true },
    );
  }
}

/**
 * Brings a page to life: connects its events and shows the example chat.
 *
 * @param dependencies - The elements of the page and the services it relies on.
 */
export function startPage(dependencies: PageDependencies): void {
  const pageController = new PageController(dependencies);
  pageController.start();
}
