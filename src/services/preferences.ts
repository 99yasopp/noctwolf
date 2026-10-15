import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Small conveniences that should survive a restart: the address of the last
// host, and the setup this host likes. Kept in one record so a single read
// covers the whole screen.

export interface Preferences {
  lastHost: string;
  presetId: string;
}

const STORAGE_KEY = 'preferences';

const defaults: Preferences = { lastHost: '', presetId: 'simple' };

// expo-secure-store has no web implementation, so the web build works from
// memory instead of throwing.
let memory: Preferences = { ...defaults };

export const loadPreferences = async (): Promise<Preferences> => {
  if (Platform.OS === 'web') return memory;

  try {
    const stored = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!stored) return { ...defaults };

    const parsed = JSON.parse(stored);
    const merged = { ...defaults, ...(parsed ?? {}) };

    memory = merged;
    return merged;
  } catch (error) {
    console.error('Could not read the saved preferences', error);
    return { ...defaults };
  }
};

export const savePreferences = async (patch: Partial<Preferences>) => {
  const merged = { ...memory, ...patch };
  memory = merged;

  if (Platform.OS === 'web') return;

  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(merged));
  } catch (error) {
    console.error('Could not save the preferences', error);
  }
};
