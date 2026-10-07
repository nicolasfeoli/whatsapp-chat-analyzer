import { describe, expect, it } from 'vitest';

import { foldPastedLines } from '../../../src/core/parsing/pasted-lines';
import type { ChatMessage } from '../../../src/core/types';
import { mediaMessage, sendersOf, textMessage, textsOf } from '../../fixtures/messages';

/** The longest run of out-of-order messages still treated as a paste. */
const LONGEST_FOLDED_RUN_LENGTH = 19;

/**
 * Builds a run of consecutive lines pasted from another chat: all from the
 * same stranger, all sent the day before the chat they are pasted into.
 */
function pastedRunFromZed(lineCount: number): ChatMessage[] {
  return Array.from({ length: lineCount }, () =>
    textMessage({ sender: 'Zed', sentAt: '2024-01-12 09:00', text: 'pasted' }),
  );
}

describe('foldPastedLines', () => {
  describe('chats without pasted lines', () => {
    it('returns nothing for no messages', () => {
      expect(foldPastedLines([])).toEqual({ messages: [], foldedLineCount: 0 });
    });

    it('returns a single message unchanged', () => {
      const messages = [textMessage({ sender: 'Ana' })];

      expect(foldPastedLines(messages)).toEqual({ messages, foldedLineCount: 0 });
    });

    it('returns messages in chronological order unchanged', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-14 08:00' }),
      ];

      expect(foldPastedLines(messages)).toEqual({ messages, foldedLineCount: 0 });
    });
  });

  describe('lines pasted from another chat', () => {
    it('folds the lines of a stranger that jump back in time into the message quoting them', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'look what he said:' }),
        textMessage({ sender: 'Zed', sentAt: '2024-01-12 09:00', text: 'I never said that' }),
        textMessage({ sender: 'Zed', sentAt: '2024-01-12 09:01', text: 'honest' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01', text: 'wow' }),
      ];

      const folding = foldPastedLines(messages);

      expect(textsOf(folding.messages)).toEqual([
        'look what he said:\nZed: I never said that\nZed: honest',
        'wow',
      ]);
    });

    it('removes the stranger from the senders', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Zed', sentAt: '2024-01-12 09:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01' }),
      ];

      const folding = foldPastedLines(messages);

      expect(sendersOf(folding.messages)).toEqual(['Ana', 'Bob']);
    });

    it('counts every folded line', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        textMessage({ sender: 'Zed', sentAt: '2024-01-12 09:00' }),
        textMessage({ sender: 'Zed', sentAt: '2024-01-12 09:01' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01' }),
      ];

      expect(foldPastedLines(messages).foldedLineCount).toBe(2);
    });

    it('keeps the timestamp and sender of the quoting message', () => {
      const quotingMessage = textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' });
      const messages = [
        quotingMessage,
        textMessage({ sender: 'Zed', sentAt: '2024-01-12 09:00' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01' }),
      ];

      const folding = foldPastedLines(messages);

      expect(folding.messages[0]).toMatchObject({
        kind: 'text',
        sender: 'Ana',
        timestamp: quotingMessage.timestamp,
      });
    });

    it('does not change the messages it was given', () => {
      const quotingMessage = textMessage({
        sender: 'Ana',
        sentAt: '2024-01-13 10:00',
        text: 'look',
      });
      const messages = [
        quotingMessage,
        textMessage({ sender: 'Zed', sentAt: '2024-01-12 09:00', text: 'pasted' }),
      ];

      foldPastedLines(messages);

      expect(messages).toHaveLength(2);
      expect(quotingMessage.text).toBe('look');
    });

    it('folds pasted lines at the very end of the file, where time never resumes', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'he said:' }),
        textMessage({ sender: 'Zed', sentAt: '2024-01-12 09:00', text: 'bye' }),
      ];

      const folding = foldPastedLines(messages);

      expect(textsOf(folding.messages)).toEqual(['he said:\nZed: bye']);
    });

    it('folds a stranger who appears in several pastes', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'first paste:' }),
        textMessage({ sender: 'Zed', sentAt: '2024-01-12 09:00', text: 'one' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:05', text: 'second paste:' }),
        textMessage({ sender: 'Zed', sentAt: '2024-01-12 09:30', text: 'two' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:06', text: 'ha' }),
      ];

      const folding = foldPastedLines(messages);

      expect(textsOf(folding.messages)).toEqual([
        'first paste:\nZed: one',
        'second paste:\nZed: two',
        'ha',
      ]);
    });

    it('folds only the strangers of a run that also contains a real participant', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'our old chat:' }),
        textMessage({ sender: 'Zed', sentAt: '2024-01-12 09:00', text: 'you there?' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-12 09:01', text: 'yes' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01', text: 'wow' }),
      ];

      const folding = foldPastedLines(messages);

      expect(textsOf(folding.messages)).toEqual(['our old chat:\nZed: you there?', 'yes', 'wow']);
    });

    it('drops lines pasted after a media message, which cannot quote anything', () => {
      const photo = mediaMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' });
      const messages = [
        photo,
        textMessage({ sender: 'Zed', sentAt: '2024-01-12 09:00', text: 'pasted' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01', text: 'wow' }),
      ];

      const folding = foldPastedLines(messages);

      expect(folding.messages[0]).toEqual(photo);
      expect(folding.foldedLineCount).toBe(1);
    });
  });

  describe('real participants whose clock jumps back', () => {
    it('keeps the messages of a traveller who landed in an earlier time zone', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'boarding' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 04:00', text: 'landed' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 04:30', text: 'welcome' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 11:00', text: 'dinner?' }),
      ];

      expect(foldPastedLines(messages)).toEqual({ messages, foldedLineCount: 0 });
    });

    it('keeps a sender who jumps back once but also writes in order elsewhere', () => {
      const messages = [
        textMessage({ sender: 'Diego', sentAt: '2024-01-13 09:00', text: 'morning' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'hi' }),
        textMessage({ sender: 'Diego', sentAt: '2024-01-13 08:00', text: 'sent from the plane' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:01', text: 'ok' }),
      ];

      expect(foldPastedLines(messages).foldedLineCount).toBe(0);
    });
  });

  describe('clocks that disagree by a few minutes', () => {
    it('keeps a message dated exactly ten minutes before the one above it', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:10' }),
        textMessage({ sender: 'Marta', sentAt: '2024-01-13 10:00' }),
      ];

      expect(foldPastedLines(messages).foldedLineCount).toBe(0);
    });

    it('folds a stranger dated more than ten minutes before the message above', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:10:01' }),
        textMessage({ sender: 'Marta', sentAt: '2024-01-13 10:00:00' }),
      ];

      expect(foldPastedLines(messages).foldedLineCount).toBe(1);
    });

    it('measures the run against the message before it, so pasted lines may be in any order', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'look:' }),
        textMessage({ sender: 'Zed', sentAt: '2024-01-12 09:05', text: 'later line' }),
        textMessage({ sender: 'Zed', sentAt: '2024-01-12 09:00', text: 'earlier line' }),
        textMessage({ sender: 'Zed', sentAt: '2024-01-13 09:59', text: 'a minute before' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:00', text: 'wow' }),
      ];

      const folding = foldPastedLines(messages);

      expect(sendersOf(folding.messages)).toEqual(['Ana', 'Bob']);
    });
  });

  describe('runs too long to be a paste', () => {
    it('folds a run of nineteen lines', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        ...pastedRunFromZed(LONGEST_FOLDED_RUN_LENGTH),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01' }),
      ];

      const folding = foldPastedLines(messages);

      expect(folding.foldedLineCount).toBe(LONGEST_FOLDED_RUN_LENGTH);
      expect(sendersOf(folding.messages)).toEqual(['Ana', 'Bob']);
    });

    it('leaves a run of twenty lines alone, because it looks like a clock change', () => {
      const messages = [
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        ...pastedRunFromZed(LONGEST_FOLDED_RUN_LENGTH + 1),
        textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01' }),
      ];

      const folding = foldPastedLines(messages);

      expect(folding.foldedLineCount).toBe(0);
      expect(folding.messages).toHaveLength(messages.length);
    });
  });
});
