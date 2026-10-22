import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '../text';
import { theme } from '../theme/colors';
import { useI18n } from '../i18n';
import { Sheet } from './Sheet';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  visible: boolean;
  onClose: () => void;
  onRules: () => void;
  onSettings: () => void;
}

const Row: React.FC<{
  icon: IconName;
  label: string;
  onPress: () => void;
}> = ({ icon, label, onPress }) => {
  const { rtl } = useI18n();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.iconSeat}>
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
      </View>
      <Text style={styles.label}>{label}</Text>
      <Ionicons
        name={rtl ? 'chevron-back' : 'chevron-forward'}
        size={18}
        color={theme.colors.dim}
      />
    </Pressable>
  );
};

// The quiet door out of the play space. Rules and settings are here, not in
// the middle of the table.
export const TableMenu: React.FC<Props> = ({ visible, onClose, onRules, onSettings }) => {
  const { t } = useI18n();

  return (
    <Sheet visible={visible} onClose={onClose} title={t('ui.common.menu')}>
      <Row icon="book-outline" label={t('ui.rules.title')} onPress={onRules} />
      <Row icon="options-outline" label={t('ui.settings.title')} onPress={onSettings} />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: theme.radius.control,
  },
  pressed: {
    backgroundColor: theme.colors.highlight,
    transform: [{ scale: 0.99 }],
  },
  iconSeat: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(246,198,103,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
