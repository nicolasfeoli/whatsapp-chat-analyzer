/**
 * What can be counted in the text of one typed message: links and the sites
 * they lead to, a question, emojis, words and written laughs.
 */

import { findSiteOfLink } from './link-hosts';
import { isStopWord } from './stop-words';

/** Everything counted in the text of one message. */
export interface MessageTextStatistics {
  /** Links in the message. */
  readonly linkCount: number;
  /**
   * The site each link leads to (`example.com`), in order of appearance,
   * repeats included. A link without a host that looks like a site has no
   * entry, so the list can be shorter than {@link MessageTextStatistics.linkCount}.
   */
  readonly linkSites: readonly string[];
  /** Whether the message, links aside, contains `?` or `¿`. */
  readonly containsQuestion: boolean;
  /** Every emoji in the message in order of appearance, repeats included. */
  readonly emojis: readonly string[];
  /** Number of words in the message, links aside. Laughs and stop words count as words here. */
  readonly wordCount: number;
  /** The lower-cased words worth ranking: no laughs, no stop words, at least three letters. Repeats included. */
  readonly significantWords: readonly string[];
  /** Whether at least one word is a written laugh. */
  readonly containsLaugh: boolean;
  /**
   * The names mentioned with `@`, in order of appearance, repeats included.
   * A mentioned name is not counted among the words.
   */
  readonly mentionedNames: readonly string[];
  /**
   * Every run of two or three consecutive words on one line that is worth
   * ranking as a phrase: lower-cased, no laughs, and at least one word that is
   * significant. Repeats included.
   */
  readonly phrases: readonly string[];
}

/**
 * Words shorter than this ("ok", "si", "no", "a") are never interesting in a
 * ranking of most used words, in any language.
 */
const SHORTEST_SIGNIFICANT_WORD_LENGTH = 3;

/**
 * A link: anything starting with `http://`, `https://` or `www.` up to the
 * next white space. Links are counted and then removed before words are
 * counted, so `https://example.com/some-long-path` is not five "words", and a
 * `?` inside a query string does not make the message a question.
 */
const LINK_PATTERN = /https?:\/\/\S+|www\.\S+/gi;

/**
 * A mention as an iPhone export writes it: `@`, then the name between the
 * invisible isolate marks U+2068 and U+2069. The name is captured. Android
 * writes a mention as `@` and a phone number with nothing around it, which
 * cannot be told apart from typed text and is left alone.
 */
const MENTION_PATTERN = /@\u2068(?<name>[^\u2068\u2069\n]+)\u2069/gu;

/** Phrases are made of this many consecutive words. */
const PHRASE_LENGTHS: readonly number[] = [2, 3];

/** A question mark, including the opening one Spanish uses (`¿`). */
const QUESTION_MARK_PATTERN = /[?¿]/;

/**
 * A word: a letter of any script followed by letters or apostrophes, so that
 * "don't" and "qu'est" stay whole while digits and punctuation separate words.
 */
const WORD_PATTERN = /[\p{L}][\p{L}']*/gu;

/**
 * One emoji as a person sees it, even when it is built from several code
 * points. The alternatives, in order:
 *
 * - `[0-9#*]\ufe0f?\u20e3` — keycaps such as 1️⃣ and #️⃣: a digit, `#` or `*`,
 *   an optional variation selector, and the combining enclosing keycap.
 * - `\u{1F3F4}[\u{E0020}-\u{E007E}]+\u{E007F}` — subdivision flags such as
 *   England's: the black flag followed by invisible tag letters and a cancel tag.
 * - `\p{Regional_Indicator}{2}` — country flags, each a pair of regional
 *   indicator letters (🇨🇷 is C + R).
 * - `\p{Extended_Pictographic}(...)*` — any pictograph, followed by any number
 *   of: a variation selector (U+FE0F), a zero-width joiner plus another
 *   pictograph (families and professions such as 👨‍👩‍👧), or a skin-tone
 *   modifier (U+1F3FB to U+1F3FF, as in 👍🏽).
 *
 * The pattern is global and therefore stateful when used with `test` or
 * `exec`. It is kept private to this module and only ever used with
 * `String.prototype.match`, which ignores that state; everything else goes
 * through {@link extractEmojis}.
 */
const EMOJI_PATTERN =
  /[0-9#*]\ufe0f?\u20e3|\u{1F3F4}[\u{E0020}-\u{E007E}]+\u{E007F}|\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\ufe0f|\u200d\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu;

/**
 * A whole word that is a written laugh, in the ways English and Spanish
 * speakers type them:
 *
 * - `a*(ha){2,}h*` — haha, ahahah, hahahah
 * - `(ja){2,}j*a*` — jaja, jajajaj
 * - `j+a+j+[aj]*` — sloppy Spanish laughs such as jajja, jaajaj, jjajaja
 * - `(je){2,}j*` — jeje, jejej
 * - `(he){2,}h*` — hehe, heheh
 * - `lo+l+` — lol, lool, loll
 * - `lmf?ao+` — lmao, lmfao, lmaooo
 * - `xd+` — xd, xdd
 * - `(ji){2,}` — jiji
 */
const LAUGH_PATTERN =
  /^(a*(ha){2,}h*|(ja){2,}j*a*|j+a+j+[aj]*|(je){2,}j*|(he){2,}h*|lo+l+|lmf?ao+|xd+|(ji){2,})$/i;

/**
 * Counts the links in a text.
 *
 * @param text - The text of a message.
 * @returns The number of `http://`, `https://` and `www.` links.
 */
export function countLinks(text: string): number {
  const links = text.match(LINK_PATTERN);
  return links === null ? 0 : links.length;
}

/**
 * Lists the sites the links of a text lead to: the host of each link, reduced
 * to its registrable-looking domain. Nothing else of a link is kept.
 *
 * @param text - The text of a message.
 * @returns One site per link that has one, in order of appearance, repeats included.
 */
export function extractLinkSites(text: string): string[] {
  const sites: string[] = [];
  for (const link of text.match(LINK_PATTERN) ?? []) {
    const site = findSiteOfLink(link);
    if (site !== null) {
      sites.push(site);
    }
  }
  return sites;
}

/**
 * Replaces every link in a text with a space, so the words around it stay apart.
 *
 * @param text - The text of a message.
 * @returns The text without its links.
 */
export function removeLinks(text: string): string {
  return text.replace(LINK_PATTERN, ' ');
}

/**
 * Lists the names mentioned with `@` in a text.
 *
 * @param text - The text of a message.
 * @returns Every mentioned name, trimmed, in order of appearance, repeats included.
 */
export function extractMentionedNames(text: string): string[] {
  const mentionedNames: string[] = [];
  for (const mention of text.matchAll(MENTION_PATTERN)) {
    const name = mention.groups?.['name']?.trim() ?? '';
    if (name !== '') {
      mentionedNames.push(name);
    }
  }
  return mentionedNames;
}

/**
 * Replaces every mention in a text with a space, so the name of the person
 * mentioned is not counted as a word the sender likes to use.
 *
 * @param text - The text of a message.
 * @returns The text without its mentions.
 */
export function removeMentions(text: string): string {
  return text.replace(MENTION_PATTERN, ' ');
}

/**
 * Lists the emojis of a text, treating flags, keycaps, families and skin-tone
 * variants as one emoji each.
 *
 * @param text - Any text.
 * @returns Every emoji in order of appearance, repeats included.
 */
export function extractEmojis(text: string): string[] {
  const emojis = text.match(EMOJI_PATTERN);
  return emojis === null ? [] : [...emojis];
}

/**
 * Lists the words of a text in lower case.
 *
 * @param text - Any text, ideally with links already removed.
 * @returns Every word in order of appearance, repeats included.
 */
export function extractWords(text: string): string[] {
  const words = text.toLowerCase().match(WORD_PATTERN);
  return words === null ? [] : [...words];
}

/**
 * Tells whether a word is a written laugh such as "haha", "jajaja" or "lol".
 *
 * @param word - A single word, in any letter case.
 * @returns `true` when the whole word is a laugh.
 */
export function isLaugh(word: string): boolean {
  return LAUGH_PATTERN.test(word);
}

/**
 * Tells whether a word that is not a laugh deserves a place in the ranking of
 * most used words.
 */
function isSignificantWord(lowerCasedWord: string): boolean {
  if (lowerCasedWord.length < SHORTEST_SIGNIFICANT_WORD_LENGTH) {
    return false;
  }
  return !isStopWord(lowerCasedWord);
}

/**
 * Tells whether a run of consecutive words is worth ranking as a phrase: it
 * holds no laugh, and at least one of its words would be ranked on its own.
 * "see you later" qualifies; "of the" and "haha yes" do not.
 */
function isPhraseWorthRanking(words: readonly string[]): boolean {
  if (words.some(isLaugh)) {
    return false;
  }
  return words.some(isSignificantWord);
}

/**
 * Lists the phrases of a text: every run of two or three consecutive words on
 * the same line that is worth ranking. A phrase never runs across a line
 * break, where one thought ends and the next begins.
 *
 * @param text - Any text, ideally with links and mentions already removed.
 * @returns The phrases, lower-cased with single spaces, repeats included.
 */
export function extractPhrases(text: string): string[] {
  const phrases: string[] = [];
  for (const line of text.split('\n')) {
    const words = extractWords(line);
    for (const phraseLength of PHRASE_LENGTHS) {
      for (let start = 0; start + phraseLength <= words.length; start += 1) {
        const phraseWords = words.slice(start, start + phraseLength);
        if (isPhraseWorthRanking(phraseWords)) {
          phrases.push(phraseWords.join(' '));
        }
      }
    }
  }
  return phrases;
}

/**
 * Counts everything of interest in something a person typed.
 *
 * @param text - The complete text of a message of kind `text`, or the caption
 *   of a media message.
 * @returns Links and their sites, question, emojis, words, laughs, mentions
 *   and phrases found in it.
 */
export function analyseMessageText(text: string): MessageTextStatistics {
  const linkSites = extractLinkSites(text);
  const linkCount = countLinks(text);
  const mentionedNames = extractMentionedNames(text);
  const textWithoutLinks = removeMentions(removeLinks(text));
  const words = extractWords(textWithoutLinks);

  const significantWords: string[] = [];
  let containsLaugh = false;
  for (const word of words) {
    if (isLaugh(word)) {
      containsLaugh = true;
      continue;
    }
    if (isSignificantWord(word)) {
      significantWords.push(word);
    }
  }

  return {
    linkCount,
    linkSites,
    containsQuestion: QUESTION_MARK_PATTERN.test(textWithoutLinks),
    emojis: extractEmojis(textWithoutLinks),
    wordCount: words.length,
    significantWords,
    containsLaugh,
    mentionedNames,
    phrases: extractPhrases(textWithoutLinks),
  };
}
