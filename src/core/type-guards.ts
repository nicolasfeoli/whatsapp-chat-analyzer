/**
 * Run-time checks that narrow a value of unknown type.
 */

/**
 * Type guard for a non-null object whose properties can be looked up by name.
 * It is the first step in reading anything from a value the code did not
 * create itself: something that was thrown, or an object of a library whose
 * internals are not part of its types.
 *
 * @param value - Any value.
 * @returns Whether the value is an object (arrays and class instances included) and not `null`.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
