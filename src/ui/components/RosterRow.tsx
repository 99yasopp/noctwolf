import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
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

// One seat on a ledger, not a card. The dot carries the only colour the table
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
    <View style={[styles.dot, { backgroundColor: dotColor ?? theme.colors.success }]} />
    <View style={styles.body}>
      <Text style={[styles.name, dead && styles.dead]} numberOfLines={2}>
        {name}
        {tags ? <Text style={styles.tags}>{tags}</Text> : null}
      </Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
    {onRemove ? (
      <TouchableOpacity
        style={styles.remove}
        onPress={onRemove}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={removeLabel ?? 'Remove'}
      >
        <Text style={styles.removeText}>{removeLabel ?? 'Remove'}</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginEnd: 12,
  },
  body: {
    flex: 1,
  },
  name: {
    color: theme.colors.text,
    fontSize: theme.type.body,
    fontWeight: '600',
  },
  tags: {
    color: theme.colors.dim,
    fontSize: 13,
    fontWeight: '600',
  },
  detail: {
    color: theme.colors.dim,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 1,
  },
  dead: {
    color: theme.colors.dim,
    textDecorationLine: 'line-through',
  },
  remove: {
    minWidth: theme.inlineTouchTarget,
    minHeight: theme.inlineTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    borderRadius: 8,
    marginStart: 12,
  },
  removeText: {
    color: theme.colors.danger,
    fontSize: theme.type.label,
    fontWeight: '700',
  },
});
