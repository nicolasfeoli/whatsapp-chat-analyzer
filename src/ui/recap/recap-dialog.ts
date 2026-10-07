/**
 * The recap on the page: the row that offers it, with its choice of year, and
 * the dialog that shows one card at a time with Back, Next and Close.
 *
 * This module only moves between cards it was handed and looks after the
 * keyboard and the focus. Which years exist, what the cards say and when the
 * year is analysed is decided elsewhere (`years.ts`, `cards.ts` and
 * `page-controller.ts`).
 */

import type { PageElements } from '../dom';
import { setInnerHtml } from '../html';
import type { RecapCard } from './cards';
import {
  describeOpenRecapButton,
  describeRecapPosition,
  describeRecapTitle,
  renderRecapCard,
} from './render';
import type { YearSummary } from './years';

/** The elements of the recap: the row that offers it and the dialog. */
export type RecapElements = Pick<
  PageElements,
  | 'recapEntry'
  | 'recapYearChoice'
  | 'recapYearSelect'
  | 'openRecapButton'
  | 'recapOverlay'
  | 'recapPanel'
  | 'recapTitle'
  | 'recapCard'
  | 'recapPosition'
  | 'recapBackButton'
  | 'recapNextButton'
  | 'recapCloseButton'
>;

/** The recap as the page controller steers it. */
export interface RecapDialog {
  /**
   * Prepares the row that offers the recap for a chat that has just been
   * shown: lists its years and proposes one, or hides the row when no year
   * has enough messages.
   *
   * @param recapYears - The years a recap can be told for, oldest first.
   * @param proposedYear - The year selected at first; `null` when there is none.
   */
  offerYears(recapYears: readonly YearSummary[], proposedYear: number | null): void;
  /**
   * Reads the year the reader has chosen.
   *
   * @returns The year, or `null` when none is on offer.
   */
  readChosenYear(): number | null;
  /**
   * Opens the dialog on the first card and moves the focus into it.
   *
   * @param year - The year the cards are about.
   * @param cards - The cards, in the order they are shown; never empty.
   */
  open(year: number, cards: readonly RecapCard[]): void;
  /**
   * Closes the dialog.
   *
   * @param focusAfterwards - `'entry-button'` gives the focus back to the
   *   button that opened the dialog, as when the reader closes it;
   *   `'unchanged'` leaves the focus where it is, as when another chat
   *   replaces the one the recap was about.
   */
  close(focusAfterwards: 'entry-button' | 'unchanged'): void;
  /** Whether the dialog is on display. */
  isOpen(): boolean;
}

/**
 * Connects the elements of the recap and returns the handle to steer them.
 * The listeners are attached once; opening and closing only shows and hides.
 *
 * @param elements - The elements of the row and of the dialog.
 * @returns The recap, closed.
 */
export function createRecapDialog(elements: RecapElements): RecapDialog {
  const {
    recapEntry,
    recapYearChoice,
    recapYearSelect,
    openRecapButton,
    recapOverlay,
    recapPanel,
    recapTitle,
    recapCard,
    recapPosition,
    recapBackButton,
    recapNextButton,
    recapCloseButton,
  } = elements;

  /** The cards of the recap on display; empty while the dialog is closed. */
  let displayedCards: readonly RecapCard[] = [];
  /** The position, in `displayedCards`, of the card on display. */
  let displayedCardIndex = 0;

  /** Writes the year of the selected entry onto the button that opens the recap. */
  function showChosenYearOnButton(): void {
    openRecapButton.textContent = describeOpenRecapButton(Number(recapYearSelect.value));
  }

  /**
   * Draws the card at a position and brings the buttons in step with it. A
   * button that has nowhere to go is disabled; when that button held the
   * focus, the focus moves to the dialog so the arrow keys keep working.
   */
  function showCard(cardIndex: number): void {
    const card = displayedCards[cardIndex];
    if (card === undefined) {
      return;
    }
    displayedCardIndex = cardIndex;
    setInnerHtml(recapCard, renderRecapCard(card));
    recapPosition.textContent = describeRecapPosition(cardIndex, displayedCards.length);
    recapBackButton.disabled = cardIndex === 0;
    recapNextButton.disabled = cardIndex === displayedCards.length - 1;

    const focusedElement = recapPanel.ownerDocument.activeElement;
    const isFocusOnDisabledButton =
      (focusedElement === recapBackButton && recapBackButton.disabled) ||
      (focusedElement === recapNextButton && recapNextButton.disabled);
    if (isFocusOnDisabledButton) {
      recapPanel.focus();
    }
  }

  function close(focusAfterwards: 'entry-button' | 'unchanged'): void {
    const wasOpen = !recapOverlay.hidden;
    recapOverlay.hidden = true;
    displayedCards = [];
    displayedCardIndex = 0;
    if (wasOpen && focusAfterwards === 'entry-button') {
      openRecapButton.focus();
    }
  }

  /**
   * Keeps the Tab key inside the dialog: from the last control it goes to the
   * first, and backwards from the first (or from the dialog itself) to the last.
   */
  function keepFocusInside(event: KeyboardEvent): void {
    const controls = [recapCloseButton, recapBackButton, recapNextButton].filter(
      (button: HTMLButtonElement): boolean => !button.disabled,
    );
    const firstControl = controls[0];
    const lastControl = controls[controls.length - 1];
    if (firstControl === undefined || lastControl === undefined) {
      return;
    }
    const focusedElement = recapPanel.ownerDocument.activeElement;
    if (event.shiftKey && (focusedElement === firstControl || focusedElement === recapPanel)) {
      event.preventDefault();
      lastControl.focus();
    } else if (!event.shiftKey && focusedElement === lastControl) {
      event.preventDefault();
      firstControl.focus();
    }
  }

  recapYearSelect.addEventListener('change', showChosenYearOnButton);
  recapBackButton.addEventListener('click', (): void => {
    showCard(displayedCardIndex - 1);
  });
  recapNextButton.addEventListener('click', (): void => {
    showCard(displayedCardIndex + 1);
  });
  recapCloseButton.addEventListener('click', (): void => {
    close('entry-button');
  });
  /* A press on the dimmed page around the panel closes the dialog; one inside the panel does not. */
  recapOverlay.addEventListener('click', (event: MouseEvent): void => {
    if (event.target === recapOverlay) {
      close('entry-button');
    }
  });
  recapPanel.addEventListener('keydown', (event: KeyboardEvent): void => {
    switch (event.key) {
      case 'ArrowRight':
        showCard(displayedCardIndex + 1);
        break;
      case 'ArrowLeft':
        showCard(displayedCardIndex - 1);
        break;
      case 'Escape':
        close('entry-button');
        break;
      case 'Tab':
        keepFocusInside(event);
        break;
      default:
        break;
    }
  });

  return {
    offerYears(recapYears: readonly YearSummary[], proposedYear: number | null): void {
      recapEntry.hidden = recapYears.length === 0 || proposedYear === null;
      /* A single year leaves nothing to choose; the button names it. */
      recapYearChoice.hidden = recapYears.length < 2;

      recapYearSelect.replaceChildren();
      /* Newest first, the order in which a reader looks for a year. */
      for (const summary of [...recapYears].reverse()) {
        const option = recapYearSelect.ownerDocument.createElement('option');
        option.value = String(summary.year);
        option.textContent = String(summary.year);
        recapYearSelect.append(option);
      }
      if (proposedYear !== null) {
        recapYearSelect.value = String(proposedYear);
        showChosenYearOnButton();
      }
    },

    readChosenYear(): number | null {
      return recapYearSelect.value === '' ? null : Number(recapYearSelect.value);
    },

    open(year: number, cards: readonly RecapCard[]): void {
      displayedCards = cards;
      recapTitle.textContent = describeRecapTitle(year);
      recapOverlay.hidden = false;
      showCard(0);
      recapPanel.focus();
    },

    close,

    isOpen(): boolean {
      return !recapOverlay.hidden;
    },
  };
}
