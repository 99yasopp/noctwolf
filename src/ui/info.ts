import { theme } from './theme/colors';
import { PublicLogPayload } from '../network/protocol';

export interface InfoGroup {
  label: string;
  color: string;
  lines: string[];
}

export interface InfoSection {
  title: string;
  groups: InfoGroup[];
}

// What a round's news can be, in the order a reader looks for it. The first
// match wins, and whatever a table says that is none of the others lands in
// its own words.
const KINDS: { label: string; color: string; match: (line: string) => boolean }[] = [
  {
    label: 'The vote',
    color: theme.colors.secondary,
    match: line =>
      / voted for | didn't vote\.|nobody voted|was voted out|was elected mayor|vote was tied|could not agree on a mayor|bars .+ from voting|judge bangs|^The candidates are /.test(
        line,
      ),
  },
  {
    label: 'The dead',
    color: theme.colors.danger,
    match: line =>
      / did not survive the night| has died| nobody died in the night| took .+ down| is dead|guessed wrong/.test(
        line,
      ),
  },
  {
    label: 'The seer',
    color: theme.colors.primary,
    match: line => line.startsWith('The seer saw '),
  },
  { label: 'The table', color: theme.colors.dim, match: () => true },
];

// The story grouped the way the table lived it: one block per round and phase,
// newest first, and inside a block one group per kind of news, so the ballots,
// the dead and the seer's sighting never run together. The round and the phase
// are in the heading, so the "Day 2:" the line carries goes.
export const digestSections = (lines: PublicLogPayload[]): InfoSection[] => {
  const sections: InfoSection[] = [];

  lines.forEach(line => {
    const title = `Round ${line.round} · ${line.phase}`;
    const text = line.message.replace(/^Day \d+: /, '');
    let section = sections[sections.length - 1];

    if (!section || section.title !== title) {
      section = { title, groups: [] };
      sections.push(section);
    }

    const kind = KINDS.find(entry => entry.match(text))!;
    const group = section.groups[section.groups.length - 1];
    if (group && group.label === kind.label) group.lines.push(text);
    else section.groups.push({ label: kind.label, color: kind.color, lines: [text] });
  });

  return sections.reverse();
};

// A section with no kinds inside it: the table's rules, the narrator's own log.
export const flatSection = (title: string, lines: string[]): InfoSection => ({
  title,
  groups: [{ label: '', color: theme.colors.dim, lines }],
});
