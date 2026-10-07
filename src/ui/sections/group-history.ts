/**
 * The "Group history" section: the notices about who created the group, who
 * joined, left, was added or removed, and what the group was called, as a
 * dated list with the newest first, under two counts of comings and goings.
 *
 * The events come from system notices, not from messages, so the section is
 * left out when the export has none, which is the normal case for a chat of two.
 */

import type {
  ChatAnalysis,
  GroupChange,
  GroupEvent,
  GroupMember,
  PersonStatistics,
} from '../../core/index';
import { EMPTY_HTML, escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { colourOfPerson, renderColourSwatch } from '../person-colours';
import type { PersonColours } from '../person-colours';
import { formatLongDate, formatWholeNumber } from '../text-formatting';
import { normaliseMentionedName } from './mentions';
import { renderSectionHeading } from './section-heading';

/**
 * How many events the list shows, the newest ones. A large group collects
 * hundreds of notices over the years, and the list is for reading, not for
 * scrolling; fifty is a judgement. The counts above the list cover them all.
 */
export const GROUP_HISTORY_EVENT_LIMIT = 50;

/** How whoever made the export is written, as their own notices do. */
export const EXPORTER_LABEL = 'You';

/** The comings and goings of a chat, added up over all its events. */
export interface MembershipCounts {
  /** People who joined or were added; somebody who came twice counts twice. */
  readonly arrivalCount: number;
  /** People who left or were removed; somebody who went twice counts twice. */
  readonly departureCount: number;
}

/**
 * Adds up how many people came and went.
 *
 * @param groupEvents - The events of a chat.
 * @returns The two counts. A notice that adds three people counts three.
 */
export function countMembershipChanges(groupEvents: readonly GroupEvent[]): MembershipCounts {
  let arrivalCount = 0;
  let departureCount = 0;
  for (const { change } of groupEvents) {
    switch (change.kind) {
      case 'joined':
        arrivalCount += 1;
        break;
      case 'added':
        arrivalCount += change.members.length;
        break;
      case 'left':
        departureCount += 1;
        break;
      case 'removed':
        departureCount += change.members.length;
        break;
      case 'created':
      case 'renamed':
      case 'icon-changed':
        break;
    }
  }
  return { arrivalCount, departureCount };
}

/**
 * Picks the events the list shows: the newest, newest first.
 *
 * @param groupEvents - The events of a chat, oldest first.
 * @returns At most {@link GROUP_HISTORY_EVENT_LIMIT} events, newest first.
 */
export function selectLatestGroupEvents(groupEvents: readonly GroupEvent[]): GroupEvent[] {
  return [...groupEvents].reverse().slice(0, GROUP_HISTORY_EVENT_LIMIT);
}

/**
 * Tells whether any event is told from the point of view of whoever made the export.
 */
function mentionsExporter(groupEvents: readonly GroupEvent[]): boolean {
  const isExporter = (member: GroupMember | null): boolean => member?.kind === 'exporter';
  return groupEvents.some(({ change }: GroupEvent): boolean => {
    switch (change.kind) {
      case 'created':
        return isExporter(change.creator);
      case 'joined':
      case 'left':
        return isExporter(change.member);
      case 'added':
      case 'removed':
        return isExporter(change.actor) || change.members.some(isExporter);
      case 'renamed':
      case 'icon-changed':
        return isExporter(change.actor);
    }
  });
}

/**
 * Draws one person of an event: "You" for whoever made the export, otherwise
 * the name, with the swatch of their colour when they wrote in the chat. A
 * notice and a sender line do not always agree on the "not a contact" tilde,
 * so it is ignored when looking for the participant.
 */
function renderMember(
  member: GroupMember,
  analysis: ChatAnalysis,
  personColours: PersonColours,
): SafeHtml {
  if (member.kind === 'exporter') {
    return html`<span class="milestone-sender">${escapeHtml(EXPORTER_LABEL)}</span>`;
  }
  const comparedName = normaliseMentionedName(member.name);
  const participant = analysis.people.find(
    (person: PersonStatistics): boolean => normaliseMentionedName(person.name) === comparedName,
  );
  if (participant === undefined) {
    return html`<span class="milestone-sender">${escapeHtml(member.name)}</span>`;
  }
  const swatchHtml = renderColourSwatch(colourOfPerson(personColours, participant.name));
  return html`<span class="milestone-sender">${swatchHtml}${escapeHtml(member.name)}</span>`;
}

/**
 * Draws a list of people as "Ana", "Ana and Bob" or "Ana, Bob and Carla".
 */
function renderMemberList(
  members: readonly GroupMember[],
  analysis: ChatAnalysis,
  personColours: PersonColours,
): SafeHtml {
  const pieces: SafeHtml[] = [];
  for (const [index, member] of members.entries()) {
    if (index > 0) {
      pieces.push(escapeHtml(index === members.length - 1 ? ' and ' : ', '));
    }
    pieces.push(renderMember(member, analysis, personColours));
  }
  return joinHtml(pieces);
}

/**
 * Chooses "was" or "were" for a sentence without an actor: "Bob was added",
 * "You were added", "Bob and Carla were added".
 */
function passiveVerbFor(members: readonly GroupMember[]): string {
  const isSingleNamedPerson = members.length === 1 && members[0]?.kind === 'named';
  return isSingleNamedPerson ? 'was' : 'were';
}

/**
 * Writes a group name between quotation marks.
 */
function quoteGroupName(groupName: string): SafeHtml {
  return html`<span class="group-history-name">${escapeHtml(`“${groupName}”`)}</span>`;
}

/**
 * Says what happened at an event, without its date.
 *
 * @param change - What the notice says happened.
 * @param analysis - The analysed chat, to tell participants from other names.
 * @param personColours - The colour assignment shared by all charts.
 * @returns The sentence as markup; names and group names are escaped here.
 */
export function describeGroupChange(
  change: GroupChange,
  analysis: ChatAnalysis,
  personColours: PersonColours,
): SafeHtml {
  switch (change.kind) {
    case 'created': {
      const creatorHtml = renderMember(change.creator, analysis, personColours);
      if (change.groupName === null) {
        return html`${creatorHtml} created the group`;
      }
      return html`${creatorHtml} created the group ${quoteGroupName(change.groupName)}`;
    }
    case 'joined': {
      const memberHtml = renderMember(change.member, analysis, personColours);
      const ending = change.isThroughInviteLink ? ' joined with the invite link' : ' joined';
      return html`${memberHtml}${escapeHtml(ending)}`;
    }
    case 'added':
    case 'removed': {
      const verb = escapeHtml(change.kind);
      const membersHtml = renderMemberList(change.members, analysis, personColours);
      if (change.actor === null) {
        return html`${membersHtml} ${escapeHtml(passiveVerbFor(change.members))} ${verb}`;
      }
      const actorHtml = renderMember(change.actor, analysis, personColours);
      return html`${actorHtml} ${verb} ${membersHtml}`;
    }
    case 'left': {
      return html`${renderMember(change.member, analysis, personColours)} left`;
    }
    case 'renamed': {
      const actorHtml = renderMember(change.actor, analysis, personColours);
      if (change.newName === null) {
        return html`${actorHtml} changed the group name`;
      }
      const newNameHtml = quoteGroupName(change.newName);
      if (change.previousName === null) {
        return html`${actorHtml} changed the group name to ${newNameHtml}`;
      }
      const previousNameHtml = quoteGroupName(change.previousName);
      return html`${actorHtml} changed the group name from ${previousNameHtml} to ${newNameHtml}`;
    }
    case 'icon-changed': {
      return html`${renderMember(change.actor, analysis, personColours)} changed the group icon`;
    }
  }
}

/**
 * Draws the two counts above the list.
 */
function renderMembershipCounts(counts: MembershipCounts): SafeHtml {
  const statistics: readonly SafeHtml[] = [
    html`<div class="headline-statistic"><b>${escapeHtml(formatWholeNumber(counts.arrivalCount))}</b><span>joined or were added</span></div>`,
    html`<div class="headline-statistic"><b>${escapeHtml(formatWholeNumber(counts.departureCount))}</b><span>left or were removed</span></div>`,
  ];
  return html`<div class="headline-statistics group-history-counts">${joinHtml(statistics)}</div>`;
}

/**
 * Writes the note under the list: how many events are not listed, what the
 * counts count, and who "You" is when an event says so.
 */
function renderHistoryNote(groupEvents: readonly GroupEvent[], listedCount: number): SafeHtml {
  const sentences: string[] = [];
  if (listedCount < groupEvents.length) {
    sentences.push(
      `Showing the latest ${formatWholeNumber(listedCount)} of ${formatWholeNumber(groupEvents.length)} events; the two counts cover them all.`,
    );
  }
  sentences.push(
    'Read from the notices WhatsApp writes into a group, in English or Spanish. Somebody who left and came back is counted each time, and an export holds only the notices its own phone saw.',
  );
  if (mentionsExporter(groupEvents)) {
    sentences.push(`“${EXPORTER_LABEL}” is whoever made the export.`);
  }
  return html`<p class="hint group-history-note">${escapeHtml(sentences.join(' '))}</p>`;
}

/**
 * Draws the "Group history" section.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @returns A `<section>` element as markup, or empty markup for a chat
 *   without a single group event.
 */
export function renderGroupHistorySection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
): SafeHtml {
  const { groupEvents } = analysis;
  if (groupEvents.length === 0) {
    return EMPTY_HTML;
  }

  const listedEvents = selectLatestGroupEvents(groupEvents);
  const itemsHtml = joinHtml(
    listedEvents.map((groupEvent: GroupEvent): SafeHtml => {
      const dateHtml = escapeHtml(formatLongDate(groupEvent.timestamp));
      const descriptionHtml = describeGroupChange(groupEvent.change, analysis, personColours);
      return html`<li><span class="milestone-date">${dateHtml}</span><span class="milestone-description">${descriptionHtml}</span></li>`;
    }),
  );

  const headingHtml = renderSectionHeading(
    'Group history',
    'Who came, who went and what the group was called, the most recent first.',
  );
  const countsHtml = renderMembershipCounts(countMembershipChanges(groupEvents));
  const noteHtml = renderHistoryNote(groupEvents, listedEvents.length);
  return html`<section>${headingHtml}${countsHtml}<ol class="milestones group-history">${itemsHtml}</ol>${noteHtml}</section>`;
}
