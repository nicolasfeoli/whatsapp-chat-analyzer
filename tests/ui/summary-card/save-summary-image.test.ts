import { describe, expect, it } from 'vitest';

import { collectSummaryCardContent } from '../../../src/ui/summary-card/content';
import {
  SUMMARY_CARD_FONTS,
  SUMMARY_CARD_HEIGHT,
  SUMMARY_CARD_WIDTH,
} from '../../../src/ui/summary-card/layout';
import {
  SUMMARY_IMAGE_FILE_NAME,
  saveSummaryImage,
} from '../../../src/ui/summary-card/save-summary-image';
import type { SummaryImageServices } from '../../../src/ui/summary-card/save-summary-image';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { createRecordingSummaryImageServices } from '../../fixtures/summary-image';

/** The content of the image of a chat between Ana and Bob. */
const content = collectSummaryCardContent(
  chatAnalysis({
    people: [
      personStatistics({ name: 'Ana', messageCount: 30 }),
      personStatistics({ name: 'Bob', messageCount: 10 }),
    ],
  }),
  'Ana and Bob',
  'most-active',
);

describe('saveSummaryImage', () => {
  it('draws on a surface of the size of the image', async () => {
    const browser = createRecordingSummaryImageServices();

    await saveSummaryImage(content, browser.services);

    expect(browser.surfaceSizes).toEqual([[SUMMARY_CARD_WIDTH, SUMMARY_CARD_HEIGHT]]);
  });

  it('draws the headline numbers of the chat', async () => {
    const browser = createRecordingSummaryImageServices();

    await saveSummaryImage(content, browser.services);

    expect(browser.context.writtenTexts()).toEqual(
      expect.arrayContaining(['Ana and Bob', '40', 'messages', 'Ana', '30 · 75%', 'Bob']),
    );
  });

  it('saves the picture as a PNG file under a name without the chat in it', async () => {
    const browser = createRecordingSummaryImageServices();

    const outcome = await saveSummaryImage(content, browser.services);

    expect(outcome).toBe('saved');
    expect(browser.savedFiles).toHaveLength(1);
    expect(browser.savedFiles[0]?.fileName).toBe('chat-summary.png');
    expect(browser.savedFiles[0]?.content.type).toBe('image/png');
    expect(SUMMARY_IMAGE_FILE_NAME).not.toContain('Ana');
  });

  it('asks for the fonts of the image before it draws', async () => {
    const browser = createRecordingSummaryImageServices();
    let drawnWhenFontsWereAsked: number | null = null;
    const services: SummaryImageServices = {
      ...browser.services,
      loadFonts: (fontRequests) => {
        drawnWhenFontsWereAsked = browser.context.drawn.length;
        return browser.services.loadFonts(fontRequests);
      },
    };

    await saveSummaryImage(content, services);

    expect(drawnWhenFontsWereAsked).toBe(0);
    expect(browser.fontRequests.map((fontRequest) => fontRequest.font)).toEqual(
      Object.values(SUMMARY_CARD_FONTS),
    );
  });

  it('draws and saves the image all the same when the fonts do not load', async () => {
    const browser = createRecordingSummaryImageServices({ canLoadFonts: false });

    const outcome = await saveSummaryImage(content, browser.services);

    expect(outcome).toBe('saved');
    expect(browser.context.writtenTexts()).toContain('Ana and Bob');
    expect(browser.savedFiles).toHaveLength(1);
  });

  it('saves nothing in a browser that cannot draw', async () => {
    const browser = createRecordingSummaryImageServices({ canDraw: false });

    const outcome = await saveSummaryImage(content, browser.services);

    expect(outcome).toBe('cannot-draw');
    expect(browser.savedFiles).toEqual([]);
    expect(browser.fontRequests).toEqual([]);
  });

  it('saves nothing when the drawing cannot be turned into a picture', async () => {
    const browser = createRecordingSummaryImageServices({ canEncode: false });

    const outcome = await saveSummaryImage(content, browser.services);

    expect(outcome).toBe('cannot-draw');
    expect(browser.savedFiles).toEqual([]);
  });
});
