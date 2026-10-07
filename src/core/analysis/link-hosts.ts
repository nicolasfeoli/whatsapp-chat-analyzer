/**
 * Reads the site a link leads to, and nothing else of the link.
 *
 * A link in a chat can carry private things: the path of a shared document, a
 * search, an invitation code, a user name in front of the host. Only the name
 * of the site is kept, reduced to what looks like its registrable domain, so
 * `https://www.example.com/album/123?key=abc` becomes `example.com`.
 */

/** The scheme a link may start with: `http://` or `https://`, in any letter case. */
const SCHEME_PATTERN = /^https?:\/\//i;

/**
 * The end of the part of a link that names the server: the first `/`, `?` or
 * `#`. Everything from there on is the path, the query or the fragment.
 */
const END_OF_AUTHORITY_PATTERN = /[/?#]/;

/** What separates the user name some links carry (`user:password@host`) from the host. */
const USER_INFORMATION_SEPARATOR = '@';

/**
 * The run of characters at the start of a text that can belong to a host:
 * letters and digits of any script, dots and hyphens. It stops at the colon of
 * a port and at the punctuation a sentence puts after a link
 * (`example.com).`, `example.com,`).
 */
const LEADING_HOST_CHARACTERS_PATTERN = /^[\p{L}\p{N}.-]+/u;

/** Dots and hyphens at either end of a host, left over from a sentence: `example.com.`. */
const SURROUNDING_DOTS_AND_HYPHENS_PATTERN = /^[.-]+|[.-]+$/g;

/** What separates the labels of a host. */
const LABEL_SEPARATOR = '.';

/**
 * A label of a host: letters and digits of any script, with hyphens allowed
 * inside but not at either end.
 */
const HOST_LABEL_PATTERN = /^[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?$/u;

/**
 * The last label of a real host name: at least two letters (`com`, `es`), or
 * the encoded form of a top-level domain in another script (`xn--p1ai`). A
 * number there means the "host" is an address such as `192.168.0.1`, which is
 * not a site and can point at somebody's home network.
 */
const TOP_LEVEL_DOMAIN_PATTERN = /^(?:\p{L}{2,}|xn--[a-z0-9-]+)$/u;

/** The longest host name the domain name system allows, in characters. */
const LONGEST_HOST_NAME_LENGTH = 253;

/** A country's top-level domain has exactly this many letters (`uk`, `cr`, `ar`). */
const COUNTRY_CODE_LENGTH = 2;

/**
 * The labels many countries put between a name and their country code, so
 * that the registrable domain has three labels instead of two: `bbc.co.uk`,
 * `example.com.ar`, `example.go.cr`. A complete list is the Public Suffix
 * List, which is far too large to carry around for a bar chart; these are the
 * common ones, and a host under a rarer one is cut one label too short.
 */
const SECOND_LEVEL_LABELS_UNDER_COUNTRY_CODES: ReadonlySet<string> = new Set([
  'ac',
  'co',
  'com',
  'edu',
  'fi',
  'go',
  'gob',
  'gov',
  'mil',
  'ne',
  'net',
  'nom',
  'or',
  'org',
]);

/**
 * The labels in front of a site's name that only say which edition of the
 * site was opened: the ordinary one or the one for phones.
 */
const EDITION_LABELS: ReadonlySet<string> = new Set(['www', 'm']);

/** A registrable domain usually has this many labels: `example.com`. */
const USUAL_REGISTRABLE_LABEL_COUNT = 2;

/** Under a country code with a second-level label it has this many: `example.co.uk`. */
const LONGER_REGISTRABLE_LABEL_COUNT = 3;

/**
 * Cuts the part that names the server out of a link: no scheme, no user name,
 * no port, no path, no query, and none of the punctuation around it.
 */
function cutHostOutOfLink(link: string): string {
  const linkWithoutScheme = link.replace(SCHEME_PATTERN, '');
  const [authority = ''] = linkWithoutScheme.split(END_OF_AUTHORITY_PATTERN);
  const hostAndPort = authority.slice(authority.lastIndexOf(USER_INFORMATION_SEPARATOR) + 1);
  const [hostCharacters = ''] = LEADING_HOST_CHARACTERS_PATTERN.exec(hostAndPort) ?? [];
  return hostCharacters.replace(SURROUNDING_DOTS_AND_HYPHENS_PATTERN, '').toLowerCase();
}

/**
 * Tells whether the labels of a host make a name a site could have: at least
 * two of them, each well formed, and the last one a top-level domain.
 */
function areLabelsOfSite(labels: readonly string[]): boolean {
  const topLevelDomain = labels[labels.length - 1];
  if (labels.length < USUAL_REGISTRABLE_LABEL_COUNT || topLevelDomain === undefined) {
    return false;
  }
  if (!TOP_LEVEL_DOMAIN_PATTERN.test(topLevelDomain)) {
    return false;
  }
  return labels.every((label: string): boolean => HOST_LABEL_PATTERN.test(label));
}

/**
 * Takes `www.` and `m.` off the front of a host, as long as two labels are
 * left: `m.me` is a site of its own, not the phone edition of `me`.
 */
function removeEditionLabels(labels: readonly string[]): readonly string[] {
  let firstKeptIndex = 0;
  while (
    EDITION_LABELS.has(labels[firstKeptIndex] ?? '') &&
    labels.length - firstKeptIndex > USUAL_REGISTRABLE_LABEL_COUNT
  ) {
    firstKeptIndex += 1;
  }
  return labels.slice(firstKeptIndex);
}

/**
 * Tells how many labels, counted from the end, make the registrable domain.
 */
function countRegistrableLabels(labels: readonly string[]): number {
  const topLevelDomain = labels[labels.length - 1] ?? '';
  const secondLevelLabel = labels[labels.length - USUAL_REGISTRABLE_LABEL_COUNT] ?? '';
  const isUnderCountryCode = topLevelDomain.length === COUNTRY_CODE_LENGTH;
  const hasLongerSuffix =
    isUnderCountryCode && SECOND_LEVEL_LABELS_UNDER_COUNTRY_CODES.has(secondLevelLabel);
  if (hasLongerSuffix && labels.length >= LONGER_REGISTRABLE_LABEL_COUNT) {
    return LONGER_REGISTRABLE_LABEL_COUNT;
  }
  return USUAL_REGISTRABLE_LABEL_COUNT;
}

/**
 * Reads the site a link leads to.
 *
 * The host is lower-cased, loses `www.` and `m.` at its front, and is then
 * reduced to what looks like its registrable domain: the last two labels, or
 * the last three under a country code with a second-level label. That also
 * drops any other subdomain, which may name a person or a company
 * (`somebody.example.com`). The path, the query, a user name and a port are
 * never kept.
 *
 * @param link - One link as it stands in a message, starting with `http://`,
 *   `https://` or `www.`.
 * @returns For example `"example.com"` or `"bbc.co.uk"`; `null` when the link
 *   has no host that looks like a site, such as a bare address
 *   (`http://192.168.0.1`) or a single word (`http://localhost`).
 */
export function findSiteOfLink(link: string): string | null {
  const host = cutHostOutOfLink(link);
  if (host === '' || host.length > LONGEST_HOST_NAME_LENGTH) {
    return null;
  }

  const allLabels = host.split(LABEL_SEPARATOR);
  if (!areLabelsOfSite(allLabels)) {
    return null;
  }
  const labels = removeEditionLabels(allLabels);
  return labels.slice(-countRegistrableLabels(labels)).join(LABEL_SEPARATOR);
}
