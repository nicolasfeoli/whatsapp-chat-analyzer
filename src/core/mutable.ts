/**
 * The writable counterpart of the read-only result types.
 *
 * Results are handed out as `readonly` so nobody changes a finished analysis,
 * but the code that builds them has to add to counts, push to lists and fill
 * maps. Rather than restating every field of a result type without its
 * `readonly`, the builders derive their working type from the result type, so
 * the two cannot drift apart.
 */

/**
 * The writable form of one property: a read-only array becomes an array, a
 * read-only map becomes a map, and everything else is left as it is.
 */
type MutableProperty<Property> =
  Property extends ReadonlyMap<infer Key, infer Value>
    ? Map<Key, Value>
    : Property extends readonly (infer Item)[]
      ? Item[]
      : Property;

/**
 * An object type with `readonly` removed from every property, and with its
 * read-only arrays and maps made writable. One level deep: the items of an
 * array and the values of a map keep their own types.
 */
export type Mutable<ObjectType> = {
  -readonly [Key in keyof ObjectType]: MutableProperty<ObjectType[Key]>;
};
