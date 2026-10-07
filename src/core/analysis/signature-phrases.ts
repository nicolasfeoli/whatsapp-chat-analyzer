/**
 * Picks the phrases that set one person apart: the runs of two or three words
 * they use far more than everybody else in the chat does.
 *
 * The whole table of phrases is large (every pair and triple of neighbouring
 * words in the chat), so it is reduced to a handful of phrases per person here,
 * before the result crosses over from the worker to the page.
 */

import type { SignaturePhrase } from '../types';

/**
 * A phrase must be used at least this often by a person to count as one of
 * theirs; rarer phrases are too easily a coincidence.
 */
export const MINIMUM_USES_FOR_SIGNATURE_PHRASE = 4;

/**
 * A phrase is a signature phrase when the person uses it more than this many
 * times as often as everybody else does, relative to how much each side writes.
 */
export const MINIMUM_SIGNATURE_PHRASE_RATIO = 2;

/** How many signature phrases are kept per person. */
export const SIGNATURE_PHRASES_PER_PERSON = 5;

/**
 * Added to every count before dividing (Laplace smoothing), so a phrase the
 * others never use gives a large but finite ratio instead of a division by zero.
 */
const SMOOTHING_COUNT = 1;

/** A phrase of one person together with how much more they use it than the others. */
interface RatedPhrase {
  readonly phrase: string;
  readonly count: number;
  /** How many times more often the person uses the phrase than everybody else. */
  readonly ratio: number;
}

/**
 * Adds up the counts of a table.
 */
function totalOf(counts: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const count of counts.values()) {
    total += count;
  }
  return total;
}

/**
 * Tells whether one phrase contains the other as a run of whole words, as
 * "see you" is contained in "see you later". Showing both would say the same
 * thing twice.
 */
function isOverlapping(firstPhrase: string, secondPhrase: string): boolean {
  const paddedFirstPhrase = ` ${firstPhrase} `;
  const paddedSecondPhrase = ` ${secondPhrase} `;
  return (
    paddedFirstPhrase.includes(paddedSecondPhrase) || paddedSecondPhrase.includes(paddedFirstPhrase)
  );
}

/**
 * Rates every phrase a person used often enough by how much more they use it
 * than the rest of the chat, and keeps the ones clearly above the others.
 */
function ratePhrases(
  personPhraseCounts: ReadonlyMap<string, number>,
  chatPhraseCounts: ReadonlyMap<string, number>,
): RatedPhrase[] {
  const vocabularySize = chatPhraseCounts.size;
  const personTotal = totalOf(personPhraseCounts);
  const othersTotal = totalOf(chatPhraseCounts) - personTotal;

  const ratedPhrases: RatedPhrase[] = [];
  for (const [phrase, count] of personPhraseCounts) {
    if (count < MINIMUM_USES_FOR_SIGNATURE_PHRASE) {
      continue;
    }
    const othersCount = (chatPhraseCounts.get(phrase) ?? count) - count;
    const personRate = (count + SMOOTHING_COUNT) / (personTotal + vocabularySize);
    const othersRate = (othersCount + SMOOTHING_COUNT) / (othersTotal + vocabularySize);
    const ratio = personRate / othersRate;
    if (ratio > MINIMUM_SIGNATURE_PHRASE_RATIO) {
      ratedPhrases.push({ phrase, count, ratio });
    }
  }
  return ratedPhrases;
}

/**
 * Finds the phrases a person uses far more than the rest of the chat does.
 *
 * For each phrase the person's rate (uses per phrase they wrote) is divided by
 * the rate of everybody else, both smoothed as for signature words. The most
 * distinctive phrases come first; of two phrases that overlap ("see you" and
 * "see you later") only the more distinctive one is kept, and the longer one
 * when they are equally distinctive.
 *
 * @param personPhraseCounts - How often the person used each phrase.
 * @param chatPhraseCounts - How often each phrase occurs in the whole chat,
 *   the person's own uses included.
 * @returns Up to five phrases, the most distinctive first.
 */
export function findSignaturePhrases(
  personPhraseCounts: ReadonlyMap<string, number>,
  chatPhraseCounts: ReadonlyMap<string, number>,
): SignaturePhrase[] {
  const ratedPhrases = ratePhrases(personPhraseCounts, chatPhraseCounts);
  ratedPhrases.sort((first: RatedPhrase, second: RatedPhrase): number => {
    if (second.ratio !== first.ratio) {
      return second.ratio - first.ratio;
    }
    return second.phrase.length - first.phrase.length;
  });

  const signaturePhrases: SignaturePhrase[] = [];
  for (const ratedPhrase of ratedPhrases) {
    if (signaturePhrases.length === SIGNATURE_PHRASES_PER_PERSON) {
      break;
    }
    const overlapsChosenPhrase = signaturePhrases.some((chosenPhrase: SignaturePhrase): boolean =>
      isOverlapping(chosenPhrase.phrase, ratedPhrase.phrase),
    );
    if (!overlapsChosenPhrase) {
      signaturePhrases.push({ phrase: ratedPhrase.phrase, count: ratedPhrase.count });
    }
  }
  return signaturePhrases;
}
