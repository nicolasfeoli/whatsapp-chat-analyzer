// @vitest-environment jsdom

/**
 * Tests of the whole report, from the text of an invented export to the
 * elements on the page.
 *
 * The most important block here is the one on hostile text: a chat export is
 * untrusted input, and the page is drawn by assigning strings to `innerHTML`,
 * so every name, message and file name must arrive on the page as text.
 */

import { describe, expect, it } from 'vitest';

import { analyseChatExport } from '../../src/core/index';
import type { ChatAnalysis } from '../../src/core/index';
import { renderHeatmapTooltip } from '../../src/ui/charts/heatmap';
import { renderTimelineSvg, renderTimelineTooltip } from '../../src/ui/charts/timeline';
import { renderChatReport } from '../../src/ui/chat-report';
import { androidLine, exportText, iphoneLine, iphoneNotTypedLine } from '../fixtures/export-lines';
import { findElement, parseMarkup, tagNamesIn, textsOfElements } from '../fixtures/markup';

/** The width the timeline is drawn at in these tests. */
const TIMELINE_WIDTH_IN_PIXELS = 800;

/**
 * Every kind of element the report is built from. Anything else on the page
 * can only have come from the chat.
 */
const ELEMENTS_THE_REPORT_IS_BUILT_FROM: readonly string[] = [
  'b',
  'dd',
  'div',
  'dl',
  'dt',
  'h2',
  'h3',
  'i',
  'label',
  'li',
  'line',
  'ol',
  'option',
  'p',
  'path',
  'rect',
  'section',
  'select',
  'small',
  'span',
  'svg',
  'table',
  'tbody',
  'td',
  'text',
  'th',
  'thead',
  'tr',
  'ul',
];

/** Matches the name of an attribute that would run script, such as `onerror` or `onclick`. */
const EVENT_HANDLER_ATTRIBUTE_PATTERN = /^on/i;

/**
 * Analyses the text of an invented export and fails the test when no message
 * could be read.
 */
function analyseExport(rawText: string): ChatAnalysis {
  const result = analyseChatExport(rawText, null, 'en-GB');
  if (result.kind !== 'analysed') {
    throw new Error('The invented export could not be read');
  }
  return result.analysis;
}

/**
 * Puts everything the page would show for a chat into one container: the
 * report, the timeline drawn into its placeholder, and the tooltip of every
 * timeline bar and of one heatmap square.
 */
function renderWholePage(analysis: ChatAnalysis, title: string): HTMLDivElement {
  const report = renderChatReport(analysis, title);
  const page = parseMarkup(report.html);

  findElement(page, '#timeline').innerHTML = renderTimelineSvg(
    report.timeline,
    TIMELINE_WIDTH_IN_PIXELS,
  );

  const tooltips = document.createElement('div');
  report.timeline.buckets.forEach((_bucket, bucketIndex) => {
    tooltips.innerHTML += renderTimelineTooltip(report.timeline, bucketIndex);
  });
  tooltips.innerHTML += renderHeatmapTooltip({ weekdayIndex: 0, hour: 0, messageCount: 1 });
  page.append(tooltips);

  return page;
}

/**
 * Lists the name of every attribute, on any element, that would run script.
 */
function eventHandlerAttributesIn(container: ParentNode): string[] {
  const attributeNames: string[] = [];
  for (const element of container.querySelectorAll('*')) {
    for (const attributeName of element.getAttributeNames()) {
      if (EVENT_HANDLER_ATTRIBUTE_PATTERN.test(attributeName)) {
        attributeNames.push(attributeName);
      }
    }
  }
  return attributeNames;
}

/**
 * Writes ten alternating messages a minute apart, so both people have enough
 * replies and typed messages for every section and insight to appear.
 */
function writeConversation(firstSender: string, secondSender: string, text: string): string[] {
  const lines: string[] = [];
  for (let minute = 0; minute < 20; minute += 1) {
    const sender = minute % 2 === 0 ? firstSender : secondSender;
    const time = `10:${String(minute).padStart(2, '0')}:00`;
    lines.push(iphoneLine({ date: '13/01/2024', time, sender, text }));
  }
  return lines;
}

describe('renderChatReport', () => {
  describe('sections', () => {
    const analysis = analyseExport(exportText(writeConversation('Ana', 'Bob', 'see you later')));

    it('renders the sections in the order of the page', () => {
      const page = parseMarkup(renderChatReport(analysis, 'Ana and Bob').html);

      expect(textsOfElements(page, 'h2')).toEqual([
        'Ana and Bob',
        'What stands out',
        'Who says what',
        'Activity over time',
        'When the chat is alive',
        'Replies and openings',
        'Words and emojis',
        'One person up close',
        'From the record',
      ]);
    });

    it('starts with the heading and the headline numbers, outside any section', () => {
      const page = parseMarkup(renderChatReport(analysis, 'Ana and Bob').html);

      const outline = Array.from(page.children, (child) => child.className || child.tagName);

      expect(outline).toEqual([
        'chat-heading',
        'headline-statistics',
        'SECTION',
        'SECTION',
        'SECTION',
        'SECTION',
        'SECTION',
        'SECTION',
        'SECTION',
        'SECTION',
      ]);
    });

    it('leaves the timeline container empty and hands the data over for drawing', () => {
      const report = renderChatReport(analysis, 'Ana and Bob');

      expect(findElement(parseMarkup(report.html), '#timeline').childNodes).toHaveLength(0);
      expect(report.timeline.granularity).toBe('day');
      expect(report.timeline.series.map((series) => series.label)).toEqual(['Ana', 'Bob']);
      expect(report.timeline.buckets.map((bucket) => bucket.totalMessageCount)).toEqual([20]);
    });

    it('says in the timeline caption how long a bar is', () => {
      const page = parseMarkup(renderChatReport(analysis, 'Ana and Bob').html);

      expect(page.textContent).toContain('Messages per day, stacked by person.');
    });

    it('adds who answers whom and how conversations end for a group that spans two days', () => {
      const group = analyseExport(
        exportText([
          iphoneLine({ date: '13/01/2024', time: '10:00:00', sender: 'Ana', text: 'dinner?' }),
          iphoneLine({ date: '13/01/2024', time: '10:01:00', sender: 'Bob', text: 'yes' }),
          iphoneLine({ date: '13/01/2024', time: '10:02:00', sender: 'Carla', text: 'where?' }),
          iphoneLine({ date: '14/01/2024', time: '10:00:00', sender: 'Ana', text: 'morning' }),
        ]),
      );

      const headings = textsOfElements(parseMarkup(renderChatReport(group, 'Group').html), 'h2');

      expect(headings.slice(5, 9)).toEqual([
        'Replies and openings',
        'Who answers whom',
        'How conversations end',
        'Words and emojis',
      ]);
    });

    it('adds what gets sent after who says what when the export names its media', () => {
      const withStickers = analyseExport(
        exportText([
          iphoneLine({ date: '13/01/2024', time: '10:00:00', sender: 'Ana', text: 'look' }),
          iphoneNotTypedLine({
            date: '13/01/2024',
            time: '10:01:00',
            sender: 'Bob',
            text: 'sticker omitted',
          }),
        ]),
      );

      const headings = textsOfElements(
        parseMarkup(renderChatReport(withStickers, 'Two').html),
        'h2',
      );

      expect(headings.slice(2, 4)).toEqual(['Who says what', 'What gets sent']);
    });

    it('adds when each person writes after the heatmap once somebody wrote a hundred messages', () => {
      /* Two hundred messages a minute apart from 20:00 on, a hundred from each of Ana and Bob. */
      const lines = Array.from({ length: 200 }, (_unused, index): string => {
        const hour = 20 + Math.floor(index / 60);
        const time = `${String(hour)}:${String(index % 60).padStart(2, '0')}:00`;
        const sender = index % 2 === 0 ? 'Ana' : 'Bob';
        return iphoneLine({ date: '13/01/2024', time, sender, text: 'see you later' });
      });
      const page = parseMarkup(renderChatReport(analyseExport(exportText(lines)), 'Two').html);

      const headings = textsOfElements(page, 'h2');
      const heatmapPosition = headings.indexOf('When the chat is alive');

      expect(headings[heatmapPosition + 1]).toBe('When each person writes');
      /* 13 January 2024 is a Saturday; the first sixty messages fall in the hour from 20:00. */
      expect(textsOfElements(page, 'tbody td')).toContain('Mostly on Saturdays, around 20:00');
    });

    it('adds the most shared sites after words and emojis once the chat holds ten links', () => {
      const lines = Array.from({ length: 10 }, (_unused, index): string =>
        iphoneLine({
          date: '13/01/2024',
          time: `10:${String(index).padStart(2, '0')}:00`,
          sender: index % 2 === 0 ? 'Ana' : 'Bob',
          text: `look https://www.example.com/page-${String(index)}?from=ana`,
        }),
      );
      const page = parseMarkup(renderChatReport(analyseExport(exportText(lines)), 'Two').html);

      const headings = textsOfElements(page, 'h2');
      const wordsPosition = headings.indexOf('Words and emojis');

      expect(headings[wordsPosition + 1]).toBe('Most shared sites');
      /* The first and the longest message are quoted in full elsewhere; this section must not. */
      const sitesSection = Array.from(page.querySelectorAll('section')).find(
        (section) => section.querySelector('h2')?.textContent === 'Most shared sites',
      );
      expect(sitesSection?.innerHTML).toContain('example.com');
      expect(sitesSection?.innerHTML).not.toContain('page-');
      expect(sitesSection?.innerHTML).not.toContain('from=ana');
    });

    it('does not count the words of a media placeholder among the most used words', () => {
      const withStickers = analyseExport(
        exportText([
          iphoneLine({
            date: '13/01/2024',
            time: '10:00:00',
            sender: 'Ana',
            text: 'pizza tonight',
          }),
          iphoneNotTypedLine({
            date: '13/01/2024',
            time: '10:01:00',
            sender: 'Bob',
            text: 'sticker omitted',
          }),
          iphoneNotTypedLine({
            date: '13/01/2024',
            time: '10:02:00',
            sender: 'Bob',
            text: 'sticker omitted',
          }),
        ]),
      );

      expect([...withStickers.wordCounts.keys()]).toEqual(['pizza', 'tonight']);
    });

    it('adds then and now, who is still here, who mentions whom and the milestones for a long group chat with mentions', () => {
      const group = analyseExport(
        exportText([
          iphoneLine({ date: '13/01/2022', time: '10:00:00', sender: 'Ana', text: 'dinner?' }),
          iphoneLine({
            date: '13/01/2022',
            time: '10:01:00',
            sender: 'Bob',
            text: '@\u2068Carla\u2069 are you coming?',
          }),
          iphoneLine({ date: '13/01/2022', time: '10:02:00', sender: 'Carla', text: 'yes' }),
          iphoneLine({ date: '14/06/2024', time: '10:00:00', sender: 'Ana', text: 'morning' }),
        ]),
      );

      const headings = textsOfElements(parseMarkup(renderChatReport(group, 'Group').html), 'h2');

      expect(headings).toEqual([
        'Group',
        'What stands out',
        'Who says what',
        'Activity over time',
        'Then and now',
        'Who is still here',
        'When the chat is alive',
        'Replies and openings',
        'Who answers whom',
        'Who mentions whom',
        'How conversations end',
        'Words and emojis',
        'One person up close',
        'Milestones',
        'From the record',
      ]);
    });

    it('starts "One person up close" with the most active person unless told otherwise', () => {
      const page = parseMarkup(renderChatReport(analysis, 'Ana and Bob').html);
      const pageAboutBob = parseMarkup(
        renderChatReport(analysis, 'Ana and Bob', 'most-active', 1).html,
      );

      expect(textsOfElements(page, '.profile-name b')).toEqual(['Ana']);
      expect(textsOfElements(pageAboutBob, '.profile-name b')).toEqual(['Bob']);
    });

    it('leaves out who answers whom for a chat of two', () => {
      const page = parseMarkup(renderChatReport(analysis, 'Ana and Bob').html);

      expect(textsOfElements(page, 'h2')).not.toContain('Who answers whom');
    });

    it('leaves out "Replies and openings" for a chat with a single sender', () => {
      const monologue = analyseExport(androidLine({ sender: 'Ana', text: 'note to self' }));

      const page = parseMarkup(renderChatReport(monologue, 'Notes').html);

      expect(textsOfElements(page, 'h2')).not.toContain('Replies and openings');
      expect(textsOfElements(page, 'h2')).not.toContain('One person up close');
      expect(page.querySelectorAll('section')).toHaveLength(6);
    });
  });

  describe('a group of eight', () => {
    /** Each person sends one message fewer than the one before, so the order is certain. */
    const eightPeople = ['Ana', 'Bob', 'Carla', 'Dani', 'Eva', 'Fede', 'Gus', 'Hugo'];
    const lines = eightPeople.flatMap((sender, index) => {
      const messageCount = eightPeople.length - index;
      return Array.from({ length: messageCount }, (_unused, messageIndex) =>
        iphoneLine({
          date: '13/01/2024',
          time: `1${index}:0${messageIndex}:00`,
          sender,
          text: 'hello',
        }),
      );
    });
    const analysis = analyseExport(exportText(lines));
    const report = renderChatReport(analysis, 'Group');
    const page = parseMarkup(report.html);

    it('colours six people and counts the other two in the legend', () => {
      expect(textsOfElements(page, '.legend span')).toEqual([
        'Ana',
        'Bob',
        'Carla',
        'Dani',
        'Eva',
        'Fede',
        '2 others',
      ]);
    });

    it('stacks six people and "Others" in the timeline', () => {
      expect(report.timeline.series.map((series) => series.label)).toEqual([
        'Ana',
        'Bob',
        'Carla',
        'Dani',
        'Eva',
        'Fede',
        'Others',
      ]);
      expect(report.timeline.buckets[0]?.messageCountsBySeries).toEqual([8, 7, 6, 5, 4, 3, 3]);
    });

    it('names "Others" with its count in the tooltip of the timeline', () => {
      const tooltip = parseMarkup(renderTimelineTooltip(report.timeline, 0));

      expect(textsOfElements(tooltip, '.tooltip-row')).toContain('Others3');
      expect(textsOfElements(tooltip, '.tooltip-row')).toContain('Total36');
    });

    it('still lists all eight in the table of people', () => {
      expect(page.querySelectorAll('table:not(.person-grid) tbody tr')).toHaveLength(8);
    });

    it('gives all eight a row and a column in the grid of who answers whom', () => {
      expect(textsOfElements(page, 'h2')).toContain('Who answers whom');
      expect(page.querySelectorAll('.person-grid tbody tr')).toHaveLength(8);
      expect(page.querySelectorAll('.person-grid thead th')).toHaveLength(8);
    });
  });

  describe('hostile text in the export', () => {
    const hostileSender = '<img src=x onerror=alert(1)>';
    const quoteBreakingSender = 'Bob" onmouseover="alert(2)" x="';
    const hostileMessage =
      '<script>alert(3)</script> <svg onload=alert(4)> <a href="javascript:alert(5)">win a prize</a>';
    const hostileTitle = '"><iframe src="javascript:alert(6)"></iframe>';

    const rawText = exportText(
      writeConversation(hostileSender, quoteBreakingSender, hostileMessage),
    );
    const analysis = analyseExport(rawText);
    const page = renderWholePage(analysis, hostileTitle);

    it('is read as two senders and twenty typed messages, markup and all', () => {
      expect(analysis.people.map((person) => person.name)).toEqual([
        hostileSender,
        quoteBreakingSender,
      ]);
      expect(analysis.messages[0]?.text).toBe(hostileMessage);
    });

    it('creates no element other than the ones the report is built from', () => {
      const unexpectedTagNames = tagNamesIn(page).filter(
        (tagName) => !ELEMENTS_THE_REPORT_IS_BUILT_FROM.includes(tagName),
      );

      expect(unexpectedTagNames).toEqual([]);
    });

    it('creates no image, script, frame or link', () => {
      expect(page.querySelectorAll('img, script, iframe, a, object, embed')).toHaveLength(0);
    });

    it('creates only the one drawing of the timeline', () => {
      expect(page.querySelectorAll('svg')).toHaveLength(1);
      expect(findElement(page, 'svg').hasAttribute('onload')).toBe(false);
    });

    it('sets no attribute that would run script', () => {
      expect(eventHandlerAttributesIn(page)).toEqual([]);
    });

    it('shows the title as text', () => {
      expect(findElement(page, '.chat-heading h2').textContent).toBe(hostileTitle);
    });

    it('shows the senders as text wherever they are named', () => {
      expect(textsOfElements(page, '.legend span')).toEqual([hostileSender, quoteBreakingSender]);
      expect(textsOfElements(page, 'tbody td:first-child')).toEqual([
        hostileSender,
        quoteBreakingSender,
      ]);
      expect(textsOfElements(page, '.bubble .person-name')).toContain(hostileSender);
    });

    it('keeps a sender with quotes inside the title attribute of their bar', () => {
      const labelTitles = Array.from(
        page.querySelectorAll('.horizontal-bars .bar-label'),
        (label) => label.getAttribute('title'),
      );

      expect(labelTitles).toContain(quoteBreakingSender);
    });

    it('shows the message as text in its bubble', () => {
      expect(textsOfElements(page, '.bubble .bubble-text')).toContain(hostileMessage);
    });

    it('is caught by these checks when it is not escaped, which proves they can fail', () => {
      const unescapedPage = parseMarkup(`<div class="person-name">${hostileSender}</div>`);

      expect(unescapedPage.querySelectorAll('img')).toHaveLength(1);
      expect(eventHandlerAttributesIn(unescapedPage)).toEqual(['onerror']);
    });
  });
});
