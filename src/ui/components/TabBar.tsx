import React, { useEffect, useState } from 'react';
import { Keyboard, StyleSheet, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const icons: Record<string, [IconName, IconName]> = {
  play: ['moon', 'moon-outline'],
  info: ['book', 'book-outline'],
  notes: ['create', 'create-outline'],
  chat: ['chatbubble-ellipses', 'chatbubble-ellipses-outline'],
};

// The stations of the table, fixed to the bottom where a thumb already is.
// The open one is a gold notch over a gold mark, not a filled pill.
export const TabBar: React.FC<Props> = ({ tabs, active, onSelect }) => {
  const [shown, setShown] = useState(true);

  // A keyboard and a bottom rail fight for the same space. The rail steps out
  // while a field has focus, and comes back when it closes.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setShown(false));
    const hide = Keyboard.addListener('keyboardDidHide', () => setShown(true));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (!shown) return null;

  return (
    <View style={styles.bar}>
      <View style={styles.rail}>
        {tabs.map(tab => {
          const selected = tab.id === active;
          const [filled, outline] = icons[tab.id] ?? ['ellipse', 'ellipse-outline'];
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tab}
              onPress={() => onSelect(tab.id)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected }}
            >
              <View style={[styles.notch, selected && styles.notchActive]} />
              <Ionicons
                name={selected ? filled : outline}
                size={21}
                color={selected ? theme.colors.primary : theme.colors.dim}
              />
              <Text style={[styles.label, selected && styles.labelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingBottom: 6,
  },
  rail: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 4,
  },
  notch: {
    width: 28,
    height: 3,
    borderRadius: 2,
    marginBottom: 4,
    backgroundColor: 'transparent',
  },
  notchActive: {
    backgroundColor: theme.colors.primary,
  },
  label: {
    color: theme.colors.dim,
    fontWeight: '700',
    fontSize: theme.type.label,
  },
  labelActive: {
    color: theme.colors.primary,
  },
});
