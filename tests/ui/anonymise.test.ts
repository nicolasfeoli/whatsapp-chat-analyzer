import { describe, expect, it } from 'vitest';

import {
  HIDDEN_MESSAGE_TEXT,
  SOMEBODY_ELSE_LABEL,
  anonymiseAnalysis,
  anonymousLabelOf,
  anonymousMemberLabelOf,
} from '../../src/ui/anonymise';
import type { ChatAnalysis } from '../../src/core/types';
import { assignPersonColours } from '../../src/ui/person-colours';
import { buildRecapCards } from '../../src/ui/recap/cards';
import { renderAwardsSection } from '../../src/ui/sections/awards';
import { renderGroupHistorySection } from '../../src/ui/sections/group-history';
import { renderMilestonesSection } from '../../src/ui/sections/milestones';
import { renderPeakTimesSection } from '../../src/ui/sections/peak-times';
import { renderPersonProfileSection } from '../../src/ui/sections/person-profile';
import { renderReplySpeedPairsSection } from '../../src/ui/sections/reply-speed-pairs';
import { renderSharedSitesSection } from '../../src/ui/sections/shared-sites';
import { renderTextingStyleSection } from '../../src/ui/sections/texting-style';
import { renderTrendsSection } from '../../src/ui/sections/trends';
import { renderWhoIsStillHereSection } from '../../src/ui/sections/who-is-still-here';
import { renderWordSearchOutcome } from '../../src/ui/sections/word-search';
import { chatAnalysis, personStatistics } from '../fixtures/analysis-builders';
import { THE_EXPORTER, groupEvent, namedMember } from '../fixtures/group-events';
import { localMidnight, localTime, mediaMessage, textMessage } from '../fixtures/messages';
import { trendBucket } from '../fixtures/trends';

const longestMessage = textMessage({
  sender: 'Bob Vega',
  sentAt: '2024-01-13 10:01',
  text: 'Ana, this is the long story of my week',
});

/** A chat of three whose names turn up in what they write to each other. */
const namedChat: ChatAnalysis = chatAnalysis({
  messages: [
    textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'hello Bob' }),
    longestMessage,
    mediaMessage({
      sender: '~ Carla',
      sentAt: '2024-01-13 10:02',
      text: 'image omitted',
      caption: 'for Ana',
    }),
  ],
  longestMessage,
  longestMessageWordCount: 9,
  wordCounts: new Map([
    ['hello', 5],
    ['bob', 4],
    ['vega', 1],
    ['carla', 2],
    ['dinner', 3],
  ]),
  people: [
    personStatistics({
      name: 'Ana',
      messageCount: 30,
      messageCountsByHour: [...new Array<number>(23).fill(0), 30],
      messageCountsByWeekday: [0, 0, 0, 0, 0, 30, 0],
      replyCountsByRecipient: new Map([
        ['Bob Vega', 7],
        ['~ Carla', 2],
      ]),
      replyDelaysByRecipient: new Map([
        ['Bob Vega', [60_000, 120_000, 180_000, 240_000, 300_000, 360_000, 420_000]],
        ['~ Carla', [30_000, 90_000]],
      ]),
      mentionCountsByName: new Map([
        ['Bob Vega', 3],
        ['Carla', 1],
        ['~Carla', 1],
        ['Dani who left', 4],
        ['Another stranger', 1],
      ]),
      wordCounts: new Map([
        ['bob', 4],
        ['dinner', 3],
      ]),
      signaturePhrases: [
        { phrase: 'thanks bob', count: 6 },
        { phrase: 'count me in', count: 5 },
      ],
    }),
    personStatistics({
      name: 'Bob Vega',
      messageCount: 20,
      replyCountsByRecipient: new Map([['Ana', 5]]),
    }),
    personStatistics({ name: '~ Carla', messageCount: 10 }),
  ],
});

const hiddenChat = anonymiseAnalysis(namedChat);

/** Finds a person of the hidden chat by their position in the ranking. */
function hiddenPerson(index: number): ChatAnalysis['people'][number] {
  const person = hiddenChat.people[index];
  if (person === undefined) {
    throw new Error(`The hidden chat has no person ${index}`);
  }
  return person;
}

describe('anonymousLabelOf', () => {
  it.each([
    { index: 0, expected: 'Person A' },
    { index: 1, expected: 'Person B' },
    { index: 25, expected: 'Person Z' },
    { index: 26, expected: 'Person 27' },
    { index: 99, expected: 'Person 100' },
  ])('labels the person at position $index "$expected"', ({ index, expected }) => {
    expect(anonymousLabelOf(index)).toBe(expected);
  });
});

describe('anonymiseAnalysis', () => {
  it('replaces every name by a label, in the order of the ranking', () => {
    expect(hiddenChat.people.map((person) => person.name)).toEqual([
      'Person A',
      'Person B',
      'Person C',
    ]);
  });

  it('keeps the numbers', () => {
    expect(hiddenChat.people.map((person) => person.messageCount)).toEqual([30, 20, 10]);
    expect(hiddenChat.totalMessageCount).toBe(namedChat.totalMessageCount);
    expect(hiddenChat.longestMessageWordCount).toBe(9);
  });

  it('keeps the hours and the weekdays each person writes in', () => {
    expect(hiddenPerson(0).messageCountsByHour[23]).toBe(30);
    expect(hiddenPerson(0).messageCountsByWeekday).toEqual([0, 0, 0, 0, 0, 30, 0]);
  });

  it('relabels the people somebody replied to', () => {
    expect(hiddenPerson(0).replyCountsByRecipient).toEqual(
      new Map([
        ['Person B', 7],
        ['Person C', 2],
      ]),
    );
    expect(hiddenPerson(1).replyCountsByRecipient).toEqual(new Map([['Person A', 5]]));
  });

  it('relabels whom each reply delay was towards, and keeps the delays', () => {
    expect(hiddenPerson(0).replyDelaysByRecipient).toEqual(
      new Map([
        ['Person B', [60_000, 120_000, 180_000, 240_000, 300_000, 360_000, 420_000]],
        ['Person C', [30_000, 90_000]],
      ]),
    );
    expect(hiddenPerson(1).replyDelaysByRecipient.size).toBe(0);
  });

  it('joins the delays towards people it has no label for under somebody else', () => {
    const chatWithStrangers = chatAnalysis({
      people: [
        personStatistics({
          name: 'Ana',
          messageCount: 2,
          replyDelaysByRecipient: new Map([
            ['Dani who left', [1000]],
            ['Another stranger', [2000, 3000]],
          ]),
        }),
      ],
    });

    expect(anonymiseAnalysis(chatWithStrangers).people[0]?.replyDelaysByRecipient).toEqual(
      new Map([[SOMEBODY_ELSE_LABEL, [1000, 2000, 3000]]]),
    );
  });

  it('leaves no name in "How fast each answers whom"', () => {
    const sectionHtml = renderReplySpeedPairsSection(
      hiddenChat,
      assignPersonColours(hiddenChat.people),
    );

    /* The median of Ana's seven delays towards Bob Vega is the fourth, four minutes. */
    expect(sectionHtml).toContain('Person B');
    expect(sectionHtml).toContain('>4 min</td>');
    for (const nameWord of ['Ana', 'Bob', 'Vega', 'Carla']) {
      expect(sectionHtml).not.toContain(nameWord);
    }
  });

  it('relabels the people somebody mentioned, with or without the "not a contact" tilde', () => {
    const mentionCounts = hiddenPerson(0).mentionCountsByName;

    expect(mentionCounts.get('Person B')).toBe(3);
    expect(mentionCounts.get('Person C')).toBe(2);
  });

  it('adds up the mentions of people who never wrote under one label', () => {
    expect(hiddenPerson(0).mentionCountsByName.get(SOMEBODY_ELSE_LABEL)).toBe(5);
  });

  it('relabels the sender of every message and hides what it says', () => {
    expect(hiddenChat.messages.map((message) => [message.sender, message.text])).toEqual([
      ['Person A', HIDDEN_MESSAGE_TEXT],
      ['Person B', HIDDEN_MESSAGE_TEXT],
      ['Person C', 'image omitted'],
    ]);
  });

  it('removes the caption of a media message, which is typed text too', () => {
    const [, , mediaEntry] = hiddenChat.messages;

    expect(mediaEntry).toMatchObject({ kind: 'media', caption: '' });
  });

  it('hides the longest message', () => {
    expect(hiddenChat.longestMessage).toMatchObject({
      sender: 'Person B',
      text: HIDDEN_MESSAGE_TEXT,
    });
  });

  it('keeps a chat without a longest message without one', () => {
    const withoutWords = anonymiseAnalysis(chatAnalysis({ longestMessage: null }));

    expect(withoutWords.longestMessage).toBeNull();
  });

  it('takes the words of the names out of the words of the chat', () => {
    expect([...hiddenChat.wordCounts.keys()]).toEqual(['hello', 'dinner']);
  });

  it('takes the words of the names out of the words of each person', () => {
    expect([...hiddenPerson(0).wordCounts.keys()]).toEqual(['dinner']);
  });

  it('drops the phrases that hold a word of a name and keeps the others', () => {
    expect(hiddenPerson(0).signaturePhrases).toEqual([{ phrase: 'count me in', count: 5 }]);
  });

  it('labels a sender it has no label for as somebody else', () => {
    const strayMessage = chatAnalysis({
      messages: [textMessage({ sender: 'Zoe', text: 'hello' })],
      people: [personStatistics({ name: 'Ana', messageCount: 1 })],
    });

    expect(anonymiseAnalysis(strayMessage).messages[0]?.sender).toBe(SOMEBODY_ELSE_LABEL);
  });

  it('keeps short words of a name, such as "de", in the word lists', () => {
    const chat = chatAnalysis({
      wordCounts: new Map([
        ['de', 9],
        ['vega', 2],
      ]),
      people: [personStatistics({ name: 'Carla de Vega', messageCount: 1 })],
    });

    expect([...anonymiseAnalysis(chat).wordCounts.keys()]).toEqual(['de']);
  });

  it('copes with a name that has no letters, such as a phone number', () => {
    const chat = chatAnalysis({
      wordCounts: new Map([['hello', 1]]),
      people: [personStatistics({ name: '+506 5555 0100', messageCount: 1 })],
    });

    const hidden = anonymiseAnalysis(chat);

    expect(hidden.people[0]?.name).toBe('Person A');
    expect([...hidden.wordCounts.keys()]).toEqual(['hello']);
  });

  it.each([
    { index: 0, label: 'Person A' },
    { index: 1, label: 'Person B' },
    { index: 2, label: 'Person C' },
  ])('leaves no name in "One person up close" when it shows $label', ({ index, label }) => {
    const sectionHtml = renderPersonProfileSection(
      hiddenChat,
      assignPersonColours(hiddenChat.people),
      index,
    );

    expect(sectionHtml).toContain(`<option value="${String(index)}" selected>${label} (`);
    for (const nameWord of ['Ana', 'Bob', 'Vega', 'Carla', 'Dani', 'stranger', 'bob']) {
      expect(sectionHtml).not.toContain(nameWord);
    }
  });

  it('shows whom a person answers and mentions under their labels in "One person up close"', () => {
    const sectionHtml = renderPersonProfileSection(
      hiddenChat,
      assignPersonColours(hiddenChat.people),
    );

    expect(sectionHtml).toContain('Person B</span><small>7 replies</small>');
    expect(sectionHtml).toContain('Somebody else</span><small>5 mentions</small>');
    expect(sectionHtml).toContain('dinner<small>3</small>');
  });

  describe('the awards', () => {
    /** Ana writes at night and Bob Vega opens the conversations. */
    const chatWithAwards = chatAnalysis({
      conversationCount: 30,
      people: [
        personStatistics({ name: 'Ana', messageCount: 200, nightMessageCount: 50 }),
        personStatistics({ name: 'Bob Vega', messageCount: 100, conversationsStartedCount: 21 }),
      ],
    });
    const hiddenChatWithAwards = anonymiseAnalysis(chatWithAwards);

    it('gives the titles to labels instead of names, for the same numbers', () => {
      const sectionHtml = renderAwardsSection(
        hiddenChatWithAwards,
        assignPersonColours(hiddenChatWithAwards.people),
      );

      expect(sectionHtml).toContain('Person A</span><span class="award-reason">25% of their');
      expect(sectionHtml).toContain('Person B</span><span class="award-reason">started 21 of');
      expect(sectionHtml).not.toContain('Ana');
      expect(sectionHtml).not.toContain('Bob');
      expect(sectionHtml).not.toContain('Vega');
    });
  });

  describe('"Who is still here"', () => {
    /** A chat of the whole of 2024 in which Carla stopped writing in March. */
    const yearLongChat = chatAnalysis({
      spanInDays: 366,
      firstMessageTimestamp: localTime('2024-01-01 09:00'),
      lastMessageTimestamp: localTime('2024-12-31 22:00'),
      people: [
        personStatistics({
          name: 'Ana',
          messageCount: 30,
          firstMessageTimestamp: localTime('2024-01-01 09:00'),
          lastMessageTimestamp: localTime('2024-12-31 22:00'),
        }),
        personStatistics({
          name: '~ Carla',
          messageCount: 10,
          firstMessageTimestamp: localTime('2024-01-02 09:00'),
          lastMessageTimestamp: localTime('2024-03-14 18:00'),
        }),
      ],
    });
    const hiddenYearLongChat = anonymiseAnalysis(yearLongChat);

    it('keeps when each person wrote first and last', () => {
      expect(hiddenYearLongChat.people[1]?.firstMessageTimestamp).toEqual(
        localTime('2024-01-02 09:00'),
      );
      expect(hiddenYearLongChat.people[1]?.lastMessageTimestamp).toEqual(
        localTime('2024-03-14 18:00'),
      );
    });

    it('lists labels instead of names, with the same dates and status', () => {
      const sectionHtml = renderWhoIsStillHereSection(
        hiddenYearLongChat,
        assignPersonColours(hiddenYearLongChat.people),
      );

      expect(sectionHtml).toContain('Person B</td><td>2 Jan 2024</td><td>14 Mar 2024</td>');
      expect(sectionHtml).toContain('Gone quiet');
      expect(sectionHtml).not.toContain('Ana');
      expect(sectionHtml).not.toContain('Carla');
    });
  });

  describe('"When each person writes"', () => {
    /** Ana and Bob Vega each wrote 200 messages, hers on Saturday nights and his on Monday mornings. */
    const chatWithPeakTimes = chatAnalysis({
      people: [
        personStatistics({
          name: 'Ana',
          messageCount: 200,
          messageCountsByHour: [...new Array<number>(23).fill(0), 200],
          messageCountsByWeekday: [0, 0, 0, 0, 0, 200, 0],
        }),
        personStatistics({
          name: 'Bob Vega',
          messageCount: 200,
          messageCountsByHour: [0, 0, 0, 0, 0, 0, 0, 0, 200, ...new Array<number>(15).fill(0)],
          messageCountsByWeekday: [200, 0, 0, 0, 0, 0, 0],
        }),
      ],
    });

    it('lists labels instead of names, with the same weekdays and hours', () => {
      const hiddenChatWithPeakTimes = anonymiseAnalysis(chatWithPeakTimes);
      const sectionHtml = renderPeakTimesSection(
        hiddenChatWithPeakTimes,
        assignPersonColours(hiddenChatWithPeakTimes.people),
      );

      expect(sectionHtml).toContain('Person A</td><td>Mostly on Saturdays, around 23:00</td>');
      expect(sectionHtml).toContain('Person B</td><td>Mostly on Mondays, around 08:00</td>');
      expect(sectionHtml).not.toContain('Ana');
      expect(sectionHtml).not.toContain('Bob');
      expect(sectionHtml).not.toContain('Vega');
    });
  });

  describe('"How each person writes"', () => {
    /** Ana types one word at a time; Bob Vega writes long messages. */
    const chatWithStyles = chatAnalysis({
      people: [
        personStatistics({
          name: 'Ana',
          messageCount: 200,
          textMessageCount: 200,
          singleWordMessageCount: 150,
          emojiOnlyMessageCount: 20,
          longestMessageWordCount: 9,
        }),
        personStatistics({
          name: 'Bob Vega',
          messageCount: 100,
          textMessageCount: 100,
          singleWordMessageCount: 5,
          longestMessageWordCount: 310,
        }),
      ],
    });
    const hiddenChatWithStyles = anonymiseAnalysis(chatWithStyles);

    it('keeps the counts the shares are made of', () => {
      expect(hiddenChatWithStyles.people[0]).toMatchObject({
        singleWordMessageCount: 150,
        emojiOnlyMessageCount: 20,
        longestMessageWordCount: 9,
      });
    });

    it('lists labels instead of names, with the same shares and lengths', () => {
      const sectionHtml = renderTextingStyleSection(
        hiddenChatWithStyles,
        assignPersonColours(hiddenChatWithStyles.people),
      );

      expect(sectionHtml).toContain('Person A</td><td>75%</td><td>10%</td><td>9 words</td>');
      expect(sectionHtml).toContain('Person B</td><td>5.0%</td><td>0%</td><td>310 words</td>');
      expect(sectionHtml).not.toContain('Ana');
      expect(sectionHtml).not.toContain('Bob');
      expect(sectionHtml).not.toContain('Vega');
    });
  });

  describe('the sites links lead to', () => {
    /** A chat in which Ana links to a news site and Bob Vega to sites that carry their names. */
    const chatWithLinks = chatAnalysis({
      linkSiteCounts: new Map([
        ['news.example', 12],
        ['bob-vega.example', 5],
        ['ana2024.example', 3],
        ['banana.example', 2],
        ['shop.ana', 1],
      ]),
      people: [
        personStatistics({
          name: 'Ana',
          messageCount: 30,
          linkSiteCounts: new Map([
            ['news.example', 12],
            ['banana.example', 2],
            ['shop.ana', 1],
          ]),
        }),
        personStatistics({
          name: 'Bob Vega',
          messageCount: 20,
          linkSiteCounts: new Map([
            ['bob-vega.example', 5],
            ['ana2024.example', 3],
          ]),
        }),
      ],
    });
    const hiddenChatWithLinks = anonymiseAnalysis(chatWithLinks);

    it('keeps the sites that are not names, with their counts', () => {
      expect(hiddenChatWithLinks.linkSiteCounts.get('news.example')).toBe(12);
      expect(hiddenChatWithLinks.people[0]?.linkSiteCounts.get('news.example')).toBe(12);
    });

    it('takes out the sites named after a participant, for the chat and for each person', () => {
      expect([...hiddenChatWithLinks.linkSiteCounts.keys()]).toEqual([
        'news.example',
        'banana.example',
        'shop.ana',
      ]);
      expect([...(hiddenChatWithLinks.people[1]?.linkSiteCounts.keys() ?? [])]).toEqual([]);
    });

    it('keeps a site that merely contains a name inside a longer word', () => {
      expect(hiddenChatWithLinks.linkSiteCounts.has('banana.example')).toBe(true);
    });

    it('does not take a top-level domain for a name', () => {
      expect(hiddenChatWithLinks.linkSiteCounts.has('shop.ana')).toBe(true);
    });

    it('leaves no name in the "Most shared sites" section', () => {
      const sectionHtml = renderSharedSitesSection(
        hiddenChatWithLinks,
        assignPersonColours(hiddenChatWithLinks.people),
      );

      expect(sectionHtml).toContain('news.example');
      expect(sectionHtml).toContain('Person B</td><td>–</td>');
      expect(sectionHtml).not.toContain('Ana');
      expect(sectionHtml).not.toContain('Bob');
      expect(sectionHtml).not.toContain('vega');
      expect(sectionHtml).not.toContain('ana2024');
    });

    it('does not change the tables it was given', () => {
      expect(chatWithLinks.linkSiteCounts.size).toBe(5);
      expect(chatWithLinks.people[1]?.linkSiteCounts.size).toBe(2);
    });
  });

  describe('the milestones', () => {
    const chatWithMilestones = chatAnalysis({
      people: namedChat.people,
      milestones: [
        { kind: 'first-message', timestamp: localTime('2023-03-14 08:00'), sender: 'Bob Vega' },
        { kind: 'half-of-messages', timestamp: localTime('2023-09-01 12:00'), messageCount: 30 },
        { kind: 'anniversary', timestamp: localMidnight('2024-03-14'), years: 1 },
        {
          kind: 'message-count',
          timestamp: localTime('2024-05-06 07:08'),
          sender: '~ Carla',
          messageCount: 1_000,
        },
        {
          kind: 'message-count',
          timestamp: localTime('2025-01-02 03:04'),
          sender: 'Dani who left',
          messageCount: 10_000,
        },
      ],
    });
    const hiddenMilestones = anonymiseAnalysis(chatWithMilestones).milestones;

    it('relabels the sender of the first message and of each round number', () => {
      expect(hiddenMilestones[0]).toEqual({
        kind: 'first-message',
        timestamp: localTime('2023-03-14 08:00'),
        sender: 'Person B',
      });
      expect(hiddenMilestones[3]).toEqual({
        kind: 'message-count',
        timestamp: localTime('2024-05-06 07:08'),
        sender: 'Person C',
        messageCount: 1_000,
      });
    });

    it('labels a sender it has no label for as somebody else', () => {
      expect(hiddenMilestones[4]).toMatchObject({ sender: SOMEBODY_ELSE_LABEL });
    });

    it('keeps the milestones that name nobody as they are', () => {
      expect(hiddenMilestones[1]).toEqual(chatWithMilestones.milestones[1]);
      expect(hiddenMilestones[2]).toEqual(chatWithMilestones.milestones[2]);
    });

    it('leaves no name in the "Milestones" section', () => {
      const hidden = anonymiseAnalysis(chatWithMilestones);

      const sectionHtml = renderMilestonesSection(hidden, assignPersonColours(hidden.people));

      expect(sectionHtml).toContain('Person B');
      expect(sectionHtml).toContain('Somebody else');
      for (const nameWord of ['Ana', 'Bob', 'Vega', 'Carla', 'Dani']) {
        expect(sectionHtml).not.toContain(nameWord);
      }
    });

    it('does not change the milestones it was given', () => {
      expect(chatWithMilestones.milestones[0]).toMatchObject({ sender: 'Bob Vega' });
    });
  });

  describe('"Look up a word"', () => {
    /** Looks a word up in the real messages and draws the outcome from the copy without names. */
    function lookUpWithoutNames(query: string): string {
      return renderWordSearchOutcome(
        query,
        namedChat,
        hiddenChat,
        assignPersonColours(hiddenChat.people),
        'most-active',
      );
    }

    it('finds nothing in the copy itself, whose texts are hidden', () => {
      const outcomeHtml = renderWordSearchOutcome(
        'hello',
        hiddenChat,
        hiddenChat,
        assignPersonColours(hiddenChat.people),
        'most-active',
      );

      expect(outcomeHtml).toContain('No message contains');
    });

    it('shows who wrote a word by label when the real messages are searched', () => {
      /* Bob Vega wrote "Ana" in his long message and Carla in her caption. */
      const outcomeHtml = lookUpWithoutNames('ana');

      expect(outcomeHtml).toContain('“ana” is in 2 of 3 written messages');
      expect(outcomeHtml).toContain('Person B');
      expect(outcomeHtml).toContain('Person C');
    });

    it('leaves no name and no message text in the outcome, beyond the word the reader typed', () => {
      const outcomeHtml = lookUpWithoutNames('ana');

      for (const hiddenText of ['Ana', 'Bob', 'Vega', 'Carla', 'long story', 'for ']) {
        expect(outcomeHtml).not.toContain(hiddenText);
      }
    });
  });

  it('does not change the analysis it was given', () => {
    expect(namedChat.people[0]?.name).toBe('Ana');
    expect(namedChat.messages[0]?.text).toBe('hello Bob');
    expect(namedChat.wordCounts.has('bob')).toBe(true);
  });
});

describe('anonymiseAnalysis, the trends over time', () => {
  /** Six months in which Ana and Bob Vega swap places, and the chat talks about Bob and about dinner. */
  const chatWithTrends: ChatAnalysis = chatAnalysis({
    people: [
      personStatistics({ name: 'Ana', messageCount: 300 }),
      personStatistics({ name: 'Bob Vega', messageCount: 300 }),
    ],
    trends: {
      granularity: 'month',
      buckets: [80, 80, 70, 30, 20, 20].map((anaCount, index) =>
        trendBucket(`2024-0${String(index + 1)}-01`, {
          messageCount: 100,
          messageCountsByName: new Map([
            ['Ana', anaCount],
            ['Bob Vega', 100 - anaCount],
          ]),
          typicalReplyDelaysByName: new Map([['Bob Vega', 60_000 * (index + 1)]]),
        }),
      ),
      wordTrends: [
        { term: 'bob', messageCountsByBucket: [9, 9, 9, 9, 9, 9] },
        { term: 'dinner', messageCountsByBucket: [1, 2, 3, 4, 5, 6] },
        { term: 'vega', messageCountsByBucket: [1, 0, 0, 0, 0, 0] },
      ],
      emojiTrends: [{ term: '🎉', messageCountsByBucket: [1, 0, 0, 0, 0, 2] }],
    },
  });

  const hiddenTrends = anonymiseAnalysis(chatWithTrends).trends;

  it('relabels the people of every bucket and keeps their numbers', () => {
    expect(hiddenTrends.buckets[0]?.messageCountsByName).toEqual(
      new Map([
        ['Person A', 80],
        ['Person B', 20],
      ]),
    );
    expect(hiddenTrends.buckets[5]?.typicalReplyDelaysByName).toEqual(
      new Map([['Person B', 360_000]]),
    );
  });

  it('takes the words of the names out of the words that are followed, and keeps the emojis', () => {
    expect(hiddenTrends.wordTrends).toEqual([
      { term: 'dinner', messageCountsByBucket: [1, 2, 3, 4, 5, 6] },
    ]);
    expect(hiddenTrends.emojiTrends).toEqual(chatWithTrends.trends.emojiTrends);
  });

  it('does not change the trends of the analysis it was given', () => {
    expect(chatWithTrends.trends.wordTrends.map((wordTrend) => wordTrend.term)).toEqual([
      'bob',
      'dinner',
      'vega',
    ]);
    expect([...(chatWithTrends.trends.buckets[0]?.messageCountsByName.keys() ?? [])]).toEqual([
      'Ana',
      'Bob Vega',
    ]);
  });

  it('draws "How things changed" with labels in the legend, the sentences and the tooltips, and without a name', () => {
    const hiddenChat = anonymiseAnalysis(chatWithTrends);
    const sectionHtml = renderTrendsSection(hiddenChat, assignPersonColours(hiddenChat.people));

    expect(sectionHtml).toContain('</i>Person A</span>');
    expect(sectionHtml).toContain(
      'Person A&#39;s share of the messages went from about 80% in Jan–Feb 2024 to about 20% in May–Jun 2024.',
    );
    expect(sectionHtml).toContain('&quot;label&quot;:&quot;Person B&quot;');
    expect(sectionHtml).toContain('<span class="term-trend-name">dinner</span>');
    for (const name of ['Ana', 'Bob', 'Vega', 'bob', 'vega']) {
      expect(sectionHtml).not.toContain(name);
    }
  });
});

describe('anonymiseAnalysis, the recap of a year', () => {
  /** The year 2024 of a chat in which Bob is talked about more than anything else. */
  const yearOfNamedChat: ChatAnalysis = chatAnalysis({
    wordCounts: new Map([
      ['bob', 40],
      ['dinner', 9],
    ]),
    people: [
      personStatistics({ name: 'Ana', messageCount: 60, nightMessageCount: 30 }),
      personStatistics({ name: 'Bob Vega', messageCount: 40 }),
    ],
  });

  /** The whole chat around that year, in which Carla also writes. */
  const wholeNamedChat: ChatAnalysis = chatAnalysis({
    wordCounts: new Map([
      ['bob', 50],
      ['carla', 30],
      ['dinner', 12],
    ]),
    people: [
      personStatistics({ name: 'Ana', messageCount: 90 }),
      personStatistics({ name: 'Bob Vega', messageCount: 60 }),
      personStatistics({ name: 'Carla', messageCount: 50 }),
    ],
  });

  /** Writes the cards of that year from the analyses given, and joins every text on them. */
  function recapTextOf(yearAnalysis: ChatAnalysis, wholeChatAnalysis: ChatAnalysis): string {
    const cards = buildRecapCards(yearAnalysis, {
      yearSummary: {
        year: 2024,
        messageCount: 100,
        period: { firstDayKey: 20240101, lastDayKey: 20241231 },
        coveredDayCount: 366,
      },
      previousYearSummary: null,
      wholeChatAnalysis,
      peopleShown: 'most-active',
    });
    return cards.map((card) => [card.label, card.headline, ...card.lines].join('\n')).join('\n');
  }

  it('names people and their word of the year while names are shown', () => {
    const recapText = recapTextOf(yearOfNamedChat, wholeNamedChat);

    expect(recapText).toContain('Ana wrote the most');
    expect(recapText).toContain('“bob”');
  });

  it('writes labels on the cards and takes a name out of the running for word of the year', () => {
    const recapText = recapTextOf(
      anonymiseAnalysis(yearOfNamedChat),
      anonymiseAnalysis(wholeNamedChat),
    );

    expect(recapText).toContain('Person A wrote the most');
    expect(recapText).toContain('The night owl: Person A');
    expect(recapText).toContain('“dinner”');
    for (const name of ['Ana', 'Bob', 'Vega', 'bob']) {
      expect(recapText).not.toContain(name);
    }
  });

  it('keeps out the name of somebody who wrote in other years only, which the year alone does not know', () => {
    const yearThatTalksAboutCarla: ChatAnalysis = {
      ...yearOfNamedChat,
      wordCounts: new Map([
        ['carla', 25],
        ['dinner', 9],
      ]),
    };

    const recapText = recapTextOf(
      anonymiseAnalysis(yearThatTalksAboutCarla),
      anonymiseAnalysis(wholeNamedChat),
    );

    expect(anonymiseAnalysis(yearThatTalksAboutCarla).wordCounts.has('carla')).toBe(true);
    expect(recapText).toContain('“dinner”');
    expect(recapText.toLowerCase()).not.toContain('carla');
  });
});

describe('anonymiseAnalysis, the history of the group', () => {
  const carla = namedMember('~ Carla');
  const dani = namedMember('Dani who never wrote');
  const eva = namedMember('Eva who never wrote');

  /** The group of Ana, Bob Vega and Carla, with two people who came and went without a word. */
  const chatWithHistory = chatAnalysis({
    people: namedChat.people,
    groupEvents: [
      groupEvent('2023-03-14 08:00', {
        kind: 'created',
        creator: namedMember('Ana'),
        groupName: 'Vega family',
      }),
      groupEvent('2023-03-14 08:01', {
        kind: 'added',
        actor: namedMember('Ana'),
        members: [namedMember('Bob Vega'), namedMember('Carla'), dani, eva, THE_EXPORTER],
      }),
      groupEvent('2023-04-01 09:00', { kind: 'joined', member: carla, isThroughInviteLink: true }),
      groupEvent('2023-05-01 09:00', { kind: 'left', member: eva }),
      groupEvent('2023-06-01 09:00', { kind: 'removed', actor: null, members: [dani] }),
      groupEvent('2023-07-01 09:00', {
        kind: 'renamed',
        actor: namedMember('Bob Vega'),
        previousName: 'Vega family',
        newName: 'Ana and the Vegas',
      }),
      groupEvent('2023-08-01 09:00', { kind: 'icon-changed', actor: eva }),
      groupEvent('2023-09-01 09:00', { kind: 'left', member: THE_EXPORTER }),
    ],
  });
  const hiddenEvents = anonymiseAnalysis(chatWithHistory).groupEvents;
  const hiddenChanges = hiddenEvents.map((hiddenEvent) => hiddenEvent.change);

  it('gives a participant the label they have everywhere else', () => {
    expect(hiddenChanges[0]).toMatchObject({ creator: namedMember('Person A') });
    expect(hiddenChanges[5]).toMatchObject({ actor: namedMember('Person B') });
  });

  it('recognises a participant written with or without the tilde of a stranger', () => {
    expect(hiddenChanges[1]).toMatchObject({
      members: expect.arrayContaining([namedMember('Person C')]) as unknown,
    });
    expect(hiddenChanges[2]).toMatchObject({ member: namedMember('Person C') });
  });

  it('gives each person who never wrote a numbered label, in order of first appearance', () => {
    expect(anonymousMemberLabelOf(0)).toBe('Member 1');
    expect(hiddenChanges[1]).toEqual({
      kind: 'added',
      actor: namedMember('Person A'),
      members: [
        namedMember('Person B'),
        namedMember('Person C'),
        namedMember('Member 1'),
        namedMember('Member 2'),
        THE_EXPORTER,
      ],
    });
  });

  it('keeps the same label for that person in every later event', () => {
    expect(hiddenChanges[3]).toEqual({ kind: 'left', member: namedMember('Member 2') });
    expect(hiddenChanges[4]).toEqual({
      kind: 'removed',
      actor: null,
      members: [namedMember('Member 1')],
    });
    expect(hiddenChanges[6]).toEqual({ kind: 'icon-changed', actor: namedMember('Member 2') });
  });

  it('leaves out every name the group had', () => {
    expect(hiddenChanges[0]).toMatchObject({ groupName: null });
    expect(hiddenChanges[5]).toMatchObject({ previousName: null, newName: null });
  });

  it('keeps whoever made the export as they are, since "You" is not a name', () => {
    expect(hiddenChanges[7]).toEqual({ kind: 'left', member: THE_EXPORTER });
  });

  it('keeps the dates and the order of the events', () => {
    expect(hiddenEvents.map((hiddenEvent) => hiddenEvent.timestamp)).toEqual(
      chatWithHistory.groupEvents.map((groupEvent) => groupEvent.timestamp),
    );
  });

  it('does not modify the events it was given', () => {
    expect(chatWithHistory.groupEvents[0]?.change).toMatchObject({ groupName: 'Vega family' });
  });

  describe('the words of the names it gives away', () => {
    /** Ana and Bob talk about Marta Soto, who was added and never wrote a word. */
    const chatAboutSomebodySilent = chatAnalysis({
      people: [
        personStatistics({
          name: 'Ana',
          messageCount: 30,
          wordCounts: new Map([
            ['marta', 6],
            ['dinner', 4],
          ]),
          linkSiteCounts: new Map([
            ['marta-soto.example', 2],
            ['recipes.example', 1],
          ]),
          signaturePhrases: [
            { phrase: 'ask marta', count: 4 },
            { phrase: 'see you', count: 3 },
          ],
        }),
        personStatistics({ name: 'Bob', messageCount: 20, wordCounts: new Map([['soto', 3]]) }),
      ],
      wordCounts: new Map([
        ['marta', 6],
        ['soto', 3],
        ['dinner', 4],
      ]),
      linkSiteCounts: new Map([
        ['marta-soto.example', 2],
        ['recipes.example', 1],
      ]),
      groupEvents: [
        groupEvent('2023-03-14 08:01', {
          kind: 'added',
          actor: namedMember('Ana'),
          members: [namedMember('Marta Soto'), namedMember('+34 600 000 000')],
        }),
      ],
    });
    const hiddenChat = anonymiseAnalysis(chatAboutSomebodySilent);
    const [hiddenAna, hiddenBob] = hiddenChat.people;

    it('takes them out of the word lists, although their owner never wrote', () => {
      expect([...hiddenChat.wordCounts.keys()]).toEqual(['dinner']);
      expect([...(hiddenAna?.wordCounts.keys() ?? [])]).toEqual(['dinner']);
      expect([...(hiddenBob?.wordCounts.keys() ?? [])]).toEqual([]);
    });

    it('takes the catchphrases and the sites that hold them out as well', () => {
      expect(hiddenAna?.signaturePhrases).toEqual([{ phrase: 'see you', count: 3 }]);
      expect([...hiddenChat.linkSiteCounts.keys()]).toEqual(['recipes.example']);
      expect([...(hiddenAna?.linkSiteCounts.keys() ?? [])]).toEqual(['recipes.example']);
    });

    it('keeps those words while the same chat has no such event, as in a period before it', () => {
      const hiddenChatWithoutHistory = anonymiseAnalysis({
        ...chatAboutSomebodySilent,
        groupEvents: [],
      });

      expect([...hiddenChatWithoutHistory.wordCounts.keys()]).toEqual(['marta', 'soto', 'dinner']);
    });
  });

  it('leaves no name and no group name in the section', () => {
    const hiddenChat = anonymiseAnalysis(chatWithHistory);

    const sectionHtml = renderGroupHistorySection(
      hiddenChat,
      assignPersonColours(hiddenChat.people),
    );

    for (const name of ['Ana', 'Bob', 'Vega', 'Carla', 'Dani', 'Eva', 'family']) {
      expect(sectionHtml).not.toContain(name);
    }
    expect(sectionHtml).toContain('Person A</span> created the group<');
    expect(sectionHtml).toContain('Person B</span> changed the group name<');
    expect(sectionHtml).toContain('Member 2');
  });
});
