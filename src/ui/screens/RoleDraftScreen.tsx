import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../text';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { RoleSigil } from '../components/RoleSigil';
import { ScreenHeader } from '../components/ScreenHeader';
import { useBack } from '../back';
import { useResponsive } from '../layout';
import { DraftRole } from '../../engine/generatedRole';
import { useI18n } from '../i18n';
import { teamName } from '../../i18n';

interface Props {
  draft: DraftRole;
  onApprove: () => void;
  onReject: () => void;
}

export const RoleDraftScreen = ({ draft, onApprove, onReject }: Props) => {
  const { role, unsupported } = draft;
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { gutter } = useResponsive();

  // The draft keeps its own history entry, so leaving it returns to Settings
  // rather than closing the workshop.
  useBack(onReject);

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('ui.draft.title')} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: gutter, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View style={styles.card}>
          <View style={styles.head}>
            <RoleSigil roleId={role.id} name={role.name} team={role.team} size={64} />
            <Text style={styles.title}>{role.name}</Text>
          </View>
          <Text style={styles.text}>{t('ui.draft.team', { team: teamName(role.team) })}</Text>
          <Text style={styles.text}>{role.description}</Text>
        </View>

        <Text style={styles.subHeader}>{t('ui.draft.night')}</Text>
        {role.nightActions && role.nightActions.length > 0 ? (
          role.nightActions.map(action => (
            <Text key={action.id} style={styles.text}>
              {action.label}
              {action.oncePerGame ? ` ${t('ui.common.oncePerGame')}` : ''}
            </Text>
          ))
        ) : (
          <Text style={styles.hint}>{t('ui.draft.none')}</Text>
        )}

        {unsupported.length > 0 && (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>
              {t('ui.draft.unsupported', { parts: unsupported.join(', ') })}
            </Text>
          </View>
        )}

        <BaseButton title={t('ui.draft.approve')} onPress={onApprove} />
        <BaseButton title={t('ui.draft.reject')} onPress={onReject} variant="danger" />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingVertical: theme.spacing.medium,
  },
  card: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.large,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.large,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 4,
  },
  title: {
    flex: 1,
    fontSize: 24,
    lineHeight: 30,
    color: theme.colors.primary,
    fontWeight: '900',
  },
  text: {
    color: theme.colors.text,
    fontSize: theme.type.body,
    lineHeight: 22,
    marginTop: theme.spacing.small,
  },
  subHeader: {
    fontSize: theme.type.section,
    color: theme.colors.text,
    fontWeight: '800',
    marginBottom: theme.spacing.small,
  },
  hint: {
    color: theme.colors.dim,
    fontSize: theme.type.small,
    marginBottom: theme.spacing.small,
  },
  warningCard: {
    backgroundColor: theme.colors.tintDanger,
    padding: theme.spacing.medium,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    marginTop: theme.spacing.medium,
  },
  warningText: {
    color: theme.colors.text,
    fontSize: 14,
  },
});
