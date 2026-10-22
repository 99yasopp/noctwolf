import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../text';
import { theme } from '../theme/colors';
import { leaveScreen } from '../back';
import { useI18n } from '../i18n';

interface Props {
  label?: string;
}

// The way out of a screen, always on top so nothing has to be scrolled. It
// calls leaveScreen, so the screen has to register its own action with useBack.
export const BackBar: React.FC<Props> = ({ label }) => {
  const { t, rtl } = useI18n();

  return (
    <View style={styles.bar}>
      <TouchableOpacity
        onPress={leaveScreen}
        activeOpacity={0.7}
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.text}>
          {rtl ? '›' : '‹'} {label ?? t('ui.common.back')}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.small,
    paddingHorizontal: theme.spacing.medium,
  },
  text: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
