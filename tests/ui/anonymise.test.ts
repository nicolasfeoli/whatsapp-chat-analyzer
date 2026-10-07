import { describe, expect, it } from 'vitest';

import {
  HIDDEN_MESSAGE_TEXT,
  SOMEBODY_ELSE_LABEL,
  anonymiseAnalysis,
  anonymousLabelOf,
} from '../../src/ui/anonymise';
import type { ChatAnalysis } from '../../src/core/types';
import { chatAnalysis, personStatistics } from '../fixtures/analysis-builders';
import { mediaMessage, textMessage } from '../fixtures/messages';

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
      replyCountsByRecipient: new Map([
        ['Bob Vega', 7],
        ['~ Carla', 2],
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

  it('relabels the people somebody replied to', () => {
    expect(hiddenPerson(0).replyCountsByRecipient).toEqual(
      new Map([
        ['Person B', 7],
        ['Person C', 2],
      ]),
    );
    expect(hiddenPerson(1).replyCountsByRecipient).toEqual(new Map([['Person A', 5]]));
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

  it('does not change the analysis it was given', () => {
    expect(namedChat.people[0]?.name).toBe('Ana');
    expect(namedChat.messages[0]?.text).toBe('hello Bob');
    expect(namedChat.wordCounts.has('bob')).toBe(true);
  });
});
