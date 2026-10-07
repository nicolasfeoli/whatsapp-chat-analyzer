// @vitest-environment jsdom

/**
 * The choice between listing the most active people and listing everyone, for
 * every section that compares people. One chat of ten people is drawn both
 * ways; the tenth person writes little but stands out in every section.
 */

import { describe, expect, it } from 'vitest';

import type { PersonStatistics } from '../../../src/core/types';
import { assignPersonColours } from '../../../src/ui/person-colours';
import type { SafeHtml } from '../../../src/ui/html';
import { renderConversationEndingsSection } from '../../../src/ui/sections/conversation-endings';
import {
  renderPeopleShownNote,
  selectFeaturedPeople,
} from '../../../src/ui/sections/featured-people';
import type { PeopleShown } from '../../../src/ui/sections/featured-people';
import { collectInsights } from '../../../src/ui/sections/insights';
import { renderMediaTypesSection } from '../../../src/ui/sections/media-types';
import { renderMentionsSection } from '../../../src/ui/sections/mentions';
import { renderPeopleSection } from '../../../src/ui/sections/people';
import { renderRepliesSection } from '../../../src/ui/sections/replies';
import { renderReplyPairsSection } from '../../../src/ui/sections/reply-pairs';
import { renderThenAndNowSection } from '../../../src/ui/sections/then-and-now';
import { renderWhoIsStillHereSection } from '../../../src/ui/sections/who-is-still-here';
import { renderWordsAndEmojisSection } from '../../../src/ui/sections/words-and-emojis';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { parseMarkup, textsOfElements } from '../../fixtures/markup';

/** The name of the person who writes least and is left out by default. */
const QUIET_PERSON_NAME = 'Person 10';

/**
 * Builds the statistics of one of the ten people. Each has fewer messages than
 * the one before; everybody has something to show in every section.
 */
function buildPerson(index: number): PersonStatistics {
  const number = index + 1;
  const isQuietPerson = number === 10;
  return personStatistics({
    name: `Person ${String(number)}`,
    messageCount: 1000 - index * 100,
    textMessageCount: 900 - index * 90,
    wordCount: 2000,
    turnCount: 100,
    /* The quiet person sends half of their messages at night; nobody else sends any. */
    nightMessageCount: isQuietPerson ? 50 : 0,
    earlyMessageCount: 10,
    recentMessageCount: 10,
    conversationsStartedCount: 5,
    conversationsEndedCount: 5,
    mediaCountsByType: new Map([['photo', 3]]),
    replyCountsByRecipient: new Map([['Person 1', 4]]),
    mentionCountsByName: new Map([['Person 1', 2]]),
    signaturePhrases: [{ phrase: `phrase of ${String(number)}`, count: 6 }],
  });
}

const tenPeople = Array.from({ length: 10 }, (_unused, index) => buildPerson(index));
const analysis = chatAnalysis({
  people: tenPeople,
  conversationCount: 50,
  comparisonPeriodInDays: 365,
  /* Long enough for "Who is still here", which needs 180 days. */
  spanInDays: 400,
});
const personColours = assignPersonColours(analysis.people);

/** The note under a section that lists eight, and six, of the ten people. */
const EIGHT_OF_TEN_NOTE = 'Showing the 8 most active of 10 people.';
const SIX_OF_TEN_NOTE = 'Showing the 6 most active of 10 people.';

describe('selectFeaturedPeople, when asked for everyone', () => {
  it('returns all the people, in their order', () => {
    const featuredPeople = selectFeaturedPeople(tenPeople, 'everyone');

    expect(featuredPeople).toHaveLength(10);
    expect(featuredPeople[9]?.name).toBe(QUIET_PERSON_NAME);
  });

  it('stops at eight when asked for the most active', () => {
    expect(selectFeaturedPeople(tenPeople, 'most-active')).toHaveLength(8);
  });
});

describe('renderPeopleShownNote', () => {
  it('says how many of the people are shown', () => {
    const note = parseMarkup(renderPeopleShownNote(8, 14));

    expect(textsOfElements(note, 'p.people-shown-note')).toEqual([
      'Showing the 8 most active of 14 people.',
    ]);
  });

  it('says nothing when everybody is shown', () => {
    expect(renderPeopleShownNote(14, 14)).toBe('');
    expect(renderPeopleShownNote(3, 3)).toBe('');
  });
});

/** A section under test: its name and how to draw it for one choice. */
interface SectionCase {
  readonly name: string;
  readonly render: (peopleShown?: PeopleShown) => SafeHtml;
  /** The note the section shows by default. */
  readonly defaultNote: string;
}

const sectionCases: readonly SectionCase[] = [
  {
    name: 'Who says what',
    render: (peopleShown) => renderPeopleSection(analysis, personColours, peopleShown),
    defaultNote: EIGHT_OF_TEN_NOTE,
  },
  {
    name: 'What gets sent',
    render: (peopleShown) => renderMediaTypesSection(analysis, personColours, peopleShown),
    defaultNote: EIGHT_OF_TEN_NOTE,
  },
  {
    name: 'Then and now',
    render: (peopleShown) => renderThenAndNowSection(analysis, personColours, peopleShown),
    defaultNote: EIGHT_OF_TEN_NOTE,
  },
  {
    name: 'Who is still here',
    render: (peopleShown) => renderWhoIsStillHereSection(analysis, personColours, peopleShown),
    defaultNote: EIGHT_OF_TEN_NOTE,
  },
  {
    name: 'Replies and openings',
    render: (peopleShown) => renderRepliesSection(analysis, personColours, peopleShown),
    defaultNote: EIGHT_OF_TEN_NOTE,
  },
  {
    name: 'Who answers whom',
    render: (peopleShown) => renderReplyPairsSection(analysis, personColours, peopleShown),
    defaultNote: EIGHT_OF_TEN_NOTE,
  },
  {
    name: 'Who mentions whom',
    render: (peopleShown) => renderMentionsSection(analysis, personColours, peopleShown),
    defaultNote: EIGHT_OF_TEN_NOTE,
  },
  {
    name: 'How conversations end',
    render: (peopleShown) => renderConversationEndingsSection(analysis, personColours, peopleShown),
    defaultNote: EIGHT_OF_TEN_NOTE,
  },
  {
    name: 'Words and emojis',
    render: (peopleShown) => renderWordsAndEmojisSection(analysis, personColours, peopleShown),
    defaultNote: SIX_OF_TEN_NOTE,
  },
];

describe.each(sectionCases)('the section "$name"', ({ render, defaultNote }) => {
  it('leaves the least active people out by default, and says so', () => {
    const section = parseMarkup(render());

    expect(section.textContent).not.toContain(QUIET_PERSON_NAME);
    expect(textsOfElements(section, '.people-shown-note')).toEqual([defaultNote]);
  });

  it('lists everyone when asked to, without the note', () => {
    const section = parseMarkup(render('everyone'));

    expect(section.textContent).toContain(QUIET_PERSON_NAME);
    expect(textsOfElements(section, '.people-shown-note')).toEqual([]);
  });
});

describe('the sections of a chat in which nobody is left out', () => {
  const smallChat = chatAnalysis({ people: tenPeople.slice(0, 3), conversationCount: 50 });

  it('show no note', () => {
    const section = parseMarkup(
      renderPeopleSection(smallChat, assignPersonColours(smallChat.people)),
    );

    expect(textsOfElements(section, '.people-shown-note')).toEqual([]);
  });

  it('show no note under the words of a single sender, who has no lists of their own', () => {
    const chatOfOne = chatAnalysis();
    const section = parseMarkup(
      renderWordsAndEmojisSection(chatOfOne, assignPersonColours(chatOfOne.people)),
    );

    expect(textsOfElements(section, '.people-shown-note')).toEqual([]);
  });
});

describe('collectInsights, when asked for everyone', () => {
  /** Joins the sentences as the text a reader sees. */
  function insightTexts(peopleShown?: PeopleShown): string {
    return collectInsights(analysis, peopleShown)
      .map((sentence) => parseMarkup(sentence).textContent)
      .join('\n');
  }

  it('compares only the most active people by default', () => {
    expect(insightTexts()).not.toContain('is the night owl');
  });

  it('lets a person outside the most active stand out', () => {
    expect(insightTexts('everyone')).toContain(`${QUIET_PERSON_NAME} is the night owl`);
  });
});
