/**
 * What can be counted in the text of one typed message: links, a question,
 * emojis, words and written laughs.
 */

import { isStopWord } from './stop-words';

/** Everything counted in the text of one message. */
export interface MessageTextStatistics {
  /** Links in the message. */
  readonly linkCount: number;
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
 * Replaces every link in a text with a space, so the words around it stay apart.
 *
 * @param text - The text of a message.
 * @returns The text without its links.
 */
export function removeLinks(text: string): string {
  return text.replace(LINK_PATTERN, ' ');
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
 * Counts everything of interest in the text of one typed message.
 *
 * @param text - The complete text of a message of kind `text`.
 * @returns Links, question, emojis, words and laughs found in it.
 */
export function analyseMessageText(text: string): MessageTextStatistics {
  const linkCount = countLinks(text);
  const textWithoutLinks = removeLinks(text);
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
    containsQuestion: QUESTION_MARK_PATTERN.test(textWithoutLinks),
    emojis: extractEmojis(textWithoutLinks),
    wordCount: words.length,
    significantWords,
    containsLaugh,
  };
}
