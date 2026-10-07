/**
 * Reads the system notices that tell the history of a group: who created it,
 * who joined, left, was added or removed, and what it was called.
 *
 * Only English and Spanish notices are read, in the wordings WhatsApp is known
 * to write on iPhone and Android. Each wording is one entry of a table: a
 * pattern for the whole notice and a function that says what it means. A
 * notice that fits no entry is not an event, and stays the dropped system
 * notice it always was; nothing here decides what is a message.
 *
 * The verbs are matched in the lower case WhatsApp writes them in, so a
 * contact called "Uncle Left Shark" is not somebody who left.
 */

import type { GroupChange, GroupMember } from '../types';

/** What a table entry does with the pieces its pattern found; `null` when they make no sense. */
type GroupChangeReader = (pieces: readonly string[]) => GroupChange | null;

/** One wording of a notice and what it means. */
interface GroupNoticeRule {
  /** Matches the whole notice; its groups are handed to `read` in order. */
  readonly pattern: RegExp;
  /** Turns the matched groups into a change. */
  readonly read: GroupChangeReader;
}

/** How a list of names is taken apart in one language. */
interface NameListLanguage {
  /** What stands between two names of a list: a comma, "and", or both. */
  readonly separatorPattern: RegExp;
  /** The word that stands for whoever made the export inside a list, lower-cased. */
  readonly exporterWord: string;
}

/** Whoever made the export, whose own notices say "You". */
const EXPORTER: GroupMember = { kind: 'exporter' };

/**
 * WhatsApp limits a contact name far below this, and a phone number is
 * shorter still; a longer "name" is the rest of a sentence the table does not know.
 */
const LONGEST_MEMBER_NAME_LENGTH = 50;

/**
 * Words that show a "name" is the group or a community and not a person, as
 * in `Ana added this group to the community "Town"`.
 */
const NOT_A_PERSON_PATTERN = /(?:^|\s)(?:group|community|grupo|comunidad)(?:\s|$)/i;

/** What separates a sender from a message; a name that holds it is two things glued together. */
const SENDER_SEPARATOR = ': ';

/**
 * English lists: `Bob and Carla`, `Bob, Carla and Dani`, `Bob, Carla, and Dani`.
 * A contact saved as "Mum and Dad" is therefore read as two people.
 */
const ENGLISH_NAME_LIST: NameListLanguage = {
  separatorPattern: /\s*,\s+(?:and\s+)?|\s+and\s+/,
  exporterWord: 'you',
};

/**
 * Spanish lists: `Bob y Carla`, `Bob, Carla y Dani`, also with the
 * preposition repeated (`a Bob y a Carla`).
 */
const SPANISH_NAME_LIST: NameListLanguage = {
  separatorPattern: /\s*,\s+(?:y\s+)?(?:a\s+)?|\s+y\s+(?:a\s+)?/,
  exporterWord: 'ti',
};

/**
 * Reads the name of one person out of a notice.
 *
 * @param text - The piece of the notice where a name stands.
 * @returns The person, or `null` when the piece cannot be a name: it is
 *   empty, too long, holds `": "` or talks about a group or a community.
 */
function readNamedMember(text: string): GroupMember | null {
  const name = text.trim();
  if (name === '' || name.length > LONGEST_MEMBER_NAME_LENGTH) {
    return null;
  }
  if (name.includes(SENDER_SEPARATOR) || NOT_A_PERSON_PATTERN.test(name)) {
    return null;
  }
  return { kind: 'named', name };
}

/**
 * Reads a list of people out of a notice.
 *
 * @param text - The piece of the notice where one or more names stand.
 * @param language - How lists are written in the language of the notice.
 * @returns The people in the order written, or `null` when any piece of the
 *   list cannot be a name.
 */
function readMemberList(text: string, language: NameListLanguage): GroupMember[] | null {
  const members: GroupMember[] = [];
  for (const piece of text.split(language.separatorPattern)) {
    const member =
      piece.trim().toLowerCase() === language.exporterWord ? EXPORTER : readNamedMember(piece);
    if (member === null) {
      return null;
    }
    members.push(member);
  }
  return members;
}

/**
 * Reads a group name, which may hold anything, from between its quotation marks.
 *
 * @returns The name, or `null` when nothing stands between the marks.
 */
function readGroupName(text: string): string | null {
  const groupName = text.trim();
  return groupName === '' ? null : groupName;
}

/**
 * Builds the reader of "somebody created the group".
 *
 * @param creatorOf - Who created it.
 * @param isNameStated - Whether the last piece of the notice is the name of the group.
 */
function createdBy(
  creatorOf: (pieces: readonly string[]) => GroupMember | null,
  isNameStated: boolean,
): GroupChangeReader {
  return (pieces: readonly string[]): GroupChange | null => {
    const creator = creatorOf(pieces);
    if (creator === null) {
      return null;
    }
    const groupName = isNameStated ? readGroupName(pieces[pieces.length - 1] ?? '') : null;
    return { kind: 'created', creator, groupName };
  };
}

/** Says that the first piece of a notice is the person it is about. */
function firstPieceAsMember(pieces: readonly string[]): GroupMember | null {
  return readNamedMember(pieces[0] ?? '');
}

/** Says that the notice is about whoever made the export. */
function theExporter(): GroupMember {
  return EXPORTER;
}

/** Builds the reader of "somebody joined", by themselves or through the invite link. */
function joined(
  memberOf: (pieces: readonly string[]) => GroupMember | null,
  isThroughInviteLink: boolean,
): GroupChangeReader {
  return (pieces: readonly string[]): GroupChange | null => {
    const member = memberOf(pieces);
    return member === null ? null : { kind: 'joined', member, isThroughInviteLink };
  };
}

/** Builds the reader of "somebody left". */
function left(memberOf: (pieces: readonly string[]) => GroupMember | null): GroupChangeReader {
  return (pieces: readonly string[]): GroupChange | null => {
    const member = memberOf(pieces);
    return member === null ? null : { kind: 'left', member };
  };
}

/** Where the people of an "added" or "removed" notice stand, and how to read them. */
interface MembershipWording {
  /** Whether the people were added or removed. */
  readonly kind: 'added' | 'removed';
  /** How lists are written in the language of the notice. */
  readonly language: NameListLanguage;
  /**
   * Who did it: `'exporter'` for "You added ...", `'named'` when the first
   * piece is their name, `'unstated'` for "Bob was added".
   */
  readonly actor: 'exporter' | 'named' | 'unstated';
  /**
   * Who it was done to: `'exporter'` for "... added you", `'listed'` when the
   * last piece is a list of names.
   */
  readonly members: 'exporter' | 'listed';
}

/** Builds the reader of "somebody added or removed somebody". */
function membership(wording: MembershipWording): GroupChangeReader {
  return (pieces: readonly string[]): GroupChange | null => {
    const actor = wording.actor === 'named' ? firstPieceAsMember(pieces) : null;
    if (wording.actor === 'named' && actor === null) {
      return null;
    }
    const members =
      wording.members === 'exporter'
        ? [EXPORTER]
        : readMemberList(pieces[pieces.length - 1] ?? '', wording.language);
    if (members === null) {
      return null;
    }
    return {
      kind: wording.kind,
      members,
      actor: wording.actor === 'exporter' ? EXPORTER : actor,
    };
  };
}

/**
 * Builds the reader of "somebody changed the group name".
 *
 * @param actorOf - Who changed it.
 * @param nameCount - How many names the notice states after the actor: 2 for
 *   "from A to B", 1 for "to B".
 */
function renamed(
  actorOf: (pieces: readonly string[]) => GroupMember | null,
  nameCount: 1 | 2,
): GroupChangeReader {
  return (pieces: readonly string[]): GroupChange | null => {
    const actor = actorOf(pieces);
    if (actor === null) {
      return null;
    }
    const names = pieces.slice(pieces.length - nameCount);
    const newName = readGroupName(names[names.length - 1] ?? '');
    const previousName = nameCount === 2 ? readGroupName(names[0] ?? '') : null;
    return { kind: 'renamed', actor, previousName, newName };
  };
}

/** Builds the reader of "somebody changed the group icon". */
function iconChanged(
  actorOf: (pieces: readonly string[]) => GroupMember | null,
): GroupChangeReader {
  return (pieces: readonly string[]): GroupChange | null => {
    const actor = actorOf(pieces);
    return actor === null ? null : { kind: 'icon-changed', actor };
  };
}

/*
 * In the patterns below a group name stands between straight or curly double
 * quotation marks (Android writes `"Trip"`, iPhone `“Trip”`), an apostrophe
 * may be straight or curly, and a name before a verb is matched as shortly as
 * possible, so that `Ana added Bob` is not thrown by a later " added ".
 * Entries are tried in order: the wordings about "you" come before the general
 * ones they would otherwise fall into.
 */

/** The English wordings, iPhone and Android. */
const ENGLISH_RULES: readonly GroupNoticeRule[] = [
  /* `You created group "Trip"`, `Ana created group “Trip”`, `Ana created this group` */
  { pattern: /^You created group ["“](.*)["”]$/, read: createdBy(theExporter, true) },
  { pattern: /^You created this group$/, read: createdBy(theExporter, false) },
  { pattern: /^(.+?) created group ["“](.*)["”]$/, read: createdBy(firstPieceAsMember, true) },
  { pattern: /^(.+) created this group$/, read: createdBy(firstPieceAsMember, false) },

  /* `Bob joined using this group's invite link`, `Bob joined` */
  {
    pattern: /^You joined using this group['’]s invite link$/,
    read: joined(theExporter, true),
  },
  {
    pattern: /^(.+) joined using this group['’]s invite link$/,
    read: joined(firstPieceAsMember, true),
  },
  { pattern: /^You joined$/, read: joined(theExporter, false) },
  { pattern: /^(.+) joined$/, read: joined(firstPieceAsMember, false) },

  /* `You were added`, `Ana added you`, `You added Bob`, `Bob was added`, `Ana added Bob and Carla` */
  {
    pattern: /^You were added$/,
    read: membership({
      kind: 'added',
      language: ENGLISH_NAME_LIST,
      actor: 'unstated',
      members: 'exporter',
    }),
  },
  {
    pattern: /^(.+) added you$/,
    read: membership({
      kind: 'added',
      language: ENGLISH_NAME_LIST,
      actor: 'named',
      members: 'exporter',
    }),
  },
  {
    pattern: /^You added (.+)$/,
    read: membership({
      kind: 'added',
      language: ENGLISH_NAME_LIST,
      actor: 'exporter',
      members: 'listed',
    }),
  },
  {
    pattern: /^(.+) (?:was|were) added$/,
    read: membership({
      kind: 'added',
      language: ENGLISH_NAME_LIST,
      actor: 'unstated',
      members: 'listed',
    }),
  },
  {
    pattern: /^(.+?) added (.+)$/,
    read: membership({
      kind: 'added',
      language: ENGLISH_NAME_LIST,
      actor: 'named',
      members: 'listed',
    }),
  },

  /* `You left`, `Bob left` */
  { pattern: /^You left$/, read: left(theExporter) },
  { pattern: /^(.+) left$/, read: left(firstPieceAsMember) },

  /* `You were removed`, `Ana removed you`, `You removed Bob`, `Bob was removed`, `Ana removed Bob` */
  {
    pattern: /^You were removed$/,
    read: membership({
      kind: 'removed',
      language: ENGLISH_NAME_LIST,
      actor: 'unstated',
      members: 'exporter',
    }),
  },
  {
    pattern: /^(.+) removed you$/,
    read: membership({
      kind: 'removed',
      language: ENGLISH_NAME_LIST,
      actor: 'named',
      members: 'exporter',
    }),
  },
  {
    pattern: /^You removed (.+)$/,
    read: membership({
      kind: 'removed',
      language: ENGLISH_NAME_LIST,
      actor: 'exporter',
      members: 'listed',
    }),
  },
  {
    pattern: /^(.+) (?:was|were) removed$/,
    read: membership({
      kind: 'removed',
      language: ENGLISH_NAME_LIST,
      actor: 'unstated',
      members: 'listed',
    }),
  },
  {
    pattern: /^(.+?) removed (.+)$/,
    read: membership({
      kind: 'removed',
      language: ENGLISH_NAME_LIST,
      actor: 'named',
      members: 'listed',
    }),
  },

  /*
   * `Ana changed the subject from "Trip" to "Trip 2024"`, `Ana changed the
   * group name to “Trip 2024”`: "subject" is the older word for the name.
   */
  {
    pattern: /^You changed the (?:subject|group name) from ["“](.*?)["”] to ["“](.*)["”]$/,
    read: renamed(theExporter, 2),
  },
  {
    pattern: /^You changed the (?:subject|group name) to ["“](.*)["”]$/,
    read: renamed(theExporter, 1),
  },
  {
    pattern: /^(.+?) changed the (?:subject|group name) from ["“](.*?)["”] to ["“](.*)["”]$/,
    read: renamed(firstPieceAsMember, 2),
  },
  {
    pattern: /^(.+?) changed the (?:subject|group name) to ["“](.*)["”]$/,
    read: renamed(firstPieceAsMember, 1),
  },

  /* `Ana changed this group's icon`, `Ana changed the group icon` */
  {
    pattern: /^You changed (?:this group['’]s|the group) icon$/,
    read: iconChanged(theExporter),
  },
  {
    pattern: /^(.+) changed (?:this group['’]s|the group) icon$/,
    read: iconChanged(firstPieceAsMember),
  },
];

/**
 * The Spanish wordings, iPhone and Android. Spanish says "you" through the
 * verb (`Añadiste a Bob`, `Ana te añadió`), and its accents are optional
 * here as in the other marker tables.
 */
const SPANISH_RULES: readonly GroupNoticeRule[] = [
  /* `Creaste el grupo "Viaje"`, `Ana creó el grupo “Viaje”`, `Ana creó este grupo` */
  { pattern: /^Creaste el grupo ["“](.*)["”]$/, read: createdBy(theExporter, true) },
  { pattern: /^Creaste este grupo$/, read: createdBy(theExporter, false) },
  { pattern: /^(.+?) cre[oó] el grupo ["“](.*)["”]$/, read: createdBy(firstPieceAsMember, true) },
  { pattern: /^(.+) cre[oó] este grupo$/, read: createdBy(firstPieceAsMember, false) },

  /* `Bob se unió usando el enlace de invitación de este grupo`, `Bob se unió` */
  {
    pattern: /^Te uniste (?:usando|mediante|con) el enlace de invitaci[oó]n (?:de este|del) grupo$/,
    read: joined(theExporter, true),
  },
  {
    pattern:
      /^(.+) se uni[oó] (?:usando|mediante|con) el enlace de invitaci[oó]n (?:de este|del) grupo$/,
    read: joined(firstPieceAsMember, true),
  },
  { pattern: /^Te uniste$/, read: joined(theExporter, false) },
  { pattern: /^(.+) se uni[oó]$/, read: joined(firstPieceAsMember, false) },

  /* `Ana te añadió`, `Añadiste a Bob`, `Se añadió a Bob`, `Ana añadió a Bob y Carla` */
  {
    pattern: /^(.+) te a[ñn]adi[oó]$/,
    read: membership({
      kind: 'added',
      language: SPANISH_NAME_LIST,
      actor: 'named',
      members: 'exporter',
    }),
  },
  {
    pattern: /^A[ñn]adiste a (.+)$/,
    read: membership({
      kind: 'added',
      language: SPANISH_NAME_LIST,
      actor: 'exporter',
      members: 'listed',
    }),
  },
  {
    pattern: /^Se a[ñn]adi[oó] a (.+)$/,
    read: membership({
      kind: 'added',
      language: SPANISH_NAME_LIST,
      actor: 'unstated',
      members: 'listed',
    }),
  },
  {
    pattern: /^(.+?) a[ñn]adi[oó] a (.+)$/,
    read: membership({
      kind: 'added',
      language: SPANISH_NAME_LIST,
      actor: 'named',
      members: 'listed',
    }),
  },

  /* `Saliste del grupo`, `Bob salió del grupo` */
  { pattern: /^Saliste del grupo$/, read: left(theExporter) },
  { pattern: /^(.+) sali[oó] del grupo$/, read: left(firstPieceAsMember) },

  /* `Ana te eliminó`, `Eliminaste a Bob`, `Se eliminó a Bob`, `Ana eliminó a Bob` */
  {
    pattern: /^(.+) te elimin[oó]$/,
    read: membership({
      kind: 'removed',
      language: SPANISH_NAME_LIST,
      actor: 'named',
      members: 'exporter',
    }),
  },
  {
    pattern: /^Eliminaste a (.+)$/,
    read: membership({
      kind: 'removed',
      language: SPANISH_NAME_LIST,
      actor: 'exporter',
      members: 'listed',
    }),
  },
  {
    pattern: /^Se elimin[oó] a (.+)$/,
    read: membership({
      kind: 'removed',
      language: SPANISH_NAME_LIST,
      actor: 'unstated',
      members: 'listed',
    }),
  },
  {
    pattern: /^(.+?) elimin[oó] a (.+)$/,
    read: membership({
      kind: 'removed',
      language: SPANISH_NAME_LIST,
      actor: 'named',
      members: 'listed',
    }),
  },

  /* `Ana cambió el asunto de "Viaje" a "Viaje 2024"`, `Ana cambió el nombre del grupo a “Viaje 2024”` */
  {
    pattern: /^Cambiaste (?:el asunto|el nombre del grupo) de ["“](.*?)["”] a ["“](.*)["”]$/,
    read: renamed(theExporter, 2),
  },
  {
    pattern: /^Cambiaste (?:el asunto|el nombre del grupo) a ["“](.*)["”]$/,
    read: renamed(theExporter, 1),
  },
  {
    pattern: /^(.+?) cambi[oó] (?:el asunto|el nombre del grupo) de ["“](.*?)["”] a ["“](.*)["”]$/,
    read: renamed(firstPieceAsMember, 2),
  },
  {
    pattern: /^(.+?) cambi[oó] (?:el asunto|el nombre del grupo) a ["“](.*)["”]$/,
    read: renamed(firstPieceAsMember, 1),
  },

  /* `Ana cambió el ícono de este grupo`, `Ana cambió la foto del grupo` */
  {
    pattern: /^Cambiaste (?:el [ií]cono|la foto|la imagen) (?:de este|del) grupo$/,
    read: iconChanged(theExporter),
  },
  {
    pattern: /^(.+) cambi[oó] (?:el [ií]cono|la foto|la imagen) (?:de este|del) grupo$/,
    read: iconChanged(firstPieceAsMember),
  },
];

/** Every wording that is read, in the order it is tried. */
const GROUP_NOTICE_RULES: readonly GroupNoticeRule[] = [...ENGLISH_RULES, ...SPANISH_RULES];

/**
 * Reads what a system notice says about the group.
 *
 * The first wording that fits the whole notice decides. When that wording
 * fits but its names make no sense (`Ana added this group to the community`),
 * the notice is not an event; later wordings are not tried, because a notice
 * that starts like one wording is never another.
 *
 * @param notice - The text of a system notice without its timestamp and
 *   without invisible characters.
 * @returns What happened, or `null` when the notice is not about who is in
 *   the group or what it is called, or is worded in a way the table does not know.
 */
export function readGroupNotice(notice: string): GroupChange | null {
  const trimmedNotice = notice.trim();
  for (const rule of GROUP_NOTICE_RULES) {
    const match = rule.pattern.exec(trimmedNotice);
    if (match !== null) {
      return rule.read(match.slice(1));
    }
  }
  return null;
}
