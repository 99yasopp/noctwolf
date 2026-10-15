import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from './BaseButton';
import { Phase } from '../../engine/types';

// The role as the local device knows it, normalised so the dashboard and the
// player screen can share the same action UI.
export interface OwnRole {
  name: string;
  team: string;
  description: string;
  nightAction?: 'kill' | 'peek';
  nightActionLabel?: string;
  allies?: { id: string; name: string }[];
}

export interface ActionTarget {
  id: string;
  name: string;
  isAlive: boolean;
}

interface Props {
  phase: Phase | null;
  role: OwnRole | null;
  selfId: string | null;
  targets: ActionTarget[];
  submitted: boolean;
  gameOver: boolean;
  // Night 1 is peaceful, so the wolf is not asked to choose anyone.
  quietNight?: boolean;
  onChoose: (targetId: string) => void;
}

export const ActionPanel: React.FC<Props> = ({
  phase,
  role,
  selfId,
  targets,
  submitted,
  gameOver,
  quietNight = false,
  onChoose,
}) => {
  if (gameOver || !phase || !role || !selfId) return null;

  if (phase === 'Night' && !role.nightAction) {
    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>Night</Text>
        <Text style={styles.body}>You have no night action. Sleep well.</Text>
      </View>
    );
  }

  if (phase === 'Night' && quietNight && role.nightAction === 'kill') {
    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>Night 1 is peaceful</Text>
        <Text style={styles.body}>
          The wolves only look around tonight. Nobody will be devoured, so tomorrow's
          vote decides everything.
        </Text>
      </View>
    );
  }

  if (phase !== 'Night' && phase !== 'Vote') return null;

  const allyIds = new Set((role.allies ?? []).map(ally => ally.id));
  const candidates = targets.filter(
    target => target.isAlive && target.id !== selfId && !allyIds.has(target.id),
  );

  const heading = phase === 'Night' ? role.nightActionLabel ?? 'Choose a player' : 'Vote to eliminate';

  if (submitted) {
    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>{heading}</Text>
        <Text style={styles.body}>Submitted. Waiting for the host...</Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>{heading}</Text>
      {candidates.map(target => (
        <BaseButton
          key={target.id}
          title={target.name}
          onPress={() => onChoose(target.id)}
          variant="secondary"
        />
      ))}
      {candidates.length === 0 && <Text style={styles.body}>No valid targets.</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    marginBottom: theme.spacing.medium,
  },
  heading: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: theme.spacing.small,
  },
  body: {
    color: '#888',
    fontSize: 15,
  },
});
