/**
 * Helpers for building HTML strings safely.
 *
 * The page is drawn by concatenating strings and assigning them to
 * `innerHTML`. Everything that comes from the chat (names, message text, file
 * names, words, emojis) is untrusted, so it must pass through
 * {@link escapeHtml} before it is placed in markup.
 *
 * That rule is enforced by the compiler rather than by convention. Markup has
 * its own type, {@link SafeHtml}, which a plain `string` cannot be assigned
 * to. There are only two ways to obtain one: escaping a string with
 * {@link escapeHtml}, or writing markup with the {@link html} template tag,
 * whose placeholders accept `SafeHtml` and numbers but not plain strings. The
 * functions that put markup on the page ({@link setInnerHtml}, the tooltip)
 * only accept `SafeHtml`, so a name that was never escaped cannot reach them.
 */

/**
 * The key of the property that tells {@link SafeHtml} apart from `string`. It
 * exists only for the type checker; no such property is ever created.
 */
declare const safeHtmlBrand: unique symbol;

/**
 * A string of HTML that is safe to assign to `innerHTML`: every piece of it is
 * either markup written in this code base or text that went through
 * {@link escapeHtml}.
 *
 * At run time it is an ordinary string (it has to be, so that results can be
 * compared, joined and sent through `innerHTML`). That is also why the
 * {@link html} tag cannot "escape plain strings and pass safe ones through":
 * the two are indistinguishable once the program runs. The tag refuses plain
 * strings at compile time instead, which makes every escape visible in the
 * source.
 */
export type SafeHtml = string & { readonly [safeHtmlBrand]: 'SafeHtml' };

/**
 * What may be written into a placeholder of the {@link html} tag: markup that
 * is already safe, or a number, whose digits cannot form markup.
 */
export type HtmlPlaceholderValue = SafeHtml | number;

/** The characters that have a meaning in HTML, and the entity that stands for each. */
const HTML_ENTITY_BY_CHARACTER: ReadonlyMap<string, string> = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
]);

/**
 * Matches every character that could end a text node or an attribute value:
 * the ampersand, both angle brackets and both kinds of quote.
 */
const HTML_SPECIAL_CHARACTER_PATTERN = /[&<>"']/g;

/**
 * Replaces one special character by its entity.
 */
function replaceSpecialCharacter(character: string): string {
  return HTML_ENTITY_BY_CHARACTER.get(character) ?? character;
}

/**
 * Declares a string to be safe markup. This is the single place where the
 * brand is applied, and it is private: the exported functions below are the
 * only ones that can vouch for a string.
 */
function markAsSafeHtml(markup: string): SafeHtml {
  return markup as SafeHtml;
}

/**
 * Makes a string safe to place inside an HTML text node or a quoted attribute.
 *
 * @param untrustedText - Any text, typically something read from the chat.
 * @returns The same text with `&`, `<`, `>`, `"` and `'` written as entities.
 */
export function escapeHtml(untrustedText: string): SafeHtml {
  const escapedText = untrustedText.replace(
    HTML_SPECIAL_CHARACTER_PATTERN,
    replaceSpecialCharacter,
  );
  return markAsSafeHtml(escapedText);
}

/**
 * Template tag for writing markup: `` html`<b>${escapeHtml(name)}</b>` ``.
 *
 * The literal parts of the template are markup written by a developer and are
 * used as they are. The placeholders only accept {@link SafeHtml} and numbers,
 * so interpolating a plain string (a name, a word, a file name) is a compile
 * error until it is wrapped in {@link escapeHtml}.
 *
 * @param literalParts - The text between the placeholders.
 * @param placeholderValues - The values of the placeholders, in order.
 * @returns The assembled markup.
 */
export function html(
  literalParts: TemplateStringsArray,
  ...placeholderValues: readonly HtmlPlaceholderValue[]
): SafeHtml {
  let markup = '';
  for (const [index, literalPart] of literalParts.entries()) {
    markup += literalPart;
    const placeholderValue = placeholderValues[index];
    if (placeholderValue !== undefined) {
      markup += String(placeholderValue);
    }
  }
  return markAsSafeHtml(markup);
}

/** Markup that draws nothing; returned by renderers that have nothing to show. */
export const EMPTY_HTML: SafeHtml = html``;

/**
 * Joins pieces of markup into one.
 *
 * @param parts - The pieces, in the order they should appear.
 * @param separator - Markup to put between two neighbouring pieces; nothing by default.
 * @returns The joined markup.
 */
export function joinHtml(parts: readonly SafeHtml[], separator: SafeHtml = EMPTY_HTML): SafeHtml {
  return markAsSafeHtml(parts.join(separator));
}

/**
 * Replaces the content of an element with markup. The page uses this instead
 * of assigning to `innerHTML` directly, because `innerHTML` accepts any string
 * and this function only accepts {@link SafeHtml}.
 *
 * @param element - The element whose content is replaced.
 * @param content - The markup to show inside it.
 */
export function setInnerHtml(element: Element, content: SafeHtml): void {
  element.innerHTML = content;
}

/**
 * Writes a person's name in bold, escaped.
 *
 * @param name - The sender's name as the export wrote it.
 * @returns A `<b>` element as markup.
 */
export function renderBoldName(name: string): SafeHtml {
  return html`<b>${escapeHtml(name)}</b>`;
}
