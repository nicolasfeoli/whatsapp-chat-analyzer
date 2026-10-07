/**
 * Builders for invented events of a group's history, so each test states only
 * what happened and when.
 *
 * Every name here is made up. Never add a real export to this folder.
 */

import type { GroupChange, GroupEvent, GroupMember } from '../../src/core/types';
import { localTime } from './messages';

/** Whoever made the export, as the notices that say "You" are read. */
export const THE_EXPORTER: GroupMember = { kind: 'exporter' };

/**
 * Builds a person a notice names.
 *
 * @param name - The name as the notice writes it.
 * @returns The person.
 */
export function namedMember(name: string): GroupMember {
  return { kind: 'named', name };
}

/**
 * Builds an event of a group's history.
 *
 * @param happenedAt - Local date and time, e.g. `'2024-01-13 10:00'`.
 * @param change - What happened.
 * @returns The event.
 */
export function groupEvent(happenedAt: string, change: GroupChange): GroupEvent {
  return { timestamp: localTime(happenedAt), change };
}
