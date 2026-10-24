import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';

interface RoleCount {
  total: number;
  alive: number;
}

interface Props {
  tally?: {
    revealDead: boolean;
    roles: Record<string, RoleCount>;
    deadTotal: number;
  } | null;
  // Resolves a role id to a display name (for i18n).
  nameFor: (roleId: string) => string;
}

// A live count of every role at the table: how many were dealt, how many are
// still alive. When `revealDead` is off the dead are collapsed into a single
// line so no role leaves the deck early.
export const RoleTally: React.FC<Props> = ({ tally, nameFor }) => {
  if (!tally || Object.keys(tally.roles).length === 0) return null;

  const entries = Object.entries(tally.roles);

  return (
    <View style={styles.wrap}>
      {entries.map(([id, count]) => {
        const dead = count.total - count.alive;
        return (
          <View key={id} style={styles.row}>
            <Text style={styles.name}>{nameFor(id)}</Text>
            <Text style={[styles.count, count.alive === 0 && styles.dead]}>
              {count.alive}/{count.total}
            </Text>
          </View>
        );
      })}
      {!tally.revealDead && tally.deadTotal > 0 && (
        <View style={styles.row}>
          <Text style={[styles.name, styles.dim]}>{'✝'}</Text>
          <Text style={[styles.count, styles.dim]}>{tally.deadTotal}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    color: theme.colors.text,
    fontSize: 13,
    flex: 1,
  },
  count: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  dead: {
    color: theme.colors.danger,
  },
  dim: {
    color: theme.colors.dim,
  },
});
