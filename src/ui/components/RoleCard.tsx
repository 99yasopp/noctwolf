import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../text';
import { theme } from '../theme/colors';
import { roleDescription, roleName, teamOf } from '../../i18n';
import { useI18n } from '../i18n';

export interface RoleCardData {
  id: string;
  name: string;
  team: string;
  description: string;
}

interface Props {
  role: RoleCardData | null;
  hidden?: boolean;
  onShow?: () => void;
  onHide?: () => void;
  emptyLabel?: string;
  extra?: string;
}

// The one card on the table. Gold, with an ink edge and a team seal; every
// other surface on the Play screen is a hairline, so this reads first.
export const RoleCard: React.FC<Props> = ({
  role,
  hidden,
  onShow,
  onHide,
  emptyLabel,
  extra,
}) => {
  const { t } = useI18n();

  if (hidden) {
    return (
      <View style={[styles.card, styles.covered]}>
        <Text style={styles.coveredLabel}>{t('ui.play.yourRole')}</Text>
        {onShow ? (
          <TouchableOpacity
            style={styles.reveal}
            onPress={onShow}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('ui.play.showRole')}
          >
            <Text style={styles.revealText}>{t('ui.play.showRole')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.label}>{t('ui.play.yourRole')}</Text>
        {role ? (
          <View style={styles.seal}>
            <Text style={styles.sealText}>{teamOf(role.team)}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.name}>
        {role ? roleName(role.id, role.name) : emptyLabel ?? '...'}
      </Text>
      {role ? (
        <Text style={styles.description}>{roleDescription(role.id, role.description)}</Text>
      ) : null}
      {extra ? (
        <View style={styles.extra}>
          <Text style={styles.extraText}>{extra}</Text>
        </View>
      ) : null}
      {role && onHide ? (
        <TouchableOpacity
          style={styles.hide}
          onPress={onHide}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('ui.play.hideRole')}
        >
          <Text style={styles.hideText}>{t('ui.play.hideRole')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const inksoft = 'rgba(15, 23, 42, 0.3)';

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: inksoft,
    borderRadius: 6,
    padding: theme.spacing.large,
    marginBottom: theme.spacing.medium,
  },
  covered: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.primary,
    alignItems: 'center',
    paddingVertical: 24,
  },
  coveredLabel: {
    color: theme.colors.primary,
    fontSize: theme.type.label,
    fontWeight: '800',
  },
  reveal: {
    minHeight: theme.touchTarget,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: 'center',
    marginTop: 12,
  },
  revealText: {
    color: theme.colors.primary,
    fontSize: theme.type.body,
    fontWeight: '800',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    color: theme.colors.background,
    fontSize: theme.type.label,
    fontWeight: '800',
  },
  seal: {
    backgroundColor: theme.colors.background,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sealText: {
    color: theme.colors.primary,
    fontSize: theme.type.label,
    fontWeight: '800',
  },
  name: {
    color: theme.colors.background,
    fontSize: theme.type.hero,
    lineHeight: 36,
    fontWeight: '900',
    marginTop: 8,
  },
  description: {
    color: theme.colors.background,
    fontSize: theme.type.body,
    lineHeight: 22,
    marginTop: 8,
  },
  extra: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.28)',
    marginTop: 12,
    paddingTop: 10,
  },
  extraText: {
    color: theme.colors.background,
    fontSize: theme.type.small,
    lineHeight: 20,
    fontWeight: '600',
  },
  hide: {
    alignSelf: 'flex-end',
    minHeight: theme.inlineTouchTarget,
    justifyContent: 'center',
    marginTop: 6,
  },
  hideText: {
    color: theme.colors.background,
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
