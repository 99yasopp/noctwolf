import React, { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '../text';
import { theme } from '../theme/colors';
import { Glass } from './Glass';

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
// The open one is a gold notch and a soft seat, not a wall of tabs.
export const TabBar: React.FC<Props> = ({ tabs, active, onSelect }) => {
  const [shown, setShown] = useState(true);
  const insets = useSafeAreaInsets();

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
    <Glass style={styles.bar}>
      <View style={[styles.rail, { paddingBottom: Math.max(insets.bottom, 6) }]}>
        {tabs.map(tab => {
          const selected = tab.id === active;
          const [filled, outline] = icons[tab.id] ?? ['ellipse', 'ellipse-outline'];
          return (
            <Pressable
              key={tab.id}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
              onPress={() => onSelect(tab.id)}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected }}
            >
              <View style={[styles.notch, selected && styles.notchActive]} />
              <View style={[styles.iconSeat, selected && styles.iconSeatActive]}>
                <Ionicons
                  name={selected ? filled : outline}
                  size={20}
                  color={selected ? theme.colors.primary : theme.colors.dim}
                />
              </View>
              <Text style={[styles.label, selected && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Glass>
  );
};

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  rail: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    flexDirection: 'row',
    paddingTop: 5,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 4,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  notch: {
    width: 24,
    height: 3,
    borderRadius: 2,
    marginBottom: 3,
    backgroundColor: 'transparent',
  },
  notchActive: {
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.7,
    shadowRadius: 6,
    elevation: 3,
  },
  iconSeat: {
    width: 34,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSeatActive: {
    backgroundColor: 'rgba(246,198,103,0.12)',
  },
  label: {
    color: theme.colors.dim,
    fontWeight: '700',
    fontSize: 11,
  },
  labelActive: {
    color: theme.colors.primary,
  },
});
