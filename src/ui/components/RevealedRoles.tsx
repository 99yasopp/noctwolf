import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../text';
import { teamColor, theme } from '../theme/colors';
import { RevealEntry } from '../../network/protocol';
import { roleName, teamName } from '../../i18n';
import { useI18n } from '../i18n';
import { RosterRow } from './RosterRow';

// Every seat and its card. The table gets this when the game ends, and a
// player gets it the moment he dies: he can no longer act on it.
export const RevealedRoles = ({ entries }: { entries: RevealEntry[] }) => {
  const { t } = useI18n();

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{t('ui.roles.every')}</Text>
      {entries.map(entry => (
        <RosterRow
          key={entry.id}
          name={entry.name}
          tags={entry.isAlive ? undefined : t('ui.roster.dead')}
          detail={`${roleName(entry.roleId ?? '', entry.role)} (${teamName(entry.team)})`}
          dead={!entry.isAlive}
          dotColor={teamColor(entry.team)}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: 4,
    marginBottom: theme.spacing.medium,
  },
  heading: {
    color: theme.colors.primary,
    fontSize: theme.type.section,
    fontWeight: '800',
    paddingTop: 12,
    paddingBottom: 4,
  },
});
