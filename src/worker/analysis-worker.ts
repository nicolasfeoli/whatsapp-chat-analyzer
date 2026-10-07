/**
 * Web Worker entry point: runs parsing and analysis off the main thread, so a
 * chat with hundreds of thousands of messages does not freeze the page.
 *
 * This file only connects the worker's message events to the request handler;
 * the behaviour lives in `analysis-request-handler.ts`. It is type-checked
 * with the WebWorker library (see `tsconfig.worker.json`), not the DOM one.
 */

import { createAnalysisRequestHandler } from './analysis-request-handler';
import type { AnalysisWorkerRequest, AnalysisWorkerResponse } from './analysis-worker-protocol';

/** The global scope of a dedicated worker, which TypeScript only knows as a generic `self`. */
declare const self: DedicatedWorkerGlobalScope;

const handleAnalysisRequest = createAnalysisRequestHandler(
  (response: AnalysisWorkerResponse): void => {
    self.postMessage(response);
  },
);

self.addEventListener('message', (event: MessageEvent<AnalysisWorkerRequest>): void => {
  handleAnalysisRequest(event.data);
});
