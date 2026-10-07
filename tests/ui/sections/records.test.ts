// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { assignPersonColours } from '../../../src/ui/person-colours';
import {
  describeMessageForBubble,
  renderMessageBubble,
  renderRecordsSection,
} from '../../../src/ui/sections/records';
import type { ChatAnalysis } from '../../../src/core/types';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { deletedMessage, mediaMessage, textMessage } from '../../fixtures/messages';
import { findElement, parseMarkup, textsOfElements } from '../../fixtures/markup';

/** The number of characters a bubble shows before it cuts the message short. */
const BUBBLE_CHARACTER_LIMIT = 1500;

const ANA_AND_BOB = [
  personStatistics({ name: 'Ana', messageCount: 2 }),
  personStatistics({ name: 'Bob', messageCount: 1 }),
];

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis): HTMLDivElement {
  return parseMarkup(renderRecordsSection(analysis, assignPersonColours(analysis.people)));
}

describe('describeMessageForBubble', () => {
  it('shows a typed message as it was typed', () => {
    expect(describeMessageForBubble(textMessage({ text: 'see you at eight' }))).toBe(
      'see you at eight',
    );
  });

  it('replaces the placeholder of the export by a fixed wording for media', () => {
    const message = mediaMessage({ text: '<Multimedia omitido>' });

    expect(describeMessageForBubble(message)).toBe('(photo, audio or file)');
  });

  it('shows the tombstone of a deleted message as the export wrote it', () => {
    const message = deletedMessage({ text: 'This message was deleted' });

    expect(describeMessageForBubble(message)).toBe('This message was deleted');
  });

  it('shows a message of exactly 1,500 characters in full', () => {
    const text = 'a'.repeat(BUBBLE_CHARACTER_LIMIT);

    expect(describeMessageForBubble(textMessage({ text }))).toBe(text);
  });

  it('cuts a longer message after 1,500 characters and marks the cut', () => {
    const text = 'a'.repeat(BUBBLE_CHARACTER_LIMIT) + 'this part is cut off';

    expect(describeMessageForBubble(textMessage({ text }))).toBe(
      `${'a'.repeat(BUBBLE_CHARACTER_LIMIT)} …`,
    );
  });
});

describe('renderMessageBubble', () => {
  const personColours = assignPersonColours(ANA_AND_BOB);

  it('draws the caption, the sender with their swatch, the text and the time', () => {
    const message = textMessage({
      sender: 'Bob',
      sentAt: '2026-01-05 08:05',
      text: 'good morning',
    });

    expect(renderMessageBubble(message, 'First message in the export', personColours)).toBe(
      '<div>' +
        '<h3 style="margin-bottom:8px">First message in the export</h3>' +
        '<div class="bubble">' +
        '<div class="person-name"><i class="colour-swatch" style="background:var(--s2)"></i>Bob</div>' +
        '<div class="bubble-text">good morning</div>' +
        '<div class="bubble-timestamp">05/01/2026 08:05</div>' +
        '</div>' +
        '</div>',
    );
  });

  it('keeps the line breaks of a multi-line message in the text', () => {
    const message = textMessage({ text: 'first line\nsecond line' });

    const bubble = parseMarkup(renderMessageBubble(message, 'Caption', personColours));

    expect(findElement(bubble, '.bubble-text').textContent).toBe('first line\nsecond line');
  });

  it('shows a sender and a text with markup as text', () => {
    const message = textMessage({
      sender: '<img src=x onerror=alert(1)>',
      text: '<script>alert(2)</script>',
    });

    const bubble = parseMarkup(renderMessageBubble(message, 'Caption', personColours));

    expect(bubble.querySelectorAll('img, script')).toHaveLength(0);
    expect(findElement(bubble, '.person-name').textContent).toBe('<img src=x onerror=alert(1)>');
    expect(findElement(bubble, '.bubble-text').textContent).toBe('<script>alert(2)</script>');
  });

  it('shows a caption with markup as text', () => {
    const bubble = parseMarkup(renderMessageBubble(textMessage(), '<u>Longest</u>', personColours));

    expect(bubble.querySelectorAll('u')).toHaveLength(0);
    expect(findElement(bubble, 'h3').textContent).toBe('<u>Longest</u>');
  });
});

describe('renderRecordsSection', () => {
  const firstMessage = textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'hi Bob' });
  const longestMessage = textMessage({
    sender: 'Bob',
    sentAt: '2024-01-13 10:05',
    text: 'let me tell you the whole story of what happened on the way here',
  });

  it('is headed "From the record"', () => {
    const section = renderSection(chatAnalysis({ people: ANA_AND_BOB }));

    expect(textsOfElements(section, '.section-heading h2')).toEqual(['From the record']);
  });

  it('shows the first message and the longest message, each under its caption', () => {
    const section = renderSection(
      chatAnalysis({
        people: ANA_AND_BOB,
        messages: [firstMessage, longestMessage],
        longestMessage,
        longestMessageWordCount: 14,
      }),
    );

    expect(textsOfElements(section, 'h3')).toEqual([
      'First message in the export',
      'Longest message, 14 words',
    ]);
    expect(textsOfElements(section, '.bubble .person-name')).toEqual(['Ana', 'Bob']);
    expect(textsOfElements(section, '.bubble .bubble-text')).toEqual([
      'hi Bob',
      'let me tell you the whole story of what happened on the way here',
    ]);
  });

  it('groups the digits of a very long word count', () => {
    const section = renderSection(
      chatAnalysis({ people: ANA_AND_BOB, longestMessage, longestMessageWordCount: 1250 }),
    );

    expect(textsOfElements(section, 'h3')).toContain('Longest message, 1,250 words');
  });

  it('shows only the first message when no message contains a word', () => {
    const photo = mediaMessage({ sender: 'Ana', text: '<Media omitted>' });

    const section = renderSection(
      chatAnalysis({ people: ANA_AND_BOB, messages: [photo], longestMessage: null }),
    );

    expect(textsOfElements(section, 'h3')).toEqual(['First message in the export']);
    expect(textsOfElements(section, '.bubble .bubble-text')).toEqual(['(photo, audio or file)']);
  });

  it('shows the same message twice when the first message is also the longest', () => {
    const section = renderSection(
      chatAnalysis({
        people: ANA_AND_BOB,
        messages: [firstMessage],
        longestMessage: firstMessage,
        longestMessageWordCount: 2,
      }),
    );

    expect(textsOfElements(section, '.bubble .bubble-text')).toEqual(['hi Bob', 'hi Bob']);
  });
});
