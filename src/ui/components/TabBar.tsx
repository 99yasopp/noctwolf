import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '../text';
import { theme } from '../theme/colors';

export interface TabDef {
  id: string;
  label: string;
}

interface Props {
  // Only the tabs this player has: a guest with no pack sees no chat tab.
  tabs: TabDef[];
  active: string;
  onSelect: (id: string) => void;
}

// One bar for the whole game: the host's dashboard and every player phone show
// the same four doors, whatever happens to be behind them. Each door is a full
// 48dp target, and the open one is marked in gold rather than by fill alone.
export const TabBar: React.FC<Props> = ({ tabs, active, onSelect }) => (
  <View style={styles.bar}>
    {tabs.map(tab => {
      const selected = tab.id === active;
      return (
        <TouchableOpacity
          key={tab.id}
          style={[styles.tab, selected && styles.tabActive]}
          onPress={() => onSelect(tab.id)}
          activeOpacity={0.75}
          accessibilityRole="tab"
          accessibilityState={{ selected }}
        >
          <Text style={[styles.label, selected && styles.labelActive]}>{tab.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    marginBottom: theme.spacing.medium,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    minHeight: theme.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: theme.borderRadius - 4,
  },
  tabActive: {
    backgroundColor: theme.colors.raised,
  },
  label: {
    color: theme.colors.dim,
    fontWeight: '700',
    fontSize: 13,
  },
  labelActive: {
    color: theme.colors.primary,
  },
});
