import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { theme, teamColor } from '../theme/colors';
import { PlayableRole } from '../../engine/roleSet';

// The sides in the order the host reads them. A custom role may bring a side
// of its own, which lands in the last group.
const TEAM_ORDER = ['Wolf', 'Village', 'Solitary'];
const OTHER = 'Other';

interface Props {
  roles: PlayableRole[];
  counts: Record<string, number>;
  onChange: (roleId: string, count: number) => void;
}

// The host's table as tiles: one per role, grouped by side, each showing how
// many seats it takes. Tapping a tile opens what the role does.
export const RoleGrid: React.FC<Props> = ({ roles, counts, onChange }) => {
  const [openRole, setOpenRole] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const shown = query
    ? roles.filter(role => role.name.toLowerCase().includes(query))
    : roles;

  const groups = [...TEAM_ORDER, OTHER]
    .map(team => ({
      team,
      roles: shown.filter(role =>
        team === OTHER ? !TEAM_ORDER.includes(role.team) : role.team === team,
      ),
    }))
    .filter(group => group.roles.length > 0);

  const open = roles.find(role => role.id === openRole) ?? null;
  const step = (roleId: string, by: number) =>
    onChange(roleId, Math.max(0, (counts[roleId] ?? 0) + by));

  return (
    <View>
      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Search roles"
        placeholderTextColor={theme.colors.dim}
      />

      {open && (
        <View style={[styles.card, { borderColor: teamColor(open.team) }]}>
          <Text style={[styles.cardName, { color: teamColor(open.team) }]}>
            {open.name} — {open.team}
          </Text>
          <Text style={styles.cardText}>{open.description}</Text>
          {open.nightActions?.map(action => (
            <Text key={action.id} style={styles.cardAction}>
              • {action.label}
            </Text>
          ))}
          <TouchableOpacity onPress={() => setOpenRole(null)} activeOpacity={0.7}>
            <Text style={styles.cardClose}>Close</Text>
          </TouchableOpacity>
        </View>
      )}

      {groups.map(group => (
        <View key={group.team}>
          <Text style={[styles.groupHeader, { color: teamColor(group.team) }]}>
            {group.team === OTHER ? 'Other sides' : group.team}
          </Text>
          <View style={styles.grid}>
            {group.roles.map(role => {
              const count = counts[role.id] ?? 0;
              const colour = teamColor(role.team);

              return (
                <View
                  key={role.id}
                  style={[styles.tile, { borderColor: colour }, count > 0 && styles.tileTaken]}
                >
                  <TouchableOpacity
                    onPress={() => setOpenRole(role.id === openRole ? null : role.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.tileName}>{role.name}</Text>
                  </TouchableOpacity>
                  <View style={styles.tileButtons}>
                    <TouchableOpacity
                      style={styles.stepButton}
                      onPress={() => step(role.id, -1)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.stepText}>−</Text>
                    </TouchableOpacity>
                    <Text style={[styles.tileCount, count > 0 && { color: colour }]}>
                      {count}
                    </Text>
                    <TouchableOpacity
                      style={styles.stepButton}
                      onPress={() => step(role.id, 1)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.stepText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  search: {
    backgroundColor: theme.colors.raised,
    color: theme.colors.text,
    borderRadius: theme.borderRadius,
    paddingHorizontal: theme.spacing.small,
    paddingVertical: theme.spacing.small,
    marginBottom: theme.spacing.small,
  },
  groupHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: theme.spacing.small,
    marginBottom: theme.spacing.small,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tile: {
    width: '48%',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderRadius: theme.borderRadius,
    padding: theme.spacing.small,
    marginBottom: theme.spacing.small,
  },
  tileTaken: {
    backgroundColor: theme.colors.raised,
  },
  tileName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  tileButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: theme.spacing.small,
  },
  stepButton: {
    width: 34,
    height: 34,
    borderRadius: theme.borderRadius,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  tileCount: {
    color: theme.colors.dim,
    fontSize: 18,
    fontWeight: 'bold',
    minWidth: 34,
    textAlign: 'center',
  },
  card: {
    backgroundColor: theme.colors.raised,
    borderWidth: 1,
    borderRadius: theme.borderRadius,
    padding: theme.spacing.small,
    marginBottom: theme.spacing.small,
  },
  cardName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: theme.spacing.small,
  },
  cardText: {
    color: theme.colors.text,
  },
  cardAction: {
    color: theme.colors.dim,
    marginTop: theme.spacing.small,
  },
  cardClose: {
    color: theme.colors.primary,
    marginTop: theme.spacing.small,
    fontWeight: 'bold',
  },
});
