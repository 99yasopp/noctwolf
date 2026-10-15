import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { PlayableRole, setCustomRoles } from '../engine/roleSet';

const STORAGE_KEY = 'custom_roles';

// expo-secure-store has no web implementation, so the web build keeps the
// roles in memory for the life of the tab instead of failing.
let memory: PlayableRole[] = [];

const isPlayableRole = (value: any): value is PlayableRole =>
  !!value &&
  typeof value === 'object' &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  (value.team === 'Village' || value.team === 'Wolf' || value.team === 'Solitary');

export const loadCustomRoles = async (): Promise<PlayableRole[]> => {
  if (Platform.OS === 'web') {
    setCustomRoles(memory);
    return memory;
  }

  try {
    const stored = await SecureStore.getItemAsync(STORAGE_KEY);
    const roles = stored ? JSON.parse(stored) : [];
    const valid = Array.isArray(roles) ? roles.filter(isPlayableRole) : [];
    setCustomRoles(valid);
    return valid;
  } catch (error) {
    console.error('Could not read the saved custom roles', error);
    return [];
  }
};

export const persistCustomRoles = async (roles: PlayableRole[]) => {
  memory = roles;
  setCustomRoles(roles);

  if (Platform.OS === 'web') return;

  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(roles));
  } catch (error) {
    console.error('Could not save the custom roles', error);
  }
};
