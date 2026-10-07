// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { assignPersonColours } from '../../../src/ui/person-colours';
import {
  describeMilestone,
  hasMilestonesWorthListing,
  renderMilestonesSection,
} from '../../../src/ui/sections/milestones';
import type { ChatAnalysis, ChatMilestone } from '../../../src/core/types';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { localMidnight, localTime } from '../../fixtures/messages';
import { parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';

const firstMessage: ChatMilestone = {
  kind: 'first-message',
  timestamp: localTime('2023-03-14 08:00'),
  sender: 'Ana',
};

const halfOfMessages: ChatMilestone = {
  kind: 'half-of-messages',
  timestamp: localTime('2024-11-02 19:45'),
  messageCount: 6_173,
};

const thirdAnniversary: ChatMilestone = {
  kind: 'anniversary',
  timestamp: localMidnight('2026-03-14'),
  years: 3,
};

/**
 * Builds the milestone of a round number of messages.
 */
function messageCountMilestone(
  messageCount: number,
  sentAt: string,
  sender: string,
): ChatMilestone {
  return { kind: 'message-count', timestamp: localTime(sentAt), sender, messageCount };
}

/**
 * Builds a chat between Ana and Bob of 12,345 messages with the milestones given.
 */
function chatWithMilestones(milestones: readonly ChatMilestone[]): ChatAnalysis {
  return chatAnalysis({
    milestones,
    people: [
      personStatistics({ name: 'Ana', messageCount: 7_000 }),
      personStatistics({ name: 'Bob', messageCount: 5_345 }),
    ],
  });
}

/** A chat of three and a half years that reached 10,000 messages. */
const longChat = chatWithMilestones([
  firstMessage,
  messageCountMilestone(1_000, '2023-08-20 22:10', 'Bob'),
  halfOfMessages,
  messageCountMilestone(10_000, '2025-12-24 23:59', 'Ana'),
  thirdAnniversary,
]);

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis): HTMLDivElement {
  return parseMarkup(renderMilestonesSection(analysis, assignPersonColours(analysis.people)));
}

/**
 * Says what a milestone of the long chat reads, as the text a reader sees.
 */
function descriptionOf(milestone: ChatMilestone, analysis: ChatAnalysis = longChat): string {
  const descriptionHtml = describeMilestone(
    milestone,
    analysis,
    assignPersonColours(analysis.people),
  );
  return parseMarkup(descriptionHtml).textContent;
}

describe('describeMilestone', () => {
  it('names who sent the first message', () => {
    expect(descriptionOf(firstMessage)).toBe('First message, from Ana');
  });

  it.each([
    { messageCount: 1_000, expected: 'The 1,000th message, from Bob' },
    { messageCount: 10_000, expected: 'The 10,000th message, from Bob' },
    { messageCount: 50_000, expected: 'The 50,000th message, from Bob' },
    { messageCount: 100_000, expected: 'The 100,000th message, from Bob' },
  ])('writes message $messageCount as "$expected"', ({ messageCount, expected }) => {
    const milestone = messageCountMilestone(messageCount, '2024-05-06 07:08', 'Bob');

    expect(descriptionOf(milestone)).toBe(expected);
  });

  it('measures the half against all the messages of the chat', () => {
    expect(descriptionOf(halfOfMessages)).toBe('Half of the 12,345 messages had been sent');
  });

  it('counts the years of an anniversary', () => {
    expect(descriptionOf(thirdAnniversary)).toBe('3 years since the first message');
  });

  it('writes one year in the singular', () => {
    const firstAnniversary: ChatMilestone = { ...thirdAnniversary, years: 1 };

    expect(descriptionOf(firstAnniversary)).toBe('1 year since the first message');
  });

  it('draws the sender with the swatch of their colour', () => {
    const descriptionHtml = describeMilestone(
      messageCountMilestone(1_000, '2024-05-06 07:08', 'Bob'),
      longChat,
      assignPersonColours(longChat.people),
    );

    expect(descriptionHtml).toBe(
      'The 1,000th message, from <span class="milestone-sender">' +
        '<i class="colour-swatch" style="background:var(--s2)"></i>Bob</span>',
    );
  });
});

describe('hasMilestonesWorthListing', () => {
  it('is false for a chat that only has its first message', () => {
    expect(hasMilestonesWorthListing([firstMessage])).toBe(false);
  });

  it('is false for no milestones at all', () => {
    expect(hasMilestonesWorthListing([])).toBe(false);
  });

  it.each([
    halfOfMessages,
    thirdAnniversary,
    messageCountMilestone(1_000, '2024-05-06 07:08', 'Bob'),
  ])('is true once the chat has a milestone of kind $kind', (milestone) => {
    expect(hasMilestonesWorthListing([firstMessage, milestone])).toBe(true);
  });
});

describe('renderMilestonesSection', () => {
  it('is left out of a chat that has passed nothing but its first message', () => {
    const youngChat = chatWithMilestones([firstMessage]);

    expect(renderMilestonesSection(youngChat, assignPersonColours(youngChat.people))).toBe('');
  });

  it('is headed "Milestones"', () => {
    expect(textsOfElements(renderSection(longChat), '.section-heading h2')).toEqual(['Milestones']);
  });

  it('lists the day of each milestone in the order of the analysis', () => {
    expect(textsOfElements(renderSection(longChat), '.milestones .milestone-date')).toEqual([
      '14 Mar 2023',
      '20 Aug 2023',
      '2 Nov 2024',
      '24 Dec 2025',
      '14 Mar 2026',
    ]);
  });

  it('says next to each day what happened on it', () => {
    expect(textsOfElements(renderSection(longChat), '.milestones .milestone-description')).toEqual([
      'First message, from Ana',
      'The 1,000th message, from Bob',
      'Half of the 12,345 messages had been sent',
      'The 10,000th message, from Ana',
      '3 years since the first message',
    ]);
  });

  it('does not repeat the text of the first message, which is shown under the records', () => {
    const section = renderSection(longChat);

    expect(section.textContent).not.toContain('hello');
  });

  it('is shown for a chat whose only other milestone is its first anniversary', () => {
    const quietChat = chatWithMilestones([firstMessage, { ...thirdAnniversary, years: 1 }]);

    expect(textsOfElements(renderSection(quietChat), '.milestones li')).toHaveLength(2);
  });

  it('writes a sender whose name is markup as text', () => {
    const hostileName = '<img src=x onerror=alert(1)>';
    const hostileChat = chatWithMilestones([
      { ...firstMessage, sender: hostileName },
      messageCountMilestone(1_000, '2024-05-06 07:08', hostileName),
    ]);

    const section = renderSection(hostileChat);

    expect(tagNamesIn(section)).not.toContain('img');
    expect(textsOfElements(section, '.milestone-sender')).toEqual([hostileName, hostileName]);
  });
});
