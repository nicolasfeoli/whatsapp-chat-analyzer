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
    reportContainer: getRequiredElement('report', HTMLElement),
    tooltip: getRequiredElement('tooltip', HTMLElement),
  };
}
