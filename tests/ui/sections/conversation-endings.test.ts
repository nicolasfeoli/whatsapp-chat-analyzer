// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { assignPersonColours } from '../../../src/ui/person-colours';
import {
  MINIMUM_QUESTIONS_FOR_UNANSWERED_SHARE,
  renderConversationEndingsSection,
} from '../../../src/ui/sections/conversation-endings';
import type { ChatAnalysis } from '../../../src/core/types';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { findElement, parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis): HTMLDivElement {
  return parseMarkup(
    renderConversationEndingsSection(analysis, assignPersonColours(analysis.people)),
  );
}

/**
 * Finds one of the two columns of the section by its heading.
 */
function findColumn(section: ParentNode, heading: string): Element {
  const columns = Array.from(section.querySelectorAll('.two-columns > div'));
  const column = columns.find(
    (candidate) => candidate.querySelector('h3')?.textContent === heading,
  );
  if (column === undefined) {
    throw new Error(`No column headed "${heading}"`);
  }
  return column;
}

/** Bob usually has the last word; a quarter of Ana's questions were left unanswered. */
const anaAndBob = chatAnalysis({
  conversationCount: 1601,
  people: [
    personStatistics({
      name: 'Ana',
      messageCount: 60,
      conversationsEndedCount: 400,
      questionCount: 40,
      unansweredQuestionCount: 10,
    }),
    personStatistics({
      name: 'Bob',
      messageCount: 40,
      conversationsEndedCount: 1200,
      questionCount: 4,
      unansweredQuestionCount: 2,
    }),
  ],
});

describe('renderConversationEndingsSection', () => {
  describe('when there is nothing to show', () => {
    it('is left out of a chat with a single sender', () => {
      const monologue = chatAnalysis({
        conversationCount: 5,
        people: [personStatistics({ name: 'Ana', messageCount: 3, conversationsEndedCount: 4 })],
      });

      expect(
        renderConversationEndingsSection(monologue, assignPersonColours(monologue.people)),
      ).toBe('');
    });

    it('is left out of a chat whose only conversation is still open', () => {
      const oneEvening = chatAnalysis({
        conversationCount: 1,
        people: [
          personStatistics({ name: 'Ana', messageCount: 3 }),
          personStatistics({ name: 'Bob', messageCount: 2 }),
        ],
      });

      expect(
        renderConversationEndingsSection(oneEvening, assignPersonColours(oneEvening.people)),
      ).toBe('');
    });
  });

  it('is headed "How conversations end" and has two columns', () => {
    const section = renderSection(anaAndBob);

    expect(textsOfElements(section, '.section-heading h2')).toEqual(['How conversations end']);
    expect(textsOfElements(section, '.two-columns h3')).toEqual([
      'Had the last word',
      'Questions left unanswered',
    ]);
  });

  it('says when a conversation counts as ended', () => {
    const caption = findElement(renderSection(anaAndBob), '.section-heading p').textContent;

    expect(caption).toContain('nobody writes for eight hours');
  });

  describe('had the last word', () => {
    it('draws a bar per person with the conversations they ended', () => {
      const column = findColumn(renderSection(anaAndBob), 'Had the last word');

      expect(textsOfElements(column, '.bar-label')).toEqual(['Ana', 'Bob']);
      expect(textsOfElements(column, '.bar-value')).toEqual(['400', '1,200']);
    });

    it('gives the person who ended most conversations the longest bar', () => {
      const column = findColumn(renderSection(anaAndBob), 'Had the last word');
      const barStyles = Array.from(column.querySelectorAll('.bar'), (bar) =>
        bar.getAttribute('style'),
      );

      expect(barStyles[0]).toContain('width:33.3%');
      expect(barStyles[1]).toContain('width:100.0%');
    });
  });

  describe('questions left unanswered', () => {
    it('adds the share of their questions for a person who asked enough of them', () => {
      const column = findColumn(renderSection(anaAndBob), 'Questions left unanswered');

      expect(textsOfElements(column, '.bar-value')[0]).toBe('10  25%');
    });

    it('shows only the count for a person who asked too few questions for a share', () => {
      const column = findColumn(renderSection(anaAndBob), 'Questions left unanswered');

      expect(textsOfElements(column, '.bar-value')[1]).toBe('2');
    });

    it('adds the share from exactly the minimum number of questions', () => {
      const atTheMinimum = chatAnalysis({
        conversationCount: 3,
        people: [
          personStatistics({
            name: 'Ana',
            messageCount: 2,
            questionCount: MINIMUM_QUESTIONS_FOR_UNANSWERED_SHARE,
            unansweredQuestionCount: 5,
          }),
          personStatistics({
            name: 'Bob',
            messageCount: 1,
            questionCount: MINIMUM_QUESTIONS_FOR_UNANSWERED_SHARE - 1,
            unansweredQuestionCount: 5,
          }),
        ],
      });

      const column = findColumn(renderSection(atTheMinimum), 'Questions left unanswered');

      expect(textsOfElements(column, '.bar-value')).toEqual(['5  50%', '5']);
    });

    it('says so instead of drawing empty bars when every question was answered', () => {
      const allAnswered = chatAnalysis({
        conversationCount: 3,
        people: [
          personStatistics({ name: 'Ana', messageCount: 2, conversationsEndedCount: 1 }),
          personStatistics({ name: 'Bob', messageCount: 1, conversationsEndedCount: 1 }),
        ],
      });

      const column = findColumn(renderSection(allAnswered), 'Questions left unanswered');

      expect(textsOfElements(column, '.hint')).toEqual(['No conversation ended on a question.']);
      expect(column.querySelectorAll('.bar')).toHaveLength(0);
    });
  });

  it('shows the eight most active people of a large group', () => {
    const names = ['Ana', 'Bob', 'Carla', 'Dani', 'Eva', 'Fede', 'Gabi', 'Hugo', 'Ines', 'Juan'];
    const largeGroup = chatAnalysis({
      conversationCount: 11,
      people: names.map((name, index) =>
        personStatistics({ name, messageCount: 100 - index, conversationsEndedCount: 1 }),
      ),
    });

    const column = findColumn(renderSection(largeGroup), 'Had the last word');

    expect(textsOfElements(column, '.bar-label')).toEqual(names.slice(0, 8));
  });

  it('writes a name that is markup as text', () => {
    const hostileName = '<img src=x onerror=alert(1)>';
    const hostileChat = chatAnalysis({
      conversationCount: 2,
      people: [
        personStatistics({ name: hostileName, messageCount: 2, conversationsEndedCount: 1 }),
        personStatistics({ name: 'Bob', messageCount: 1 }),
      ],
    });

    const section = renderSection(hostileChat);

    expect(tagNamesIn(section)).not.toContain('img');
    expect(textsOfElements(section, '.bar-label')).toContain(hostileName);
  });
});
