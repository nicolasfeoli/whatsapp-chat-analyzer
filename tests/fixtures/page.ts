/**
 * Access to the real `index.html`, for the tests that check the page and its
 * script against each other. They need a document, so the test files that use
 * these helpers run in the jsdom environment.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Where `index.html` lives, seen from this folder. */
const INDEX_HTML_PATH = join(import.meta.dirname, '..', '..', 'index.html');

/**
 * Reads `index.html` and parses it into a document of its own.
 *
 * @returns The parsed page. Its scripts have not run.
 */
export function parseIndexHtml(): Document {
  const indexHtml = readFileSync(INDEX_HTML_PATH, 'utf8');
  return new DOMParser().parseFromString(indexHtml, 'text/html');
}

/**
 * Replaces the body of the test document with that of `index.html`. Assigning
 * to `innerHTML` does not run the page's script, so the test decides when the
 * script starts.
 */
export function loadIndexHtmlBody(): void {
  document.body.innerHTML = parseIndexHtml().body.innerHTML;
}
