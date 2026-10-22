import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '../text';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { RoleSigil } from '../components/RoleSigil';
import { ScreenHeader } from '../components/ScreenHeader';
import { useBack } from '../back';
import { useResponsive } from '../layout';
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
  const insets = useSafeAreaInsets();
  const { gutter } = useResponsive();
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
      <ScreenHeader title={t('ui.settings.title')} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: gutter, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >

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
        placeholderTextColor={theme.colors.dim}
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
        placeholderTextColor={theme.colors.dim}
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
            <RoleSigil roleId={role.id} name={role.name} team={role.team} size={38} />
            <View style={styles.roleInfo}>
              <Text style={styles.roleName}>
                {role.name} ({teamName(role.team)})
              </Text>
              <Text style={styles.hint}>
                {role.nightActions?.map(action => action.label).join(', ') ||
                  t('ui.settings.noNightAction')}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.removeButton, pressed && styles.removePressed]}
              onPress={() => remove(role.id)}
              accessibilityRole="button"
            >
              <Text style={styles.removeText}>{t('ui.settings.delete')}</Text>
            </Pressable>
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
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingVertical: theme.spacing.medium,
  },
  subHeader: {
    fontSize: theme.type.section,
    color: theme.colors.text,
    fontWeight: '800',
    marginTop: theme.spacing.large,
    marginBottom: theme.spacing.small,
  },
  text: {
    color: theme.colors.text,
    fontSize: theme.type.body,
    lineHeight: 22,
    marginBottom: theme.spacing.small,
  },
  hint: {
    color: theme.colors.dim,
    fontSize: theme.type.small,
    marginBottom: theme.spacing.small,
  },
  input: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    borderWidth: 1,
    borderColor: theme.colors.fieldBorder,
    fontSize: theme.type.body,
    minHeight: theme.touchTarget,
    marginBottom: theme.spacing.medium,
  },
  prompt: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  error: {
    color: theme.colors.danger,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: theme.spacing.small,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: theme.spacing.small,
    padding: 12,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  roleInfo: {
    flex: 1,
  },
  roleName: {
    color: theme.colors.text,
    fontSize: theme.type.body,
    fontWeight: '600',
  },
  removeButton: {
    minHeight: theme.inlineTouchTarget,
    minWidth: theme.inlineTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    marginLeft: theme.spacing.small,
  },
  removeText: {
    color: theme.colors.danger,
    fontSize: theme.type.small,
    fontWeight: '700',
  },
  removePressed: {
    backgroundColor: theme.colors.tintDanger,
    transform: [{ scale: 0.96 }],
  },
});
