/**
 * Tests of the worker's entry point: the few lines that connect the worker's
 * `message` events to the request handler and its answers to `postMessage`.
 *
 * The entry point talks to the global `self` of a dedicated worker, which does
 * not exist in the test runner. The tests put a stand-in in its place before
 * importing the module, and pass every message through `structuredClone`, as
 * the boundary of a real worker does.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ANALYSING_STATUS_MESSAGE,
  NO_RETAINED_TEXT_ERROR_MESSAGE,
} from '../../src/worker/analysis-worker-protocol';
import type {
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
} from '../../src/worker/analysis-worker-protocol';
import { androidLine, exportText } from '../fixtures/export-lines';

/** An invented export of two messages. */
const CHAT_TEXT = exportText([
  androidLine({ date: '31/12/23', time: '22:00', sender: 'Ana', text: 'happy new year' }),
  androidLine({ date: '31/12/23', time: '22:01', sender: 'Bob', text: 'same to you' }),
]);

/**
 * Stands in for the global scope of a dedicated worker: it receives events
 * like any event target and records what the worker posts back to the page.
 */
class FakeWorkerScope extends EventTarget {
  /** Everything posted to the page, as the page would receive it. */
  public readonly postedResponses: AnalysisWorkerResponse[] = [];

  public postMessage(response: AnalysisWorkerResponse): void {
    this.postedResponses.push(structuredClone(response));
  }

  /**
   * Delivers a request the way the page's `postMessage` does.
   */
  public deliver(request: AnalysisWorkerRequest): void {
    this.dispatchEvent(new MessageEvent('message', { data: structuredClone(request) }));
  }
}

describe('the entry point of the analysis worker', () => {
  let workerScope: FakeWorkerScope;

  beforeEach(async () => {
    workerScope = new FakeWorkerScope();
    vi.stubGlobal('self', workerScope);
    vi.resetModules();
    await import('../../src/worker/analysis-worker');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts nothing before it is asked for anything', () => {
    expect(workerScope.postedResponses).toEqual([]);
  });

  it('answers a request with a progress message and then the result', () => {
    workerScope.deliver({
      kind: 'analyse-new-text',
      requestId: 7,
      rawText: CHAT_TEXT,
      forcedDateOrder: null,
      locale: 'en-GB',
    });

    expect(workerScope.postedResponses).toHaveLength(2);
    expect(workerScope.postedResponses[0]).toEqual({
      kind: 'progress',
      requestId: 7,
      statusMessage: ANALYSING_STATUS_MESSAGE,
    });
    expect(workerScope.postedResponses[1]).toMatchObject({
      kind: 'completed',
      requestId: 7,
      result: { kind: 'analysed', dateOrder: 'dmy', analysis: { totalMessageCount: 2 } },
    });
  });

  it('keeps the text between messages, so it can be read again another way', () => {
    workerScope.deliver({
      kind: 'analyse-new-text',
      requestId: 1,
      rawText: androidLine({ date: '1/2/24', sender: 'Ana', text: 'hello' }),
      forcedDateOrder: null,
      locale: 'en-GB',
    });
    workerScope.deliver({
      kind: 'reanalyse-retained-text',
      requestId: 2,
      forcedDateOrder: 'mdy',
      locale: 'en-GB',
    });

    expect(workerScope.postedResponses[3]).toMatchObject({
      kind: 'completed',
      requestId: 2,
      result: { kind: 'analysed', dateOrder: 'mdy' },
    });
  });

  it('answers with a failure when asked to read a text again that it never received', () => {
    workerScope.deliver({
      kind: 'reanalyse-retained-text',
      requestId: 3,
      forcedDateOrder: 'dmy',
      locale: null,
    });

    expect(workerScope.postedResponses).toEqual([
      { kind: 'failed', requestId: 3, errorMessage: NO_RETAINED_TEXT_ERROR_MESSAGE },
    ]);
  });
});
