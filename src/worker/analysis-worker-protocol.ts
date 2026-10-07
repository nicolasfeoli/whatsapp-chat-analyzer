/**
 * The messages exchanged between the page and the analysis worker.
 *
 * Both sides import these types, so a change to the protocol that one side
 * does not follow is a compile error rather than a silent `undefined`.
 * Everything here crosses the worker boundary by structured clone and is
 * therefore plain data.
 */

import type { AmbiguousDateOrder, ChatExportAnalysisResult } from '../core/types';

/** The fields every request carries. */
interface AnalysisWorkerRequestBase {
  /**
   * A number the page increases with every request. Responses echo it, so the
   * page can ignore answers to a request it has since replaced.
   */
  readonly requestId: number;
  /** `'dmy'` or `'mdy'` when the user switched the date order; `null` to detect it. */
  readonly forcedDateOrder: AmbiguousDateOrder | null;
  /** The BCP 47 tag of the browser (`navigator.language`). */
  readonly locale: string | null;
}

/** Analyse a newly loaded export. The worker keeps the text for later re-analysis. */
export interface AnalyseNewTextRequest extends AnalysisWorkerRequestBase {
  readonly kind: 'analyse-new-text';
  /** The complete text of the export. */
  readonly rawText: string;
}

/**
 * Analyse the text of the previous `analyse-new-text` request again, typically
 * with the other date order. The worker kept the text, so the page does not
 * have to hold a second copy of a file that can be hundreds of megabytes.
 */
export interface ReanalyseRetainedTextRequest extends AnalysisWorkerRequestBase {
  readonly kind: 'reanalyse-retained-text';
}

/** What the page can ask of the worker. Discriminated by `kind`. */
export type AnalysisWorkerRequest = AnalyseNewTextRequest | ReanalyseRetainedTextRequest;

/** The worker started a stage; the page shows the message in its status line. */
export interface AnalysisProgressResponse {
  readonly kind: 'progress';
  /** The `requestId` of the request this answers. */
  readonly requestId: number;
  /** A sentence for the status line, e.g. "Analysing the chat …". */
  readonly statusMessage: string;
}

/** The analysis finished, with or without finding messages. */
export interface AnalysisCompletedResponse {
  readonly kind: 'completed';
  /** The `requestId` of the request this answers. */
  readonly requestId: number;
  /** What `analyseChatExport` returned. */
  readonly result: ChatExportAnalysisResult;
}

/** The analysis could not be carried out. */
export interface AnalysisFailedResponse {
  readonly kind: 'failed';
  /** The `requestId` of the request this answers. */
  readonly requestId: number;
  /** A sentence fit to show to the user. */
  readonly errorMessage: string;
}

/** What the worker can answer. Discriminated by `kind`. */
export type AnalysisWorkerResponse =
  AnalysisProgressResponse | AnalysisCompletedResponse | AnalysisFailedResponse;

/** Shown while parsing and analysis run. */
export const ANALYSING_STATUS_MESSAGE = 'Analysing the chat …';

/**
 * Shown when the page asks for a re-analysis but the worker holds no text,
 * which happens when the worker was restarted after the file was loaded.
 */
export const NO_RETAINED_TEXT_ERROR_MESSAGE = 'Load the file again.';

/** Shown when the analysis throws something that carries no message of its own. */
export const UNKNOWN_FAILURE_ERROR_MESSAGE = 'Could not analyse that file.';
