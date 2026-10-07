import { describe, expect, it } from 'vitest';

import {
  CUSTOM_PERIOD_VALUE,
  NO_MESSAGES_IN_PERIOD_STATUS,
  PERIOD_ENDS_BEFORE_IT_STARTS_STATUS,
  SHORTEST_SPAN_WORTH_FILTERING_IN_DAYS,
  analysePeriod,
  dateFieldValueOfDayKey,
  dayKeyOfDateFieldValue,
  describePeriod,
  findPresetOfPeriod,
  isPeriodChoiceWorthOffering,
  isSamePeriod,
  listPeriodPresets,
  readPeriodFromDateFields,
  selectGroupEventsOfPeriod,
  selectMessagesOfPeriod,
  wholeChatPeriod,
} from '../../src/ui/period';
import type { Period, PeriodPreset } from '../../src/ui/period';
import type { ChatAnalysis } from '../../src/core/types';
import { analyseMessages, findPerson, participantNames } from '../fixtures/analysis-readers';
import { groupEvent, namedMember } from '../fixtures/group-events';
import { textMessage, textsOf } from '../fixtures/messages';
import { analyseChat } from '../../src/core/index';

/**
 * Analyses a chat with one message from Ana at ten in the morning of each of the given days.
 */
function chatWithMessagesOn(days: readonly string[]): ChatAnalysis {
  return analyseMessages(days.map((day) => textMessage({ sentAt: `${day} 10:00`, text: day })));
}

/**
 * Lists the choices as "label: first day to last day", to state a whole list in one assertion.
 */
function describePresets(presets: readonly PeriodPreset[]): string[] {
  return presets.map(
    (preset) => `${preset.label}: ${preset.period.firstDayKey} to ${preset.period.lastDayKey}`,
  );
}

/** A chat from 14 March 2023 to 20 June 2024, with a message in each of the two years. */
const chatOverTwoYears = chatWithMessagesOn([
  '2023-03-14',
  '2023-12-31',
  '2024-01-01',
  '2024-06-20',
]);

describe('wholeChatPeriod', () => {
  it('runs from the day of the first message to the day of the last', () => {
    expect(wholeChatPeriod(chatOverTwoYears)).toEqual({
      firstDayKey: 20230314,
      lastDayKey: 20240620,
    });
  });
});

describe('isSamePeriod', () => {
  const march: Period = { firstDayKey: 20240301, lastDayKey: 20240331 };

  it('accepts two periods with the same first and last day', () => {
    expect(isSamePeriod(march, { firstDayKey: 20240301, lastDayKey: 20240331 })).toBe(true);
  });

  it('tells apart periods that start on different days', () => {
    expect(isSamePeriod(march, { firstDayKey: 20240302, lastDayKey: 20240331 })).toBe(false);
  });

  it('tells apart periods that end on different days', () => {
    expect(isSamePeriod(march, { firstDayKey: 20240301, lastDayKey: 20240330 })).toBe(false);
  });
});

describe('listPeriodPresets', () => {
  it('offers only the whole chat for a chat within one year that is no longer than a year', () => {
    const presets = listPeriodPresets(chatWithMessagesOn(['2024-02-01', '2024-11-30']));

    expect(describePresets(presets)).toEqual(['The whole chat: 20240201 to 20241130']);
  });

  it('offers each calendar year, cut down to the days of the chat, when it touches two', () => {
    const presets = listPeriodPresets(chatOverTwoYears);

    expect(describePresets(presets)).toEqual([
      'The whole chat: 20230314 to 20240620',
      'Last 12 months: 20230621 to 20240620',
      '2023: 20230314 to 20231231',
      '2024: 20240101 to 20240620',
    ]);
  });

  it('identifies the choices by values the page can find them by', () => {
    const values = listPeriodPresets(chatOverTwoYears).map((preset) => preset.value);

    expect(values).toEqual(['whole-chat', 'last-12-months', 'year-2023', 'year-2024']);
  });

  it('leaves out a year in which nobody wrote', () => {
    const presets = listPeriodPresets(chatWithMessagesOn(['2021-05-05', '2023-05-05']));

    expect(presets.map((preset) => preset.label)).toEqual([
      'The whole chat',
      'Last 12 months',
      '2021',
      '2023',
    ]);
  });

  describe('the last twelve months', () => {
    it('are not offered for a chat of exactly one year', () => {
      /* 16 March 2023 to 15 March 2024 is the twelve months themselves, so the choice would repeat "the whole chat". */
      const presets = listPeriodPresets(chatWithMessagesOn(['2023-03-16', '2024-03-15']));

      expect(presets.map((preset) => preset.label)).toEqual(['The whole chat', '2023', '2024']);
    });

    it('are offered for a chat one day longer than a year, starting the day after the same date a year earlier', () => {
      const presets = listPeriodPresets(chatWithMessagesOn(['2023-03-15', '2024-03-15']));

      expect(describePresets(presets)).toContain('Last 12 months: 20230316 to 20240315');
    });

    it('start on 1 March when the chat ends on 29 February', () => {
      const presets = listPeriodPresets(chatWithMessagesOn(['2022-06-01', '2024-02-29']));

      expect(describePresets(presets)).toContain('Last 12 months: 20230301 to 20240229');
    });

    it('start on 1 January when the chat ends on 31 December', () => {
      const presets = listPeriodPresets(chatWithMessagesOn(['2022-06-01', '2023-12-31']));

      expect(describePresets(presets)).toContain('Last 12 months: 20230101 to 20231231');
    });
  });
});

describe('isPeriodChoiceWorthOffering', () => {
  /** Analyses a chat with a message on 1 January 2024 and one on the given later day. */
  function chatFromNewYearTo(lastDay: string): ChatAnalysis {
    return chatWithMessagesOn(['2024-01-01', lastDay]);
  }

  it('is worth it from a span of 60 days, even with nothing but the whole chat to choose', () => {
    /* 1 January to 29 February 2024 is 31 + 29 = 60 days. */
    const chat = chatFromNewYearTo('2024-02-29');

    expect(chat.spanInDays).toBe(SHORTEST_SPAN_WORTH_FILTERING_IN_DAYS);
    expect(isPeriodChoiceWorthOffering(chat, listPeriodPresets(chat))).toBe(true);
  });

  it('is not worth it for 59 days within one year', () => {
    const chat = chatFromNewYearTo('2024-02-28');

    expect(chat.spanInDays).toBe(SHORTEST_SPAN_WORTH_FILTERING_IN_DAYS - 1);
    expect(isPeriodChoiceWorthOffering(chat, listPeriodPresets(chat))).toBe(false);
  });

  it('is worth it for a short chat that crosses New Year, because each year can be chosen', () => {
    const chat = chatWithMessagesOn(['2023-12-30', '2024-01-02']);

    expect(isPeriodChoiceWorthOffering(chat, listPeriodPresets(chat))).toBe(true);
  });
});

describe('findPresetOfPeriod', () => {
  const presets = listPeriodPresets(chatOverTwoYears);

  it('finds the choice that stands for exactly those days', () => {
    const preset = findPresetOfPeriod(presets, { firstDayKey: 20230314, lastDayKey: 20231231 });

    expect(preset?.label).toBe('2023');
  });

  it('finds none for dates that match no choice', () => {
    expect(
      findPresetOfPeriod(presets, { firstDayKey: 20230315, lastDayKey: 20231231 }),
    ).toBeUndefined();
  });

  it('does not use the value of the entry for dates typed by hand', () => {
    expect(presets.map((preset) => preset.value)).not.toContain(CUSTOM_PERIOD_VALUE);
  });
});

describe('dateFieldValueOfDayKey', () => {
  it.each([
    { dayKey: 20230314, expected: '2023-03-14' },
    { dayKey: 20240105, expected: '2024-01-05' },
    { dayKey: 20231231, expected: '2023-12-31' },
  ])('writes $dayKey as $expected', ({ dayKey, expected }) => {
    expect(dateFieldValueOfDayKey(dayKey)).toBe(expected);
  });
});

describe('dayKeyOfDateFieldValue', () => {
  it.each([
    { value: '2023-03-14', expected: 20230314 },
    { value: '2024-02-29', expected: 20240229 },
    { value: '2023-12-31', expected: 20231231 },
  ])('reads $value as $expected', ({ value, expected }) => {
    expect(dayKeyOfDateFieldValue(value)).toBe(expected);
  });

  it.each([
    { value: '', why: 'an empty field' },
    { value: '2023-02-31', why: 'a day the month does not have' },
    { value: '2023-02-29', why: '29 February outside a leap year' },
    { value: '2023-13-01', why: 'a thirteenth month' },
    { value: '14/03/2023', why: 'a date in another notation' },
    { value: '12023-03-14', why: 'a year of five digits' },
  ])('returns null for $why', ({ value }) => {
    expect(dayKeyOfDateFieldValue(value)).toBeNull();
  });

  it('reads back what dateFieldValueOfDayKey wrote', () => {
    expect(dayKeyOfDateFieldValue(dateFieldValueOfDayKey(20240620))).toBe(20240620);
  });
});

describe('readPeriodFromDateFields', () => {
  /** A chat from 14 March 2023 to 20 June 2024. */
  const wholeChat: Period = { firstDayKey: 20230314, lastDayKey: 20240620 };

  it('reads two dates inside the chat as the period between them', () => {
    expect(readPeriodFromDateFields('2023-05-01', '2023-05-31', wholeChat)).toEqual({
      kind: 'period',
      period: { firstDayKey: 20230501, lastDayKey: 20230531 },
    });
  });

  it('accepts the same day twice, as a period of one day', () => {
    expect(readPeriodFromDateFields('2023-05-01', '2023-05-01', wholeChat)).toEqual({
      kind: 'period',
      period: { firstDayKey: 20230501, lastDayKey: 20230501 },
    });
  });

  it('refuses a "from" one day after the "to"', () => {
    expect(readPeriodFromDateFields('2023-05-02', '2023-05-01', wholeChat)).toEqual({
      kind: 'unusable',
      reason: PERIOD_ENDS_BEFORE_IT_STARTS_STATUS,
    });
  });

  it('takes an empty "from" as the first day of the chat', () => {
    expect(readPeriodFromDateFields('', '2023-05-31', wholeChat)).toEqual({
      kind: 'period',
      period: { firstDayKey: 20230314, lastDayKey: 20230531 },
    });
  });

  it('takes an empty "to" as the last day of the chat', () => {
    expect(readPeriodFromDateFields('2023-05-01', '', wholeChat)).toEqual({
      kind: 'period',
      period: { firstDayKey: 20230501, lastDayKey: 20240620 },
    });
  });

  it('pulls dates beyond the chat back to its first and last day', () => {
    expect(readPeriodFromDateFields('2020-01-01', '2030-01-01', wholeChat)).toEqual({
      kind: 'period',
      period: wholeChat,
    });
  });

  it('refuses two dates before the chat began', () => {
    expect(readPeriodFromDateFields('2020-01-01', '2023-03-13', wholeChat)).toEqual({
      kind: 'unusable',
      reason: NO_MESSAGES_IN_PERIOD_STATUS,
    });
  });

  it('refuses two dates after the chat ended', () => {
    expect(readPeriodFromDateFields('2024-06-21', '2030-01-01', wholeChat)).toEqual({
      kind: 'unusable',
      reason: NO_MESSAGES_IN_PERIOD_STATUS,
    });
  });

  it('accepts a period that only touches the first day of the chat', () => {
    expect(readPeriodFromDateFields('2020-01-01', '2023-03-14', wholeChat)).toEqual({
      kind: 'period',
      period: { firstDayKey: 20230314, lastDayKey: 20230314 },
    });
  });
});

describe('selectMessagesOfPeriod', () => {
  const messages = [
    textMessage({ sentAt: '2024-02-29 23:59:59', text: 'the evening before' }),
    textMessage({ sentAt: '2024-03-01 00:00:00', text: 'first second of the first day' }),
    textMessage({ sentAt: '2024-03-15 12:00', text: 'in the middle' }),
    textMessage({ sentAt: '2024-03-31 23:59:59', text: 'last second of the last day' }),
    textMessage({ sentAt: '2024-04-01 00:00:00', text: 'the morning after' }),
  ];

  it('keeps the messages of both the first and the last day, from midnight to midnight', () => {
    const march = selectMessagesOfPeriod(messages, { firstDayKey: 20240301, lastDayKey: 20240331 });

    expect(textsOf(march)).toEqual([
      'first second of the first day',
      'in the middle',
      'last second of the last day',
    ]);
  });

  it('keeps one day when the period starts and ends on it', () => {
    const oneDay = selectMessagesOfPeriod(messages, {
      firstDayKey: 20240315,
      lastDayKey: 20240315,
    });

    expect(textsOf(oneDay)).toEqual(['in the middle']);
  });

  it('keeps nothing for days on which nobody wrote', () => {
    expect(
      selectMessagesOfPeriod(messages, { firstDayKey: 20240302, lastDayKey: 20240314 }),
    ).toEqual([]);
  });
});

describe('analysePeriod', () => {
  /** Ana and Bob wrote in November 2023; in February 2024 Bob wrote alone, three times. */
  const chat = analyseMessages([
    textMessage({ sender: 'Ana', sentAt: '2023-11-05 09:00', text: 'breakfast tomorrow?' }),
    textMessage({ sender: 'Bob', sentAt: '2023-11-05 09:10', text: 'yes please' }),
    textMessage({ sender: 'Ana', sentAt: '2023-11-06 08:00', text: 'on my way' }),
    textMessage({ sender: 'Bob', sentAt: '2024-02-10 20:00', text: 'anybody there' }),
    textMessage({ sender: 'Bob', sentAt: '2024-02-11 20:00', text: 'hello hello' }),
    textMessage({ sender: 'Bob', sentAt: '2024-02-11 20:05', text: 'never mind' }),
  ]);

  it('counts only the messages of the period', () => {
    const analysis = analysePeriod(chat, { firstDayKey: 20230101, lastDayKey: 20231231 });

    expect(analysis?.totalMessageCount).toBe(3);
    expect(analysis === null ? [] : textsOf(analysis.messages)).toEqual([
      'breakfast tomorrow?',
      'yes please',
      'on my way',
    ]);
  });

  it('reports the first and last day of the messages it found, not of the period', () => {
    const analysis = analysePeriod(chat, { firstDayKey: 20230101, lastDayKey: 20231231 });

    expect(analysis?.firstMessageTimestamp).toEqual(new Date(2023, 10, 5, 9, 0));
    expect(analysis?.lastMessageTimestamp).toEqual(new Date(2023, 10, 6, 8, 0));
    expect(analysis?.spanInDays).toBe(2);
  });

  it('counts every person again, so somebody silent in the period is not listed', () => {
    const analysis = analysePeriod(chat, { firstDayKey: 20240101, lastDayKey: 20241231 });

    expect(analysis === null ? [] : participantNames(analysis)).toEqual(['Bob']);
    expect(analysis === null ? 0 : findPerson(analysis, 'Bob').messageCount).toBe(3);
  });

  it('ranks the people by what they wrote in the period', () => {
    const analysis = analysePeriod(chat, { firstDayKey: 20230101, lastDayKey: 20231231 });

    expect(participantNames(chat)).toEqual(['Bob', 'Ana']);
    expect(analysis === null ? [] : participantNames(analysis)).toEqual(['Ana', 'Bob']);
  });

  it('keeps the resolution of the timestamps of the whole chat', () => {
    const minuteChat: ChatAnalysis = { ...chat, timestampResolution: 'minute' };

    const analysis = analysePeriod(minuteChat, { firstDayKey: 20230101, lastDayKey: 20231231 });

    expect(analysis?.timestampResolution).toBe('minute');
  });

  it('hands back the analysis it was given for the period of the whole chat', () => {
    expect(analysePeriod(chat, wholeChatPeriod(chat))).toBe(chat);
  });

  it('returns null for a period in which nobody wrote', () => {
    expect(analysePeriod(chat, { firstDayKey: 20231107, lastDayKey: 20240209 })).toBeNull();
  });

  it('finds a message on the last day before a silent stretch and on the first day after it', () => {
    const untilSilence = analysePeriod(chat, { firstDayKey: 20231106, lastDayKey: 20240209 });
    const fromSilence = analysePeriod(chat, { firstDayKey: 20231107, lastDayKey: 20240210 });

    expect(untilSilence?.totalMessageCount).toBe(1);
    expect(fromSilence?.totalMessageCount).toBe(1);
  });
});

describe('describePeriod', () => {
  it('names the first and the last day and says that this is not the whole chat', () => {
    expect(describePeriod({ firstDayKey: 20230314, lastDayKey: 20231231 })).toBe(
      'Showing 14 Mar 2023 to 31 Dec 2023, not the whole chat.',
    );
  });

  it('names a single day once', () => {
    expect(describePeriod({ firstDayKey: 20230314, lastDayKey: 20230314 })).toBe(
      'Showing 14 Mar 2023 only, not the whole chat.',
    );
  });
});

describe('the group history of a period', () => {
  const bobJoined = groupEvent('2023-11-05 08:00', {
    kind: 'joined',
    member: namedMember('Bob'),
    isThroughInviteLink: false,
  });
  const groupCreated = groupEvent('2023-10-01 12:00', {
    kind: 'created',
    creator: namedMember('Ana'),
    groupName: null,
  });
  const anaLeft = groupEvent('2023-11-06 23:59', { kind: 'left', member: namedMember('Ana') });
  const carlaAdded = groupEvent('2024-02-10 00:00', {
    kind: 'added',
    actor: namedMember('Bob'),
    members: [namedMember('Carla')],
  });
  const groupEvents = [groupCreated, bobJoined, anaLeft, carlaAdded];

  /** Ana and Bob wrote on 5 and 6 November 2023; Bob wrote alone on 10 February 2024. */
  const chat = analyseChat(
    [
      textMessage({ sender: 'Ana', sentAt: '2023-11-05 09:00', text: 'breakfast tomorrow?' }),
      textMessage({ sender: 'Bob', sentAt: '2023-11-06 08:00', text: 'on my way' }),
      textMessage({ sender: 'Bob', sentAt: '2024-02-10 20:00', text: 'anybody there' }),
    ],
    'second',
    groupEvents,
  );

  describe('selectGroupEventsOfPeriod', () => {
    it('keeps the events of the first and the last day of the period, and none outside', () => {
      const november = { firstDayKey: 20231105, lastDayKey: 20231106 };

      expect(selectGroupEventsOfPeriod(groupEvents, november)).toEqual([bobJoined, anaLeft]);
    });

    it('keeps nothing when no event falls in the period', () => {
      const december = { firstDayKey: 20231201, lastDayKey: 20231231 };

      expect(selectGroupEventsOfPeriod(groupEvents, december)).toEqual([]);
    });
  });

  describe('analysePeriod', () => {
    it('keeps only the events of the period', () => {
      const analysis = analysePeriod(chat, { firstDayKey: 20240101, lastDayKey: 20241231 });

      expect(analysis?.groupEvents).toEqual([carlaAdded]);
    });

    it('keeps every event for the whole chat, also one from before the first message', () => {
      const analysis = analysePeriod(chat, { firstDayKey: 20231105, lastDayKey: 20240210 });

      expect(analysis?.groupEvents).toEqual([groupCreated, bobJoined, anaLeft, carlaAdded]);
    });

    it('goes by the days of the period, so an event after its last message is kept', () => {
      /* Bob wrote at 08:00 on 6 November; Ana left at 23:59 that day. */
      const analysis = analysePeriod(chat, { firstDayKey: 20231106, lastDayKey: 20231106 });

      expect(analysis?.groupEvents).toEqual([anaLeft]);
    });
  });
});
