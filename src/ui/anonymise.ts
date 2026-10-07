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
 * lists, since a chat is full of people calling each other by name.
 */

import type {
  ChatAnalysis,
  ChatMessage,
  ChatMilestone,
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

/** The letters the first twenty-six people are labelled with. */
const LABEL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** A word of a name shorter than this ("de", "la") is too common to be worth removing. */
const SHORTEST_NAME_WORD_LENGTH = 3;

/** A word of a name: a letter of any script followed by letters or apostrophes, as in the word lists. */
const NAME_WORD_PATTERN = /[\p{L}][\p{L}']*/gu;

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
    mentionCountsByName: relabelCounts(person.mentionCountsByName, labelOfMentionedName),
    wordCounts: removeNameWords(person.wordCounts, replacement.nameWords),
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
 * Makes a copy of an analysis in which nobody can be recognised by name and
 * no message can be read.
 *
 * @param analysis - The analysed chat. It is not modified.
 * @returns The copy: same numbers, neutral labels instead of names (also for
 *   the senders of the milestones), hidden message texts, and word lists
 *   without the words of the names.
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
    longestMessage,
    milestones: analysis.milestones.map((milestone: ChatMilestone): ChatMilestone =>
      anonymiseMilestone(milestone, replacement),
    ),
  };
}
