// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { MILLISECONDS_PER_MINUTE } from '../../../src/core/time-constants';
import type { ChatAnalysis, PersonStatistics } from '../../../src/core/types';
import { assignPersonColours } from '../../../src/ui/person-colours';
import {
  MINIMUM_MESSAGES_FOR_NIGHT_SHARE,
  PERSON_PROFILE_CONTAINER_ID,
  PERSON_PROFILE_SELECT_ID,
  findMostAnsweredPeople,
  findMostFrequentRepliers,
  findMostMentionedPeople,
  renderPersonProfile,
  renderPersonProfileSection,
  selectProfiledPerson,
} from '../../../src/ui/sections/person-profile';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { RED_HEART } from '../../fixtures/emojis';
import { findElement, parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';

/**
 * Builds twenty-four hourly counts that are zero except for the hours stated.
 */
function hourCounts(countsByHour: Readonly<Record<number, number>>): number[] {
  const counts = new Array<number>(24).fill(0);
  for (const [hour, count] of Object.entries(countsByHour)) {
    counts[Number(hour)] = count;
  }
  return counts;
}

/** Ana writes most, in the evening and on Saturdays, and mostly with Bob. */
const ana = personStatistics({
  name: 'Ana',
  messageCount: 60,
  textMessageCount: 50,
  wordCount: 320,
  mediaCount: 8,
  emojiCount: 15,
  questionCount: 20,
  unansweredQuestionCount: 3,
  nightMessageCount: 6,
  conversationsStartedCount: 7,
  conversationsEndedCount: 4,
  replyDelaysInMilliseconds: [1, 2, 3, 4, 5].map((minutes) => minutes * MILLISECONDS_PER_MINUTE),
  messageCountsByHour: hourCounts({ 2: 6, 9: 14, 21: 40 }),
  messageCountsByWeekday: [5, 5, 5, 5, 10, 25, 5],
  wordCounts: new Map([
    ['pizza', 9],
    ['beach', 2],
  ]),
  emojiCounts: new Map([[RED_HEART, 11]]),
  signaturePhrases: [{ phrase: 'count me in', count: 6 }],
  replyCountsByRecipient: new Map([
    ['Dani', 1],
    ['Bob', 30],
    ['~ Carla', 9],
    ['Elena', 4],
  ]),
  mentionCountsByName: new Map([
    ['Carla', 3],
    ['~Carla', 2],
    ['Somebody who left', 4],
    ['Bob', 1],
    ['Dani', 1],
  ]),
});

const bob = personStatistics({
  name: 'Bob',
  messageCount: 30,
  replyCountsByRecipient: new Map([['Ana', 12]]),
});

const carla = personStatistics({
  name: '~ Carla',
  messageCount: 6,
  replyCountsByRecipient: new Map([['Ana', 2]]),
});

const dani = personStatistics({
  name: 'Dani',
  messageCount: 3,
  replyCountsByRecipient: new Map([['Ana', 20]]),
});

const elena = personStatistics({
  name: 'Elena',
  messageCount: 1,
  replyCountsByRecipient: new Map([['Ana', 1]]),
});

/** A group of five with a hundred messages and eleven conversations. */
const group: ChatAnalysis = chatAnalysis({
  people: [ana, bob, carla, dani, elena],
  conversationCount: 11,
  wordCounts: new Map([
    ['pizza', 9],
    ['beach', 40],
  ]),
});

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis, profiledPersonIndex?: number): HTMLDivElement {
  return parseMarkup(
    renderPersonProfileSection(analysis, assignPersonColours(analysis.people), profiledPersonIndex),
  );
}

/**
 * Renders the profile of one person of an analysis and parses it.
 */
function renderProfile(analysis: ChatAnalysis, person: PersonStatistics): HTMLDivElement {
  return parseMarkup(renderPersonProfile(analysis, assignPersonColours(analysis.people), person));
}

/**
 * Reads the facts of a profile as the label of each with the text under it.
 */
function readFacts(profile: ParentNode): Record<string, string[]> {
  const facts: Record<string, string[]> = {};
  for (const fact of profile.querySelectorAll('.profile-fact')) {
    facts[findElement(fact, 'dt').textContent] = textsOfElements(fact, 'dd b, dd small');
  }
  return facts;
}

/**
 * Reads the lists of related people as rows of name and count, by the heading of each list.
 */
function readRelations(profile: ParentNode): Record<string, string[][]> {
  const relations: Record<string, string[][]> = {};
  for (const list of profile.querySelectorAll('.profile-relations')) {
    const heading = list.previousElementSibling?.textContent ?? '';
    relations[heading] = Array.from(list.querySelectorAll('li'), (item) =>
      textsOfElements(item, '.profile-relation-name, small'),
    );
  }
  return relations;
}

/**
 * Reads the chips under a heading of the profile.
 */
function readChips(profile: ParentNode, heading: string): string[] {
  for (const title of profile.querySelectorAll('h3')) {
    if (title.textContent === heading && title.nextElementSibling !== null) {
      return textsOfElements(title.nextElementSibling, '.chip');
    }
  }
  return [];
}

describe('selectProfiledPerson', () => {
  it('returns the person at the position asked for', () => {
    expect(selectProfiledPerson(group.people, 3)).toBe(dani);
  });

  it('falls back to the most active person for a position outside the list', () => {
    expect(selectProfiledPerson(group.people, 99)).toBe(ana);
    expect(selectProfiledPerson(group.people, -1)).toBe(ana);
  });

  it('returns nothing when there is nobody', () => {
    expect(selectProfiledPerson([], 0)).toBeUndefined();
  });
});

describe('findMostAnsweredPeople', () => {
  it('lists the three people a person answered most, the most answered first', () => {
    expect(findMostAnsweredPeople(ana)).toEqual([
      { name: 'Bob', count: 30 },
      { name: '~ Carla', count: 9 },
      { name: 'Elena', count: 4 },
    ]);
  });

  it('lists nobody for a person who never replied', () => {
    expect(findMostAnsweredPeople(personStatistics({ name: 'Ana' }))).toEqual([]);
  });
});

describe('findMostFrequentRepliers', () => {
  it('lists the three people who answered a person most, from the replies of everyone else', () => {
    expect(findMostFrequentRepliers(ana, group.people)).toEqual([
      { name: 'Dani', count: 20 },
      { name: 'Bob', count: 12 },
      { name: '~ Carla', count: 2 },
    ]);
  });

  it('leaves out the people who never answered them', () => {
    expect(findMostFrequentRepliers(bob, group.people)).toEqual([{ name: 'Ana', count: 30 }]);
  });

  it('does not count a person as answering themselves', () => {
    const talksToSelf = personStatistics({
      name: 'Ana',
      replyCountsByRecipient: new Map([['Ana', 5]]),
    });

    expect(findMostFrequentRepliers(talksToSelf, [talksToSelf, bob])).toEqual([
      { name: 'Bob', count: 12 },
    ]);
  });
});

describe('findMostMentionedPeople', () => {
  it('adds up a name written with and without the tilde, under the name of the participant', () => {
    expect(findMostMentionedPeople(ana, group.people)[0]).toEqual({ name: '~ Carla', count: 5 });
  });

  it('keeps somebody who never wrote in the chat under the name that was mentioned', () => {
    expect(findMostMentionedPeople(ana, group.people)[1]).toEqual({
      name: 'Somebody who left',
      count: 4,
    });
  });

  it('stops at three names, and keeps the first of two that are mentioned equally', () => {
    expect(findMostMentionedPeople(ana, group.people).map((mentioned) => mentioned.name)).toEqual([
      '~ Carla',
      'Somebody who left',
      'Bob',
    ]);
  });

  it('lists nobody for a person who mentioned nobody', () => {
    expect(findMostMentionedPeople(bob, group.people)).toEqual([]);
  });
});

describe('renderPersonProfileSection', () => {
  it('is left out of a chat with a single sender', () => {
    const monologue = chatAnalysis();

    expect(renderPersonProfileSection(monologue, assignPersonColours(monologue.people))).toBe('');
  });

  it('is left out of an analysis without people', () => {
    const nobody = chatAnalysis({ people: [] });

    expect(renderPersonProfileSection(nobody, assignPersonColours(nobody.people))).toBe('');
  });

  it('is shown for a chat of two', () => {
    const couple = chatAnalysis({ people: [ana, bob] });

    expect(textsOfElements(renderSection(couple), '.section-heading h2')).toEqual([
      'One person up close',
    ]);
  });

  it('offers every person of the chat, with how much each wrote', () => {
    expect(textsOfElements(renderSection(group), 'select option')).toEqual([
      'Ana (60 messages)',
      'Bob (30 messages)',
      '~ Carla (6 messages)',
      'Dani (3 messages)',
      'Elena (1 message)',
    ]);
  });

  it('offers the people beyond the eight most active too', () => {
    const twelvePeople = Array.from({ length: 12 }, (_unused, index) =>
      personStatistics({ name: `Friend ${String(index + 1)}`, messageCount: 12 - index }),
    );
    const largeGroup = chatAnalysis({ people: twelvePeople });

    const options = textsOfElements(renderSection(largeGroup), 'select option');

    expect(options).toHaveLength(12);
    expect(options[11]).toBe('Friend 12 (1 message)');
  });

  it('labels the list, so it is announced as a choice of person', () => {
    const section = renderSection(group);

    const label = findElement(section, 'label');

    expect(label.textContent).toBe('Person');
    expect(label.getAttribute('for')).toBe(PERSON_PROFILE_SELECT_ID);
    expect(findElement(section, 'select').id).toBe(PERSON_PROFILE_SELECT_ID);
  });

  it('starts with the most active person', () => {
    const section = renderSection(group);

    expect(findElement(section, 'select option[selected]').textContent).toBe('Ana (60 messages)');
    expect(textsOfElements(section, '.profile-name b')).toEqual(['Ana']);
  });

  it('shows the person at the position it is given, and marks them in the list', () => {
    const section = renderSection(group, 3);

    expect(findElement(section, 'select option[selected]').getAttribute('value')).toBe('3');
    expect(textsOfElements(section, '.profile-name b')).toEqual(['Dani']);
  });

  it('goes back to the most active person for a position nobody holds', () => {
    expect(textsOfElements(renderSection(group, 40), '.profile-name b')).toEqual(['Ana']);
  });

  it('puts the profile in the element the page redraws', () => {
    const profile = findElement(renderSection(group), `#${PERSON_PROFILE_CONTAINER_ID}`);

    expect(textsOfElements(profile, '.profile-name b')).toEqual(['Ana']);
  });

  it('writes a name that is markup as text, in the list and in the profile', () => {
    const hostileName = '<img src=x onerror=alert(1)>';
    const hostileGroup = chatAnalysis({
      people: [
        personStatistics({
          name: hostileName,
          messageCount: 3,
          wordCounts: new Map([['<b>bold</b>', 2]]),
          mentionCountsByName: new Map([['<script>alert(2)</script>', 2]]),
          replyCountsByRecipient: new Map([['Bob" onmouseover="alert(3)', 2]]),
        }),
        personStatistics({ name: 'Bob" onmouseover="alert(3)', messageCount: 2 }),
        personStatistics({ name: 'Carla', messageCount: 1 }),
      ],
    });

    const section = renderSection(hostileGroup);

    expect(tagNamesIn(section)).not.toContain('img');
    expect(tagNamesIn(section)).not.toContain('script');
    expect(section.querySelectorAll('[onmouseover]')).toHaveLength(0);
    expect(textsOfElements(section, '.profile-name b')).toEqual([hostileName]);
    expect(textsOfElements(section, 'select option')[0]).toBe(`${hostileName} (3 messages)`);
    expect(readChips(section, 'Most used words')).toEqual(['<b>bold</b>2']);
  });
});

describe('renderPersonProfile', () => {
  describe('the name', () => {
    it('says where the person stands among everyone in the chat', () => {
      expect(textsOfElements(renderProfile(group, dani), '.profile-name .hint')).toEqual([
        'Rank 4 of 5 by messages sent',
      ]);
    });
  });

  describe('the numbers', () => {
    const facts = readFacts(renderProfile(group, ana));

    it('lists the nine numbers in a fixed order', () => {
      expect(Object.keys(facts)).toEqual([
        'Messages',
        'Words per message',
        'Media',
        'Emojis',
        'Questions',
        'Typical time to reply',
        'Conversations started',
        'Had the last word',
        'At night',
      ]);
    });

    it('shows the messages with their share of the chat', () => {
      /* 60 of the 100 messages in the group. */
      expect(facts['Messages']).toEqual(['60', '60% of the chat']);
    });

    it('shows the words per typed message, with the words in all', () => {
      /* 320 words in 50 typed messages. */
      expect(facts['Words per message']).toEqual(['6.4', '320 words in all']);
    });

    it('shows media and emojis as plain counts', () => {
      expect(facts['Media']).toEqual(['8']);
      expect(facts['Emojis']).toEqual(['15']);
    });

    it('shows the questions with how many were left unanswered, and their share', () => {
      /* 3 of 20 questions; twenty is over the ten a share needs. */
      expect(facts['Questions']).toEqual(['20', '3 (15%) left unanswered']);
    });

    it('leaves out the share of unanswered questions for somebody who asked nine', () => {
      const fewQuestions = personStatistics({
        name: 'Ana',
        messageCount: 60,
        questionCount: 9,
        unansweredQuestionCount: 3,
      });
      const chat = chatAnalysis({ people: [fewQuestions, bob] });

      expect(readFacts(renderProfile(chat, fewQuestions))['Questions']).toEqual([
        '9',
        '3 left unanswered',
      ]);
    });

    it('shows the typical reply time as the median of the replies', () => {
      /* The median of 1, 2, 3, 4 and 5 minutes. */
      expect(facts['Typical time to reply']).toEqual(['3 min', 'median of 5 replies']);
    });

    it('shows a dash and the reason for somebody with four replies', () => {
      const fewReplies = personStatistics({
        name: 'Ana',
        messageCount: 60,
        replyDelaysInMilliseconds: [1, 2, 3, 4].map((minutes) => minutes * MILLISECONDS_PER_MINUTE),
      });
      const chat = chatAnalysis({ people: [fewReplies, bob] });

      expect(readFacts(renderProfile(chat, fewReplies))['Typical time to reply']).toEqual([
        '–',
        'fewer than 5 replies, too few to measure',
      ]);
    });

    it('rounds a reply within the same minute of an export that records minutes', () => {
      const quickReplies = personStatistics({
        name: 'Ana',
        messageCount: 60,
        replyDelaysInMilliseconds: [0, 0, 0, 0, 0],
      });
      const chat = chatAnalysis({ people: [quickReplies, bob], timestampResolution: 'minute' });

      expect(readFacts(renderProfile(chat, quickReplies))['Typical time to reply']?.[0]).toBe(
        'under 1 min',
      );
    });

    it('shows the conversations started, of all the conversations of the chat', () => {
      expect(facts['Conversations started']).toEqual(['7', 'of 11 in the chat']);
    });

    it('shows the last words, of the conversations that have ended', () => {
      /* Eleven conversations; the last one is still open. */
      expect(facts['Had the last word']).toEqual(['4', 'of 10 that ended']);
    });

    it('shows the night messages with their share of the person’s messages', () => {
      /* 6 of 60 messages. */
      expect(facts['At night']).toEqual(['6', '10% of their messages, midnight to 04:59']);
    });

    it('leaves out the night share for somebody with nineteen messages, and shows it from twenty', () => {
      const justUnder = personStatistics({
        name: 'Ana',
        messageCount: MINIMUM_MESSAGES_FOR_NIGHT_SHARE - 1,
        nightMessageCount: 5,
      });
      const justEnough = personStatistics({
        name: 'Bob',
        messageCount: MINIMUM_MESSAGES_FOR_NIGHT_SHARE,
        nightMessageCount: 5,
      });
      const chat = chatAnalysis({ people: [justEnough, justUnder] });

      expect(readFacts(renderProfile(chat, justUnder))['At night']).toEqual([
        '5',
        'midnight to 04:59',
      ]);
      /* 5 of 20 messages. */
      expect(readFacts(renderProfile(chat, justEnough))['At night']).toEqual([
        '5',
        '25% of their messages, midnight to 04:59',
      ]);
    });
  });

  describe('the strips of activity', () => {
    const profile = renderProfile(group, ana);
    const [hourStrip, weekdayStrip] = Array.from(profile.querySelectorAll('.bar-strip'));

    it('draws a bar for each of the twenty-four hours and each of the seven weekdays', () => {
      expect(hourStrip?.querySelectorAll('.bar-strip-bar')).toHaveLength(24);
      expect(weekdayStrip?.querySelectorAll('.bar-strip-bar')).toHaveLength(7);
    });

    it('labels every sixth hour and every weekday', () => {
      const hourLabels = textsOfElements(hourStrip ?? profile, '.bar-strip-label');

      expect(hourLabels.filter((label) => label !== '')).toEqual(['00', '06', '12', '18']);
      expect(textsOfElements(weekdayStrip ?? profile, '.bar-strip-label')).toEqual([
        'Mon',
        'Tue',
        'Wed',
        'Thu',
        'Fri',
        'Sat',
        'Sun',
      ]);
    });

    it('names the hour and the count of each bar for the pointer', () => {
      const titles = Array.from(hourStrip?.querySelectorAll('.bar-strip-column') ?? [], (column) =>
        column.getAttribute('title'),
      );

      expect(titles[21]).toBe('21:00 to 21:59: 40 messages');
      expect(titles[0]).toBe('00:00 to 00:59: 0 messages');
    });

    it('draws the bars in the colour of the person', () => {
      expect(findElement(profile, '.bar-strip-bar').getAttribute('style')).toContain('var(--s1)');
      expect(
        findElement(renderProfile(group, bob), '.bar-strip-bar').getAttribute('style'),
      ).toContain('var(--s2)');
    });

    it('says in words when the person writes most, under each strip', () => {
      expect(textsOfElements(profile, '.bar-strip + .hint')).toEqual([
        'Most active around 21:00, with 40 messages in that hour.',
        'Most active on Saturdays, with 25 messages.',
      ]);
    });

    it('says the same to a reader who cannot see the bars', () => {
      expect(hourStrip?.getAttribute('aria-label')).toBe(
        'Messages by hour of the day. Most active around 21:00, with 40 messages in that hour.',
      );
      expect(weekdayStrip?.getAttribute('aria-label')).toBe(
        'Messages by weekday. Most active on Saturdays, with 25 messages.',
      );
    });

    it('says that there is nothing to place for somebody without counted hours', () => {
      expect(textsOfElements(renderProfile(group, bob), '.bar-strip + .hint')).toEqual([
        'No messages to place.',
        'No messages to place.',
      ]);
    });
  });

  describe('what the person writes', () => {
    const profile = renderProfile(group, ana);

    it('lists their most used words with the count of each', () => {
      expect(readChips(profile, 'Most used words')).toEqual(['pizza9', 'beach2']);
    });

    it('lists the words they use far more than the others', () => {
      /* "pizza" is Ana's alone; "beach" is mostly everybody else's. */
      expect(readChips(profile, 'Signature words')).toEqual(['pizza9']);
    });

    it('lists their catchphrases and their favourite emojis', () => {
      expect(readChips(profile, 'Catchphrases')).toEqual(['count me in6']);
      expect(readChips(profile, 'Top emojis')).toEqual([`${RED_HEART}11`]);
    });

    it('stops at eight words', () => {
      const manyWords = new Map<string, number>();
      for (let index = 0; index < 12; index += 1) {
        manyWords.set(`word${String(index)}`, 20 - index);
      }
      const talkative = personStatistics({ name: 'Ana', messageCount: 9, wordCounts: manyWords });
      const chat = chatAnalysis({ people: [talkative, bob], wordCounts: manyWords });

      expect(readChips(renderProfile(chat, talkative), 'Most used words')).toHaveLength(8);
    });

    it('leaves out every list for somebody who typed nothing', () => {
      expect(textsOfElements(renderProfile(group, bob), 'h3')).not.toContain('Most used words');
      expect(renderProfile(group, bob).querySelectorAll('.chip')).toHaveLength(0);
    });
  });

  describe('whom the person has to do with', () => {
    it('lists whom they answer most, who answers them most and whom they mention most', () => {
      expect(readRelations(renderProfile(group, ana))).toEqual({
        'Answers most': [
          ['Bob', '30 replies'],
          ['~ Carla', '9 replies'],
          ['Elena', '4 replies'],
        ],
        'Answered most by': [
          ['Dani', '20 replies'],
          ['Bob', '12 replies'],
          ['~ Carla', '2 replies'],
        ],
        'Mentions most': [
          ['~ Carla', '5 mentions'],
          ['Somebody who left', '4 mentions'],
          ['Bob', '1 mention'],
        ],
      });
    });

    it('writes a single reply in the singular', () => {
      expect(readRelations(renderProfile(group, elena))['Answers most']).toEqual([
        ['Ana', '1 reply'],
      ]);
    });

    it('says how a reply is credited, since the export does not say whom it answers', () => {
      expect(renderProfile(group, ana).textContent).toContain(
        'A reply counts towards whoever wrote just before it.',
      );
    });

    it('leaves out the reply lists in a chat of two, where each can only answer the other', () => {
      const couple = chatAnalysis({ people: [ana, bob] });

      const profile = renderProfile(couple, ana);

      expect(Object.keys(readRelations(profile))).toEqual(['Mentions most']);
      expect(profile.textContent).not.toContain('A reply counts towards');
    });

    it('leaves out the whole block for somebody who neither replied, was answered nor mentioned', () => {
      const silentGroup = chatAnalysis({
        people: [
          personStatistics({ name: 'Ana', messageCount: 3 }),
          personStatistics({ name: 'Bob', messageCount: 2 }),
          personStatistics({ name: 'Carla', messageCount: 1 }),
        ],
      });
      const [firstPerson] = silentGroup.people;
      if (firstPerson === undefined) {
        throw new Error('The fixture has lost its people');
      }

      expect(renderProfile(silentGroup, firstPerson).querySelectorAll('ol')).toHaveLength(0);
    });
  });
});
