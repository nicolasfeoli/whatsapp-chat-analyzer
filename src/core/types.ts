/**
 * Every type shared between the parser, the analysis, the worker and the page.
 *
 * Results cross the worker boundary by structured clone, so everything here is
 * plain data: objects, arrays, numbers, strings, booleans, `Map` and `Date`.
 * No class instances and no functions.
 */

/* -------------------------------------------------------------------------- */
/* Messages                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * What a message is, as far as the statistics care.
 *
 * - `text`: something the sender typed.
 * - `media`: a placeholder the export wrote instead of a photo, video, voice
 *   note, sticker, document, poll or location.
 * - `deleted`: the "This message was deleted" tombstone.
 */
export type MessageKind = 'text' | 'media' | 'deleted';

/**
 * What a media placeholder stands for, when the export says. `unknown` covers
 * the placeholders that do not: an Android export made without media writes
 * the same `<Media omitted>` for a photo, a sticker and a voice note.
 */
export type MediaType =
  | 'photo'
  | 'video'
  | 'audio'
  | 'sticker'
  | 'gif'
  | 'document'
  | 'contact'
  | 'poll'
  | 'location'
  | 'unknown';

/** The fields every message has, whatever its kind. */
interface ChatMessageBase {
  /** When the message was sent, in the local time zone of the device running the analysis. */
  readonly timestamp: Date;
  /** The sender's name exactly as the export wrote it (a contact name or a phone number). */
  readonly sender: string;
  /**
   * The message body. For `text` messages this is what was typed, including any
   * continuation lines joined with `\n`. For `media` and `deleted` messages it
   * is the placeholder the export wrote, which is never counted as words.
   */
  readonly text: string;
  /**
   * Whether the export marks the message as edited after it was sent, with
   * the note `<This message was edited>` at its end. The note itself is not
   * part of `text`. Only the English and the Spanish note are recognised.
   */
  readonly isEdited: boolean;
}

/*
 * The three variants below are intentionally identical apart from `kind`. The
 * export gives a media placeholder and a deleted-message tombstone the same
 * shape as typed text (a time, a sender and a line of text), and the page shows
 * that line for a deleted message. They are separate interfaces so that code
 * handling messages has to say which kinds it means (`message.kind === 'text'`)
 * and so that a field specific to one kind has an obvious place to go.
 */

/** A message the sender typed. */
export interface TextMessage extends ChatMessageBase {
  readonly kind: 'text';
}

/** A placeholder for a photo, video, voice note, sticker, document, poll or location. */
export interface MediaMessage extends ChatMessageBase {
  readonly kind: 'media';
  /**
   * What the sender typed to go with the media, when the export writes it in
   * front of the placeholder as iPhone does; lines joined with `\n`. Empty
   * when there is no caption. Its words and emojis are counted for the sender,
   * but the message itself stays a media message.
   */
  readonly caption: string;
}

/** The tombstone left behind when a message was deleted. */
export interface DeletedMessage extends ChatMessageBase {
  readonly kind: 'deleted';
}

/** One message of the chat, discriminated by {@link MessageKind} in `kind`. */
export type ChatMessage = TextMessage | MediaMessage | DeletedMessage;

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The order of the three numbers in a date.
 *
 * - `dmy`: day/month/year, e.g. `31/12/23`.
 * - `mdy`: month/day/year, e.g. `12/31/23`.
 * - `ymd`: year/month/day, e.g. `2023/12/31`.
 */
export type DateOrder = 'dmy' | 'mdy' | 'ymd';

/**
 * The two date orders that can be confused with each other. A year-first date
 * is recognisable on its own, so it never needs forcing.
 */
export type AmbiguousDateOrder = 'dmy' | 'mdy';

/** Which WhatsApp client wrote the export, judged from the layout of its lines. */
export type ExportPlatform = 'iPhone' | 'Android';

/**
 * How finely the export records time. iPhone exports include seconds; Android
 * exports stop at the minute, so a reply within the same minute has a delay of 0.
 */
export type TimestampResolution = 'second' | 'minute';

/**
 * What was read and what was skipped while parsing, so that a half-understood
 * file does not pass for a complete one.
 */
export interface ParseReport {
  /** Lines of the file that contain something other than white space. */
  readonly nonEmptyLineCount: number;
  /** Lines that start with a timestamp, i.e. messages and system notices together. */
  readonly entryCount: number;
  /** Entries dropped because they are system notices rather than messages. */
  readonly systemNoticeCount: number;
  /** Entries dropped because their date or time is impossible, such as 31/02. */
  readonly unreadableDateCount: number;
  /** Entries that turned out to be lines pasted from another chat and were folded into the message quoting them. */
  readonly foldedPastedLineCount: number;
  /** The client that wrote the export, or `null` when the file has no entry at all. */
  readonly platform: ExportPlatform | null;
}

/** The outcome of parsing the text of a chat export. */
export interface ParsedChat {
  /** The messages in the order they appear in the file. Empty when the text is not a chat export. */
  readonly messages: readonly ChatMessage[];
  /** How the dates were read, or `null` when no message was found. */
  readonly dateOrder: DateOrder | null;
  /**
   * `true` when the file alone cannot settle day/month against month/day (no
   * number above 12 in either position), or when the caller forced an order.
   * The page then offers a switch.
   */
  readonly isDateOrderAmbiguous: boolean;
  /** Whether any kept message carried seconds. `second` when no message was found. */
  readonly timestampResolution: TimestampResolution;
  /** What was read and what was skipped. */
  readonly report: ParseReport;
}

/* -------------------------------------------------------------------------- */
/* Analysis                                                                   */
/* -------------------------------------------------------------------------- */

/** A phrase that one person uses markedly more than the others. */
export interface SignaturePhrase {
  /** Two or three lower-cased words separated by single spaces. */
  readonly phrase: string;
  /** How many times the person used it. */
  readonly count: number;
}

/** Everything counted for one participant. */
export interface PersonStatistics {
  /** The participant's name as written in the export. */
  readonly name: string;
  /** Every message from this person: text, media and deleted together. */
  readonly messageCount: number;
  /** Messages that are typed text (neither media nor deleted). */
  readonly textMessageCount: number;
  /** Media placeholders sent. */
  readonly mediaCount: number;
  /**
   * The media placeholders split by what they stand for, in order of first
   * use. The counts add up to {@link PersonStatistics.mediaCount}.
   */
  readonly mediaCountsByType: ReadonlyMap<MediaType, number>;
  /** Deleted-message tombstones. */
  readonly deletedCount: number;
  /**
   * Messages of any kind that the export marks as edited after they were
   * sent. An export says that a message was edited, not how often or what it
   * said before.
   */
  readonly editedMessageCount: number;
  /** Words typed across all text messages and media captions, links and mentions excluded. */
  readonly wordCount: number;
  /** Emojis used across all text messages and media captions. */
  readonly emojiCount: number;
  /** Text messages that contain a question mark (`?` or `¿`). */
  readonly questionCount: number;
  /** Links shared (`http://`, `https://` or `www.`), in text messages and media captions. */
  readonly linkCount: number;
  /**
   * How often this person shared a link to each site, keyed by the site
   * (`example.com`: the host of the link, lower-cased and reduced to what looks
   * like its registrable domain), in order of first use. The path and the
   * query of a link are never kept. Links without such a host are left out, so
   * the counts can add up to less than {@link PersonStatistics.linkCount}.
   */
  readonly linkSiteCounts: ReadonlyMap<string, number>;
  /** Text messages that contain at least one written laugh such as "haha" or "jaja". */
  readonly laughingMessageCount: number;
  /** Messages sent between midnight and 04:59. */
  readonly nightMessageCount: number;
  /**
   * This person's messages of every kind by the hour of the day they were
   * sent in: twenty-four counts, index 0 for 00:00 to 00:59 up to index 23
   * for 23:00 to 23:59, in the local time zone of the device running the
   * analysis. The counts add up to {@link PersonStatistics.messageCount}.
   */
  readonly messageCountsByHour: readonly number[];
  /**
   * This person's messages of every kind by the weekday they were sent on:
   * seven counts, index 0 for Monday up to index 6 for Sunday, like the rows
   * of {@link WeekdayHourHeatmap}. The counts add up to
   * {@link PersonStatistics.messageCount}.
   */
  readonly messageCountsByWeekday: readonly number[];
  /** When this person's oldest message of any kind was sent. */
  readonly firstMessageTimestamp: Date;
  /**
   * When this person's newest message of any kind was sent. Compare it with
   * {@link ChatAnalysis.lastMessageTimestamp} for how long they had been
   * silent when the export was made.
   */
  readonly lastMessageTimestamp: Date;
  /**
   * One entry per reply: the time in milliseconds between someone else's
   * message and this person's answer, when it came within twelve hours.
   * Feed it to `median` for the typical reply time.
   */
  readonly replyDelaysInMilliseconds: readonly number[];
  /**
   * How often this person mentioned each name with `@`, keyed by the name as
   * the export wrote it, in order of first mention. Only iPhone exports mark
   * mentions in a way that can be read; elsewhere the map is empty.
   */
  readonly mentionCountsByName: ReadonlyMap<string, number>;
  /**
   * The phrases of two or three words this person uses far more than the
   * others do, the most distinctive first. Empty in a chat with one sender.
   */
  readonly signaturePhrases: readonly SignaturePhrase[];
  /** Messages this person sent in the first comparison period of the chat; see {@link ChatAnalysis.comparisonPeriodInDays}. */
  readonly earlyMessageCount: number;
  /** Messages this person sent in the last comparison period of the chat. */
  readonly recentMessageCount: number;
  /** Conversations this person opened (the first message, or the first after a long silence). */
  readonly conversationsStartedCount: number;
  /**
   * Conversations in which this person wrote the last message before a long
   * silence. The conversation still open at the end of the export is not
   * counted, because nobody knows yet how it ends.
   */
  readonly conversationsEndedCount: number;
  /**
   * Questions this person asked in the closing turn of a conversation: nobody
   * else wrote after them before the long silence. Compare it with
   * {@link PersonStatistics.questionCount} for the share left unanswered.
   */
  readonly unansweredQuestionCount: number;
  /**
   * How often this person replied to each other participant, keyed by that
   * participant's name, in order of first reply. One entry of
   * {@link PersonStatistics.replyDelaysInMilliseconds} corresponds to one count
   * here. An export does not record which message a reply quotes, so a reply
   * is credited to whoever wrote the message just before it.
   */
  readonly replyCountsByRecipient: ReadonlyMap<string, number>;
  /**
   * The delays of this person's replies split by whose message they answered:
   * keyed by that participant's name, in order of first reply, each list in
   * the order the replies were written. Together the lists hold the entries of
   * {@link PersonStatistics.replyDelaysInMilliseconds}, and each is as long as
   * the count in {@link PersonStatistics.replyCountsByRecipient}. Feed a list
   * to `median` for how fast this person typically answers that participant.
   */
  readonly replyDelaysByRecipient: ReadonlyMap<string, readonly number[]>;
  /** Runs of consecutive messages from this person. `messageCount / turnCount` is messages per turn. */
  readonly turnCount: number;
  /** How often this person used each emoji, in order of first use. */
  readonly emojiCounts: ReadonlyMap<string, number>;
  /** How often this person used each significant word (lower-cased; laughs, short words and stop words left out), in order of first use. */
  readonly wordCounts: ReadonlyMap<string, number>;
}

/**
 * Message counts for each hour of each weekday: seven rows (Monday first,
 * Sunday last) of twenty-four columns (hour 0 to hour 23).
 */
export type WeekdayHourHeatmap = readonly (readonly number[])[];

/** The longest gap between two consecutive messages. */
export interface LongestSilence {
  /** Length of the gap in milliseconds. */
  readonly durationInMilliseconds: number;
  /** Timestamp of the message before the gap. */
  readonly from: Date;
  /** Timestamp of the message that broke the silence. */
  readonly to: Date;
}

/** The longest run of consecutive calendar days with at least one message. */
export interface LongestStreak {
  /** Number of days in the run; 1 when no two active days are adjacent. */
  readonly lengthInDays: number;
  /** Midnight at the start of the first day of the run. */
  readonly from: Date;
  /** Midnight at the start of the last day of the run. */
  readonly to: Date;
}

/** The calendar day with the most messages. */
export interface BusiestDay {
  /** Midnight at the start of that day. */
  readonly date: Date;
  /** Messages sent on that day. */
  readonly messageCount: number;
}

/** The oldest message of the chat. Its text is the first of {@link ChatAnalysis.messages}. */
export interface FirstMessageMilestone {
  readonly kind: 'first-message';
  /** When it was sent. */
  readonly timestamp: Date;
  /** Who sent it, by their name as the export wrote it. */
  readonly sender: string;
}

/** The message that brought the chat to a round number of messages. */
export interface MessageCountMilestone {
  readonly kind: 'message-count';
  /** When that message was sent. */
  readonly timestamp: Date;
  /** Who sent it, by their name as the export wrote it. */
  readonly sender: string;
  /** The round number reached: 1,000, 10,000, 50,000 or 100,000. */
  readonly messageCount: number;
}

/** The message with which half of all the messages of the chat had been sent. */
export interface HalfOfMessagesMilestone {
  readonly kind: 'half-of-messages';
  /** When that message was sent. */
  readonly timestamp: Date;
  /** Its position in the chat, counting from 1: half of the total, rounded up. */
  readonly messageCount: number;
}

/** The latest anniversary of the first message that the chat lived to see. */
export interface AnniversaryMilestone {
  readonly kind: 'anniversary';
  /** Midnight at the start of the anniversary. */
  readonly timestamp: Date;
  /** How many whole years after the first message it is; at least 1. */
  readonly years: number;
}

/** One moment the chat passed, discriminated by `kind`. */
export type ChatMilestone =
  FirstMessageMilestone | MessageCountMilestone | HalfOfMessagesMilestone | AnniversaryMilestone;

/** Everything the page draws, computed from the messages of one chat. */
export interface ChatAnalysis {
  /** All messages sorted by timestamp, oldest first. Never empty. */
  readonly messages: readonly ChatMessage[];
  /** One entry per participant, the most talkative first. */
  readonly people: readonly PersonStatistics[];
  /** Message counts per weekday and hour. */
  readonly weekdayHourHeatmap: WeekdayHourHeatmap;
  /**
   * Messages per calendar day. The key is the day written as the number
   * `YYYYMMDD` (see `dayKeyFromDate` and `dateFromDayKey`); entries are in
   * chronological order.
   */
  readonly messageCountsByDayKey: ReadonlyMap<number, number>;
  /** How often each emoji was used in the whole chat, in order of first use. */
  readonly emojiCounts: ReadonlyMap<string, number>;
  /** How often each significant word was used in the whole chat, in order of first use. */
  readonly wordCounts: ReadonlyMap<string, number>;
  /**
   * How often a link to each site was shared in the whole chat, keyed by the
   * site as in {@link PersonStatistics.linkSiteCounts}, in order of first use.
   */
  readonly linkSiteCounts: ReadonlyMap<string, number>;
  /** The text message with the most words, or `null` when no message contains a word. */
  readonly longestMessage: ChatMessage | null;
  /** Number of words in {@link ChatAnalysis.longestMessage}; 0 when there is none. */
  readonly longestMessageWordCount: number;
  /** The longest gap between consecutive messages, or `null` when no two messages are apart in time. */
  readonly longestSilence: LongestSilence | null;
  /** The longest run of consecutive active days. */
  readonly longestStreak: LongestStreak;
  /** The day with the most messages. */
  readonly busiestDay: BusiestDay;
  /** Timestamp of the oldest message. */
  readonly firstMessageTimestamp: Date;
  /** Timestamp of the newest message. */
  readonly lastMessageTimestamp: Date;
  /** Calendar days from the first message to the last, both included. */
  readonly spanInDays: number;
  /** Calendar days on which at least one message was sent. */
  readonly activeDayCount: number;
  /** Conversations in the chat: the first message plus every message that follows a long silence. */
  readonly conversationCount: number;
  /** Total number of messages. */
  readonly totalMessageCount: number;
  /**
   * The moments the chat passed, oldest first: always its first message, then
   * each round number of messages it reached, the message that made half of
   * them (from a hundred messages on) and its latest anniversary (from one
   * year on).
   */
  readonly milestones: readonly ChatMilestone[];
  /**
   * The length in days of the two periods compared in "then and now": the
   * first so many days of the chat and the last so many. It is one year for a
   * chat of two years or more and half the chat for a shorter one. Zero when
   * the chat is too short to compare, in which case every person's early and
   * recent counts are zero too.
   */
  readonly comparisonPeriodInDays: number;
  /** Whether the export records seconds or only minutes; the page rounds reply times accordingly. */
  readonly timestampResolution: TimestampResolution;
}

/* -------------------------------------------------------------------------- */
/* From text to everything the page draws                                     */
/* -------------------------------------------------------------------------- */

/** The text did not contain a single readable message. */
export interface EmptyChatExportResult {
  readonly kind: 'empty';
}

/** The text was read as a chat and analysed. */
export interface AnalysedChatExportResult {
  readonly kind: 'analysed';
  /** Everything the page draws. */
  readonly analysis: ChatAnalysis;
  /** How the dates were read. */
  readonly dateOrder: DateOrder;
  /** Whether the page should offer the day/month switch. */
  readonly isDateOrderAmbiguous: boolean;
  /** What was read and what was skipped. */
  readonly report: ParseReport;
}

/**
 * The result of `analyseChatExport` in `core/index.ts`: either nothing was found, or
 * the complete analysis together with how the file was read. Discriminated by `kind`.
 */
export type ChatExportAnalysisResult = EmptyChatExportResult | AnalysedChatExportResult;
