import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';

export const SettingsScreen = () => {
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    // Load key on mount
    SecureStore.getItemAsync('openai_api_key').then(key => {
      if (key) setApiKey(key);
    });
  }, []);

  const saveKey = async () => {
    await SecureStore.setItemAsync('openai_api_key', apiKey);
    alert('API Key Saved Securely');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Advanced Settings</Text>
      <Text style={styles.text}>AI API Key (Optional):</Text>
      <TextInput
        style={styles.input}
        placeholder="sk-..."
        placeholderTextColor="#666"
        value={apiKey}
        onChangeText={setApiKey}
        secureTextEntry
      />
      <BaseButton title="Save API Key" onPress={saveKey} />
    </View>
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
    marginBottom: theme.spacing.medium,
  },
  text: {
    color: theme.colors.text,
    marginBottom: theme.spacing.small,
  },
  input: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    marginBottom: theme.spacing.medium,
  },
});
