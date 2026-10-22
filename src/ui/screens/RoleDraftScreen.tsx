import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text } from '../text';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { ScreenHeader } from '../components/ScreenHeader';
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

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('ui.draft.title')} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>{role.name}</Text>
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
    backgroundColor: theme.colors.background,
  },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    padding: theme.spacing.medium,
    paddingBottom: theme.spacing.large,
  },
  card: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.large,
    borderRadius: theme.borderRadius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.large,
  },
  title: {
    fontSize: 22,
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
    borderRadius: theme.borderRadius,
    marginTop: theme.spacing.medium,
  },
  warningText: {
    color: theme.colors.text,
    fontSize: 14,
  },
});
