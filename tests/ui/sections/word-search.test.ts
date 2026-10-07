// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { analyseChat } from '../../../src/core/analysis/analyse-chat';
import { parseSearchQuery, searchMessages } from '../../../src/core/analysis/word-search';
import type { ChatAnalysis, ChatMessage } from '../../../src/core/types';
import { anonymiseAnalysis } from '../../../src/ui/anonymise';
import { assignPersonColours } from '../../../src/ui/person-colours';
import type { PeopleShown } from '../../../src/ui/sections/featured-people';
import {
  LARGEST_SEARCHED_MESSAGE_COUNT,
  LONGEST_QUERY_LENGTH,
  LONGEST_SPAN_SHOWN_BY_MONTH_IN_MONTHS,
  MINIMUM_MESSAGES_FOR_WORD_RATE,
  NOTHING_TO_LOOK_UP_NOTE,
  WORD_SEARCH_HINT,
  buildWordUseOverTime,
  chooseWordUseGranularity,
  formatRatePerThousand,
  formatShareOfMessages,
  hasTextWorthSearching,
  listWordUseOfPeople,
  renderWordSearchOutcome,
  renderWordSearchSection,
  selectSearchedMessages,
} from '../../../src/ui/sections/word-search';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { findElement, parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';
import { localTime, mediaMessage, textMessage } from '../../fixtures/messages';

/**
 * Writes a number of typed messages from one person, a minute apart from a
 * given hour of a day on, all with the same text.
 */
function messagesFrom(
  sender: string,
  day: string,
  hour: number,
  messageCount: number,
  text: string,
): ChatMessage[] {
  return Array.from({ length: messageCount }, (_unused, index): ChatMessage => {
    const time = `${String(hour).padStart(2, '0')}:${String(index).padStart(2, '0')}`;
    return textMessage({ sender, sentAt: `${day} ${time}`, text });
  });
}

/**
 * Analyses invented messages, sorted by time as the analysis expects them.
 */
function analyse(messages: readonly ChatMessage[]): ChatAnalysis {
  const sortedMessages = [...messages].sort(
    (first, second) => first.timestamp.getTime() - second.timestamp.getTime(),
  );
  return analyseChat(sortedMessages, 'second');
}

/**
 * A chat from March to June 2024. Ana wrote forty messages and "pizza" in
 * four of them; Bob wrote twenty and "pizza" in three; Carla wrote two, one
 * of them a caption with "pizza".
 */
const pizzaChat = analyse([
  ...messagesFrom('Ana', '2024-03-10', 10, 36, 'see you later'),
  ...messagesFrom('Ana', '2024-03-11', 10, 3, 'Pizza tonight?'),
  ...messagesFrom('Ana', '2024-06-02', 10, 1, 'pizza, pizza and more pizza'),
  ...messagesFrom('Bob', '2024-03-10', 11, 17, 'fine by me'),
  ...messagesFrom('Bob', '2024-05-20', 11, 3, 'no pizza for me'),
  textMessage({ sender: 'Carla', sentAt: '2024-04-01 09:00', text: 'hello all' }),
  mediaMessage({ sender: 'Carla', sentAt: '2024-04-01 09:01', caption: 'my PIZZA' }),
]);

/**
 * Draws the outcome of a search and parses it. Unless stated the report is
 * drawn from the analysis that is searched.
 */
function renderOutcome(
  query: string,
  analysis: ChatAnalysis,
  peopleShown: PeopleShown = 'most-active',
  drawnAnalysis: ChatAnalysis = analysis,
): HTMLDivElement {
  return parseMarkup(
    renderWordSearchOutcome(
      query,
      analysis,
      drawnAnalysis,
      assignPersonColours(drawnAnalysis.people),
      peopleShown,
    ),
  );
}

/**
 * Reads the rows of the bar chart as label and value.
 */
function readBars(outcome: ParentNode): string[][] {
  const labels = textsOfElements(outcome, '.horizontal-bars .bar-label');
  const values = textsOfElements(outcome, '.horizontal-bars .bar-value');
  return labels.map((label, index) => [label, values[index] ?? '']);
}

/**
 * Reads the bars of the strip as the titles the pointer shows.
 */
function readStripTitles(outcome: ParentNode): (string | null)[] {
  return Array.from(outcome.querySelectorAll('.bar-strip-column'), (column) =>
    column.getAttribute('title'),
  );
}

describe('hasTextWorthSearching', () => {
  it('is true once anybody typed a word', () => {
    const analysis = chatAnalysis({
      people: [
        personStatistics({ name: 'Ana', messageCount: 5 }),
        personStatistics({ name: 'Bob', messageCount: 3, wordCount: 1 }),
      ],
    });

    expect(hasTextWorthSearching(analysis)).toBe(true);
  });

  it('is false for a chat of photos only', () => {
    const analysis = chatAnalysis({
      people: [personStatistics({ name: 'Ana', messageCount: 5, mediaCount: 5 })],
    });

    expect(hasTextWorthSearching(analysis)).toBe(false);
  });
});

describe('renderWordSearchSection', () => {
  it('draws the heading, a labelled field and the hint', () => {
    const section = parseMarkup(renderWordSearchSection(pizzaChat));

    const field = findElement(section, 'input');
    expect(textsOfElements(section, 'h2')).toEqual(['Look up a word']);
    expect(field.id).toBe('word-search-input');
    expect(findElement(section, 'label').getAttribute('for')).toBe('word-search-input');
    expect(findElement(section, '#word-search-result').textContent).toBe(WORD_SEARCH_HINT);
  });

  it('says that what is typed stays in the tab', () => {
    const section = parseMarkup(renderWordSearchSection(pizzaChat));

    expect(findElement(section, '.section-heading p').textContent).toContain(
      'What you type stays in this tab',
    );
  });

  it('asks the browser not to remember or correct what is typed, and limits its length', () => {
    const field = findElement(parseMarkup(renderWordSearchSection(pizzaChat)), 'input');

    expect(field.getAttribute('autocomplete')).toBe('off');
    expect(field.getAttribute('spellcheck')).toBe('false');
    expect(field.getAttribute('maxlength')).toBe(String(LONGEST_QUERY_LENGTH));
    expect(field.hasAttribute('name')).toBe(false);
  });

  it('announces the outcome to a screen reader when it changes', () => {
    const section = parseMarkup(renderWordSearchSection(pizzaChat));

    expect(findElement(section, '#word-search-result').getAttribute('aria-live')).toBe('polite');
  });

  it('is not wrapped in a form, so Enter cannot submit anything', () => {
    const section = parseMarkup(renderWordSearchSection(pizzaChat));

    expect(tagNamesIn(section)).not.toContain('form');
  });

  it('is left out of a chat in which nobody typed a word', () => {
    const analysis = chatAnalysis({
      people: [personStatistics({ name: 'Ana', messageCount: 5, mediaCount: 5 })],
    });

    expect(renderWordSearchSection(analysis)).toBe('');
  });
});

describe('selectSearchedMessages', () => {
  /** A list as long as wanted without building that many messages: only its length and ends are read. */
  function messagesOfLength(length: number): ChatMessage[] {
    const message = textMessage();
    return new Array<ChatMessage>(length).fill(message);
  }

  it('searches every message of a chat at the limit', () => {
    const messages = messagesOfLength(LARGEST_SEARCHED_MESSAGE_COUNT);

    expect(selectSearchedMessages(messages)).toBe(messages);
  });

  it('searches the newest messages of a chat one message over the limit', () => {
    const oldest = textMessage({ sentAt: '2020-01-01 10:00', text: 'oldest' });
    const newest = textMessage({ sentAt: '2024-01-01 10:00', text: 'newest' });
    const messages = [oldest, ...messagesOfLength(LARGEST_SEARCHED_MESSAGE_COUNT - 1), newest];

    const searchedMessages = selectSearchedMessages(messages);

    expect(searchedMessages).toHaveLength(LARGEST_SEARCHED_MESSAGE_COUNT);
    expect(searchedMessages).not.toContain(oldest);
    expect(searchedMessages[searchedMessages.length - 1]).toBe(newest);
  });
});

describe('formatRatePerThousand', () => {
  it('writes a rate below ten with one decimal', () => {
    /* 3 of 400 messages are 7.5 of 1,000. */
    expect(formatRatePerThousand(3, 400)).toBe('7.5 per 1,000');
  });

  it('writes a rate from ten on as a whole number', () => {
    /* 4 of 40 messages are 100 of 1,000. */
    expect(formatRatePerThousand(4, 40)).toBe('100 per 1,000');
  });

  it('writes a word that is in every message as 1,000 per 1,000', () => {
    expect(formatRatePerThousand(20, 20)).toBe('1,000 per 1,000');
  });
});

describe('formatShareOfMessages', () => {
  it('writes the share as a percentage', () => {
    /* 8 of 62 messages are 12.9%, 3 of 62 are 4.8%. */
    expect(formatShareOfMessages(8, 62)).toBe('13%');
    expect(formatShareOfMessages(3, 62)).toBe('4.8%');
  });

  it('writes the smallest share that still rounds to a number', () => {
    /* 1 of 1,000 messages is 0.1%. */
    expect(formatShareOfMessages(1, 1_000)).toBe('0.1%');
  });

  it('does not write a word that was found as 0.0% of the messages', () => {
    /* 1 of 10,000 messages is 0.01%, which would round to 0.0%. */
    expect(formatShareOfMessages(1, 10_000)).toBe('under 0.1%');
  });
});

describe('listWordUseOfPeople', () => {
  const result = searchMessages(pizzaChat.messages, parseSearchQuery('pizza'));

  it('lists the people who wrote the word, the most messages first', () => {
    expect(listWordUseOfPeople(result, pizzaChat.people, pizzaChat.people)).toEqual([
      { name: 'Ana', matchingMessageCount: 4, searchedMessageCount: 40 },
      { name: 'Bob', matchingMessageCount: 3, searchedMessageCount: 20 },
      { name: 'Carla', matchingMessageCount: 1, searchedMessageCount: 2 },
    ]);
  });

  it('leaves out somebody who never wrote it', () => {
    const laterResult = searchMessages(pizzaChat.messages, parseSearchQuery('later'));

    expect(
      listWordUseOfPeople(laterResult, pizzaChat.people, pizzaChat.people).map(
        (wordUse) => wordUse.name,
      ),
    ).toEqual(['Ana']);
  });

  it('lists only the people the report shows', () => {
    const shownPeople = pizzaChat.people.slice(0, 2);

    expect(
      listWordUseOfPeople(result, pizzaChat.people, shownPeople).map((wordUse) => wordUse.name),
    ).toEqual(['Ana', 'Bob']);
  });

  it('shows the label of each person when the report is drawn without names', () => {
    const hidden = anonymiseAnalysis(pizzaChat);

    expect(listWordUseOfPeople(result, pizzaChat.people, hidden.people)).toEqual([
      { name: 'Person A', matchingMessageCount: 4, searchedMessageCount: 40 },
      { name: 'Person B', matchingMessageCount: 3, searchedMessageCount: 20 },
      { name: 'Person C', matchingMessageCount: 1, searchedMessageCount: 2 },
    ]);
  });
});

describe('chooseWordUseGranularity', () => {
  it('draws a chat of exactly thirty-six calendar months month by month', () => {
    /* January 2021 to December 2023 are 3 × 12 = 36 months. */
    expect(LONGEST_SPAN_SHOWN_BY_MONTH_IN_MONTHS).toBe(36);
    expect(
      chooseWordUseGranularity(localTime('2021-01-31 10:00'), localTime('2023-12-01 10:00')),
    ).toBe('month');
  });

  it('draws a chat of thirty-seven calendar months year by year', () => {
    expect(
      chooseWordUseGranularity(localTime('2021-01-31 10:00'), localTime('2024-01-01 10:00')),
    ).toBe('year');
  });
});

describe('buildWordUseOverTime', () => {
  /** Builds the outcome of a search with the given hits per month. */
  function resultWithMonths(matchingMessageCountsByMonthKey: ReadonlyMap<number, number>) {
    return {
      ...searchMessages([], []),
      matchingMessageCountsByMonthKey,
    };
  }

  it('builds one bar per month from the first to the last, with empty months in between', () => {
    const result = resultWithMonths(
      new Map([
        [202311, 2],
        [202402, 5],
      ]),
    );

    const bars = buildWordUseOverTime(
      result,
      localTime('2023-11-20 10:00'),
      localTime('2024-02-03 10:00'),
    );

    expect(bars).toEqual([
      { axisLabel: 'Nov', slotName: 'Nov 2023', messageCount: 2 },
      { axisLabel: 'Dec', slotName: 'Dec 2023', messageCount: 0 },
      { axisLabel: 'Jan', slotName: 'Jan 2024', messageCount: 0 },
      { axisLabel: 'Feb', slotName: 'Feb 2024', messageCount: 5 },
    ]);
  });

  it('names every month under its bar up to twelve months', () => {
    const bars = buildWordUseOverTime(
      resultWithMonths(new Map()),
      localTime('2023-03-01 10:00'),
      localTime('2024-02-28 10:00'),
    );

    expect(bars.map((bar) => bar.axisLabel)).toEqual([
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
      'Jan',
      'Feb',
    ]);
  });

  it('writes only the years under the bars from thirteen months on', () => {
    /* March 2023 to March 2024: thirteen bars, the first one and the January labelled. */
    const bars = buildWordUseOverTime(
      resultWithMonths(new Map()),
      localTime('2023-03-01 10:00'),
      localTime('2024-03-01 10:00'),
    );

    expect(bars.map((bar) => bar.axisLabel)).toEqual([
      '2023',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '2024',
      '',
      '',
    ]);
  });

  it('leaves the first bar without a year when the next January is too close for both', () => {
    /* November 2022 to December 2023: "2022" under November would run into "2023" two bars on. */
    const bars = buildWordUseOverTime(
      resultWithMonths(new Map()),
      localTime('2022-11-01 10:00'),
      localTime('2023-12-01 10:00'),
    );

    expect(bars.slice(0, 4).map((bar) => bar.axisLabel)).toEqual(['', '', '2023', '']);
  });

  it('builds one bar per year for a longer chat, adding the months of a year up', () => {
    const result = resultWithMonths(
      new Map([
        [202003, 1],
        [202011, 2],
        [202301, 4],
      ]),
    );

    const bars = buildWordUseOverTime(
      result,
      localTime('2020-03-01 10:00'),
      localTime('2023-06-01 10:00'),
    );

    expect(bars).toEqual([
      { axisLabel: '2020', slotName: '2020', messageCount: 3 },
      { axisLabel: '2021', slotName: '2021', messageCount: 0 },
      { axisLabel: '2022', slotName: '2022', messageCount: 0 },
      { axisLabel: '2023', slotName: '2023', messageCount: 4 },
    ]);
  });
});

describe('renderWordSearchOutcome', () => {
  describe('nothing to look up', () => {
    it.each(['', '   '])('shows the hint for the empty query "%s"', (query) => {
      const outcome = renderOutcome(query, pizzaChat);

      expect(textsOfElements(outcome, 'p')).toEqual([WORD_SEARCH_HINT]);
    });

    it('says that only letters are looked up for a query without any', () => {
      const outcome = renderOutcome('2024 ?!', pizzaChat);

      expect(textsOfElements(outcome, 'p')).toEqual([NOTHING_TO_LOOK_UP_NOTE]);
    });
  });

  describe('a word nobody wrote', () => {
    const outcome = renderOutcome('Sushi', pizzaChat);

    it('says so, with the number of messages that were searched', () => {
      /* 40 from Ana, 20 from Bob, and Carla's message and caption. */
      expect(textsOfElements(outcome, 'p')).toEqual([
        'No message contains “sushi”. 62 written messages were searched.',
      ]);
    });

    it('draws no chart', () => {
      expect(outcome.querySelector('.horizontal-bars')).toBeNull();
      expect(outcome.querySelector('.bar-strip')).toBeNull();
    });
  });

  describe('a word that was written', () => {
    const outcome = renderOutcome('PIZZA', pizzaChat);

    it('says in how many messages it stands and how often in all', () => {
      /* 4 + 3 + 1 = 8 of 62 messages are 12.9%; Ana wrote it three times in one of hers. */
      expect(findElement(outcome, '.word-search-summary').textContent).toBe(
        '“pizza” is in 8 of 62 written messages (13%), 10 times in all.',
      );
    });

    it('leaves "times in all" out when no message says it twice', () => {
      const laterOutcome = renderOutcome('later', pizzaChat);

      /* 36 of 62 messages are 58%. */
      expect(findElement(laterOutcome, '.word-search-summary').textContent).toBe(
        '“later” is in 36 of 62 written messages (58%).',
      );
    });

    it('draws a bar per person with their count and their rate per 1,000 messages', () => {
      /* Ana: 4 of 40 = 100 per 1,000. Bob: 3 of 20 = 150 per 1,000. Carla wrote 2 messages, too few for a rate. */
      expect(readBars(outcome)).toEqual([
        ['Ana', '4  100 per 1,000'],
        ['Bob', '3  150 per 1,000'],
        ['Carla', '1'],
      ]);
    });

    it('gives each bar the colour of its person', () => {
      const barStyles = Array.from(outcome.querySelectorAll('.horizontal-bars .bar'), (bar) =>
        bar.getAttribute('style'),
      );

      expect(barStyles[0]).toContain('var(--s1)');
      expect(barStyles[1]).toContain('var(--s2)');
    });

    it('explains the two numbers next to a bar', () => {
      expect(outcome.textContent).toContain(
        `The rate is left out below ${String(MINIMUM_MESSAGES_FOR_WORD_RATE)} written messages.`,
      );
    });

    it('draws its use month by month, with a bar for the months without it', () => {
      expect(readStripTitles(outcome)).toEqual([
        'Mar 2024: 3 messages',
        'Apr 2024: 1 message',
        'May 2024: 3 messages',
        'Jun 2024: 1 message',
      ]);
    });

    it('names the month it was written most in, the earlier of two equal ones', () => {
      const sentence =
        'Written most in Mar 2024: 3 messages. One bar per month; a busy month has more of every word.';

      expect(findElement(outcome, '.bar-strip').getAttribute('aria-label')).toBe(sentence);
      expect(textsOfElements(outcome, '.bar-strip + p')).toEqual([sentence]);
    });

    it('heads the two parts', () => {
      expect(textsOfElements(outcome, 'h3')).toEqual(['Who says it most', 'Over time']);
    });

    it('never shows the text of a message', () => {
      expect(outcome.textContent).not.toContain('tonight');
      expect(outcome.textContent).not.toContain('more pizza');
    });
  });

  describe('a phrase', () => {
    it('finds the messages in which its words follow each other', () => {
      const outcome = renderOutcome('no pizza', pizzaChat);

      expect(findElement(outcome, '.word-search-summary').textContent).toBe(
        '“no pizza” is in 3 of 62 written messages (4.8%).',
      );
      expect(readBars(outcome)).toEqual([['Bob', '3  150 per 1,000']]);
    });
  });

  describe('the rate per 1,000 messages', () => {
    /** A chat in which Ana wrote a given number of messages, one of them "pizza", and Bob one. */
    function chatInWhichAnaWrote(messageCount: number): ChatAnalysis {
      return analyse([
        ...messagesFrom('Ana', '2024-03-10', 10, messageCount - 1, 'hello'),
        textMessage({ sender: 'Ana', sentAt: '2024-03-10 12:00', text: 'pizza' }),
        textMessage({ sender: 'Bob', sentAt: '2024-03-10 12:01', text: 'yes' }),
      ]);
    }

    it('is given from twenty written messages on', () => {
      /* 1 of 20 messages is 50 per 1,000. */
      expect(readBars(renderOutcome('pizza', chatInWhichAnaWrote(20)))).toEqual([
        ['Ana', '1  50 per 1,000'],
      ]);
    });

    it('is left out for somebody with nineteen', () => {
      expect(readBars(renderOutcome('pizza', chatInWhichAnaWrote(19)))).toEqual([['Ana', '1']]);
    });
  });

  describe('the query on the page', () => {
    it('is echoed as text, whatever it holds', () => {
      const hostileQuery = '<img src=x onerror=alert(1)> pizza';

      const outcome = renderOutcome(hostileQuery, pizzaChat);

      expect(outcome.querySelectorAll('img')).toHaveLength(0);
      expect(findElement(outcome, '.word-search-summary').textContent).toContain(
        'No message contains “img src x onerror alert pizza”.',
      );
    });

    it('is echoed with its accents, although they make no difference', () => {
      const outcome = renderOutcome('Pízza', pizzaChat);

      expect(findElement(outcome, '.word-search-summary').textContent).toContain(
        '“pízza” is in 8 of 62',
      );
    });

    it('is cut at the length the field takes', () => {
      /* The field takes eighty characters: "a " forty times ends the query, and "pizza" after it is not read. */
      const query = `${'a '.repeat(LONGEST_QUERY_LENGTH / 2)}pizza`;

      const outcome = renderOutcome(query, pizzaChat);

      expect(findElement(outcome, '.word-search-summary').textContent).toContain(
        'No message contains',
      );
    });
  });

  describe('a large group', () => {
    const names = ['Ana', 'Bob', 'Carla', 'Dani', 'Elena', 'Fede', 'Gabi', 'Hugo', 'Irene'];
    /** Each person writes one message fewer than the one before; only Bob and Irene write "pizza". */
    const group = analyse(
      names.flatMap((sender, index) =>
        messagesFrom(
          sender,
          '2024-03-10',
          10 + index,
          names.length - index,
          sender === 'Bob' || sender === 'Irene' ? 'pizza' : 'hello',
        ),
      ),
    );

    it('lists the most active people and says how many messages come from the others', () => {
      const outcome = renderOutcome('pizza', group);

      expect(readBars(outcome)).toEqual([['Bob', '8']]);
      expect(textsOfElements(outcome, '.word-search-unlisted-note')).toEqual([
        '1 more message with it is from people who are not listed.',
      ]);
      expect(textsOfElements(outcome, '.people-shown-note')).toEqual([
        'Showing the 8 most active of 9 people.',
      ]);
    });

    it('lists everyone on request, and then has nobody left to mention', () => {
      const outcome = renderOutcome('pizza', group, 'everyone');

      expect(readBars(outcome)).toEqual([
        ['Bob', '8'],
        ['Irene', '1'],
      ]);
      expect(outcome.querySelector('.word-search-unlisted-note')).toBeNull();
      expect(outcome.querySelector('.people-shown-note')).toBeNull();
    });

    it('says so when only people who are not listed wrote the word', () => {
      const onlyIrene = analyse(
        names.flatMap((sender, index) =>
          messagesFrom(
            sender,
            '2024-03-10',
            10 + index,
            names.length - index,
            sender === 'Irene' ? 'pizza' : 'hello',
          ),
        ),
      );

      const outcome = renderOutcome('pizza', onlyIrene);

      expect(outcome.querySelector('.horizontal-bars')).toBeNull();
      expect(outcome.textContent).toContain('None of the people listed wrote it.');
      expect(textsOfElements(outcome, '.word-search-unlisted-note')).toEqual([
        '1 more message with it is from people who are not listed.',
      ]);
    });
  });

  describe('a chat that leaves a part out', () => {
    it('does not compare people in a chat with a single sender', () => {
      const monologue = analyse([
        textMessage({ sender: 'Ana', sentAt: '2024-03-10 10:00', text: 'pizza' }),
        textMessage({ sender: 'Ana', sentAt: '2024-04-10 10:00', text: 'pizza again' }),
      ]);

      const outcome = renderOutcome('pizza', monologue);

      expect(textsOfElements(outcome, 'h3')).toEqual(['Over time']);
    });

    it('draws no use over time for a chat within one month', () => {
      const oneMonth = analyse([
        textMessage({ sender: 'Ana', sentAt: '2024-03-01 10:00', text: 'pizza' }),
        textMessage({ sender: 'Bob', sentAt: '2024-03-31 10:00', text: 'pizza' }),
      ]);

      const outcome = renderOutcome('pizza', oneMonth);

      expect(textsOfElements(outcome, 'h3')).toEqual(['Who says it most']);
    });

    it('draws the use over time for a chat that crosses into a second month', () => {
      const twoMonths = analyse([
        textMessage({ sender: 'Ana', sentAt: '2024-03-31 10:00', text: 'pizza' }),
        textMessage({ sender: 'Bob', sentAt: '2024-04-01 10:00', text: 'pizza' }),
      ]);

      const outcome = renderOutcome('pizza', twoMonths);

      expect(readStripTitles(outcome)).toEqual(['Mar 2024: 1 message', 'Apr 2024: 1 message']);
    });

    it('draws only the summary for a single sender within one month', () => {
      const note = analyse([textMessage({ sender: 'Ana', text: 'pizza' })]);

      const outcome = renderOutcome('pizza', note);

      expect(textsOfElements(outcome, 'p')).toEqual([
        '“pizza” is in 1 of 1 written message (100%).',
      ]);
      expect(outcome.querySelector('.two-columns')).toBeNull();
    });
  });

  describe('a chat of more than three years', () => {
    it('draws its use year by year', () => {
      const longChat = analyse([
        textMessage({ sender: 'Ana', sentAt: '2020-03-01 10:00', text: 'pizza' }),
        textMessage({ sender: 'Bob', sentAt: '2022-05-01 10:00', text: 'pizza' }),
        textMessage({ sender: 'Ana', sentAt: '2022-06-01 10:00', text: 'pizza' }),
        textMessage({ sender: 'Bob', sentAt: '2023-06-01 10:00', text: 'salad' }),
      ]);

      const outcome = renderOutcome('pizza', longChat);

      expect(readStripTitles(outcome)).toEqual([
        '2020: 1 message',
        '2021: 0 messages',
        '2022: 2 messages',
        '2023: 0 messages',
      ]);
      expect(outcome.textContent).toContain('Written most in 2022: 2 messages. One bar per year;');
    });
  });

  describe('a very large chat', () => {
    /**
     * A chat one message over the limit: the oldest message says "pizza" in
     * 2020, every later one says "hello" in 2024, and the last says "pizza".
     */
    const oldest = textMessage({ sender: 'Ana', sentAt: '2020-01-01 10:00', text: 'pizza' });
    const filler = textMessage({ sender: 'Bob', sentAt: '2024-05-06 10:00', text: 'hello' });
    const newest = textMessage({ sender: 'Ana', sentAt: '2024-06-07 10:00', text: 'pizza' });
    const messages = [
      oldest,
      ...new Array<ChatMessage>(LARGEST_SEARCHED_MESSAGE_COUNT - 1).fill(filler),
      newest,
    ];
    const largeChat = chatAnalysis({
      messages,
      people: [
        personStatistics({ name: 'Bob', messageCount: messages.length - 2, wordCount: 1 }),
        personStatistics({ name: 'Ana', messageCount: 2, wordCount: 2 }),
      ],
    });
    const outcome = renderOutcome('pizza', largeChat);

    it('searches the newest 300,000 messages only', () => {
      expect(findElement(outcome, '.word-search-summary').textContent).toBe(
        '“pizza” is in 1 of 300,000 written messages (under 0.1%).',
      );
    });

    it('says how many messages were searched and from which day on', () => {
      expect(textsOfElements(outcome, '.word-search-cap-note')).toEqual([
        'Only the latest 300,000 of 300,001 messages were searched, those from 6 May 2024 on.',
      ]);
    });

    it('starts the use over time at the first message that was searched', () => {
      expect(readStripTitles(outcome)).toEqual(['May 2024: 0 messages', 'Jun 2024: 1 message']);
    });

    it('says the same when nothing was found', () => {
      const nothingFound = renderOutcome('sushi', largeChat);

      expect(textsOfElements(nothingFound, '.word-search-cap-note')).toHaveLength(1);
    });

    it('has no such note for a chat that was searched from its start', () => {
      expect(renderOutcome('pizza', pizzaChat).querySelector('.word-search-cap-note')).toBeNull();
    });
  });

  describe('while names are hidden', () => {
    const hidden = anonymiseAnalysis(pizzaChat);
    const outcome = renderOutcome('pizza', pizzaChat, 'most-active', hidden);

    it('still finds the word, which the copy without texts could not', () => {
      expect(findElement(outcome, '.word-search-summary').textContent).toBe(
        '“pizza” is in 8 of 62 written messages (13%), 10 times in all.',
      );
      expect(renderOutcome('pizza', hidden).textContent).toContain('No message contains');
    });

    it('lists the people by their labels, in their colours', () => {
      expect(readBars(outcome)).toEqual([
        ['Person A', '4  100 per 1,000'],
        ['Person B', '3  150 per 1,000'],
        ['Person C', '1'],
      ]);
      expect(findElement(outcome, '.horizontal-bars .bar').getAttribute('style')).toContain(
        'var(--s1)',
      );
    });

    it('shows no name and no message text', () => {
      for (const hiddenText of ['Ana', 'Bob', 'Carla', 'tonight', 'more pizza']) {
        expect(outcome.innerHTML).not.toContain(hiddenText);
      }
    });
  });
});
