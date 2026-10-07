/**
 * The logic of the analysis worker, kept free of worker globals so it can be
 * tested in Node and reused by anything that speaks the same protocol.
 */

import { analyseChatExport, describeThrownValue } from '../core/index';
import {
  ANALYSING_STATUS_MESSAGE,
  NO_RETAINED_TEXT_ERROR_MESSAGE,
  UNKNOWN_FAILURE_ERROR_MESSAGE,
} from './analysis-worker-protocol';
import type { AnalysisWorkerRequest, AnalysisWorkerResponse } from './analysis-worker-protocol';

/** Sends one response back to whoever made the request. */
export type AnalysisResponseSender = (response: AnalysisWorkerResponse) => void;

/** Handles one request, answering through the sender it was created with. */
export type AnalysisRequestHandler = (request: AnalysisWorkerRequest) => void;

/**
 * Creates the function that answers analysis requests.
 *
 * The handler remembers the text of the last `analyse-new-text` request
 * between calls, so the date-order switch can re-read it without the page
 * sending it again.
 *
 * For every request it sends one `progress` response and then exactly one
 * `completed` or `failed` response, all carrying the request's `requestId`.
 *
 * @param sendResponse - Delivers a response; in the worker this is `postMessage`.
 * @returns The handler to call with each incoming request.
 */
export function createAnalysisRequestHandler(
  sendResponse: AnalysisResponseSender,
): AnalysisRequestHandler {
  let retainedRawText: string | null = null;

  return function handleAnalysisRequest(request: AnalysisWorkerRequest): void {
    const { requestId } = request;
    if (request.kind === 'analyse-new-text') {
      retainedRawText = request.rawText;
    }

    try {
      if (retainedRawText === null) {
        throw new Error(NO_RETAINED_TEXT_ERROR_MESSAGE);
      }
      sendResponse({ kind: 'progress', requestId, statusMessage: ANALYSING_STATUS_MESSAGE });

      const result = analyseChatExport(retainedRawText, request.forcedDateOrder, request.locale);
      sendResponse({ kind: 'completed', requestId, result });
    } catch (thrownValue: unknown) {
      sendResponse({
        kind: 'failed',
        requestId,
        errorMessage: describeThrownValue(thrownValue, UNKNOWN_FAILURE_ERROR_MESSAGE),
      });
    }
  };
}
