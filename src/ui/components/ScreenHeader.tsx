import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '../text';
import { theme } from '../theme/colors';
import { leaveScreen } from '../back';
import { useI18n } from '../i18n';
import { Glass } from './Glass';

interface Props {
  title: string;
  meta?: string;
  backLabel?: string;
  onMenu?: () => void;
  menuLabel?: string;
  right?: React.ReactNode;
}

// The fixed top of every screen: one way back, the page name, and at most one
// line of table state. The surface runs under the status bar; the content is
// inset below the notch.
export const ScreenHeader: React.FC<Props> = ({
  title,
  meta,
  backLabel,
  onMenu,
  menuLabel,
  right,
}) => {
  const { t, rtl } = useI18n();
  const insets = useSafeAreaInsets();
  const label = backLabel ?? t('ui.common.back');

  return (
    <Glass style={styles.bar}>
      <View style={[styles.inner, { paddingTop: insets.top }]}>
        <Pressable
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          onPress={leaveScreen}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Ionicons
            name={rtl ? 'chevron-forward' : 'chevron-back'}
            size={24}
            color={theme.colors.primary}
          />
        </Pressable>

        <View style={styles.titles}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {meta ? (
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>

        {right}

        {onMenu ? (
          <Pressable
            style={({ pressed }) => [styles.menu, pressed && styles.pressed]}
            onPress={onMenu}
            accessibilityRole="button"
            accessibilityLabel={menuLabel ?? t('ui.common.more')}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.text} />
          </Pressable>
        ) : null}
      </View>
    </Glass>
  );
};

const styles = StyleSheet.create({
  bar: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  inner: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingStart: 4,
    paddingEnd: 8,
  },
  back: {
    width: theme.touchTarget,
    height: theme.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  pressed: {
    backgroundColor: theme.colors.highlight,
    transform: [{ scale: 0.95 }],
  },
  titles: {
    flex: 1,
    paddingVertical: 8,
    paddingStart: 2,
  },
  title: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  meta: {
    color: theme.colors.dim,
    fontSize: theme.type.label,
    fontWeight: '700',
    marginTop: 1,
  },
});
