/**
 * Hides who is who, for sharing a screenshot of the report.
 *
 * The analysis is copied with every name replaced by a neutral label ("Person
 * A", "Person B", ...) and every message text replaced by a note that it is
 * hidden. Because the copy has the same shape as the original, the sections
 * are drawn from it by the same code and no section needs to know about it.
 *
 * Numbers, dates, emojis and common words stay: they are what the screenshot
 * is for. Words that are part of somebody's name are taken out of the word
 * lists, since a chat is full of people calling each other by name. The sites
 * that links lead to stay as well, except those named after a participant.
 *
 * The events of the group history name people too, also people who never
 * wrote a message. Each of those gets a label of their own ("Member 1"), and
 * the names the group had are left out, since a group name gives a chat away.
 */

import type {
  ChatAnalysis,
  ChatMessage,
  ChatMilestone,
  GroupChange,
  GroupEvent,
  GroupMember,
  PersonStatistics,
  SignaturePhrase,
} from '../core/index';
import { normaliseMentionedName } from './sections/mentions';

/** The title shown instead of the name of the chat, which is usually a person or a group. */
export const ANONYMOUS_CHAT_TITLE = 'A chat';

/** What stands in place of the text of every message. */
export const HIDDEN_MESSAGE_TEXT = 'Message hidden';

/** The label under which mentions of people who never wrote in the chat are added up. */
export const SOMEBODY_ELSE_LABEL = 'Somebody else';

/**
 * Writes the neutral label of somebody the group history names who never
 * wrote a message, such as a person who was added and left without a word.
 *
 * @param index - 0 for the first such person the events name, 1 for the next, and so on.
 * @returns `"Member 1"`, `"Member 2"` and upwards.
 */
export function anonymousMemberLabelOf(index: number): string {
  return `Member ${index + 1}`;
}

/** The letters the first twenty-six people are labelled with. */
const LABEL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** A word of a name shorter than this ("de", "la") is too common to be worth removing. */
const SHORTEST_NAME_WORD_LENGTH = 3;

/** A word of a name: a letter of any script followed by letters or apostrophes, as in the word lists. */
const NAME_WORD_PATTERN = /[\p{L}][\p{L}']*/gu;

/** What separates the labels of a site: `example.com` has the labels `example` and `com`. */
const SITE_LABEL_SEPARATOR = '.';

/**
 * What separates the words inside the label of a site: anything that is not a
 * letter, so `ana-garcia` and `ana2024` both hold the word `ana`.
 */
const SITE_WORD_SEPARATOR_PATTERN = /[^\p{L}]+/u;

/**
 * Writes the neutral label of the person at a position in the ranking.
 *
 * @param index - 0 for the most active person, 1 for the next, and so on.
 * @returns `"Person A"` to `"Person Z"`, then `"Person 27"` and upwards.
 */
export function anonymousLabelOf(index: number): string {
  const letter = LABEL_LETTERS[index];
  if (letter === undefined) {
    return `Person ${index + 1}`;
  }
  return `Person ${letter}`;
}

/** Everything needed to replace the names of one chat. */
interface NameReplacement {
  /** The label of each participant, by their name as the export wrote it. */
  readonly labelsByName: ReadonlyMap<string, string>;
  /** The label of each participant, by their name as it is compared with a mention. */
  readonly labelsByMentionedName: ReadonlyMap<string, string>;
  /** The lower-cased words the names are made of. */
  readonly nameWords: ReadonlySet<string>;
}

/**
 * Prepares the replacement of every name in a chat.
 */
function buildNameReplacement(people: readonly PersonStatistics[]): NameReplacement {
  const labelsByName = new Map<string, string>();
  const labelsByMentionedName = new Map<string, string>();
  const nameWords = new Set<string>();

  for (const [index, person] of people.entries()) {
    const label = anonymousLabelOf(index);
    labelsByName.set(person.name, label);
    labelsByMentionedName.set(normaliseMentionedName(person.name), label);
    for (const nameWord of person.name.toLowerCase().match(NAME_WORD_PATTERN) ?? []) {
      if (nameWord.length >= SHORTEST_NAME_WORD_LENGTH) {
        nameWords.add(nameWord);
      }
    }
  }
  return { labelsByName, labelsByMentionedName, nameWords };
}

/**
 * Copies a table of counts kept by name, with every name replaced. Counts
 * whose names get the same label are added up.
 */
function relabelCounts(
  countsByName: ReadonlyMap<string, number>,
  labelOf: (name: string) => string,
): Map<string, number> {
  const countsByLabel = new Map<string, number>();
  for (const [name, count] of countsByName) {
    const label = labelOf(name);
    countsByLabel.set(label, (countsByLabel.get(label) ?? 0) + count);
  }
  return countsByLabel;
}

/**
 * Copies a table of reply delays kept by the name of the recipient, with every
 * name replaced. Lists whose names get the same label are joined.
 */
function relabelDelays(
  delaysByName: ReadonlyMap<string, readonly number[]>,
  labelOf: (name: string) => string,
): Map<string, readonly number[]> {
  const delaysByLabel = new Map<string, readonly number[]>();
  for (const [name, delays] of delaysByName) {
    const label = labelOf(name);
    delaysByLabel.set(label, [...(delaysByLabel.get(label) ?? []), ...delays]);
  }
  return delaysByLabel;
}

/**
 * Copies a table of word counts without the words that are part of a name.
 */
function removeNameWords(
  wordCounts: ReadonlyMap<string, number>,
  nameWords: ReadonlySet<string>,
): Map<string, number> {
  const keptWordCounts = new Map<string, number>();
  for (const [word, count] of wordCounts) {
    if (!nameWords.has(word)) {
      keptWordCounts.set(word, count);
    }
  }
  return keptWordCounts;
}

/**
 * Tells whether a site is named after a participant: one of the words of its
 * labels is a word of a name, as in `ana-garcia.example`. The last label is
 * not looked at, since it is a top-level domain and never a name of its own;
 * a participant called "Com" would otherwise hide most of the web.
 */
function isSiteNamedAfterSomebody(site: string, nameWords: ReadonlySet<string>): boolean {
  const labelsBeforeTopLevelDomain = site.split(SITE_LABEL_SEPARATOR).slice(0, -1);
  return labelsBeforeTopLevelDomain.some((label: string): boolean =>
    label.split(SITE_WORD_SEPARATOR_PATTERN).some((word: string): boolean => nameWords.has(word)),
  );
}

/**
 * Copies a table of link counts by site without the sites named after a
 * participant. The other sites are not names and stay as they are.
 */
function removeSitesNamedAfterPeople(
  linkSiteCounts: ReadonlyMap<string, number>,
  nameWords: ReadonlySet<string>,
): Map<string, number> {
  const keptLinkSiteCounts = new Map<string, number>();
  for (const [site, count] of linkSiteCounts) {
    if (!isSiteNamedAfterSomebody(site, nameWords)) {
      keptLinkSiteCounts.set(site, count);
    }
  }
  return keptLinkSiteCounts;
}

/**
 * Tells whether a phrase is free of the words names are made of.
 */
function isFreeOfNameWords(
  signaturePhrase: SignaturePhrase,
  nameWords: ReadonlySet<string>,
): boolean {
  return !signaturePhrase.phrase.split(' ').some((word: string): boolean => nameWords.has(word));
}

/**
 * Copies the statistics of one person with every name in them replaced.
 */
function anonymisePerson(person: PersonStatistics, replacement: NameReplacement): PersonStatistics {
  const labelOfSender = (name: string): string =>
    replacement.labelsByName.get(name) ?? SOMEBODY_ELSE_LABEL;
  const labelOfMentionedName = (name: string): string =>
    replacement.labelsByMentionedName.get(normaliseMentionedName(name)) ?? SOMEBODY_ELSE_LABEL;

  return {
    ...person,
    name: labelOfSender(person.name),
    replyCountsByRecipient: relabelCounts(person.replyCountsByRecipient, labelOfSender),
    replyDelaysByRecipient: relabelDelays(person.replyDelaysByRecipient, labelOfSender),
    mentionCountsByName: relabelCounts(person.mentionCountsByName, labelOfMentionedName),
    wordCounts: removeNameWords(person.wordCounts, replacement.nameWords),
    linkSiteCounts: removeSitesNamedAfterPeople(person.linkSiteCounts, replacement.nameWords),
    signaturePhrases: person.signaturePhrases.filter((signaturePhrase: SignaturePhrase): boolean =>
      isFreeOfNameWords(signaturePhrase, replacement.nameWords),
    ),
  };
}

/**
 * Copies a message with its sender relabelled and its text hidden. A media
 * message loses its caption, which is typed text too.
 */
function anonymiseMessage(message: ChatMessage, replacement: NameReplacement): ChatMessage {
  const sender = replacement.labelsByName.get(message.sender) ?? SOMEBODY_ELSE_LABEL;
  if (message.kind === 'media') {
    return { ...message, sender, caption: '' };
  }
  return { ...message, sender, text: HIDDEN_MESSAGE_TEXT };
}

/**
 * Copies a milestone with the sender of its message relabelled. A milestone
 * that names nobody is handed back as it is.
 */
function anonymiseMilestone(milestone: ChatMilestone, replacement: NameReplacement): ChatMilestone {
  if (milestone.kind === 'first-message' || milestone.kind === 'message-count') {
    const sender = replacement.labelsByName.get(milestone.sender) ?? SOMEBODY_ELSE_LABEL;
    return { ...milestone, sender };
  }
  return milestone;
}

/**
 * Gives the people of the group history their labels: a participant keeps the
 * label they have everywhere else, and everybody else gets a numbered label
 * that stays the same from one event to the next.
 */
interface GroupMemberRelabelling {
  /** Copies a person of an event with their name replaced. */
  readonly relabel: (member: GroupMember) => GroupMember;
}

/**
 * Prepares the labels of the people the group history names.
 */
function createGroupMemberRelabelling(replacement: NameReplacement): GroupMemberRelabelling {
  const labelsOfOtherMembers = new Map<string, string>();

  const labelOf = (name: string): string => {
    const comparedName = normaliseMentionedName(name);
    const participantLabel =
      replacement.labelsByName.get(name) ?? replacement.labelsByMentionedName.get(comparedName);
    if (participantLabel !== undefined) {
      return participantLabel;
    }
    const knownLabel = labelsOfOtherMembers.get(comparedName);
    if (knownLabel !== undefined) {
      return knownLabel;
    }
    const newLabel = anonymousMemberLabelOf(labelsOfOtherMembers.size);
    labelsOfOtherMembers.set(comparedName, newLabel);
    return newLabel;
  };

  return {
    relabel: (member: GroupMember): GroupMember =>
      member.kind === 'named' ? { kind: 'named', name: labelOf(member.name) } : member,
  };
}

/**
 * Copies what a group event says happened with every person relabelled and
 * every group name left out.
 */
function anonymiseGroupChange(
  change: GroupChange,
  relabelling: GroupMemberRelabelling,
): GroupChange {
  const relabelOptional = (member: GroupMember | null): GroupMember | null =>
    member === null ? null : relabelling.relabel(member);

  switch (change.kind) {
    case 'created':
      return { kind: 'created', creator: relabelling.relabel(change.creator), groupName: null };
    case 'joined':
      return { ...change, member: relabelling.relabel(change.member) };
    case 'left':
      return { ...change, member: relabelling.relabel(change.member) };
    case 'added':
    case 'removed':
      return {
        kind: change.kind,
        actor: relabelOptional(change.actor),
        members: change.members.map(relabelling.relabel),
      };
    case 'renamed':
      return {
        kind: 'renamed',
        actor: relabelling.relabel(change.actor),
        previousName: null,
        newName: null,
      };
    case 'icon-changed':
      return { ...change, actor: relabelling.relabel(change.actor) };
  }
}

/**
 * Copies the events of the group history without a name in them. The events
 * are walked oldest first, so the numbered labels follow the order in which
 * people first appear.
 */
function anonymiseGroupEvents(
  groupEvents: readonly GroupEvent[],
  replacement: NameReplacement,
): GroupEvent[] {
  const relabelling = createGroupMemberRelabelling(replacement);
  return groupEvents.map((groupEvent: GroupEvent): GroupEvent => ({
    timestamp: groupEvent.timestamp,
    change: anonymiseGroupChange(groupEvent.change, relabelling),
  }));
}

/**
 * Makes a copy of an analysis in which nobody can be recognised by name and
 * no message can be read.
 *
 * @param analysis - The analysed chat. It is not modified.
 * @returns The copy: same numbers, neutral labels instead of names (also for
 *   the senders of the milestones), hidden message texts, word lists without
 *   the words of the names, site lists without the sites named after a
 *   participant, and a group history with labels for everybody it names and
 *   without the names of the group.
 */
export function anonymiseAnalysis(analysis: ChatAnalysis): ChatAnalysis {
  const replacement = buildNameReplacement(analysis.people);
  const longestMessage =
    analysis.longestMessage === null
      ? null
      : anonymiseMessage(analysis.longestMessage, replacement);

  return {
    ...analysis,
    people: analysis.people.map((person: PersonStatistics): PersonStatistics =>
      anonymisePerson(person, replacement),
    ),
    messages: analysis.messages.map((message: ChatMessage): ChatMessage =>
      anonymiseMessage(message, replacement),
    ),
    wordCounts: removeNameWords(analysis.wordCounts, replacement.nameWords),
    linkSiteCounts: removeSitesNamedAfterPeople(analysis.linkSiteCounts, replacement.nameWords),
    longestMessage,
    milestones: analysis.milestones.map((milestone: ChatMilestone): ChatMilestone =>
      anonymiseMilestone(milestone, replacement),
    ),
    groupEvents: anonymiseGroupEvents(analysis.groupEvents, replacement),
  };
}
