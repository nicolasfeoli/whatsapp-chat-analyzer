import { describe, expect, it } from 'vitest';

import {
  countOccurrencesInText,
  monthKeyFromDate,
  normaliseForSearch,
  parseSearchQuery,
  searchMessages,
  yearFromMonthKey,
} from '../../../src/core/analysis/word-search';
import type { WordSearchResult } from '../../../src/core/analysis/word-search';
import type { ChatMessage } from '../../../src/core/types';
import { FACE_WITH_TEARS_OF_JOY } from '../../fixtures/emojis';
import { deletedMessage, localTime, mediaMessage, textMessage } from '../../fixtures/messages';

/** U+2068 and U+2069, the invisible marks an iPhone export puts around a mentioned name. */
const FIRST_STRONG_ISOLATE = '⁨';
const POP_DIRECTIONAL_ISOLATE = '⁩';

/** U+0301, the combining acute accent: "e" followed by it is "é" written in two parts. */
const COMBINING_ACUTE_ACCENT = '́';

/**
 * Counts a query in one text, the way the page does: the query goes through
 * `parseSearchQuery` first.
 */
function countInText(text: string, query: string): number {
  return countOccurrencesInText(text, parseSearchQuery(query));
}

/**
 * Searches messages for a query, the way the page does.
 */
function search(messages: readonly ChatMessage[], query: string): WordSearchResult {
  return searchMessages(messages, parseSearchQuery(query));
}

describe('normaliseForSearch', () => {
  it('writes capitals in lower case', () => {
    expect(normaliseForSearch('Hola QUÉ tal')).toBe('hola que tal');
  });

  it.each([
    { accented: 'qué', plain: 'que' },
    { accented: 'mañana', plain: 'manana' },
    { accented: 'pingüino', plain: 'pinguino' },
    { accented: 'crème brûlée', plain: 'creme brulee' },
  ])('takes the accents off "$accented"', ({ accented, plain }) => {
    expect(normaliseForSearch(accented)).toBe(plain);
  });

  it('reads a letter and an accent written as two characters like the single one', () => {
    expect(normaliseForSearch(`cafe${COMBINING_ACUTE_ACCENT}s`)).toBe(normaliseForSearch('cafés'));
  });

  it('leaves letters of another script as they are', () => {
    expect(normaliseForSearch('привет')).toBe('привет');
  });
});

describe('parseSearchQuery', () => {
  it('reads one word', () => {
    expect(parseSearchQuery('sol')).toEqual(['sol']);
  });

  it('reads a phrase as its words, in order', () => {
    expect(parseSearchQuery('  see   you later ')).toEqual(['see', 'you', 'later']);
  });

  it('ignores capitals and accents', () => {
    expect(parseSearchQuery('QUÉ Tal')).toEqual(['que', 'tal']);
  });

  it('drops digits and punctuation, as the word lists do', () => {
    expect(parseSearchQuery('sol! 2024, ¿mañana?')).toEqual(['sol', 'manana']);
  });

  it('keeps the apostrophe inside a word', () => {
    expect(parseSearchQuery("don't")).toEqual(["don't"]);
  });

  it.each(['', '   ', '2024', '?!', FACE_WITH_TEARS_OF_JOY])(
    'finds nothing to look for in "%s"',
    (query) => {
      expect(parseSearchQuery(query)).toEqual([]);
    },
  );
});

describe('monthKeyFromDate and yearFromMonthKey', () => {
  it('writes March 2024 as 202403', () => {
    expect(monthKeyFromDate(localTime('2024-03-31 23:59'))).toBe(202403);
  });

  it('tells December from the January after it', () => {
    expect(monthKeyFromDate(localTime('2023-12-31 23:59'))).toBe(202312);
    expect(monthKeyFromDate(localTime('2024-01-01 00:00'))).toBe(202401);
  });

  it('reads the year back', () => {
    expect(yearFromMonthKey(202312)).toBe(2023);
    expect(yearFromMonthKey(202401)).toBe(2024);
  });
});

describe('countOccurrencesInText', () => {
  describe('a single word', () => {
    it('finds the word wherever it stands', () => {
      expect(countInText('el sol sale', 'sol')).toBe(1);
    });

    it('does not find it inside a longer word', () => {
      expect(countInText('solo quiero un girasol', 'sol')).toBe(0);
    });

    it('finds it next to punctuation, digits and emojis', () => {
      expect(countInText(`¡sol! sol2 (sol)${FACE_WITH_TEARS_OF_JOY}sol`, 'sol')).toBe(4);
    });

    it('counts every time it is written', () => {
      expect(countInText('no, no and no', 'no')).toBe(3);
    });

    it('finds a word typed in capitals', () => {
      expect(countInText('SOL y playa', 'sol')).toBe(1);
    });

    it('finds an accented word from a query without the accent', () => {
      expect(countInText('¿Qué tal?', 'que')).toBe(1);
    });

    it('finds a word without accent from a query with one', () => {
      expect(countInText('que si', 'qué')).toBe(1);
    });

    it('finds a word whose accent is written as a character of its own', () => {
      expect(countInText(`dos cafe${COMBINING_ACUTE_ACCENT}s`, 'cafés')).toBe(1);
    });

    it('does not find a word that is not there', () => {
      expect(countInText('see you later', 'tomorrow')).toBe(0);
    });
  });

  describe('a phrase', () => {
    it('finds its words one after the other', () => {
      expect(countInText('ok, see you later then', 'see you later')).toBe(1);
    });

    it('finds them across punctuation, which is not a word', () => {
      expect(countInText('see you, later', 'you later')).toBe(1);
    });

    it('does not find them in another order', () => {
      expect(countInText('later you see', 'see you later')).toBe(0);
    });

    it('does not find them with a word in between', () => {
      expect(countInText('see you much later', 'you later')).toBe(0);
    });

    it('does not find a phrase whose last word is only the start of a word', () => {
      expect(countInText('see you laterally', 'you later')).toBe(0);
    });

    it('does not find a phrase that runs across a line break', () => {
      expect(countInText('see you\nlater', 'you later')).toBe(0);
    });

    it('counts a phrase on each line it stands in', () => {
      expect(countInText('see you\nsee you', 'see you')).toBe(2);
    });

    it('starts the next occurrence after the end of the one before', () => {
      /* "no no" fits at words 1-2 and 3-4 of five; the one at 2-3 overlaps the first. */
      expect(countInText('no no no no no', 'no no')).toBe(2);
    });

    it('finds a phrase that starts after a false start', () => {
      expect(countInText('see see you', 'see you')).toBe(1);
    });
  });

  describe('what is left out, as in the word lists', () => {
    it('does not look inside a link', () => {
      expect(countInText('look https://example.com/sol?sol=sol', 'sol')).toBe(0);
    });

    it('still finds the word next to a link', () => {
      expect(countInText('sol https://example.com/page', 'sol')).toBe(1);
    });

    it('does not find the name of somebody mentioned with @', () => {
      const mention = `@${FIRST_STRONG_ISOLATE}Carla${POP_DIRECTIONAL_ISOLATE}`;

      expect(countInText(`${mention} are you coming?`, 'carla')).toBe(0);
    });
  });

  it('finds nothing for a query without words', () => {
    expect(countOccurrencesInText('anything at all', [])).toBe(0);
  });
});

describe('searchMessages', () => {
  const messages: readonly ChatMessage[] = [
    textMessage({ sender: 'Ana', sentAt: '2023-12-30 10:00', text: 'Sol y playa' }),
    textMessage({ sender: 'Bob', sentAt: '2023-12-31 10:00', text: 'solo si hay sol, mucho sol' }),
    textMessage({ sender: 'Ana', sentAt: '2024-01-01 10:00', text: 'feliz año' }),
    mediaMessage({ sender: 'Carla', sentAt: '2024-01-02 10:00', caption: 'el sol de hoy' }),
    mediaMessage({ sender: 'Carla', sentAt: '2024-01-03 10:00' }),
    deletedMessage({ sender: 'Bob', sentAt: '2024-01-04 10:00' }),
    textMessage({ sender: 'Ana', sentAt: '2024-03-05 10:00', text: 'sol' }),
  ];
  const result = search(messages, 'sol');

  it('searches typed messages and captions, not placeholders or deleted messages', () => {
    /* Seven messages, less the photo without caption and the deleted one. */
    expect(result.searchedMessageCount).toBe(5);
  });

  it('counts the messages that contain the word, each once', () => {
    expect(result.matchingMessageCount).toBe(4);
  });

  it('counts every time the word is written', () => {
    /* Bob wrote it twice in one message. */
    expect(result.occurrenceCount).toBe(5);
  });

  it('counts the searched messages of each sender', () => {
    expect([...result.searchedMessageCountsBySender]).toEqual([
      ['Ana', 3],
      ['Bob', 1],
      ['Carla', 1],
    ]);
  });

  it('counts the matching messages of each sender', () => {
    expect([...result.matchingMessageCountsBySender]).toEqual([
      ['Ana', 2],
      ['Bob', 1],
      ['Carla', 1],
    ]);
  });

  it('counts the matching messages of each month, and lists no month without one', () => {
    expect([...result.matchingMessageCountsByMonthKey]).toEqual([
      [202312, 2],
      [202401, 1],
      [202403, 1],
    ]);
  });

  it('does not find the words of a placeholder', () => {
    const placeholder = mediaMessage({ text: 'image omitted' });

    expect(search([placeholder], 'image').matchingMessageCount).toBe(0);
  });

  it('does not find the words of a deleted-message tombstone', () => {
    expect(search([deletedMessage()], 'deleted').searchedMessageCount).toBe(0);
  });

  it('finds a phrase in the messages that hold it', () => {
    expect(search(messages, 'el sol').matchingMessageCountsBySender).toEqual(
      new Map([['Carla', 1]]),
    );
  });

  it('reports no sender and no month when nothing matches', () => {
    const nothingFound = search(messages, 'luna');

    expect(nothingFound.matchingMessageCount).toBe(0);
    expect(nothingFound.occurrenceCount).toBe(0);
    expect(nothingFound.matchingMessageCountsBySender.size).toBe(0);
    expect(nothingFound.matchingMessageCountsByMonthKey.size).toBe(0);
    expect(nothingFound.searchedMessageCount).toBe(5);
  });

  it('matches nothing for a query without words, but still counts what it read', () => {
    const emptySearch = searchMessages(messages, []);

    expect(emptySearch.matchingMessageCount).toBe(0);
    expect(emptySearch.searchedMessageCount).toBe(5);
  });

  it('finds nothing in no messages', () => {
    expect(search([], 'sol')).toEqual({
      searchedMessageCount: 0,
      matchingMessageCount: 0,
      occurrenceCount: 0,
      searchedMessageCountsBySender: new Map(),
      matchingMessageCountsBySender: new Map(),
      matchingMessageCountsByMonthKey: new Map(),
    });
  });

  it('agrees with the word list of the analysis about what a word is', () => {
    /* "sol's" is one word in the word lists, so it is not a hit for "sol". */
    expect(search([textMessage({ text: "the sol's rays" })], 'sol').matchingMessageCount).toBe(0);
  });
});
