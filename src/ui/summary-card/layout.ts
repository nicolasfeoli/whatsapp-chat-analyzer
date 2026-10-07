/**
 * Where everything on the summary image goes: turns its content into a list
 * of rectangles and texts with their place, font and colour.
 *
 * The list is plain data, so the whole image can be checked without a canvas.
 * `canvas.ts` draws it, one instruction after the other.
 *
 * The image is always drawn in the light colours of the page, whatever scheme
 * the page is shown in: it is meant to be passed on, and a picture has no
 * dark mode. A canvas cannot read the custom properties of the stylesheet, so
 * the colours and font stacks are repeated here; a test keeps them in step
 * with `main.css`.
 */

import type {
  SummaryCardAward,
  SummaryCardContent,
  SummaryCardFact,
  SummaryCardPerson,
} from './content';
import { fitTextToWidth, wrapTextToLines } from './text-fitting';
import type { MeasureTextWidth } from './text-fitting';

/**
 * The width of the image in pixels. 1080 by 1350 is the upright four-by-five
 * picture that chat and social apps show without cropping.
 */
export const SUMMARY_CARD_WIDTH = 1080;

/** The height of the image in pixels; see {@link SUMMARY_CARD_WIDTH}. */
export const SUMMARY_CARD_HEIGHT = 1350;

/** The colours of the image: the light scheme of `main.css`, by the name of its custom property. */
export const SUMMARY_CARD_COLOURS = {
  background: '#f2f5f4',
  surface: '#fcfdfc',
  barTrack: '#e8edeb',
  ink: '#111917',
  secondaryInk: '#47534f',
  muted: '#74807c',
  accent: '#0f5f52',
} as const;

/**
 * The colour of each person's bar, most active first: the series colours
 * `--s1` to `--s5` of the light scheme, so a person has the colour they have
 * in the report.
 */
export const SUMMARY_CARD_SERIES_COLOURS: readonly string[] = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
];

/** The font stack of headings, as `--display` in `main.css`. */
export const DISPLAY_FONT_FAMILY = "'Bricolage Grotesque', 'Avenir Next', 'Segoe UI', sans-serif";

/** The font stack of running text, as `--body` in `main.css`. */
export const BODY_FONT_FAMILY = "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif";

/** The font stack of numbers and dates, as `--mono` in `main.css`. */
export const MONOSPACE_FONT_FAMILY = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace";

/**
 * Writes a font the way CSS and a canvas take it.
 *
 * Every stack ends in fonts the device has, so the canvas falls back to one
 * of them by itself when a vendored font has not loaded.
 *
 * @param weight - The weight, e.g. 400 or 700; the vendored fonts come in 400, 500, 600 and 700.
 * @param sizeInPixels - The size of the letters.
 * @param family - One of the three font stacks of this module.
 * @returns For example `"600 28px 'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif"`.
 */
export function cardFont(weight: number, sizeInPixels: number, family: string): string {
  return `${weight} ${sizeInPixels}px ${family}`;
}

/** The fonts of the image, by what they are used for. */
export const SUMMARY_CARD_FONTS = {
  title: cardFont(700, 68, DISPLAY_FONT_FAMILY),
  period: cardFont(400, 28, MONOSPACE_FONT_FAMILY),
  total: cardFont(700, 120, DISPLAY_FONT_FAMILY),
  totalNoun: cardFont(500, 36, BODY_FONT_FAMILY),
  heading: cardFont(600, 22, BODY_FONT_FAMILY),
  personName: cardFont(500, 30, BODY_FONT_FAMILY),
  personCount: cardFont(400, 26, MONOSPACE_FONT_FAMILY),
  note: cardFont(400, 24, BODY_FONT_FAMILY),
  factLabel: cardFont(600, 20, BODY_FONT_FAMILY),
  factValue: cardFont(700, 40, DISPLAY_FONT_FAMILY),
  awardTitle: cardFont(600, 28, BODY_FONT_FAMILY),
  awardWinner: cardFont(500, 28, BODY_FONT_FAMILY),
  footer: cardFont(400, 22, BODY_FONT_FAMILY),
} as const;

/** The heading above the bars. */
export const MOST_ACTIVE_HEADING = 'MOST ACTIVE';

/** The name of the page, at the bottom left of the image. */
export const FOOTER_SOURCE = 'WhatsApp Chat Analyzer';

/** The promise of the page, at the bottom right of the image. */
export const FOOTER_PROMISE = 'Counted in the browser. Nothing was uploaded.';

/** The empty border around the content, on every side. */
const MARGIN = 80;

/** The x coordinate where the content starts. */
const CONTENT_LEFT = MARGIN;

/** The x coordinate where the content ends. */
const CONTENT_RIGHT = SUMMARY_CARD_WIDTH - MARGIN;

/** The width the content has. */
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;

/** The height of the strip in the accent colour along the top edge. */
const ACCENT_STRIP_HEIGHT = 16;

/** The empty space between two blocks of the image. */
const BLOCK_GAP = 28;

/** A long title is broken into this many lines at most, then cut short. */
const TITLE_LINE_LIMIT = 2;

/** The distance between the baselines of two title lines. */
const TITLE_LINE_HEIGHT = 78;

/** From the top of a title line down to its baseline. */
const TITLE_BASELINE_OFFSET = 62;

/** The height of the line with the period. */
const PERIOD_LINE_HEIGHT = 56;

/** From the top of the period line down to its baseline. */
const PERIOD_BASELINE_OFFSET = 40;

/** The height of the block with the number of messages. */
const TOTAL_BLOCK_HEIGHT = 124;

/** From the top of that block down to the baseline of the number. */
const TOTAL_BASELINE_OFFSET = 104;

/** The space between the number of messages and the noun after it. */
const TOTAL_NOUN_GAP = 20;

/** The height of the heading above the bars, with the space under it. */
const HEADING_HEIGHT = 44;

/** From the top of the heading down to its baseline. */
const HEADING_BASELINE_OFFSET = 22;

/** The height of one person's row. */
const PERSON_ROW_HEIGHT = 56;

/** From the top of a person's row down to the baseline of its texts. */
const PERSON_BASELINE_OFFSET = 38;

/** The width a name may take before it is cut short. */
const PERSON_NAME_WIDTH = 280;

/** The x coordinate where every bar starts, to the right of the longest name. */
const BAR_LEFT = CONTENT_LEFT + 300;

/** The width of the bar of the most active person, and of the track behind every bar. */
const BAR_FULL_WIDTH = 380;

/** From the top of a person's row down to its bar. */
const BAR_TOP_OFFSET = 14;

/** The height of a bar. */
const BAR_HEIGHT = 32;

/** A bar is never narrower than this, so that a person with few messages still has one. */
const BAR_MINIMUM_WIDTH = 4;

/** The height of the line that counts the people without a bar. */
const OTHER_PEOPLE_LINE_HEIGHT = 40;

/** From the top of that line down to its baseline. */
const OTHER_PEOPLE_BASELINE_OFFSET = 30;

/** The height of a fact tile. */
const FACT_TILE_HEIGHT = 136;

/** The space between two fact tiles. */
const FACT_TILE_GAP = 24;

/** The space inside a fact tile, left and right of its texts. */
const FACT_TILE_PADDING = 24;

/** From the top of a fact tile down to the baseline of its label. */
const FACT_LABEL_BASELINE_OFFSET = 38;

/** From the top of a fact tile down to the baseline of its value. */
const FACT_VALUE_BASELINE_OFFSET = 86;

/** From the top of a fact tile down to the baseline of its detail. */
const FACT_DETAIL_BASELINE_OFFSET = 120;

/** The height of one award: two lines and the space under them. */
const AWARD_ROW_HEIGHT = 68;

/** From the top of an award down to the baseline of its title and winner. */
const AWARD_TITLE_BASELINE_OFFSET = 28;

/** From the top of an award down to the baseline of its reason. */
const AWARD_REASON_BASELINE_OFFSET = 58;

/** The space between the title of an award and its winner. */
const AWARD_WINNER_GAP = 16;

/** From the bottom edge of the image up to the baseline of the footer. */
const FOOTER_BASELINE_FROM_BOTTOM = 56;

/** A filled rectangle. */
export interface RectangleInstruction {
  readonly kind: 'rectangle';
  /** The left edge. */
  readonly x: number;
  /** The top edge. */
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** A CSS colour. */
  readonly colour: string;
}

/** One line of text. */
export interface TextInstruction {
  readonly kind: 'text';
  /** What to write; plain text, drawn as it is. */
  readonly text: string;
  /** Where the text starts when aligned left, or ends when aligned right. */
  readonly x: number;
  /** The baseline of the text. */
  readonly y: number;
  /** The font as CSS writes it. */
  readonly font: string;
  /** A CSS colour. */
  readonly colour: string;
  /** Whether `x` is the left or the right end of the text. */
  readonly alignment: 'left' | 'right';
}

/** One step of drawing the image. */
export type DrawInstruction = RectangleInstruction | TextInstruction;

/** The instructions of one block, and the y coordinate where the next block starts. */
interface LaidOutBlock {
  readonly instructions: readonly DrawInstruction[];
  readonly nextTop: number;
}

/**
 * Writes the instruction for one line of text that starts at `x`.
 */
function textAt(text: string, x: number, y: number, font: string, colour: string): TextInstruction {
  return { kind: 'text', text, x, y, font, colour, alignment: 'left' };
}

/**
 * The background of the whole image with the accent strip along its top.
 */
function layOutBackground(): DrawInstruction[] {
  return [
    {
      kind: 'rectangle',
      x: 0,
      y: 0,
      width: SUMMARY_CARD_WIDTH,
      height: SUMMARY_CARD_HEIGHT,
      colour: SUMMARY_CARD_COLOURS.background,
    },
    {
      kind: 'rectangle',
      x: 0,
      y: 0,
      width: SUMMARY_CARD_WIDTH,
      height: ACCENT_STRIP_HEIGHT,
      colour: SUMMARY_CARD_COLOURS.accent,
    },
  ];
}

/**
 * The title, on one or two lines, and the period under it.
 */
function layOutHeading(
  content: SummaryCardContent,
  top: number,
  measureTextWidth: MeasureTextWidth,
): LaidOutBlock {
  const titleLines = wrapTextToLines(
    content.title,
    SUMMARY_CARD_FONTS.title,
    CONTENT_WIDTH,
    TITLE_LINE_LIMIT,
    measureTextWidth,
  );
  const instructions: DrawInstruction[] = titleLines.map(
    (line: string, lineIndex: number): DrawInstruction =>
      textAt(
        line,
        CONTENT_LEFT,
        top + lineIndex * TITLE_LINE_HEIGHT + TITLE_BASELINE_OFFSET,
        SUMMARY_CARD_FONTS.title,
        SUMMARY_CARD_COLOURS.ink,
      ),
  );
  const periodTop = top + titleLines.length * TITLE_LINE_HEIGHT;
  const period = fitTextToWidth(
    content.period,
    SUMMARY_CARD_FONTS.period,
    CONTENT_WIDTH,
    measureTextWidth,
  );
  instructions.push(
    textAt(
      period,
      CONTENT_LEFT,
      periodTop + PERIOD_BASELINE_OFFSET,
      SUMMARY_CARD_FONTS.period,
      SUMMARY_CARD_COLOURS.secondaryInk,
    ),
  );
  return { instructions, nextTop: periodTop + PERIOD_LINE_HEIGHT };
}

/**
 * The number of messages in large digits, with its noun on the same baseline.
 */
function layOutTotal(
  content: SummaryCardContent,
  top: number,
  measureTextWidth: MeasureTextWidth,
): LaidOutBlock {
  const baseline = top + TOTAL_BASELINE_OFFSET;
  const numberWidth = measureTextWidth(content.messageCount, SUMMARY_CARD_FONTS.total);
  return {
    instructions: [
      textAt(
        content.messageCount,
        CONTENT_LEFT,
        baseline,
        SUMMARY_CARD_FONTS.total,
        SUMMARY_CARD_COLOURS.accent,
      ),
      textAt(
        content.messageNoun,
        CONTENT_LEFT + numberWidth + TOTAL_NOUN_GAP,
        baseline,
        SUMMARY_CARD_FONTS.totalNoun,
        SUMMARY_CARD_COLOURS.secondaryInk,
      ),
    ],
    nextTop: top + TOTAL_BLOCK_HEIGHT,
  };
}

/**
 * Works out how wide a person's bar is: in proportion to the most active
 * person, whose bar is full.
 *
 * @param messageCount - The person's messages.
 * @param largestMessageCount - The messages of the most active person.
 * @returns The width in pixels, never under the minimum.
 */
export function barWidthOf(messageCount: number, largestMessageCount: number): number {
  if (largestMessageCount <= 0) {
    return BAR_MINIMUM_WIDTH;
  }
  const proportionalWidth = Math.round((messageCount / largestMessageCount) * BAR_FULL_WIDTH);
  return Math.max(BAR_MINIMUM_WIDTH, proportionalWidth);
}

/**
 * One person's row: the name, the bar on its track, and the count at the right edge.
 */
function layOutPerson(
  person: SummaryCardPerson,
  rank: number,
  largestMessageCount: number,
  top: number,
  measureTextWidth: MeasureTextWidth,
): DrawInstruction[] {
  const baseline = top + PERSON_BASELINE_OFFSET;
  const name = fitTextToWidth(
    person.name,
    SUMMARY_CARD_FONTS.personName,
    PERSON_NAME_WIDTH,
    measureTextWidth,
  );
  const barTop = top + BAR_TOP_OFFSET;
  return [
    textAt(name, CONTENT_LEFT, baseline, SUMMARY_CARD_FONTS.personName, SUMMARY_CARD_COLOURS.ink),
    {
      kind: 'rectangle',
      x: BAR_LEFT,
      y: barTop,
      width: BAR_FULL_WIDTH,
      height: BAR_HEIGHT,
      colour: SUMMARY_CARD_COLOURS.barTrack,
    },
    {
      kind: 'rectangle',
      x: BAR_LEFT,
      y: barTop,
      width: barWidthOf(person.messageCount, largestMessageCount),
      height: BAR_HEIGHT,
      colour: SUMMARY_CARD_SERIES_COLOURS[rank] ?? SUMMARY_CARD_COLOURS.muted,
    },
    {
      kind: 'text',
      text: person.countAndShare,
      x: CONTENT_RIGHT,
      y: baseline,
      font: SUMMARY_CARD_FONTS.personCount,
      colour: SUMMARY_CARD_COLOURS.secondaryInk,
      alignment: 'right',
    },
  ];
}

/**
 * Says how many people wrote in the chat without getting a bar.
 *
 * @param otherPeopleCount - The people beyond those with a bar; at least one.
 * @returns For example `"and 1 more person"` or `"and 9 more people"`.
 */
export function describeOtherPeople(otherPeopleCount: number): string {
  const noun = otherPeopleCount === 1 ? 'person' : 'people';
  return `and ${otherPeopleCount} more ${noun}`;
}

/**
 * The heading, a row for each of the most active people, and the line that
 * counts everybody else.
 */
function layOutPeople(
  content: SummaryCardContent,
  top: number,
  measureTextWidth: MeasureTextWidth,
): LaidOutBlock {
  const instructions: DrawInstruction[] = [
    textAt(
      MOST_ACTIVE_HEADING,
      CONTENT_LEFT,
      top + HEADING_BASELINE_OFFSET,
      SUMMARY_CARD_FONTS.heading,
      SUMMARY_CARD_COLOURS.muted,
    ),
  ];
  const rowsTop = top + HEADING_HEIGHT;
  const largestMessageCount = content.people[0]?.messageCount ?? 0;
  for (const [rank, person] of content.people.entries()) {
    const rowTop = rowsTop + rank * PERSON_ROW_HEIGHT;
    instructions.push(...layOutPerson(person, rank, largestMessageCount, rowTop, measureTextWidth));
  }
  const rowsBottom = rowsTop + content.people.length * PERSON_ROW_HEIGHT;
  if (content.otherPeopleCount <= 0) {
    return { instructions, nextTop: rowsBottom };
  }
  instructions.push(
    textAt(
      describeOtherPeople(content.otherPeopleCount),
      CONTENT_LEFT,
      rowsBottom + OTHER_PEOPLE_BASELINE_OFFSET,
      SUMMARY_CARD_FONTS.note,
      SUMMARY_CARD_COLOURS.muted,
    ),
  );
  return { instructions, nextTop: rowsBottom + OTHER_PEOPLE_LINE_HEIGHT };
}

/**
 * One fact: a tile with a label, the value in large letters and a detail.
 */
function layOutFact(
  fact: SummaryCardFact,
  left: number,
  top: number,
  width: number,
  measureTextWidth: MeasureTextWidth,
): DrawInstruction[] {
  const textLeft = left + FACT_TILE_PADDING;
  const textWidth = width - 2 * FACT_TILE_PADDING;
  const value = fitTextToWidth(
    fact.value,
    SUMMARY_CARD_FONTS.factValue,
    textWidth,
    measureTextWidth,
  );
  const detail = fitTextToWidth(fact.detail, SUMMARY_CARD_FONTS.note, textWidth, measureTextWidth);
  return [
    {
      kind: 'rectangle',
      x: left,
      y: top,
      width,
      height: FACT_TILE_HEIGHT,
      colour: SUMMARY_CARD_COLOURS.surface,
    },
    textAt(
      fact.label.toUpperCase(),
      textLeft,
      top + FACT_LABEL_BASELINE_OFFSET,
      SUMMARY_CARD_FONTS.factLabel,
      SUMMARY_CARD_COLOURS.muted,
    ),
    textAt(
      value,
      textLeft,
      top + FACT_VALUE_BASELINE_OFFSET,
      SUMMARY_CARD_FONTS.factValue,
      SUMMARY_CARD_COLOURS.ink,
    ),
    textAt(
      detail,
      textLeft,
      top + FACT_DETAIL_BASELINE_OFFSET,
      SUMMARY_CARD_FONTS.note,
      SUMMARY_CARD_COLOURS.secondaryInk,
    ),
  ];
}

/**
 * The facts side by side, sharing the width of the content equally.
 */
function layOutFacts(
  content: SummaryCardContent,
  top: number,
  measureTextWidth: MeasureTextWidth,
): LaidOutBlock {
  const factCount = content.facts.length;
  if (factCount === 0) {
    return { instructions: [], nextTop: top };
  }
  const tileWidth = (CONTENT_WIDTH - (factCount - 1) * FACT_TILE_GAP) / factCount;
  const instructions = content.facts.flatMap(
    (fact: SummaryCardFact, factIndex: number): DrawInstruction[] =>
      layOutFact(
        fact,
        CONTENT_LEFT + factIndex * (tileWidth + FACT_TILE_GAP),
        top,
        tileWidth,
        measureTextWidth,
      ),
  );
  return { instructions, nextTop: top + FACT_TILE_HEIGHT };
}

/**
 * One award: its title and winner on a line, the number that earned it below.
 */
function layOutAward(
  award: SummaryCardAward,
  top: number,
  measureTextWidth: MeasureTextWidth,
): DrawInstruction[] {
  const titleBaseline = top + AWARD_TITLE_BASELINE_OFFSET;
  const titleWidth = measureTextWidth(award.title, SUMMARY_CARD_FONTS.awardTitle);
  const winnerLeft = CONTENT_LEFT + titleWidth + AWARD_WINNER_GAP;
  const winnerName = fitTextToWidth(
    award.winnerName,
    SUMMARY_CARD_FONTS.awardWinner,
    CONTENT_RIGHT - winnerLeft,
    measureTextWidth,
  );
  const reason = fitTextToWidth(
    award.reason,
    SUMMARY_CARD_FONTS.note,
    CONTENT_WIDTH,
    measureTextWidth,
  );
  return [
    textAt(
      award.title,
      CONTENT_LEFT,
      titleBaseline,
      SUMMARY_CARD_FONTS.awardTitle,
      SUMMARY_CARD_COLOURS.accent,
    ),
    textAt(
      winnerName,
      winnerLeft,
      titleBaseline,
      SUMMARY_CARD_FONTS.awardWinner,
      SUMMARY_CARD_COLOURS.ink,
    ),
    textAt(
      reason,
      CONTENT_LEFT,
      top + AWARD_REASON_BASELINE_OFFSET,
      SUMMARY_CARD_FONTS.note,
      SUMMARY_CARD_COLOURS.secondaryInk,
    ),
  ];
}

/**
 * The awards, one under the other.
 */
function layOutAwards(
  content: SummaryCardContent,
  top: number,
  measureTextWidth: MeasureTextWidth,
): LaidOutBlock {
  const instructions = content.awards.flatMap(
    (award: SummaryCardAward, awardIndex: number): DrawInstruction[] =>
      layOutAward(award, top + awardIndex * AWARD_ROW_HEIGHT, measureTextWidth),
  );
  return { instructions, nextTop: top + content.awards.length * AWARD_ROW_HEIGHT };
}

/**
 * The line at the bottom: where the image comes from, and that nothing was uploaded.
 */
function layOutFooter(): DrawInstruction[] {
  const baseline = SUMMARY_CARD_HEIGHT - FOOTER_BASELINE_FROM_BOTTOM;
  return [
    textAt(
      FOOTER_SOURCE,
      CONTENT_LEFT,
      baseline,
      SUMMARY_CARD_FONTS.footer,
      SUMMARY_CARD_COLOURS.muted,
    ),
    {
      kind: 'text',
      text: FOOTER_PROMISE,
      x: CONTENT_RIGHT,
      y: baseline,
      font: SUMMARY_CARD_FONTS.footer,
      colour: SUMMARY_CARD_COLOURS.muted,
      alignment: 'right',
    },
  ];
}

/**
 * Lays out the summary image.
 *
 * The blocks follow each other from the top: title and period, the number of
 * messages, the most active people, the facts, the awards. A block with
 * nothing to show takes no room, and what is left stays empty above the
 * footer. The fullest image, with a title of two lines, five people and
 * somebody beyond them, two facts and three awards, ends above the footer.
 *
 * @param content - What the image says.
 * @param measureTextWidth - Measures a text in a font, with the canvas the image is drawn on.
 * @returns The instructions, in the order they are drawn; the background comes first.
 */
export function layOutSummaryCard(
  content: SummaryCardContent,
  measureTextWidth: MeasureTextWidth,
): DrawInstruction[] {
  const heading = layOutHeading(content, MARGIN, measureTextWidth);
  const total = layOutTotal(content, heading.nextTop + BLOCK_GAP, measureTextWidth);
  const people = layOutPeople(content, total.nextTop + BLOCK_GAP, measureTextWidth);
  const facts = layOutFacts(content, people.nextTop + BLOCK_GAP, measureTextWidth);
  const awardsTop = content.facts.length === 0 ? facts.nextTop : facts.nextTop + BLOCK_GAP;
  const awards = layOutAwards(content, awardsTop, measureTextWidth);
  return [
    ...layOutBackground(),
    ...heading.instructions,
    ...total.instructions,
    ...people.instructions,
    ...facts.instructions,
    ...awards.instructions,
    ...layOutFooter(),
  ];
}

/** A font together with the text that will be drawn in it. */
export interface FontRequest {
  /** The font as CSS writes it. */
  readonly font: string;
  /** Every character the font is needed for, so the right subsets are loaded. */
  readonly text: string;
}

/**
 * Lists the fonts the image needs, each with all the text of the image.
 *
 * The vendored fonts are split into a Latin and an extended Latin file, and
 * the browser fetches the second only when a text needs it. Asking for every
 * font with the whole text, before anything is measured or cut short, means a
 * name such as "Łukasz" is drawn in the same font as the rest.
 *
 * @param content - What the image says.
 * @returns One request per font of the image.
 */
export function listFontRequests(content: SummaryCardContent): FontRequest[] {
  const texts: string[] = [
    content.title,
    content.period,
    content.messageCount,
    content.messageNoun,
    MOST_ACTIVE_HEADING,
    FOOTER_SOURCE,
    FOOTER_PROMISE,
    ...content.people.flatMap((person: SummaryCardPerson): string[] => [
      person.name,
      person.countAndShare,
    ]),
    ...content.facts.flatMap((fact: SummaryCardFact): string[] => [
      fact.label.toUpperCase(),
      fact.value,
      fact.detail,
    ]),
    ...content.awards.flatMap((award: SummaryCardAward): string[] => [
      award.title,
      award.winnerName,
      award.reason,
    ]),
  ];
  const text = texts.join(' ');
  return Object.values(SUMMARY_CARD_FONTS).map((font: string): FontRequest => ({ font, text }));
}
