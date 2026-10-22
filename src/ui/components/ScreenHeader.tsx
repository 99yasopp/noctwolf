import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '../text';
import { theme } from '../theme/colors';
import { leaveScreen } from '../back';
import { useI18n } from '../i18n';

interface Props {
  title: string;
  meta?: string;
  backLabel?: string;
}

// The fixed top of every screen: one way back, the page name, and at most one
// line of table state. Scrolling is for content, never for navigation.
export const ScreenHeader: React.FC<Props> = ({ title, meta, backLabel }) => {
  const { t, rtl } = useI18n();
  const label = backLabel ?? t('ui.common.back');

  return (
    <View style={styles.bar}>
      <View style={styles.inner}>
        <TouchableOpacity
          style={styles.back}
          onPress={leaveScreen}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Ionicons
            name={rtl ? 'chevron-forward' : 'chevron-back'}
            size={24}
            color={theme.colors.primary}
          />
        </TouchableOpacity>
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
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  inner: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingStart: 4,
    paddingEnd: 16,
  },
  back: {
    width: theme.touchTarget,
    height: theme.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: {
    flex: 1,
    paddingVertical: 8,
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
