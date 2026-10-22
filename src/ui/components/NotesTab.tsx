import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../text';
import { theme } from '../theme/colors';
import { BaseButton } from './BaseButton';
import { useResponsive } from '../layout';
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
  const { compact } = useResponsive();
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
            <View key={name} style={[styles.playerRow, compact && styles.playerRowCompact]}>
              <Text
                style={[styles.playerName, compact && styles.playerNameCompact]}
                numberOfLines={1}
              >
                {name}
              </Text>
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
          <Pressable
            key={entry.id}
            style={({ pressed }) => [styles.pastButton, pressed && styles.pressed]}
            onPress={() => openPast(entry.id)}
            accessibilityRole="button"
          >
            <Text style={styles.entry}>
              {t('ui.notes.pastEntry', {
                date: entry.date.slice(0, 10),
                role: entry.myRole,
              })}
            </Text>
          </Pressable>
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
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.fieldBorder,
    padding: 12,
    minHeight: 120,
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
    gap: 8,
    marginBottom: theme.spacing.small,
  },
  playerRowCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: 4,
  },
  playerName: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
    minWidth: 72,
    maxWidth: 120,
    flexShrink: 1,
  },
  playerNameCompact: {
    maxWidth: '100%',
  },
  playerInput: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.fieldBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: theme.inlineTouchTarget,
  },
  pastLine: {
    color: theme.colors.text,
    marginBottom: 2,
  },
  pastButton: {
    minHeight: theme.inlineTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 6,
  },
  pressed: {
    backgroundColor: theme.colors.raised,
    transform: [{ scale: 0.99 }],
  },
  entry: {
    color: theme.colors.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
});
