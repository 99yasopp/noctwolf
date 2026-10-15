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
  nightActions?: { id: string; label: string; kind: string }[];
  revengeOnDeath?: boolean;
  linksLovers?: boolean;
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
  // Action ids already sent this phase, so one part of a two-part role is not
  // hidden when the other has been answered.
  submitted: string[];
  gameOver: boolean;
  // Night 1 is peaceful, so the wolf is not asked to choose anyone.
  quietNight?: boolean;
  // Whether this player is still in the game. The dead can watch, not act.
  selfAlive?: boolean;
  // During a re-vote only these players are on the ballot.
  candidates?: string[];
  onChoose: (actionId: string, targetId: string) => void;
}

// Only the guard's shield and the witch's potion may be aimed at yourself.
const allowsSelf = (kind: string) => kind === 'protect' || kind === 'heal';
// A wolf never eats its own pack.
const excludesPack = (kind: string) => kind === 'attack';

export const ActionPanel: React.FC<Props> = ({
  phase,
  role,
  selfId,
  targets,
  submitted,
  gameOver,
  quietNight = false,
  selfAlive = true,
  candidates,
  onChoose,
}) => {
  if (gameOver || !phase || !role || !selfId) return null;

  const alive = targets.filter(target => target.isAlive);
  const allyIds = new Set((role.allies ?? []).map(ally => ally.id));

  if (phase === 'Revenge') {
    // Only the hunter who died gets this panel, so it comes before the
    // "you are out" note below.
    if (!role.revengeOnDeath) return null;

    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>Take someone down with you</Text>
        {submitted.includes('revenge') ? (
          <Text style={styles.body}>Chosen. Waiting for the host...</Text>
        ) : (
          alive
            .filter(target => target.id !== selfId)
            .map(target => (
              <BaseButton
                key={target.id}
                title={target.name}
                onPress={() => onChoose('revenge', target.id)}
                variant="secondary"
              />
            ))
        )}
      </View>
    );
  }

  // The dead watch. Saying so is better than leaving the screen blank.
  if (!selfAlive) {
    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>You are out</Text>
        <Text style={styles.body}>
          You can still watch the table, but you cannot act or vote.
        </Text>
      </View>
    );
  }

  if (phase === 'Vote') {
    const voted = submitted.includes('vote');
    const onBallot =
      candidates && candidates.length > 0
        ? alive.filter(target => candidates.includes(target.id))
        : alive.filter(target => target.id !== selfId);

    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>
          {candidates && candidates.length > 0 ? 'Tied: vote again' : 'Vote to eliminate'}
        </Text>
        {voted ? (
          <Text style={styles.body}>Submitted. Waiting for the host...</Text>
        ) : (
          onBallot.map(target => (
            <BaseButton
              key={target.id}
              title={target.name}
              onPress={() => onChoose('vote', target.id)}
              variant="secondary"
            />
          ))
        )}
      </View>
    );
  }

  if (phase !== 'Night') return null;

  const declared = role.nightActions ?? [];
  // The wolves look around on the first night instead of feeding.
  const offered = declared.filter(option => !(quietNight && option.kind === 'attack'));

  if (offered.length === 0) {
    const peaceful = quietNight && declared.some(option => option.kind === 'attack');

    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>
          {peaceful ? 'Night 1 is peaceful' : 'Night'}
        </Text>
        <Text style={styles.body}>
          {peaceful
            ? "The wolves only look around tonight. Nobody will be devoured, so tomorrow's vote decides everything."
            : 'You have no night action. Sleep well.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      {offered.map(option => {
        const candidates = alive.filter(target => {
          if (target.id === selfId && !allowsSelf(option.kind)) return false;
          if (excludesPack(option.kind) && allyIds.has(target.id)) return false;
          return true;
        });

        return (
          <View key={option.id}>
            <Text style={styles.heading}>{option.label}</Text>
            {submitted.includes(option.id) ? (
              <Text style={styles.body}>Submitted.</Text>
            ) : candidates.length === 0 ? (
              <Text style={styles.body}>No valid targets.</Text>
            ) : (
              candidates.map(target => (
                <BaseButton
                  key={target.id}
                  title={target.name}
                  onPress={() => onChoose(option.id, target.id)}
                  variant="secondary"
                />
              ))
            )}
          </View>
        );
      })}
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
