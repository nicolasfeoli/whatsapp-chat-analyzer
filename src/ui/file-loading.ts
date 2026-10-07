/**
 * Turns the file the user chose into the text of a chat export.
 *
 * WhatsApp exports a chat either as a plain `.txt` file or, when media is
 * included or on iPhone, as a `.zip` that contains the `.txt`. Both are read
 * here, inside the browser tab; nothing leaves the device.
 */

import JSZip from 'jszip';

import { describeThrownValue, isRecord } from '../core/index';

/** Bytes in one mebibyte, the unit the size limits and messages are expressed in. */
const BYTES_PER_MEBIBYTE = 1024 * 1024;

/**
 * The largest amount of chat text the page accepts: 250 MB. Text of this size
 * is held in memory as a string (two bytes per character in most engines)
 * and then parsed into objects, which is about as much as a browser tab can
 * take. A chat export without media is usually a few megabytes.
 */
export const LARGEST_CHAT_TEXT_IN_BYTES = 250 * BYTES_PER_MEBIBYTE;

/**
 * The largest zip the page opens: 400 MB. The whole archive is read into
 * memory to find the chat inside it, so an export with years of videos has to
 * be refused before the tab runs out of memory.
 */
export const LARGEST_ZIP_FILE_IN_BYTES = 400 * BYTES_PER_MEBIBYTE;

/** The media type browsers report for zip archives. */
const ZIP_MEDIA_TYPE = 'application/zip';

/** The title used when the file name says nothing about the chat. */
const FALLBACK_CHAT_TITLE = 'Your chat';

/** The message shown when reading failed without a usable explanation. */
const UNKNOWN_FILE_FAILURE_MESSAGE = 'Could not read that file.';

/** Matches a file name that ends in `.zip`, in any letter case. */
const ZIP_EXTENSION_PATTERN = /\.zip$/i;

/** Matches a file name that ends in `.txt`, in any letter case. */
const TEXT_EXTENSION_PATTERN = /\.txt$/i;

/**
 * The folder macOS adds to zips it creates. It holds resource-fork files such
 * as `__MACOSX/._chat.txt` that share the name of the chat but contain binary
 * metadata, not messages.
 */
const MACOS_METADATA_FOLDER_PREFIX = '__MACOSX/';

/**
 * Matches the base name iPhone gives the chat inside its zip, `_chat.txt`,
 * in any letter case.
 */
const IPHONE_CHAT_FILE_NAME_PATTERN = /^_chat\.txt$/i;

/**
 * Matches a base name that mentions WhatsApp, as Android's
 * `WhatsApp Chat with Marta.txt` and its translations do.
 */
const WHATSAPP_FILE_NAME_PATTERN = /whatsapp/i;

/** Matches the `.txt` or `.zip` extension at the end of a file name, to strip it from the title. */
const EXPORT_EXTENSION_PATTERN = /\.(txt|zip)$/i;

/**
 * Matches the fixed words WhatsApp puts before the chat name in an export's
 * file name: English `WhatsApp Chat with Marta` and `WhatsApp Chat - Marta`,
 * and Spanish `Chat de WhatsApp con Marta`. Stripping them leaves `Marta`.
 */
const EXPORT_FILE_NAME_PREFIX_PATTERN = /^(WhatsApp Chat (with|-)\s*|Chat de WhatsApp con\s*)/i;

/**
 * Matches what is left of an iPhone export's file name, `_chat` or `chat`,
 * which names no one and is replaced by a generic title.
 */
const GENERIC_CHAT_NAME_PATTERN = /^_?chat$/i;

/**
 * An error raised by this module itself, as opposed to one that came from the
 * browser or from JSZip: the file is too big, or holds no chat.
 *
 * The class only labels where the error came from, which is useful in tests
 * and in a debugger. The page does not treat it differently: the message of
 * every error raised while loading is shown to the user (see
 * {@link describeFileLoadingFailure}), because the browser's and JSZip's own
 * messages ("Corrupted zip: ...") are also the most helpful thing to show.
 */
export class ChatFileError extends Error {
  public override readonly name = 'ChatFileError';
}

/** The two facts about a zip entry that decide whether it is the chat. */
export interface ZipEntryDescription {
  /** The full path of the entry inside the archive, with `/` separators. */
  readonly name: string;
  /**
   * Whether the entry is a folder. The abbreviated name is JSZip's
   * (`JSZipObject.dir`), kept so the objects of a loaded archive can be passed
   * in as they are.
   */
  readonly dir: boolean;
}

/**
 * Writes a size in whole megabytes for an error message.
 *
 * @param sizeInBytes - The size to describe.
 * @returns For example `"412 MB"`.
 */
export function formatMegabytes(sizeInBytes: number): string {
  return `${Math.round(sizeInBytes / BYTES_PER_MEBIBYTE)} MB`;
}

/**
 * Decides whether a file is a zip archive, by its name or its media type.
 *
 * @param fileName - The name of the file as the browser reports it.
 * @param mediaType - The media type the browser reports; often empty.
 * @returns Whether to open the file as a zip.
 */
export function isZipFile(fileName: string, mediaType: string): boolean {
  return ZIP_EXTENSION_PATTERN.test(fileName) || mediaType === ZIP_MEDIA_TYPE;
}

/**
 * The last segment of a path inside a zip.
 */
function baseNameOf(entryName: string): string {
  const segments = entryName.split('/');
  return segments[segments.length - 1] ?? entryName;
}

/**
 * Picks the chat out of the entries of a zip.
 *
 * An export with media can hold other `.txt` files that people sent as
 * attachments, so the first `.txt` is not necessarily the chat. The entries
 * are tried in this order of preference:
 *
 * 1. a file named `_chat.txt` (iPhone),
 * 2. a file whose name mentions WhatsApp (Android),
 * 3. a `.txt` at the top level of the archive,
 * 4. any `.txt` at all.
 *
 * Folders and macOS metadata are never considered.
 *
 * @param entries - Every entry of the archive, in archive order.
 * @returns The entry to read, or `null` when the archive has no `.txt` file.
 */
export function selectChatEntry<Entry extends ZipEntryDescription>(
  entries: readonly Entry[],
): Entry | null {
  const textEntries = entries.filter((entry: Entry): boolean => {
    const isTextFile = TEXT_EXTENSION_PATTERN.test(entry.name);
    const isMacosMetadata = entry.name.startsWith(MACOS_METADATA_FOLDER_PREFIX);
    return !entry.dir && isTextFile && !isMacosMetadata;
  });

  const iphoneChatEntry = textEntries.find((entry: Entry): boolean =>
    IPHONE_CHAT_FILE_NAME_PATTERN.test(baseNameOf(entry.name)),
  );
  if (iphoneChatEntry !== undefined) {
    return iphoneChatEntry;
  }

  const whatsappNamedEntry = textEntries.find((entry: Entry): boolean =>
    WHATSAPP_FILE_NAME_PATTERN.test(baseNameOf(entry.name)),
  );
  if (whatsappNamedEntry !== undefined) {
    return whatsappNamedEntry;
  }

  const topLevelEntry = textEntries.find((entry: Entry): boolean => !entry.name.includes('/'));
  if (topLevelEntry !== undefined) {
    return topLevelEntry;
  }

  return textEntries[0] ?? null;
}

/**
 * Reads the size an entry will have once unpacked, as declared by the archive.
 *
 * JSZip parses this number from the zip's central directory when it loads the
 * archive, but only keeps it on `_data`, an internal property that is absent
 * from the library's type definitions (it appears there only in a comment).
 * It is the one way to learn the size without unpacking, which is the whole
 * point of the check: a small zip must not be allowed to expand into more text
 * than the tab can hold.
 *
 * Because the property is internal, nothing about it is assumed. The entry is
 * treated as `unknown` and every step is checked, so a future JSZip that
 * renames or reshapes it makes this function return `null` rather than throw
 * or produce a wrong number.
 *
 * @param zipEntry - An entry of an archive loaded with `JSZip.loadAsync`.
 * @returns The declared uncompressed size in bytes, or `null` when it cannot
 *   be determined. The number comes from the archive itself and is therefore
 *   only as trustworthy as the archive.
 */
export function readDeclaredUncompressedSize(zipEntry: unknown): number | null {
  if (!isRecord(zipEntry)) {
    return null;
  }
  const internalData = zipEntry['_data'];
  if (!isRecord(internalData)) {
    return null;
  }
  const uncompressedSize = internalData['uncompressedSize'];
  if (typeof uncompressedSize !== 'number' || !Number.isFinite(uncompressedSize)) {
    return null;
  }
  return uncompressedSize;
}

/**
 * Finds the chat inside a zip archive and returns its text.
 *
 * @param zipFile - The archive.
 * @returns The text of the chat.
 * @throws {@link ChatFileError} when the archive is too big, holds no `.txt`
 *   file, or the chat inside it is too big. JSZip's own errors for a damaged
 *   archive pass through unchanged.
 */
export async function readChatTextFromZip(zipFile: Blob): Promise<string> {
  if (zipFile.size > LARGEST_ZIP_FILE_IN_BYTES) {
    throw new ChatFileError(
      `That zip is ${formatMegabytes(zipFile.size)}, too big to open in a browser tab. Export the chat again and choose Without media.`,
    );
  }

  const archive = await JSZip.loadAsync(zipFile);
  const chatEntry = selectChatEntry(Object.values(archive.files));
  if (chatEntry === null) {
    throw new ChatFileError('That zip has no .txt chat file inside.');
  }

  /* Checked before unpacking, so a small zip cannot expand into more text than the tab can hold. */
  const declaredSize = readDeclaredUncompressedSize(chatEntry);
  if (declaredSize !== null && declaredSize > LARGEST_CHAT_TEXT_IN_BYTES) {
    throw new ChatFileError(
      `The chat inside that zip is ${formatMegabytes(declaredSize)} of text, more than this page can handle.`,
    );
  }

  return chatEntry.async('string');
}

/**
 * Reads the text of a chat export from a `.txt` or `.zip` file.
 *
 * @param file - The file the user picked or dropped.
 * @returns The text of the chat.
 * @throws {@link ChatFileError} with a message for the user when the file is
 *   too big or holds no chat.
 */
export async function readChatTextFromFile(file: File): Promise<string> {
  if (isZipFile(file.name, file.type)) {
    return readChatTextFromZip(file);
  }

  if (file.size > LARGEST_CHAT_TEXT_IN_BYTES) {
    throw new ChatFileError(
      `That file is ${formatMegabytes(file.size)}, more than this page can handle. A chat export without media is usually far smaller.`,
    );
  }
  return file.text();
}

/**
 * Derives a title for the report from the name of the export file.
 *
 * @param fileName - For example `"WhatsApp Chat with Marta.zip"`.
 * @returns For example `"Marta"`; `"Your chat"` when the name says nothing.
 */
export function cleanChatTitle(fileName: string): string {
  const title = fileName
    .replace(EXPORT_EXTENSION_PATTERN, '')
    .replace(EXPORT_FILE_NAME_PREFIX_PATTERN, '')
    .trim();

  if (title === '' || GENERIC_CHAT_NAME_PATTERN.test(title)) {
    return FALLBACK_CHAT_TITLE;
  }
  return title;
}

/**
 * Picks the sentence to show when loading a file failed.
 *
 * @param thrownValue - Whatever was thrown while reading or analysing.
 * @returns The message of the thrown value when it has one (whether it is a
 *   {@link ChatFileError}, a browser error or any other object with a
 *   `message`), otherwise a generic sentence.
 */
export function describeFileLoadingFailure(thrownValue: unknown): string {
  return describeThrownValue(thrownValue, UNKNOWN_FILE_FAILURE_MESSAGE);
}
