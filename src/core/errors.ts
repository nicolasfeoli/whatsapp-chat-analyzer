/**
 * Turning something that was thrown into a sentence fit to show to the user.
 *
 * Shared by the page (reading a file) and the worker (analysing it), so both
 * follow the same rule about which thrown values carry a usable message.
 */

import { isRecord } from './type-guards';

/**
 * Picks the sentence to show for a value caught in a `catch` clause.
 *
 * JavaScript lets anything be thrown. An `Error` carries its explanation in
 * `message`, and so do the error-like objects of other realms and libraries
 * (a `DOMException` from another frame, a plain `{ message }` rejection), for
 * which `instanceof Error` is false. Every object with a non-empty string
 * `message` is therefore taken at its word; anything else (a bare string, a
 * number, `undefined`, an error without a message) gets the fallback.
 *
 * @param thrownValue - Whatever was thrown or rejected with.
 * @param fallbackMessage - The sentence to use when the value explains nothing.
 * @returns The value's own message when it has one, otherwise the fallback.
 */
export function describeThrownValue(thrownValue: unknown, fallbackMessage: string): string {
  if (!isRecord(thrownValue)) {
    return fallbackMessage;
  }
  const message = thrownValue['message'];
  if (typeof message !== 'string' || message === '') {
    return fallbackMessage;
  }
  return message;
}
