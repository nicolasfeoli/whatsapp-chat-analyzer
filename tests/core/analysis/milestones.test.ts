import { describe, expect, it } from 'vitest';

import {
  MESSAGE_COUNT_MILESTONES,
  anniversaryDayOf,
  completeMilestones,
  findHalfwayMessageNumber,
  findLatestAnniversary,
  recordMessageMilestones,
} from '../../../src/core/analysis/milestones';
import type { ChatMilestone } from '../../../src/core/types';
import { localMidnight, localTime, textMessage } from '../../fixtures/messages';

/**
 * Records one message at a position of the chat and returns what it added.
 */
function milestonesOfMessage(
  messageNumber: number,
  halfwayMessageNumber: number | null = null,
): ChatMilestone[] {
  const milestones: ChatMilestone[] = [];
  const message = textMessage({ sender: 'Bob', sentAt: '2024-05-06 07:08' });
  recordMessageMilestones(milestones, message, messageNumber, halfwayMessageNumber);
  return milestones;
}

describe('findHalfwayMessageNumber', () => {
  it('is half of an even number of messages', () => {
    expect(findHalfwayMessageNumber(100)).toBe(50);
  });

  it('rounds up for an odd number, so that at least half had been sent', () => {
    /* 50 of 101 messages are 49.5%; the 51st makes it 50.5%. */
    expect(findHalfwayMessageNumber(101)).toBe(51);
  });

  it('is not reported for a chat of 99 messages', () => {
    expect(findHalfwayMessageNumber(99)).toBeNull();
  });
});

describe('recordMessageMilestones', () => {
  it('notes the first message with its time and sender', () => {
    expect(milestonesOfMessage(1)).toEqual([
      { kind: 'first-message', timestamp: localTime('2024-05-06 07:08'), sender: 'Bob' },
    ]);
  });

  it.each([1_000, 10_000, 50_000, 100_000])(
    'notes message %i with its time and sender',
    (messageNumber) => {
      expect(milestonesOfMessage(messageNumber)).toEqual([
        {
          kind: 'message-count',
          timestamp: localTime('2024-05-06 07:08'),
          sender: 'Bob',
          messageCount: messageNumber,
        },
      ]);
    },
  );

  it('lists exactly those four round numbers', () => {
    expect(MESSAGE_COUNT_MILESTONES).toEqual([1_000, 10_000, 50_000, 100_000]);
  });

  it.each([2, 999, 1_001, 5_000, 20_000, 99_999, 200_000])(
    'adds nothing for message %i',
    (messageNumber) => {
      expect(milestonesOfMessage(messageNumber)).toEqual([]);
    },
  );

  it('notes the message that makes half of the chat, without a sender', () => {
    expect(milestonesOfMessage(321, 321)).toEqual([
      { kind: 'half-of-messages', timestamp: localTime('2024-05-06 07:08'), messageCount: 321 },
    ]);
  });

  it('notes both when the message that makes half is also a round number', () => {
    const kinds = milestonesOfMessage(1_000, 1_000).map((milestone) => milestone.kind);

    expect(kinds).toEqual(['message-count', 'half-of-messages']);
  });

  it('adds to the milestones already found', () => {
    const milestones: ChatMilestone[] = [];

    recordMessageMilestones(milestones, textMessage({ sender: 'Ana' }), 1, null);
    recordMessageMilestones(milestones, textMessage({ sender: 'Bob' }), 1_000, null);

    expect(milestones.map((milestone) => milestone.kind)).toEqual([
      'first-message',
      'message-count',
    ]);
  });
});

describe('anniversaryDayOf', () => {
  it('is the same day of the same month, so many years later', () => {
    expect(anniversaryDayOf(localMidnight('2023-03-14'), 3)).toEqual(localMidnight('2026-03-14'));
  });

  it('is 28 February for a chat that began on 29 February, in a year without one', () => {
    expect(anniversaryDayOf(localMidnight('2024-02-29'), 1)).toEqual(localMidnight('2025-02-28'));
  });

  it('is 29 February again four years later', () => {
    expect(anniversaryDayOf(localMidnight('2024-02-29'), 4)).toEqual(localMidnight('2028-02-29'));
  });
});

describe('findLatestAnniversary', () => {
  const firstMessageTimestamp = localTime('2023-03-14 18:30');

  it('is null for a chat that ends the day before its first anniversary', () => {
    expect(findLatestAnniversary(firstMessageTimestamp, localTime('2024-03-13 23:59'))).toBeNull();
  });

  it('is one year for a chat that reaches the day, even earlier in the day than it began', () => {
    expect(findLatestAnniversary(firstMessageTimestamp, localTime('2024-03-14 00:05'))).toEqual({
      kind: 'anniversary',
      timestamp: localMidnight('2024-03-14'),
      years: 1,
    });
  });

  it('is the latest anniversary only, for a chat of several years', () => {
    expect(findLatestAnniversary(firstMessageTimestamp, localTime('2026-10-01 12:00'))).toEqual({
      kind: 'anniversary',
      timestamp: localMidnight('2026-03-14'),
      years: 3,
    });
  });

  it('does not count the anniversary of a year whose day the chat did not reach', () => {
    /* 2026 has begun, but 14 March 2026 has not come: the latest anniversary is the second. */
    expect(findLatestAnniversary(firstMessageTimestamp, localTime('2026-01-20 12:00'))).toEqual({
      kind: 'anniversary',
      timestamp: localMidnight('2025-03-14'),
      years: 2,
    });
  });

  it('is null for a chat within one day', () => {
    expect(findLatestAnniversary(firstMessageTimestamp, firstMessageTimestamp)).toBeNull();
  });
});

describe('completeMilestones', () => {
  const firstMessage: ChatMilestone = {
    kind: 'first-message',
    timestamp: localTime('2023-03-14 18:30'),
    sender: 'Ana',
  };
  const thousandthMessage: ChatMilestone = {
    kind: 'message-count',
    timestamp: localTime('2024-06-01 10:00'),
    sender: 'Bob',
    messageCount: 1_000,
  };

  it('puts the anniversary where it belongs in time', () => {
    const milestones = completeMilestones(
      [firstMessage, thousandthMessage],
      firstMessage.timestamp,
      localTime('2024-07-01 10:00'),
    );

    expect(milestones.map((milestone) => milestone.kind)).toEqual([
      'first-message',
      'anniversary',
      'message-count',
    ]);
  });

  it('adds nothing to a chat shorter than a year', () => {
    const milestones = completeMilestones(
      [firstMessage],
      firstMessage.timestamp,
      localTime('2023-09-01 10:00'),
    );

    expect(milestones).toEqual([firstMessage]);
  });

  it('puts an anniversary before a message sent at the very midnight it begins with', () => {
    const messageOnTheDay: ChatMilestone = {
      ...thousandthMessage,
      timestamp: localTime('2024-03-14 00:00'),
    };

    const milestones = completeMilestones(
      [firstMessage, messageOnTheDay],
      firstMessage.timestamp,
      localTime('2024-03-14 09:00'),
    );

    expect(milestones.map((milestone) => milestone.kind)).toEqual([
      'first-message',
      'anniversary',
      'message-count',
    ]);
  });

  it('does not change the list it was given', () => {
    const messageMilestones = [firstMessage, thousandthMessage];

    completeMilestones(messageMilestones, firstMessage.timestamp, localTime('2024-07-01 10:00'));

    expect(messageMilestones).toEqual([firstMessage, thousandthMessage]);
  });
});
