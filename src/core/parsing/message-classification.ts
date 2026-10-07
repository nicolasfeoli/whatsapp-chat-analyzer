/**
 * Decides what an entry of the export is: typed text, a media placeholder, a
 * deleted-message tombstone, or a system notice that is not a message at all.
 *
 * English and Spanish are covered in full. Portuguese, German, French and
 * Italian markers are best-effort and were written from memory of the export
 * formats rather than checked against real exports.
 */

import type { MessageKind } from '../types';
import { LEFT_TO_RIGHT_MARK } from './invisible-characters';

/** What {@link classifyMessageBody} can answer: a kind of message, or "not a message". */
export type MessageBodyClassification = MessageKind | 'system-notice';

/** The sender and the body of an entry, split at the first `": "`. */
export interface SenderAndText {
  /** The sender's name, trimmed. */
  readonly sender: string;
  /** Everything after the first `": "`, exactly as written (not trimmed). */
  readonly text: string;
}

/** What {@link classifyMessageBody} needs to know about the line besides its text. */
export interface MessageBodyContext {
  /**
   * Whether the body is preceded by the left-to-right mark, which iPhone puts
   * in front of everything that was not typed.
   */
  readonly isMarkedAsNotTyped: boolean;
  /** Whether the line starts with `[`, i.e. comes from an iPhone export. */
  readonly isBracketedLine: boolean;
}

/** The characters that separate the sender from the message in every layout. */
const SENDER_SEPARATOR = ': ';

/**
 * WhatsApp limits a contact name far below this; a "sender" longer than fifty
 * characters is the beginning of a system notice that happens to contain a colon.
 */
const MAXIMUM_SENDER_NAME_LENGTH = 50;

/**
 * Android writes the literal word `null` for some messages it could not
 * export (typically view-once media). iPhone never does, so there the word is
 * taken as typed text.
 */
const ANDROID_UNEXPORTABLE_MESSAGE_TEXT = 'null';

/**
 * The Android placeholder for media left out of the export, in any language:
 * the whole message is one short phrase in angle brackets, such as
 * `<Media omitted>`, `<Multimedia omitido>` or `<Medien ausgeschlossen>`.
 * Matching the shape instead of the words covers languages nobody listed, at
 * the price that a message consisting only of `<lol>` also counts as media.
 */
const ANDROID_MEDIA_PLACEHOLDER_PATTERN = /^<[^<>\n]{1,60}>$/;

/**
 * The iPhone marker for a file included in the export, in English, Spanish,
 * Portuguese, German, French and Italian: `<attached: 00001-PHOTO.jpg>`,
 * `<adjunto: ...>`, `<anexado: ...>`, `<Anhang: ...>`, `<pièce jointe : ...>`,
 * `<allegato: ...>`. It may follow a caption, so it is not anchored.
 */
const IPHONE_ATTACHMENT_PATTERN =
  /<(?:attached|adjunto|anexado|anhang|pi[eè]ce jointe|allegato)\s?:\s*[^>]+>/i;

/**
 * The Android marker for a file included in the export, which ends the first
 * line of the message: `IMG-20231231-WA0001.jpg (file attached)`,
 * `... (archivo adjunto)`, `... (arquivo anexado)`, `... (Datei angehängt)`,
 * `... (fichier joint)`, `... (file allegato)`.
 */
const ANDROID_ATTACHMENT_PATTERN =
  /\((?:file attached|archivo adjunto|arquivo anexado|datei angeh[aä]ngt|fichier joint|file allegato)\)\s*$/i;

/**
 * The first line of a poll: the word "poll" and a colon, alone on the line
 * (`POLL:`, `ENCUESTA:`, `ENQUETE:`, `UMFRAGE:`, `SONDAGE:`, `SONDAGGIO:`).
 * The question and the options follow on continuation lines.
 */
const POLL_HEADER_PATTERN = /^(?:poll|encuesta|enquete|umfrage|sondage|sondaggio):$/i;

/**
 * A shared location: the word "location" in one of the supported languages
 * followed by a map link, e.g. `Location: https://maps.google.com/?q=1,2`.
 */
const SHARED_LOCATION_PATTERN =
  /^(?:location|ubicaci[oó]n|localiza[cç][aã]o|standort|localisation|posizione)\s?: https?:\/\/\S+$/i;

/** Placeholders that mean "media" whether or not the line carries the left-to-right mark. */
const MEDIA_PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  ANDROID_MEDIA_PLACEHOLDER_PATTERN,
  IPHONE_ATTACHMENT_PATTERN,
  ANDROID_ATTACHMENT_PATTERN,
  POLL_HEADER_PATTERN,
  SHARED_LOCATION_PATTERN,
];

/**
 * The iPhone placeholder for media left out of the export: one to a few words
 * ending in "omitted" in the phone's language, such as `image omitted`,
 * `sticker omitted`, `GIF omitido`, `imagem ocultada`, `Bild weggelassen`,
 * `image omise`, `immagine omessa`.
 *
 * These are ordinary words, so the pattern is only trusted when the body
 * carries the left-to-right mark. Without the mark, somebody typed "that part
 * was omitted" and it counts as text.
 */
const IPHONE_OMITTED_MEDIA_PATTERN =
  /^[\p{L} ]{2,40}\s(?:omitted|omitid[oa]|weggelassen|omise?s?|omess[aoi]|ocult[oa]|ocultad[oa])$/iu;

/**
 * The tombstone of a deleted message, as the whole body, with or without a
 * final full stop. Both points of view are listed ("This message was deleted"
 * for someone else's, "You deleted this message" for the exporter's own), in
 * English, Spanish, Portuguese, German, French and Italian.
 */
const DELETED_MESSAGE_PATTERN =
  /^(?:this message was deleted|you deleted this message|se elimin[oó] este mensaje|eliminaste este mensaje|este mensaje fue eliminado|mensagem apagada|esta mensagem foi apagada|voc[eê] apagou esta mensagem|diese nachricht wurde gel[oö]scht|du hast diese nachricht gel[oö]scht|ce message a [eé]t[eé] supprim[eé]|vous avez supprim[eé] ce message|questo messaggio [eè] stato eliminato|hai eliminato questo messaggio)\.?$/i;

/**
 * Phrases that only occur in system notices, for exports that attribute a
 * notice to a sender without marking it: the end-to-end encryption banner, the
 * "security code changed" notice and missed calls, in English and Spanish.
 */
const SYSTEM_NOTICE_TEXT_PATTERN =
  /(end-to-end encrypted|cifrad[oa]s? de extremo a extremo|security code|c[oó]digo de seguridad|missed (voice|video) call|llamada (de voz |de video )?perdida)/i;

/**
 * Recognises a "sender" that is really the start of a group notice.
 *
 * `Bob changed the group name to "Party: 2024"` contains `": "`, so it splits
 * into the sender `Bob changed the group name to "Party` and a text. The
 * giveaway is a verb of group administration (changed, added, removed, left,
 * joined, created, deleted, or the Spanish cambió, añadió, eliminó, salió,
 * creó, se unió) with a name before it and more words after it, or the phrases
 * "now an admin" / "ahora es admin".
 *
 * Requiring text on both sides of the verb keeps real contacts whose name
 * merely contains one: "Left Shark" has nothing before the verb and "Juan
 * Added" has nothing after it.
 */
const SYSTEM_NOTICE_SENDER_PATTERN =
  /\S\s+(?:changed|added|removed|left|joined|created|deleted|cambi[oó]|a[ñn]adi[oó]|elimin[oó]|sali[oó]|cre[oó]|se uni[oó])\s+\S|ahora es admin|now an admin/i;

/**
 * The note WhatsApp appends to an edited message: `<This message was edited>`
 * in English or `<Se editó este mensaje.>` in Spanish, at the very end of the
 * text, together with the white space around it.
 */
const EDITED_MESSAGE_SUFFIX_PATTERN =
  /\s*<(this message was edited|se edit[oó] este mensaje\.?)>\s*$/i;

/**
 * The left-to-right marks and white space at the very end of a line. An edited
 * note is preceded by a mark of its own, which is left behind when the note is
 * removed and says nothing about the text before it.
 */
const TRAILING_MARKS_AND_WHITE_SPACE_PATTERN = /[\u200e\s]+$/;

/**
 * Splits the content of an entry into sender and text at the first `": "`.
 *
 * @param content - Everything after the timestamp.
 * @returns The two parts, or `null` when there is no separator or nothing in
 *   front of it; the entry is then a system notice such as "Bob added Carl".
 */
export function splitSenderAndText(content: string): SenderAndText | null {
  const separatorIndex = content.indexOf(SENDER_SEPARATOR);
  if (separatorIndex < 1) {
    return null;
  }

  const sender = content.slice(0, separatorIndex).trim();
  const text = content.slice(separatorIndex + SENDER_SEPARATOR.length);
  return { sender, text };
}

/**
 * Tells whether the part before the first `": "` is too long or too
 * sentence-like to be a contact name.
 *
 * @param sender - The candidate sender name.
 * @returns `true` when the entry is a system notice rather than a message.
 */
export function isSystemNoticeSender(sender: string): boolean {
  if (sender.length > MAXIMUM_SENDER_NAME_LENGTH) {
    return true;
  }
  return SYSTEM_NOTICE_SENDER_PATTERN.test(sender);
}

/**
 * Tells whether a trimmed message body is a placeholder for media.
 */
function isMediaPlaceholder(trimmedText: string, context: MessageBodyContext): boolean {
  const matchesAnyPlaceholder = MEDIA_PLACEHOLDER_PATTERNS.some((pattern) =>
    pattern.test(trimmedText),
  );
  if (matchesAnyPlaceholder) {
    return true;
  }

  if (context.isMarkedAsNotTyped && IPHONE_OMITTED_MEDIA_PATTERN.test(trimmedText)) {
    return true;
  }

  const isAndroidLine = !context.isBracketedLine;
  return isAndroidLine && trimmedText === ANDROID_UNEXPORTABLE_MESSAGE_TEXT;
}

/**
 * Classifies the body of an entry that has a plausible sender.
 *
 * The order matters. Media and deleted placeholders are recognised first, also
 * on marked lines, because the first version of this page dropped every line
 * with a left-to-right mark and silently lost deleted messages, locations and
 * polls. Whatever is still marked after that was generated by WhatsApp and is
 * not one of the known kinds, so it is a system notice ("Ana is a contact").
 *
 * @param text - The message body as written, before trimming.
 * @param context - Whether the body is marked as not typed, and the layout of the line.
 * @returns The kind of message, or `'system-notice'` when it is not a message.
 */
export function classifyMessageBody(
  text: string,
  context: MessageBodyContext,
): MessageBodyClassification {
  const trimmedText = text.trim();

  if (isMediaPlaceholder(trimmedText, context)) {
    return 'media';
  }
  if (DELETED_MESSAGE_PATTERN.test(trimmedText)) {
    return 'deleted';
  }
  if (context.isMarkedAsNotTyped || SYSTEM_NOTICE_TEXT_PATTERN.test(text)) {
    return 'system-notice';
  }
  return 'text';
}

/**
 * Finds the iPhone placeholder at the end of a line that also holds a caption.
 *
 * A photo, video or GIF sent with a caption is exported on one line: the
 * caption as it was typed, then the left-to-right mark, then the placeholder
 * (`happy birthday <mark>image omitted`). The mark is therefore not in front
 * of the body, and going by the body alone the line reads as a typed sentence
 * that ends in "image omitted".
 *
 * @param lineWithMarks - One line of an iPhone export with its left-to-right
 *   marks still in place and every other invisible character removed.
 * @returns The placeholder that follows the last mark, without the caption;
 *   `null` when the line has no mark or what follows it is not a placeholder.
 */
export function findTrailingMarkedPlaceholder(lineWithMarks: string): string | null {
  const lineWithoutEditedNote = removeEditedMessageSuffix(lineWithMarks).replace(
    TRAILING_MARKS_AND_WHITE_SPACE_PATTERN,
    '',
  );
  const lastMarkIndex = lineWithoutEditedNote.lastIndexOf(LEFT_TO_RIGHT_MARK);
  if (lastMarkIndex === -1) {
    return null;
  }

  const textAfterLastMark = lineWithoutEditedNote.slice(lastMarkIndex + 1).trim();
  if (!IPHONE_OMITTED_MEDIA_PATTERN.test(textAfterLastMark)) {
    return null;
  }
  return textAfterLastMark;
}

/**
 * Removes the "This message was edited" note from the end of a message, so it
 * is not counted as four typed words.
 *
 * @param text - The complete text of a message.
 * @returns The text without the note; unchanged when there is none.
 */
export function removeEditedMessageSuffix(text: string): string {
  return text.replace(EDITED_MESSAGE_SUFFIX_PATTERN, '');
}
