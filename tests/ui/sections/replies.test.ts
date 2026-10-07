// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { assignPersonColours } from '../../../src/ui/person-colours';
import { renderRepliesSection } from '../../../src/ui/sections/replies';
import type { ChatAnalysis } from '../../../src/core/types';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { parseMarkup, textsOfElements } from '../../fixtures/markup';

/** One second and one minute, in the unit reply delays are measured in. */
const ONE_SECOND = 1000;
const ONE_MINUTE = 60 * ONE_SECOND;

/**
 * Builds five reply delays of the same length: enough for a typical delay.
 */
function fiveRepliesOf(delayInMilliseconds: number): number[] {
  return new Array<number>(5).fill(delayInMilliseconds);
}

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis): HTMLDivElement {
  return parseMarkup(renderRepliesSection(analysis, assignPersonColours(analysis.people)));
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

/** Ana replies within seconds, Bob takes twelve minutes. */
const anaAndBob = chatAnalysis({
  people: [
    personStatistics({
      name: 'Ana',
      messageCount: 60,
      replyDelaysInMilliseconds: fiveRepliesOf(45 * ONE_SECOND),
      conversationsStartedCount: 1200,
    }),
    personStatistics({
      name: 'Bob',
      messageCount: 40,
      replyDelaysInMilliseconds: fiveRepliesOf(12 * ONE_MINUTE),
      conversationsStartedCount: 300,
    }),
  ],
});

describe('renderRepliesSection', () => {
  it('is left out of a chat with a single sender, where nobody replies to anybody', () => {
    const monologue = chatAnalysis({
      people: [personStatistics({ name: 'Ana', messageCount: 3 })],
    });

    expect(renderRepliesSection(monologue, assignPersonColours(monologue.people))).toBe('');
  });

  it('is headed "Replies and openings" and has two columns', () => {
    const section = renderSection(anaAndBob);

    expect(textsOfElements(section, '.section-heading h2')).toEqual(['Replies and openings']);
    expect(textsOfElements(section, '.two-columns h3')).toEqual([
      'Typical time to reply',
      'Conversations started',
    ]);
  });

  describe('typical time to reply', () => {
    it('draws a bar per person with their median reply time', () => {
      const column = findColumn(renderSection(anaAndBob), 'Typical time to reply');

      expect(textsOfElements(column, '.bar-label')).toEqual(['Ana', 'Bob']);
      expect(textsOfElements(column, '.bar-value')).toEqual(['45 s', '12 min']);
    });

    it('gives the slowest person the longest bar', () => {
      const column = findColumn(renderSection(anaAndBob), 'Typical time to reply');
      const barStyles = Array.from(column.querySelectorAll('.bar'), (bar) =>
        bar.getAttribute('style'),
      );

      /* 45 seconds against 12 minutes is one sixteenth: 6.25%, shown as 6.3%. */
      expect(barStyles).toEqual([
        'width:6.3%;background:var(--s1)',
        'width:100.0%;background:var(--s2)',
      ]);
    });

    it('leaves out a person with fewer than five measured replies', () => {
      const analysis = chatAnalysis({
        people: [
          personStatistics({
            name: 'Ana',
            messageCount: 60,
            replyDelaysInMilliseconds: fiveRepliesOf(45 * ONE_SECOND),
          }),
          personStatistics({
            name: 'Bob',
            messageCount: 40,
            replyDelaysInMilliseconds: [ONE_MINUTE, ONE_MINUTE, ONE_MINUTE, ONE_MINUTE],
          }),
        ],
      });

      const column = findColumn(renderSection(analysis), 'Typical time to reply');

      expect(textsOfElements(column, '.bar-label')).toEqual(['Ana']);
    });

    it('says there is not enough back and forth when nobody can be measured', () => {
      const analysis = chatAnalysis({
        people: [
          personStatistics({ name: 'Ana', messageCount: 2 }),
          personStatistics({ name: 'Bob', messageCount: 1 }),
        ],
      });

      const column = findColumn(renderSection(analysis), 'Typical time to reply');

      expect(textsOfElements(column, '.hint')).toEqual(['Not enough back and forth to measure.']);
      expect(column.querySelectorAll('.horizontal-bars')).toHaveLength(0);
    });

    it('does not mention rounding for an export that records seconds', () => {
      const column = findColumn(renderSection(anaAndBob), 'Typical time to reply');

      expect(textsOfElements(column, '.hint')).toEqual([]);
    });
  });

  describe('an export that records only minutes', () => {
    const minuteResolutionChat = chatAnalysis({
      timestampResolution: 'minute',
      people: [
        personStatistics({
          name: 'Ana',
          messageCount: 60,
          replyDelaysInMilliseconds: fiveRepliesOf(0),
        }),
        personStatistics({
          name: 'Bob',
          messageCount: 40,
          replyDelaysInMilliseconds: fiveRepliesOf(3 * ONE_MINUTE),
        }),
      ],
    });

    it('writes a reply within the same minute as "under 1 min"', () => {
      const column = findColumn(renderSection(minuteResolutionChat), 'Typical time to reply');

      expect(textsOfElements(column, '.bar-value')).toEqual(['under 1 min', '3 min']);
    });

    it('notes under the chart that times are rounded', () => {
      const column = findColumn(renderSection(minuteResolutionChat), 'Typical time to reply');

      expect(textsOfElements(column, '.hint')).toEqual([
        'This export records times to the minute, so replies are rounded.',
      ]);
    });

    it('does not add the note when there is no chart to explain', () => {
      const analysis = chatAnalysis({
        timestampResolution: 'minute',
        people: [
          personStatistics({ name: 'Ana', messageCount: 2 }),
          personStatistics({ name: 'Bob', messageCount: 1 }),
        ],
      });

      const column = findColumn(renderSection(analysis), 'Typical time to reply');

      expect(textsOfElements(column, '.hint')).toEqual(['Not enough back and forth to measure.']);
    });
  });

  describe('conversations started', () => {
    it('draws a bar per person with the number of conversations they opened', () => {
      const column = findColumn(renderSection(anaAndBob), 'Conversations started');

      expect(textsOfElements(column, '.bar-label')).toEqual(['Ana', 'Bob']);
      expect(textsOfElements(column, '.bar-value')).toEqual(['1,200', '300']);
    });

    it('includes a person who never opened one, with an empty bar', () => {
      const analysis = chatAnalysis({
        people: [
          personStatistics({ name: 'Ana', messageCount: 2, conversationsStartedCount: 1 }),
          personStatistics({ name: 'Bob', messageCount: 1, conversationsStartedCount: 0 }),
        ],
      });

      const column = findColumn(renderSection(analysis), 'Conversations started');

      expect(textsOfElements(column, '.bar-value')).toEqual(['1', '0']);
    });
  });

  it('shows the eight most talkative people only', () => {
    const tenPeople = Array.from({ length: 10 }, (_unused, index) =>
      personStatistics({ name: `Person ${index + 1}`, messageCount: 10 - index }),
    );

    const section = renderSection(chatAnalysis({ people: tenPeople }));

    expect(
      textsOfElements(findColumn(section, 'Conversations started'), '.bar-label'),
    ).toHaveLength(8);
  });
});
