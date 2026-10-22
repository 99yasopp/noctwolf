import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../text';
import { teamColor, theme } from '../theme/colors';
import { RevealEntry } from '../../network/protocol';
import { roleName, teamName } from '../../i18n';
import { useI18n } from '../i18n';
import { PlayerGrid } from './PlayerGrid';

// Every seat and its card. The table gets this when the game ends, and a
// player gets it the moment he dies: he can no longer act on it.
export const RevealedRoles = ({ entries }: { entries: RevealEntry[] }) => {
  const { t } = useI18n();

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{t('ui.roles.every')}</Text>
      <PlayerGrid
        seats={entries.map(entry => ({
          id: entry.id,
          name: entry.name,
          isAlive: entry.isAlive,
          roleId: entry.roleId,
          roleTeam: entry.team,
          accent: teamColor(entry.team),
          badge: entry.isAlive
            ? `${roleName(entry.roleId ?? '', entry.role)} · ${teamName(entry.team)}`
            : roleName(entry.roleId ?? '', entry.role),
        }))}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginTop: 4,
    marginBottom: theme.spacing.medium,
    gap: 8,
  },
  heading: {
    color: theme.colors.primary,
    fontSize: theme.type.section,
    fontWeight: '800',
  },
});
