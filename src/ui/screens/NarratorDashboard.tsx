import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { ActionPanel, OwnRole } from '../components/ActionPanel';
import { formatRemaining } from '../format';
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

  // A re-vote happens inside the same phase, so it needs its own reset: the
  // host's first ballot is no longer on the table and must be cast again.
  useEffect(() => {
    if (manager?.lastVote?.revote) setSubmitted([]);
  }, [manager?.lastVote]);

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
  const revoteCandidates = manager.getRevoteCandidates();
  const remaining = manager.getTimerRemainingMs();

  // What each wolf has picked tonight, so the host can relay the pack's aim.
  const packPicks = players
    .filter(player => player.isAlive && manager.getRoleOf(player.id)?.team === 'Wolf')
    .map(player => {
      const attack = manager
        .getRoleOf(player.id)
        ?.nightActions?.find(option => option.kind === 'attack');
      if (!attack) return null;

      const target = players.find(
        entry => entry.id === manager.getNightChoice(player.id, attack.id),
      );
      return target ? `${player.name} \u2192 ${target.name}` : null;
    })
    .filter((line): line is string => !!line);

  // Whatever moves the game on goes through here. A clock that runs out at the
  // same moment the host taps the button would otherwise advance two phases
  // from one press, and two quick taps would skip a vote entirely.
  const advanceLock = React.useRef(0);
  const advanceOnce = () => {
    if (Date.now() < advanceLock.current) return;
    advanceLock.current = Date.now() + 900;
    manager.advance();
  };

  // One tick a second while a clock is running: it moves the countdown and,
  // when it is up, moves the game on for the host.
  useEffect(() => {
    if (remaining === null) return;

    const handle = setInterval(() => {
      forceRender(n => n + 1);
      if (manager.isTimerDue()) advanceOnce();
    }, 1000);

    return () => clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining === null, manager]);

  const nextLabel = manager.winner
    ? null
    : phase === 'Election'
    ? manager.getElectionStage() === 'nominate'
      ? 'Close the nominations → the candidates speak'
      : 'Announce the mayor → night 1'
    : phase === 'Debate'
    ? 'Start the vote for mayor'
    : phase === 'Succession'
    ? 'Carry out the succession'
    : phase === 'Night'
    ? manager.isWakingTheWitchNext()
      ? 'Wake the witch'
      : `Resolve night ${round} → Day`
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
        : actionId === 'mayor-vote'
        ? manager.handleMayorVote(localPlayer.id, targetId)
        : actionId === 'volunteer'
        ? manager.volunteerForMayor(localPlayer.id)
        : actionId === 'succession'
        ? manager.handleSuccession(localPlayer.id, targetId)
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
        {manager.getMayor() && (
          <Text style={styles.statusText}>
            Mayor: {manager.getMayor()?.name}
            {manager.getMayor()?.id === localPlayer.id ? ' (you, two votes)' : ''}
          </Text>
        )}
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

        {/* Wolves hunt as a pack, and the engine settles the bite by a majority
            of their picks: the host needs to see the picks to relay them. */}
        {phase === 'Night' && packPicks.length > 0 && (
          <Text style={styles.pending}>
            The pack is aiming at: {packPicks.join(', ')}
          </Text>
        )}
        {phase === 'Vote' && aliveCount > 0 && pendingVoters.length === 0 && (
          <Text style={styles.ready}>Everyone has voted.</Text>
        )}

        {/* The clock is the host's: a party game dies when the day never ends. */}
        {(phase === 'Day' || phase === 'Vote' || phase === 'Debate' || phase === 'Election') &&
          !manager.winner && (
          <View style={styles.timerRow}>
            {remaining !== null ? (
              <>
                <Text style={styles.timerText}>{formatRemaining(remaining)} left</Text>
                <BaseButton title="Stop the clock" onPress={() => manager.clearTimer()} variant="secondary" />
              </>
            ) : (
              <>
                <Text style={styles.pending}>Put the phase on a clock:</Text>
                <View style={styles.timerButtons}>
                  <BaseButton title="1 min" onPress={() => manager.startTimer(60)} variant="secondary" />
                  <BaseButton title="2 min" onPress={() => manager.startTimer(120)} variant="secondary" />
                  <BaseButton title="5 min" onPress={() => manager.startTimer(300)} variant="secondary" />
                </View>
              </>
            )}
          </View>
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
            {manager.lastVote.revote
              ? 'tied, voting again'
              : manager.lastVote.eliminatedName
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
          {manager.lastVote.ballots?.map(ballot => (
            <Text key={ballot.voterId} style={styles.ballotText}>
              {ballot.voterName} → {ballot.targetName}
            </Text>
          ))}
        </View>
      )}

      {!manager.winner && nextLabel && (
        <BaseButton
          title={nextLabel}
          onPress={() => {
            advanceOnce();
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
        selfAlive={localPlayer.isAlive}
        nightStage={manager.getNightStage()}
        victim={manager.getHealTarget()}
        electionStage={manager.getElectionStage()}
        mayorCandidates={manager.getElectionList()}
        successionMayorId={manager.getPendingSuccessionMayor()?.id ?? null}
        candidates={
          revoteCandidates.length > 0 ? revoteCandidates : undefined
        }
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
  timerRow: {
    marginTop: theme.spacing.small,
  },
  timerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timerText: {
    color: theme.colors.primary,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: theme.spacing.small,
  },
  ready: {
    color: theme.colors.secondary,
    fontSize: 15,
    marginTop: theme.spacing.small,
  },
  ballotText: {
    color: '#999',
    fontSize: 13,
    marginTop: 2,
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
