/**
 * Tests of the few lines that start the real Web Worker and connect its
 * events to the analysis client.
 *
 * The test runner has no `Worker`, so the tests put a stand-in in its place
 * that records how it was created and used, and lets the test fire the events
 * a real worker would.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnalysisWorkerEventHandlers } from '../../src/ui/analysis-client';
import {
  areWorkersSupported,
  startBrowserAnalysisWorker,
} from '../../src/ui/browser-analysis-worker';
import type {
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
} from '../../src/worker/analysis-worker-protocol';

/** Stands in for the browser's `Worker`: an event target that records its use. */
class FakeWorker extends EventTarget {
  /** Every fake worker created, in order, so a test can reach the one the code started. */
  public static readonly created: FakeWorker[] = [];

  /** The script the worker was started from. */
  public readonly scriptUrl: URL | string;
  /** The options the worker was started with. */
  public readonly options: WorkerOptions | undefined;
  /** Every message posted to the worker, in order. */
  public readonly postedMessages: unknown[] = [];
  /** Whether the worker has been stopped. */
  public isTerminated = false;

  public constructor(scriptUrl: URL | string, options?: WorkerOptions) {
    super();
    this.scriptUrl = scriptUrl;
    this.options = options;
    FakeWorker.created.push(this);
  }

  public postMessage(message: unknown): void {
    this.postedMessages.push(message);
  }

  public terminate(): void {
    this.isTerminated = true;
  }
}

/** A request with nothing remarkable about it. */
const REQUEST: AnalysisWorkerRequest = {
  kind: 'reanalyse-retained-text',
  requestId: 4,
  forcedDateOrder: 'mdy',
  locale: 'en-GB',
};

/** A response with nothing remarkable about it. */
const RESPONSE: AnalysisWorkerResponse = {
  kind: 'progress',
  requestId: 4,
  statusMessage: 'Analysing the chat …',
};

/**
 * Creates handlers that only record how they were called.
 */
function createRecordingHandlers() {
  return {
    onResponse: vi.fn<AnalysisWorkerEventHandlers['onResponse']>(),
    onError: vi.fn<AnalysisWorkerEventHandlers['onError']>(),
  };
}

/**
 * Starts the worker with the stand-in in place and returns it with its handlers.
 */
function startWithFakeWorker() {
  vi.stubGlobal('Worker', FakeWorker);
  const eventHandlers = createRecordingHandlers();
  const connection = startBrowserAnalysisWorker(eventHandlers);
  const fakeWorker = FakeWorker.created[FakeWorker.created.length - 1];
  if (fakeWorker === undefined) {
    throw new Error('No worker was started');
  }
  return { connection, eventHandlers, fakeWorker };
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.created.length = 0;
});

describe('areWorkersSupported', () => {
  it('says no where there is no Worker constructor', () => {
    vi.stubGlobal('Worker', undefined);

    expect(areWorkersSupported()).toBe(false);
  });

  it('says yes where there is one', () => {
    vi.stubGlobal('Worker', FakeWorker);

    expect(areWorkersSupported()).toBe(true);
  });
});

describe('startBrowserAnalysisWorker', () => {
  it('starts exactly one worker, from the worker script, as a module', () => {
    const { fakeWorker } = startWithFakeWorker();

    expect(FakeWorker.created).toHaveLength(1);
    expect(String(fakeWorker.scriptUrl)).toMatch(/\/worker\/analysis-worker\.ts$/);
    expect(fakeWorker.options).toEqual({ type: 'module' });
  });

  it('passes every message of the worker on to the client', () => {
    const { eventHandlers, fakeWorker } = startWithFakeWorker();

    fakeWorker.dispatchEvent(new MessageEvent('message', { data: RESPONSE }));

    expect(eventHandlers.onResponse).toHaveBeenCalledExactlyOnceWith(RESPONSE);
    expect(eventHandlers.onError).not.toHaveBeenCalled();
  });

  it('tells the client when the worker fails', () => {
    const { eventHandlers, fakeWorker } = startWithFakeWorker();

    fakeWorker.dispatchEvent(new Event('error', { cancelable: true }));

    expect(eventHandlers.onError).toHaveBeenCalledOnce();
    expect(eventHandlers.onResponse).not.toHaveBeenCalled();
  });

  it('marks the failure as handled, so the browser does not also report it as uncaught', () => {
    const { fakeWorker } = startWithFakeWorker();
    const errorEvent = new Event('error', { cancelable: true });

    fakeWorker.dispatchEvent(errorEvent);

    expect(errorEvent.defaultPrevented).toBe(true);
  });

  it('posts the requests of the client to the worker', () => {
    const { connection, fakeWorker } = startWithFakeWorker();

    connection.send(REQUEST);

    expect(fakeWorker.postedMessages).toEqual([REQUEST]);
  });

  it('stops the worker when the client says so', () => {
    const { connection, fakeWorker } = startWithFakeWorker();

    connection.terminate();

    expect(fakeWorker.isTerminated).toBe(true);
  });

  it('lets the refusal of the browser through, for the client to fall back on', () => {
    /* A plain function serves as a constructor that refuses: `new` runs it and it throws. */
    vi.stubGlobal('Worker', function refuseToStart(): never {
      throw new Error('Workers are blocked by the settings of this browser');
    });

    expect(() => startBrowserAnalysisWorker(createRecordingHandlers())).toThrow(
      'Workers are blocked by the settings of this browser',
    );
  });
});
