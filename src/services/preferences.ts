import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { RoleSetup, migrateSetup } from '../engine/setup';
import { Language } from '../i18n';

// Small conveniences that should survive a restart: the address of the last
// host, the setup this host likes, and the language this device reads.
// Kept in one record so a single read covers the whole screen.

export interface Preferences {
  lastHost: string;
  // The composition the host built by hand, so the next evening opens on it.
  setup: RoleSetup | null;
  // English unless this device chose otherwise: a phone joins a table it did
  // not set up, and English is the one language most tables share.
  language: Language;
}

const STORAGE_KEY = 'preferences';

const defaults: Preferences = { lastHost: '', setup: null, language: 'en' };

// expo-secure-store has no web implementation, so the web build works from
// memory instead of throwing.
let memory: Preferences = { ...defaults };
// A save can arrive before the first read has come back; merging into the
// defaults then would wipe the host address that is already on disk.
let loaded = false;

export const loadPreferences = async (): Promise<Preferences> => {
  if (Platform.OS === 'web') {
    loaded = true;
    return memory;
  }

  try {
    const stored = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!stored) {
      loaded = true;
      return { ...defaults };
    }

    const parsed = JSON.parse(stored);
    const merged = { ...defaults, ...(parsed ?? {}) };
    // A setup written before the rules moved into one record keeps its own.
    if (merged.setup) merged.setup = migrateSetup(merged.setup);

    memory = merged;
    loaded = true;
    return merged;
  } catch (error) {
    console.error('Could not read the saved preferences', error);
    loaded = true;
    return { ...defaults };
  }
};

export const savePreferences = async (patch: Partial<Preferences>) => {
  if (!loaded) await loadPreferences();

  const merged = { ...memory, ...patch };
  memory = merged;

  if (Platform.OS === 'web') return;

  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(merged));
  } catch (error) {
    console.error('Could not save the preferences', error);
  }
};
