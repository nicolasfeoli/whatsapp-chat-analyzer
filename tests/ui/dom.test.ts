// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { findPageElements, getRequiredElement } from '../../src/ui/dom';
import { loadIndexHtmlBody, parseIndexHtml } from '../fixtures/page';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('getRequiredElement', () => {
  it('returns the element with the id', () => {
    document.body.innerHTML = '<button id="choose-file-button">Choose</button>';

    const button = getRequiredElement('choose-file-button', HTMLButtonElement);

    expect(button.textContent).toBe('Choose');
  });

  it('accepts any element when asked for the general kind', () => {
    document.body.innerHTML = '<span id="status-line"></span>';

    expect(getRequiredElement('status-line', HTMLElement).tagName).toBe('SPAN');
  });

  it('names the missing id when no element has it', () => {
    expect(() => getRequiredElement('choose-file-button', HTMLButtonElement)).toThrow(
      'index.html has no element with id "choose-file-button" of type HTMLButtonElement.',
    );
  });

  it('refuses an element of another kind', () => {
    document.body.innerHTML = '<div id="choose-file-button"></div>';

    expect(() => getRequiredElement('choose-file-button', HTMLButtonElement)).toThrow(
      'index.html has no element with id "choose-file-button" of type HTMLButtonElement.',
    );
  });
});

describe('findPageElements', () => {
  it('finds every element the page script needs in index.html', () => {
    loadIndexHtmlBody();

    const pageElements = findPageElements();

    expect(pageElements.loader.id).toBe('loader');
    expect(pageElements.chooseFileButton.id).toBe('choose-file-button');
    expect(pageElements.fileInput.type).toBe('file');
    expect(pageElements.statusLine.id).toBe('status-line');
    expect(pageElements.parseReport.id).toBe('parse-report');
    expect(pageElements.sampleNote.id).toBe('sample-note');
    expect(pageElements.dateOrderRow.id).toBe('date-order-row');
    expect(pageElements.dateOrderMessage.id).toBe('date-order-message');
    expect(pageElements.switchDateOrderButton.id).toBe('switch-date-order-button');
    expect(pageElements.hideNamesCheckbox.type).toBe('checkbox');
    expect(pageElements.showEveryoneRow.id).toBe('show-everyone-row');
    expect(pageElements.showEveryoneCheckbox.type).toBe('checkbox');
    expect(pageElements.periodRow.id).toBe('period-row');
    expect(pageElements.periodSelect.id).toBe('period-select');
    expect(pageElements.periodFromInput.type).toBe('date');
    expect(pageElements.periodToInput.type).toBe('date');
    expect(pageElements.periodNote.id).toBe('period-note');
    expect(pageElements.saveSummaryImageButton.id).toBe('save-summary-image-button');
    expect(pageElements.reportContainer.id).toBe('report');
    expect(pageElements.tooltip.id).toBe('tooltip');
  });

  it('fails by name when the page lacks one of them', () => {
    loadIndexHtmlBody();
    document.getElementById('switch-date-order-button')?.remove();

    expect(() => findPageElements()).toThrow('with id "switch-date-order-button"');
  });
});

describe('index.html', () => {
  const parsedPage = parseIndexHtml();

  /**
   * Reads the directives of the page's Content-Security-Policy, by name.
   */
  function readContentSecurityPolicy(): Map<string, string> {
    const policy =
      parsedPage
        .querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.getAttribute('content') ?? '';
    const directives = new Map<string, string>();
    for (const directive of policy.split(';')) {
      const [name = '', ...values] = directive.trim().split(/\s+/);
      directives.set(name, values.join(' '));
    }
    return directives;
  }

  it('forbids the page from opening any connection', () => {
    expect(readContentSecurityPolicy().get('connect-src')).toBe("'none'");
  });

  it('loads nothing by default, and scripts and workers only from its own origin', () => {
    const directives = readContentSecurityPolicy();

    expect(directives.get('default-src')).toBe("'none'");
    expect(directives.get('script-src')).toBe("'self'");
    expect(directives.get('worker-src')).toBe("'self'");
  });

  it('has no inline script, which the policy would block', () => {
    const scripts = Array.from(parsedPage.querySelectorAll('script'));

    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.getAttribute('src')).toBe('/src/ui/main.ts');
    expect(scripts[0]?.textContent).toBe('');
  });

  it('starts with the status line, the parse report and the date-order row hidden', () => {
    expect(parsedPage.getElementById('status-line')?.hidden).toBe(true);
    expect(parsedPage.getElementById('parse-report')?.hidden).toBe(true);
    expect(parsedPage.getElementById('date-order-row')?.hidden).toBe(true);
    expect(parsedPage.getElementById('tooltip')?.hidden).toBe(true);
  });
});
