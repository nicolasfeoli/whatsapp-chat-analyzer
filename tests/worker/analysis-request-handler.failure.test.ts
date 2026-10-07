/**
 * Tests of what the analysis worker answers when the analysis itself throws.
 *
 * No invented chat makes the real analysis throw, so this file replaces it by
 * a stand-in that does. The replacement applies to the whole file, which is
 * why these few tests live apart from the rest of the handler's tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { analyseChatExport } from '../../src/core/index';
import { createAnalysisRequestHandler } from '../../src/worker/analysis-request-handler';
import { UNKNOWN_FAILURE_ERROR_MESSAGE } from '../../src/worker/analysis-worker-protocol';
import type {
  AnalyseNewTextRequest,
  AnalysisWorkerResponse,
} from '../../src/worker/analysis-worker-protocol';

/* Everything else the handler takes from the core (the wording of failures) stays real. */
vi.mock(import('../../src/core/index'), async (importOriginal) => ({
  ...(await importOriginal()),
  analyseChatExport: vi.fn(),
}));

const NEW_TEXT_REQUEST: AnalyseNewTextRequest = {
  kind: 'analyse-new-text',
  requestId: 5,
  rawText: 'the stand-in analysis never reads this',
  forcedDateOrder: null,
  locale: null,
};

/**
 * Handles one request with an analysis that throws the given value, and
 * returns everything that was sent back.
 */
function handleRequestWhileAnalysisThrows(thrownValue: unknown): AnalysisWorkerResponse[] {
  vi.mocked(analyseChatExport).mockImplementation(() => {
    throw thrownValue;
  });
  const sentResponses: AnalysisWorkerResponse[] = [];
  const handleRequest = createAnalysisRequestHandler((response) => {
    sentResponses.push(response);
  });

  handleRequest(NEW_TEXT_REQUEST);
  return sentResponses;
}

describe('createAnalysisRequestHandler, when the analysis throws', () => {
  beforeEach(() => {
    vi.mocked(analyseChatExport).mockReset();
  });

  it('answers with a failure after the progress message, instead of throwing itself', () => {
    const sentResponses = handleRequestWhileAnalysisThrows(new RangeError('Invalid string length'));

    expect(sentResponses.map((response) => response.kind)).toEqual(['progress', 'failed']);
  });

  it('passes on the message of the error, with the number of the request', () => {
    const sentResponses = handleRequestWhileAnalysisThrows(new RangeError('Invalid string length'));

    expect(sentResponses[1]).toEqual({
      kind: 'failed',
      requestId: 5,
      errorMessage: 'Invalid string length',
    });
  });

  it('passes on the message of an error-like object that is not an Error', () => {
    const sentResponses = handleRequestWhileAnalysisThrows({ message: 'object message' });

    expect(sentResponses[1]).toEqual({
      kind: 'failed',
      requestId: 5,
      errorMessage: 'object message',
    });
  });

  it.each([
    { description: 'an error without a message', thrownValue: new Error('') },
    { description: 'a thrown string', thrownValue: 'out of memory' },
    { description: 'undefined', thrownValue: undefined },
    { description: 'null', thrownValue: null },
    { description: 'an object whose message is not a string', thrownValue: { message: 42 } },
  ])('falls back to a generic sentence for $description', ({ thrownValue }) => {
    const sentResponses = handleRequestWhileAnalysisThrows(thrownValue);

    expect(sentResponses[1]).toEqual({
      kind: 'failed',
      requestId: 5,
      errorMessage: UNKNOWN_FAILURE_ERROR_MESSAGE,
    });
    expect(UNKNOWN_FAILURE_ERROR_MESSAGE).toBe('Could not analyse that file.');
  });
});
