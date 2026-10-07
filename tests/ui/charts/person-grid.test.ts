// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import {
  hasAnyCountBetweenPeople,
  renderPersonGrid,
  renderPersonGridOfCells,
} from '../../../src/ui/charts/person-grid';
import type { CellBetweenPeople, CountBetweenPeople } from '../../../src/ui/charts/person-grid';
import { assignPersonColours } from '../../../src/ui/person-colours';
import { personStatistics } from '../../fixtures/analysis-builders';
import { findElement, parseMarkup, textsOfElements } from '../../fixtures/markup';

const ana = personStatistics({ name: 'Ana', messageCount: 3 });
const bob = personStatistics({ name: 'Bob', messageCount: 2 });
const carla = personStatistics({ name: 'Carla', messageCount: 1 });
const people = [ana, bob, carla];

/** The counts of the grid in these tests, by row and column name. */
const COUNTS: Readonly<Record<string, number>> = {
  'Ana>Bob': 1200,
  'Ana>Carla': 300,
  'Bob>Ana': 20,
  'Bob>Carla': 5,
  'Carla>Ana': 7,
  /* On the diagonal: never asked for, and never shown. */
  'Ana>Ana': 999,
};

const countBetween: CountBetweenPeople = (rowPerson, columnPerson) =>
  COUNTS[`${rowPerson.name}>${columnPerson.name}`] ?? 0;

const nobodyCounts: CountBetweenPeople = () => 0;

/**
 * Renders the grid of the three friends and parses it.
 */
function renderGrid(): HTMLDivElement {
  return parseMarkup(renderPersonGrid(people, countBetween, assignPersonColours(people)));
}

/**
 * Reads the inline style of every cell of one row, in column order.
 */
function cellStylesOfRow(grid: ParentNode, rowIndex: number): (string | null)[] {
  const row = grid.querySelectorAll('tbody tr')[rowIndex];
  if (row === undefined) {
    throw new Error(`The grid has no row ${rowIndex}`);
  }
  return Array.from(row.querySelectorAll('td'), (cell) => cell.getAttribute('style'));
}

describe('hasAnyCountBetweenPeople', () => {
  it('is true when at least one cell off the diagonal holds a count', () => {
    expect(hasAnyCountBetweenPeople(people, countBetween)).toBe(true);
  });

  it('is false when every cell is zero', () => {
    expect(hasAnyCountBetweenPeople(people, nobodyCounts)).toBe(false);
  });

  it('does not take a count on the diagonal for a reason to draw the grid', () => {
    const onlyOwnCounts: CountBetweenPeople = (rowPerson, columnPerson) =>
      rowPerson === columnPerson ? 5 : 0;

    expect(hasAnyCountBetweenPeople(people, onlyOwnCounts)).toBe(false);
  });

  it('is false without people', () => {
    expect(hasAnyCountBetweenPeople([], countBetween)).toBe(false);
  });
});

describe('renderPersonGrid', () => {
  it('has a column and a row for each person, in the order given', () => {
    const grid = renderGrid();

    expect(textsOfElements(grid, 'thead th')).toEqual(['Ana', 'Bob', 'Carla']);
    expect(textsOfElements(grid, 'tbody th')).toEqual(['Ana', 'Bob', 'Carla']);
  });

  it('writes the count of each pair and a dot on the diagonal', () => {
    const rows = Array.from(renderGrid().querySelectorAll('tbody tr'), (row) =>
      textsOfElements(row, 'td'),
    );

    expect(rows).toEqual([
      ['·', '1,200', '300'],
      ['20', '·', '5'],
      ['7', '0', '·'],
    ]);
  });

  it('marks the headings as row and column headings for screen readers', () => {
    const grid = renderGrid();
    const scopesOf = (selector: string): (string | null)[] =>
      Array.from(grid.querySelectorAll(selector), (heading) => heading.getAttribute('scope'));

    expect(scopesOf('thead th')).toEqual(['col', 'col', 'col']);
    expect(scopesOf('tbody th')).toEqual(['row', 'row', 'row']);
  });

  it('tints each row against its own highest count', () => {
    const grid = renderGrid();

    expect(cellStylesOfRow(grid, 0)).toEqual([
      null,
      'background:color-mix(in oklab,var(--accent) 40%,transparent)',
      'background:color-mix(in oklab,var(--accent) 15%,transparent)',
    ]);
    expect(cellStylesOfRow(grid, 2)).toEqual([
      'background:color-mix(in oklab,var(--accent) 40%,transparent)',
      null,
      null,
    ]);
  });

  it('is wrapped so that it scrolls sideways on a narrow screen', () => {
    const grid = renderGrid();

    expect(findElement(grid, 'table').className).toBe('person-grid');
    expect(findElement(grid, 'table').parentElement?.className).toBe('table-wrapper');
  });

  it('draws a grid of dots and zeros when nobody has a count', () => {
    const grid = parseMarkup(renderPersonGrid(people, nobodyCounts, assignPersonColours(people)));

    expect(textsOfElements(grid, 'tbody td')).toEqual([
      '·',
      '0',
      '0',
      '0',
      '·',
      '0',
      '0',
      '0',
      '·',
    ]);
    expect(grid.querySelectorAll('td[style]')).toHaveLength(0);
  });
});

describe('renderPersonGridOfCells', () => {
  /** Ana's cells carry a text that is not their weight; everybody else's are empty. */
  const cellBetween: CellBetweenPeople = (rowPerson, columnPerson) => {
    if (rowPerson !== ana) {
      return { text: '–', weight: 0 };
    }
    if (columnPerson === bob) {
      return { text: '45 s', weight: 4, title: 'Median of 12 replies' };
    }
    return { text: '2 h <b>', weight: 1, title: 'Median of "5" replies' };
  };

  /**
   * Renders the grid of the three friends with those cells and parses it.
   */
  function renderGridOfCells(): HTMLDivElement {
    return parseMarkup(renderPersonGridOfCells(people, cellBetween, assignPersonColours(people)));
  }

  it('writes the text of each cell as it is given, and a dot on the diagonal', () => {
    const rows = Array.from(renderGridOfCells().querySelectorAll('tbody tr'), (row) =>
      textsOfElements(row, 'td'),
    );

    expect(rows).toEqual([
      ['·', '45 s', '2 h <b>'],
      ['–', '·', '–'],
      ['–', '–', '·'],
    ]);
  });

  it('tints each cell by its weight against the largest weight of the row', () => {
    /* 6 + 34 × 4/4 = 40 for the heaviest cell, and 6 + 34 × 1/4 = 14.5, written as 15. */
    expect(cellStylesOfRow(renderGridOfCells(), 0)).toEqual([
      null,
      'background:color-mix(in oklab,var(--accent) 40%,transparent)',
      'background:color-mix(in oklab,var(--accent) 15%,transparent)',
    ]);
  });

  it('leaves a cell without weight untinted', () => {
    expect(cellStylesOfRow(renderGridOfCells(), 1)).toEqual([null, null, null]);
  });

  it('gives a cell its title, and none to a cell that has none', () => {
    const grid = renderGridOfCells();
    const titles = Array.from(grid.querySelectorAll('tbody td'), (cell) =>
      cell.getAttribute('title'),
    );

    expect(titles.slice(0, 3)).toEqual([null, 'Median of 12 replies', 'Median of "5" replies']);
    expect(titles.slice(3)).toEqual([null, null, null, null, null, null]);
  });

  it('has the same headings as the grid of counts', () => {
    const grid = renderGridOfCells();

    expect(textsOfElements(grid, 'thead th')).toEqual(['Ana', 'Bob', 'Carla']);
    expect(textsOfElements(grid, 'tbody th')).toEqual(['Ana', 'Bob', 'Carla']);
    expect(grid.querySelectorAll('b')).toHaveLength(0);
  });
});
