import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';
import { RevealEntry } from '../../network/protocol';
import { roleName } from '../../i18n';

// Every seat and its card. The table gets this when the game ends, and a
// player gets it the moment he dies: he can no longer act on it.
export const RevealedRoles = ({ entries }: { entries: RevealEntry[] }) => (
  <View style={styles.card}>
    <Text style={styles.heading}>Every role</Text>
    {entries.map(entry => (
      <Text key={entry.id} style={[styles.row, !entry.isAlive && styles.dead]}>
        {entry.name}: {roleName(entry.roleId ?? '', entry.role)} ({entry.team})
        {entry.isAlive ? '' : ' — dead'}
      </Text>
    ))}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    marginBottom: theme.spacing.medium,
  },
  heading: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: theme.spacing.small,
  },
  row: {
    color: theme.colors.text,
    fontSize: 15,
    marginVertical: 2,
  },
  dead: {
    color: '#666',
    textDecorationLine: 'line-through',
  },
});
