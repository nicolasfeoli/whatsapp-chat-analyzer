/**
 * Makes text fit a width on the summary image: cut short with an ellipsis, or
 * broken into lines. A canvas does neither by itself.
 *
 * The width of a text depends on the font the browser ends up drawing with, so
 * these functions are handed a way to measure and are otherwise pure.
 */

/**
 * Measures how wide a text is when drawn in a font.
 *
 * @param text - The text to measure.
 * @param font - The font as CSS writes it, e.g. `'600 28px "IBM Plex Sans", sans-serif'`.
 * @returns The width in pixels of the image.
 */
export type MeasureTextWidth = (text: string, font: string) => number;

/** Put where a text was cut short. */
export const ELLIPSIS = '…';

/**
 * Cuts a text short so it fits a width, and marks the cut with an ellipsis.
 *
 * The text is cut between characters as Unicode counts them, so an emoji or
 * an accented letter outside the basic plane is never cut in half.
 *
 * @param text - The text to fit.
 * @param font - The font it will be drawn in.
 * @param maximumWidth - The width it has to fit.
 * @param measureTextWidth - Measures a text in a font.
 * @returns The text itself when it fits; otherwise its longest beginning that
 *   fits together with the ellipsis, which can be the ellipsis alone.
 */
export function fitTextToWidth(
  text: string,
  font: string,
  maximumWidth: number,
  measureTextWidth: MeasureTextWidth,
): string {
  if (measureTextWidth(text, font) <= maximumWidth) {
    return text;
  }
  const characters = Array.from(text);
  for (let keptCount = characters.length - 1; keptCount > 0; keptCount--) {
    const shortened = `${characters.slice(0, keptCount).join('').trimEnd()}${ELLIPSIS}`;
    if (measureTextWidth(shortened, font) <= maximumWidth) {
      return shortened;
    }
  }
  return ELLIPSIS;
}

/**
 * Breaks a text into lines at its spaces, so that each line fits a width.
 *
 * @param text - The text to break.
 * @param font - The font it will be drawn in.
 * @param maximumWidth - The width every line has to fit.
 * @param maximumLineCount - How many lines there is room for; at least one.
 * @param measureTextWidth - Measures a text in a font.
 * @returns The lines, as few as the text needs. When the text needs more than
 *   there is room for, the last line holds the rest cut short with an
 *   ellipsis. A single word wider than a line is cut short in the same way.
 *   A text without any word gives no line.
 */
export function wrapTextToLines(
  text: string,
  font: string,
  maximumWidth: number,
  maximumLineCount: number,
  measureTextWidth: MeasureTextWidth,
): string[] {
  const words = text.split(/\s+/u).filter((word: string): boolean => word !== '');
  const lines: string[] = [];
  let currentLine = '';
  for (const [wordIndex, word] of words.entries()) {
    const extendedLine = currentLine === '' ? word : `${currentLine} ${word}`;
    if (currentLine === '' || measureTextWidth(extendedLine, font) <= maximumWidth) {
      currentLine = extendedLine;
      continue;
    }
    const isLastLine = lines.length === maximumLineCount - 1;
    if (isLastLine) {
      /* Everything that is left goes on this line, and is cut where the line ends. */
      currentLine = `${currentLine} ${words.slice(wordIndex).join(' ')}`;
      break;
    }
    lines.push(currentLine);
    currentLine = word;
  }
  if (currentLine !== '') {
    lines.push(currentLine);
  }
  return lines.map((line: string): string =>
    fitTextToWidth(line, font, maximumWidth, measureTextWidth),
  );
}
