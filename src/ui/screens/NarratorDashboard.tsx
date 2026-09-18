import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { useGame } from '../GameContext';

export const NarratorDashboard = () => {
  const game = useGame();

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Narrator Dashboard</Text>
      
      <View style={styles.statusCard}>
        <Text style={styles.statusText}>Current Phase: {game.state.currentPhase}</Text>
      </View>

      <View style={styles.controls}>
        <BaseButton title="Next Phase" onPress={() => game.transitionTo('Day')} />
        <BaseButton title="Elect President" onPress={() => game.transitionTo('Election')} variant="secondary" />
        <BaseButton title="Manage Punishments" onPress={() => console.log('Manage Punishments')} variant="danger" />
      </View>

      <Text style={styles.subHeader}>Player Status</Text>
      {/* Player List Grid will go here */}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.medium,
  },
  header: {
    fontSize: 24,
    color: theme.colors.text,
    fontWeight: 'bold',
    marginBottom: theme.spacing.medium,
  },
  statusCard: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    marginBottom: theme.spacing.medium,
  },
  statusText: {
    color: theme.colors.text,
    fontSize: 16,
    marginVertical: 4,
  },
  controls: {
    marginBottom: theme.spacing.large,
  },
  subHeader: {
    fontSize: 18,
    color: theme.colors.text,
    fontWeight: 'bold',
    marginTop: theme.spacing.medium,
  },
});
