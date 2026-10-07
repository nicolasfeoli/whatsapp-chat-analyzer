/**
 * The "One person up close" section: the reader picks a person and sees what
 * the report knows about them in one place, instead of looking them up in
 * every chart. The list offers everyone in the chat, also the people the
 * other sections leave out of a large group. It is only shown for a chat with
 * more than one sender; with one, the rest of the report is that profile.
 *
 * The section is drawn with one profile inside it. When the reader picks
 * somebody else, `page-controller.ts` draws that person's profile into the
 * same place with {@link renderPersonProfile}; the file is not read again.
 */

import type { ChatAnalysis, PersonStatistics, SignaturePhrase } from '../../core/index';
import { renderBarStrip } from '../charts/bar-strip';
import type { BarStripBar } from '../charts/bar-strip';
import { EMPTY_HTML, escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { colourOfPerson, renderSwatchAndName } from '../person-colours';
import type { PersonColours } from '../person-colours';
import { findIndexOfLargest, ratioWhenAtLeast, selectMostFrequent } from '../ranking';
import type { CountedEntry } from '../ranking';
import {
  formatCountWithNoun,
  formatPercentage,
  formatWholeNumber,
  padToTwoDigits,
  weekdayNameOf,
} from '../text-formatting';
import { MINIMUM_QUESTIONS_FOR_UNANSWERED_SHARE } from './conversation-endings';
import {
  MINIMUM_REPLIES_FOR_TYPICAL_DELAY,
  formatReplyDelay,
  typicalReplyDelayOf,
} from './featured-people';
import { normaliseMentionedName } from './mentions';
import { formatWordsPerMessage } from './people';
import { SMALLEST_GROUP_SIZE, replyCountBetween } from './reply-pairs';
import { renderSectionHeading } from './section-heading';
import { findSignatureWords, renderChip } from './words-and-emojis';
import type { SignatureWord } from './words-and-emojis';

/** The `id` of the list the reader picks a person from; the page controller listens to it. */
export const PERSON_PROFILE_SELECT_ID = 'person-profile-select';

/** The `id` of the element that holds the profile on display; the page controller redraws it. */
export const PERSON_PROFILE_CONTAINER_ID = 'person-profile';

/** The profile shown until the reader picks somebody: that of the most active person. */
export const DEFAULT_PROFILED_PERSON_INDEX = 0;

/** A profile needs somebody to compare with; a chat of one is its own profile. */
const SMALLEST_CHAT_WITH_PROFILES = 2;

/**
 * A person needs this many messages before the share they sent at night is
 * written next to the count; "50% at night" is noise when they sent two.
 */
export const MINIMUM_MESSAGES_FOR_NIGHT_SHARE = 20;

/** How many of a person's most used words the profile shows; eight fill about two rows of chips. */
const TOP_WORDS_IN_PROFILE = 8;

/** How many of a person's most used emojis the profile shows; eight fill one row of chips. */
const TOP_EMOJIS_IN_PROFILE = 8;

/** How many people each "whom" list names; beyond the third the counts are mostly small. */
export const PEOPLE_PER_RELATION_LIST = 3;

/** An hour label is written under every sixth bar of the hour strip: 00, 06, 12 and 18. */
const HOUR_LABEL_INTERVAL = 6;

/** The weekday labels under the weekday strip are the first three letters: "Mon". */
const WEEKDAY_LABEL_LENGTH = 3;

/** The last minute of an hour, for writing a slot as "21:00 to 21:59". */
const LAST_MINUTE_OF_HOUR = 59;

/** What a fact shows when it cannot be measured for this person. */
const NO_VALUE = '–';

/** One number of the profile with the words around it. */
interface ProfileFact {
  /** What the number is, e.g. `"Messages"`. */
  readonly label: string;
  /** The number as it is shown, e.g. `"1,204"`. */
  readonly value: string;
  /** Small print that puts the number in proportion, e.g. `"34% of the chat"`; empty for none. */
  readonly detail: string;
}

/** Somebody a person has to do with, and how often. */
export interface RelatedPerson {
  /** The name to show: a participant's name, or a mentioned name as the export wrote it. */
  readonly name: string;
  /** How many replies or mentions connect the two. */
  readonly count: number;
}

/**
 * Picks the person whose profile is shown.
 *
 * @param people - Everyone in the chat, most messages first.
 * @param profiledPersonIndex - The position of the wanted person in that list.
 * @returns That person; the most active one when the position is not in the
 *   list; `undefined` only for an empty list.
 */
export function selectProfiledPerson(
  people: readonly PersonStatistics[],
  profiledPersonIndex: number,
): PersonStatistics | undefined {
  return people[profiledPersonIndex] ?? people[DEFAULT_PROFILED_PERSON_INDEX];
}

/**
 * Writes a count followed by its share of a total in brackets, when the total
 * is large enough for a share to mean something.
 */
function formatCountWithShare(count: number, total: number, minimumTotal: number): string {
  const formattedCount = formatWholeNumber(count);
  const share = ratioWhenAtLeast(count, total, minimumTotal);
  if (share === null) {
    return formattedCount;
  }
  return `${formattedCount} (${formatPercentage(share)})`;
}

/**
 * The typical reply time of a person, or a dash with the reason when they
 * have not replied often enough to measure.
 */
function describeReplyTime(person: PersonStatistics, analysis: ChatAnalysis): ProfileFact {
  const label = 'Typical time to reply';
  const typicalDelay = typicalReplyDelayOf(person);
  if (typicalDelay === null) {
    const detail = `fewer than ${String(MINIMUM_REPLIES_FOR_TYPICAL_DELAY)} replies, too few to measure`;
    return { label, value: NO_VALUE, detail };
  }
  const replyCount = person.replyDelaysInMilliseconds.length;
  return {
    label,
    value: formatReplyDelay(typicalDelay, analysis.timestampResolution),
    detail: `median of ${formatCountWithNoun(replyCount, 'reply', 'replies')}`,
  };
}

/**
 * The questions a person asked and how many of them nobody answered.
 */
function describeQuestions(person: PersonStatistics): ProfileFact {
  const unanswered = formatCountWithShare(
    person.unansweredQuestionCount,
    person.questionCount,
    MINIMUM_QUESTIONS_FOR_UNANSWERED_SHARE,
  );
  return {
    label: 'Questions',
    value: formatWholeNumber(person.questionCount),
    detail: `${unanswered} left unanswered`,
  };
}

/**
 * The messages a person sent between midnight and 04:59, with their share of
 * that person's messages when there are enough to say.
 */
function describeNightMessages(person: PersonStatistics): ProfileFact {
  const share = ratioWhenAtLeast(
    person.nightMessageCount,
    person.messageCount,
    MINIMUM_MESSAGES_FOR_NIGHT_SHARE,
  );
  const hours = 'midnight to 04:59';
  return {
    label: 'At night',
    value: formatWholeNumber(person.nightMessageCount),
    detail: share === null ? hours : `${formatPercentage(share)} of their messages, ${hours}`,
  };
}

/**
 * Gathers the numbers of a profile, in the order they are shown.
 *
 * @param person - The person the profile is about.
 * @param analysis - The analysed chat, for the totals the numbers are measured against.
 * @returns One fact per number.
 */
function listProfileFacts(person: PersonStatistics, analysis: ChatAnalysis): ProfileFact[] {
  const shareOfChat = formatPercentage(person.messageCount / analysis.totalMessageCount);
  /* The conversation still open at the end of the export has not ended, so nobody had its last word. */
  const endedConversationCount = analysis.conversationCount - 1;

  return [
    {
      label: 'Messages',
      value: formatWholeNumber(person.messageCount),
      detail: `${shareOfChat} of the chat`,
    },
    {
      label: 'Words per message',
      value: formatWordsPerMessage(person),
      detail: `${formatCountWithNoun(person.wordCount, 'word', 'words')} in all`,
    },
    { label: 'Media', value: formatWholeNumber(person.mediaCount), detail: '' },
    { label: 'Emojis', value: formatWholeNumber(person.emojiCount), detail: '' },
    describeQuestions(person),
    describeReplyTime(person, analysis),
    {
      label: 'Conversations started',
      value: formatWholeNumber(person.conversationsStartedCount),
      detail: `of ${formatWholeNumber(analysis.conversationCount)} in the chat`,
    },
    {
      label: 'Had the last word',
      value: formatWholeNumber(person.conversationsEndedCount),
      detail: `of ${formatWholeNumber(endedConversationCount)} that ended`,
    },
    describeNightMessages(person),
  ];
}

/**
 * Draws one fact: the label, the number and its small print.
 */
function renderProfileFact(fact: ProfileFact): SafeHtml {
  const detailHtml =
    fact.detail === '' ? EMPTY_HTML : html`<small>${escapeHtml(fact.detail)}</small>`;
  return html`<div class="profile-fact"><dt>${escapeHtml(fact.label)}</dt><dd><b>${escapeHtml(fact.value)}</b>${detailHtml}</dd></div>`;
}

/**
 * Writes an hour of the day as the slot it stands for.
 *
 * @param hour - The hour, 0 to 23.
 * @returns For example `"21:00 to 21:59"`.
 */
function describeHourSlot(hour: number): string {
  const paddedHour = padToTwoDigits(hour);
  return `${paddedHour}:00 to ${paddedHour}:${String(LAST_MINUTE_OF_HOUR)}`;
}

/**
 * Draws the strip of a person's messages by hour of the day, with a sentence
 * that names the hour they write most in.
 */
function renderHourStrip(person: PersonStatistics, colour: string): SafeHtml {
  const bars = person.messageCountsByHour.map(
    (messageCount: number, hour: number): BarStripBar => ({
      axisLabel: hour % HOUR_LABEL_INTERVAL === 0 ? padToTwoDigits(hour) : '',
      slotName: describeHourSlot(hour),
      messageCount,
    }),
  );

  const peakHour = findIndexOfLargest(person.messageCountsByHour);
  let peakSentence = 'No messages to place.';
  if (peakHour !== null) {
    const peakCount = formatCountWithNoun(
      person.messageCountsByHour[peakHour] ?? 0,
      'message',
      'messages',
    );
    peakSentence = `Most active around ${padToTwoDigits(peakHour)}:00, with ${peakCount} in that hour.`;
  }

  const stripHtml = renderBarStrip(bars, colour, `Messages by hour of the day. ${peakSentence}`);
  return html`<div><h3>By hour of the day</h3>${stripHtml}<p class="hint">${escapeHtml(peakSentence)}</p></div>`;
}

/**
 * Draws the strip of a person's messages by weekday, with a sentence that
 * names the day they write most on.
 */
function renderWeekdayStrip(person: PersonStatistics, colour: string): SafeHtml {
  const bars = person.messageCountsByWeekday.map(
    (messageCount: number, weekdayIndex: number): BarStripBar => {
      const weekdayName = weekdayNameOf(weekdayIndex);
      return {
        axisLabel: weekdayName.slice(0, WEEKDAY_LABEL_LENGTH),
        slotName: weekdayName,
        messageCount,
      };
    },
  );

  const peakWeekdayIndex = findIndexOfLargest(person.messageCountsByWeekday);
  let peakSentence = 'No messages to place.';
  if (peakWeekdayIndex !== null) {
    const peakCount = formatCountWithNoun(
      person.messageCountsByWeekday[peakWeekdayIndex] ?? 0,
      'message',
      'messages',
    );
    peakSentence = `Most active on ${weekdayNameOf(peakWeekdayIndex)}s, with ${peakCount}.`;
  }

  const stripHtml = renderBarStrip(bars, colour, `Messages by weekday. ${peakSentence}`);
  return html`<div><h3>By weekday</h3>${stripHtml}<p class="hint">${escapeHtml(peakSentence)}</p></div>`;
}

/**
 * Draws a titled block of chips, or nothing when there are no chips.
 */
function renderChipBlock(title: string, chips: readonly SafeHtml[]): SafeHtml {
  if (chips.length === 0) {
    return EMPTY_HTML;
  }
  return html`<div><h3>${escapeHtml(title)}</h3><div class="chips">${joinHtml(chips)}</div></div>`;
}

/**
 * Draws a chip for each of the most frequent entries of a table of counts.
 */
function renderMostFrequentChips(counts: ReadonlyMap<string, number>, limit: number): SafeHtml[] {
  return selectMostFrequent(counts, limit).map((entry: CountedEntry<string>): SafeHtml =>
    renderChip(entry.key, formatWholeNumber(entry.count)),
  );
}

/**
 * Draws what a person writes: their most used words, the words and phrases
 * that set them apart, and their favourite emojis. Blocks with nothing in
 * them are left out, and so is the whole row for somebody who typed nothing.
 */
function renderWriting(person: PersonStatistics, analysis: ChatAnalysis): SafeHtml {
  const signatureWordChips = findSignatureWords(person, analysis.wordCounts).map(
    (signatureWord: SignatureWord): SafeHtml =>
      renderChip(signatureWord.word, formatWholeNumber(signatureWord.count)),
  );
  const catchphraseChips = person.signaturePhrases.map(
    (signaturePhrase: SignaturePhrase): SafeHtml =>
      renderChip(signaturePhrase.phrase, formatWholeNumber(signaturePhrase.count)),
  );

  const blocksHtml = joinHtml([
    renderChipBlock(
      'Most used words',
      renderMostFrequentChips(person.wordCounts, TOP_WORDS_IN_PROFILE),
    ),
    renderChipBlock('Signature words', signatureWordChips),
    renderChipBlock('Catchphrases', catchphraseChips),
    renderChipBlock(
      'Top emojis',
      renderMostFrequentChips(person.emojiCounts, TOP_EMOJIS_IN_PROFILE),
    ),
  ]);
  if (blocksHtml === EMPTY_HTML) {
    return EMPTY_HTML;
  }
  return html`<div class="two-columns">${blocksHtml}</div>`;
}

/**
 * Keeps the people with the highest counts, leaving out those with none.
 * People with equal counts keep the order they were given in.
 */
function selectMostRelated(relatedPeople: readonly RelatedPerson[]): RelatedPerson[] {
  return relatedPeople
    .filter((relatedPerson: RelatedPerson): boolean => relatedPerson.count > 0)
    .sort((first: RelatedPerson, second: RelatedPerson): number => second.count - first.count)
    .slice(0, PEOPLE_PER_RELATION_LIST);
}

/**
 * Finds whose messages a person answered most often.
 *
 * @param person - The person who wrote the replies.
 * @returns Up to three people, the most answered first.
 */
export function findMostAnsweredPeople(person: PersonStatistics): RelatedPerson[] {
  const recipients: RelatedPerson[] = [];
  for (const [name, count] of person.replyCountsByRecipient) {
    recipients.push({ name, count });
  }
  return selectMostRelated(recipients);
}

/**
 * Finds who answered a person's messages most often, by looking through the
 * replies of everybody else.
 *
 * @param person - The person whose messages were answered.
 * @param people - Everyone in the chat.
 * @returns Up to three people, the most frequent replier first.
 */
export function findMostFrequentRepliers(
  person: PersonStatistics,
  people: readonly PersonStatistics[],
): RelatedPerson[] {
  const repliers: RelatedPerson[] = [];
  for (const otherPerson of people) {
    if (otherPerson !== person) {
      repliers.push({
        name: otherPerson.name,
        count: replyCountBetween(otherPerson, person.name),
      });
    }
  }
  return selectMostRelated(repliers);
}

/**
 * Finds whom a person mentioned with `@` most often. A name written with and
 * without the "not a contact" tilde is one person, and is shown under the
 * name of the participant it belongs to when there is one, so it gets that
 * participant's colour.
 *
 * @param person - The person who wrote the mentions.
 * @param people - Everyone in the chat.
 * @returns Up to three names, the most mentioned first.
 */
export function findMostMentionedPeople(
  person: PersonStatistics,
  people: readonly PersonStatistics[],
): RelatedPerson[] {
  const participantNamesByMentionedName = new Map<string, string>();
  for (const participant of people) {
    participantNamesByMentionedName.set(normaliseMentionedName(participant.name), participant.name);
  }

  const countsByName = new Map<string, number>();
  for (const [mentionedName, count] of person.mentionCountsByName) {
    const comparableName = normaliseMentionedName(mentionedName);
    const shownName = participantNamesByMentionedName.get(comparableName) ?? comparableName;
    countsByName.set(shownName, (countsByName.get(shownName) ?? 0) + count);
  }

  const mentionedPeople: RelatedPerson[] = [];
  for (const [name, count] of countsByName) {
    mentionedPeople.push({ name, count });
  }
  return selectMostRelated(mentionedPeople);
}

/**
 * Draws a titled list of people with a count each, or nothing for an empty list.
 *
 * @param title - The heading of the list, e.g. `"Answers most"`.
 * @param relatedPeople - The people to list, in order.
 * @param singular - The noun for a count of one, e.g. `"reply"`.
 * @param plural - The noun for any other count, e.g. `"replies"`.
 * @param personColours - The colour assignment shared by all charts.
 */
function renderRelationList(
  title: string,
  relatedPeople: readonly RelatedPerson[],
  singular: string,
  plural: string,
  personColours: PersonColours,
): SafeHtml {
  if (relatedPeople.length === 0) {
    return EMPTY_HTML;
  }
  const itemsHtml = joinHtml(
    relatedPeople.map((relatedPerson: RelatedPerson): SafeHtml => {
      const nameHtml = renderSwatchAndName(personColours, relatedPerson.name);
      const count = escapeHtml(formatCountWithNoun(relatedPerson.count, singular, plural));
      return html`<li><span class="profile-relation-name">${nameHtml}</span><small>${count}</small></li>`;
    }),
  );
  return html`<div><h3>${escapeHtml(title)}</h3><ol class="profile-relations">${itemsHtml}</ol></div>`;
}

/**
 * Draws whom a person has most to do with: whose messages they answer, who
 * answers theirs, and whom they mention. The two reply lists are for groups
 * only, because in a chat of two each person can only answer the other.
 */
function renderRelations(
  person: PersonStatistics,
  analysis: ChatAnalysis,
  personColours: PersonColours,
): SafeHtml {
  const isGroup = analysis.people.length >= SMALLEST_GROUP_SIZE;
  const mostAnswered = isGroup ? findMostAnsweredPeople(person) : [];
  const mostFrequentRepliers = isGroup ? findMostFrequentRepliers(person, analysis.people) : [];
  const mostMentioned = findMostMentionedPeople(person, analysis.people);

  const answersHtml = joinHtml([
    renderRelationList('Answers most', mostAnswered, 'reply', 'replies', personColours),
    renderRelationList('Answered most by', mostFrequentRepliers, 'reply', 'replies', personColours),
  ]);
  const mentionsHtml = renderRelationList(
    'Mentions most',
    mostMentioned,
    'mention',
    'mentions',
    personColours,
  );
  if (answersHtml === EMPTY_HTML && mentionsHtml === EMPTY_HTML) {
    return EMPTY_HTML;
  }

  const listsHtml = html`<div class="two-columns">${answersHtml}${mentionsHtml}</div>`;
  if (answersHtml === EMPTY_HTML) {
    return listsHtml;
  }
  return html`${listsHtml}<p class="hint">A reply counts towards whoever wrote just before it.</p>`;
}

/**
 * Draws the profile of one person: who they are in the ranking, their
 * numbers, when they write, what they write and whom they have to do with.
 *
 * @param analysis - The analysed chat the person belongs to.
 * @param personColours - The colour assignment shared by all charts.
 * @param person - The person the profile is about, one of `analysis.people`.
 * @returns The content of the profile as markup, without the element around it.
 */
export function renderPersonProfile(
  analysis: ChatAnalysis,
  personColours: PersonColours,
  person: PersonStatistics,
): SafeHtml {
  const rank = analysis.people.indexOf(person) + 1;
  const rankSentence = `Rank ${String(rank)} of ${String(analysis.people.length)} by messages sent`;
  const nameHtml = html`<p class="profile-name"><b>${renderSwatchAndName(personColours, person.name)}</b><span class="hint">${escapeHtml(rankSentence)}</span></p>`;

  const factsHtml = joinHtml(listProfileFacts(person, analysis).map(renderProfileFact));
  const colour = colourOfPerson(personColours, person.name);
  const stripsHtml = html`<div class="two-columns">${renderHourStrip(person, colour)}${renderWeekdayStrip(person, colour)}</div>`;
  const writingHtml = renderWriting(person, analysis);
  const relationsHtml = renderRelations(person, analysis, personColours);

  return html`${nameHtml}<dl class="profile-facts">${factsHtml}</dl>${stripsHtml}${writingHtml}${relationsHtml}`;
}

/**
 * Draws one entry of the list of people: the name and how much they wrote,
 * so somebody with three messages is not picked expecting a full profile.
 */
function renderPersonOption(
  person: PersonStatistics,
  personIndex: number,
  profiledPerson: PersonStatistics,
): SafeHtml {
  const messageCount = formatCountWithNoun(person.messageCount, 'message', 'messages');
  const optionText = escapeHtml(`${person.name} (${messageCount})`);
  if (person === profiledPerson) {
    return html`<option value="${personIndex}" selected>${optionText}</option>`;
  }
  return html`<option value="${personIndex}">${optionText}</option>`;
}

/**
 * Draws the "One person up close" section with the profile of one person in it.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @param profiledPersonIndex - The position, in `analysis.people`, of the
 *   person to show; the most active one when left out or out of range.
 * @returns A `<section>` element as markup, or empty markup for a chat with a
 *   single sender.
 */
export function renderPersonProfileSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
  profiledPersonIndex: number = DEFAULT_PROFILED_PERSON_INDEX,
): SafeHtml {
  const profiledPerson = selectProfiledPerson(analysis.people, profiledPersonIndex);
  if (profiledPerson === undefined || analysis.people.length < SMALLEST_CHAT_WITH_PROFILES) {
    return EMPTY_HTML;
  }

  const headingHtml = renderSectionHeading(
    'One person up close',
    'Everything about one person in one place. The list holds everyone who wrote in the chat, however little.',
  );
  /* Everyone is offered, whatever the other sections list: this is where the quiet people can be looked up. */
  const optionsHtml = joinHtml(
    analysis.people.map((person: PersonStatistics, personIndex: number): SafeHtml =>
      renderPersonOption(person, personIndex, profiledPerson),
    ),
  );
  const chooserHtml = html`<div class="profile-chooser"><label for="${escapeHtml(PERSON_PROFILE_SELECT_ID)}">Person</label><select id="${escapeHtml(PERSON_PROFILE_SELECT_ID)}">${optionsHtml}</select></div>`;
  const profileHtml = renderPersonProfile(analysis, personColours, profiledPerson);

  return html`<section>${headingHtml}${chooserHtml}<div class="person-profile" id="${escapeHtml(PERSON_PROFILE_CONTAINER_ID)}">${profileHtml}</div></section>`;
}
