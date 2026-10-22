import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '../text';
import { theme, teamColor } from '../theme/colors';
import { useResponsive } from '../layout';
import { useI18n } from '../i18n';
import { RoleSigil } from './RoleSigil';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface PlayerSeat {
  id: string;
  name: string;
  isAlive: boolean;
  roleId?: string | null;
  role?: string | null;
  roleTeam?: string;
  accent?: string;
  badge?: string;
  badgeIcon?: IconName;
  badgeTone?: string;
  self?: boolean;
  pack?: boolean;
  blocked?: boolean;
  selected?: boolean;
  onPress?: () => void;
}

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0] ?? '')
    .join('')
    .toUpperCase() || '?';

const PlayerTile: React.FC<{ seat: PlayerSeat; width: number }> = ({ seat, width }) => {
  const { t } = useI18n();
  const accent = seat.accent ?? (seat.roleTeam ? teamColor(seat.roleTeam) : theme.colors.secondary);
  const dead = !seat.isAlive;

  const body = (
    <>
      <View style={styles.top}>
        <View
          style={[
            styles.avatar,
            { borderColor: seat.selected ? theme.colors.primary : accent },
            dead && styles.avatarDead,
          ]}
        >
          <Text style={[styles.initials, dead && styles.deadText]}>{initials(seat.name)}</Text>
        </View>
        {seat.roleId || seat.pack ? (
          <View style={styles.roleBadge}>
            {seat.roleId ? (
              <RoleSigil
                roleId={seat.roleId}
                team={seat.roleTeam ?? 'Village'}
                size={28}
                muted={dead}
              />
            ) : (
              <View style={[styles.packBadge, dead && styles.deadBadge]}>
                <Ionicons name="paw" size={14} color={theme.colors.danger} />
              </View>
            )}
          </View>
        ) : null}
        {seat.self ? <View style={styles.selfDot} /> : null}
      </View>

      <Text style={[styles.name, dead && styles.deadText]} numberOfLines={2}>
        {seat.name}
      </Text>

      <View style={styles.statusRow}>
        {dead ? (
          <>
            <Ionicons name="skull-outline" size={12} color={theme.colors.dim} />
            <Text style={styles.deadLabel} numberOfLines={1}>
              {seat.badge ?? t('ui.common.dead')}
            </Text>
          </>
        ) : seat.badge ? (
          <>
            <Ionicons
              name={seat.badgeIcon ?? 'ellipse'}
              size={12}
              color={seat.badgeTone ?? theme.colors.secondary}
            />
            <Text style={[styles.badge, { color: seat.badgeTone ?? theme.colors.secondary }]} numberOfLines={1}>
              {seat.badge}
            </Text>
          </>
        ) : (
          <>
            <View style={[styles.liveDot, { backgroundColor: accent }]} />
            <Text style={styles.liveLabel}>{t('ui.host.aliveTag')}</Text>
          </>
        )}
      </View>
    </>
  );

  if (!seat.onPress) {
    return <View style={[styles.tile, { width }]}>{body}</View>;
  }

  return (
    <Pressable
      onPress={seat.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${seat.name}, ${
        seat.isAlive ? t('ui.host.aliveTag') : t('ui.common.dead')
      }${seat.badge ? `, ${seat.badge}` : ''}`}
      accessibilityState={{ selected: !!seat.selected, disabled: !!seat.blocked }}
      disabled={seat.blocked}
      style={({ pressed }) => [
        styles.tile,
        { width },
        seat.selected && styles.selected,
        seat.blocked && styles.blocked,
        pressed && !seat.blocked && styles.pressed,
      ]}
    >
      {body}
    </Pressable>
  );
};

export const PlayerGrid: React.FC<{ seats: PlayerSeat[] }> = ({ seats }) => {
  const { playerColumns, gap } = useResponsive();
  const [width, setWidth] = useState(0);
  const tileWidth = width
    ? Math.floor((width - gap * (playerColumns - 1)) / playerColumns)
    : 0;

  return (
    <View
      style={[styles.grid, { gap }]}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
    >
      {tileWidth > 0
        ? seats.map(seat => <PlayerTile key={seat.id} seat={seat} width={tileWidth} />)
        : null}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: {
    minHeight: 126,
    padding: 11,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: theme.shadow.color,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 9,
    elevation: 2,
  },
  selected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.raised,
  },
  blocked: {
    opacity: 0.45,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: theme.colors.raised,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minHeight: 46,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    backgroundColor: theme.colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDead: {
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.base,
  },
  initials: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  roleBadge: {
    marginTop: -3,
    marginEnd: -3,
  },
  packBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.tintDanger,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deadBadge: {
    borderColor: theme.colors.border,
    opacity: 0.6,
  },
  selfDot: {
    position: 'absolute',
    top: 2,
    start: 2,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
  },
  name: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 9,
  },
  deadText: {
    color: theme.colors.dim,
    textDecorationLine: 'line-through',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
    minHeight: 16,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveLabel: {
    color: theme.colors.dim,
    fontSize: 11,
    fontWeight: '700',
  },
  deadLabel: {
    color: theme.colors.dim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  badge: {
    fontSize: 11,
    fontWeight: '800',
    flexShrink: 1,
  },
});
