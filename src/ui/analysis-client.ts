/**
 * Runs the analysis for the page, in a Web Worker when possible.
 *
 * Parsing and analysis run in a worker so a big chat does not freeze the page.
 * The worker keeps the text of the last file for the date-order switch, so the
 * page does not hold a second copy of something that can be hundreds of
 * megabytes. A worker is not always to be had: the browser may lack module
 * workers, its settings may block their creation, or the worker's script may
 * fail to load. The same analysis then runs on the main thread instead.
 *
 * This module has no browser dependencies of its own: the worker, the main
 * thread analysis and the timer are passed in, so the whole state machine can
 * be tested in Node. `browser-analysis-worker.ts` supplies the real worker.
 */

import type {
  AmbiguousDateOrder,
  AnalysedChatExportResult,
  ChatExportAnalysisResult,
  EmptyChatExportResult,
} from '../core/index';
import type {
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
} from '../worker/analysis-worker-protocol';

/**
 * How long the main-thread analysis waits before it starts. The analysis
 * blocks the page while it runs, so the browser is first given time to paint
 * the "Reading messages …" status line.
 */
export const MAIN_THREAD_ANALYSIS_DELAY_IN_MILLISECONDS = 30;

/** Shown when the main-thread analysis throws, or has no text left to analyse. */
export const MAIN_THREAD_FAILURE_MESSAGE = 'Could not analyse that file. Load it again.';

/** Shown when a worker that had been working stops with an error. */
export const WORKER_STOPPED_MESSAGE = 'The analysis stopped unexpectedly. Load the file again.';

/** The analysis could not be carried out; the message is fit to show to the user. */
export interface FailedAnalysisOutcome {
  readonly kind: 'failed';
  readonly errorMessage: string;
}

/**
 * A newer request replaced this one before the worker answered it. There is
 * nothing to show: the newer request will deliver its own outcome.
 */
export interface SupersededAnalysisOutcome {
  readonly kind: 'superseded';
}

/** Everything a request for analysis can end in. Discriminated by `kind`. */
export type AnalysisOutcome =
  | AnalysedChatExportResult
  | EmptyChatExportResult
  | FailedAnalysisOutcome
  | SupersededAnalysisOutcome;

/** What a started worker reports back to the client. */
export interface AnalysisWorkerEventHandlers {
  /** Called for every message the worker posts. */
  readonly onResponse: (response: AnalysisWorkerResponse) => void;
  /** Called when the worker fails to load or throws outside the protocol. */
  readonly onError: () => void;
}

/** A running worker, reduced to the two things the client does with it. */
export interface AnalysisWorkerConnection {
  /** Posts a request to the worker. */
  send(request: AnalysisWorkerRequest): void;
  /** Stops the worker for good. */
  terminate(): void;
}

/** Starts a worker; may throw when the browser refuses to create one. */
export type AnalysisWorkerStarter = (
  eventHandlers: AnalysisWorkerEventHandlers,
) => AnalysisWorkerConnection;

/** The analysis itself, with the signature of `analyseChatExport`. */
export type MainThreadAnalysis = (
  rawText: string,
  forcedDateOrder: AmbiguousDateOrder | null,
  locale: string | null,
) => ChatExportAnalysisResult;

/** Everything the client needs from its surroundings. */
export interface AnalysisClientDependencies {
  /** Starts the analysis worker, or `null` when the browser has no workers at all. */
  readonly startWorker: AnalysisWorkerStarter | null;
  /** Runs the analysis on the calling thread; used when the worker is unavailable. */
  readonly analyseOnMainThread: MainThreadAnalysis;
  /** Runs a task after a delay; `setTimeout` in the browser. */
  readonly runLater: (task: () => void, delayInMilliseconds: number) => void;
  /** The BCP 47 tag of the browser (`navigator.language`), read at each request. */
  readonly getLocale: () => string | null;
  /** Receives the progress messages of the worker, for the status line. */
  readonly onProgress: (statusMessage: string) => void;
}

/** What the page can ask of the client. */
export interface AnalysisClient {
  /**
   * Analyses a newly loaded export, detecting the date order.
   *
   * @param rawText - The complete text of the export.
   * @returns The outcome; the promise never rejects for an analysis failure.
   */
  analyseNewText(rawText: string): Promise<AnalysisOutcome>;
  /**
   * Analyses the most recently loaded export again with a given date order.
   *
   * @param forcedDateOrder - The order to read ambiguous dates in.
   * @returns The outcome; `failed` when the text is no longer available.
   */
  reanalyseRetainedText(forcedDateOrder: AmbiguousDateOrder): Promise<AnalysisOutcome>;
}

/** Settles the promise of a request, with an outcome or a promise of one. */
type OutcomeResolver = (outcome: AnalysisOutcome | PromiseLike<AnalysisOutcome>) => void;

/** The request the worker is currently working on. */
interface PendingRequest {
  /** The number that tells the answers to this request apart from answers to older ones. */
  readonly requestId: number;
  /** The text sent with the request, or `null` when the worker was asked to reuse its own copy. */
  readonly rawText: string | null;
  /** The date order to force, or `null` to detect it. */
  readonly forcedDateOrder: AmbiguousDateOrder | null;
  /** Settles the promise the page is waiting on. */
  readonly resolve: OutcomeResolver;
}

/**
 * No worker has answered a request yet (or the one that had has since
 * crashed). It may still turn out that workers cannot be used at all, so the
 * page keeps its own copy of the text to fall back on.
 */
interface UnprovenWorkerStatus {
  readonly kind: 'unproven';
  /** The page's copy of the last loaded text; `null` until a file has been loaded. */
  readonly retainedRawText: string | null;
}

/**
 * A worker has answered at least one request. It demonstrably works and holds
 * the text itself, so the page keeps no copy.
 */
interface ProvenWorkerStatus {
  readonly kind: 'proven';
}

/**
 * Workers proved unusable and are not tried again for the rest of the page's
 * life. Every analysis runs on the main thread, from the page's copy of the text.
 */
interface DisabledWorkerStatus {
  readonly kind: 'disabled';
  /** The page's copy of the last loaded text; `null` until a file has been loaded. */
  readonly retainedRawText: string | null;
}

/** How far the client trusts the worker, which decides who holds the text. Discriminated by `kind`. */
type WorkerStatus = UnprovenWorkerStatus | ProvenWorkerStatus | DisabledWorkerStatus;

/** What every main-thread analysis that cannot be carried out resolves with. */
const MAIN_THREAD_FAILURE: FailedAnalysisOutcome = {
  kind: 'failed',
  errorMessage: MAIN_THREAD_FAILURE_MESSAGE,
};

/**
 * Runs the analysis on the main thread after a short delay.
 *
 * @param dependencies - Supplies the analysis, the timer and the locale.
 * @param rawText - The text to analyse, or `null` when none is available any more.
 * @param forcedDateOrder - The date order to force, or `null` to detect it.
 * @returns The outcome; `failed` when there is no text or the analysis throws.
 */
function analyseOnMainThreadLater(
  dependencies: AnalysisClientDependencies,
  rawText: string | null,
  forcedDateOrder: AmbiguousDateOrder | null,
): Promise<AnalysisOutcome> {
  const locale = dependencies.getLocale();

  return new Promise<AnalysisOutcome>((resolve: OutcomeResolver): void => {
    dependencies.runLater((): void => {
      if (rawText === null) {
        resolve(MAIN_THREAD_FAILURE);
        return;
      }
      try {
        resolve(dependencies.analyseOnMainThread(rawText, forcedDateOrder, locale));
      } catch {
        resolve(MAIN_THREAD_FAILURE);
      }
    }, MAIN_THREAD_ANALYSIS_DELAY_IN_MILLISECONDS);
  });
}

/**
 * Builds the message that asks the worker for an analysis.
 *
 * @param request - The request to send.
 * @param locale - The BCP 47 tag of the browser, or `null` when it is not known.
 * @returns A request to analyse the text it carries, or to reuse the text the
 *   worker kept when the request carries none.
 */
function buildWorkerRequest(request: PendingRequest, locale: string | null): AnalysisWorkerRequest {
  if (request.rawText === null) {
    return {
      kind: 'reanalyse-retained-text',
      requestId: request.requestId,
      forcedDateOrder: request.forcedDateOrder,
      locale,
    };
  }
  return {
    kind: 'analyse-new-text',
    requestId: request.requestId,
    rawText: request.rawText,
    forcedDateOrder: request.forcedDateOrder,
    locale,
  };
}

/**
 * Reads the page's own copy of the text out of a worker status.
 *
 * @returns The copy, or `null` when the worker is proven and the page holds none.
 */
function retainedRawTextOf(workerStatus: WorkerStatus): string | null {
  if (workerStatus.kind === 'proven') {
    return null;
  }
  return workerStatus.retainedRawText;
}

/**
 * The client that the page sends its analysis requests through. It prefers the
 * worker and falls back to the main thread when the worker proves unusable.
 */
class WorkerBackedAnalysisClient implements AnalysisClient {
  /** The worker starter, the main-thread analysis and the small browser services. */
  private readonly dependencies: AnalysisClientDependencies;

  /** How far the worker is trusted, and with it the page's copy of the text. */
  private workerStatus: WorkerStatus;

  /** The running worker, once one has been started. */
  private workerConnection: AnalysisWorkerConnection | null = null;

  /** Increased with every request, so answers to replaced requests can be told apart. */
  private latestRequestId = 0;

  /** The request the worker has not answered yet. */
  private pendingRequest: PendingRequest | null = null;

  public constructor(dependencies: AnalysisClientDependencies) {
    this.dependencies = dependencies;
    const hasWorkers = dependencies.startWorker !== null;
    this.workerStatus = hasWorkers
      ? { kind: 'unproven', retainedRawText: null }
      : { kind: 'disabled', retainedRawText: null };
  }

  public analyseNewText(rawText: string): Promise<AnalysisOutcome> {
    return this.submit(rawText, null);
  }

  public reanalyseRetainedText(forcedDateOrder: AmbiguousDateOrder): Promise<AnalysisOutcome> {
    return this.submit(null, forcedDateOrder);
  }

  /**
   * Routes a request to the worker or to the main thread.
   *
   * @param rawText - The text to analyse, or `null` to reuse the last text.
   * @param forcedDateOrder - The date order to force, or `null` to detect it.
   */
  private submit(
    rawText: string | null,
    forcedDateOrder: AmbiguousDateOrder | null,
  ): Promise<AnalysisOutcome> {
    this.latestRequestId += 1;
    const requestId = this.latestRequestId;

    if (rawText !== null) {
      this.retainUnlessWorkerIsProven(rawText);
    }

    const startWorker = this.dependencies.startWorker;
    if (this.workerStatus.kind === 'disabled' || startWorker === null) {
      const textToAnalyse = rawText ?? retainedRawTextOf(this.workerStatus);
      return analyseOnMainThreadLater(this.dependencies, textToAnalyse, forcedDateOrder);
    }

    return new Promise<AnalysisOutcome>((resolve: OutcomeResolver): void => {
      this.sendToWorker({ requestId, rawText, forcedDateOrder, resolve }, startWorker);
    });
  }

  /**
   * Keeps the page's own copy of a newly loaded text, unless a worker has
   * already proven itself, in which case the worker's copy is the only one.
   */
  private retainUnlessWorkerIsProven(rawText: string): void {
    if (this.workerStatus.kind === 'proven') {
      return;
    }
    this.workerStatus = { kind: this.workerStatus.kind, retainedRawText: rawText };
  }

  /**
   * Sends a request to the worker, starting the worker first when needed.
   */
  private sendToWorker(request: PendingRequest, startWorker: AnalysisWorkerStarter): void {
    const supersededRequest = this.pendingRequest;
    this.pendingRequest = request;
    if (supersededRequest !== null) {
      supersededRequest.resolve({ kind: 'superseded' });
    }

    const workerConnection = this.getOrStartWorker(startWorker);
    if (workerConnection === null) {
      this.fallBackToMainThread();
      return;
    }
    workerConnection.send(buildWorkerRequest(request, this.dependencies.getLocale()));
  }

  /**
   * Returns the running worker, starting one when there is none.
   *
   * @returns The connection, or `null` when the browser refused to create a worker.
   */
  private getOrStartWorker(startWorker: AnalysisWorkerStarter): AnalysisWorkerConnection | null {
    if (this.workerConnection !== null) {
      return this.workerConnection;
    }
    try {
      this.workerConnection = startWorker({
        onResponse: (response: AnalysisWorkerResponse): void => {
          this.handleWorkerResponse(response);
        },
        onError: (): void => {
          this.handleWorkerError();
        },
      });
    } catch {
      return null;
    }
    return this.workerConnection;
  }

  /**
   * Handles a message from the worker.
   */
  private handleWorkerResponse(response: AnalysisWorkerResponse): void {
    const answeredRequest = this.pendingRequest;
    if (response.requestId !== answeredRequest?.requestId) {
      /* Nothing is pending, or this answers a request that has since been replaced. */
      return;
    }

    if (response.kind === 'progress') {
      this.dependencies.onProgress(response.statusMessage);
      return;
    }

    /* The worker demonstrably works and holds the text, so the page's copy can go. */
    this.workerStatus = { kind: 'proven' };
    this.pendingRequest = null;

    if (response.kind === 'completed') {
      answeredRequest.resolve(response.result);
      return;
    }
    answeredRequest.resolve({ kind: 'failed', errorMessage: response.errorMessage });
  }

  /**
   * Handles an error event of the worker.
   *
   * Before the worker's first answer, an error means the worker could not be
   * loaded at all, and the main thread takes over. After it, the worker has
   * crashed in the middle of real work; the text it held is gone, so the user
   * is asked to load the file again and the next request starts a new worker.
   */
  private handleWorkerError(): void {
    if (this.workerStatus.kind !== 'proven') {
      this.fallBackToMainThread();
      return;
    }

    this.discardWorker();
    this.workerStatus = { kind: 'unproven', retainedRawText: null };

    const interruptedRequest = this.pendingRequest;
    this.pendingRequest = null;
    if (interruptedRequest !== null) {
      interruptedRequest.resolve({ kind: 'failed', errorMessage: WORKER_STOPPED_MESSAGE });
    }
  }

  /**
   * Gives up on workers for the rest of the page's life and answers the
   * pending request from the main thread instead.
   */
  private fallBackToMainThread(): void {
    const retainedRawText = retainedRawTextOf(this.workerStatus);
    this.workerStatus = { kind: 'disabled', retainedRawText };
    this.discardWorker();

    const abandonedRequest = this.pendingRequest;
    this.pendingRequest = null;
    if (abandonedRequest === null) {
      return;
    }
    /* A request to re-analyse carries no text of its own and relies on the page's copy. */
    const textToAnalyse = abandonedRequest.rawText ?? retainedRawText;
    abandonedRequest.resolve(
      analyseOnMainThreadLater(this.dependencies, textToAnalyse, abandonedRequest.forcedDateOrder),
    );
  }

  /**
   * Stops the worker and forgets it.
   */
  private discardWorker(): void {
    if (this.workerConnection !== null) {
      this.workerConnection.terminate();
      this.workerConnection = null;
    }
  }
}

/**
 * Creates the client that the page sends its analysis requests through.
 *
 * @param dependencies - The worker starter, the main-thread analysis and the
 *   small browser services the client relies on.
 * @returns The client.
 */
export function createAnalysisClient(dependencies: AnalysisClientDependencies): AnalysisClient {
  return new WorkerBackedAnalysisClient(dependencies);
}
