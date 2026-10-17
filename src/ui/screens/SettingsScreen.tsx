import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { BackBar } from '../components/BackBar';
import { useBack } from '../back';
import { RoleDraftScreen } from './RoleDraftScreen';
import { PlayableRole } from '../../engine/roleSet';
import { DraftRole, translateGeneratedRole } from '../../engine/generatedRole';
import { loadCustomRoles, persistCustomRoles } from '../../services/customRoles';
import { generateCustomRole } from '../../services/aiGenerator';

interface Props {
  onBack: () => void;
}

export const SettingsScreen = ({ onBack }: Props) => {
  const [apiKey, setApiKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<DraftRole | null>(null);
  const [saved, setSaved] = useState<PlayableRole[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadCustomRoles().then(roles => setSaved(roles));

    if (Platform.OS !== 'web') {
      SecureStore.getItemAsync('openai_api_key').then(key => {
        if (key) setApiKey(key);
      });
    }
  }, []);

  // The phone's back gesture means what the screen's back control means: out
  // of a draft first, then out of the workshop.
  useBack(draft ? () => setDraft(null) : onBack);

  const saveKey = async () => {
    if (Platform.OS === 'web') {
      setStatus('The web build keeps no key. Roles generated there are not saved either.');
      return;
    }

    await SecureStore.setItemAsync('openai_api_key', apiKey);
    setStatus('Key saved.');
  };

  const generate = async () => {
    if (!prompt.trim()) {
      setError('Describe the role you want first.');
      return;
    }

    setError('');
    setStatus('Asking the model...');
    setBusy(true);

    try {
      const generated = await generateCustomRole(prompt.trim());
      const translated = translateGeneratedRole(generated);

      if (!translated.draft) {
        setError(translated.error ?? 'The answer could not be read as a role.');
        setStatus('');
        return;
      }

      setDraft(translated.draft);
      setStatus('');
    } catch (failure: any) {
      setError(failure?.message ?? 'The request failed.');
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!draft) return;

    // Approving the same name again replaces the old copy.
    const next = [...saved.filter(role => role.id !== draft.role.id), draft.role];
    setSaved(next);
    await persistCustomRoles(next);
    setDraft(null);
    setPrompt('');
    setStatus(`${draft.role.name} is saved. Pick the Custom setup in the lobby to deal it.`);
  };

  const remove = async (roleId: string) => {
    const next = saved.filter(role => role.id !== roleId);
    setSaved(next);
    await persistCustomRoles(next);
  };

  if (draft) {
    return (
      <RoleDraftScreen
        draft={draft}
        onApprove={approve}
        onReject={() => setDraft(null)}
      />
    );
  }

  return (
    <View style={styles.container}>
      <BackBar />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Advanced Settings</Text>

      <Text style={styles.text}>AI API key (needed to invent roles):</Text>
      <TextInput
        style={styles.input}
        placeholder="sk-..."
        placeholderTextColor="#666"
        value={apiKey}
        onChangeText={setApiKey}
        secureTextEntry
        autoCapitalize="none"
      />
      <BaseButton title="Save API Key" onPress={saveKey} variant="secondary" />

      <Text style={styles.subHeader}>Invent a role</Text>
      <Text style={styles.hint}>
        The model writes a role, this app checks that it can actually be played,
        and you decide whether to keep it.
      </Text>
      <TextInput
        style={[styles.input, styles.prompt]}
        placeholder="A wolf who can silence one player each night"
        placeholderTextColor="#666"
        value={prompt}
        onChangeText={setPrompt}
        multiline
      />
      <BaseButton
        title={busy ? 'Thinking...' : 'Generate a role'}
        onPress={generate}
      />

      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!status && <Text style={styles.hint}>{status}</Text>}

      <Text style={styles.subHeader}>Your roles</Text>
      {saved.length === 0 ? (
        <Text style={styles.hint}>None yet.</Text>
      ) : (
        saved.map(role => (
          <View key={role.id} style={styles.roleRow}>
            <View style={styles.roleInfo}>
              <Text style={styles.roleName}>
                {role.name} ({role.team})
              </Text>
              <Text style={styles.hint}>
                {role.nightActions?.map(action => action.label).join(', ') ||
                  'No night action'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => remove(role.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.removeText}>Delete</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

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
    padding: theme.spacing.medium,
    paddingBottom: theme.spacing.large,
  },
  header: {
    fontSize: 24,
    color: theme.colors.text,
    marginBottom: theme.spacing.medium,
  },
  subHeader: {
    fontSize: 18,
    color: theme.colors.text,
    fontWeight: 'bold',
    marginTop: theme.spacing.large,
    marginBottom: theme.spacing.small,
  },
  text: {
    color: theme.colors.text,
    marginBottom: theme.spacing.small,
  },
  hint: {
    color: '#888',
    fontSize: 13,
    marginBottom: theme.spacing.small,
  },
  input: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    marginBottom: theme.spacing.medium,
  },
  prompt: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  error: {
    color: theme.colors.danger,
    fontSize: 15,
    marginBottom: theme.spacing.small,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.small,
  },
  roleInfo: {
    flexShrink: 1,
  },
  roleName: {
    color: theme.colors.text,
    fontSize: 16,
  },
  removeButton: {
    paddingHorizontal: theme.spacing.small,
    paddingVertical: 4,
    borderRadius: theme.borderRadius,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    marginLeft: theme.spacing.small,
  },
  removeText: {
    color: theme.colors.danger,
    fontSize: 13,
  },
});
