import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';

export const RoleDraftScreen = ({ role, onApprove, onReject }: any) => {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Review Proposed Role</Text>
      
      <View style={styles.card}>
        <Text style={styles.title}>{role.name}</Text>
        <Text style={styles.text}>Team: {role.team}</Text>
        <Text style={styles.text}>Abilities: {role.abilities.length} defined</Text>
      </View>

      <BaseButton title="Approve & Save" onPress={onApprove} />
      <BaseButton title="Reject" onPress={onReject} variant="danger" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.medium,
    justifyContent: 'center',
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
  }
});
