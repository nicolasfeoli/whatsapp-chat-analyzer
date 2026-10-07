/**
 * Generates the invented example chat the page shows before a file is loaded.
 *
 * The chat between "Marta" and "Diego" is produced by a seeded random number
 * generator, so every visitor sees exactly the same example and the
 * screenshots in the README stay true. Nothing in it comes from a real chat.
 *
 * The output is the text of an iPhone-style export (`[dd/mm/yy, hh:mm:ss]
 * Name: text`), which is then parsed and analysed like any loaded file. That
 * way the example exercises the same code path as a real export.
 *
 * The order in which random numbers are drawn is part of the output: moving a
 * draw changes every line after it. The functions below therefore each note
 * the draws they make.
 */

import {
  LEFT_TO_RIGHT_MARK,
  MILLISECONDS_PER_MINUTE,
  MINUTES_PER_HOUR,
  SECONDS_PER_MINUTE,
} from '../core/index';
import { formatTwoDigitYear, padToTwoDigits } from './text-formatting';

/** The title shown above the example. */
export const SAMPLE_CHAT_TITLE = 'Marta and Diego (example)';

/** The fixed seed of the generator; it reads as the first day of the chat, 5 January 2026. */
const RANDOM_SEED = 20260105;

/**
 * The multiplier of the linear congruential generator, the well-known constant
 * from "Numerical Recipes". Quality hardly matters here; what matters is that
 * the sequence is the same in every browser.
 */
const GENERATOR_MULTIPLIER = 1664525;

/** The increment of the same generator, also from "Numerical Recipes". */
const GENERATOR_INCREMENT = 1013904223;

/** The generator's state is a 32-bit number; dividing by 2^32 maps it to [0, 1). */
const GENERATOR_RANGE = 4294967296;

/** The person of the example who writes more, opens most conversations and replies quickly. */
const MARTA = 'Marta';

/** The person of the example who writes less, laughs in writing and replies more slowly. */
const DIEGO = 'Diego';

/** One of the two people of the example. */
type SamplePerson = typeof MARTA | typeof DIEGO;

/** The first day of the example: 5 January 2026 (months count from zero). */
const FIRST_DAY = { year: 2026, monthIndex: 0, dayOfMonth: 5 } as const;

/** The last day of the example: 3 October 2026, about nine months after the first. */
const LAST_DAY = { year: 2026, monthIndex: 9, dayOfMonth: 3 } as const;

/** A holiday in July (12th to 20th) without a single message gives the chat a "longest silence". */
const SILENT_PERIOD = { monthIndex: 6, firstDayOfMonth: 12, lastDayOfMonth: 20 } as const;

/** 16 May is the one very busy day, so the chat has an obvious "busiest day". */
const BUSY_DAY = { monthIndex: 4, dayOfMonth: 16 } as const;

/** The `Date.getDay()` values of the days that are treated specially. */
const WEEKDAY = { sunday: 0, wednesday: 3, saturday: 6 } as const;

/** The chance that any message is exchanged on a Wednesday, the chat's quietest weekday. */
const CHANCE_OF_CHAT_ON_WEDNESDAY = 0.55;

/** The chance that any message is exchanged on every other weekday. */
const CHANCE_OF_CHAT_ON_OTHER_DAYS = 0.86;

/** The busy day has four conversations. */
const CONVERSATIONS_ON_BUSY_DAY = 4;

/** Other days have one conversation plus up to this many more, usually none. */
const MOST_EXTRA_CONVERSATIONS_PER_DAY = 3;

/** A conversation on the busy day has at least 25 messages. */
const SHORTEST_CONVERSATION_ON_BUSY_DAY = 25;

/** A conversation on any other day has at least 2 messages: something said and an answer. */
const SHORTEST_CONVERSATION_ON_OTHER_DAYS = 2;

/** Up to this many further messages are added to a conversation, usually far fewer. */
const MOST_EXTRA_MESSAGES_PER_CONVERSATION = 24;

/** Marta opens 63% of the conversations. */
const CHANCE_THAT_MARTA_OPENS = 0.63;

/** 5% of the messages are media placeholders. */
const CHANCE_OF_MEDIA = 0.05;

/** Up to this draw (a further 45%) the message is an everyday phrase both people use. */
const DRAW_BELOW_WHICH_PHRASE_IS_SHARED = 0.5;

/** Marta adds an emoji to a quarter of her everyday phrases. */
const CHANCE_THAT_MARTA_ADDS_EMOJI = 0.25;

/** 12% of everyday phrases are turned into a question. */
const CHANCE_OF_QUESTION_MARK = 0.12;

/** 1.5% of the messages are replaced by the long story, the chat's "longest message". */
const CHANCE_OF_LONG_STORY = 0.015;

/** After 68% of the messages the other person writes next; otherwise the same person continues. */
const CHANCE_OF_SPEAKER_CHANGE = 0.68;

/** A range of minutes from which a waiting time is drawn. */
interface WaitInMinutes {
  /** The shortest wait. */
  readonly shortest: number;
  /** How much longer than the shortest the wait can be. */
  readonly spread: number;
}

/** Diego takes between 1 and 29 minutes to reply, usually towards the short end. */
const DIEGO_REPLY_WAIT: WaitInMinutes = { shortest: 1, spread: 28 };

/** Marta takes between 0.4 and 7.4 minutes to reply. */
const MARTA_REPLY_WAIT: WaitInMinutes = { shortest: 0.4, spread: 7 };

/** A follow-up message by the same person comes 0.1 to 1.3 minutes later. */
const FOLLOW_UP_WAIT: WaitInMinutes = { shortest: 0.1, spread: 1.2 };

/**
 * The hours at which conversations start at the weekend: late mornings and
 * evenings. An hour listed twice is twice as likely.
 */
const WEEKEND_CONVERSATION_HOURS: readonly number[] = [10, 11, 12, 13, 16, 18, 20, 21, 22, 23, 0];

/** The hours at which conversations start on working days: before work, at lunch and in the evening. */
const WEEKDAY_CONVERSATION_HOURS: readonly number[] = [
  8, 8, 9, 13, 13, 14, 18, 19, 20, 21, 21, 22, 22, 23, 0,
];

/** Placeholders an iPhone export writes for media; images are listed twice to be more common. */
const MEDIA_PLACEHOLDERS: readonly string[] = [
  'image omitted',
  'image omitted',
  'audio omitted',
  'sticker omitted',
  'video omitted',
];

/** Everyday phrases either person might send. */
const SHARED_PHRASES: readonly string[] = [
  'did you see the photos from saturday',
  'what time are you home today',
  'I am leaving the office now',
  'can you pick up bread on the way',
  'the train is delayed again',
  'dinner at my parents on sunday, remember',
  'I booked the tickets for the concert',
  'the plumber is coming tomorrow morning',
  'how was the meeting',
  'call me when you can',
  'running ten minutes late',
  'we need coffee and milk',
  'the neighbour asked about the parking spot again',
  'did you feed the cat',
  'weekend plan: beach or mountain',
  'I found a cheap flight to Lisbon',
  'movie tonight',
  'the package arrived',
  'good morning',
  'good night, sleep well',
  'I will cook tonight',
  'that restaurant was amazing',
  'rain all day here',
  'remind me to pay the electricity bill',
  'ok perfect',
  'sounds good',
  'on my way',
  'thanks for today',
];

/** Phrases only Marta sends: questions and emojis, which give her distinct statistics. */
const MARTA_PHRASES: readonly string[] = [
  'what do you think?',
  'are you coming to yoga with us?',
  'did you remember the keys?',
  'look at this recipe 😍',
  'I miss you ❤️',
  'so tired today 😴',
  'can we talk later?',
  'guess who I just met 😱',
  'the garden looks beautiful 🌿',
  'do we have plans friday?',
  'love it ❤️',
  'seriously? 😂',
  'I am bringing dessert 🍰',
  'have you eaten?',
];

/** Phrases only Diego sends: laughs and football, which give him his signature words. */
const DIEGO_PHRASES: readonly string[] = [
  'jajaja no way',
  'jajajaja',
  'the match starts at nine ⚽',
  'I will fix the bike this weekend',
  'boss wants the report by friday',
  'honestly no idea',
  'jaja ok',
  'give me five minutes',
  'pizza tonight 🍕',
  'the car needs petrol',
  'deal',
  'jajaja you win',
  'watching the match with Pablo',
  'sure 👍',
];

/** The emojis Marta appends to everyday phrases. */
const MARTA_EXTRA_EMOJIS: readonly string[] = ['😊', '❤️', '😂', '🙈', '✨'];

/** The one long message of the example. */
const LONG_STORY =
  'I had a long day so let me tell you everything: first the train was delayed for forty minutes, then the meeting ran over, then I realised I left my lunch at home, and after all that the client finally signed the contract we have been chasing since March, so tonight we celebrate and I am choosing the restaurant';

/** Returns the next number of a random sequence, at least 0 and below 1. */
type RandomNumberSource = () => number;

/**
 * Creates a linear congruential generator.
 *
 * `Math.imul` multiplies as 32-bit integers, and `>>> 0` reads the result as
 * an unsigned 32-bit number, so the sequence is identical in every engine.
 *
 * @param seed - The starting state.
 * @returns A function that returns the next number in [0, 1) on each call.
 */
export function createSeededRandomNumberSource(seed: number): RandomNumberSource {
  let state = seed;
  return function nextRandomNumber(): number {
    state = (Math.imul(state, GENERATOR_MULTIPLIER) + GENERATOR_INCREMENT) >>> 0;
    return state / GENERATOR_RANGE;
  };
}

/**
 * Picks one item of a list at random. Makes one draw.
 */
function pickRandomItem<Item>(items: readonly Item[], random: RandomNumberSource): Item {
  const index = Math.floor(random() * items.length);
  const item = items[index];
  if (item === undefined) {
    throw new RangeError('Cannot pick an item from an empty list.');
  }
  return item;
}

/**
 * The person who is not the given one.
 */
function otherPersonThan(person: SamplePerson): SamplePerson {
  return person === MARTA ? DIEGO : MARTA;
}

/**
 * Whether a day falls in the July holiday during which nobody writes.
 */
function isSilentDay(day: Date): boolean {
  const dayOfMonth = day.getDate();
  return (
    day.getMonth() === SILENT_PERIOD.monthIndex &&
    dayOfMonth >= SILENT_PERIOD.firstDayOfMonth &&
    dayOfMonth <= SILENT_PERIOD.lastDayOfMonth
  );
}

/**
 * Whether a day is the one very busy day of the example.
 */
function isBusyDay(day: Date): boolean {
  return day.getMonth() === BUSY_DAY.monthIndex && day.getDate() === BUSY_DAY.dayOfMonth;
}

/**
 * Decides whether anything is written on a day. Makes one draw.
 */
function isDayWithChat(day: Date, random: RandomNumberSource): boolean {
  const chanceOfChat =
    day.getDay() === WEEKDAY.wednesday ? CHANCE_OF_CHAT_ON_WEDNESDAY : CHANCE_OF_CHAT_ON_OTHER_DAYS;
  return random() <= chanceOfChat;
}

/**
 * Decides how many conversations a day has. Makes two draws, or none on the
 * busy day. Multiplying two draws skews the result towards the low end.
 */
function chooseConversationCount(isBusy: boolean, random: RandomNumberSource): number {
  if (isBusy) {
    return CONVERSATIONS_ON_BUSY_DAY;
  }
  const firstDraw = random();
  const secondDraw = random();
  return 1 + Math.floor(firstDraw * secondDraw * MOST_EXTRA_CONVERSATIONS_PER_DAY);
}

/**
 * Chooses the moment a conversation starts. Makes three draws: the hour, the
 * minute and the second, in that order.
 */
function chooseConversationStart(day: Date, random: RandomNumberSource): Date {
  const weekday = day.getDay();
  const isWeekend = weekday === WEEKDAY.sunday || weekday === WEEKDAY.saturday;
  const candidateHours = isWeekend ? WEEKEND_CONVERSATION_HOURS : WEEKDAY_CONVERSATION_HOURS;

  const hour = pickRandomItem(candidateHours, random);
  const minute = Math.floor(random() * MINUTES_PER_HOUR);
  const second = Math.floor(random() * SECONDS_PER_MINUTE);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, second);
}

/**
 * Decides how many messages a conversation has. Makes two draws.
 */
function chooseMessageCount(isBusy: boolean, random: RandomNumberSource): number {
  const shortestConversation = isBusy
    ? SHORTEST_CONVERSATION_ON_BUSY_DAY
    : SHORTEST_CONVERSATION_ON_OTHER_DAYS;
  const firstDraw = random();
  const secondDraw = random();
  const extraMessages = Math.floor(firstDraw * secondDraw * MOST_EXTRA_MESSAGES_PER_CONVERSATION);
  return shortestConversation + extraMessages;
}

/**
 * Writes an everyday phrase. Makes one draw for the phrase; for Marta one more
 * for whether to add an emoji and, if so, another for which; and a last one
 * for whether to add a question mark.
 */
function writeSharedPhrase(sender: SamplePerson, random: RandomNumberSource): string {
  let text = pickRandomItem(SHARED_PHRASES, random);

  /* The emoji draw is only made for Marta; Diego's messages skip it entirely. */
  if (sender === MARTA && random() < CHANCE_THAT_MARTA_ADDS_EMOJI) {
    text += ` ${pickRandomItem(MARTA_EXTRA_EMOJIS, random)}`;
  }
  if (random() < CHANCE_OF_QUESTION_MARK) {
    text += '?';
  }
  return text;
}

/**
 * Writes the text of one message. Makes one draw for the kind of message, the
 * draws of that kind, and a final draw for whether the long story replaces it.
 */
function writeMessageText(sender: SamplePerson, random: RandomNumberSource): string {
  const kindDraw = random();
  let text: string;
  if (kindDraw < CHANCE_OF_MEDIA) {
    /*
     * iPhone exports put a left-to-right mark before text the sender did not
     * type, such as media placeholders. The parser relies on it, so the
     * example includes it.
     */
    text = LEFT_TO_RIGHT_MARK + pickRandomItem(MEDIA_PLACEHOLDERS, random);
  } else if (kindDraw < DRAW_BELOW_WHICH_PHRASE_IS_SHARED) {
    text = writeSharedPhrase(sender, random);
  } else {
    const ownPhrases = sender === MARTA ? MARTA_PHRASES : DIEGO_PHRASES;
    text = pickRandomItem(ownPhrases, random);
  }

  if (random() < CHANCE_OF_LONG_STORY) {
    text = LONG_STORY;
  }
  return text;
}

/**
 * Writes one line the way an iPhone export does: `[dd/mm/yy, hh:mm:ss] Name: text`.
 */
function formatExportLine(timestamp: Date, sender: SamplePerson, text: string): string {
  const dayOfMonth = padToTwoDigits(timestamp.getDate());
  const monthNumber = padToTwoDigits(timestamp.getMonth() + 1);
  const twoDigitYear = formatTwoDigitYear(timestamp);
  const hour = padToTwoDigits(timestamp.getHours());
  const minute = padToTwoDigits(timestamp.getMinutes());
  const second = padToTwoDigits(timestamp.getSeconds());
  return `[${dayOfMonth}/${monthNumber}/${twoDigitYear}, ${hour}:${minute}:${second}] ${sender}: ${text}`;
}

/**
 * Chooses how many minutes pass before the next message. Makes two draws for
 * a reply and one for a follow-up by the same person.
 *
 * @param isReply - Whether the next message is written by the other person.
 * @param nextSender - Who writes the next message.
 */
function chooseMinutesUntilNextMessage(
  isReply: boolean,
  nextSender: SamplePerson,
  random: RandomNumberSource,
): number {
  if (!isReply) {
    return FOLLOW_UP_WAIT.shortest + random() * FOLLOW_UP_WAIT.spread;
  }

  /* Multiplying two draws skews the wait towards the short end. */
  const firstDraw = random();
  const secondDraw = random();
  const replyWait = nextSender === DIEGO ? DIEGO_REPLY_WAIT : MARTA_REPLY_WAIT;
  return replyWait.shortest + firstDraw * secondDraw * replyWait.spread;
}

/**
 * Writes the lines of one conversation.
 */
function writeConversation(day: Date, isBusy: boolean, random: RandomNumberSource): string[] {
  const lines: string[] = [];
  let timestamp = chooseConversationStart(day, random);
  let sender: SamplePerson = random() < CHANCE_THAT_MARTA_OPENS ? MARTA : DIEGO;
  const messageCount = chooseMessageCount(isBusy, random);

  for (let messageIndex = 0; messageIndex < messageCount; messageIndex += 1) {
    const text = writeMessageText(sender, random);
    lines.push(formatExportLine(timestamp, sender, text));

    const isSpeakerChange = random() < CHANCE_OF_SPEAKER_CHANGE;
    if (isSpeakerChange) {
      sender = otherPersonThan(sender);
    }
    const minutesUntilNext = chooseMinutesUntilNextMessage(isSpeakerChange, sender, random);
    timestamp = new Date(timestamp.getTime() + minutesUntilNext * MILLISECONDS_PER_MINUTE);
  }
  return lines;
}

/**
 * Writes the lines of one day, which may be none at all.
 */
function writeDay(day: Date, random: RandomNumberSource): string[] {
  if (isSilentDay(day)) {
    return [];
  }
  if (!isDayWithChat(day, random)) {
    return [];
  }

  const isBusy = isBusyDay(day);
  const conversationCount = chooseConversationCount(isBusy, random);
  const lines: string[] = [];
  for (let conversationIndex = 0; conversationIndex < conversationCount; conversationIndex += 1) {
    lines.push(...writeConversation(day, isBusy, random));
  }
  return lines;
}

/**
 * Generates the text of the example chat.
 *
 * @returns About nine months of invented messages between Marta and Diego, in
 *   the format of an iPhone export. The same text on every call.
 */
export function generateSampleChatText(): string {
  const random = createSeededRandomNumberSource(RANDOM_SEED);
  const lastDay = new Date(LAST_DAY.year, LAST_DAY.monthIndex, LAST_DAY.dayOfMonth);
  const day = new Date(FIRST_DAY.year, FIRST_DAY.monthIndex, FIRST_DAY.dayOfMonth);

  const lines: string[] = [];
  while (day.getTime() <= lastDay.getTime()) {
    lines.push(...writeDay(day, random));
    day.setDate(day.getDate() + 1);
  }
  return lines.join('\n');
}
