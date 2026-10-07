/**
 * Builders for invented zip archives, so the tests of file loading never need
 * a real export on disk. Never add a real export, zipped or not, to this folder.
 */

import JSZip from 'jszip';

/**
 * Builds a zip from invented text files.
 *
 * @param textByPath - The content of each file, by its path inside the archive, in archive order.
 * @returns The bytes of the `.zip` file.
 */
export async function buildZipBytes(textByPath: ReadonlyMap<string, string>): Promise<ArrayBuffer> {
  const archive = new JSZip();
  for (const [path, text] of textByPath) {
    archive.file(path, text);
  }
  return archive.generateAsync({ type: 'arraybuffer' });
}

/**
 * Builds a zip from invented text files, as the `File` a file picker would hand over.
 *
 * @param textByPath - The content of each file, by its path inside the archive, in archive order.
 * @param fileName - The name of the zip itself.
 * @returns The archive, with the zip media type.
 */
export async function buildZipFile(
  textByPath: ReadonlyMap<string, string>,
  fileName = 'export.zip',
): Promise<File> {
  const zipBytes = await buildZipBytes(textByPath);
  return new File([zipBytes], fileName, { type: 'application/zip' });
}
