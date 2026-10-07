/**
 * Emojis that are built from several code points, as named constants. Their
 * joiners, variation selectors and tag characters are invisible, so each one
 * is assembled from its code points and the comment says what it shows.
 */

/** U+FE0F, which asks for the colourful emoji form of the character before it. */
const VARIATION_SELECTOR_16 = 0xfe0f;

/** U+200D, the zero-width joiner that glues several emojis into one. */
const ZERO_WIDTH_JOINER = 0x200d;

/** U+20E3, the combining keycap drawn around a digit, `#` or `*`. */
const COMBINING_ENCLOSING_KEYCAP = 0x20e3;

/** U+1F3FD, the medium skin tone modifier. */
const MEDIUM_SKIN_TONE = 0x1f3fd;

/** The code point of the ASCII digit `1`. */
const DIGIT_ONE = 0x31;

/** The code point of `#`. */
const NUMBER_SIGN = 0x23;

/** The code point of `*`. */
const ASTERISK = 0x2a;

/** Face with tears of joy, a single code point. */
export const FACE_WITH_TEARS_OF_JOY = String.fromCodePoint(0x1f602);

/** Party popper, a single code point. */
export const PARTY_POPPER = String.fromCodePoint(0x1f389);

/** Red heart: a heart followed by the variation selector. */
export const RED_HEART = String.fromCodePoint(0x2764, VARIATION_SELECTOR_16);

/** Keycap 1 with the variation selector, as phones type it. */
export const KEYCAP_ONE = String.fromCodePoint(
  DIGIT_ONE,
  VARIATION_SELECTOR_16,
  COMBINING_ENCLOSING_KEYCAP,
);

/** Keycap # without the variation selector, as older keyboards type it. */
export const KEYCAP_NUMBER_SIGN_WITHOUT_VARIATION_SELECTOR = String.fromCodePoint(
  NUMBER_SIGN,
  COMBINING_ENCLOSING_KEYCAP,
);

/** Keycap * with the variation selector. */
export const KEYCAP_ASTERISK = String.fromCodePoint(
  ASTERISK,
  VARIATION_SELECTOR_16,
  COMBINING_ENCLOSING_KEYCAP,
);

/** The flag of Costa Rica: regional indicators C and R. */
export const FLAG_OF_COSTA_RICA = String.fromCodePoint(0x1f1e8, 0x1f1f7);

/** The flag of Spain: regional indicators E and S. */
export const FLAG_OF_SPAIN = String.fromCodePoint(0x1f1ea, 0x1f1f8);

/**
 * The flag of England: the black flag, the tag letters `gbeng` and the cancel
 * tag. Seven code points, one emoji.
 */
export const FLAG_OF_ENGLAND = String.fromCodePoint(
  0x1f3f4,
  0xe0067,
  0xe0062,
  0xe0065,
  0xe006e,
  0xe0067,
  0xe007f,
);

/** The plain black flag, which the flag of England starts with. */
export const BLACK_FLAG = String.fromCodePoint(0x1f3f4);

/** Family of man, woman and girl: three people joined by zero-width joiners. */
export const FAMILY_MAN_WOMAN_GIRL = String.fromCodePoint(
  0x1f468,
  ZERO_WIDTH_JOINER,
  0x1f469,
  ZERO_WIDTH_JOINER,
  0x1f467,
);

/** Thumbs up with the medium skin tone modifier. */
export const THUMBS_UP_MEDIUM_SKIN_TONE = String.fromCodePoint(0x1f44d, MEDIUM_SKIN_TONE);

/** Woman technologist with medium skin tone: a person, a skin tone, a joiner and a laptop. */
export const WOMAN_TECHNOLOGIST_MEDIUM_SKIN_TONE = String.fromCodePoint(
  0x1f469,
  MEDIUM_SKIN_TONE,
  ZERO_WIDTH_JOINER,
  0x1f4bb,
);

/** Heart on fire: a heart, the variation selector, a joiner and a flame. */
export const HEART_ON_FIRE = String.fromCodePoint(
  0x2764,
  VARIATION_SELECTOR_16,
  ZERO_WIDTH_JOINER,
  0x1f525,
);
