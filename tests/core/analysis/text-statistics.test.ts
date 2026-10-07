import { describe, expect, it } from 'vitest';

import {
  analyseMessageText,
  countLinks,
  extractLinkSites,
  extractEmojis,
  extractMentionedNames,
  extractPhrases,
  extractWords,
  isLaugh,
  removeLinks,
  removeMentions,
} from '../../../src/core/analysis/text-statistics';
import {
  BLACK_FLAG,
  FACE_WITH_TEARS_OF_JOY,
  FAMILY_MAN_WOMAN_GIRL,
  FLAG_OF_COSTA_RICA,
  FLAG_OF_ENGLAND,
  FLAG_OF_SPAIN,
  HEART_ON_FIRE,
  KEYCAP_ASTERISK,
  KEYCAP_NUMBER_SIGN_WITHOUT_VARIATION_SELECTOR,
  KEYCAP_ONE,
  PARTY_POPPER,
  RED_HEART,
  THUMBS_UP_MEDIUM_SKIN_TONE,
  WOMAN_TECHNOLOGIST_MEDIUM_SKIN_TONE,
} from '../../fixtures/emojis';

/** Writes a mention the way an iPhone export does: `@`, then the name between isolate marks. */
function mentionOf(name: string): string {
  return `@⁨${name}⁩`;
}

describe('extractMentionedNames', () => {
  it('lists the names mentioned with @, in order, repeats included', () => {
    const text = `${mentionOf('Carla')} and ${mentionOf('Bob')}, or ${mentionOf('Carla')} alone?`;

    expect(extractMentionedNames(text)).toEqual(['Carla', 'Bob', 'Carla']);
  });

  it('keeps a name of several words whole', () => {
    expect(extractMentionedNames(`ask ${mentionOf('Carla de la Vega')}`)).toEqual([
      'Carla de la Vega',
    ]);
  });

  it('trims the white space inside the marks', () => {
    expect(extractMentionedNames(`ask ${mentionOf(' Carla ')}`)).toEqual(['Carla']);
  });

  it.each([
    { description: 'an @ without the marks, as Android writes it', text: 'ask @50655550100' },
    { description: 'an e-mail address', text: 'write to ana@example.com' },
    { description: 'marks with nothing between them', text: 'ask @⁨⁩' },
    { description: 'marks around white space only', text: 'ask @⁨ ⁩' },
    { description: 'an opening mark that is never closed', text: 'ask @⁨Carla' },
    { description: 'no mention at all', text: 'see you tomorrow' },
  ])('finds nothing in $description', ({ text }) => {
    expect(extractMentionedNames(text)).toEqual([]);
  });

  it('gives the same answer every time, because the pattern keeps no state between calls', () => {
    const text = `ask ${mentionOf('Carla')}`;

    expect(extractMentionedNames(text)).toEqual(extractMentionedNames(text));
  });
});

describe('removeMentions', () => {
  it('replaces a mention with a space, so the words around it stay apart', () => {
    expect(removeMentions(`hey${mentionOf('Carla')}come`)).toBe('hey come');
  });

  it('leaves a text without mentions as it is', () => {
    expect(removeMentions('write to ana@example.com')).toBe('write to ana@example.com');
  });
});

describe('extractPhrases', () => {
  it('lists every run of two and of three neighbouring words', () => {
    expect(extractPhrases('bring fresh bread tonight')).toEqual([
      'bring fresh',
      'fresh bread',
      'bread tonight',
      'bring fresh bread',
      'fresh bread tonight',
    ]);
  });

  it('lower-cases the phrases', () => {
    expect(extractPhrases('Buenos Días')).toEqual(['buenos días']);
  });

  it('never runs a phrase across a line break', () => {
    expect(extractPhrases('good morning\neverybody here')).toEqual([
      'good morning',
      'everybody here',
    ]);
  });

  it('skips a run made only of filler words', () => {
    expect(extractPhrases('of the')).toEqual([]);
  });

  it('keeps a run in which one word is significant', () => {
    expect(extractPhrases('of the dinner')).toEqual(['the dinner', 'of the dinner']);
  });

  it('skips every run that holds a laugh', () => {
    expect(extractPhrases('haha good morning')).toEqual(['good morning']);
  });

  it.each(['', 'hello', '   '])('finds no phrase in "%s"', (text) => {
    expect(extractPhrases(text)).toEqual([]);
  });
});

describe('countLinks', () => {
  it.each([
    { description: 'no link', text: 'see you tomorrow', expected: 0 },
    { description: 'an https link', text: 'look https://example.com/photo', expected: 1 },
    { description: 'an http link', text: 'look http://example.com', expected: 1 },
    { description: 'a www link without a scheme', text: 'look www.example.com', expected: 1 },
    { description: 'an upper-case link', text: 'look HTTPS://EXAMPLE.COM', expected: 1 },
    {
      description: 'two links',
      text: 'https://example.com/one and https://example.com/two',
      expected: 2,
    },
    {
      description: 'a link with www after the scheme as one link',
      text: 'https://www.example.com',
      expected: 1,
    },
    { description: 'a bare domain, which is not counted', text: 'example.com', expected: 0 },
    { description: 'an empty text', text: '', expected: 0 },
  ])('counts $expected for $description', ({ text, expected }) => {
    expect(countLinks(text)).toBe(expected);
  });
});

describe('extractLinkSites', () => {
  it('lists the site of every link, in order, repeats included', () => {
    const text = 'https://example.com/one then www.example.org and https://example.com/two';

    expect(extractLinkSites(text)).toEqual(['example.com', 'example.org', 'example.com']);
  });

  it('keeps nothing of the path or the query of a link', () => {
    const text = 'look https://www.example.com/album/ana-birthday?key=secret#photo-3';

    expect(extractLinkSites(text)).toEqual(['example.com']);
  });

  it('leaves out a link without a host that looks like a site', () => {
    expect(extractLinkSites('router at http://192.168.0.1/admin')).toEqual([]);
  });

  it('finds none in a text without links, a bare domain included', () => {
    expect(extractLinkSites('see example.com tomorrow')).toEqual([]);
  });
});

describe('removeLinks', () => {
  it('replaces a link with a space, so the words around it stay apart', () => {
    expect(removeLinks('before https://example.com/a?b=c after')).toBe('before   after');
  });

  it('removes a link up to the next white space, punctuation included', () => {
    expect(removeLinks('https://example.com/path?query=1#top, yes')).toBe('  yes');
  });

  it('removes every link', () => {
    expect(removeLinks('www.example.com or http://example.org')).toBe('  or  ');
  });

  it('leaves a text without links unchanged', () => {
    expect(removeLinks('see you tomorrow')).toBe('see you tomorrow');
  });
});

describe('extractEmojis', () => {
  it('returns nothing for a text without emojis', () => {
    expect(extractEmojis('ok 12 # * plain text')).toEqual([]);
  });

  it.each([
    { description: 'a single-code-point emoji', emoji: FACE_WITH_TEARS_OF_JOY },
    { description: 'a heart with its variation selector', emoji: RED_HEART },
    { description: 'a keycap digit', emoji: KEYCAP_ONE },
    {
      description: 'a keycap # typed without the variation selector',
      emoji: KEYCAP_NUMBER_SIGN_WITHOUT_VARIATION_SELECTOR,
    },
    { description: 'a keycap *', emoji: KEYCAP_ASTERISK },
    { description: 'a country flag made of two regional indicators', emoji: FLAG_OF_COSTA_RICA },
    { description: 'a subdivision flag made of tag characters', emoji: FLAG_OF_ENGLAND },
    { description: 'a family joined by zero-width joiners', emoji: FAMILY_MAN_WOMAN_GIRL },
    { description: 'a thumbs up with a skin tone', emoji: THUMBS_UP_MEDIUM_SKIN_TONE },
    {
      description: 'a profession with a skin tone and a joiner',
      emoji: WOMAN_TECHNOLOGIST_MEDIUM_SKIN_TONE,
    },
    { description: 'a heart on fire, with a selector before the joiner', emoji: HEART_ON_FIRE },
    { description: 'the plain black flag', emoji: BLACK_FLAG },
  ])('counts $description as one emoji', ({ emoji }) => {
    expect(extractEmojis(`look ${emoji} there`)).toEqual([emoji]);
  });

  it('lists emojis in order of appearance', () => {
    const text = `${PARTY_POPPER} happy birthday ${RED_HEART}`;

    expect(extractEmojis(text)).toEqual([PARTY_POPPER, RED_HEART]);
  });

  it('lists a repeated emoji once per appearance', () => {
    const text = `${FACE_WITH_TEARS_OF_JOY}${FACE_WITH_TEARS_OF_JOY}${FACE_WITH_TEARS_OF_JOY}`;

    expect(extractEmojis(text)).toHaveLength(3);
  });

  it('separates two flags written next to each other', () => {
    const text = `${FLAG_OF_COSTA_RICA}${FLAG_OF_SPAIN}`;

    expect(extractEmojis(text)).toEqual([FLAG_OF_COSTA_RICA, FLAG_OF_SPAIN]);
  });

  it('does not count plain digits, # or * as emojis', () => {
    expect(extractEmojis('call me at 5550 0101 #urgent *please*')).toEqual([]);
  });

  it('counts five emojis in a text that mixes every kind with words and numbers', () => {
    const text = `${KEYCAP_ONE} ${FLAG_OF_COSTA_RICA} ${FAMILY_MAN_WOMAN_GIRL} ${THUMBS_UP_MEDIUM_SKIN_TONE} ${FLAG_OF_ENGLAND} ok 12`;

    expect(extractEmojis(text)).toHaveLength(5);
  });
});

describe('extractEmojis, called repeatedly', () => {
  it('finds every emoji of a text that mixes kinds', () => {
    const text = `${PARTY_POPPER} and ${FLAG_OF_ENGLAND}`;

    expect(extractEmojis(text)).toEqual([PARTY_POPPER, FLAG_OF_ENGLAND]);
  });

  it('gives the same answer every time, although its pattern is global', () => {
    const text = `${PARTY_POPPER}${PARTY_POPPER}`;

    const firstAnswer = extractEmojis(text);
    const secondAnswer = extractEmojis(text);

    expect(firstAnswer).toEqual([PARTY_POPPER, PARTY_POPPER]);
    expect(secondAnswer).toEqual(firstAnswer);
  });

  it('returns a new list on every call', () => {
    expect(extractEmojis(PARTY_POPPER)).not.toBe(extractEmojis(PARTY_POPPER));
  });
});

describe('extractWords', () => {
  it('lists the words of a text in lower case', () => {
    expect(extractWords('Hola Mundo')).toEqual(['hola', 'mundo']);
  });

  it('keeps accented letters and ñ inside a word', () => {
    expect(extractWords('mañana será difícil')).toEqual(['mañana', 'será', 'difícil']);
  });

  it('keeps a straight apostrophe inside a word', () => {
    expect(extractWords("don't worry")).toEqual(["don't", 'worry']);
  });

  it('does not start a word with an apostrophe', () => {
    expect(extractWords("'quoted'")).toEqual(["quoted'"]);
  });

  it('separates words at punctuation and digits', () => {
    expect(extractWords('wait,what?no!room2b')).toEqual(['wait', 'what', 'no', 'room', 'b']);
  });

  it('does not count numbers as words', () => {
    expect(extractWords('12 34 2024')).toEqual([]);
  });

  it('reads words of other scripts', () => {
    expect(extractWords('привет мир')).toEqual(['привет', 'мир']);
  });

  it('lists a repeated word once per appearance', () => {
    expect(extractWords('no no no')).toEqual(['no', 'no', 'no']);
  });

  it('returns nothing for an empty text', () => {
    expect(extractWords('')).toEqual([]);
  });
});

describe('isLaugh', () => {
  it.each([
    'haha',
    'hahaha',
    'ahaha',
    'hahah',
    'jaja',
    'jajaja',
    'jajaj',
    'jajajaa',
    'jajja',
    'jaajaj',
    'jjajaja',
    'jeje',
    'jejeje',
    'jejej',
    'hehe',
    'heheh',
    'lol',
    'lool',
    'loll',
    'lmao',
    'lmfao',
    'lmaooo',
    'xd',
    'xddd',
    'jiji',
    'jijiji',
  ])('recognises "%s" as a laugh', (word) => {
    expect(isLaugh(word)).toBe(true);
  });

  it.each(['JAJAJA', 'Haha', 'LOL', 'XD'])('recognises "%s" in any letter case', (word) => {
    expect(isLaugh(word)).toBe(true);
  });

  it.each([
    'ha',
    'ja',
    'je',
    'he',
    'ji',
    'hah',
    'lo',
    'lola',
    'hello',
    'jamón',
    'hahaha!',
    'banana',
    'lmaoz',
    'x',
    '',
  ])('does not take "%s" for a laugh', (word) => {
    expect(isLaugh(word)).toBe(false);
  });
});

describe('analyseMessageText', () => {
  describe('words', () => {
    it('counts every word, filler included', () => {
      expect(analyseMessageText('the pizza was really good').wordCount).toBe(5);
    });

    it('lists only the words worth ranking as significant', () => {
      const statistics = analyseMessageText('the pizza was really good');

      expect(statistics.significantWords).toEqual(['pizza', 'good']);
    });

    it('lists significant words in lower case', () => {
      expect(analyseMessageText('PIZZA Tonight').significantWords).toEqual(['pizza', 'tonight']);
    });

    it('leaves out words shorter than three letters', () => {
      expect(analyseMessageText('go up by bus').significantWords).toEqual(['bus']);
    });

    it('leaves out Spanish filler words', () => {
      const statistics = analyseMessageText('pero entonces vamos a la playa');

      expect(statistics.significantWords).toEqual(['playa']);
    });

    it('lists a repeated significant word once per appearance', () => {
      expect(analyseMessageText('pizza pizza pizza').significantWords).toEqual([
        'pizza',
        'pizza',
        'pizza',
      ]);
    });

    it('counts no words in a message made only of emojis and numbers', () => {
      const statistics = analyseMessageText(`${PARTY_POPPER} 2024`);

      expect(statistics.wordCount).toBe(0);
      expect(statistics.significantWords).toEqual([]);
    });
  });

  describe('laughs', () => {
    it('reports a laugh when one word is a written laugh', () => {
      expect(analyseMessageText('jajaja no puede ser').containsLaugh).toBe(true);
    });

    it('reports no laugh in a message without one', () => {
      expect(analyseMessageText('no puede ser').containsLaugh).toBe(false);
    });

    it('counts a laugh as a word', () => {
      expect(analyseMessageText('hahaha').wordCount).toBe(1);
    });

    it('never ranks a laugh as a significant word', () => {
      expect(analyseMessageText('hahaha lmao pizza').significantWords).toEqual(['pizza']);
    });

    it('does not take a word that merely contains a laugh for one', () => {
      expect(analyseMessageText('Lolita arrived').containsLaugh).toBe(false);
    });
  });

  describe('links', () => {
    it('counts the links of a message', () => {
      const statistics = analyseMessageText('https://example.com and www.example.org');

      expect(statistics.linkCount).toBe(2);
    });

    it('does not count the pieces of a link as words', () => {
      const statistics = analyseMessageText('look https://example.com/some-long-path here');

      expect(statistics.wordCount).toBe(2);
      expect(statistics.significantWords).toEqual(['look']);
    });

    it('does not count emojis inside a link', () => {
      const statistics = analyseMessageText(`https://example.com/${PARTY_POPPER}`);

      expect(statistics.emojis).toEqual([]);
    });
  });

  describe('questions', () => {
    it('reports a question for a message with a question mark', () => {
      expect(analyseMessageText('dinner?').containsQuestion).toBe(true);
    });

    it('reports a question for a message with only the Spanish opening mark', () => {
      expect(analyseMessageText('¿vienes').containsQuestion).toBe(true);
    });

    it('reports no question for a message without a question mark', () => {
      expect(analyseMessageText('dinner.').containsQuestion).toBe(false);
    });

    it('does not take the question mark of a query string for a question', () => {
      const statistics = analyseMessageText('https://maps.example.com/?q=1,2');

      expect(statistics.containsQuestion).toBe(false);
    });
  });

  describe('emojis', () => {
    it('lists the emojis of a message, repeats included', () => {
      const statistics = analyseMessageText(`${RED_HEART} te quiero ${RED_HEART}`);

      expect(statistics.emojis).toEqual([RED_HEART, RED_HEART]);
    });

    it('does not count the letters of a flag as words', () => {
      const statistics = analyseMessageText(`${FLAG_OF_COSTA_RICA} pura vida`);

      expect(statistics.wordCount).toBe(2);
    });
  });

  describe('mentions', () => {
    it('lists the people mentioned', () => {
      expect(analyseMessageText(`${mentionOf('Carla')} are you coming?`).mentionedNames).toEqual([
        'Carla',
      ]);
    });

    it('does not count the name of the person mentioned as a word', () => {
      const statistics = analyseMessageText(`${mentionOf('Carla Vega')} dinner tonight`);

      expect(statistics.wordCount).toBe(2);
      expect(statistics.significantWords).toEqual(['dinner', 'tonight']);
    });

    it('does not build phrases out of the name of the person mentioned', () => {
      expect(analyseMessageText(`${mentionOf('Carla Vega')} dinner tonight`).phrases).toEqual([
        'dinner tonight',
      ]);
    });
  });

  describe('phrases', () => {
    it('lists the phrases of the message', () => {
      expect(analyseMessageText('bring fresh bread').phrases).toEqual([
        'bring fresh',
        'fresh bread',
        'bring fresh bread',
      ]);
    });

    it('does not build phrases out of a link', () => {
      expect(analyseMessageText('look https://example.com/good-morning-everybody').phrases).toEqual(
        [],
      );
    });
  });

  describe('the sites of links', () => {
    it('lists the site of each link next to the number of links', () => {
      const statistics = analyseMessageText(
        'tickets https://www.example.com/buy?seat=12 and http://10.0.0.7/setup',
      );

      expect(statistics.linkCount).toBe(2);
      expect(statistics.linkSites).toEqual(['example.com']);
    });
  });

  describe('an empty message', () => {
    it('counts nothing', () => {
      expect(analyseMessageText('')).toEqual({
        linkCount: 0,
        linkSites: [],
        containsQuestion: false,
        emojis: [],
        wordCount: 0,
        significantWords: [],
        containsLaugh: false,
        mentionedNames: [],
        phrases: [],
      });
    });
  });

  describe('repeated calls', () => {
    it('gives the same answer every time, because no pattern keeps state between calls', () => {
      const text = `${PARTY_POPPER} haha https://example.com ¿sí?`;

      const firstAnswer = analyseMessageText(text);
      const secondAnswer = analyseMessageText(text);

      expect(secondAnswer).toEqual(firstAnswer);
    });
  });
});
