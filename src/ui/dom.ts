/**
 * Finds the fixed elements of `index.html` once, with their types checked.
 *
 * The page script cannot work without these elements, so a missing or
 * mistyped one is reported immediately and by name, instead of surfacing later
 * as "cannot read properties of null".
 */

/** A constructor of an element class, such as `HTMLButtonElement`. */
type ElementConstructor<ElementType extends HTMLElement> = new () => ElementType;

/** The elements of `index.html` that the page script reads or changes. */
export interface PageElements {
  /** The box around the file picker; highlighted while a file is dragged over the page. */
  readonly loader: HTMLElement;
  /** The visible "Choose export file" button. */
  readonly chooseFileButton: HTMLButtonElement;
  /** The hidden file input the button opens. */
  readonly fileInput: HTMLInputElement;
  /** The status line that says what is happening or what went wrong. */
  readonly statusLine: HTMLElement;
  /** The line that says what was read from the file and what was skipped. */
  readonly parseReport: HTMLElement;
  /** The note that the chat on display is an invented example. */
  readonly sampleNote: HTMLElement;
  /** The row with the date-order hint and its "Switch" button. */
  readonly dateOrderRow: HTMLElement;
  /** The text of the date-order hint. */
  readonly dateOrderMessage: HTMLElement;
  /** The "Switch" button that re-reads the file with the other date order. */
  readonly switchDateOrderButton: HTMLButtonElement;
  /** The checkbox that replaces names by neutral labels and hides message text. */
  readonly hideNamesCheckbox: HTMLInputElement;
  /** The row of the "show everyone" checkbox; hidden for a chat in which nobody is left out. */
  readonly showEveryoneRow: HTMLElement;
  /** The checkbox that lists everyone in the report instead of the most active people. */
  readonly showEveryoneCheckbox: HTMLInputElement;
  /** The row with the period list and the two date fields; hidden for a chat too short to be worth dividing. */
  readonly periodRow: HTMLElement;
  /** The list of ready-made periods: the whole chat, the last twelve months, each calendar year. */
  readonly periodSelect: HTMLSelectElement;
  /** The date field with the first day of the period. */
  readonly periodFromInput: HTMLInputElement;
  /** The date field with the last day of the period. */
  readonly periodToInput: HTMLInputElement;
  /** The note that says which days the report shows, while that is not the whole chat. */
  readonly periodNote: HTMLElement;
  /** The button that draws the headline numbers as one picture and saves it as a PNG file. */
  readonly saveSummaryImageButton: HTMLButtonElement;
  /** The button that opens the browser's print dialog, from which the report can be saved as a PDF. */
  readonly printButton: HTMLButtonElement;
  /** The row that offers the recap of a year; hidden for a chat in which no year has enough messages. */
  readonly recapEntry: HTMLElement;
  /** The label and the list of years together; hidden when a single year is on offer. */
  readonly recapYearChoice: HTMLElement;
  /** The list of the years a recap can be opened for. */
  readonly recapYearSelect: HTMLSelectElement;
  /** The button that opens the recap of the chosen year. */
  readonly openRecapButton: HTMLButtonElement;
  /** The dimmed layer over the page that holds the recap; hidden while the recap is closed. */
  readonly recapOverlay: HTMLElement;
  /** The dialog of the recap, which takes the focus and the keys while it is open. */
  readonly recapPanel: HTMLElement;
  /** The title of the recap, which names the year. */
  readonly recapTitle: HTMLElement;
  /** The element the card on display is drawn into. */
  readonly recapCard: HTMLElement;
  /** The line that says which card of how many is on display. */
  readonly recapPosition: HTMLElement;
  /** The button that goes to the card before. */
  readonly recapBackButton: HTMLButtonElement;
  /** The button that goes to the next card. */
  readonly recapNextButton: HTMLButtonElement;
  /** The button that closes the recap. */
  readonly recapCloseButton: HTMLButtonElement;
  /** The container the report is rendered into. */
  readonly reportContainer: HTMLElement;
  /** The floating tooltip shared by the charts. */
  readonly tooltip: HTMLElement;
}

/**
 * Looks up an element by its `id` and checks that it is of the expected kind.
 *
 * @param elementId - The `id` attribute to look for.
 * @param expectedConstructor - The element class it must be an instance of.
 * @returns The element, typed as that class.
 * @throws When no element has the `id`, or it is of another kind.
 */
export function getRequiredElement<ElementType extends HTMLElement>(
  elementId: string,
  expectedConstructor: ElementConstructor<ElementType>,
): ElementType {
  const element = document.getElementById(elementId);
  if (!(element instanceof expectedConstructor)) {
    throw new Error(
      `index.html has no element with id "${elementId}" of type ${expectedConstructor.name}.`,
    );
  }
  return element;
}

/**
 * Finds every element the page script works with.
 *
 * @returns The elements, by role.
 * @throws When `index.html` and this list have drifted apart.
 */
export function findPageElements(): PageElements {
  return {
    loader: getRequiredElement('loader', HTMLElement),
    chooseFileButton: getRequiredElement('choose-file-button', HTMLButtonElement),
    fileInput: getRequiredElement('file-input', HTMLInputElement),
    statusLine: getRequiredElement('status-line', HTMLElement),
    parseReport: getRequiredElement('parse-report', HTMLElement),
    sampleNote: getRequiredElement('sample-note', HTMLElement),
    dateOrderRow: getRequiredElement('date-order-row', HTMLElement),
    dateOrderMessage: getRequiredElement('date-order-message', HTMLElement),
    switchDateOrderButton: getRequiredElement('switch-date-order-button', HTMLButtonElement),
    hideNamesCheckbox: getRequiredElement('hide-names-checkbox', HTMLInputElement),
    showEveryoneRow: getRequiredElement('show-everyone-row', HTMLElement),
    showEveryoneCheckbox: getRequiredElement('show-everyone-checkbox', HTMLInputElement),
    periodRow: getRequiredElement('period-row', HTMLElement),
    periodSelect: getRequiredElement('period-select', HTMLSelectElement),
    periodFromInput: getRequiredElement('period-from-input', HTMLInputElement),
    periodToInput: getRequiredElement('period-to-input', HTMLInputElement),
    periodNote: getRequiredElement('period-note', HTMLElement),
    saveSummaryImageButton: getRequiredElement('save-summary-image-button', HTMLButtonElement),
    printButton: getRequiredElement('print-button', HTMLButtonElement),
    recapEntry: getRequiredElement('recap-entry', HTMLElement),
    recapYearChoice: getRequiredElement('recap-year-choice', HTMLElement),
    recapYearSelect: getRequiredElement('recap-year-select', HTMLSelectElement),
    openRecapButton: getRequiredElement('open-recap-button', HTMLButtonElement),
    recapOverlay: getRequiredElement('recap-overlay', HTMLElement),
    recapPanel: getRequiredElement('recap-panel', HTMLElement),
    recapTitle: getRequiredElement('recap-title', HTMLElement),
    recapCard: getRequiredElement('recap-card', HTMLElement),
    recapPosition: getRequiredElement('recap-position', HTMLElement),
    recapBackButton: getRequiredElement('recap-back-button', HTMLButtonElement),
    recapNextButton: getRequiredElement('recap-next-button', HTMLButtonElement),
    recapCloseButton: getRequiredElement('recap-close-button', HTMLButtonElement),
    reportContainer: getRequiredElement('report', HTMLElement),
    tooltip: getRequiredElement('tooltip', HTMLElement),
  };
}
