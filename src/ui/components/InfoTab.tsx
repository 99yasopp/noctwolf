import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';
import { PublicLogPayload } from '../../network/protocol';

export interface InfoSection {
  title: string;
  lines: string[];
}

// The story grouped the way the table lived it: one block per round and phase,
// newest first, so the day just played is the first thing read. The round and
// the phase are in the heading, so the "Day 2:" the line carries goes.
export const digestSections = (lines: PublicLogPayload[]): InfoSection[] => {
  const groups: InfoSection[] = [];

  lines.forEach(line => {
    const title = `Round ${line.round} · ${line.phase}`;
    const text = line.message.replace(/^Day \d+: /, '');
    const last = groups[groups.length - 1];

    if (last && last.title === title) last.lines.push(text);
    else groups.push({ title, lines: [text] });
  });

  return groups.reverse();
};

// Everything the table was told, in one place: who pointed at whom, who died
// and what they were, what the seer said out loud, and the rules this table
// plays by. The play screen keeps only what a player acts on.
export const InfoTab: React.FC<{ sections: InfoSection[] }> = ({ sections }) => (
  <>
    {sections.length === 0 ? (
      <View style={styles.card}>
        <Text style={styles.line}>Nothing has been announced yet.</Text>
      </View>
    ) : (
      sections.map(section => (
        <View key={section.title} style={styles.card}>
          <Text style={styles.heading}>{section.title}</Text>
          {section.lines.map((line, index) => (
            <Text key={index} style={styles.line}>
              {line}
            </Text>
          ))}
        </View>
      ))
    )}
  </>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    padding: theme.spacing.medium,
    marginBottom: theme.spacing.small,
  },
  heading: {
    color: theme.colors.primary,
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  line: {
    color: theme.colors.text,
    fontSize: 14,
    marginBottom: 2,
  },
});
