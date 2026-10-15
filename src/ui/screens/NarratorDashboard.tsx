import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { ActionPanel, OwnRole } from '../components/ActionPanel';
import { useGame } from '../GameContext';
import { lobby } from '../../network/lobby';

export const NarratorDashboard = () => {
  const { manager, localPlayer, returnToLobby, rematch, gameId } = useGame();
  const [, forceRender] = useState(0);
  const [secrets, setSecrets] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState<string[]>([]);

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

  // What the host was told privately belongs to one game only: a rematch
  // would otherwise open with the notes from the game before.
  useEffect(() => {
    setSecrets([]);
  }, [gameId]);

  // Roster changes (a guest joining, dropping or being removed) are not game
  // events, so they need their own subscription to show up.
  useEffect(
    () =>
      lobby.onRosterChanged(() => {
        forceRender(n => n + 1);
      }),
    [],
  );

  const phase = manager?.state.currentPhase ?? null;
  const round = manager?.round ?? 1;

  // Each new phase asks for a fresh action.
  useEffect(() => {
    setSubmitted([]);
  }, [phase, round]);

  if (!manager || !localPlayer) return null;

  const players = manager.state.players;
  const role = manager.getRoleOf(localPlayer.id);

  const ownRole: OwnRole | null = role
    ? {
        name: role.name,
        team: role.team,
        description: role.description,
        nightActions: role.nightActions?.map(option => ({
          id: option.id,
          label: option.label,
          kind: option.kind,
        })),
        revengeOnDeath: role.revengeOnDeath,
        linksLovers: role.linksLovers,
        allies:
          role.team === 'Wolf'
            ? players
                .filter(p => p.id !== localPlayer.id && manager.getRoleOf(p.id)?.team === 'Wolf')
                .map(p => ({ id: p.id, name: p.name }))
            : [],
      }
    : null;

  const aliveCount = players.filter(p => p.isAlive).length;
  const guests = players.filter(p => p.id !== localPlayer.id && !p.isBot);
  const droppedGuests = lobby.disconnectedPlayers().length;
  const pendingActors = manager.getPendingNightActors();
  const pendingVoters = manager.getPendingVoters();
  const pendingHunter = manager.getPendingRevengeHunter();

  const nextLabel = manager.winner
    ? null
    : phase === 'Night'
    ? `Resolve night ${round} → Day`
    : phase === 'Day'
    ? 'Start the vote'
    : phase === 'Vote'
    ? 'Resolve the vote → Night'
    : phase === 'Revenge'
    ? 'Carry out the revenge'
    : 'Start the night';

  const submitLocalAction = (actionId: string, targetId: string) => {
    const ok =
      actionId === 'vote'
        ? manager.handleVote(localPlayer.id, targetId)
        : actionId === 'revenge'
        ? manager.handleRevenge(localPlayer.id, targetId)
        : manager.handleNightAction(localPlayer.id, actionId, targetId);

    if (ok) setSubmitted(prev => [...prev, actionId]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Narrator Dashboard</Text>

      {/* The host plays too, so his own role must be as visible to him as a
          guest's role card is to a guest. */}
      <View style={styles.roleCard}>
        <Text style={styles.roleLabel}>Your Role</Text>
        <Text style={styles.roleName}>{role?.name ?? 'unassigned'}</Text>
        <Text style={styles.roleTeam}>{role ? `${role.team} team` : ''}</Text>
        {role && <Text style={styles.roleDescription}>{role.description}</Text>}
        {ownRole && ownRole.allies && ownRole.allies.length > 0 && (
          <Text style={styles.roleDescription}>
            Your pack: {ownRole.allies.map(ally => ally.name).join(', ')}
          </Text>
        )}
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.statusText}>
          Phase: {manager.state.currentPhase} (round {round})
        </Text>
        <Text style={styles.statusText}>
          Alive: {aliveCount} / {players.length}
        </Text>
        <Text style={styles.statusText}>You are: {localPlayer.name}</Text>

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
        {pendingHunter && (
          <Text style={styles.pending}>
            {pendingHunter.name} is choosing who to take down.
          </Text>
        )}
      </View>

      {manager.winner && (
        <View style={styles.winnerCard}>
          <Text style={styles.winnerText}>
            {manager.winner === 'Wolf'
              ? 'Werewolves win!'
              : manager.winner === 'Solitary'
              ? 'The Lovers win!'
              : 'Village wins!'}
          </Text>
          <Text style={styles.winnerSub}>
            Everyone keeps their seat. Playing again deals new roles to the same table.
          </Text>
          <BaseButton title="Play again" onPress={rematch} />
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
            setSubmitted([]);
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
        onChoose={submitLocalAction}
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
      {players.map(player => {
        const dropped = lobby.disconnectedPlayers().some(p => p.id === player.id);

        return (
          <View key={player.id} style={styles.playerRow}>
            <View style={styles.playerInfo}>
              <Text style={[styles.playerName, !player.isAlive && styles.dead]}>
                {player.name}
                {player.id === localPlayer.id ? ' (you)' : ''}
                {player.isBot ? ' [bot]' : ''}
              </Text>
              <Text style={styles.playerRole}>
                {manager.getRoleOf(player.id)?.name ?? 'unknown'}
                {player.isAlive ? '' : ' — dead'}
                {dropped ? ' — no connection' : ''}
                {manager.state.currentPhase === 'Vote' && player.isAlive && manager.hasVoted(player.id)
                  ? ' — voted'
                  : ''}
              </Text>
            </View>

            {player.id !== localPlayer.id && (
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => lobby.removePlayer(player.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      <Text style={styles.subHeader}>Log</Text>
      {manager.actionLog.map((entry, index) => (
        <Text key={index} style={styles.logText}>
          {entry}
        </Text>
      ))}

      <Text style={styles.hint}>
        Guests connected: {guests.length - droppedGuests} / {guests.length}
        {droppedGuests > 0 ? ' — a dropped guest keeps their seat and can rejoin' : ''}
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
  roleCard: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.large,
    borderRadius: theme.borderRadius,
    alignItems: 'center',
    marginBottom: theme.spacing.medium,
  },
  roleLabel: {
    color: theme.colors.background,
    fontSize: 14,
  },
  roleName: {
    color: theme.colors.background,
    fontSize: 28,
    fontWeight: 'bold',
  },
  roleTeam: {
    color: theme.colors.background,
    fontSize: 14,
    marginTop: 4,
  },
  roleDescription: {
    color: theme.colors.background,
    fontSize: 14,
    textAlign: 'center',
    marginTop: theme.spacing.small,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playerInfo: {
    flexShrink: 1,
  },
  removeButton: {
    paddingHorizontal: theme.spacing.small,
    paddingVertical: 4,
    borderRadius: theme.borderRadius,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    marginLeft: theme.spacing.small,
  },
  removeText: {
    color: theme.colors.danger,
    fontSize: 13,
  },
  winnerSub: {
    color: theme.colors.background,
    fontSize: 13,
    textAlign: 'center',
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
