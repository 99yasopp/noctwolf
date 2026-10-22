import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../text';
import { theme, teamColor } from '../theme/colors';
import { PlayableRole } from '../../engine/roleSet';
import { actionLabel, roleDescription, roleName, teamName } from '../../i18n';
import { useI18n } from '../i18n';
import { useResponsive } from '../layout';
import { RoleSigil } from './RoleSigil';

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
  const { roleColumns } = useResponsive();
  const [openRole, setOpenRole] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [width, setWidth] = useState(0);
  const gap = 8;
  const tileWidth = width ? Math.floor((width - gap * (roleColumns - 1)) / roleColumns) : 0;

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
          <View style={styles.cardHead}>
            <RoleSigil roleId={open.id} name={open.name} team={open.team} size={44} />
            <Text style={[styles.cardName, { color: teamColor(open.team) }]}>
              {roleName(open.id, open.name)} — {teamName(open.team)}
            </Text>
          </View>
          <Text style={styles.cardText}>
            {roleDescription(open.id, open.description)}
          </Text>
          {open.nightActions?.map(action => (
            <Text key={action.id} style={styles.cardAction}>
              • {actionLabel(open.id, action.id, action.label)}
            </Text>
          ))}
          <Pressable
            style={({ pressed }) => [styles.cardCloseButton, pressed && styles.pressed]}
            onPress={() => setOpenRole(null)}
            accessibilityRole="button"
          >
            <Text style={styles.cardClose}>{t('ui.grid.close')}</Text>
          </Pressable>
        </View>
      )}

      <View
        style={styles.gridHost}
        onLayout={event => setWidth(event.nativeEvent.layout.width)}
      >
        {groups.map(group => (
          <View key={group.team}>
            <Text style={[styles.groupHeader, { color: teamColor(group.team) }]}>
              {group.team === OTHER ? t('ui.grid.otherSides') : teamName(group.team)}
            </Text>
            <View style={[styles.grid, { gap }]}>
              {group.roles.map(role => {
                const count = counts[role.id] ?? 0;
                const colour = teamColor(role.team);

                return (
                  <View
                    key={role.id}
                    style={[
                      styles.tile,
                      { borderColor: colour, width: tileWidth || '48%' },
                      count > 0 && styles.tileTaken,
                    ]}
                  >
                    <Pressable
                      style={({ pressed }) => [styles.tileNameButton, pressed && styles.pressed]}
                      onPress={() => setOpenRole(role.id === openRole ? null : role.id)}
                      accessibilityRole="button"
                    >
                      <RoleSigil
                        roleId={role.id}
                        name={role.name}
                        team={role.team}
                        size={34}
                        muted={count === 0}
                      />
                      <Text style={styles.tileName} numberOfLines={2}>
                        {roleName(role.id, role.name)}
                      </Text>
                    </Pressable>
                    <View style={styles.tileButtons}>
                      <Pressable
                        style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
                        onPress={() => step(role.id, -1)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.stepText}>−</Text>
                      </Pressable>
                      <Text style={[styles.tileCount, count > 0 && { color: colour }]}>
                        {count}
                      </Text>
                      <Pressable
                        style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
                        onPress={() => step(role.id, 1)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.stepText}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  search: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.fieldBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: theme.touchTarget,
    marginBottom: theme.spacing.small,
  },
  groupHeader: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: theme.spacing.small,
    marginBottom: theme.spacing.small,
  },
  gridHost: {
    width: '100%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  tile: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderRadius: theme.radius.card,
    padding: 10,
    marginBottom: 4,
    minHeight: 118,
    justifyContent: 'space-between',
  },
  tileTaken: {
    backgroundColor: theme.colors.raised,
  },
  tileNameButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: theme.radius.control,
  },
  tileName: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    flex: 1,
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
    borderRadius: theme.inlineTouchTarget / 2,
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
    minWidth: 28,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
  card: {
    backgroundColor: theme.colors.raised,
    borderWidth: 1,
    borderRadius: theme.radius.card,
    padding: theme.spacing.medium,
    marginBottom: theme.spacing.small,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: theme.spacing.small,
  },
  cardName: {
    flex: 1,
    fontSize: theme.type.card,
    fontWeight: '800',
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
