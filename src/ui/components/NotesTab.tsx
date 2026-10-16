import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from './BaseButton';
import {
  GameNoteEntry,
  GameNotes,
  NOTES_PLAYER_LIMIT,
  NOTES_TEXT_LIMIT,
} from '../../services/notes';
import {
  clearAllPages,
  loadGameNotes,
  loadNotesIndex,
  openPageFor,
  rememberPage,
} from '../../services/notesStore';

interface Props {
  // One page per deal: a rematch opens a fresh one.
  gameKey: string;
  // The role the note-taker holds, kept on the page for the history list.
  myRole: string;
  players: string[];
}

// What this phone remembers: a free pad for the evening, one line per player,
// and every past game still in reach. Nothing here is ever sent anywhere, and
// clearing it is final.
export const NotesTab: React.FC<Props> = ({ gameKey, myRole, players }) => {
  const [page, setPage] = useState<GameNotes>(() => openPageFor(gameKey, myRole));
  const [index, setIndex] = useState<GameNoteEntry[]>([]);
  const [reading, setReading] = useState<GameNotes | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  // Only a change the player made is written: opening the tab saves nothing.
  const dirty = useRef(false);

  useEffect(() => {
    loadNotesIndex().then(setIndex);
  }, []);

  // A new deal opens its own page; the old one stays in the history. Declared
  // before the save effect so the switch cannot save the old page under the
  // new game.
  useEffect(() => {
    dirty.current = false;
    setPage(openPageFor(gameKey, myRole));
    setReading(null);
  }, [gameKey]);

  // The typing is saved once it settles rather than on every keystroke.
  useEffect(() => {
    if (!dirty.current) return;

    const timer = setTimeout(() => {
      rememberPage(gameKey, { ...page, myRole }).then(setIndex);
    }, 600);
    return () => clearTimeout(timer);
  }, [page, gameKey, myRole]);

  const editText = (text: string) => {
    dirty.current = true;
    setPage(prev => ({ ...prev, text }));
  };

  const editPlayer = (name: string, note: string) => {
    dirty.current = true;
    setPage(prev => ({ ...prev, players: { ...prev.players, [name]: note } }));
  };

  const openPast = async (id: string) => {
    const past = await loadGameNotes(id);
    if (past) setReading(past);
  };

  const clearAll = async () => {
    await clearAllPages();
    dirty.current = false;
    setIndex([]);
    setPage(openPageFor(gameKey, myRole));
    setReading(null);
    setConfirmClear(false);
  };

  return (
    <View>
      <Text style={styles.heading}>
        {reading
          ? `Your notes, ${reading.date.slice(0, 10)} — you were ${reading.myRole}`
          : 'Your notes for this game'}
      </Text>

      {reading ? (
        <>
          {reading.text ? (
            <Text style={styles.body}>{reading.text}</Text>
          ) : (
            <Text style={styles.hint}>That page has no notes on it.</Text>
          )}
          {Object.entries(reading.players)
            .filter(([, note]) => note)
            .map(([name, note]) => (
              <Text key={name} style={styles.pastLine}>
                {name}: {note}
              </Text>
            ))}
          <BaseButton
            title="Back to this game's page"
            variant="secondary"
            onPress={() => setReading(null)}
          />
        </>
      ) : (
        <>
          <Text style={styles.hint}>
            Only this phone keeps these words. The table never hears them, and
            they stay after the game is over.
          </Text>
          <TextInput
            style={styles.pad}
            multiline
            value={page.text}
            onChangeText={editText}
            maxLength={NOTES_TEXT_LIMIT}
            placeholder="What happened this game?"
            placeholderTextColor={theme.colors.dim}
          />

          <Text style={styles.subHeader}>About the players</Text>
          {players.map(name => (
            <View key={name} style={styles.playerRow}>
              <Text style={styles.playerName}>{name}</Text>
              <TextInput
                style={styles.playerInput}
                value={page.players[name] ?? ''}
                onChangeText={note => editPlayer(name, note)}
                maxLength={NOTES_PLAYER_LIMIT}
                placeholder="Your guess"
                placeholderTextColor={theme.colors.dim}
              />
            </View>
          ))}
        </>
      )}

      <Text style={styles.subHeader}>Past games</Text>
      {index.length === 0 ? (
        <Text style={styles.hint}>No pages yet. This is the first one.</Text>
      ) : (
        index.map(entry => (
          <TouchableOpacity key={entry.id} onPress={() => openPast(entry.id)}>
            <Text style={styles.entry}>
              {entry.date.slice(0, 10)} · you were {entry.myRole}
            </Text>
          </TouchableOpacity>
        ))
      )}

      {confirmClear ? (
        <>
          <Text style={styles.warn}>
            Every page, this game's and the past ones, goes for good. There is
            no undo.
          </Text>
          <BaseButton title="Yes, erase every note" variant="danger" onPress={clearAll} />
          <BaseButton
            title="Keep them"
            variant="secondary"
            onPress={() => setConfirmClear(false)}
          />
        </>
      ) : (
        <BaseButton
          title="Clear all notes"
          variant="danger"
          onPress={() => setConfirmClear(true)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  heading: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: theme.spacing.small,
  },
  hint: {
    color: theme.colors.dim,
    marginBottom: theme.spacing.small,
  },
  warn: {
    color: theme.colors.warn,
    marginTop: theme.spacing.small,
    marginBottom: theme.spacing.small,
  },
  body: {
    color: theme.colors.text,
    marginBottom: theme.spacing.small,
  },
  pad: {
    backgroundColor: theme.colors.raised,
    color: theme.colors.text,
    borderRadius: theme.borderRadius,
    padding: theme.spacing.small,
    minHeight: 96,
    textAlignVertical: 'top',
    marginBottom: theme.spacing.small,
  },
  subHeader: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: theme.spacing.small,
    marginBottom: theme.spacing.small,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.small,
  },
  playerName: {
    color: theme.colors.text,
    width: 96,
  },
  playerInput: {
    flex: 1,
    backgroundColor: theme.colors.raised,
    color: theme.colors.text,
    borderRadius: theme.borderRadius,
    paddingHorizontal: theme.spacing.small,
    paddingVertical: theme.spacing.small,
  },
  pastLine: {
    color: theme.colors.text,
    marginBottom: 2,
  },
  entry: {
    color: theme.colors.secondary,
    paddingVertical: 6,
  },
});
