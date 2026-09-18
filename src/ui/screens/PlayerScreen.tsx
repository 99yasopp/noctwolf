import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';

export const PlayerScreen = () => {
  const [notes, setNotes] = useState('');

  return (
    <ScrollView style={styles.container}>
      <View style={styles.roleCard}>
        <Text style={styles.roleLabel}>Your Role:</Text>
        <Text style={styles.roleName}>Villager</Text>
      </View>

      <Text style={styles.sectionHeader}>Private Notebook</Text>
      <TextInput
        style={styles.notebook}
        multiline
        placeholder="Write your suspicions here..."
        placeholderTextColor="#666"
        value={notes}
        onChangeText={setNotes}
      />

      <Text style={styles.sectionHeader}>Guess Tracker</Text>
      <View style={styles.guessGrid}>
        <Text style={styles.text}>Alice: Unknown</Text>
        <Text style={styles.text}>Bob: Likely Wolf</Text>
        <BaseButton title="Update Guesses" onPress={() => console.log('Edit guesses')} variant="secondary" />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.medium,
  },
  roleCard: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.large,
    borderRadius: theme.borderRadius,
    alignItems: 'center',
    marginBottom: theme.spacing.large,
  },
  roleLabel: {
    color: theme.colors.background,
    fontSize: 14,
  },
  roleName: {
    color: theme.colors.background,
    fontSize: 28,
    fontWeight: 'bold',
  },
  sectionHeader: {
    fontSize: 18,
    color: theme.colors.text,
    fontWeight: 'bold',
    marginVertical: theme.spacing.medium,
  },
  notebook: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  guessGrid: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
  },
  text: {
    color: theme.colors.text,
    fontSize: 16,
    marginBottom: theme.spacing.small,
  },
});
