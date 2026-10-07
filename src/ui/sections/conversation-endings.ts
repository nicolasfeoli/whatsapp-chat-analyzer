/**
 * The "How conversations end" section: who had the last word before the chat
 * went quiet, and whose questions were left without an answer. It is only
 * shown for a chat with more than one sender in which at least one
 * conversation has ended.
 */

import type { ChatAnalysis, PersonStatistics } from '../../core/index';
import { renderHorizontalBars } from '../charts/horizontal-bars';
import type { HorizontalBarRow } from '../charts/horizontal-bars';
import { EMPTY_HTML, html } from '../html';
import type { SafeHtml } from '../html';
import { colourOfPerson } from '../person-colours';
import type { PersonColours } from '../person-colours';
import { ratioWhenAtLeast, sumOf } from '../ranking';
import { formatPercentage, formatWholeNumber } from '../text-formatting';
import {
  DEFAULT_PEOPLE_SHOWN,
  renderPeopleShownNote,
  selectFeaturedPeople,
} from './featured-people';
import type { PeopleShown } from './featured-people';
import { renderSectionHeading } from './section-heading';

/**
 * A person needs to have asked at least this many questions before the share
 * left unanswered is shown next to the count; "50% of their questions" is
 * noise when they asked two.
 */
export const MINIMUM_QUESTIONS_FOR_UNANSWERED_SHARE = 10;

/** Shown instead of the chart when no question was left without an answer. */
const NO_UNANSWERED_QUESTIONS_NOTE: SafeHtml = html`<p class="hint">No conversation ended on a question.</p>`;

/**
 * Draws the chart of conversations each person ended.
 */
function renderLastWords(
  featuredPeople: readonly PersonStatistics[],
  personColours: PersonColours,
): SafeHtml {
  const bars = featuredPeople.map((person: PersonStatistics): HorizontalBarRow => ({
    label: person.name,
    value: person.conversationsEndedCount,
    colour: colourOfPerson(personColours, person.name),
    displayValue: formatWholeNumber(person.conversationsEndedCount),
  }));
  return renderHorizontalBars(bars);
}

/**
 * Writes how many of a person's questions went unanswered, followed by the
 * share of all their questions when they asked enough for it to mean something.
 */
function formatUnansweredQuestions(person: PersonStatistics): string {
  const formattedCount = formatWholeNumber(person.unansweredQuestionCount);
  const share = ratioWhenAtLeast(
    person.unansweredQuestionCount,
    person.questionCount,
    MINIMUM_QUESTIONS_FOR_UNANSWERED_SHARE,
  );
  if (share === null) {
    return formattedCount;
  }
  /* Two spaces: the stylesheet preserves them to set the share apart from the count. */
  return `${formattedCount}  ${formatPercentage(share)}`;
}

/**
 * Draws the chart of unanswered questions, or a note when there are none.
 */
function renderUnansweredQuestions(
  featuredPeople: readonly PersonStatistics[],
  personColours: PersonColours,
): SafeHtml {
  const unansweredQuestionCount = sumOf(
    featuredPeople.map((person: PersonStatistics): number => person.unansweredQuestionCount),
  );
  if (unansweredQuestionCount === 0) {
    return NO_UNANSWERED_QUESTIONS_NOTE;
  }

  const bars = featuredPeople.map((person: PersonStatistics): HorizontalBarRow => ({
    label: person.name,
    value: person.unansweredQuestionCount,
    colour: colourOfPerson(personColours, person.name),
    displayValue: formatUnansweredQuestions(person),
  }));
  return renderHorizontalBars(bars);
}

/**
 * Draws the "How conversations end" section.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @param peopleShown - Whether to list the most active people only, or everyone.
 * @returns A `<section>` element as markup, or empty markup for a chat with a
 *   single sender or one in which no conversation has ended yet.
 */
export function renderConversationEndingsSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
  peopleShown: PeopleShown = DEFAULT_PEOPLE_SHOWN,
): SafeHtml {
  const hasSeveralPeople = analysis.people.length > 1;
  const hasEndedConversation = analysis.conversationCount > 1;
  if (!hasSeveralPeople || !hasEndedConversation) {
    return EMPTY_HTML;
  }

  const featuredPeople = selectFeaturedPeople(analysis.people, peopleShown);
  const lastWordsHtml = renderLastWords(featuredPeople, personColours);
  const unansweredQuestionsHtml = renderUnansweredQuestions(featuredPeople, personColours);

  const headingHtml = renderSectionHeading(
    'How conversations end',
    'A conversation ends when nobody writes for eight hours. A question is left unanswered when nobody else wrote between it and that silence.',
  );
  const lastWordsColumnHtml = html`<div><h3>Had the last word</h3>${lastWordsHtml}</div>`;
  const questionsColumnHtml = html`<div><h3>Questions left unanswered</h3>${unansweredQuestionsHtml}</div>`;
  const noteHtml = renderPeopleShownNote(featuredPeople.length, analysis.people.length);
  return html`<section>${headingHtml}<div class="two-columns">${lastWordsColumnHtml}${questionsColumnHtml}</div>${noteHtml}</section>`;
}
