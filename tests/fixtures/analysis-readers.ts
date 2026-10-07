/**
 * Helpers for reading the result of an analysis in a test.
 */

import { analyseChat } from '../../src/core/analysis/analyse-chat';
import type { ChatAnalysis, ChatMessage, PersonStatistics } from '../../src/core/types';

/**
 * Analyses messages as an iPhone export with second resolution, which is what
 * every test wants unless it is about the resolution itself.
 *
 * @param messages - The messages of an invented chat.
 * @returns The analysis.
 */
export function analyseMessages(messages: readonly ChatMessage[]): ChatAnalysis {
  return analyseChat(messages, 'second');
}

/**
 * Finds a participant by name and fails the test when they are missing, so the
 * test does not need to handle `undefined`.
 *
 * @param analysis - The analysis of a chat.
 * @param name - The participant's name.
 * @returns The statistics of that participant.
 * @throws Error when nobody of that name took part.
 */
export function findPerson(analysis: ChatAnalysis, name: string): PersonStatistics {
  const person = analysis.people.find((candidate) => candidate.name === name);
  if (person === undefined) {
    throw new Error(`No participant called ${name}`);
  }
  return person;
}

/**
 * Lists the participants in the order the analysis ranks them.
 *
 * @param analysis - The analysis of a chat.
 * @returns The names, most messages first.
 */
export function participantNames(analysis: ChatAnalysis): string[] {
  return analysis.people.map((person) => person.name);
}
