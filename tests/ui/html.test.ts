// @vitest-environment jsdom

import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  EMPTY_HTML,
  escapeHtml,
  html,
  joinHtml,
  renderBoldName,
  setInnerHtml,
} from '../../src/ui/html';
import type { HtmlPlaceholderValue, SafeHtml } from '../../src/ui/html';

describe('escapeHtml', () => {
  it.each([
    { character: '&', entity: '&amp;' },
    { character: '<', entity: '&lt;' },
    { character: '>', entity: '&gt;' },
    { character: '"', entity: '&quot;' },
    { character: "'", entity: '&#39;' },
  ])('writes $character as $entity', ({ character, entity }) => {
    expect(escapeHtml(character)).toBe(entity);
  });

  it('escapes every occurrence, not only the first', () => {
    expect(escapeHtml('<<>>')).toBe('&lt;&lt;&gt;&gt;');
  });

  it('neutralises an element with an event handler', () => {
    const markup = '<img src=x onerror="alert(1)">';

    expect(escapeHtml(markup)).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('neutralises an attempt to close a quoted attribute', () => {
    expect(escapeHtml(`" onmouseover='alert(1)`)).toBe('&quot; onmouseover=&#39;alert(1)');
  });

  it('escapes an ampersand that is already part of an entity, so the text reads as typed', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves ordinary text, accents and emojis unchanged', () => {
    const text = 'María José: ¿qué tal? 12/10 👍';

    expect(escapeHtml(text)).toBe(text);
  });

  it('returns an empty string for an empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('renderBoldName', () => {
  it('wraps the name in a bold element', () => {
    expect(renderBoldName('Ana')).toBe('<b>Ana</b>');
  });

  it('escapes the name', () => {
    expect(renderBoldName('<b>Bob</b>')).toBe('<b>&lt;b&gt;Bob&lt;/b&gt;</b>');
  });
});

describe('SafeHtml', () => {
  it('cannot be had from a plain string, so unescaped text does not compile as markup', () => {
    expectTypeOf<string>().not.toExtend<SafeHtml>();
  });

  it('is still a string, so it can be compared and assigned wherever text is expected', () => {
    expectTypeOf<SafeHtml>().toExtend<string>();
  });

  it('is what escaping and the template tag produce', () => {
    expectTypeOf(escapeHtml).returns.toEqualTypeOf<SafeHtml>();
    expectTypeOf(html).returns.toEqualTypeOf<SafeHtml>();
  });

  it('is, with numbers, all a placeholder of the template tag accepts', () => {
    expectTypeOf<HtmlPlaceholderValue>().toEqualTypeOf<SafeHtml | number>();
    expectTypeOf<string>().not.toExtend<HtmlPlaceholderValue>();
  });
});

describe('html', () => {
  it('returns markup without placeholders as it was written', () => {
    expect(html`<p class="hint">No words found.</p>`).toBe('<p class="hint">No words found.</p>');
  });

  it('puts escaped text between the literal parts, in order', () => {
    const sender = escapeHtml('Ana & Bob');
    const text = escapeHtml('<3');

    expect(html`<b>${sender}</b>: ${text}!`).toBe('<b>Ana &amp; Bob</b>: &lt;3!');
  });

  it('writes numbers as they are', () => {
    expect(html`<rect x="${12.5}" width="${0}" height="${-3}"/>`).toBe(
      '<rect x="12.5" width="0" height="-3"/>',
    );
  });

  it('passes markup built earlier through without escaping it a second time', () => {
    const name = renderBoldName('Ana');

    expect(html`<li>${name}</li>`).toBe('<li><b>Ana</b></li>');
  });

  it('keeps a placeholder that is empty markup empty', () => {
    expect(html`<div>${EMPTY_HTML}</div>`).toBe('<div></div>');
  });

  it('copes with placeholders at the very start and the very end', () => {
    expect(html`${escapeHtml('a')}-${escapeHtml('b')}`).toBe('a-b');
  });
});

describe('EMPTY_HTML', () => {
  it('is the empty string', () => {
    expect(EMPTY_HTML).toBe('');
  });
});

describe('joinHtml', () => {
  it('joins the pieces without anything between them', () => {
    expect(joinHtml([html`<td>1</td>`, html`<td>2</td>`])).toBe('<td>1</td><td>2</td>');
  });

  it('puts the separator between neighbouring pieces only', () => {
    const emojis = [escapeHtml('🍕'), escapeHtml('⚽'), escapeHtml('👍')];

    expect(joinHtml(emojis, html` `)).toBe('🍕 ⚽ 👍');
  });

  it('returns empty markup for no pieces', () => {
    expect(joinHtml([])).toBe('');
  });
});

describe('setInnerHtml', () => {
  it('replaces the content of the element with the markup', () => {
    const element = document.createElement('div');
    element.textContent = 'old content';

    setInnerHtml(element, html`<b>${escapeHtml('new')}</b> content`);

    expect(element.innerHTML).toBe('<b>new</b> content');
  });

  it('shows escaped markup as text instead of creating elements', () => {
    const element = document.createElement('div');

    setInnerHtml(element, html`<p>${escapeHtml('<img src=x onerror=alert(1)>')}</p>`);

    expect(element.querySelectorAll('img')).toHaveLength(0);
    expect(element.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});
