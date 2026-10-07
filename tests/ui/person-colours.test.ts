import { describe, expect, it } from 'vitest';

import {
  COLOURED_PEOPLE_LIMIT,
  OTHER_PEOPLE_COLOUR,
  assignPersonColours,
  colourOfPerson,
  renderColourSwatch,
  renderSwatchAndName,
  selectColouredPeople,
} from '../../src/ui/person-colours';
import { personStatistics } from '../fixtures/analysis-builders';

/** Eight invented participants, already in order of activity. */
const EIGHT_PEOPLE = ['Ana', 'Bob', 'Carla', 'Dani', 'Eva', 'Fede', 'Gus', 'Hugo'].map((name) =>
  personStatistics({ name }),
);

describe('selectColouredPeople', () => {
  it('keeps the first six people, in order', () => {
    const names = selectColouredPeople(EIGHT_PEOPLE).map((person) => person.name);

    expect(names).toEqual(['Ana', 'Bob', 'Carla', 'Dani', 'Eva', 'Fede']);
    expect(names).toHaveLength(COLOURED_PEOPLE_LIMIT);
  });

  it('keeps everybody in a chat of fewer than six', () => {
    expect(selectColouredPeople(EIGHT_PEOPLE.slice(0, 2))).toHaveLength(2);
  });
});

describe('assignPersonColours', () => {
  it('gives the first person the first series colour, the second the second, and so on', () => {
    const personColours = assignPersonColours(EIGHT_PEOPLE.slice(0, 3));

    expect([...personColours.entries()]).toEqual([
      ['Ana', 'var(--s1)'],
      ['Bob', 'var(--s2)'],
      ['Carla', 'var(--s3)'],
    ]);
  });

  it('colours six people at most', () => {
    const personColours = assignPersonColours(EIGHT_PEOPLE);

    expect(COLOURED_PEOPLE_LIMIT).toBe(6);
    expect([...personColours.keys()]).toEqual(['Ana', 'Bob', 'Carla', 'Dani', 'Eva', 'Fede']);
    expect(personColours.get('Fede')).toBe('var(--s6)');
  });

  it('assigns nothing for a chat without people', () => {
    expect(assignPersonColours([]).size).toBe(0);
  });
});

describe('colourOfPerson', () => {
  const personColours = assignPersonColours(EIGHT_PEOPLE);

  it('returns the series colour of a coloured person', () => {
    expect(colourOfPerson(personColours, 'Bob')).toBe('var(--s2)');
  });

  it('returns the muted colour for the seventh person', () => {
    expect(colourOfPerson(personColours, 'Gus')).toBe(OTHER_PEOPLE_COLOUR);
  });

  it('returns the muted colour for a name that is not in the chat', () => {
    expect(colourOfPerson(personColours, 'Nobody')).toBe('var(--other)');
  });
});

describe('renderColourSwatch', () => {
  it('draws an empty element whose background is the colour', () => {
    expect(renderColourSwatch('var(--s1)')).toBe(
      '<i class="colour-swatch" style="background:var(--s1)"></i>',
    );
  });

  it('escapes a colour that tries to leave the style attribute', () => {
    const swatchHtml = renderColourSwatch('red" onclick="alert(1)');

    expect(swatchHtml).toBe(
      '<i class="colour-swatch" style="background:red&quot; onclick=&quot;alert(1)"></i>',
    );
  });
});

describe('renderSwatchAndName', () => {
  const personColours = assignPersonColours(EIGHT_PEOPLE);

  it('draws the swatch of the person followed by their name', () => {
    expect(renderSwatchAndName(personColours, 'Ana')).toBe(
      '<i class="colour-swatch" style="background:var(--s1)"></i>Ana',
    );
  });

  it('uses the muted swatch for a person without a colour', () => {
    expect(renderSwatchAndName(personColours, 'Hugo')).toBe(
      '<i class="colour-swatch" style="background:var(--other)"></i>Hugo',
    );
  });

  it('escapes the name', () => {
    expect(renderSwatchAndName(personColours, '<i>Zed</i>')).toContain('&lt;i&gt;Zed&lt;/i&gt;');
  });
});
