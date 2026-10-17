import { theme } from './theme/colors';
import { LogKind, PublicLogPayload } from '../network/protocol';
import { Key, Translate } from '../i18n';

export interface InfoGroup {
  label: string;
  color: string;
  lines: string[];
}

export interface InfoSection {
  title: string;
  groups: InfoGroup[];
}

// What a round's news can be, in the order a reader looks for it. A line
// carries its own kind, so the grouping is the same in every language.
const KINDS: { id: LogKind; key: Key; color: string }[] = [
  { id: 'vote', key: 'info.vote', color: theme.colors.secondary },
  { id: 'death', key: 'info.dead', color: theme.colors.danger },
  { id: 'seer', key: 'info.seer', color: theme.colors.primary },
  { id: 'table', key: 'info.table', color: theme.colors.dim },
];

// The story grouped the way the table lived it: one block per round and phase,
// newest first, and inside a block one group per kind of news, so the ballots,
// the dead and the seer's sighting never run together. The round and the phase
// are in the heading, so a line does not carry them.
export const digestSections = (lines: PublicLogPayload[], t: Translate): InfoSection[] => {
  const sections: InfoSection[] = [];

  lines.forEach(line => {
    const title = t('info.round', {
      round: line.round,
      phase: t(`phase.${line.phase}` as Key),
    });
    const text = t(line.key as Key, line.params);
    let section = sections[sections.length - 1];

    if (!section || section.title !== title) {
      section = { title, groups: [] };
      sections.push(section);
    }

    const kind = KINDS.find(entry => entry.id === line.kind) ?? KINDS[KINDS.length - 1];
    const label = t(kind.key);
    const group = section.groups[section.groups.length - 1];
    if (group && group.label === label) group.lines.push(text);
    else section.groups.push({ label, color: kind.color, lines: [text] });
  });

  return sections.reverse();
};

// A section with no kinds inside it: the table's rules, the narrator's own log.
export const flatSection = (title: string, lines: string[]): InfoSection => ({
  title,
  groups: [{ label: '', color: theme.colors.dim, lines }],
});
