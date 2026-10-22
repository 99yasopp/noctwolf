import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '../text';
import { theme } from '../theme/colors';
import { useI18n } from '../i18n';

interface Props {
  roleName?: string;
  hidden?: boolean;
  emptyLabel?: string;
  onPress: () => void;
}

// The way into the private card. The role name is only on the face when the
// phone has already chosen to show it.
export const RoleBar: React.FC<Props> = ({ roleName, hidden, emptyLabel, onPress }) => {
  const { t, rtl } = useI18n();
  const value = !roleName
    ? emptyLabel ?? t('ui.play.waitingStart')
    : hidden
    ? t('ui.play.showRole')
    : roleName;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('ui.play.yourRole')}
      style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
    >
      <View style={styles.seal}>
        <Ionicons
          name={hidden || !roleName ? 'eye-off-outline' : 'shield-checkmark-outline'}
          size={19}
          color={theme.colors.primary}
        />
      </View>
      <View style={styles.body}>
        <Text style={styles.label}>{t('ui.play.yourRole')}</Text>
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Ionicons
        name={rtl ? 'chevron-back' : 'chevron-forward'}
        size={18}
        color={theme.colors.dim}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  bar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 14,
  },
  pressed: {
    backgroundColor: theme.colors.raised,
    transform: [{ scale: 0.99 }],
  },
  seal: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(246,198,103,0.10)',
  },
  body: {
    flex: 1,
  },
  label: {
    color: theme.colors.dim,
    fontSize: 11,
    fontWeight: '700',
  },
  value: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 1,
  },
});
