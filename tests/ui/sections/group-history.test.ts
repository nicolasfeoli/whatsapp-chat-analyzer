// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import type { ChatAnalysis, GroupChange, GroupEvent } from '../../../src/core/types';
import { assignPersonColours } from '../../../src/ui/person-colours';
import {
  EXPORTER_LABEL,
  GROUP_HISTORY_EVENT_LIMIT,
  countMembershipChanges,
  describeGroupChange,
  renderGroupHistorySection,
  selectLatestGroupEvents,
} from '../../../src/ui/sections/group-history';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { THE_EXPORTER, groupEvent, namedMember } from '../../fixtures/group-events';
import { findElement, parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';

const ana = namedMember('Ana');
const bob = namedMember('Bob');
const carla = namedMember('Carla');
const dani = namedMember('Dani');

/** Ana creates a group, adds three people, one of whom leaves; Dani never writes. */
const tripEvents: readonly GroupEvent[] = [
  groupEvent('2023-03-14 08:00', { kind: 'created', creator: ana, groupName: 'Trip' }),
  groupEvent('2023-03-14 08:01', { kind: 'added', actor: ana, members: [bob, carla, dani] }),
  groupEvent('2023-06-01 12:00', { kind: 'left', member: dani }),
  groupEvent('2024-01-02 09:30', {
    kind: 'renamed',
    actor: bob,
    previousName: 'Trip',
    newName: 'Trip 2024',
  }),
];

/**
 * Builds a chat in which Ana, Bob and Carla wrote, with the events given.
 */
function chatWithEvents(groupEvents: readonly GroupEvent[]): ChatAnalysis {
  return chatAnalysis({
    groupEvents,
    people: [
      personStatistics({ name: 'Ana', messageCount: 30 }),
      personStatistics({ name: 'Bob', messageCount: 20 }),
      personStatistics({ name: 'Carla', messageCount: 10 }),
    ],
  });
}

const tripChat = chatWithEvents(tripEvents);

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis): HTMLDivElement {
  return parseMarkup(renderGroupHistorySection(analysis, assignPersonColours(analysis.people)));
}

/**
 * Says what a change reads in the trip chat, as the text a reader sees.
 */
function descriptionOf(change: GroupChange): string {
  const descriptionHtml = describeGroupChange(
    change,
    tripChat,
    assignPersonColours(tripChat.people),
  );
  return parseMarkup(descriptionHtml).textContent;
}

/**
 * Builds as many events as asked, one a day from 1 January 2024, each somebody joining.
 */
function manyJoins(eventCount: number): GroupEvent[] {
  return Array.from({ length: eventCount }, (_unused, index): GroupEvent => {
    const moment = new Date(2024, 0, 1 + index, 12, 0);
    return {
      timestamp: moment,
      change: {
        kind: 'joined',
        member: namedMember(`Guest ${String(index + 1)}`),
        isThroughInviteLink: false,
      },
    };
  });
}

describe('countMembershipChanges', () => {
  it('counts nobody when there are no events', () => {
    expect(countMembershipChanges([])).toEqual({ arrivalCount: 0, departureCount: 0 });
  });

  it('counts every person of a notice that adds or removes several', () => {
    const groupEvents = [
      groupEvent('2024-01-01 10:00', { kind: 'added', actor: ana, members: [bob, carla, dani] }),
      groupEvent('2024-01-02 10:00', { kind: 'removed', actor: ana, members: [bob, carla] }),
    ];

    expect(countMembershipChanges(groupEvents)).toEqual({ arrivalCount: 3, departureCount: 2 });
  });

  it('counts somebody who joins and somebody who leaves once each', () => {
    const groupEvents = [
      groupEvent('2024-01-01 10:00', { kind: 'joined', member: bob, isThroughInviteLink: true }),
      groupEvent('2024-01-02 10:00', { kind: 'left', member: bob }),
    ];

    expect(countMembershipChanges(groupEvents)).toEqual({ arrivalCount: 1, departureCount: 1 });
  });

  it('counts somebody who left and came back each time', () => {
    const groupEvents = [
      groupEvent('2024-01-01 10:00', { kind: 'joined', member: bob, isThroughInviteLink: false }),
      groupEvent('2024-01-02 10:00', { kind: 'left', member: bob }),
      groupEvent('2024-01-03 10:00', { kind: 'added', actor: ana, members: [bob] }),
    ];

    expect(countMembershipChanges(groupEvents)).toEqual({ arrivalCount: 2, departureCount: 1 });
  });

  it('counts nobody for the creation, a new name or a new icon', () => {
    const groupEvents = [
      groupEvent('2024-01-01 10:00', { kind: 'created', creator: ana, groupName: 'Trip' }),
      groupEvent('2024-01-02 10:00', {
        kind: 'renamed',
        actor: ana,
        previousName: null,
        newName: 'Trip 2',
      }),
      groupEvent('2024-01-03 10:00', { kind: 'icon-changed', actor: ana }),
    ];

    expect(countMembershipChanges(groupEvents)).toEqual({ arrivalCount: 0, departureCount: 0 });
  });
});

describe('selectLatestGroupEvents', () => {
  it('lists the events newest first, without changing the list given', () => {
    const listedEvents = selectLatestGroupEvents(tripEvents);

    expect(listedEvents.map((listedEvent) => listedEvent.change.kind)).toEqual([
      'renamed',
      'left',
      'added',
      'created',
    ]);
    expect(tripEvents[0]?.change.kind).toBe('created');
  });

  it('keeps every event up to the limit', () => {
    expect(selectLatestGroupEvents(manyJoins(GROUP_HISTORY_EVENT_LIMIT))).toHaveLength(
      GROUP_HISTORY_EVENT_LIMIT,
    );
  });

  it('keeps only the newest events beyond the limit', () => {
    const listedEvents = selectLatestGroupEvents(manyJoins(GROUP_HISTORY_EVENT_LIMIT + 1));

    /* 51 events: the newest is guest 51 and the list ends with guest 2; guest 1 is left out. */
    expect(listedEvents).toHaveLength(GROUP_HISTORY_EVENT_LIMIT);
    expect(listedEvents[0]?.change).toMatchObject({ member: namedMember('Guest 51') });
    expect(listedEvents[listedEvents.length - 1]?.change).toMatchObject({
      member: namedMember('Guest 2'),
    });
  });
});

describe('describeGroupChange', () => {
  it.each<{ change: GroupChange; expected: string }>([
    {
      change: { kind: 'created', creator: ana, groupName: 'Trip' },
      expected: 'Ana created the group “Trip”',
    },
    {
      change: { kind: 'created', creator: ana, groupName: null },
      expected: 'Ana created the group',
    },
    {
      change: { kind: 'joined', member: bob, isThroughInviteLink: true },
      expected: 'Bob joined with the invite link',
    },
    { change: { kind: 'joined', member: bob, isThroughInviteLink: false }, expected: 'Bob joined' },
    { change: { kind: 'added', actor: ana, members: [bob] }, expected: 'Ana added Bob' },
    {
      change: { kind: 'added', actor: ana, members: [bob, carla] },
      expected: 'Ana added Bob and Carla',
    },
    {
      change: { kind: 'added', actor: ana, members: [bob, carla, dani] },
      expected: 'Ana added Bob, Carla and Dani',
    },
    { change: { kind: 'added', actor: null, members: [bob] }, expected: 'Bob was added' },
    {
      change: { kind: 'added', actor: null, members: [bob, carla] },
      expected: 'Bob and Carla were added',
    },
    { change: { kind: 'left', member: dani }, expected: 'Dani left' },
    { change: { kind: 'removed', actor: ana, members: [dani] }, expected: 'Ana removed Dani' },
    { change: { kind: 'removed', actor: null, members: [dani] }, expected: 'Dani was removed' },
    {
      change: { kind: 'renamed', actor: bob, previousName: 'Trip', newName: 'Trip 2024' },
      expected: 'Bob changed the group name from “Trip” to “Trip 2024”',
    },
    {
      change: { kind: 'renamed', actor: bob, previousName: null, newName: 'Trip 2024' },
      expected: 'Bob changed the group name to “Trip 2024”',
    },
    {
      change: { kind: 'renamed', actor: bob, previousName: null, newName: null },
      expected: 'Bob changed the group name',
    },
    {
      change: { kind: 'renamed', actor: bob, previousName: 'Trip', newName: null },
      expected: 'Bob changed the group name',
    },
    { change: { kind: 'icon-changed', actor: carla }, expected: 'Carla changed the group icon' },
  ])('writes "$expected"', ({ change, expected }) => {
    expect(descriptionOf(change)).toBe(expected);
  });

  it.each<{ change: GroupChange; expected: string }>([
    {
      change: { kind: 'created', creator: THE_EXPORTER, groupName: null },
      expected: 'You created the group',
    },
    { change: { kind: 'added', actor: THE_EXPORTER, members: [bob] }, expected: 'You added Bob' },
    { change: { kind: 'added', actor: ana, members: [THE_EXPORTER] }, expected: 'Ana added You' },
    { change: { kind: 'added', actor: null, members: [THE_EXPORTER] }, expected: 'You were added' },
    {
      change: { kind: 'removed', actor: null, members: [THE_EXPORTER] },
      expected: 'You were removed',
    },
    { change: { kind: 'left', member: THE_EXPORTER }, expected: 'You left' },
    {
      change: { kind: 'joined', member: THE_EXPORTER, isThroughInviteLink: false },
      expected: 'You joined',
    },
    {
      change: { kind: 'icon-changed', actor: THE_EXPORTER },
      expected: 'You changed the group icon',
    },
  ])('writes "$expected" for whoever made the export', ({ change, expected }) => {
    expect(descriptionOf(change)).toBe(expected);
  });

  it('gives a colour swatch to somebody who wrote in the chat, and none to anybody else', () => {
    const descriptionHtml = describeGroupChange(
      { kind: 'added', actor: ana, members: [dani, THE_EXPORTER] },
      tripChat,
      assignPersonColours(tripChat.people),
    );

    const names = Array.from(parseMarkup(descriptionHtml).querySelectorAll('.milestone-sender'));

    expect(names.map((name) => name.textContent)).toEqual(['Ana', 'Dani', EXPORTER_LABEL]);
    expect(names.map((name) => name.querySelectorAll('i').length)).toEqual([1, 0, 0]);
  });

  it('gives the swatch to a participant written with the tilde of a stranger, name as written', () => {
    const descriptionHtml = describeGroupChange(
      { kind: 'left', member: namedMember('~ Carla') },
      tripChat,
      assignPersonColours(tripChat.people),
    );

    const name = findElement(parseMarkup(descriptionHtml), '.milestone-sender');

    expect(name.textContent).toBe('~ Carla');
    expect(name.querySelectorAll('i')).toHaveLength(1);
  });

  it('escapes a name and a group name that are markup', () => {
    const hostileName = '<img src=x onerror=alert(1)>';
    const descriptionHtml = describeGroupChange(
      {
        kind: 'renamed',
        actor: namedMember(hostileName),
        previousName: '<b>old</b>',
        newName: '<script>new</script>',
      },
      tripChat,
      assignPersonColours(tripChat.people),
    );

    const description = parseMarkup(descriptionHtml);

    expect(tagNamesIn(description)).toEqual(['span']);
    expect(description.textContent).toBe(
      `${hostileName} changed the group name from “<b>old</b>” to “<script>new</script>”`,
    );
  });
});

describe('renderGroupHistorySection', () => {
  it('is left out of a chat without group events, such as a chat of two', () => {
    expect(renderGroupHistorySection(chatWithEvents([]), new Map())).toBe('');
  });

  it('is shown from a single event on', () => {
    const section = renderSection(
      chatWithEvents([groupEvent('2024-01-01 10:00', { kind: 'left', member: bob })]),
    );

    expect(textsOfElements(section, 'h2')).toEqual(['Group history']);
    expect(textsOfElements(section, 'li .milestone-description')).toEqual(['Bob left']);
  });

  it('lists the events with their dates, the newest first', () => {
    const section = renderSection(tripChat);

    expect(textsOfElements(section, 'li .milestone-date')).toEqual([
      '2 Jan 2024',
      '1 Jun 2023',
      '14 Mar 2023',
      '14 Mar 2023',
    ]);
    expect(textsOfElements(section, 'li .milestone-description')).toEqual([
      'Bob changed the group name from “Trip” to “Trip 2024”',
      'Dani left',
      'Ana added Bob, Carla and Dani',
      'Ana created the group “Trip”',
    ]);
  });

  it('shows how many people came and how many went, over all events', () => {
    const section = renderSection(tripChat);

    /* One notice added three people; one person left. */
    expect(textsOfElements(section, '.group-history-counts .headline-statistic')).toEqual([
      '3joined or were added',
      '1left or were removed',
    ]);
  });

  it('writes no note about a cut list while every event is listed', () => {
    const section = renderSection(chatWithEvents(manyJoins(GROUP_HISTORY_EVENT_LIMIT)));

    expect(section.querySelectorAll('li')).toHaveLength(GROUP_HISTORY_EVENT_LIMIT);
    expect(findElement(section, '.group-history-note').textContent).not.toContain('Showing');
  });

  it('cuts a long list to the newest events and says so, with counts that cover them all', () => {
    const eventCount = 1_234;
    const section = renderSection(chatWithEvents(manyJoins(eventCount)));

    expect(section.querySelectorAll('li')).toHaveLength(GROUP_HISTORY_EVENT_LIMIT);
    expect(findElement(section, '.group-history-note').textContent).toContain(
      'Showing the latest 50 of 1,234 events; the two counts cover them all.',
    );
    expect(textsOfElements(section, '.group-history-counts b')).toEqual(['1,234', '0']);
  });

  it('says who "You" is only when an event says "You"', () => {
    const withExporter = chatWithEvents([
      ...tripEvents,
      groupEvent('2024-02-01 10:00', { kind: 'removed', actor: ana, members: [THE_EXPORTER] }),
    ]);

    expect(findElement(renderSection(tripChat), '.group-history-note').textContent).not.toContain(
      'whoever made the export',
    );
    expect(findElement(renderSection(withExporter), '.group-history-note').textContent).toContain(
      '“You” is whoever made the export.',
    );
  });

  it.each<{ description: string; change: GroupChange }>([
    { description: 'creates', change: { kind: 'created', creator: THE_EXPORTER, groupName: null } },
    {
      description: 'joins',
      change: { kind: 'joined', member: THE_EXPORTER, isThroughInviteLink: true },
    },
    { description: 'adds', change: { kind: 'added', actor: THE_EXPORTER, members: [bob] } },
    {
      description: 'renames',
      change: { kind: 'renamed', actor: THE_EXPORTER, previousName: null, newName: 'Trip' },
    },
    { description: 'changes the icon', change: { kind: 'icon-changed', actor: THE_EXPORTER } },
  ])('explains "You" when whoever made the export $description', ({ change }) => {
    const section = renderSection(chatWithEvents([groupEvent('2024-01-01 10:00', change)]));

    expect(findElement(section, '.group-history-note').textContent).toContain('“You” is');
  });

  it('says where the events come from and how people are counted', () => {
    expect(findElement(renderSection(tripChat), '.group-history-note').textContent).toContain(
      'Somebody who left and came back is counted each time',
    );
  });

  it('is built from a heading, two counts, a list and a note', () => {
    expect(tagNamesIn(renderSection(tripChat))).toEqual([
      'section',
      'div',
      'h2',
      'p',
      'b',
      'span',
      'ol',
      'li',
      'i',
    ]);
  });
});
