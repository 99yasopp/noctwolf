import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  GameNoteEntry,
  GameNotes,
  emptyGameNotes,
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
  const next = upsertEntry(index, {
    id: fitted.id,
    date: fitted.date,
    myRole: fitted.myRole,
  });
  await write(INDEX_KEY, JSON.stringify(next));

  // A page the history list just dropped goes with it: nothing points at it
  // any more, so "Clear all" would never find it again.
  const kept = new Set(next.map(entry => entry.id));
  for (const entry of index) {
    if (!kept.has(entry.id)) await remove(gameKey(entry.id));
  }
};

// No undo: every game's page and the list itself go at once.
export const clearAllNotes = async (): Promise<void> => {
  const index = await loadNotesIndex();
  for (const entry of index) await remove(gameKey(entry.id));
  await remove(INDEX_KEY);
};

// The page being written right now, kept per game for the session: closing the
// tab and coming back must not open a blank sheet.
const openPages = new Map<string, GameNotes>();

export const openPageFor = (gameKey: string, myRole: string): GameNotes => {
  const existing = openPages.get(gameKey);
  if (existing) return existing;

  const page = emptyGameNotes(`${Date.now()}`, myRole);
  openPages.set(gameKey, page);
  return page;
};

// Stores the page and hands back the history list it now belongs to.
export const rememberPage = async (
  gameKey: string,
  page: GameNotes,
): Promise<GameNoteEntry[]> => {
  openPages.set(gameKey, page);
  await saveGameNotes(page);
  return loadNotesIndex();
};

export const clearAllPages = async (): Promise<void> => {
  openPages.clear();
  await clearAllNotes();
};
