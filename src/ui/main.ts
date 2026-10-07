/**
 * The entry point of the page. It gathers what the page needs from the real
 * browser (the elements of `index.html`, the window, the language, the Web
 * Worker) and hands it to the page controller, where the behaviour lives.
 *
 * Importing this module starts the page, which is what a `<script>` is for.
 * It is the only module of the page that does anything on import.
 */

import { analyseChatExport } from '../core/index';
import { createAnalysisClient } from './analysis-client';
import type { AnalysisClient } from './analysis-client';
import { areWorkersSupported, startBrowserAnalysisWorker } from './browser-analysis-worker';
import { findPageElements } from './dom';
import { startPage } from './page-controller';
import type { ProgressListener } from './page-controller';
import { createTooltip } from './tooltip';

/**
 * Reads the language the browser is set to.
 *
 * @returns A BCP 47 tag such as `"en-US"`; the last tie-break for ambiguous dates.
 */
function readBrowserLocale(): string {
  return navigator.language;
}

/**
 * Runs a task after a delay, on the page's own timer.
 */
function runLater(task: () => void, delayInMilliseconds: number): void {
  window.setTimeout(task, delayInMilliseconds);
}

/**
 * Creates the client that analyses loaded files: in a Web Worker when the
 * browser has them, with the same analysis on the main thread as its fallback.
 *
 * @param onProgress - Receives the worker's progress messages.
 */
function createBrowserAnalysisClient(onProgress: ProgressListener): AnalysisClient {
  return createAnalysisClient({
    startWorker: areWorkersSupported() ? startBrowserAnalysisWorker : null,
    analyseOnMainThread: analyseChatExport,
    runLater,
    getLocale: readBrowserLocale,
    onProgress,
  });
}

const pageElements = findPageElements();

startPage({
  pageElements,
  tooltip: createTooltip(pageElements.tooltip),
  browserWindow: window,
  getLocale: readBrowserLocale,
  analyseOnMainThread: analyseChatExport,
  createAnalysisClient: createBrowserAnalysisClient,
});
