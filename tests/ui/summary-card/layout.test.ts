import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { SummaryCardContent } from '../../../src/ui/summary-card/content';
import {
  BODY_FONT_FAMILY,
  DISPLAY_FONT_FAMILY,
  FOOTER_PROMISE,
  FOOTER_SOURCE,
  MONOSPACE_FONT_FAMILY,
  MOST_ACTIVE_HEADING,
  SUMMARY_CARD_COLOURS,
  SUMMARY_CARD_FONTS,
  SUMMARY_CARD_HEIGHT,
  SUMMARY_CARD_SERIES_COLOURS,
  SUMMARY_CARD_WIDTH,
  barWidthOf,
  cardFont,
  describeOtherPeople,
  layOutSummaryCard,
  listFontRequests,
} from '../../../src/ui/summary-card/layout';
import type {
  DrawInstruction,
  RectangleInstruction,
  TextInstruction,
} from '../../../src/ui/summary-card/layout';
import { measureInInventedFont } from '../../fixtures/summary-image';

/** The stylesheet of the page, whose light colours and font stacks the image repeats. */
const STYLESHEET = readFileSync(
  join(import.meta.dirname, '..', '..', '..', 'src', 'styles', 'main.css'),
  'utf8',
);

/** The x coordinates between which the content of the image lies: a margin of 80 pixels. */
const CONTENT_LEFT = 80;
const CONTENT_RIGHT = 1000;

/** The width of the bar of the most active person. */
const FULL_BAR_WIDTH = 380;

/**
 * Builds the content of an image. Unless stated otherwise it is a chat of Ana
 * and Bob with one fact and nothing else.
 */
function cardContent(parts: Partial<SummaryCardContent> = {}): SummaryCardContent {
  return {
    title: 'Ana and Bob',
    period: '13 Jan 2024 to 2 Mar 2024 · 50 days',
    messageCount: '1,500',
    messageNoun: 'messages',
    people: [
      { name: 'Ana', messageCount: 1200, countAndShare: '1,200 · 80%' },
      { name: 'Bob', messageCount: 300, countAndShare: '300 · 20%' },
    ],
    otherPeopleCount: 0,
    facts: [{ label: 'Busiest day', value: '14 Feb 2024', detail: '124 messages' }],
    awards: [],
    ...parts,
  };
}

/** The fullest image there can be: every block at its largest. */
const fullestContent = cardContent({
  title: 'The very long name of a group chat that somebody thought was funny in 2019',
  people: ['Ana', 'Bob', 'Carla', 'Dani', 'Marta'].map((name, index) => ({
    name,
    messageCount: 500 - index * 100,
    countAndShare: `${500 - index * 100} · 20%`,
  })),
  otherPeopleCount: 9,
  facts: [
    { label: 'Busiest day', value: '14 Feb 2024', detail: '124 messages' },
    { label: 'Longest streak', value: '12 days in a row', detail: '20 Jan 2024 to 31 Jan 2024' },
  ],
  awards: [
    { title: 'The night owl', winnerName: 'Ana', reason: '25% of their messages are at night' },
    { title: 'The opener', winnerName: 'Bob', reason: 'started 21 of the 30 conversations' },
    { title: 'The photographer', winnerName: 'Carla', reason: '12 photos sent' },
  ],
});

/**
 * Lays out an image with the invented font of the tests.
 */
function layOut(content: SummaryCardContent): DrawInstruction[] {
  return layOutSummaryCard(content, measureInInventedFont);
}

/** The texts of a layout, in the order they are drawn. */
function textsOf(instructions: readonly DrawInstruction[]): TextInstruction[] {
  return instructions.filter((instruction) => instruction.kind === 'text');
}

/** The rectangles of a layout, in the order they are drawn. */
function rectanglesOf(instructions: readonly DrawInstruction[]): RectangleInstruction[] {
  return instructions.filter((instruction) => instruction.kind === 'rectangle');
}

/**
 * Finds the instruction that writes a text and fails the test when there is none.
 */
function findText(instructions: readonly DrawInstruction[], text: string): TextInstruction {
  const instruction = textsOf(instructions).find((candidate) => candidate.text === text);
  if (instruction === undefined) {
    throw new Error(`Nothing writes "${text}"`);
  }
  return instruction;
}

/** The left and right end of a text, whichever way it is aligned. */
function horizontalExtentOf(instruction: TextInstruction): [number, number] {
  const width = measureInInventedFont(instruction.text, instruction.font);
  return instruction.alignment === 'left'
    ? [instruction.x, instruction.x + width]
    : [instruction.x - width, instruction.x];
}

describe('the look of the image', () => {
  it('is an upright picture of 1080 by 1350 pixels', () => {
    expect([SUMMARY_CARD_WIDTH, SUMMARY_CARD_HEIGHT]).toEqual([1080, 1350]);
  });

  it.each([
    ['--bg', SUMMARY_CARD_COLOURS.background],
    ['--surface', SUMMARY_CARD_COLOURS.surface],
    ['--surface-2', SUMMARY_CARD_COLOURS.barTrack],
    ['--ink', SUMMARY_CARD_COLOURS.ink],
    ['--ink-2', SUMMARY_CARD_COLOURS.secondaryInk],
    ['--muted', SUMMARY_CARD_COLOURS.muted],
    ['--accent', SUMMARY_CARD_COLOURS.accent],
    ['--s1', SUMMARY_CARD_SERIES_COLOURS[0]],
    ['--s2', SUMMARY_CARD_SERIES_COLOURS[1]],
    ['--s3', SUMMARY_CARD_SERIES_COLOURS[2]],
    ['--s4', SUMMARY_CARD_SERIES_COLOURS[3]],
    ['--s5', SUMMARY_CARD_SERIES_COLOURS[4]],
  ])('uses the light colour %s of the stylesheet', (customProperty, colour) => {
    /* The light scheme is the first definition of each custom property in the file. */
    const firstDefinition = new RegExp(`${customProperty}: (#[0-9a-f]{6});`, 'u').exec(STYLESHEET);

    expect(firstDefinition?.[1]).toBe(colour);
  });

  it.each([
    ['--display', DISPLAY_FONT_FAMILY],
    ['--body', BODY_FONT_FAMILY],
    ['--mono', MONOSPACE_FONT_FAMILY],
  ])('uses the font stack %s of the stylesheet', (customProperty, fontFamily) => {
    expect(STYLESHEET).toContain(`${customProperty}: ${fontFamily};`);
  });

  it('writes a font as weight, size and family', () => {
    expect(cardFont(600, 28, 'sans-serif')).toBe('600 28px sans-serif');
  });

  it('ends every font in a family the device has, for when a vendored font is missing', () => {
    for (const font of Object.values(SUMMARY_CARD_FONTS)) {
      expect(font).toMatch(/(sans-serif|monospace)$/u);
    }
  });
});

describe('layOutSummaryCard', () => {
  it('starts with the background over the whole image and the accent strip on top', () => {
    const [background, accentStrip] = layOut(cardContent());

    expect(background).toEqual({
      kind: 'rectangle',
      x: 0,
      y: 0,
      width: SUMMARY_CARD_WIDTH,
      height: SUMMARY_CARD_HEIGHT,
      colour: SUMMARY_CARD_COLOURS.background,
    });
    expect(accentStrip).toMatchObject({
      kind: 'rectangle',
      x: 0,
      y: 0,
      width: SUMMARY_CARD_WIDTH,
      colour: SUMMARY_CARD_COLOURS.accent,
    });
  });

  it('writes every text of a small chat, from top to bottom', () => {
    expect(textsOf(layOut(cardContent())).map((instruction) => instruction.text)).toEqual([
      'Ana and Bob',
      '13 Jan 2024 to 2 Mar 2024 · 50 days',
      '1,500',
      'messages',
      MOST_ACTIVE_HEADING,
      'Ana',
      '1,200 · 80%',
      'Bob',
      '300 · 20%',
      'BUSIEST DAY',
      '14 Feb 2024',
      '124 messages',
      FOOTER_SOURCE,
      FOOTER_PROMISE,
    ]);
  });

  it('puts the blocks under each other: heading, total, people, facts, awards, footer', () => {
    const instructions = layOut(fullestContent);
    const baselines = [
      'The very long name of a',
      '13 Jan 2024 to 2 Mar 2024 · 50 days',
      'messages',
      MOST_ACTIVE_HEADING,
      'Marta',
      'and 9 more people',
      'BUSIEST DAY',
      '20 Jan 2024 to 31 Jan 2024',
      'The night owl',
      '12 photos sent',
      FOOTER_SOURCE,
    ].map((text) => findText(instructions, text).y);

    expect(baselines).toEqual([...baselines].sort((first, second) => first - second));
    expect(new Set(baselines).size).toBe(baselines.length);
  });

  it('writes the title in the display font and the period in the monospace font', () => {
    const instructions = layOut(cardContent());

    expect(findText(instructions, 'Ana and Bob')).toMatchObject({
      x: CONTENT_LEFT,
      font: SUMMARY_CARD_FONTS.title,
      colour: SUMMARY_CARD_COLOURS.ink,
    });
    expect(findText(instructions, '13 Jan 2024 to 2 Mar 2024 · 50 days').font).toBe(
      SUMMARY_CARD_FONTS.period,
    );
  });

  it('breaks a long title into two lines and cuts the second short', () => {
    /* At 68 pixels a character is 34 wide, so the 920 pixels of a line hold 27 characters. */
    const titleLines = textsOf(layOut(fullestContent))
      .filter((instruction) => instruction.font === SUMMARY_CARD_FONTS.title)
      .map((instruction) => instruction.text);

    expect(titleLines).toEqual(['The very long name of a', 'group chat that somebody t…']);
  });

  it('moves everything below the title down by one line when the title takes two', () => {
    const shortTitle = layOut(cardContent());
    const longTitle = layOut(cardContent({ title: 'Ana and Bob and Carla and Dani and Marta' }));

    const lineHeight =
      findText(longTitle, MOST_ACTIVE_HEADING).y - findText(shortTitle, MOST_ACTIVE_HEADING).y;

    expect(lineHeight).toBe(78);
    /* The footer is fixed to the bottom edge and stays where it is. */
    expect(findText(longTitle, FOOTER_SOURCE).y).toBe(findText(shortTitle, FOOTER_SOURCE).y);
  });

  it('puts the noun after the number of messages, on the same baseline', () => {
    const instructions = layOut(cardContent());
    const number = findText(instructions, '1,500');
    const noun = findText(instructions, 'messages');

    /* "1,500" has 5 characters of 60 pixels at 120 pixels; the noun follows after a gap of 20. */
    expect(noun.x).toBe(CONTENT_LEFT + 300 + 20);
    expect(noun.y).toBe(number.y);
    expect(number.colour).toBe(SUMMARY_CARD_COLOURS.accent);
  });

  it('draws a bar for each person, in their colour, as long as their share of the largest', () => {
    const bars = rectanglesOf(layOut(cardContent())).filter((rectangle) =>
      SUMMARY_CARD_SERIES_COLOURS.includes(rectangle.colour),
    );

    /* Bob has 300 of Ana's 1,200 messages: a quarter of 380 pixels. */
    expect(bars.map((bar) => [bar.colour, bar.width])).toEqual([
      [SUMMARY_CARD_SERIES_COLOURS[0], FULL_BAR_WIDTH],
      [SUMMARY_CARD_SERIES_COLOURS[1], 95],
    ]);
  });

  it('draws every bar on a track of the full width, starting at the same place', () => {
    const rectangles = rectanglesOf(layOut(cardContent()));
    const tracks = rectangles.filter(
      (rectangle) => rectangle.colour === SUMMARY_CARD_COLOURS.barTrack,
    );
    const bars = rectangles.filter((rectangle) =>
      SUMMARY_CARD_SERIES_COLOURS.includes(rectangle.colour),
    );

    expect(tracks.map((track) => track.width)).toEqual([FULL_BAR_WIDTH, FULL_BAR_WIDTH]);
    expect(bars.map((bar) => [bar.x, bar.y])).toEqual(tracks.map((track) => [track.x, track.y]));
  });

  it('writes the count of each person against the right edge, on the baseline of the name', () => {
    const instructions = layOut(cardContent());
    const count = findText(instructions, '300 · 20%');

    expect(count).toMatchObject({ x: CONTENT_RIGHT, alignment: 'right' });
    expect(count.y).toBe(findText(instructions, 'Bob').y);
  });

  it('cuts a long name short before it reaches the bars', () => {
    /* At 30 pixels a character is 15 wide; the 280 pixels of a name hold 18 characters. */
    const instructions = layOut(
      cardContent({
        people: [
          { name: 'Ana María de los Ángeles', messageCount: 10, countAndShare: '10 · 100%' },
        ],
      }),
    );

    expect(findText(instructions, 'Ana María de los…').font).toBe(SUMMARY_CARD_FONTS.personName);
  });

  it('counts the people without a bar under the bars, and only when there are any', () => {
    const texts = (content: SummaryCardContent): string[] =>
      textsOf(layOut(content)).map((instruction) => instruction.text);

    expect(texts(cardContent({ otherPeopleCount: 9 }))).toContain('and 9 more people');
    expect(texts(cardContent()).some((text) => text.startsWith('and '))).toBe(false);
  });

  it('gives a single fact the whole width and two facts half of it each', () => {
    const tilesOf = (content: SummaryCardContent): RectangleInstruction[] =>
      rectanglesOf(layOut(content)).filter(
        (rectangle) => rectangle.colour === SUMMARY_CARD_COLOURS.surface,
      );

    /* 920 pixels of content; two tiles share it with a gap of 24 between them. */
    expect(tilesOf(cardContent()).map((tile) => [tile.x, tile.width])).toEqual([[80, 920]]);
    expect(tilesOf(fullestContent).map((tile) => [tile.x, tile.width])).toEqual([
      [80, 448],
      [552, 448],
    ]);
  });

  it('writes the texts of a fact inside its tile, with the label in capitals', () => {
    const instructions = layOut(fullestContent);
    const secondTile = rectanglesOf(instructions).filter(
      (rectangle) => rectangle.colour === SUMMARY_CARD_COLOURS.surface,
    )[1];

    for (const text of ['LONGEST STREAK', '12 days in a row', '20 Jan 2024 to 31 Jan 2024']) {
      const instruction = findText(instructions, text);
      const [left, right] = horizontalExtentOf(instruction);
      expect(left).toBeGreaterThan(secondTile?.x ?? 0);
      expect(right).toBeLessThan((secondTile?.x ?? 0) + (secondTile?.width ?? 0));
      expect(instruction.y).toBeGreaterThan(secondTile?.y ?? 0);
      expect(instruction.y).toBeLessThan((secondTile?.y ?? 0) + (secondTile?.height ?? 0));
    }
  });

  it('takes no room for facts when there are none', () => {
    const awards = [{ title: 'The opener', winnerName: 'Bob', reason: 'started 21 conversations' }];
    const withFact = layOut(cardContent({ awards }));
    const withoutFact = layOut(cardContent({ awards, facts: [] }));

    /* A tile is 136 pixels high and is followed by a gap of 28. */
    expect(findText(withFact, 'The opener').y - findText(withoutFact, 'The opener').y).toBe(164);
  });

  it('writes each award as its title and winner on a line and the reason below', () => {
    const instructions = layOut(fullestContent);
    const title = findText(instructions, 'The opener');
    const winner = findText(instructions, 'Bob');
    const awardWinner = textsOf(instructions).find(
      (instruction) =>
        instruction.text === 'Bob' && instruction.font === SUMMARY_CARD_FONTS.awardWinner,
    );
    const reason = findText(instructions, 'started 21 of the 30 conversations');

    expect(winner.font).toBe(SUMMARY_CARD_FONTS.personName);
    /* "The opener" has 10 characters of 14 pixels at 28 pixels; the winner follows after a gap of 16. */
    expect(awardWinner).toMatchObject({ x: CONTENT_LEFT + 140 + 16, y: title.y });
    expect(title.colour).toBe(SUMMARY_CARD_COLOURS.accent);
    expect(reason.x).toBe(CONTENT_LEFT);
    expect(reason.y).toBeGreaterThan(title.y);
  });

  it('cuts a reason short that is wider than the image', () => {
    /* At 24 pixels a character is 12 wide; the 920 pixels of the content hold 76 characters. */
    const reason = 'x'.repeat(80);
    const instructions = layOut(
      cardContent({ awards: [{ title: 'The novelist', winnerName: 'Ana', reason }] }),
    );

    expect(findText(instructions, `${'x'.repeat(75)}…`).font).toBe(SUMMARY_CARD_FONTS.note);
  });

  it('writes the footer along the bottom: the page on the left, its promise on the right', () => {
    const instructions = layOut(cardContent());

    expect(findText(instructions, FOOTER_SOURCE)).toMatchObject({
      x: CONTENT_LEFT,
      y: SUMMARY_CARD_HEIGHT - 56,
      alignment: 'left',
    });
    expect(findText(instructions, FOOTER_PROMISE)).toMatchObject({
      x: CONTENT_RIGHT,
      y: SUMMARY_CARD_HEIGHT - 56,
      alignment: 'right',
    });
  });

  describe('the fullest image', () => {
    it('keeps every rectangle inside the picture', () => {
      for (const rectangle of rectanglesOf(layOut(fullestContent))) {
        expect(rectangle.x).toBeGreaterThanOrEqual(0);
        expect(rectangle.y).toBeGreaterThanOrEqual(0);
        expect(rectangle.x + rectangle.width).toBeLessThanOrEqual(SUMMARY_CARD_WIDTH);
        expect(rectangle.y + rectangle.height).toBeLessThanOrEqual(SUMMARY_CARD_HEIGHT);
      }
    });

    it('keeps every text between the margins', () => {
      for (const instruction of textsOf(layOut(fullestContent))) {
        const [left, right] = horizontalExtentOf(instruction);
        expect(left).toBeGreaterThanOrEqual(CONTENT_LEFT);
        expect(right).toBeLessThanOrEqual(CONTENT_RIGHT);
      }
    });

    it('ends its last award above the footer', () => {
      const instructions = layOut(fullestContent);
      const lastReason = findText(instructions, '12 photos sent');
      const footer = findText(instructions, FOOTER_SOURCE);

      /* The footer is 22 pixels tall; its letters start that far above its baseline. */
      expect(lastReason.y).toBeLessThan(footer.y - 22);
    });
  });

  it('lays out a chat that has nothing but its numbers', () => {
    const instructions = layOut(cardContent({ title: '', people: [], facts: [], awards: [] }));

    expect(textsOf(instructions).map((instruction) => instruction.text)).toEqual([
      '13 Jan 2024 to 2 Mar 2024 · 50 days',
      '1,500',
      'messages',
      MOST_ACTIVE_HEADING,
      FOOTER_SOURCE,
      FOOTER_PROMISE,
    ]);
  });
});

describe('barWidthOf', () => {
  it('gives the most active person the full width', () => {
    expect(barWidthOf(1200, 1200)).toBe(FULL_BAR_WIDTH);
  });

  it('gives half the width for half the messages', () => {
    expect(barWidthOf(600, 1200)).toBe(190);
  });

  it('never goes under four pixels, so a person with few messages still has a bar', () => {
    /* 1 of 1,200 would be a third of a pixel. */
    expect(barWidthOf(1, 1200)).toBe(4);
  });

  it('gives the smallest bar when nobody wrote anything', () => {
    expect(barWidthOf(0, 0)).toBe(4);
  });
});

describe('describeOtherPeople', () => {
  it('writes "person" for one and "people" for more', () => {
    expect(describeOtherPeople(1)).toBe('and 1 more person');
    expect(describeOtherPeople(9)).toBe('and 9 more people');
  });
});

describe('listFontRequests', () => {
  it('asks for every font of the image once', () => {
    const requestedFonts = listFontRequests(cardContent()).map((fontRequest) => fontRequest.font);

    expect(requestedFonts).toEqual(Object.values(SUMMARY_CARD_FONTS));
  });

  it('asks for each font with every text of the image, so the right subsets are loaded', () => {
    const content = cardContent({
      title: 'Łukasz and Ana',
      awards: [{ title: 'The opener', winnerName: 'Łukasz', reason: 'started 21 conversations' }],
    });

    for (const fontRequest of listFontRequests(content)) {
      for (const text of [
        'Łukasz and Ana',
        '13 Jan 2024 to 2 Mar 2024 · 50 days',
        '1,500',
        'messages',
        'Bob',
        '300 · 20%',
        'BUSIEST DAY',
        '14 Feb 2024',
        '124 messages',
        'The opener',
        'started 21 conversations',
        MOST_ACTIVE_HEADING,
        FOOTER_SOURCE,
        FOOTER_PROMISE,
      ]) {
        expect(fontRequest.text).toContain(text);
      }
    }
  });
});
