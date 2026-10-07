/**
 * Picking the most frequent entries of a count table, adding counts up, and
 * dividing them with care.
 */

/** One key of a count table together with how often it occurred. */
export interface CountedEntry<Key> {
  readonly key: Key;
  readonly count: number;
}

/**
 * Finds the entries with the highest counts.
 *
 * The sort is stable, so entries with equal counts keep the order in which
 * they were first seen in the chat.
 *
 * @param counts - How often each key occurred.
 * @param limit - How many entries to return at most.
 * @returns The most frequent entries, highest count first.
 */
export function selectMostFrequent<Key>(
  counts: ReadonlyMap<Key, number>,
  limit: number,
): CountedEntry<Key>[] {
  const entries: CountedEntry<Key>[] = [];
  for (const [key, count] of counts) {
    entries.push({ key, count });
  }
  entries.sort(
    (firstEntry: CountedEntry<Key>, secondEntry: CountedEntry<Key>): number =>
      secondEntry.count - firstEntry.count,
  );
  return entries.slice(0, limit);
}

/**
 * Adds up a list of numbers.
 *
 * @param values - The numbers to add.
 * @returns Their sum; zero for an empty list.
 */
export function sumOf(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
}

/**
 * Divides one count by another, provided the divisor is large enough for the
 * ratio to mean something. A share of "50% of their messages" is noise when
 * the person sent two.
 *
 * @param numerator - The count being measured, e.g. messages containing a laugh.
 * @param denominator - The count it is measured against, e.g. all typed messages.
 * @param minimumDenominator - The smallest denominator worth dividing by.
 * @returns The ratio, or `null` when the denominator is below the minimum.
 */
export function ratioWhenAtLeast(
  numerator: number,
  denominator: number,
  minimumDenominator: number,
): number | null {
  if (denominator < minimumDenominator) {
    return null;
  }
  return numerator / denominator;
}
