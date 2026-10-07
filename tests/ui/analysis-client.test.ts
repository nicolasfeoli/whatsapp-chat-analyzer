/**
 * Tests of the client that routes analysis requests to the worker or, when
 * the worker cannot be used, to the main thread.
 *
 * No real worker is involved: the client receives everything it needs from
 * its surroundings as dependencies, so the tests hand it a worker they can
 * script and a "run later" they can trigger by hand.
 */

import { describe, expect, it, vi } from 'vitest';

import type { AmbiguousDateOrder, ChatExportAnalysisResult } from '../../src/core/types';
import {
  MAIN_THREAD_ANALYSIS_DELAY_IN_MILLISECONDS,
  MAIN_THREAD_FAILURE_MESSAGE,
  WORKER_STOPPED_MESSAGE,
  createAnalysisClient,
} from '../../src/ui/analysis-client';
import type {
  AnalysisClient,
  AnalysisClientDependencies,
  AnalysisWorkerEventHandlers,
  AnalysisWorkerStarter,
} from '../../src/ui/analysis-client';
import type { AnalysisWorkerRequest } from '../../src/worker/analysis-worker-protocol';
import { analysedResult } from '../fixtures/analysis-builders';
import { androidLine } from '../fixtures/export-lines';

/** The text of an invented export; the fake analysis never looks inside it. */
const CHAT_TEXT = androidLine({ sender: 'Ana', text: 'hello' });

/** A second invented export, to tell two loaded files apart. */
const OTHER_CHAT_TEXT = androidLine({ sender: 'Bob', text: 'another chat' });

/** What the fake analysis and the fake worker answer with. */
const ANALYSED: ChatExportAnalysisResult = analysedResult();

/** A worker the test plays the part of. */
interface FakeWorker {
  /** Every request the client posted to this worker, in order. */
  readonly receivedRequests: AnalysisWorkerRequest[];
  /** Whether the client has stopped this worker. */
  isTerminated: boolean;
  /** The client's handlers, for the test to answer or fail through. */
  readonly eventHandlers: AnalysisWorkerEventHandlers;
}

/** Everything a test needs to drive the client and to see what it did. */
interface ClientHarness {
  readonly client: AnalysisClient;
  /** Every worker the client started, in order. */
  readonly startedWorkers: FakeWorker[];
  /** The stand-in for `analyseChatExport`. */
  readonly analyseOnMainThread: ReturnType<
    typeof vi.fn<AnalysisClientDependencies['analyseOnMainThread']>
  >;
  /** The stand-in for the status line. */
  readonly onProgress: ReturnType<typeof vi.fn<AnalysisClientDependencies['onProgress']>>;
  /** The delays the client asked to wait, in order. */
  readonly requestedDelays: number[];
  /** Runs everything the client scheduled with "run later". */
  runScheduledTasks(): void;
  /** The most recently started worker. */
  latestWorker(): FakeWorker;
}

/** How the surroundings of the client behave in one test. */
interface HarnessOptions {
  /** `'available'` starts fake workers, `'refused'` throws on start, `'missing'` offers none. */
  readonly workers?: 'available' | 'refused' | 'missing';
  /** The language the browser reports. */
  readonly locale?: string | null;
}

/**
 * Creates a client surrounded by fakes.
 */
function createHarness(options: HarnessOptions = {}): ClientHarness {
  const workers = options.workers ?? 'available';
  const startedWorkers: FakeWorker[] = [];
  const scheduledTasks: (() => void)[] = [];
  const requestedDelays: number[] = [];

  const startFakeWorker: AnalysisWorkerStarter = (eventHandlers) => {
    if (workers === 'refused') {
      throw new Error('This browser refuses to start workers');
    }
    const fakeWorker: FakeWorker = { receivedRequests: [], isTerminated: false, eventHandlers };
    startedWorkers.push(fakeWorker);
    return {
      send(request: AnalysisWorkerRequest): void {
        fakeWorker.receivedRequests.push(request);
      },
      terminate(): void {
        fakeWorker.isTerminated = true;
      },
    };
  };

  const analyseOnMainThread = vi.fn<AnalysisClientDependencies['analyseOnMainThread']>(
    () => ANALYSED,
  );
  const onProgress = vi.fn<AnalysisClientDependencies['onProgress']>();

  const client = createAnalysisClient({
    startWorker: workers === 'missing' ? null : startFakeWorker,
    analyseOnMainThread,
    runLater: (task, delayInMilliseconds) => {
      scheduledTasks.push(task);
      requestedDelays.push(delayInMilliseconds);
    },
    getLocale: () => (options.locale === undefined ? 'en-GB' : options.locale),
    onProgress,
  });

  return {
    client,
    startedWorkers,
    analyseOnMainThread,
    onProgress,
    requestedDelays,
    runScheduledTasks(): void {
      while (scheduledTasks.length > 0) {
        scheduledTasks.shift()?.();
      }
    },
    latestWorker(): FakeWorker {
      const worker = startedWorkers[startedWorkers.length - 1];
      if (worker === undefined) {
        throw new Error('The client has not started a worker');
      }
      return worker;
    },
  };
}

/**
 * Makes a fake worker report that it finished its most recent request.
 */
function completeLatestRequest(worker: FakeWorker): void {
  const request = worker.receivedRequests[worker.receivedRequests.length - 1];
  if (request === undefined) {
    throw new Error('The worker has not received a request');
  }
  worker.eventHandlers.onResponse({
    kind: 'completed',
    requestId: request.requestId,
    result: ANALYSED,
  });
}

/**
 * Lets promise callbacks that are already queued run.
 */
async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createAnalysisClient', () => {
  describe('with a working worker', () => {
    it('does not start the worker before the first request', () => {
      expect(createHarness().startedWorkers).toHaveLength(0);
    });

    it('posts the text of a new file to the worker, with the language of the browser', () => {
      const harness = createHarness({ locale: 'es-CR' });

      void harness.client.analyseNewText(CHAT_TEXT);

      expect(harness.latestWorker().receivedRequests).toEqual([
        {
          kind: 'analyse-new-text',
          requestId: 1,
          rawText: CHAT_TEXT,
          forcedDateOrder: null,
          locale: 'es-CR',
        },
      ]);
    });

    it('resolves with the result the worker sends back', async () => {
      const harness = createHarness();

      const outcome = harness.client.analyseNewText(CHAT_TEXT);
      completeLatestRequest(harness.latestWorker());

      await expect(outcome).resolves.toBe(ANALYSED);
    });

    it('resolves with an empty result as it is', async () => {
      const harness = createHarness();

      const outcome = harness.client.analyseNewText('not a chat');
      harness.latestWorker().eventHandlers.onResponse({
        kind: 'completed',
        requestId: 1,
        result: { kind: 'empty' },
      });

      await expect(outcome).resolves.toEqual({ kind: 'empty' });
    });

    it('never analyses on the main thread', async () => {
      const harness = createHarness();

      const outcome = harness.client.analyseNewText(CHAT_TEXT);
      completeLatestRequest(harness.latestWorker());
      await outcome;

      expect(harness.analyseOnMainThread).not.toHaveBeenCalled();
    });

    it('passes the progress messages of the worker on to the status line', () => {
      const harness = createHarness();
      void harness.client.analyseNewText(CHAT_TEXT);

      harness.latestWorker().eventHandlers.onResponse({
        kind: 'progress',
        requestId: 1,
        statusMessage: 'Analysing the chat …',
      });

      expect(harness.onProgress).toHaveBeenCalledExactlyOnceWith('Analysing the chat …');
    });

    it('resolves with a failure when the worker reports one', async () => {
      const harness = createHarness();

      const outcome = harness.client.analyseNewText(CHAT_TEXT);
      harness.latestWorker().eventHandlers.onResponse({
        kind: 'failed',
        requestId: 1,
        errorMessage: 'Could not analyse that file.',
      });

      await expect(outcome).resolves.toEqual({
        kind: 'failed',
        errorMessage: 'Could not analyse that file.',
      });
    });

    it('reuses the same worker for later requests, numbering them in order', async () => {
      const harness = createHarness();
      const firstOutcome = harness.client.analyseNewText(CHAT_TEXT);
      completeLatestRequest(harness.latestWorker());
      await firstOutcome;

      void harness.client.analyseNewText(OTHER_CHAT_TEXT);

      expect(harness.startedWorkers).toHaveLength(1);
      expect(harness.latestWorker().receivedRequests.map((request) => request.requestId)).toEqual([
        1, 2,
      ]);
    });

    describe('switching the date order', () => {
      it('asks the worker to re-read the text it kept, without sending the text again', async () => {
        const harness = createHarness();
        const firstOutcome = harness.client.analyseNewText(CHAT_TEXT);
        completeLatestRequest(harness.latestWorker());
        await firstOutcome;

        void harness.client.reanalyseRetainedText('mdy');

        expect(harness.latestWorker().receivedRequests[1]).toEqual({
          kind: 'reanalyse-retained-text',
          requestId: 2,
          forcedDateOrder: 'mdy',
          locale: 'en-GB',
        });
      });

      it('resolves with the result of the second reading', async () => {
        const harness = createHarness();
        const firstOutcome = harness.client.analyseNewText(CHAT_TEXT);
        completeLatestRequest(harness.latestWorker());
        await firstOutcome;

        const secondOutcome = harness.client.reanalyseRetainedText('mdy');
        completeLatestRequest(harness.latestWorker());

        await expect(secondOutcome).resolves.toBe(ANALYSED);
      });
    });

    describe('a request replaced by a newer one', () => {
      it('resolves as superseded as soon as the newer one is made', async () => {
        const harness = createHarness();

        const firstOutcome = harness.client.analyseNewText(CHAT_TEXT);
        void harness.client.analyseNewText(OTHER_CHAT_TEXT);

        await expect(firstOutcome).resolves.toEqual({ kind: 'superseded' });
      });

      it('ignores the late answer to the replaced request', async () => {
        const harness = createHarness();
        void harness.client.analyseNewText(CHAT_TEXT);
        const secondOutcome = harness.client.analyseNewText(OTHER_CHAT_TEXT);
        let hasSecondSettled = false;
        void secondOutcome.then(() => {
          hasSecondSettled = true;
        });

        harness.latestWorker().eventHandlers.onResponse({
          kind: 'completed',
          requestId: 1,
          result: { kind: 'empty' },
        });
        await flushPromises();

        expect(hasSecondSettled).toBe(false);
      });

      it('ignores the progress of the replaced request', () => {
        const harness = createHarness();
        void harness.client.analyseNewText(CHAT_TEXT);
        void harness.client.analyseNewText(OTHER_CHAT_TEXT);

        harness.latestWorker().eventHandlers.onResponse({
          kind: 'progress',
          requestId: 1,
          statusMessage: 'Analysing the chat …',
        });

        expect(harness.onProgress).not.toHaveBeenCalled();
      });

      it('resolves the newer request with its own answer', async () => {
        const harness = createHarness();
        void harness.client.analyseNewText(CHAT_TEXT);
        const secondOutcome = harness.client.analyseNewText(OTHER_CHAT_TEXT);

        completeLatestRequest(harness.latestWorker());

        await expect(secondOutcome).resolves.toBe(ANALYSED);
      });
    });

    it('ignores an answer that arrives when nothing is pending', async () => {
      const harness = createHarness();
      const outcome = harness.client.analyseNewText(CHAT_TEXT);
      completeLatestRequest(harness.latestWorker());
      await outcome;

      expect(() => {
        completeLatestRequest(harness.latestWorker());
      }).not.toThrow();
      expect(harness.startedWorkers).toHaveLength(1);
      expect(harness.analyseOnMainThread).not.toHaveBeenCalled();
      expect(harness.requestedDelays).toEqual([]);
    });
  });

  describe('in a browser without workers', () => {
    it('analyses on the main thread, after giving the page 30 ms to paint', async () => {
      const harness = createHarness({ workers: 'missing', locale: 'es-CR' });

      const outcome = harness.client.analyseNewText(CHAT_TEXT);

      expect(harness.analyseOnMainThread).not.toHaveBeenCalled();
      expect(harness.requestedDelays).toEqual([MAIN_THREAD_ANALYSIS_DELAY_IN_MILLISECONDS]);
      expect(MAIN_THREAD_ANALYSIS_DELAY_IN_MILLISECONDS).toBe(30);

      harness.runScheduledTasks();

      expect(harness.analyseOnMainThread).toHaveBeenCalledExactlyOnceWith(CHAT_TEXT, null, 'es-CR');
      await expect(outcome).resolves.toBe(ANALYSED);
    });

    it('keeps the text itself, to re-read it when the date order is switched', async () => {
      const harness = createHarness({ workers: 'missing' });
      void harness.client.analyseNewText(CHAT_TEXT);
      harness.runScheduledTasks();

      const outcome = harness.client.reanalyseRetainedText('mdy');
      harness.runScheduledTasks();

      expect(harness.analyseOnMainThread).toHaveBeenLastCalledWith(CHAT_TEXT, 'mdy', 'en-GB');
      await expect(outcome).resolves.toBe(ANALYSED);
    });

    it('re-reads the most recently loaded text, not an earlier one', () => {
      const harness = createHarness({ workers: 'missing' });
      void harness.client.analyseNewText(CHAT_TEXT);
      void harness.client.analyseNewText(OTHER_CHAT_TEXT);
      harness.runScheduledTasks();

      void harness.client.reanalyseRetainedText('dmy');
      harness.runScheduledTasks();

      expect(harness.analyseOnMainThread).toHaveBeenLastCalledWith(OTHER_CHAT_TEXT, 'dmy', 'en-GB');
    });

    it('resolves with a failure when the analysis throws', async () => {
      const harness = createHarness({ workers: 'missing' });
      harness.analyseOnMainThread.mockImplementation(() => {
        throw new Error('out of memory');
      });

      const outcome = harness.client.analyseNewText(CHAT_TEXT);
      harness.runScheduledTasks();

      await expect(outcome).resolves.toEqual({
        kind: 'failed',
        errorMessage: MAIN_THREAD_FAILURE_MESSAGE,
      });
    });

    it('resolves with a failure when asked to re-read before any file was loaded', async () => {
      const harness = createHarness({ workers: 'missing' });

      const outcome = harness.client.reanalyseRetainedText('mdy');
      harness.runScheduledTasks();

      await expect(outcome).resolves.toEqual({
        kind: 'failed',
        errorMessage: 'Could not analyse that file. Load it again.',
      });
      expect(harness.analyseOnMainThread).not.toHaveBeenCalled();
    });
  });

  describe('when the browser refuses to start the worker', () => {
    it('answers the request from the main thread instead', async () => {
      const harness = createHarness({ workers: 'refused' });

      const outcome = harness.client.analyseNewText(CHAT_TEXT);
      harness.runScheduledTasks();

      expect(harness.analyseOnMainThread).toHaveBeenCalledExactlyOnceWith(CHAT_TEXT, null, 'en-GB');
      await expect(outcome).resolves.toBe(ANALYSED);
    });

    it('can still switch the date order afterwards', async () => {
      const harness = createHarness({ workers: 'refused' });
      void harness.client.analyseNewText(CHAT_TEXT);
      harness.runScheduledTasks();

      const outcome = harness.client.reanalyseRetainedText('mdy');
      harness.runScheduledTasks();

      expect(harness.analyseOnMainThread).toHaveBeenLastCalledWith(CHAT_TEXT, 'mdy', 'en-GB');
      await expect(outcome).resolves.toBe(ANALYSED);
    });
  });

  describe('when the worker fails before it ever answered', () => {
    it('stops the worker and answers the pending request from the main thread', async () => {
      const harness = createHarness();
      const outcome = harness.client.analyseNewText(CHAT_TEXT);
      const worker = harness.latestWorker();

      worker.eventHandlers.onError();
      harness.runScheduledTasks();

      expect(worker.isTerminated).toBe(true);
      expect(harness.analyseOnMainThread).toHaveBeenCalledExactlyOnceWith(CHAT_TEXT, null, 'en-GB');
      await expect(outcome).resolves.toBe(ANALYSED);
    });

    it('does not try a worker again for the rest of the page’s life', () => {
      const harness = createHarness();
      void harness.client.analyseNewText(CHAT_TEXT);
      harness.latestWorker().eventHandlers.onError();
      harness.runScheduledTasks();

      void harness.client.analyseNewText(OTHER_CHAT_TEXT);
      harness.runScheduledTasks();

      expect(harness.startedWorkers).toHaveLength(1);
      expect(harness.analyseOnMainThread).toHaveBeenLastCalledWith(OTHER_CHAT_TEXT, null, 'en-GB');
    });

    it('re-reads the text on the main thread when the date order is switched afterwards', () => {
      const harness = createHarness();
      void harness.client.analyseNewText(CHAT_TEXT);
      harness.latestWorker().eventHandlers.onError();
      harness.runScheduledTasks();

      void harness.client.reanalyseRetainedText('mdy');
      harness.runScheduledTasks();

      expect(harness.analyseOnMainThread).toHaveBeenLastCalledWith(CHAT_TEXT, 'mdy', 'en-GB');
    });

    it('does nothing when no request is pending', () => {
      const harness = createHarness();
      void harness.client.analyseNewText(CHAT_TEXT);
      const worker = harness.latestWorker();
      worker.eventHandlers.onError();
      harness.runScheduledTasks();

      expect(() => {
        worker.eventHandlers.onError();
      }).not.toThrow();
      expect(harness.analyseOnMainThread).toHaveBeenCalledOnce();
    });
  });

  describe('when the worker crashes after it had been working', () => {
    /**
     * Loads a file through a working worker, then starts a date-order switch
     * that the test can let crash.
     */
    async function loadFileThenStartSwitch(forcedDateOrder: AmbiguousDateOrder) {
      const harness = createHarness();
      const firstOutcome = harness.client.analyseNewText(CHAT_TEXT);
      completeLatestRequest(harness.latestWorker());
      await firstOutcome;

      const interruptedOutcome = harness.client.reanalyseRetainedText(forcedDateOrder);
      return { harness, interruptedOutcome };
    }

    it('asks the user to load the file again, because the worker held the only copy', async () => {
      const { harness, interruptedOutcome } = await loadFileThenStartSwitch('mdy');

      harness.latestWorker().eventHandlers.onError();

      await expect(interruptedOutcome).resolves.toEqual({
        kind: 'failed',
        errorMessage: WORKER_STOPPED_MESSAGE,
      });
      expect(harness.analyseOnMainThread).not.toHaveBeenCalled();
    });

    it('stops the crashed worker', async () => {
      const { harness } = await loadFileThenStartSwitch('mdy');
      const crashedWorker = harness.latestWorker();

      crashedWorker.eventHandlers.onError();

      expect(crashedWorker.isTerminated).toBe(true);
    });

    it('starts a new worker for the next file', async () => {
      const { harness } = await loadFileThenStartSwitch('mdy');
      harness.latestWorker().eventHandlers.onError();

      void harness.client.analyseNewText(OTHER_CHAT_TEXT);

      expect(harness.startedWorkers).toHaveLength(2);
      expect(harness.latestWorker().receivedRequests).toEqual([
        {
          kind: 'analyse-new-text',
          requestId: 3,
          rawText: OTHER_CHAT_TEXT,
          forcedDateOrder: null,
          locale: 'en-GB',
        },
      ]);
    });

    it('falls back to the main thread if that new worker fails to load', async () => {
      const { harness } = await loadFileThenStartSwitch('mdy');
      harness.latestWorker().eventHandlers.onError();
      const outcome = harness.client.analyseNewText(OTHER_CHAT_TEXT);

      harness.latestWorker().eventHandlers.onError();
      harness.runScheduledTasks();

      expect(harness.analyseOnMainThread).toHaveBeenCalledExactlyOnceWith(
        OTHER_CHAT_TEXT,
        null,
        'en-GB',
      );
      await expect(outcome).resolves.toBe(ANALYSED);
    });

    it('copes with a crash while nothing is pending', async () => {
      const harness = createHarness();
      const outcome = harness.client.analyseNewText(CHAT_TEXT);
      completeLatestRequest(harness.latestWorker());
      await outcome;

      expect(() => {
        harness.latestWorker().eventHandlers.onError();
      }).not.toThrow();
      expect(harness.latestWorker().isTerminated).toBe(true);
      expect(harness.analyseOnMainThread).not.toHaveBeenCalled();
      expect(harness.requestedDelays).toEqual([]);
    });

    it('has let go of its own copy of the text, so a second failed worker cannot bring it back', async () => {
      const { harness } = await loadFileThenStartSwitch('mdy');
      harness.latestWorker().eventHandlers.onError();

      /* The new worker for this switch fails before it ever answers: the main thread takes over. */
      const outcome = harness.client.reanalyseRetainedText('dmy');
      harness.latestWorker().eventHandlers.onError();
      harness.runScheduledTasks();

      expect(harness.startedWorkers).toHaveLength(2);
      await expect(outcome).resolves.toEqual({
        kind: 'failed',
        errorMessage: MAIN_THREAD_FAILURE_MESSAGE,
      });
      expect(harness.analyseOnMainThread).not.toHaveBeenCalled();
    });
  });

  describe('when a worker that has not answered yet fails during a date-order switch', () => {
    it('re-reads the copy of the text the page kept, with the order that was asked for', async () => {
      const harness = createHarness();
      const firstOutcome = harness.client.analyseNewText(CHAT_TEXT);
      const switchOutcome = harness.client.reanalyseRetainedText('mdy');

      harness.latestWorker().eventHandlers.onError();
      harness.runScheduledTasks();

      await expect(firstOutcome).resolves.toEqual({ kind: 'superseded' });
      await expect(switchOutcome).resolves.toBe(ANALYSED);
      expect(harness.analyseOnMainThread).toHaveBeenCalledExactlyOnceWith(
        CHAT_TEXT,
        'mdy',
        'en-GB',
      );
    });

    it('keeps the newest file as that copy when two files were loaded in a row', async () => {
      const harness = createHarness();
      void harness.client.analyseNewText(CHAT_TEXT);
      void harness.client.analyseNewText(OTHER_CHAT_TEXT);
      const switchOutcome = harness.client.reanalyseRetainedText('dmy');

      harness.latestWorker().eventHandlers.onError();
      harness.runScheduledTasks();

      await expect(switchOutcome).resolves.toBe(ANALYSED);
      expect(harness.analyseOnMainThread).toHaveBeenCalledExactlyOnceWith(
        OTHER_CHAT_TEXT,
        'dmy',
        'en-GB',
      );
    });
  });

  it('reads the language of the browser anew for each request', () => {
    let currentLocale = 'en-GB';
    const receivedRequests: AnalysisWorkerRequest[] = [];
    const client = createAnalysisClient({
      startWorker: () => ({
        send: (request) => receivedRequests.push(request),
        terminate: () => undefined,
      }),
      analyseOnMainThread: () => ANALYSED,
      runLater: () => undefined,
      getLocale: () => currentLocale,
      onProgress: () => undefined,
    });

    void client.analyseNewText(CHAT_TEXT);
    currentLocale = 'en-US';
    void client.analyseNewText(OTHER_CHAT_TEXT);

    expect(receivedRequests.map((request) => request.locale)).toEqual(['en-GB', 'en-US']);
  });
});
