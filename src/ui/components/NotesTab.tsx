import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, TextInput } from '../text';
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
import { useI18n } from '../i18n';

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
  const { t } = useI18n();
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
          ? t('ui.notes.pageFor', {
              date: reading.date.slice(0, 10),
              role: reading.myRole,
            })
          : t('ui.notes.page')}
      </Text>

      {reading ? (
        <>
          {reading.text ? (
            <Text style={styles.body}>{reading.text}</Text>
          ) : (
            <Text style={styles.hint}>{t('ui.notes.empty')}</Text>
          )}
          {Object.entries(reading.players)
            .filter(([, note]) => note)
            .map(([name, note]) => (
              <Text key={name} style={styles.pastLine}>
                {name}: {note}
              </Text>
            ))}
          <BaseButton
            title={t('ui.notes.back')}
            variant="secondary"
            onPress={() => setReading(null)}
          />
        </>
      ) : (
        <>
          <Text style={styles.hint}>{t('ui.notes.private')}</Text>
          <TextInput
            style={styles.pad}
            multiline
            value={page.text}
            onChangeText={editText}
            maxLength={NOTES_TEXT_LIMIT}
            placeholder={t('ui.notes.placeholder')}
            placeholderTextColor={theme.colors.dim}
          />

          <Text style={styles.subHeader}>{t('ui.notes.aboutPlayers')}</Text>
          {players.map(name => (
            <View key={name} style={styles.playerRow}>
              <Text style={styles.playerName}>{name}</Text>
              <TextInput
                style={styles.playerInput}
                value={page.players[name] ?? ''}
                onChangeText={note => editPlayer(name, note)}
                maxLength={NOTES_PLAYER_LIMIT}
                placeholder={t('ui.notes.guess')}
                placeholderTextColor={theme.colors.dim}
              />
            </View>
          ))}
        </>
      )}

      <Text style={styles.subHeader}>{t('ui.notes.past')}</Text>
      {index.length === 0 ? (
        <Text style={styles.hint}>{t('ui.notes.noPages')}</Text>
      ) : (
        index.map(entry => (
          <TouchableOpacity
            key={entry.id}
            style={styles.pastButton}
            onPress={() => openPast(entry.id)}
            activeOpacity={0.75}
            accessibilityRole="button"
          >
            <Text style={styles.entry}>
              {t('ui.notes.pastEntry', {
                date: entry.date.slice(0, 10),
                role: entry.myRole,
              })}
            </Text>
          </TouchableOpacity>
        ))
      )}

      {confirmClear ? (
        <>
          <Text style={styles.warn}>{t('ui.notes.clearWarning')}</Text>
          <BaseButton
            title={t('ui.notes.clearYes')}
            variant="danger"
            onPress={clearAll}
          />
          <BaseButton
            title={t('ui.notes.clearNo')}
            variant="secondary"
            onPress={() => setConfirmClear(false)}
          />
        </>
      ) : (
        <BaseButton
          title={t('ui.notes.clearAll')}
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
    fontSize: 19,
    fontWeight: '800',
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
    fontSize: theme.type.body,
    lineHeight: 22,
    marginBottom: theme.spacing.small,
  },
  pad: {
    backgroundColor: theme.colors.raised,
    color: theme.colors.text,
    borderRadius: theme.borderRadius,
    borderWidth: 1,
    borderColor: theme.colors.fieldBorder,
    padding: theme.spacing.small,
    minHeight: 96,
    textAlignVertical: 'top',
    marginBottom: theme.spacing.small,
  },
  subHeader: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
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
    borderWidth: 1,
    borderColor: theme.colors.fieldBorder,
    paddingHorizontal: theme.spacing.small,
    paddingVertical: theme.spacing.small,
    minHeight: theme.inlineTouchTarget,
  },
  pastLine: {
    color: theme.colors.text,
    marginBottom: 2,
  },
  pastButton: {
    minHeight: theme.inlineTouchTarget,
    justifyContent: 'center',
  },
  entry: {
    color: theme.colors.secondary,
    fontSize: 15,
    fontWeight: '600',
  },
});
