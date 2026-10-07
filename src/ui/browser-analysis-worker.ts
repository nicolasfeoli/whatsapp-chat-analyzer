/**
 * Starts the real analysis worker in the browser.
 *
 * Kept apart from `analysis-client.ts` so the client can be tested in Node,
 * where neither `Worker` nor Vite's handling of worker URLs exists.
 */

import type {
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
} from '../worker/analysis-worker-protocol';
import type { AnalysisWorkerConnection, AnalysisWorkerEventHandlers } from './analysis-client';

/**
 * Says whether this browser has Web Workers at all.
 *
 * @returns `false` in the rare environments without a `Worker` constructor.
 */
export function areWorkersSupported(): boolean {
  return typeof Worker !== 'undefined';
}

/**
 * Starts the analysis worker and connects its events to the client.
 *
 * The `new Worker(new URL(...), { type: 'module' })` form is the one Vite
 * recognises: it bundles the worker into its own file and rewrites the URL.
 * The file is served from the page's own origin, which is what the
 * `worker-src 'self'` directive of the Content-Security-Policy allows.
 *
 * @param eventHandlers - Receives the worker's responses and errors.
 * @returns The connection to the running worker.
 * @throws When the browser refuses to create the worker.
 */
export function startBrowserAnalysisWorker(
  eventHandlers: AnalysisWorkerEventHandlers,
): AnalysisWorkerConnection {
  const worker = new Worker(new URL('../worker/analysis-worker.ts', import.meta.url), {
    type: 'module',
  });

  worker.addEventListener('message', (event: MessageEvent<AnalysisWorkerResponse>): void => {
    eventHandlers.onResponse(event.data);
  });
  worker.addEventListener('error', (event: ErrorEvent): void => {
    /* The client deals with the failure; keep it out of the console as an uncaught error. */
    event.preventDefault();
    eventHandlers.onError();
  });

  return {
    send(request: AnalysisWorkerRequest): void {
      worker.postMessage(request);
    },
    terminate(): void {
      worker.terminate();
    },
  };
}
