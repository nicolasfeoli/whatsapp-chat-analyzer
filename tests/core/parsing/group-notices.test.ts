import { describe, expect, it } from 'vitest';

import { readGroupNotice } from '../../../src/core/parsing/group-notices';
import { THE_EXPORTER, namedMember } from '../../fixtures/group-events';

const ana = namedMember('Ana');
const bob = namedMember('Bob');
const carla = namedMember('Carla');
const dani = namedMember('Dani');

describe('readGroupNotice', () => {
  describe('the creation of the group', () => {
    it.each([
      { notice: 'Ana created group "Trip"', wording: 'Android, English' },
      { notice: 'Ana created group “Trip”', wording: 'iPhone, English' },
      { notice: 'Ana creó el grupo "Trip"', wording: 'Android, Spanish' },
      { notice: 'Ana creó el grupo “Trip”', wording: 'iPhone, Spanish' },
      { notice: 'Ana creo el grupo "Trip"', wording: 'Spanish without the accent' },
    ])('reads who created it and its name ($wording)', ({ notice }) => {
      expect(readGroupNotice(notice)).toEqual({ kind: 'created', creator: ana, groupName: 'Trip' });
    });

    it.each(['Ana created this group', 'Ana creó este grupo'])(
      'reads "%s" without a group name',
      (notice) => {
        expect(readGroupNotice(notice)).toEqual({ kind: 'created', creator: ana, groupName: null });
      },
    );

    it.each([
      { notice: 'You created group "Trip"', groupName: 'Trip' },
      { notice: 'You created this group', groupName: null },
      { notice: 'Creaste el grupo “Trip”', groupName: 'Trip' },
      { notice: 'Creaste este grupo', groupName: null },
    ])('reads "$notice" as created by whoever made the export', ({ notice, groupName }) => {
      expect(readGroupNotice(notice)).toEqual({
        kind: 'created',
        creator: THE_EXPORTER,
        groupName,
      });
    });

    it('keeps a group name with a colon and quotation marks inside', () => {
      expect(readGroupNotice('Ana created group "Party: the "best" one"')).toEqual({
        kind: 'created',
        creator: ana,
        groupName: 'Party: the "best" one',
      });
    });

    it('reads empty quotation marks as no name', () => {
      expect(readGroupNotice('Ana created group ""')).toMatchObject({ groupName: null });
    });
  });

  describe('somebody joining', () => {
    it.each([
      "Bob joined using this group's invite link",
      'Bob joined using this group’s invite link',
      'Bob se unió usando el enlace de invitación de este grupo',
      'Bob se unio mediante el enlace de invitacion del grupo',
    ])('reads "%s" as joining through the invite link', (notice) => {
      expect(readGroupNotice(notice)).toEqual({
        kind: 'joined',
        member: bob,
        isThroughInviteLink: true,
      });
    });

    it.each(['Bob joined', 'Bob se unió'])('reads "%s" as joining, no link stated', (notice) => {
      expect(readGroupNotice(notice)).toEqual({
        kind: 'joined',
        member: bob,
        isThroughInviteLink: false,
      });
    });

    it.each([
      { notice: "You joined using this group's invite link", isThroughInviteLink: true },
      { notice: 'You joined', isThroughInviteLink: false },
      {
        notice: 'Te uniste usando el enlace de invitación de este grupo',
        isThroughInviteLink: true,
      },
      { notice: 'Te uniste', isThroughInviteLink: false },
    ])('reads "$notice" as whoever made the export joining', ({ notice, isThroughInviteLink }) => {
      expect(readGroupNotice(notice)).toEqual({
        kind: 'joined',
        member: THE_EXPORTER,
        isThroughInviteLink,
      });
    });

    it('keeps a phone number and the tilde of somebody who is not a contact', () => {
      expect(readGroupNotice('+34 600 000 000 joined')).toMatchObject({
        member: namedMember('+34 600 000 000'),
      });
      expect(readGroupNotice('~ Carla joined')).toMatchObject({ member: namedMember('~ Carla') });
    });
  });

  describe('people being added', () => {
    it.each(['Ana added Bob', 'Ana añadió a Bob', 'Ana anadio a Bob'])(
      'reads "%s" with who added whom',
      (notice) => {
        expect(readGroupNotice(notice)).toEqual({ kind: 'added', actor: ana, members: [bob] });
      },
    );

    it.each([
      'Ana added Bob, Carla and Dani',
      'Ana added Bob, Carla, and Dani',
      'Ana añadió a Bob, Carla y Dani',
      'Ana añadió a Bob, a Carla y a Dani',
    ])('reads every person of the list in "%s"', (notice) => {
      expect(readGroupNotice(notice)).toEqual({
        kind: 'added',
        actor: ana,
        members: [bob, carla, dani],
      });
    });

    it.each(['Ana added Bob and Carla', 'Ana añadió a Bob y Carla'])(
      'reads the two people of "%s"',
      (notice) => {
        expect(readGroupNotice(notice)).toMatchObject({ members: [bob, carla] });
      },
    );

    it.each(['Bob was added', 'Se añadió a Bob'])(
      'reads "%s" without anybody who did it',
      (notice) => {
        expect(readGroupNotice(notice)).toEqual({ kind: 'added', actor: null, members: [bob] });
      },
    );

    it('reads "were added" for several people', () => {
      expect(readGroupNotice('Bob and Carla were added')).toEqual({
        kind: 'added',
        actor: null,
        members: [bob, carla],
      });
    });

    it.each(['You added Bob', 'Añadiste a Bob'])(
      'reads "%s" as added by whoever made the export',
      (notice) => {
        expect(readGroupNotice(notice)).toEqual({
          kind: 'added',
          actor: THE_EXPORTER,
          members: [bob],
        });
      },
    );

    it.each(['Ana added you', 'Ana te añadió'])(
      'reads "%s" as whoever made the export being added',
      (notice) => {
        expect(readGroupNotice(notice)).toEqual({
          kind: 'added',
          actor: ana,
          members: [THE_EXPORTER],
        });
      },
    );

    it('reads "You were added" without anybody who did it', () => {
      expect(readGroupNotice('You were added')).toEqual({
        kind: 'added',
        actor: null,
        members: [THE_EXPORTER],
      });
    });

    it('reads "you" at the end of a list as whoever made the export', () => {
      expect(readGroupNotice('Ana added Bob and you')).toMatchObject({
        members: [bob, THE_EXPORTER],
      });
    });
  });

  describe('somebody leaving', () => {
    it.each(['Bob left', 'Bob salió del grupo', 'Bob salio del grupo'])('reads "%s"', (notice) => {
      expect(readGroupNotice(notice)).toEqual({ kind: 'left', member: bob });
    });

    it.each(['You left', 'Saliste del grupo'])(
      'reads "%s" as whoever made the export leaving',
      (notice) => {
        expect(readGroupNotice(notice)).toEqual({ kind: 'left', member: THE_EXPORTER });
      },
    );
  });

  describe('people being removed', () => {
    it.each(['Ana removed Bob', 'Ana eliminó a Bob'])(
      'reads "%s" with who removed whom',
      (notice) => {
        expect(readGroupNotice(notice)).toEqual({ kind: 'removed', actor: ana, members: [bob] });
      },
    );

    it.each(['Bob was removed', 'Se eliminó a Bob'])(
      'reads "%s" without anybody who did it',
      (notice) => {
        expect(readGroupNotice(notice)).toEqual({ kind: 'removed', actor: null, members: [bob] });
      },
    );

    it.each(['You removed Bob', 'Eliminaste a Bob'])(
      'reads "%s" as removed by whoever made the export',
      (notice) => {
        expect(readGroupNotice(notice)).toEqual({
          kind: 'removed',
          actor: THE_EXPORTER,
          members: [bob],
        });
      },
    );

    it.each([
      { notice: 'Ana removed you', actor: ana },
      { notice: 'Ana te eliminó', actor: ana },
      { notice: 'You were removed', actor: null },
    ])('reads "$notice" as whoever made the export being removed', ({ notice, actor }) => {
      expect(readGroupNotice(notice)).toEqual({
        kind: 'removed',
        actor,
        members: [THE_EXPORTER],
      });
    });

    it('reads "were removed" for several people', () => {
      expect(readGroupNotice('Bob and Carla were removed')).toMatchObject({
        kind: 'removed',
        members: [bob, carla],
      });
    });
  });

  describe('a change of the group name', () => {
    it.each([
      'Ana changed the subject from "Trip" to "Trip 2024"',
      'Ana changed the group name from “Trip” to “Trip 2024”',
      'Ana cambió el asunto de "Trip" a "Trip 2024"',
      'Ana cambió el nombre del grupo de “Trip” a “Trip 2024”',
    ])('reads the name before and after in "%s"', (notice) => {
      expect(readGroupNotice(notice)).toEqual({
        kind: 'renamed',
        actor: ana,
        previousName: 'Trip',
        newName: 'Trip 2024',
      });
    });

    it.each([
      'Ana changed the subject to "Trip 2024"',
      'Ana changed the group name to “Trip 2024”',
      'Ana cambió el asunto a “Trip 2024”',
      'Ana cambio el nombre del grupo a "Trip 2024"',
    ])('reads only the new name when "%s" states no old one', (notice) => {
      expect(readGroupNotice(notice)).toEqual({
        kind: 'renamed',
        actor: ana,
        previousName: null,
        newName: 'Trip 2024',
      });
    });

    it.each([
      { notice: 'You changed the subject from "Trip" to "Trip 2024"', previousName: 'Trip' },
      { notice: 'You changed the group name to "Trip 2024"', previousName: null },
      { notice: 'Cambiaste el asunto de "Trip" a "Trip 2024"', previousName: 'Trip' },
      { notice: 'Cambiaste el nombre del grupo a “Trip 2024”', previousName: null },
    ])('reads "$notice" as changed by whoever made the export', ({ notice, previousName }) => {
      expect(readGroupNotice(notice)).toEqual({
        kind: 'renamed',
        actor: THE_EXPORTER,
        previousName,
        newName: 'Trip 2024',
      });
    });

    it('keeps a colon inside the new name', () => {
      expect(readGroupNotice('Bob changed the group name to "Party: 2024"')).toMatchObject({
        actor: bob,
        newName: 'Party: 2024',
      });
    });
  });

  describe('a change of the group icon', () => {
    it.each([
      "Ana changed this group's icon",
      'Ana changed this group’s icon',
      'Ana changed the group icon',
      'Ana cambió el ícono de este grupo',
      'Ana cambió el icono del grupo',
      'Ana cambió la foto del grupo',
      'Ana cambió la imagen de este grupo',
    ])('reads "%s"', (notice) => {
      expect(readGroupNotice(notice)).toEqual({ kind: 'icon-changed', actor: ana });
    });

    it.each(["You changed this group's icon", 'Cambiaste el ícono de este grupo'])(
      'reads "%s" as changed by whoever made the export',
      (notice) => {
        expect(readGroupNotice(notice)).toEqual({ kind: 'icon-changed', actor: THE_EXPORTER });
      },
    );
  });

  describe('white space', () => {
    it('ignores white space around the notice and around a name', () => {
      expect(readGroupNotice('  Ana added  Bob ')).toEqual({
        kind: 'added',
        actor: ana,
        members: [bob],
      });
    });
  });

  describe('notices that are not group history', () => {
    it.each([
      'Messages and calls are end-to-end encrypted.',
      'Ana changed the group description',
      "Ana changed this group's settings to allow only admins to edit this group's info",
      "Ana reset this group's invite link",
      "You're now an admin",
      'Ana turned on disappearing messages.',
      'Ana changed to +34 600 000 000',
      'Your security code with Ana changed. Tap to learn more.',
      'Ana joined from the community',
      'Ana pinned a message',
      'Ana cambió la descripción del grupo',
      'Ahora eres admin. del grupo',
      'Ana left a voice message',
      '',
    ])('reads nothing from "%s"', (notice) => {
      expect(readGroupNotice(notice)).toBeNull();
    });

    it.each([
      'Ana added this group to the community "Town"',
      'This group was added',
      'Ana añadió a este grupo a la comunidad',
    ])('does not take the group or a community in "%s" for a person', (notice) => {
      expect(readGroupNotice(notice)).toBeNull();
    });

    it('does not read a verb written with a capital, as in a name', () => {
      expect(readGroupNotice('Uncle Left')).toBeNull();
      expect(readGroupNotice('Uncle Added Shark')).toBeNull();
    });

    it('does not read a line that holds a sender and a message', () => {
      expect(readGroupNotice('Trip planners added fun: Ana added Bob')).toBeNull();
    });

    it('reads a name of fifty characters and nothing longer', () => {
      /* 46 letters and " Vega" are 51 characters; without the last letter, 50. */
      const fiftyCharacterName = `${'A'.repeat(45)} Vega`;
      const longerName = `${'A'.repeat(46)} Vega`;

      expect(readGroupNotice(`${fiftyCharacterName} left`)).toEqual({
        kind: 'left',
        member: namedMember(fiftyCharacterName),
      });
      expect(readGroupNotice(`${longerName} left`)).toBeNull();
    });

    it('reads nothing when one name of a list is not a name', () => {
      expect(readGroupNotice('Ana added Bob and the whole group')).toBeNull();
    });
  });
});
