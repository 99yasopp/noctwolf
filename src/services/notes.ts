// What this device remembers about a game: the note pad of that evening, one
// line per player, and the role the owner held. Nothing here is ever sent to
// the table. The pure half of the notes lives in this file so it can be tried
// without a phone; the storage itself is in notesStore.

export interface GameNotes {
  // The deal this belongs to, so a rematch starts a fresh page.
  id: string;
  date: string;
  // The role the note-taker held, for the history list.
  myRole: string;
  // The free pad: what happened, what to watch for.
  text: string;
  // One line per player name.
  players: Record<string, string>;
}

export interface GameNoteEntry {
  id: string;
  date: string;
  myRole: string;
}

// A device keeps one value per key, and expo-secure-store refuses values above
// 2 KB, so one game has to fit in about that.
export const NOTES_VALUE_LIMIT = 1900;
export const NOTES_TEXT_LIMIT = 900;
export const NOTES_PLAYER_LIMIT = 60;
// The list of past games: oldest are dropped once the value would outgrow a
// key of its own.
export const NOTES_HISTORY_LIMIT = 25;

// Caps one game's notes so the stored value always fits. This is a backstop:
// the screens already stop the typing at the same lengths.
export const fitGameNotes = (game: GameNotes): GameNotes => {
  const fitted: GameNotes = {
    ...game,
    text: game.text.slice(0, NOTES_TEXT_LIMIT),
    players: {},
  };

  // Room for the rest of the record, names and dates included.
  const budget = NOTES_VALUE_LIMIT - 200;
  Object.entries(game.players).forEach(([name, note]) => {
    if (JSON.stringify(fitted.players).length + note.length > budget) return;
    fitted.players[name] = note.slice(0, NOTES_PLAYER_LIMIT);
  });

  while (JSON.stringify(fitted).length > NOTES_VALUE_LIMIT && fitted.text.length > 0) {
    fitted.text = fitted.text.slice(0, fitted.text.length - 50);
  }

  return fitted;
};

// The history list: newest first, one entry per game.
export const upsertEntry = (
  index: GameNoteEntry[],
  entry: GameNoteEntry,
): GameNoteEntry[] =>
  [entry, ...index.filter(existing => existing.id !== entry.id)].slice(
    0,
    NOTES_HISTORY_LIMIT,
  );

export const emptyGameNotes = (id: string, myRole: string): GameNotes => ({
  id,
  date: new Date().toISOString(),
  myRole,
  text: '',
  players: {},
});
