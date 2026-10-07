// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { assignPersonColours } from '../../../src/ui/person-colours';
import type { PeopleShown } from '../../../src/ui/sections/featured-people';
import {
  MINIMUM_LINKS_FOR_SHARED_SITES,
  MOST_SHARED_SITES_LIMIT,
  countLinksToSites,
  findTopSite,
  hasSharedSitesWorthShowing,
  renderSharedSitesSection,
} from '../../../src/ui/sections/shared-sites';
import type { ChatAnalysis } from '../../../src/core/types';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { findElement, parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis, peopleShown?: PeopleShown): HTMLDivElement {
  return parseMarkup(
    renderSharedSitesSection(analysis, assignPersonColours(analysis.people), peopleShown),
  );
}

/**
 * Reads the body of the table as rows of cell texts.
 */
function readTableRows(section: ParentNode): string[][] {
  return Array.from(section.querySelectorAll('tbody tr'), (row) => textsOfElements(row, 'td'));
}

/**
 * A chat of forty links to three sites. Ana shared most of them; Carla
 * shared none.
 */
const anaBobAndCarla = chatAnalysis({
  linkSiteCounts: new Map([
    ['videos.example', 10],
    ['news.example', 24],
    ['maps.example', 6],
  ]),
  people: [
    personStatistics({
      name: 'Ana',
      messageCount: 300,
      linkSiteCounts: new Map([
        ['videos.example', 6],
        ['news.example', 20],
      ]),
    }),
    personStatistics({
      name: 'Bob',
      messageCount: 200,
      linkSiteCounts: new Map([
        ['videos.example', 4],
        ['news.example', 4],
        ['maps.example', 6],
      ]),
    }),
    personStatistics({ name: 'Carla', messageCount: 100 }),
  ],
});

/**
 * Builds a chat of two people in which one site was linked to a number of times.
 */
function chatWithLinkCount(linkCount: number): ChatAnalysis {
  return chatAnalysis({
    linkSiteCounts: new Map([['news.example', linkCount]]),
    people: [
      personStatistics({
        name: 'Ana',
        messageCount: 50,
        linkSiteCounts: new Map([['news.example', linkCount]]),
      }),
      personStatistics({ name: 'Bob', messageCount: 40 }),
    ],
  });
}

describe('countLinksToSites', () => {
  it('adds up the links of every site', () => {
    expect(countLinksToSites(anaBobAndCarla.linkSiteCounts)).toBe(40);
  });

  it('is zero for a chat without links', () => {
    expect(countLinksToSites(new Map())).toBe(0);
  });
});

describe('hasSharedSitesWorthShowing', () => {
  it('is true from ten links to a site', () => {
    expect(hasSharedSitesWorthShowing(chatWithLinkCount(MINIMUM_LINKS_FOR_SHARED_SITES))).toBe(
      true,
    );
  });

  it('is false for nine', () => {
    expect(hasSharedSitesWorthShowing(chatWithLinkCount(MINIMUM_LINKS_FOR_SHARED_SITES - 1))).toBe(
      false,
    );
  });

  it('counts links, not sites: ten sites linked to once each are enough', () => {
    const linkSiteCounts = new Map(
      Array.from({ length: 10 }, (_unused, index): [string, number] => [
        `site${String(index)}.example`,
        1,
      ]),
    );

    expect(hasSharedSitesWorthShowing(chatAnalysis({ linkSiteCounts }))).toBe(true);
  });
});

describe('findTopSite', () => {
  it('finds the site a person links to most', () => {
    const [ana] = anaBobAndCarla.people;

    expect(ana === undefined ? null : findTopSite(ana)).toEqual({ key: 'news.example', count: 20 });
  });

  it('lets the site shared first win a tie', () => {
    const person = personStatistics({
      name: 'Dani',
      linkSiteCounts: new Map([
        ['videos.example', 4],
        ['news.example', 4],
      ]),
    });

    expect(findTopSite(person)?.key).toBe('videos.example');
  });

  it('finds none for somebody who shared no link', () => {
    expect(findTopSite(personStatistics({ name: 'Carla' }))).toBeNull();
  });
});

describe('renderSharedSitesSection', () => {
  it('is left out of a chat with fewer than ten links to a site', () => {
    expect(renderSharedSitesSection(chatWithLinkCount(9), new Map())).toBe('');
  });

  it('is left out of a chat without links', () => {
    expect(renderSharedSitesSection(chatAnalysis(), new Map())).toBe('');
  });

  it('is headed "Most shared sites" and says that only the site is read', () => {
    const section = renderSection(anaBobAndCarla);

    expect(textsOfElements(section, '.section-heading h2')).toEqual(['Most shared sites']);
    expect(textsOfElements(section, '.section-heading p')).toEqual([
      'Where the links in the chat lead. Only the name of the site is read, never the rest of a link.',
    ]);
  });

  describe('the chart', () => {
    it('draws a bar per site, the most linked first, with its count and its share of the links', () => {
      const section = renderSection(anaBobAndCarla);

      expect(textsOfElements(section, '.horizontal-bars .bar-label')).toEqual([
        'news.example',
        'videos.example',
        'maps.example',
      ]);
      /* 24, 10 and 6 of 40 links. */
      expect(textsOfElements(section, '.horizontal-bars .bar-value')).toEqual([
        '24  60%',
        '10  25%',
        '6  15%',
      ]);
    });

    it('scales the bars against the most linked site, in the neutral colour', () => {
      const bars = renderSection(anaBobAndCarla).querySelectorAll('.horizontal-bars .bar');

      expect(Array.from(bars, (bar) => bar.getAttribute('style'))).toEqual([
        'width:100.0%;background:var(--neutral-bar)',
        'width:41.7%;background:var(--neutral-bar)',
        'width:25.0%;background:var(--neutral-bar)',
      ]);
    });

    it('stops at ten sites but measures shares against all the links', () => {
      /* Twelve sites: the first linked to 20 times, the others once each; 31 links in all. */
      const linkSiteCounts = new Map<string, number>([['news.example', 20]]);
      for (let index = 1; index <= 11; index += 1) {
        linkSiteCounts.set(`site${String(index)}.example`, 1);
      }
      const section = renderSection(chatAnalysis({ linkSiteCounts }));

      expect(textsOfElements(section, '.horizontal-bars .bar-label')).toHaveLength(
        MOST_SHARED_SITES_LIMIT,
      );
      expect(textsOfElements(section, '.horizontal-bars .bar-value')[0]).toBe('20  65%');
      expect(textsOfElements(section, '.horizontal-bars .bar-label')).not.toContain(
        'site11.example',
      );
    });

    it('says how many links and sites there are, and what was done to the hosts', () => {
      const [explanation] = textsOfElements(renderSection(anaBobAndCarla), 'p.hint');

      expect(explanation).toBe(
        '40 links to 3 sites. "www." and "m." are taken off and other subdomains are folded into their site; links to a bare address are left out.',
      );
    });

    it('writes a single site in the singular', () => {
      const [explanation] = textsOfElements(renderSection(chatWithLinkCount(10)), 'p.hint');

      expect(explanation).toContain('10 links to 1 site.');
    });
  });

  describe('the table of people', () => {
    it('is headed "Each person’s top site" and names its columns', () => {
      const section = renderSection(anaBobAndCarla);

      expect(textsOfElements(section, 'h3')).toEqual(['Each person’s top site']);
      expect(textsOfElements(section, 'thead th')).toEqual([
        'Person',
        'Top site',
        'Links to it',
        'Links to any site',
      ]);
    });

    it('lists each person with their top site, the links to it and all their links', () => {
      expect(readTableRows(renderSection(anaBobAndCarla))).toEqual([
        ['Ana', 'news.example', '20', '26'],
        ['Bob', 'maps.example', '6', '14'],
        ['Carla', '–', '–', '0'],
      ]);
    });

    it('precedes each name with a swatch in the colour of the person', () => {
      const firstCell = findElement(renderSection(anaBobAndCarla), 'tbody tr:nth-child(2) td');

      expect(firstCell.innerHTML).toBe(
        '<i class="colour-swatch" style="background:var(--s2)"></i>Bob',
      );
    });

    it('is left out of a chat with a single sender, whose top site is the first bar', () => {
      const analysis = chatAnalysis({
        linkSiteCounts: new Map([['news.example', 12]]),
        people: [
          personStatistics({
            name: 'Ana',
            messageCount: 50,
            linkSiteCounts: new Map([['news.example', 12]]),
          }),
        ],
      });
      const section = renderSection(analysis);

      expect(textsOfElements(section, '.horizontal-bars .bar-label')).toEqual(['news.example']);
      expect(section.querySelectorAll('table')).toHaveLength(0);
      expect(section.querySelectorAll('h3')).toHaveLength(0);
    });
  });

  describe('a large group', () => {
    const tenPeople = Array.from({ length: 10 }, (_unused, index) =>
      personStatistics({
        name: `Person ${index + 1}`,
        messageCount: 100 - index,
        linkSiteCounts: new Map([['news.example', 2]]),
      }),
    );
    const largeGroup = chatAnalysis({
      people: tenPeople,
      linkSiteCounts: new Map([['news.example', 20]]),
    });

    it('lists the eight most active and says so, while the chart counts everybody', () => {
      const section = renderSection(largeGroup);

      expect(readTableRows(section)).toHaveLength(8);
      expect(textsOfElements(section, '.people-shown-note')).toEqual([
        'Showing the 8 most active of 10 people.',
      ]);
      expect(textsOfElements(section, '.horizontal-bars .bar-value')).toEqual(['20  100%']);
    });

    it('lists everyone when asked to', () => {
      const section = renderSection(largeGroup, 'everyone');

      expect(readTableRows(section)).toHaveLength(10);
      expect(textsOfElements(section, '.people-shown-note')).toEqual([]);
    });
  });

  it('writes a site and a name that are markup as text', () => {
    /* No site the analysis finds contains markup, but the section accepts any table of counts. */
    const hostileSite = '<img src=x onerror=alert(1)>.example';
    const hostileName = '<u onclick=alert(1)>x</u>';
    const analysis = chatAnalysis({
      linkSiteCounts: new Map([[hostileSite, 10]]),
      people: [
        personStatistics({
          name: hostileName,
          messageCount: 5,
          linkSiteCounts: new Map([[hostileSite, 10]]),
        }),
        personStatistics({ name: 'Bob', messageCount: 4 }),
      ],
    });

    const section = renderSection(analysis);

    expect(section.querySelectorAll('img, u')).toHaveLength(0);
    expect(textsOfElements(section, '.horizontal-bars .bar-label')).toEqual([hostileSite]);
    expect(readTableRows(section)[0]).toEqual([hostileName, hostileSite, '10', '10']);
    expect(tagNamesIn(section)).toEqual([
      'section',
      'div',
      'h2',
      'p',
      'h3',
      'table',
      'thead',
      'tr',
      'th',
      'tbody',
      'td',
      'i',
    ]);
  });
});
