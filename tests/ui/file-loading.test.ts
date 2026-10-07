// @vitest-environment jsdom

/**
 * Tests of reading a chat out of a `.txt` or `.zip` file.
 *
 * The zips are built inside the tests with JSZip, from invented lines. Never
 * add a real export, zipped or not, to this folder.
 */

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  ChatFileError,
  LARGEST_CHAT_TEXT_IN_BYTES,
  LARGEST_ZIP_FILE_IN_BYTES,
  cleanChatTitle,
  describeFileLoadingFailure,
  formatMegabytes,
  isZipFile,
  readChatTextFromFile,
  readChatTextFromZip,
  readDeclaredUncompressedSize,
  selectChatEntry,
} from '../../src/ui/file-loading';
import type { ZipEntryDescription } from '../../src/ui/file-loading';
import { androidLine, iphoneLine } from '../fixtures/export-lines';
import { buildZipBytes, buildZipFile } from '../fixtures/zip-files';

/** Bytes in one mebibyte, the unit of the size limits. */
const BYTES_PER_MEBIBYTE = 1024 * 1024;

/** The four bytes that open each record of a zip's central directory: `PK\x01\x02`. */
const CENTRAL_DIRECTORY_SIGNATURE: readonly number[] = [0x50, 0x4b, 0x01, 0x02];

/** Where, counted from that signature, the record states the size of the unpacked entry. */
const UNCOMPRESSED_SIZE_OFFSET_IN_CENTRAL_DIRECTORY = 24;

/** The text of the invented chat most zips in these tests contain. */
const CHAT_TEXT = iphoneLine({ sender: 'Ana', text: 'this is the chat' });

/** The text of an invented attachment that must not be mistaken for the chat. */
const ATTACHMENT_TEXT = 'shopping list: bread, olives';

/**
 * Makes a file report a size it does not have, to test the size limits
 * without allocating hundreds of megabytes.
 */
function withReportedSize<FileType extends Blob>(file: FileType, sizeInBytes: number): FileType {
  Object.defineProperty(file, 'size', { value: sizeInBytes });
  return file;
}

/**
 * Finds where the first record of the central directory starts.
 *
 * @throws Error when the bytes are not a zip.
 */
function findCentralDirectoryOffset(zipBytes: Uint8Array): number {
  for (let offset = 0; offset < zipBytes.length; offset += 1) {
    const matchesSignature = CENTRAL_DIRECTORY_SIGNATURE.every(
      (signatureByte, index) => zipBytes[offset + index] === signatureByte,
    );
    if (matchesSignature) {
      return offset;
    }
  }
  throw new Error('These bytes have no zip central directory');
}

/**
 * Rewrites the size a single-entry zip declares for its unpacked entry, the
 * way an archive holding a huge chat would declare it.
 *
 * @param zipBytes - A zip with one entry.
 * @param declaredSizeInBytes - The size to declare; must fit in 32 bits.
 * @returns A copy of the zip with the declared size replaced.
 */
function withDeclaredUncompressedSize(
  zipBytes: ArrayBuffer,
  declaredSizeInBytes: number,
): ArrayBuffer {
  const patchedBytes = zipBytes.slice(0);
  const sizeFieldOffset =
    findCentralDirectoryOffset(new Uint8Array(patchedBytes)) +
    UNCOMPRESSED_SIZE_OFFSET_IN_CENTRAL_DIRECTORY;
  const littleEndian = true;
  new DataView(patchedBytes).setUint32(sizeFieldOffset, declaredSizeInBytes, littleEndian);
  return patchedBytes;
}

/**
 * Describes a file entry of a zip, for the tests of the selection rule alone.
 */
function fileEntry(name: string): ZipEntryDescription {
  return { name, dir: false };
}

/**
 * Describes a folder entry of a zip.
 */
function folderEntry(name: string): ZipEntryDescription {
  return { name, dir: true };
}

describe('size limits', () => {
  it('accepts up to 250 MB of chat text', () => {
    expect(LARGEST_CHAT_TEXT_IN_BYTES).toBe(250 * BYTES_PER_MEBIBYTE);
  });

  it('accepts a zip of up to 400 MB', () => {
    expect(LARGEST_ZIP_FILE_IN_BYTES).toBe(400 * BYTES_PER_MEBIBYTE);
  });
});

describe('formatMegabytes', () => {
  it.each([
    { sizeInBytes: 0, expected: '0 MB' },
    { sizeInBytes: 412 * BYTES_PER_MEBIBYTE, expected: '412 MB' },
    { sizeInBytes: 1.5 * BYTES_PER_MEBIBYTE, expected: '2 MB' },
    { sizeInBytes: 1.4 * BYTES_PER_MEBIBYTE, expected: '1 MB' },
  ])('writes $sizeInBytes bytes as $expected', ({ sizeInBytes, expected }) => {
    expect(formatMegabytes(sizeInBytes)).toBe(expected);
  });
});

describe('isZipFile', () => {
  it.each([
    { description: 'a .zip name', fileName: 'WhatsApp Chat - Marta.zip', mediaType: '' },
    { description: 'an upper-case .ZIP name', fileName: 'EXPORT.ZIP', mediaType: '' },
    {
      description: 'the zip media type on a name without extension',
      fileName: 'export',
      mediaType: 'application/zip',
    },
  ])('recognises $description', ({ fileName, mediaType }) => {
    expect(isZipFile(fileName, mediaType)).toBe(true);
  });

  it.each([
    { description: 'a .txt name', fileName: '_chat.txt', mediaType: 'text/plain' },
    { description: 'a name that only contains "zip"', fileName: 'zip-notes.txt', mediaType: '' },
    { description: 'a name without extension or type', fileName: 'export', mediaType: '' },
  ])('does not take $description for a zip', ({ fileName, mediaType }) => {
    expect(isZipFile(fileName, mediaType)).toBe(false);
  });
});

describe('selectChatEntry', () => {
  describe('order of preference', () => {
    it('prefers _chat.txt over everything else, wherever it is listed', () => {
      const entries = [
        fileEntry('notes.txt'),
        fileEntry('WhatsApp Chat with Marta.txt'),
        fileEntry('_chat.txt'),
      ];

      expect(selectChatEntry(entries)?.name).toBe('_chat.txt');
    });

    it('prefers a name that mentions WhatsApp over other text files', () => {
      const entries = [fileEntry('notes.txt'), fileEntry('WhatsApp Chat with Marta.txt')];

      expect(selectChatEntry(entries)?.name).toBe('WhatsApp Chat with Marta.txt');
    });

    it('prefers a top-level text file over one in a folder', () => {
      const entries = [fileEntry('attachments/recipe.txt'), fileEntry('conversation.txt')];

      expect(selectChatEntry(entries)?.name).toBe('conversation.txt');
    });

    it('settles for any text file when none is at the top level', () => {
      const entries = [fileEntry('attachments/recipe.txt'), fileEntry('attachments/list.txt')];

      expect(selectChatEntry(entries)?.name).toBe('attachments/recipe.txt');
    });

    it('takes the first of several equally good candidates', () => {
      const entries = [fileEntry('first.txt'), fileEntry('second.txt')];

      expect(selectChatEntry(entries)?.name).toBe('first.txt');
    });
  });

  describe('matching of names', () => {
    it('recognises _chat.txt inside a folder by its base name', () => {
      const entries = [fileEntry('notes.txt'), fileEntry('export/_chat.txt')];

      expect(selectChatEntry(entries)?.name).toBe('export/_chat.txt');
    });

    it.each([{ name: '_CHAT.TXT' }, { name: 'Chat de WHATSAPP con Marta.Txt' }])(
      'ignores letter case in $name',
      ({ name }) => {
        const entries = [fileEntry('notes.txt'), fileEntry(name)];

        expect(selectChatEntry(entries)?.name).toBe(name);
      },
    );

    it('does not take "my_chat.txt" for the iPhone chat file', () => {
      const entries = [fileEntry('notes.txt'), fileEntry('my_chat.txt')];

      expect(selectChatEntry(entries)?.name).toBe('notes.txt');
    });

    it('looks for "WhatsApp" in the base name, not in the folder', () => {
      const entries = [fileEntry('WhatsApp/recipe.txt'), fileEntry('conversation.txt')];

      expect(selectChatEntry(entries)?.name).toBe('conversation.txt');
    });
  });

  describe('entries that are never the chat', () => {
    it('ignores files that are not .txt', () => {
      const entries = [fileEntry('IMG-0001.jpg'), fileEntry('WhatsApp Video.mp4')];

      expect(selectChatEntry(entries)).toBeNull();
    });

    it('ignores a folder even when its name ends in .txt', () => {
      expect(selectChatEntry([folderEntry('_chat.txt/')])).toBeNull();
      expect(selectChatEntry([folderEntry('_chat.txt')])).toBeNull();
    });

    it('ignores the metadata macOS adds next to the real chat', () => {
      const entries = [fileEntry('__MACOSX/._chat.txt'), fileEntry('_chat.txt')];

      expect(selectChatEntry(entries)?.name).toBe('_chat.txt');
    });

    it('finds nothing in an archive that only holds macOS metadata', () => {
      expect(selectChatEntry([fileEntry('__MACOSX/._chat.txt')])).toBeNull();
    });

    it('finds nothing in an empty archive', () => {
      expect(selectChatEntry([])).toBeNull();
    });
  });

  it('returns the very entry object it was given, so the caller can read from it', () => {
    const chatEntry = fileEntry('_chat.txt');

    expect(selectChatEntry([fileEntry('notes.txt'), chatEntry])).toBe(chatEntry);
  });
});

describe('readDeclaredUncompressedSize', () => {
  it('reads the size from an entry of a loaded archive', async () => {
    const zipBytes = await buildZipBytes(new Map([['_chat.txt', 'twelve bytes']]));
    const archive = await JSZip.loadAsync(zipBytes);

    expect(readDeclaredUncompressedSize(archive.file('_chat.txt'))).toBe(12);
  });

  it.each([
    { description: 'null', zipEntry: null },
    { description: 'a string', zipEntry: '_chat.txt' },
    { description: 'an entry without internal data', zipEntry: { name: '_chat.txt' } },
    { description: 'internal data that is not an object', zipEntry: { _data: 12 } },
    { description: 'internal data without a size', zipEntry: { _data: { compressedSize: 5 } } },
    { description: 'a size that is not a number', zipEntry: { _data: { uncompressedSize: '12' } } },
    {
      description: 'a size that is not finite',
      zipEntry: { _data: { uncompressedSize: Number.POSITIVE_INFINITY } },
    },
    {
      description: 'a size that is not a number at all',
      zipEntry: { _data: { uncompressedSize: Number.NaN } },
    },
  ])('returns null for $description', ({ zipEntry }) => {
    expect(readDeclaredUncompressedSize(zipEntry)).toBeNull();
  });
});

describe('readChatTextFromZip', () => {
  describe('which file is read', () => {
    it('reads _chat.txt even when another text file comes first', async () => {
      const zipFile = await buildZipFile(
        new Map([
          ['attachment.txt', ATTACHMENT_TEXT],
          ['_chat.txt', CHAT_TEXT],
        ]),
      );

      await expect(readChatTextFromZip(zipFile)).resolves.toBe(CHAT_TEXT);
    });

    it('reads the file named after WhatsApp when there is no _chat.txt', async () => {
      const zipFile = await buildZipFile(
        new Map([
          ['attachment.txt', ATTACHMENT_TEXT],
          ['WhatsApp Chat with Marta.txt', CHAT_TEXT],
        ]),
      );

      await expect(readChatTextFromZip(zipFile)).resolves.toBe(CHAT_TEXT);
    });

    it('reads the top-level text file when no name gives the chat away', async () => {
      const zipFile = await buildZipFile(
        new Map([
          ['documents/attachment.txt', ATTACHMENT_TEXT],
          ['conversation.txt', CHAT_TEXT],
        ]),
      );

      await expect(readChatTextFromZip(zipFile)).resolves.toBe(CHAT_TEXT);
    });

    it('skips the macOS metadata file of the same name', async () => {
      const zipFile = await buildZipFile(
        new Map([
          ['__MACOSX/._chat.txt', 'binary metadata'],
          ['_chat.txt', CHAT_TEXT],
        ]),
      );

      await expect(readChatTextFromZip(zipFile)).resolves.toBe(CHAT_TEXT);
    });
  });

  it('decodes the chat as UTF-8', async () => {
    const chatText = androidLine({ sender: 'María José', text: 'mañana 🎉' });
    const zipFile = await buildZipFile(new Map([['_chat.txt', chatText]]));

    await expect(readChatTextFromZip(zipFile)).resolves.toBe(chatText);
  });

  describe('failures', () => {
    it('refuses an archive without any text file', async () => {
      const zipFile = await buildZipFile(new Map([['IMG-0001.jpg', 'not really a picture']]));

      const reading = readChatTextFromZip(zipFile);

      await expect(reading).rejects.toBeInstanceOf(ChatFileError);
      await expect(reading).rejects.toThrow('That zip has no .txt chat file inside.');
    });

    it('refuses a zip above 400 MB before opening it', async () => {
      const notEvenAZip = new Blob(['these bytes are never looked at']);
      const oversizedZip = withReportedSize(notEvenAZip, 412 * BYTES_PER_MEBIBYTE);

      const reading = readChatTextFromZip(oversizedZip);

      await expect(reading).rejects.toBeInstanceOf(ChatFileError);
      await expect(reading).rejects.toThrow(
        'That zip is 412 MB, too big to open in a browser tab. Export the chat again and choose Without media.',
      );
    });

    it('accepts a zip of exactly 400 MB', async () => {
      const zipFile = await buildZipFile(new Map([['_chat.txt', CHAT_TEXT]]));
      const zipAtTheLimit = withReportedSize(zipFile, LARGEST_ZIP_FILE_IN_BYTES);

      await expect(readChatTextFromZip(zipAtTheLimit)).resolves.toBe(CHAT_TEXT);
    });

    it('refuses a chat that the archive declares to unpack to more than 250 MB', async () => {
      const zipBytes = await buildZipBytes(new Map([['_chat.txt', CHAT_TEXT]]));
      const declaredSize = 300 * BYTES_PER_MEBIBYTE;
      const zipFile = new File(
        [withDeclaredUncompressedSize(zipBytes, declaredSize)],
        'export.zip',
      );

      const reading = readChatTextFromZip(zipFile);

      await expect(reading).rejects.toBeInstanceOf(ChatFileError);
      await expect(reading).rejects.toThrow(
        'The chat inside that zip is 300 MB of text, more than this page can handle.',
      );
    });

    it('refuses a chat declared one byte larger than 250 MB', async () => {
      const zipBytes = await buildZipBytes(new Map([['_chat.txt', CHAT_TEXT]]));
      const declaredSize = LARGEST_CHAT_TEXT_IN_BYTES + 1;
      const zipFile = new File(
        [withDeclaredUncompressedSize(zipBytes, declaredSize)],
        'export.zip',
      );

      await expect(readChatTextFromZip(zipFile)).rejects.toBeInstanceOf(ChatFileError);
    });

    it('goes on to unpack a chat declared to be exactly 250 MB', async () => {
      const zipBytes = await buildZipBytes(new Map([['_chat.txt', CHAT_TEXT]]));
      const zipFile = new File(
        [withDeclaredUncompressedSize(zipBytes, LARGEST_CHAT_TEXT_IN_BYTES)],
        'export.zip',
      );

      /*
       * The size check lets the archive through. Unpacking then fails for a
       * reason of its own, because this invented archive declares a size its
       * few bytes do not have; what matters is that the refusal is not ours.
       */
      const failure: unknown = await readChatTextFromZip(zipFile).catch(
        (thrownValue: unknown) => thrownValue,
      );

      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBeInstanceOf(ChatFileError);
      expect(describeFileLoadingFailure(failure)).not.toContain('more than this page can handle');
    });

    it('lets the error of the zip reader through for bytes that are not a zip', async () => {
      const notAZip = new Blob(['just some text pretending to be an archive']);

      const reading = readChatTextFromZip(notAZip);

      await expect(reading).rejects.toThrow();
      await expect(reading).rejects.not.toBeInstanceOf(ChatFileError);
    });
  });
});

describe('readChatTextFromFile', () => {
  it('returns the content of a text file', async () => {
    const textFile = new File([CHAT_TEXT], '_chat.txt', { type: 'text/plain' });

    await expect(readChatTextFromFile(textFile)).resolves.toBe(CHAT_TEXT);
  });

  it('opens a file named .zip as an archive', async () => {
    const zipFile = await buildZipFile(new Map([['_chat.txt', CHAT_TEXT]]), 'WhatsApp Chat.zip');

    await expect(readChatTextFromFile(zipFile)).resolves.toBe(CHAT_TEXT);
  });

  it('opens a file with the zip media type as an archive, whatever its name', async () => {
    const zipBytes = await buildZipBytes(new Map([['_chat.txt', CHAT_TEXT]]));
    const zipFile = new File([zipBytes], 'export', { type: 'application/zip' });

    await expect(readChatTextFromFile(zipFile)).resolves.toBe(CHAT_TEXT);
  });

  it('refuses a text file above 250 MB without reading it', async () => {
    const textFile = new File([CHAT_TEXT], '_chat.txt', { type: 'text/plain' });
    const oversizedFile = withReportedSize(textFile, 251 * BYTES_PER_MEBIBYTE);

    const reading = readChatTextFromFile(oversizedFile);

    await expect(reading).rejects.toBeInstanceOf(ChatFileError);
    await expect(reading).rejects.toThrow(
      'That file is 251 MB, more than this page can handle. A chat export without media is usually far smaller.',
    );
  });

  it('accepts a text file of exactly 250 MB', async () => {
    const textFile = new File([CHAT_TEXT], '_chat.txt', { type: 'text/plain' });
    const fileAtTheLimit = withReportedSize(textFile, LARGEST_CHAT_TEXT_IN_BYTES);

    await expect(readChatTextFromFile(fileAtTheLimit)).resolves.toBe(CHAT_TEXT);
  });

  it('applies the larger zip limit, not the text limit, to an archive', async () => {
    const zipFile = await buildZipFile(new Map([['_chat.txt', CHAT_TEXT]]));
    const largeZip = withReportedSize(zipFile, 300 * BYTES_PER_MEBIBYTE);

    await expect(readChatTextFromFile(largeZip)).resolves.toBe(CHAT_TEXT);
  });
});

describe('ChatFileError', () => {
  it('is an error that carries its own name and the message for the user', () => {
    const error = new ChatFileError('That zip has no .txt chat file inside.');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ChatFileError');
    expect(error.message).toBe('That zip has no .txt chat file inside.');
  });
});

describe('cleanChatTitle', () => {
  it.each([
    { fileName: 'WhatsApp Chat with Marta.txt', expected: 'Marta' },
    { fileName: 'WhatsApp Chat with Marta.zip', expected: 'Marta' },
    { fileName: 'WhatsApp Chat - Marta.zip', expected: 'Marta' },
    { fileName: 'WhatsApp Chat - Family group.zip', expected: 'Family group' },
    { fileName: 'Chat de WhatsApp con Marta.txt', expected: 'Marta' },
  ])('strips the fixed words of the export from "$fileName"', ({ fileName, expected }) => {
    expect(cleanChatTitle(fileName)).toBe(expected);
  });

  it.each([
    { fileName: 'whatsapp chat with Marta.TXT', expected: 'Marta' },
    { fileName: 'CHAT DE WHATSAPP CON Marta.ZIP', expected: 'Marta' },
  ])('ignores letter case in "$fileName"', ({ fileName, expected }) => {
    expect(cleanChatTitle(fileName)).toBe(expected);
  });

  it.each([
    { description: 'the iPhone file name', fileName: '_chat.txt' },
    { description: 'the iPhone file name without underscore', fileName: 'chat.txt' },
    { description: 'the iPhone file name in capitals', fileName: '_CHAT.TXT' },
    { description: 'a bare extension', fileName: '.txt' },
    { description: 'an empty name', fileName: '' },
    { description: 'an export prefix with no name after it', fileName: 'WhatsApp Chat with .txt' },
  ])('falls back to "Your chat" for $description', ({ fileName }) => {
    expect(cleanChatTitle(fileName)).toBe('Your chat');
  });

  it('keeps a name that is not an export name, minus its extension', () => {
    expect(cleanChatTitle('summer trip.txt')).toBe('summer trip');
  });

  it('keeps a name without an extension', () => {
    expect(cleanChatTitle('summer trip')).toBe('summer trip');
  });

  it('removes only the last extension', () => {
    expect(cleanChatTitle('backup.txt.zip')).toBe('backup.txt');
  });

  it('keeps the export words when they are not at the start', () => {
    expect(cleanChatTitle('Old WhatsApp Chat with Marta.txt')).toBe('Old WhatsApp Chat with Marta');
  });

  it('trims the spaces left around the name', () => {
    expect(cleanChatTitle('WhatsApp Chat -   Marta  .txt')).toBe('Marta');
  });

  it('returns markup in a file name as it is; escaping is the job of the renderer', () => {
    expect(cleanChatTitle('<img src=x onerror=alert(1)>.txt')).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('describeFileLoadingFailure', () => {
  it('shows the message of an error written for the user', () => {
    const error = new ChatFileError('That zip has no .txt chat file inside.');

    expect(describeFileLoadingFailure(error)).toBe('That zip has no .txt chat file inside.');
  });

  it('shows the message of any other error', () => {
    expect(describeFileLoadingFailure(new Error('End of data reached'))).toBe(
      'End of data reached',
    );
  });

  it('shows the message of an error-like object that is not an Error', () => {
    /* A rejection from another realm, or from a library, need not inherit from this realm's Error. */
    expect(describeFileLoadingFailure({ message: 'The file could not be read' })).toBe(
      'The file could not be read',
    );
  });

  it.each([
    { description: 'an error without a message', thrownValue: new Error('') },
    { description: 'an object whose message is empty', thrownValue: { message: '' } },
    { description: 'an object whose message is not text', thrownValue: { message: 404 } },
    { description: 'a thrown string', thrownValue: 'something broke' },
    { description: 'undefined', thrownValue: undefined },
    { description: 'null', thrownValue: null },
  ])('falls back to a generic sentence for $description', ({ thrownValue }) => {
    expect(describeFileLoadingFailure(thrownValue)).toBe('Could not read that file.');
  });
});
