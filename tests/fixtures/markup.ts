/**
 * Helpers for inspecting the HTML strings the page builds. They need a
 * document, so the test files that use them run in the jsdom environment.
 */

/**
 * Parses markup the way the page does: by assigning it to `innerHTML`.
 *
 * @param html - An HTML string produced by a renderer.
 * @returns A detached `<div>` holding the parsed elements.
 */
export function parseMarkup(html: string): HTMLDivElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

/**
 * Finds the one element a selector must match and fails the test otherwise,
 * so the test does not need to handle `null`.
 *
 * @param container - Where to look.
 * @param selector - A CSS selector.
 * @returns The first matching element.
 * @throws Error when nothing matches.
 */
export function findElement(container: ParentNode, selector: string): Element {
  const element = container.querySelector(selector);
  if (element === null) {
    throw new Error(`Nothing matches "${selector}"`);
  }
  return element;
}

/**
 * Lists the text of every element a selector matches, in document order.
 *
 * @param container - Where to look.
 * @param selector - A CSS selector.
 * @returns The text content of each match.
 */
export function textsOfElements(container: ParentNode, selector: string): string[] {
  return Array.from(container.querySelectorAll(selector), (element) => element.textContent);
}

/**
 * Lists the tag names of every element inside a container, in document order
 * and without repeats, to state which kinds of element some markup created.
 *
 * @param container - Where to look.
 * @returns Lower-case tag names, each once.
 */
export function tagNamesIn(container: ParentNode): string[] {
  const tagNames = new Set<string>();
  for (const element of container.querySelectorAll('*')) {
    tagNames.add(element.tagName.toLowerCase());
  }
  return [...tagNames];
}
