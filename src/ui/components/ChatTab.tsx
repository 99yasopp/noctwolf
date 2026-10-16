import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from './BaseButton';
import { ChatGroup, ChatLine } from '../../engine/types';

interface Props {
  // The windows this phone holds, and the ones open right now.
  groups: ChatGroup[];
  open: ChatGroup[];
  lines: ChatLine[];
  selfId: string;
  onSend: (group: ChatGroup, text: string) => void;
}

const GROUP_LABEL: Record<ChatGroup, string> = {
  wolves: 'The pack',
  lovers: 'The tied two',
};

// What a closed window says. The wolves' rule has two closed hours, and both
// answer with the same sentence.
const CLOSED_HINT: Record<ChatGroup, string> = {
  wolves: 'The pack whispers only while it is picking its victim.',
  lovers: 'This table keeps the lovers quiet.',
};

// The private half of a game: the wolves' whisper and the lovers' bond. What
// is said here stays on the phones that are allowed to hear it.
export const ChatTab: React.FC<Props> = ({ groups, open, lines, selfId, onSend }) => {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const send = (group: ChatGroup) => {
    const text = (drafts[group] ?? '').trim();
    if (!text) return;

    onSend(group, text);
    setDrafts(previous => ({ ...previous, [group]: '' }));
  };

  return (
    <View>
      {groups.map(group => {
        const heard = lines.filter(line => line.group === group);
        const isOpen = open.includes(group);

        return (
          <View key={group} style={styles.card}>
            <Text style={styles.heading}>{GROUP_LABEL[group]}</Text>

            {heard.length === 0 ? (
              <Text style={styles.hint}>
                {isOpen ? 'Nothing said yet.' : CLOSED_HINT[group]}
              </Text>
            ) : (
              <>
                {heard.map((line, index) => (
                  <Text key={index} style={styles.line}>
                    <Text style={line.senderId === selfId ? styles.mine : styles.theirs}>
                      {line.senderId === selfId ? 'You' : line.senderName}
                    </Text>
                    {': '}
                    {line.message}
                  </Text>
                ))}
                {!isOpen && <Text style={styles.hint}>{CLOSED_HINT[group]}</Text>}
              </>
            )}

            {isOpen && (
              <View style={styles.composer}>
                <TextInput
                  style={styles.input}
                  value={drafts[group] ?? ''}
                  onChangeText={text =>
                    setDrafts(previous => ({ ...previous, [group]: text }))
                  }
                  onSubmitEditing={() => send(group)}
                  maxLength={200}
                  placeholder="Write to them"
                  placeholderTextColor={theme.colors.dim}
                />
                <BaseButton title="Send" onPress={() => send(group)} />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    padding: theme.spacing.medium,
    marginBottom: theme.spacing.medium,
  },
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
  line: {
    color: theme.colors.text,
    marginBottom: 4,
  },
  mine: {
    color: theme.colors.secondary,
    fontWeight: 'bold',
  },
  theirs: {
    color: theme.colors.warn,
    fontWeight: 'bold',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.small,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.raised,
    color: theme.colors.text,
    borderRadius: theme.borderRadius,
    paddingHorizontal: theme.spacing.small,
    paddingVertical: theme.spacing.small,
    marginRight: theme.spacing.small,
  },
});
