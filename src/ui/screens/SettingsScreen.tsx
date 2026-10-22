import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Text, TextInput } from '../text';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { BackBar } from '../components/BackBar';
import { useBack } from '../back';
import { useI18n } from '../i18n';
import { LANGUAGES, teamName } from '../../i18n';
import { RoleDraftScreen } from './RoleDraftScreen';
import { PlayableRole } from '../../engine/roleSet';
import { DraftRole, translateGeneratedRole } from '../../engine/generatedRole';
import { loadCustomRoles, persistCustomRoles } from '../../services/customRoles';
import {
  AI_PROVIDERS,
  AiProvider,
  generateCustomRole,
  loadAiSettings,
  saveAiSettings,
} from '../../services/aiGenerator';

interface Props {
  onBack: () => void;
}

export const SettingsScreen = ({ onBack }: Props) => {
  const { t, language, setLanguage } = useI18n();
  const [apiKey, setApiKey] = useState('');
  // Both providers take an sk-… key, so the key alone cannot say which one it
  // belongs to: the player names the provider here.
  const [provider, setProvider] = useState<AiProvider>('deepseek');
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<DraftRole | null>(null);
  const [saved, setSaved] = useState<PlayableRole[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadCustomRoles().then(roles => setSaved(roles));

    if (Platform.OS !== 'web') {
      loadAiSettings().then(settings => {
        setProvider(settings.provider);
        if (settings.apiKey) setApiKey(settings.apiKey);
      });
    }
  }, []);

  // The phone's back gesture means what the screen's back control means: out
  // of a draft first, then out of the workshop.
  useBack(draft ? () => setDraft(null) : onBack);

  const saveKey = async () => {
    if (Platform.OS === 'web') {
      setStatus(t('ui.settings.webNoKey'));
      return;
    }

    await saveAiSettings(provider, apiKey);
    setStatus(t('ui.settings.keySaved'));
  };

  const generate = async () => {
    if (!prompt.trim()) {
      setError(t('ui.settings.needPrompt'));
      return;
    }

    setError('');
    setStatus(t('ui.settings.asking'));
    setBusy(true);

    try {
      const generated = await generateCustomRole(prompt.trim(), provider, apiKey);
      const translated = translateGeneratedRole(generated);

      if (!translated.draft) {
        setError(translated.error ?? t('ui.settings.unreadable'));
        setStatus('');
        return;
      }

      setDraft(translated.draft);
      setStatus('');
    } catch (failure: any) {
      setError(failure?.message ?? t('ui.settings.failed'));
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
    setStatus(t('ui.settings.saved', { name: draft.role.name }));
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
      <Text style={styles.header}>{t('ui.settings.title')}</Text>

      <Text style={styles.subHeader}>{t('ui.settings.language')}</Text>
      <Text style={styles.hint}>{t('ui.settings.languageHint')}</Text>
      {LANGUAGES.map(entry => (
        <BaseButton
          key={entry.id}
          title={entry.label}
          variant={language === entry.id ? 'primary' : 'secondary'}
          onPress={() => setLanguage(entry.id)}
        />
      ))}

      <Text style={styles.subHeader}>{t('ui.settings.provider')}</Text>
      {(['deepseek', 'openai'] as AiProvider[]).map(id => (
        <BaseButton
          key={id}
          title={AI_PROVIDERS[id].label}
          variant={provider === id ? 'primary' : 'secondary'}
          onPress={() => setProvider(id)}
        />
      ))}

      <Text style={styles.text}>
        {t('ui.settings.apiKeyFor', { provider: AI_PROVIDERS[provider].label })}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="sk-..."
        placeholderTextColor="#666"
        value={apiKey}
        onChangeText={setApiKey}
        secureTextEntry
        autoCapitalize="none"
      />
      <BaseButton title={t('ui.settings.saveKey')} onPress={saveKey} variant="secondary" />

      <Text style={styles.subHeader}>{t('ui.settings.invent')}</Text>
      <Text style={styles.hint}>{t('ui.settings.inventHint')}</Text>
      <TextInput
        style={[styles.input, styles.prompt]}
        placeholder={t('ui.settings.prompt')}
        placeholderTextColor="#666"
        value={prompt}
        onChangeText={setPrompt}
        multiline
      />
      <BaseButton
        title={busy ? t('ui.settings.thinking') : t('ui.settings.generate')}
        onPress={generate}
      />

      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!status && <Text style={styles.hint}>{status}</Text>}

      <Text style={styles.subHeader}>{t('ui.settings.yourRoles')}</Text>
      {saved.length === 0 ? (
        <Text style={styles.hint}>{t('ui.settings.noneYet')}</Text>
      ) : (
        saved.map(role => (
          <View key={role.id} style={styles.roleRow}>
            <View style={styles.roleInfo}>
              <Text style={styles.roleName}>
                {role.name} ({teamName(role.team)})
              </Text>
              <Text style={styles.hint}>
                {role.nightActions?.map(action => action.label).join(', ') ||
                  t('ui.settings.noNightAction')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => remove(role.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.removeText}>{t('ui.settings.delete')}</Text>
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
