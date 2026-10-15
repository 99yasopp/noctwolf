import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { DraftRole } from '../../engine/generatedRole';

interface Props {
  draft: DraftRole;
  onApprove: () => void;
  onReject: () => void;
}

export const RoleDraftScreen = ({ draft, onApprove, onReject }: Props) => {
  const { role, unsupported } = draft;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Review the proposed role</Text>

      <View style={styles.card}>
        <Text style={styles.title}>{role.name}</Text>
        <Text style={styles.text}>Team: {role.team}</Text>
        <Text style={styles.text}>{role.description}</Text>
      </View>

      <Text style={styles.subHeader}>What it can do at night</Text>
      {role.nightActions && role.nightActions.length > 0 ? (
        role.nightActions.map(action => (
          <Text key={action.id} style={styles.text}>
            {action.label}
            {action.oncePerGame ? ' (once per game)' : ''}
          </Text>
        ))
      ) : (
        <Text style={styles.hint}>
          Nothing: this role only votes and talks. That is a villager.
        </Text>
      )}

      {unsupported.length > 0 && (
        <View style={styles.warningCard}>
          <Text style={styles.warningText}>
            This game cannot run: {unsupported.join(', ')}. Those parts are dropped.
          </Text>
        </View>
      )}

      <BaseButton title="Approve & Save" onPress={onApprove} />
      <BaseButton title="Reject" onPress={onReject} variant="danger" />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.medium,
    paddingBottom: theme.spacing.large,
  },
  header: {
    fontSize: 24,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.large,
  },
  card: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.large,
    borderRadius: theme.borderRadius,
    marginBottom: theme.spacing.large,
  },
  title: {
    fontSize: 20,
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  text: {
    color: theme.colors.text,
    fontSize: 16,
    marginTop: theme.spacing.small,
  },
  subHeader: {
    fontSize: 18,
    color: theme.colors.text,
    fontWeight: 'bold',
    marginBottom: theme.spacing.small,
  },
  hint: {
    color: '#888',
    fontSize: 14,
    marginBottom: theme.spacing.small,
  },
  warningCard: {
    backgroundColor: '#3A1E24',
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    marginTop: theme.spacing.medium,
  },
  warningText: {
    color: theme.colors.text,
    fontSize: 14,
  },
});
