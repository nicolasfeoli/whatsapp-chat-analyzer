// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import type { RecapCard } from '../../../src/ui/recap/cards';
import {
  describeOpenRecapButton,
  describeRecapPosition,
  describeRecapTitle,
  renderRecapCard,
} from '../../../src/ui/recap/render';
import { findElement, parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';

/** A card as the recap writes them. */
const peopleCard: RecapCard = {
  kind: 'people',
  label: 'Who wrote most',
  headline: 'Ana wrote the most',
  lines: ['1. Ana: 60 messages, 60%', '2. Bob: 40 messages, 40%'],
};

describe('renderRecapCard', () => {
  it('draws the label, the headline as a heading, and one item per line', () => {
    const card = parseMarkup(renderRecapCard(peopleCard));

    expect(findElement(card, '.recap-card-label').textContent).toBe('Who wrote most');
    expect(findElement(card, 'h3.recap-card-headline').textContent).toBe('Ana wrote the most');
    expect(textsOfElements(card, '.recap-card-lines li')).toEqual([
      '1. Ana: 60 messages, 60%',
      '2. Bob: 40 messages, 40%',
    ]);
  });

  it('says in the markup which card it is', () => {
    const card = parseMarkup(renderRecapCard(peopleCard));

    expect(findElement(card, '[data-recap-card]').getAttribute('data-recap-card')).toBe('people');
  });

  it('escapes every text, so a name made of markup stays a name', () => {
    const markupName = '<img src=x onerror=alert(1)>';
    const card = parseMarkup(
      renderRecapCard({
        kind: 'people',
        label: `<b>${markupName}</b>`,
        headline: `${markupName} wrote the most`,
        lines: [`1. ${markupName}: 60 messages, 60%`],
      }),
    );

    expect(tagNamesIn(card)).toEqual(['div', 'p', 'h3', 'ul', 'li']);
    expect(findElement(card, 'h3').textContent).toBe(`${markupName} wrote the most`);
  });
});

describe('the words around the cards', () => {
  it('counts the cards from one', () => {
    expect(describeRecapPosition(0, 8)).toBe('Card 1 of 8');
    expect(describeRecapPosition(7, 8)).toBe('Card 8 of 8');
  });

  it('titles the recap by its year, without naming the chat', () => {
    expect(describeRecapTitle(2025)).toBe('2025 in this chat');
  });

  it('writes the year on the button that opens it', () => {
    expect(describeOpenRecapButton(2025)).toBe('See 2025 in this chat');
  });
});
