// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { renderSectionHeading } from '../../../src/ui/sections/section-heading';
import { parseMarkup, tagNamesIn } from '../../fixtures/markup';

describe('renderSectionHeading', () => {
  it('draws the title and the caption under it', () => {
    expect(renderSectionHeading('Who says what', 'Messages sent by each person.')).toBe(
      '<div class="section-heading"><h2>Who says what</h2><p>Messages sent by each person.</p></div>',
    );
  });

  it('leaves out the paragraph when there is no caption', () => {
    expect(renderSectionHeading('From the record')).toBe(
      '<div class="section-heading"><h2>From the record</h2></div>',
    );
  });

  it('shows markup in the title and in the caption as text', () => {
    const heading = parseMarkup(renderSectionHeading('<img src=x>', '<script>alert(1)</script>'));

    expect(tagNamesIn(heading)).toEqual(['div', 'h2', 'p']);
    expect(heading.textContent).toBe('<img src=x><script>alert(1)</script>');
  });
});
