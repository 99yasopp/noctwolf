import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, TextInput } from '../text';
import { theme, teamColor } from '../theme/colors';
import { PlayableRole } from '../../engine/roleSet';
import { actionLabel, roleDescription, roleName, teamName } from '../../i18n';
import { useI18n } from '../i18n';

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
  const { t } = useI18n();
  const [openRole, setOpenRole] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  // The host searches in the words he sees; the name the card was dealt with
  // stays searchable too, in case it is the one he remembers.
  const shown = query
    ? roles.filter(role =>
        `${roleName(role.id, role.name)} ${role.name}`.toLowerCase().includes(query),
      )
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
        placeholder={t('ui.grid.search')}
        placeholderTextColor={theme.colors.dim}
      />

      {open && (
        <View style={[styles.card, { borderColor: teamColor(open.team) }]}>
          <Text style={[styles.cardName, { color: teamColor(open.team) }]}>
            {roleName(open.id, open.name)} — {teamName(open.team)}
          </Text>
          <Text style={styles.cardText}>
            {roleDescription(open.id, open.description)}
          </Text>
          {open.nightActions?.map(action => (
            <Text key={action.id} style={styles.cardAction}>
              • {actionLabel(open.id, action.id, action.label)}
            </Text>
          ))}
          <TouchableOpacity
            style={styles.cardCloseButton}
            onPress={() => setOpenRole(null)}
            activeOpacity={0.75}
            accessibilityRole="button"
          >
            <Text style={styles.cardClose}>{t('ui.grid.close')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {groups.map(group => (
        <View key={group.team}>
          <Text style={[styles.groupHeader, { color: teamColor(group.team) }]}>
            {group.team === OTHER ? t('ui.grid.otherSides') : teamName(group.team)}
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
                    style={styles.tileNameButton}
                    onPress={() => setOpenRole(role.id === openRole ? null : role.id)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                  >
                    <Text style={styles.tileName}>{roleName(role.id, role.name)}</Text>
                  </TouchableOpacity>
                  <View style={styles.tileButtons}>
                    <TouchableOpacity
                      style={styles.stepButton}
                      onPress={() => step(role.id, -1)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                    >
                      <Text style={styles.stepText}>−</Text>
                    </TouchableOpacity>
                    <Text style={[styles.tileCount, count > 0 && { color: colour }]}>
                      {count}
                    </Text>
                    <TouchableOpacity
                      style={styles.stepButton}
                      onPress={() => step(role.id, 1)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
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
    borderWidth: 1,
    borderColor: theme.colors.fieldBorder,
    paddingHorizontal: theme.spacing.small,
    paddingVertical: theme.spacing.small,
    minHeight: theme.inlineTouchTarget,
    marginBottom: theme.spacing.small,
  },
  groupHeader: {
    fontSize: 17,
    fontWeight: '800',
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
  tileNameButton: {
    minHeight: theme.inlineTouchTarget,
    justifyContent: 'center',
  },
  tileName: {
    color: theme.colors.text,
    fontSize: theme.type.body,
    fontWeight: '700',
  },
  tileButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: theme.spacing.small,
  },
  stepButton: {
    width: theme.inlineTouchTarget,
    height: theme.inlineTouchTarget,
    borderRadius: theme.borderRadius,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  tileCount: {
    color: theme.colors.dim,
    fontSize: 18,
    fontWeight: '800',
    minWidth: 32,
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
    fontSize: theme.type.card,
    fontWeight: '800',
    marginBottom: theme.spacing.small,
  },
  cardText: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  cardAction: {
    color: theme.colors.dim,
    fontSize: theme.type.small,
    marginTop: theme.spacing.small,
  },
  cardCloseButton: {
    minHeight: theme.inlineTouchTarget,
    justifyContent: 'center',
  },
  cardClose: {
    color: theme.colors.primary,
    marginTop: theme.spacing.small,
    fontSize: theme.type.body,
    fontWeight: '800',
  },
});
