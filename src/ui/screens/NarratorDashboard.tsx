import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { ActionPanel, OwnRole } from '../components/ActionPanel';
import { useGame } from '../GameContext';
import { lobby } from '../../network/lobby';

export const NarratorDashboard = () => {
  const { manager, localPlayer, returnToLobby } = useGame();
  const [, forceRender] = useState(0);
  const [secrets, setSecrets] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!manager || !localPlayer) return;

    return manager.subscribe(event => {
      // Secrets belong to one player only: the host must not learn what the
      // seer was told unless the host is the seer.
      if (event.type === 'secret' && event.playerId === localPlayer.id) {
        setSecrets(prev => [...prev, event.message]);
      }
      // The manager owns all game state; re-render and read it back.
      forceRender(n => n + 1);
    });
  }, [manager, localPlayer]);

  const phase = manager?.state.currentPhase ?? null;
  const round = manager?.round ?? 1;

  // Each new phase asks for a fresh action.
  useEffect(() => {
    setSubmitted(false);
  }, [phase, round]);

  if (!manager || !localPlayer) return null;

  const players = manager.state.players;
  const role = manager.getRoleOf(localPlayer.id);

  const ownRole: OwnRole | null = role
    ? {
        name: role.name,
        team: role.team,
        description: role.description,
        nightAction: role.nightAction,
        nightActionLabel: role.nightActionLabel,
        allies:
          role.team === 'Wolf'
            ? players
                .filter(p => p.id !== localPlayer.id && manager.getRoleOf(p.id)?.team === 'Wolf')
                .map(p => ({ id: p.id, name: p.name }))
            : [],
      }
    : null;

  const aliveCount = players.filter(p => p.isAlive).length;
  const pendingActors = manager.getPendingNightActors();
  const pendingVoters = manager.getPendingVoters();

  const nextLabel = manager.winner
    ? null
    : phase === 'Night'
    ? `Resolve night ${round} → Day`
    : phase === 'Day'
    ? 'Start the vote'
    : phase === 'Vote'
    ? 'Resolve the vote → Night'
    : 'Start the night';

  const submitLocalAction = (message: any) => {
    const ok =
      message.type === 'NIGHT_ACTION'
        ? manager.handleNightAction(localPlayer.id, message.payload.action, message.payload.targetId)
        : manager.handleVote(localPlayer.id, message.payload.targetId);

    if (ok) setSubmitted(true);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Narrator Dashboard</Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusText}>
          Phase: {manager.state.currentPhase} (round {round})
        </Text>
        <Text style={styles.statusText}>
          Alive: {aliveCount} / {players.length}
        </Text>
        <Text style={styles.statusText}>You are: {localPlayer.name} ({role?.name ?? 'unassigned'})</Text>

        {pendingActors.length > 0 && (
          <Text style={styles.pending}>
            Waiting on night actions: {pendingActors.map(p => p.name).join(', ')}
          </Text>
        )}
        {pendingVoters.length > 0 && (
          <Text style={styles.pending}>
            Waiting on votes: {pendingVoters.map(p => p.name).join(', ')}
          </Text>
        )}
      </View>

      {manager.winner && (
        <View style={styles.winnerCard}>
          <Text style={styles.winnerText}>
            {manager.winner === 'Wolf' ? 'Werewolves win!' : 'Village wins!'}
          </Text>
        </View>
      )}

      {manager.lastVote && (
        <View style={styles.statusCard}>
          <Text style={styles.statusText}>
            Last vote:{' '}
            {manager.lastVote.eliminatedName
              ? `${manager.lastVote.eliminatedName} was eliminated`
              : manager.lastVote.tie
              ? 'tied, nobody eliminated'
              : 'no votes cast'}
          </Text>
          {manager.lastVote.tally
            .filter(entry => entry.count > 0)
            .map(entry => (
              <Text key={entry.id} style={styles.tallyText}>
                {entry.name}: {entry.count}
              </Text>
            ))}
        </View>
      )}

      {!manager.winner && nextLabel && (
        <BaseButton
          title={nextLabel}
          onPress={() => {
            manager.advance();
            setSubmitted(false);
          }}
        />
      )}

      <ActionPanel
        phase={manager.state.currentPhase}
        role={ownRole}
        selfId={localPlayer.id}
        targets={players}
        submitted={submitted}
        gameOver={!!manager.winner}
        quietNight={manager.isQuietNight()}
        onChoose={targetId =>
          submitLocalAction({
            type: manager.state.currentPhase === 'Night' ? 'NIGHT_ACTION' : 'VOTE_CAST',
            payload:
              manager.state.currentPhase === 'Night'
                ? { action: ownRole?.nightAction, targetId }
                : { targetId },
          })
        }
      />

      {secrets.length > 0 && (
        <View style={styles.secretCard}>
          <Text style={styles.secretHeading}>Your private information</Text>
          {secrets.map((secret, index) => (
            <Text key={index} style={styles.secretText}>
              {secret}
            </Text>
          ))}
        </View>
      )}

      <Text style={styles.subHeader}>Players</Text>
      {players.map(player => (
        <View key={player.id} style={styles.playerRow}>
          <Text style={[styles.playerName, !player.isAlive && styles.dead]}>
            {player.name}
            {player.id === localPlayer.id ? ' (you)' : ''}
            {player.isBot ? ' [bot]' : ''}
          </Text>
          <Text style={styles.playerRole}>
            {manager.getRoleOf(player.id)?.name ?? 'unknown'}
            {player.isAlive ? '' : ' — dead'}
            {manager.state.currentPhase === 'Vote' && player.isAlive && manager.hasVoted(player.id)
              ? ' — voted'
              : ''}
          </Text>
        </View>
      ))}

      <Text style={styles.subHeader}>Log</Text>
      {manager.actionLog.map((entry, index) => (
        <Text key={index} style={styles.logText}>
          {entry}
        </Text>
      ))}

      <Text style={styles.hint}>
        Guests connected: {lobby.getPlayers().filter(p => p.id !== localPlayer.id && !p.isBot).length}
      </Text>

      <BaseButton title="Back to Lobby" onPress={returnToLobby} variant="danger" />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.medium,
    paddingBottom: theme.spacing.large,
  },
  header: {
    fontSize: 24,
    color: theme.colors.text,
    fontWeight: 'bold',
    marginBottom: theme.spacing.medium,
  },
  statusCard: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    marginBottom: theme.spacing.medium,
  },
  statusText: {
    color: theme.colors.text,
    fontSize: 16,
    marginVertical: 4,
  },
  pending: {
    color: theme.colors.secondary,
    fontSize: 14,
    marginTop: 4,
  },
  tallyText: {
    color: '#888',
    fontSize: 14,
  },
  winnerCard: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    marginBottom: theme.spacing.medium,
  },
  winnerText: {
    color: theme.colors.background,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  secretCard: {
    backgroundColor: '#2A1E3A',
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    marginBottom: theme.spacing.medium,
  },
  secretHeading: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: theme.spacing.small,
  },
  secretText: {
    color: theme.colors.text,
    fontSize: 15,
    marginVertical: 2,
  },
  subHeader: {
    fontSize: 18,
    color: theme.colors.text,
    fontWeight: 'bold',
    marginTop: theme.spacing.medium,
    marginBottom: theme.spacing.small,
  },
  playerRow: {
    marginBottom: theme.spacing.small,
  },
  playerName: {
    color: theme.colors.text,
    fontSize: 16,
  },
  playerRole: {
    color: '#888',
    fontSize: 14,
  },
  dead: {
    textDecorationLine: 'line-through',
    color: '#666',
  },
  logText: {
    color: '#888',
    fontSize: 14,
  },
  hint: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginTop: theme.spacing.medium,
  },
});
