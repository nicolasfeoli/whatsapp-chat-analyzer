// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { html } from '../../src/ui/html';
import {
  computeTooltipPlacement,
  createTooltip,
  renderTooltipRow,
  renderTooltipTitle,
} from '../../src/ui/tooltip';
import type { PixelSize } from '../../src/ui/tooltip';

/** A viewport the size of a small laptop screen. */
const VIEWPORT: PixelSize = { width: 1000, height: 600 };

/** A tooltip of a typical size. */
const TOOLTIP: PixelSize = { width: 200, height: 100 };

describe('computeTooltipPlacement', () => {
  it('puts the tooltip 14 pixels below and to the right of the pointer', () => {
    const placement = computeTooltipPlacement({ clientX: 100, clientY: 100 }, TOOLTIP, VIEWPORT);

    expect(placement).toEqual({ left: 114, top: 114 });
  });

  describe('near the right edge', () => {
    it('flips the tooltip to the left of the pointer when it would cross the margin', () => {
      const placement = computeTooltipPlacement({ clientX: 900, clientY: 100 }, TOOLTIP, VIEWPORT);

      expect(placement).toEqual({ left: 900 - 200 - 14, top: 114 });
    });

    it('keeps the tooltip on the right while it exactly touches the 8 pixel margin', () => {
      /* 778 + 14 + 200 = 992, which is the viewport width minus the margin. */
      const placement = computeTooltipPlacement({ clientX: 778, clientY: 100 }, TOOLTIP, VIEWPORT);

      expect(placement.left).toBe(792);
    });

    it('flips one pixel later', () => {
      const placement = computeTooltipPlacement({ clientX: 779, clientY: 100 }, TOOLTIP, VIEWPORT);

      expect(placement.left).toBe(779 - 200 - 14);
    });
  });

  describe('near the bottom edge', () => {
    it('flips the tooltip above the pointer when it would cross the margin', () => {
      const placement = computeTooltipPlacement({ clientX: 100, clientY: 550 }, TOOLTIP, VIEWPORT);

      expect(placement).toEqual({ left: 114, top: 550 - 100 - 14 });
    });

    it('keeps the tooltip below while it exactly touches the margin', () => {
      const placement = computeTooltipPlacement({ clientX: 100, clientY: 478 }, TOOLTIP, VIEWPORT);

      expect(placement.top).toBe(492);
    });
  });

  it('flips both ways in the bottom right corner', () => {
    const placement = computeTooltipPlacement({ clientX: 990, clientY: 590 }, TOOLTIP, VIEWPORT);

    expect(placement).toEqual({ left: 776, top: 476 });
  });

  describe('a viewport too small for the tooltip', () => {
    const narrowViewport: PixelSize = { width: 220, height: 110 };

    it('never places the tooltip closer than 8 pixels to the left edge', () => {
      const placement = computeTooltipPlacement(
        { clientX: 100, clientY: 10 },
        TOOLTIP,
        narrowViewport,
      );

      expect(placement.left).toBe(8);
    });

    it('never places the tooltip closer than 8 pixels to the top edge', () => {
      const placement = computeTooltipPlacement(
        { clientX: 10, clientY: 50 },
        TOOLTIP,
        narrowViewport,
      );

      expect(placement.top).toBe(8);
    });
  });
});

describe('renderTooltipTitle', () => {
  it('draws the title in its own element', () => {
    expect(renderTooltipTitle(html`Monday, 20:00 to 20:59`)).toBe(
      '<div class="tooltip-title">Monday, 20:00 to 20:59</div>',
    );
  });
});

describe('renderTooltipRow', () => {
  it('draws the label and the value side by side', () => {
    expect(renderTooltipRow(html`Messages`, html`1,234`)).toBe(
      '<div class="tooltip-row"><span>Messages</span><b>1,234</b></div>',
    );
  });
});

describe('createTooltip', () => {
  let tooltipElement: HTMLElement;

  beforeEach(() => {
    tooltipElement = document.createElement('div');
    tooltipElement.hidden = true;
    document.body.append(tooltipElement);
    vi.stubGlobal('innerWidth', VIEWPORT.width);
    vi.stubGlobal('innerHeight', VIEWPORT.height);
  });

  afterEach(() => {
    tooltipElement.remove();
    vi.unstubAllGlobals();
  });

  it('shows the content and reveals the element', () => {
    const tooltip = createTooltip(tooltipElement);

    tooltip.show(renderTooltipTitle(html`Monday`), { clientX: 100, clientY: 100 });

    expect(tooltipElement.hidden).toBe(false);
    expect(tooltipElement.querySelector('.tooltip-title')?.textContent).toBe('Monday');
  });

  it('positions the element next to the pointer', () => {
    const tooltip = createTooltip(tooltipElement);

    tooltip.show(html`Monday`, { clientX: 100, clientY: 200 });

    expect(tooltipElement.style.left).toBe('114px');
    expect(tooltipElement.style.top).toBe('214px');
  });

  it('uses the measured size of the element to stay inside the viewport', () => {
    vi.spyOn(tooltipElement, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, TOOLTIP.width, TOOLTIP.height),
    );
    const tooltip = createTooltip(tooltipElement);

    tooltip.show(html`Monday`, { clientX: 990, clientY: 590 });

    expect(tooltipElement.style.left).toBe('776px');
    expect(tooltipElement.style.top).toBe('476px');
  });

  it('replaces the content of the previous show', () => {
    const tooltip = createTooltip(tooltipElement);

    tooltip.show(html`Monday`, { clientX: 100, clientY: 100 });
    tooltip.show(html`Tuesday`, { clientX: 100, clientY: 100 });

    expect(tooltipElement.textContent).toBe('Tuesday');
  });

  it('hides the element', () => {
    const tooltip = createTooltip(tooltipElement);
    tooltip.show(html`Monday`, { clientX: 100, clientY: 100 });

    tooltip.hide();

    expect(tooltipElement.hidden).toBe(true);
  });
});
