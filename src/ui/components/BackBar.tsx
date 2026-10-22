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
// The whole bar row is a 48dp target, including the side padding.
export const BackBar: React.FC<Props> = ({ label }) => {
  const { t, rtl } = useI18n();
  const title = label ?? t('ui.common.back');

  return (
    <View style={styles.bar}>
      <TouchableOpacity
        style={styles.button}
        onPress={leaveScreen}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={title}
      >
        <Text style={styles.text}>
          {rtl ? '›' : '‹'} {title}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    backgroundColor: theme.colors.surface,
    minHeight: theme.touchTarget,
  },
  button: {
    minHeight: theme.touchTarget,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.medium,
  },
  text: {
    color: theme.colors.primary,
    fontSize: 17,
    fontWeight: '700',
  },
});
