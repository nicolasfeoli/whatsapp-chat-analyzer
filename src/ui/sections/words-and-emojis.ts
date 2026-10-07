/**
 * The "Words and emojis" section: the most used words and emojis of the whole
 * chat, and for each person the words and the phrases that set them apart
 * from the others.
 */

import type { ChatAnalysis, PersonStatistics, SignaturePhrase } from '../../core/index';
import { renderHorizontalBars } from '../charts/horizontal-bars';
import type { HorizontalBarRow } from '../charts/horizontal-bars';
import { EMPTY_HTML, escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { renderSwatchAndName, selectColouredPeople } from '../person-colours';
import type { PersonColours } from '../person-colours';
import { selectMostFrequent, sumOf } from '../ranking';
import type { CountedEntry } from '../ranking';
import { formatWholeNumber } from '../text-formatting';
import { renderSectionHeading } from './section-heading';

/** How many words the "Most used words" chart shows. */
const MOST_USED_WORDS_LIMIT = 15;

/** How many emojis the "Most used emojis" chips show; sixteen fill two rows of eight. */
const MOST_USED_EMOJIS_LIMIT = 16;

/** The colour of the word bars, which belong to nobody in particular. */
const WORD_BAR_COLOUR = 'var(--neutral-bar)';

/**
 * A word must be used at least this often by a person to count as one of their
 * signature words; rarer words are too easily a coincidence.
 */
const MINIMUM_USES_FOR_SIGNATURE_WORD = 4;

/**
 * A word is a signature word when the person uses it more than this many times
 * as often as everybody else does, relative to how much each side writes.
 */
const MINIMUM_SIGNATURE_RATIO = 1.6;

/** How many signature words are shown per person. */
const SIGNATURE_WORDS_PER_PERSON = 7;

/**
 * Added to every count before dividing (Laplace smoothing), so a word the
 * others never use gives a large but finite ratio instead of a division by zero.
 */
const SMOOTHING_COUNT = 1;

/** A word that one person uses markedly more than the others do. */
export interface SignatureWord {
  readonly word: string;
  /** How many times more often the person uses it than everybody else. */
  readonly ratio: number;
  /** How many times the person used it. */
  readonly count: number;
}

/**
 * Finds the words a person uses far more than the rest of the chat does.
 *
 * For each word the person's rate (uses per word they wrote) is divided by the
 * rate of everybody else. Both rates are smoothed by adding one to the count
 * and the vocabulary size to the total, the usual remedy for words that one
 * side never used.
 *
 * @param person - The person whose signature words are wanted.
 * @param chatWordCounts - How often each significant word occurs in the whole chat.
 * @returns Up to seven words, the most distinctive first.
 */
export function findSignatureWords(
  person: PersonStatistics,
  chatWordCounts: ReadonlyMap<string, number>,
): SignatureWord[] {
  const vocabularySize = chatWordCounts.size;
  const personTotal = sumOf(person.wordCounts.values());
  const chatTotal = sumOf(chatWordCounts.values());
  const othersTotal = chatTotal - personTotal;

  const signatureWords: SignatureWord[] = [];
  for (const [word, count] of person.wordCounts) {
    if (count < MINIMUM_USES_FOR_SIGNATURE_WORD) {
      continue;
    }
    const chatCount = chatWordCounts.get(word) ?? 0;
    const othersCount = chatCount - count;
    const personRate = (count + SMOOTHING_COUNT) / (personTotal + vocabularySize);
    const othersRate = (othersCount + SMOOTHING_COUNT) / (othersTotal + vocabularySize);
    const ratio = personRate / othersRate;
    if (ratio > MINIMUM_SIGNATURE_RATIO) {
      signatureWords.push({ word, ratio, count });
    }
  }

  signatureWords.sort(
    (first: SignatureWord, second: SignatureWord): number => second.ratio - first.ratio,
  );
  return signatureWords.slice(0, SIGNATURE_WORDS_PER_PERSON);
}

/**
 * Draws a chip: a word or emoji with its count in small print.
 *
 * @param label - The word or emoji; untrusted, it is escaped here.
 * @param formattedCount - The count as it should be shown; escaped here.
 */
function renderChip(label: string, formattedCount: string): SafeHtml {
  return html`<span class="chip">${escapeHtml(label)}<small>${escapeHtml(formattedCount)}</small></span>`;
}

/**
 * Draws the "Most used words" chart, or a note when the chat has no words.
 */
function renderMostUsedWords(analysis: ChatAnalysis): SafeHtml {
  const mostUsedWords = selectMostFrequent(analysis.wordCounts, MOST_USED_WORDS_LIMIT);
  if (mostUsedWords.length === 0) {
    return html`<p class="hint">No words found.</p>`;
  }

  const bars = mostUsedWords.map((entry: CountedEntry<string>): HorizontalBarRow => ({
    label: entry.key,
    value: entry.count,
    colour: WORD_BAR_COLOUR,
    displayValue: formatWholeNumber(entry.count),
  }));
  return renderHorizontalBars(bars);
}

/**
 * Draws the "Most used emojis" chips, or a note when the chat has no emojis.
 */
function renderMostUsedEmojis(analysis: ChatAnalysis): SafeHtml {
  const mostUsedEmojis = selectMostFrequent(analysis.emojiCounts, MOST_USED_EMOJIS_LIMIT);
  if (mostUsedEmojis.length === 0) {
    return html`<p class="hint">No emojis in this chat.</p>`;
  }

  const chipsHtml = joinHtml(
    mostUsedEmojis.map((entry: CountedEntry<string>): SafeHtml =>
      renderChip(entry.key, formatWholeNumber(entry.count)),
    ),
  );
  return html`<div class="chips">${chipsHtml}</div>`;
}

/**
 * Draws the signature words of one person, or nothing when they have none.
 */
function renderSignatureRow(
  person: PersonStatistics,
  chatWordCounts: ReadonlyMap<string, number>,
  personColours: PersonColours,
): SafeHtml {
  const signatureWords = findSignatureWords(person, chatWordCounts);
  if (signatureWords.length === 0) {
    return EMPTY_HTML;
  }

  const chipsHtml = joinHtml(
    signatureWords.map((signatureWord: SignatureWord): SafeHtml =>
      renderChip(signatureWord.word, String(signatureWord.count)),
    ),
  );
  const nameHtml = html`<div class="person-name">${renderSwatchAndName(personColours, person.name)}</div>`;
  return html`<div class="signature-row">${nameHtml}<div class="chips">${chipsHtml}</div></div>`;
}

/**
 * Draws the "Signature words" block for the coloured people. Empty for a chat
 * with a single sender (there is nobody to differ from) and when nobody has a
 * signature word.
 */
function renderSignatureWords(analysis: ChatAnalysis, personColours: PersonColours): SafeHtml {
  const hasSeveralPeople = analysis.people.length > 1;
  if (!hasSeveralPeople) {
    return EMPTY_HTML;
  }

  const rowsHtml = joinHtml(
    selectColouredPeople(analysis.people).map((person: PersonStatistics): SafeHtml =>
      renderSignatureRow(person, analysis.wordCounts, personColours),
    ),
  );
  if (rowsHtml === EMPTY_HTML) {
    return EMPTY_HTML;
  }

  const headingHtml = html`<h3 style="margin-top:10px">Signature words</h3>`;
  const captionHtml = html`<p class="hint">Words each person uses far more than the others.</p>`;
  return html`${headingHtml}${captionHtml}<div class="signature-words">${rowsHtml}</div>`;
}

/**
 * Draws the catchphrases of one person, or nothing when they have none.
 */
function renderCatchphraseRow(person: PersonStatistics, personColours: PersonColours): SafeHtml {
  if (person.signaturePhrases.length === 0) {
    return EMPTY_HTML;
  }

  const chipsHtml = joinHtml(
    person.signaturePhrases.map((signaturePhrase: SignaturePhrase): SafeHtml =>
      renderChip(signaturePhrase.phrase, formatWholeNumber(signaturePhrase.count)),
    ),
  );
  const nameHtml = html`<div class="person-name">${renderSwatchAndName(personColours, person.name)}</div>`;
  return html`<div class="signature-row">${nameHtml}<div class="chips">${chipsHtml}</div></div>`;
}

/**
 * Draws the "Catchphrases" block for the coloured people. Empty when nobody
 * has a phrase of their own, as in a chat with a single sender.
 */
function renderCatchphrases(analysis: ChatAnalysis, personColours: PersonColours): SafeHtml {
  const rowsHtml = joinHtml(
    selectColouredPeople(analysis.people).map((person: PersonStatistics): SafeHtml =>
      renderCatchphraseRow(person, personColours),
    ),
  );
  if (rowsHtml === EMPTY_HTML) {
    return EMPTY_HTML;
  }

  const captionHtml = html`<p class="hint">Phrases of two or three words each person uses far more than the others.</p>`;
  return html`<div class="catchphrases"><h3>Catchphrases</h3>${captionHtml}<div class="signature-words">${rowsHtml}</div></div>`;
}

/**
 * Draws the "Words and emojis" section.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @returns A `<section>` element as markup.
 */
export function renderWordsAndEmojisSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
): SafeHtml {
  const headingHtml = renderSectionHeading(
    'Words and emojis',
    'Common filler words in English and Spanish are left out.',
  );
  const emojisHtml = renderMostUsedEmojis(analysis);
  const signatureWordsHtml = renderSignatureWords(analysis, personColours);

  const wordsColumnHtml = html`<div><h3>Most used words</h3>${renderMostUsedWords(analysis)}</div>`;
  const emojisColumnHtml = html`<div><h3>Most used emojis</h3>${emojisHtml}${signatureWordsHtml}</div>`;
  const catchphrasesHtml = renderCatchphrases(analysis, personColours);
  return html`<section>${headingHtml}<div class="two-columns">${wordsColumnHtml}${emojisColumnHtml}</div>${catchphrasesHtml}</section>`;
}
