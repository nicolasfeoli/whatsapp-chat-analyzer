/**
 * The floating tooltip that follows the pointer over the charts.
 *
 * One element (`#tooltip`) is shared by every chart. Placement is a pure
 * function of the pointer position, the tooltip size and the viewport size, so
 * it can be tested without a browser.
 */

import { html, setInnerHtml } from './html';
import type { SafeHtml } from './html';

/**
 * Distance in pixels between the pointer and the nearest corner of the
 * tooltip, so the pointer does not cover the text it is pointing at.
 */
const POINTER_OFFSET_IN_PIXELS = 14;

/** The tooltip keeps at least this many pixels away from the edges of the viewport. */
const VIEWPORT_MARGIN_IN_PIXELS = 8;

/** Where the pointer is, in viewport coordinates (`clientX` and `clientY`). */
export interface PointerPosition {
  readonly clientX: number;
  readonly clientY: number;
}

/** A width and a height in pixels. */
export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

/** The top-left corner of the tooltip, in viewport coordinates. */
export interface TooltipPlacement {
  readonly left: number;
  readonly top: number;
}

/** Shows and hides the shared tooltip. */
export interface Tooltip {
  /**
   * Shows the tooltip next to the pointer.
   *
   * @param content - The markup to show; anything from the chat is already escaped.
   * @param pointerPosition - Where the pointer is.
   */
  show(content: SafeHtml, pointerPosition: PointerPosition): void;
  /** Hides the tooltip. */
  hide(): void;
}

/**
 * Draws the heading of a tooltip.
 *
 * @param title - What the tooltip is about, already escaped.
 * @returns A `<div class="tooltip-title">` element as markup.
 */
export function renderTooltipTitle(title: SafeHtml): SafeHtml {
  return html`<div class="tooltip-title">${title}</div>`;
}

/**
 * Draws one row of a tooltip: a label on the left and its number on the right.
 *
 * @param label - What the number counts, already escaped; may contain a colour swatch.
 * @param formattedValue - The number as it should be shown, already escaped.
 * @returns A `<div class="tooltip-row">` element as markup.
 */
export function renderTooltipRow(label: SafeHtml, formattedValue: SafeHtml): SafeHtml {
  return html`<div class="tooltip-row"><span>${label}</span><b>${formattedValue}</b></div>`;
}

/**
 * Places the tooltip along one axis: after the pointer, or before it when it
 * would otherwise leave the viewport, and never closer to the near edge than
 * the margin.
 *
 * @param pointerCoordinate - The pointer's position along the axis.
 * @param tooltipLength - The tooltip's size along the axis.
 * @param viewportLength - The viewport's size along the axis.
 * @returns The coordinate of the tooltip's near edge.
 */
function placeAlongAxis(
  pointerCoordinate: number,
  tooltipLength: number,
  viewportLength: number,
): number {
  const coordinateAfterPointer = pointerCoordinate + POINTER_OFFSET_IN_PIXELS;
  const overflowsFarEdge =
    coordinateAfterPointer + tooltipLength > viewportLength - VIEWPORT_MARGIN_IN_PIXELS;
  if (!overflowsFarEdge) {
    return Math.max(VIEWPORT_MARGIN_IN_PIXELS, coordinateAfterPointer);
  }

  const coordinateBeforePointer = pointerCoordinate - tooltipLength - POINTER_OFFSET_IN_PIXELS;
  return Math.max(VIEWPORT_MARGIN_IN_PIXELS, coordinateBeforePointer);
}

/**
 * Decides where the tooltip goes: below and to the right of the pointer, or
 * flipped to the other side when it would leave the viewport.
 *
 * @param pointerPosition - Where the pointer is.
 * @param tooltipSize - The rendered size of the tooltip.
 * @param viewportSize - The size of the browser viewport.
 * @returns The top-left corner to give the tooltip.
 */
export function computeTooltipPlacement(
  pointerPosition: PointerPosition,
  tooltipSize: PixelSize,
  viewportSize: PixelSize,
): TooltipPlacement {
  return {
    left: placeAlongAxis(pointerPosition.clientX, tooltipSize.width, viewportSize.width),
    top: placeAlongAxis(pointerPosition.clientY, tooltipSize.height, viewportSize.height),
  };
}

/**
 * Wraps the tooltip element in functions that show and hide it.
 *
 * @param tooltipElement - The fixed-position element that holds the tooltip.
 * @returns The tooltip controller.
 */
export function createTooltip(tooltipElement: HTMLElement): Tooltip {
  function show(content: SafeHtml, pointerPosition: PointerPosition): void {
    setInnerHtml(tooltipElement, content);
    /* The element must be visible before it can be measured. */
    tooltipElement.hidden = false;

    const tooltipSize = tooltipElement.getBoundingClientRect();
    const viewportSize: PixelSize = { width: window.innerWidth, height: window.innerHeight };
    const placement = computeTooltipPlacement(pointerPosition, tooltipSize, viewportSize);

    tooltipElement.style.left = `${placement.left}px`;
    tooltipElement.style.top = `${placement.top}px`;
  }

  function hide(): void {
    tooltipElement.hidden = true;
  }

  return { show, hide };
}
