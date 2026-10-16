import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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
// the same four doors, whatever happens to be behind them.
export const TabBar: React.FC<Props> = ({ tabs, active, onSelect }) => (
  <View style={styles.bar}>
    {tabs.map(tab => (
      <TouchableOpacity
        key={tab.id}
        style={[styles.tab, tab.id === active && styles.tabActive]}
        onPress={() => onSelect(tab.id)}
        activeOpacity={0.7}
      >
        <Text style={[styles.label, tab.id === active && styles.labelActive]}>
          {tab.label}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
);

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    marginBottom: theme.spacing.medium,
    padding: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.spacing.small,
    borderRadius: theme.borderRadius,
  },
  tabActive: {
    backgroundColor: theme.colors.raised,
  },
  label: {
    color: theme.colors.dim,
    fontWeight: '600',
  },
  labelActive: {
    color: theme.colors.text,
  },
});
