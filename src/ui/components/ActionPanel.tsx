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
  // Which half of the night this is: the wolves first, the witch second.
  nightStage?: number;
  // Who the wolves took, as told to the witch alone.
  victim?: { id: string; name: string } | null;
  // The mayoral election: who is standing, and which half of it is running.
  electionStage?: 'nominate' | 'vote';
  mayorCandidates?: { id: string; name: string }[];
  // The mayor who died and still owes the table a successor.
  successionMayorId?: string | null;
  onChoose: (actionId: string, targetId: string) => void;
}

// Only the guard's shield and the witch's potion may be aimed at yourself.
const allowsSelf = (kind: string) => kind === 'protect' || kind === 'heal';
// A wolf never eats its own pack.
const excludesPack = (kind: string) => kind === 'attack';

// The same split the engine uses: the night actors first, the witch second,
// because she decides with the wolves' victim in front of her.
const STAGE_TWO_KINDS = ['heal', 'poison'];
const stageOfKind = (kind: string) => (STAGE_TWO_KINDS.includes(kind) ? 2 : 1);

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
  nightStage = 1,
  victim = null,
  electionStage = 'nominate',
  mayorCandidates = [],
  successionMayorId = null,
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

  // The dying mayor names his successor, so this also comes before the
  // "you are out" note: he is dead and still has a call to make.
  if (phase === 'Succession') {
    const isTheMayor = !!successionMayorId && successionMayorId === selfId;

    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>The mayor has died</Text>
        {isTheMayor ? (
          submitted.includes('succession') ? (
            <Text style={styles.body}>Chosen. Waiting for the host...</Text>
          ) : (
            <>
              <Text style={styles.body}>
                Name the player who takes your double vote.
              </Text>
              {alive
                .filter(target => target.id !== selfId)
                .map(target => (
                  <BaseButton
                    key={target.id}
                    title={target.name}
                    onPress={() => onChoose('succession', target.id)}
                    variant="secondary"
                  />
                ))}
            </>
          )
        ) : (
          <Text style={styles.body}>
            The mayor is naming the player who takes his double vote.
          </Text>
        )}
      </View>
    );
  }

  if (phase === 'Election' || phase === 'Debate') {
    const iAmStanding = mayorCandidates.some(candidate => candidate.id === selfId);
    const list = mayorCandidates.map(candidate => candidate.name).join(', ');

    if (phase === 'Debate') {
      return (
        <View style={styles.panel}>
          <Text style={styles.heading}>The candidates speak</Text>
          <Text style={styles.body}>
            {list || 'Nobody is standing.'} — then the table votes for one of them.
          </Text>
        </View>
      );
    }

    if (electionStage === 'nominate') {
      return (
        <View style={styles.panel}>
          <Text style={styles.heading}>Run for mayor</Text>
          {iAmStanding ? (
            <Text style={styles.body}>
              You are standing. The table will vote once the host closes the list.
            </Text>
          ) : mayorCandidates.length >= 3 ? (
            <Text style={styles.body}>Three candidates are in: {list}.</Text>
          ) : (
            <>
              <Text style={styles.body}>
                The first three players to stand are voted on. The winner's vote
                counts twice.
              </Text>
              <BaseButton
                title="I stand for mayor"
                onPress={() => onChoose('volunteer', selfId)}
                variant="secondary"
              />
            </>
          )}
          {mayorCandidates.length > 0 && (
            <Text style={styles.body}>Standing: {list}.</Text>
          )}
        </View>
      );
    }

    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>Vote for the mayor</Text>
        {submitted.includes('mayor-vote') ? (
          <Text style={styles.body}>Submitted. Waiting for the host...</Text>
        ) : (
          mayorCandidates.map(candidate => (
            <BaseButton
              key={candidate.id}
              title={candidate.id === selfId ? `${candidate.name} (yourself)` : candidate.name}
              onPress={() => onChoose('mayor-vote', candidate.id)}
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
  // The wolves look around on the first night instead of feeding, and the
  // witch is not woken until the wolves have chosen.
  const offered = declared.filter(option => {
    if (stageOfKind(option.kind) !== nightStage) return false;
    if (quietNight && option.kind === 'attack') return false;
    return true;
  });

  if (offered.length === 0) {
    const peaceful = quietNight && declared.some(option => option.kind === 'attack');
    // The witch holds a potion but the night has not reached her yet.
    const stillToCome = declared.some(
      option => stageOfKind(option.kind) === 2 && nightStage === 1,
    );

    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>
          {peaceful ? 'Night 1 is peaceful' : stillToCome ? 'Not yet' : 'Night'}
        </Text>
        <Text style={styles.body}>
          {peaceful
            ? "The wolves only look around tonight. Nobody will be devoured, so tomorrow's vote decides everything."
            : stillToCome
            ? 'The wolves are out. You will be woken once they have chosen.'
            : 'You have no night action. Sleep well.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      {offered.map(option => {
        const candidates =
          option.kind === 'heal'
            ? victim
              ? alive.filter(target => target.id === victim.id)
              : []
            : alive.filter(target => {
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
              <Text style={styles.body}>
                {option.kind === 'heal'
                  ? 'Nobody was attacked tonight, so the potion stays where it is.'
                  : 'No valid targets.'}
              </Text>
            ) : (
              candidates.map(target => (
                <BaseButton
                  key={target.id}
                  title={
                    option.kind === 'heal' ? `Save ${target.name}` : target.name
                  }
                  onPress={() => onChoose(option.id, target.id)}
                  variant="secondary"
                />
              ))
            )}
          </View>
        );
      })}
      {nightStage === 2 && (
        <Text style={styles.body}>
          Keeping a potion is a choice too: the host moves on when you say so.
        </Text>
      )}
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
