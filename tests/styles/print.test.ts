// @vitest-environment jsdom

/**
 * Tests of the print styles in `main.css`. The simulated browser does not lay
 * a page out for paper, so these read the stylesheet as text: they pin what
 * the printout leaves out and that nothing it hides or resizes has been
 * renamed away. How the printout looks is checked by hand.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { analyseChatExport } from '../../src/core/index';
import { renderChatReport } from '../../src/ui/chat-report';
import { generateSampleChatText } from '../../src/ui/sample-chat';
import { renderWordSearchOutcome } from '../../src/ui/sections/word-search';
import { assignPersonColours } from '../../src/ui/person-colours';
import { parseMarkup } from '../fixtures/markup';
import { parseIndexHtml } from '../fixtures/page';

/** The stylesheet of the page. */
const STYLESHEET = readFileSync(
  join(import.meta.dirname, '..', '..', 'src', 'styles', 'main.css'),
  'utf8',
);

/** Where the print styles start; they are the last block of the stylesheet. */
const PRINT_BLOCK_START = '@media print {';

/** The print styles: everything from `@media print {` to the end of the file. */
const PRINT_STYLES = STYLESHEET.slice(STYLESHEET.indexOf(PRINT_BLOCK_START));

/** The light scheme: the first `:root` block that defines colours. */
const LIGHT_SCHEME = STYLESHEET.slice(
  STYLESHEET.indexOf('--bg:'),
  STYLESHEET.indexOf('@media (prefers-color-scheme: dark)'),
);

/**
 * Finds the rule of the print styles whose selector list holds a selector,
 * and returns its declarations.
 */
function printDeclarationsFor(selector: string): string {
  for (const rule of PRINT_STYLES.split('}')) {
    /* The first rule is preceded by the opening of the block itself. */
    const parts = rule.split('{');
    const declarations = parts.length > 1 ? parts.at(-1) : undefined;
    const selectors = (parts.at(-2) ?? '')
      .replace(/\/\*.*?\*\//gsu, '')
      .split(',')
      .map((candidate) => candidate.trim());
    if (selectors.includes(selector) && declarations !== undefined) {
      return declarations;
    }
  }
  throw new Error(`The print styles have no rule for "${selector}"`);
}

/** The report of the example chat, as the page first shows it. */
function renderExampleReport(): HTMLDivElement {
  const result = analyseChatExport(generateSampleChatText(), null, 'en-GB');
  if (result.kind !== 'analysed') {
    throw new Error('The example chat could not be analysed');
  }
  return parseMarkup(renderChatReport(result.analysis, 'Example').html);
}

describe('the print styles', () => {
  it('are one block at the end of the stylesheet', () => {
    expect(STYLESHEET.split(PRINT_BLOCK_START)).toHaveLength(2);
    expect(PRINT_STYLES.trimEnd().endsWith('}')).toBe(true);
  });

  it.each(['.page-header', '.loader', '#tooltip', '.profile-chooser', '.word-search-field'])(
    'leave %s out, which is for steering the page',
    (selector) => {
      expect(printDeclarationsFor(selector)).toContain('display: none');
    },
  );

  it('hide parts that exist: the page and the example report have every one of them', () => {
    const page = parseIndexHtml();
    const report = renderExampleReport();

    expect(page.querySelector('.page-header')).not.toBeNull();
    expect(page.querySelector('.loader')).not.toBeNull();
    expect(page.querySelector('#tooltip')).not.toBeNull();
    expect(report.querySelector('.profile-chooser')).not.toBeNull();
    expect(report.querySelector('.word-search-field')).not.toBeNull();
  });

  it('keep the loader, with both buttons in it, off the printout', () => {
    const loader = parseIndexHtml().querySelector('.loader');

    expect(loader?.querySelector('#print-button')).not.toBeNull();
    expect(loader?.querySelector('#save-summary-image-button')).not.toBeNull();
    expect(loader?.querySelector('#hide-names-checkbox')).not.toBeNull();
    expect(loader?.querySelector('#period-select')).not.toBeNull();
  });

  it('print "Look up a word" only when a word was looked up', () => {
    const result = analyseChatExport(generateSampleChatText(), null, 'en-GB');
    if (result.kind !== 'analysed') {
      throw new Error('The example chat could not be analysed');
    }
    const outcomeOf = (query: string): HTMLDivElement =>
      parseMarkup(
        renderWordSearchOutcome(
          query,
          result.analysis,
          result.analysis,
          assignPersonColours(result.analysis.people),
          'most-active',
        ),
      );

    expect(PRINT_STYLES).toContain(
      'section:has(.word-search-result):not(:has(.word-search-summary))',
    );
    /* The summary is what tells an outcome from the hint of an empty field. */
    expect(renderExampleReport().querySelector('.word-search-result')).not.toBeNull();
    expect(outcomeOf('').querySelector('.word-search-summary')).toBeNull();
    expect(outcomeOf('zzzz').querySelector('.word-search-summary')).not.toBeNull();
  });

  it('use the light colours whatever scheme the page is in, on a white page', () => {
    const colourRule = printDeclarationsFor(":root[data-theme='dark']");

    expect(printDeclarationsFor(":root:not([data-theme='light'])")).toBe(colourRule);
    expect(colourRule).toContain('color-scheme: light');
    expect(colourRule).toContain('--bg: #ffffff;');
    expect(colourRule).toContain('--surface: #ffffff;');
    expect(printDeclarationsFor('body')).toContain('background: #ffffff');
  });

  it.each(['--ink', '--accent', '--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--other'])(
    'print %s in the colour of the light scheme, so a person keeps their colour on paper',
    (customProperty) => {
      const lightColour = new RegExp(`${customProperty}: (#[0-9a-f]{6});`, 'u').exec(LIGHT_SCHEME);
      const printColour = new RegExp(`${customProperty}: (#[0-9a-f]{6});`, 'u').exec(PRINT_STYLES);

      expect(lightColour).not.toBeNull();
      expect(printColour?.[1]).toBe(lightColour?.[1]);
    },
  );

  it('ask for backgrounds to be printed, which is what the bars and squares are', () => {
    expect(printDeclarationsFor('body')).toContain('print-color-adjust: exact');
  });

  it.each(['section', 'tr', 'li', '.bubble', '.calendar-year'])(
    'keep %s in one piece where it fits on a page',
    (selector) => {
      expect(printDeclarationsFor(selector)).toContain('break-inside: avoid');
    },
  );

  it('keep a heading with what it heads, and repeat the head of a table on each page', () => {
    expect(printDeclarationsFor('h2')).toContain('break-after: avoid');
    expect(printDeclarationsFor('thead')).toContain('display: table-header-group');
  });

  it('let nothing scroll: wide tables, the calendar and a long message are printed whole', () => {
    expect(printDeclarationsFor('.table-wrapper')).toContain('overflow: visible');
    expect(printDeclarationsFor('.calendar-scroll')).toContain('overflow: visible');
    expect(printDeclarationsFor('.bubble .bubble-text')).toContain('max-height: none');
  });

  it('make the grid of people as wide as the page and no wider', () => {
    const gridRule = printDeclarationsFor('.person-grid');

    expect(gridRule).toContain('width: 100%');
    expect(gridRule).toContain('table-layout: fixed');
  });

  it('never write out the address behind a link', () => {
    expect(STYLESHEET).not.toContain('attr(href');
    expect(printDeclarationsFor('a::after')).toContain('content: none');
  });

  it('put no address into the report in the first place: the report has no link', () => {
    expect(renderExampleReport().querySelectorAll('a, [href]')).toHaveLength(0);
  });
});
