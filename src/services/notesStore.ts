import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  GameNoteEntry,
  GameNotes,
  fitGameNotes,
  upsertEntry,
} from './notes';

// Where the notes live on a device: one key for the history list, one key per
// game. SecureStore has no web implementation, so the web build works from
// memory instead of throwing, like the saved preferences do.

const INDEX_KEY = 'notes.index';
const gameKey = (id: string) => `notes.${id}`;

const memory = new Map<string, string>();

const read = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') return memory.get(key) ?? null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.error('Could not read the notes', error);
    return null;
  }
};

const write = async (key: string, value: string) => {
  if (Platform.OS === 'web') {
    memory.set(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    console.error('Could not save the notes', error);
  }
};

const remove = async (key: string) => {
  memory.delete(key);
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    console.error('Could not clear the notes', error);
  }
};

export const loadNotesIndex = async (): Promise<GameNoteEntry[]> => {
  const raw = await read(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GameNoteEntry[]) : [];
  } catch {
    return [];
  }
};

export const loadGameNotes = async (id: string): Promise<GameNotes | null> => {
  const raw = await read(gameKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GameNotes;
  } catch {
    return null;
  }
};

export const saveGameNotes = async (game: GameNotes): Promise<void> => {
  const fitted = fitGameNotes(game);
  await write(gameKey(fitted.id), JSON.stringify(fitted));

  const index = await loadNotesIndex();
  await write(
    INDEX_KEY,
    JSON.stringify(
      upsertEntry(index, {
        id: fitted.id,
        date: fitted.date,
        myRole: fitted.myRole,
      }),
    ),
  );
};

// No undo: every game's page and the list itself go at once.
export const clearAllNotes = async (): Promise<void> => {
  const index = await loadNotesIndex();
  for (const entry of index) await remove(gameKey(entry.id));
  await remove(INDEX_KEY);
};
