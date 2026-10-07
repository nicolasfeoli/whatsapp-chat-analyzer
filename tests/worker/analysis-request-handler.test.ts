/**
 * Tests of the logic of the analysis worker. The handler is free of worker
 * globals, so it runs here with a plain function standing in for `postMessage`.
 */

import { describe, expect, it } from 'vitest';

import { createAnalysisRequestHandler } from '../../src/worker/analysis-request-handler';
import type { AnalysisRequestHandler } from '../../src/worker/analysis-request-handler';
import {
  ANALYSING_STATUS_MESSAGE,
  NO_RETAINED_TEXT_ERROR_MESSAGE,
} from '../../src/worker/analysis-worker-protocol';
import type {
  AnalysisCompletedResponse,
  AnalysisWorkerResponse,
} from '../../src/worker/analysis-worker-protocol';
import { androidLine, exportText } from '../fixtures/export-lines';

/** An invented export whose dates can be read both as day/month and as month/day. */
const AMBIGUOUS_CHAT_TEXT = exportText([
  androidLine({ date: '1/2/24', time: '10:00', sender: 'Ana', text: 'hello' }),
  androidLine({ date: '1/2/24', time: '10:01', sender: 'Bob', text: 'hi' }),
]);

/** A handler together with everything it sent back. */
interface HandlerHarness {
  readonly handleRequest: AnalysisRequestHandler;
  readonly sentResponses: AnalysisWorkerResponse[];
}

/**
 * Creates a handler that collects its responses in a list.
 */
function createHarness(): HandlerHarness {
  const sentResponses: AnalysisWorkerResponse[] = [];
  const handleRequest = createAnalysisRequestHandler((response) => {
    sentResponses.push(response);
  });
  return { handleRequest, sentResponses };
}

/**
 * Finds the one `completed` response among those sent and fails the test when
 * there is none.
 */
function findCompletedResponse(
  sentResponses: readonly AnalysisWorkerResponse[],
  requestId: number,
): AnalysisCompletedResponse {
  const completedResponse = sentResponses.find(
    (response): response is AnalysisCompletedResponse =>
      response.kind === 'completed' && response.requestId === requestId,
  );
  if (completedResponse === undefined) {
    throw new Error(`Request ${requestId} was not completed`);
  }
  return completedResponse;
}

describe('createAnalysisRequestHandler', () => {
  describe('a newly loaded export', () => {
    it('answers with one progress message and then the result', () => {
      const { handleRequest, sentResponses } = createHarness();

      handleRequest({
        kind: 'analyse-new-text',
        requestId: 1,
        rawText: AMBIGUOUS_CHAT_TEXT,
        forcedDateOrder: null,
        locale: 'en-GB',
      });

      expect(sentResponses.map((response) => response.kind)).toEqual(['progress', 'completed']);
      expect(sentResponses[0]).toEqual({
        kind: 'progress',
        requestId: 1,
        statusMessage: ANALYSING_STATUS_MESSAGE,
      });
    });

    it('echoes the number of the request in every response', () => {
      const { handleRequest, sentResponses } = createHarness();

      handleRequest({
        kind: 'analyse-new-text',
        requestId: 42,
        rawText: AMBIGUOUS_CHAT_TEXT,
        forcedDateOrder: null,
        locale: null,
      });

      expect(sentResponses.map((response) => response.requestId)).toEqual([42, 42]);
    });

    it('returns the analysis of the text', () => {
      const { handleRequest, sentResponses } = createHarness();

      handleRequest({
        kind: 'analyse-new-text',
        requestId: 1,
        rawText: AMBIGUOUS_CHAT_TEXT,
        forcedDateOrder: null,
        locale: 'en-GB',
      });

      expect(findCompletedResponse(sentResponses, 1).result).toMatchObject({
        kind: 'analysed',
        dateOrder: 'dmy',
        isDateOrderAmbiguous: true,
        analysis: { totalMessageCount: 2 },
      });
    });

    it('uses the language of the browser to settle an ambiguous date order', () => {
      const { handleRequest, sentResponses } = createHarness();

      handleRequest({
        kind: 'analyse-new-text',
        requestId: 1,
        rawText: AMBIGUOUS_CHAT_TEXT,
        forcedDateOrder: null,
        locale: 'en-US',
      });

      expect(findCompletedResponse(sentResponses, 1).result).toMatchObject({ dateOrder: 'mdy' });
    });

    it('completes with an empty result for text that is not a chat', () => {
      const { handleRequest, sentResponses } = createHarness();

      handleRequest({
        kind: 'analyse-new-text',
        requestId: 1,
        rawText: 'just some notes',
        forcedDateOrder: null,
        locale: null,
      });

      expect(findCompletedResponse(sentResponses, 1).result).toEqual({ kind: 'empty' });
    });

    it('sends a result that survives the structured clone of a real worker', () => {
      const { handleRequest, sentResponses } = createHarness();

      handleRequest({
        kind: 'analyse-new-text',
        requestId: 1,
        rawText: AMBIGUOUS_CHAT_TEXT,
        forcedDateOrder: null,
        locale: null,
      });

      /* `toStrictEqual` also compares prototypes, so a class instance in a response would fail here. */
      expect(sentResponses).toHaveLength(2);
      expect(structuredClone(sentResponses)).toStrictEqual(sentResponses);
    });
  });

  describe('re-reading the retained text', () => {
    it('analyses the text of the previous request with the forced date order', () => {
      const { handleRequest, sentResponses } = createHarness();
      handleRequest({
        kind: 'analyse-new-text',
        requestId: 1,
        rawText: AMBIGUOUS_CHAT_TEXT,
        forcedDateOrder: null,
        locale: 'en-GB',
      });

      handleRequest({
        kind: 'reanalyse-retained-text',
        requestId: 2,
        forcedDateOrder: 'mdy',
        locale: 'en-GB',
      });

      expect(findCompletedResponse(sentResponses, 2).result).toMatchObject({
        kind: 'analysed',
        dateOrder: 'mdy',
        analysis: { totalMessageCount: 2 },
      });
    });

    it('can be repeated, switching back and forth', () => {
      const { handleRequest, sentResponses } = createHarness();
      handleRequest({
        kind: 'analyse-new-text',
        requestId: 1,
        rawText: AMBIGUOUS_CHAT_TEXT,
        forcedDateOrder: null,
        locale: 'en-GB',
      });

      handleRequest({
        kind: 'reanalyse-retained-text',
        requestId: 2,
        forcedDateOrder: 'mdy',
        locale: null,
      });
      handleRequest({
        kind: 'reanalyse-retained-text',
        requestId: 3,
        forcedDateOrder: 'dmy',
        locale: null,
      });

      expect(findCompletedResponse(sentResponses, 3).result).toMatchObject({ dateOrder: 'dmy' });
    });

    it('re-reads the most recently loaded text, not an earlier one', () => {
      const { handleRequest, sentResponses } = createHarness();
      handleRequest({
        kind: 'analyse-new-text',
        requestId: 1,
        rawText: AMBIGUOUS_CHAT_TEXT,
        forcedDateOrder: null,
        locale: null,
      });
      handleRequest({
        kind: 'analyse-new-text',
        requestId: 2,
        rawText: androidLine({ date: '1/2/24', sender: 'Carla', text: 'a chat of one message' }),
        forcedDateOrder: null,
        locale: null,
      });

      handleRequest({
        kind: 'reanalyse-retained-text',
        requestId: 3,
        forcedDateOrder: 'mdy',
        locale: null,
      });

      expect(findCompletedResponse(sentResponses, 3).result).toMatchObject({
        analysis: { totalMessageCount: 1 },
      });
    });

    it('fails, without a progress message, when no text was ever loaded', () => {
      const { handleRequest, sentResponses } = createHarness();

      handleRequest({
        kind: 'reanalyse-retained-text',
        requestId: 7,
        forcedDateOrder: 'mdy',
        locale: null,
      });

      expect(sentResponses).toEqual([
        { kind: 'failed', requestId: 7, errorMessage: NO_RETAINED_TEXT_ERROR_MESSAGE },
      ]);
      expect(NO_RETAINED_TEXT_ERROR_MESSAGE).toBe('Load the file again.');
    });
  });

  it('keeps the text of each handler to itself', () => {
    const firstHarness = createHarness();
    const secondHarness = createHarness();
    firstHarness.handleRequest({
      kind: 'analyse-new-text',
      requestId: 1,
      rawText: AMBIGUOUS_CHAT_TEXT,
      forcedDateOrder: null,
      locale: null,
    });

    secondHarness.handleRequest({
      kind: 'reanalyse-retained-text',
      requestId: 1,
      forcedDateOrder: 'mdy',
      locale: null,
    });

    expect(secondHarness.sentResponses.map((response) => response.kind)).toEqual(['failed']);
  });
});
