/**
 * Tests that the page ships the licence notices of the code it bundles.
 *
 * The build strips comments, and with them the notices that JSZip and the
 * libraries inside it carry. `public/THIRD-PARTY-LICENCES.txt` restores them;
 * Vite copies everything under `public/` into the build unchanged.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** The root of the repository, seen from this folder. */
const REPOSITORY_ROOT = join(import.meta.dirname, '..', '..');

/** The file of notices that is copied into the build. */
const LICENCES_FILE_PATH = join(REPOSITORY_ROOT, 'public', 'THIRD-PARTY-LICENCES.txt');

/** The packages whose code ends up in the page's script: JSZip and what its browser build contains. */
const BUNDLED_PACKAGE_NAMES = ['jszip', 'pako', 'lie', 'immediate', 'setimmediate'] as const;

/** The sentence every MIT licence requires to be kept with copies of the software. */
const MIT_PERMISSION_NOTICE_OPENING = 'Permission is hereby granted, free of charge';

/**
 * Reads the version of an installed package from its own `package.json`.
 */
function installedVersionOf(packageName: string): string {
  const packageJsonPath = join(REPOSITORY_ROOT, 'node_modules', packageName, 'package.json');
  const packageJson: unknown = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  if (typeof packageJson !== 'object' || packageJson === null || !('version' in packageJson)) {
    throw new Error(`${packageName} has no version in its package.json`);
  }
  return String(packageJson.version);
}

describe('public/THIRD-PARTY-LICENCES.txt', () => {
  const licencesText = readFileSync(LICENCES_FILE_PATH, 'utf8');

  it.each(BUNDLED_PACKAGE_NAMES)('lists %s at the version that is installed', (packageName) => {
    const listedVersionPattern = new RegExp(
      `^ {2}${packageName}\\s+${installedVersionOf(packageName).replaceAll('.', '\\.')}\\s`,
      'm',
    );

    expect(licencesText).toMatch(listedVersionPattern);
  });

  it('carries one MIT permission notice per bundled package', () => {
    const noticeCount = licencesText.split(MIT_PERMISSION_NOTICE_OPENING).length - 1;

    expect(noticeCount).toBe(BUNDLED_PACKAGE_NAMES.length);
  });

  it.each([
    'Stuart Knightley',
    'Vitaly Puzrin',
    'Jean-loup Gailly and Mark Adler',
    'Calvin Metcalf',
    'Domenic Denicola',
  ])('names the copyright holder %s', (copyrightHolder) => {
    expect(licencesText).toContain(copyrightHolder);
  });

  it('says under which of its two licences JSZip is used', () => {
    expect(licencesText).toContain('This page uses it under the MIT license.');
  });
});
