import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '../text';
import { theme } from '../theme/colors';

interface Props {
  name: string;
  // Already-spaced inline tags, built from the player catalog.
  tags?: string;
  // The second line: a role, an alive/dead state, a connection.
  detail?: string;
  dead?: boolean;
  dotColor?: string;
  onRemove?: () => void;
  removeLabel?: string;
}

// One seat on a ledger: a small avatar, the name, and the one colour the table
// is allowed to know about that player.
export const RosterRow: React.FC<Props> = ({
  name,
  tags,
  detail,
  dead,
  dotColor,
  onRemove,
  removeLabel,
}) => (
  <View style={styles.row}>
    <View style={[styles.avatar, { borderColor: dotColor ?? theme.colors.success }]}>
      <Text style={styles.initial}>{(name.trim()[0] ?? '?').toUpperCase()}</Text>
      <View style={[styles.dot, { backgroundColor: dotColor ?? theme.colors.success }]} />
    </View>
    <View style={styles.body}>
      <Text style={[styles.name, dead && styles.dead]} numberOfLines={2}>
        {name}
        {tags ? <Text style={styles.tags}>{tags}</Text> : null}
      </Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
    {onRemove ? (
      <Pressable
        style={({ pressed }) => [styles.remove, pressed && styles.removePressed]}
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={removeLabel ?? 'Remove'}
      >
        <Ionicons name="trash-outline" size={17} color={theme.colors.danger} />
      </Pressable>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    backgroundColor: theme.colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: 12,
  },
  initial: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    bottom: -1,
    end: -1,
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  body: {
    flex: 1,
  },
  name: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  tags: {
    color: theme.colors.dim,
    fontSize: 12,
    fontWeight: '700',
  },
  detail: {
    color: theme.colors.dim,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 1,
  },
  dead: {
    color: theme.colors.dim,
    textDecorationLine: 'line-through',
  },
  remove: {
    width: theme.inlineTouchTarget,
    height: theme.inlineTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.tintDanger,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    marginStart: 10,
  },
  removePressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.8,
  },
});
