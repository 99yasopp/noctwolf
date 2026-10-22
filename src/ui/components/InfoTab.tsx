import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../text';
import { theme } from '../theme/colors';
import { InfoSection } from '../info';
import { useI18n } from '../i18n';

// Everything the table was told, in one place: who pointed at whom, who died
// and what they were, what the seer said out loud, and the rules this table
// plays by — each kind of news in its own block, so nothing runs together. The
// play screen keeps only what a player acts on.
export const InfoTab: React.FC<{ sections: InfoSection[] }> = ({ sections }) => {
  const { t } = useI18n();

  return (
  <>
    {sections.length === 0 ? (
      <View style={styles.card}>
        <Text style={styles.line}>{t('ui.info.nothing')}</Text>
      </View>
    ) : (
      sections.map(section => (
        <View key={section.title} style={styles.card}>
          <Text style={styles.heading}>{section.title}</Text>
          {section.groups.map((group, index) => (
            <View key={`${index}-${group.label}`} style={index > 0 ? styles.group : undefined}>
              {group.label ? (
                <Text style={[styles.groupLabel, { color: group.color }]}>
                  {group.label}
                </Text>
              ) : null}
              {group.lines.map((line, lineIndex) => (
                <Text key={lineIndex} style={styles.line}>
                  {line}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ))
    )}
  </>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.medium,
    marginBottom: theme.spacing.medium,
  },
  heading: {
    color: theme.colors.primary,
    fontSize: theme.type.body,
    fontWeight: '800',
    marginBottom: 4,
  },
  // A rule between the kinds, so a block of ballots does not run into the
  // deaths that follow it.
  group: {
    marginTop: theme.spacing.small,
    borderTopWidth: 1,
    borderTopColor: theme.colors.raised,
    paddingTop: theme.spacing.small,
  },
  groupLabel: {
    fontSize: theme.type.label,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  line: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 3,
  },
});
