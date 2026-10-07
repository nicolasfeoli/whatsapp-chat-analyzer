/**
 * The public API of the core: parsing and analysis of a WhatsApp chat export.
 *
 * Nothing in `src/core` touches the DOM or any browser global, so the same code
 * runs in the page, in the Web Worker and in the Node test runner.
 */

import { analyseChat } from './analysis/analyse-chat';
import { parseChat } from './parsing/parse-chat';
import type { AmbiguousDateOrder, ChatExportAnalysisResult } from './types';

export { analyseChat } from './analysis/analyse-chat';
export {
  analyseMessageText,
  countLinks,
  extractEmojis,
  extractWords,
  isLaugh,
  removeLinks,
} from './analysis/text-statistics';
export type { MessageTextStatistics } from './analysis/text-statistics';
export { isStopWord } from './analysis/stop-words';
export { describeThrownValue } from './errors';
export {
  calendarDaysBetween,
  dateFromDayKey,
  dayKeyFromDate,
  formatDuration,
  median,
  mondayFirstWeekdayIndexOf,
  sortableDayNumber,
  startOfDay,
} from './formatting';
export { LEFT_TO_RIGHT_MARK } from './parsing/invisible-characters';
export { parseChat } from './parsing/parse-chat';
export {
  DAYS_PER_WEEK,
  HOURS_PER_DAY,
  MILLISECONDS_PER_DAY,
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
  MILLISECONDS_PER_SECOND,
  MINUTES_PER_HOUR,
  SECONDS_PER_MINUTE,
} from './time-constants';
export { isRecord } from './type-guards';
export type {
  AmbiguousDateOrder,
  AnalysedChatExportResult,
  AnniversaryMilestone,
  BusiestDay,
  ChatAnalysis,
  ChatExportAnalysisResult,
  ChatMessage,
  ChatMilestone,
  DateOrder,
  DeletedMessage,
  EmptyChatExportResult,
  ExportPlatform,
  FirstMessageMilestone,
  HalfOfMessagesMilestone,
  LongestSilence,
  LongestStreak,
  MediaMessage,
  MediaType,
  MessageCountMilestone,
  MessageKind,
  ParsedChat,
  ParseReport,
  PersonStatistics,
  SignaturePhrase,
  TextMessage,
  TimestampResolution,
  WeekdayHourHeatmap,
} from './types';

/**
 * Goes from the text of an export to everything the page draws, in one call.
 * The page (when workers are unavailable) and the worker both use it, so the
 * two paths cannot drift apart.
 *
 * @param rawText - The complete text of the export.
 * @param forcedDateOrder - `'dmy'` or `'mdy'` when the user switched the date
 *   order by hand; `null` to detect it from the file.
 * @param locale - The BCP 47 tag of the browser (`navigator.language`), the
 *   last tie-break for ambiguous dates.
 * @returns `{ kind: 'empty' }` when no message could be read, otherwise the
 *   analysis with the date order used and the parse report.
 */
export function analyseChatExport(
  rawText: string,
  forcedDateOrder: AmbiguousDateOrder | null = null,
  locale: string | null = null,
): ChatExportAnalysisResult {
  const parsedChat = parseChat(rawText, forcedDateOrder, locale);
  if (parsedChat.messages.length === 0 || parsedChat.dateOrder === null) {
    return { kind: 'empty' };
  }

  return {
    kind: 'analysed',
    analysis: analyseChat(parsedChat.messages, parsedChat.timestampResolution),
    dateOrder: parsedChat.dateOrder,
    isDateOrderAmbiguous: parsedChat.isDateOrderAmbiguous,
    report: parsedChat.report,
  };
}
