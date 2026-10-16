import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { ActionPanel, OwnRole } from '../components/ActionPanel';
import { useGame } from '../GameContext';
import { lobby } from '../../network/lobby';
import { Phase } from '../../engine/types';
import {
  GameOverPayload,
  MayorElectedPayload,
  NightStagePayload,
  PhaseUpdatePayload,
  PlayerRef,
  RoleAssignPayload,
  VoteResultPayload,
} from '../../network/protocol';
import { formatRemaining, winnerText } from '../format';

export const PlayerScreen = () => {
  const { localPlayer, returnToLobby } = useGame();

  const [phase, setPhase] = useState<Phase | null>(null);
  const [round, setRound] = useState(1);
  const [roster, setRoster] = useState<PlayerRef[]>([]);
  const [deaths, setDeaths] = useState<PlayerRef[]>([]);
  const [role, setRole] = useState<RoleAssignPayload | null>(null);
  const [secrets, setSecrets] = useState<string[]>([]);
  const [voteResult, setVoteResult] = useState<VoteResultPayload | null>(null);
  const [outcome, setOutcome] = useState<GameOverPayload | null>(null);
  const [submitted, setSubmitted] = useState<string[]>([]);
  // Which half of the night it is, and who the wolves took (the witch alone).
  const [nightStage, setNightStage] = useState<1 | 2>(1);
  const [victim, setVictim] = useState<{ id: string; name: string } | null>(null);
  // The election is public, so every phone gets the same list.
  const [electionStage, setElectionStage] = useState<'nominate' | 'vote'>('nominate');
  const [mayorCandidates, setMayorCandidates] = useState<{ id: string; name: string }[]>([]);
  const [mayorId, setMayorId] = useState<string | null>(null);
  const [successionMayorId, setSuccessionMayorId] = useState<string | null>(null);
  // The engine decides which nights are peaceful; the round number alone would
  // lie as soon as the election runs late or a rematch re-deals.
  const [quietNight, setQuietNight] = useState(false);
  // The Alien still owes the table an answer, so the day cannot reach its vote.
  const [dayFrozen, setDayFrozen] = useState(false);
  // Whether the role card is covered, for when phones are handed around.
  const [roleHidden, setRoleHidden] = useState(false);
  // The public story of the game, built from what the host already tells us.
  const [log, setLog] = useState<string[]>([]);
  // The countdown is anchored when TIME_SYNC arrives, never on the raw clock,
  // because two phones rarely agree on the time.
  const [clock, setClock] = useState<{ remainingMs: number; receivedAt: number } | null>(
    null,
  );
  const [tickNow, setTickNow] = useState(Date.now());
  // The round as the message handler knows it: the handler outlives any single
  // render, so it reads the round from here rather than from state.
  const roundRef = React.useRef(1);
  // The last phase the handler saw. The election rebroadcasts its updates
  // between phases, and those cosmetic updates must not wipe a countdown.
  const phaseRef = React.useRef<Phase | null>(null);
  const [status, setStatus] = useState('Connecting to host...');
  const [disconnected, setDisconnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  // Bumped to re-attach the handlers to the new socket after a reconnect.
  const [linkVersion, setLinkVersion] = useState(0);

  useEffect(() => {
    const client = lobby.client;
    if (!client) {
      setStatus('Not connected to a host.');
      return;
    }

    client.onMessage(message => {
      switch (message.type) {
        case 'PLAYER_LIST':
          setRoster(message.payload?.players ?? []);
          break;

        case 'PHASE_UPDATE': {
          const payload = message.payload as PhaseUpdatePayload;
          setStatus('');
          setPhase(payload.phase);
          setRound(payload.round);
          const phaseChanged =
            phaseRef.current !== payload.phase || roundRef.current !== payload.round;
          roundRef.current = payload.round;
          phaseRef.current = payload.phase;
          setRoster(payload.players ?? []);
          setDeaths(payload.deaths ?? []);
          setMayorCandidates(payload.mayorCandidates ?? []);
          setMayorId(payload.mayorId ?? null);
          setSuccessionMayorId(payload.successionMayorId ?? null);
          setQuietNight(!!payload.quietNight);
          setDayFrozen(!!payload.dayFrozen);
          if (payload.electionStage) setElectionStage(payload.electionStage);
          if (phaseChanged) {
            // Submissions and the phase clock belong to the phase that just
            // ended. A tie re-vote clears its own through VOTE_RESULT.
            setSubmitted([]);
            setClock(null);
          }
          if (payload.phase === 'Debate') {
            setLog(prev => [
              `The candidates for mayor: ${(payload.mayorCandidates ?? [])
                .map(candidate => candidate.name)
                .join(', ')}.`,
              ...prev,
            ]);
          }
          setNightStage(1);
          setVictim(null);

          // Deaths are announced when the morning comes, not at nightfall, and
          // only on a real transition: the Alien's frozen day re-broadcasts
          // the same phase without any word about the dead.
          if (payload.phase === 'Day' && payload.deaths !== undefined) {
            setLog(prev => [
              payload.deaths?.length
                ? `Night ${payload.round}: ${payload.deaths.map(d => d.name).join(', ')} died.`
                : `Night ${payload.round}: nobody died.`,
              ...prev,
            ]);
          }
          break;
        }

        case 'ROLE_ASSIGN':
          // A rematch re-deals into the seat we already hold, so everything
          // from the previous game has to go with the new role.
          setRole(message.payload as RoleAssignPayload);
          setSecrets([]);
          setVoteResult(null);
          setOutcome(null);
          setDeaths([]);
          setSubmitted([]);
          setLog([]);
          setRoleHidden(false);
          setClock(null);
          setNightStage(1);
          setVictim(null);
          setDayFrozen(false);
          break;

        case 'TIME_SYNC': {
          const remainingMs = message.payload?.remainingMs;
          setClock(
            typeof remainingMs === 'number'
              ? { remainingMs, receivedAt: Date.now() }
              : null,
          );
          break;
        }

        case 'NIGHT_STAGE': {
          const payload = message.payload as NightStagePayload;
          setNightStage(payload.stage === 2 ? 2 : 1);
          // Only the witch is sent the victim; everyone else gets the stage.
          if (payload.victim !== undefined) setVictim(payload.victim ?? null);
          break;
        }

        case 'SECRET_INFO':
          setSecrets(prev => [...prev, message.payload?.message].filter(Boolean));
          break;

        case 'VOTE_RESULT': {
          const payload = message.payload as VoteResultPayload;
          setVoteResult(payload);

          if (payload.revote) {
            // Votes were wiped for a second round between the tied players.
            setSubmitted([]);
            setClock(null);
            setLog(prev => [
              `Day ${roundRef.current}: the vote was tied. Voting again.`,
              ...prev,
            ]);
          } else if (payload.eliminatedName) {
            setLog(prev => [
              `Day ${roundRef.current}: ${payload.eliminatedName} was voted out.`,
              ...prev,
            ]);
          } else if (payload.tie) {
            setLog(prev => [
              `Day ${roundRef.current}: the vote was tied again. Nobody left.`,
              ...prev,
            ]);
          }
          break;
        }

        case 'MAYOR_ELECTED': {
          const payload = message.payload as MayorElectedPayload;
          setMayorId(payload.playerId);
          setLog(prev => [`${payload.playerName} is the mayor.`, ...prev]);
          break;
        }

        case 'GAME_OVER': {
          const payload = message.payload as GameOverPayload;
          setOutcome(payload);
          setLog(prev => [winnerText(payload.winner, payload.winnerLabel), ...prev]);
          break;
        }

        case 'KICK':
          // Either the host took this seat away, or the game was already
          // running when this device joined.
          setStatus(
            message.payload?.reason === 'game-running'
              ? 'A game is already running on this host.'
              : message.payload?.reason === 'seat-taken'
              ? 'That name is already taken by another device at this table.'
              : 'The host removed you from the table.',
          );
          break;
      }
    });

    client.onClose(() => setDisconnected(true));

    // The game may have started before this screen mounted, so ask the host
    // to repeat what is private to us.
    client.sendMessage({ type: 'STATE_REQUEST', payload: {}, timestamp: Date.now() });

    return () => client.offMessage();
  }, [linkVersion]);

  // One tick a second while a countdown is running, so the remaining time
  // moves without the host having to say anything.
  useEffect(() => {
    if (!clock) return;
    const handle = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, [clock]);

  const reconnect = async () => {
    if (!localPlayer) return;

    setReconnecting(true);
    const reconnected = await lobby.reconnect(localPlayer);
    setReconnecting(false);

    if (!reconnected) {
      setStatus('Could not reach the host again.');
      return;
    }

    setDisconnected(false);
    // lobby.reconnect swapped in a fresh client, so re-attach to it.
    setLinkVersion(version => version + 1);
  };

  const ownRole: OwnRole | null = role
    ? {
        name: role.roleName,
        team: role.team,
        description: role.description,
        nightActions: role.nightActions,
        revengeOnDeath: role.revengeOnDeath,
        linksLovers: role.linksLovers,
        guessesRoles: role.guessesRoles,
        allies: role.allies ?? [],
      }
    : null;

  const submit = (actionId: string, targetId: string, roleId?: string) => {
    const client = lobby.client;
    if (!client || !localPlayer) return;

    if (actionId === 'alienGuess' && roleId) {
      client.sendMessage({
        type: 'ALIEN_GUESS',
        payload: { targetId, roleId },
        senderId: localPlayer.id,
        timestamp: Date.now(),
      });
    } else if (actionId === 'alienResume') {
      client.sendMessage({
        type: 'ALIEN_RESUME',
        payload: {},
        senderId: localPlayer.id,
        timestamp: Date.now(),
      });
    } else if (actionId === 'vote') {
      client.sendMessage({
        type: 'VOTE_CAST',
        payload: { targetId },
        senderId: localPlayer.id,
        timestamp: Date.now(),
      });
    } else if (actionId === 'mayor-vote') {
      client.sendMessage({
        type: 'MAYOR_VOTE',
        payload: { targetId },
        senderId: localPlayer.id,
        timestamp: Date.now(),
      });
    } else if (actionId === 'volunteer') {
      client.sendMessage({
        type: 'MAYOR_VOLUNTEER',
        payload: {},
        senderId: localPlayer.id,
        timestamp: Date.now(),
      });
    } else if (actionId === 'succession') {
      client.sendMessage({
        type: 'SUCCESSION',
        payload: { targetId },
        senderId: localPlayer.id,
        timestamp: Date.now(),
      });
    } else if (actionId === 'revenge') {
      client.sendMessage({
        type: 'REVENGE',
        payload: { targetId },
        senderId: localPlayer.id,
        timestamp: Date.now(),
      });
    } else if (actionId === 'pass') {
      // A declined potion is a decision the host has to see, or he keeps
      // waiting on a player who is done. The option id rides in targetId.
      client.sendMessage({
        type: 'NIGHT_PASS',
        payload: { action: targetId },
        senderId: localPlayer.id,
        timestamp: Date.now(),
      });
    } else {
      client.sendMessage({
        type: 'NIGHT_ACTION',
        payload: { action: actionId, targetId },
        senderId: localPlayer.id,
        timestamp: Date.now(),
      });
    }

    setSubmitted(prev => [...prev, actionId === 'pass' ? targetId : actionId]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Werewolf</Text>

      {disconnected && (
        <View style={styles.alertCard}>
          <Text style={styles.alertText}>
            Lost connection to the host. Your seat is held.
          </Text>
          <BaseButton
            title={reconnecting ? 'Reconnecting...' : 'Reconnect'}
            onPress={reconnect}
          />
        </View>
      )}

      {/* Phones get passed around and glanced at: the role can be covered. */}
      <View style={styles.roleCard}>
        <Text style={styles.roleLabel}>Your Role</Text>

        {roleHidden ? (
          <BaseButton
            title="Tap to show my role"
            onPress={() => setRoleHidden(false)}
            variant="secondary"
          />
        ) : (
          <>
            <Text style={styles.roleName}>{role?.roleName ?? '...'}</Text>
            <Text style={styles.roleTeam}>{role ? `${role.team} team` : ''}</Text>
            {role && <Text style={styles.roleDescription}>{role.description}</Text>}
            {role && (
              <BaseButton
                title="Hide my role"
                onPress={() => setRoleHidden(true)}
                variant="secondary"
              />
            )}
          </>
        )}
      </View>

      {!role && (
        <Text style={styles.hint}>
          {status || 'Waiting for the host to start the game...'}
        </Text>
      )}

      {outcome && (
        <View style={styles.winnerCard}>
          <Text style={styles.winnerText}>{winnerText(outcome.winner, outcome.winnerLabel)}</Text>
          {outcome.reveal.map(entry => (
            <Text key={entry.id} style={styles.revealText}>
              {entry.name}: {entry.role}
              {entry.isAlive ? '' : ' (dead)'}
            </Text>
          ))}
        </View>
      )}

      {!outcome && phase && (
        <View style={styles.statusCard}>
          <Text style={styles.statusText}>
            Phase: {phase} (round {round})
          </Text>
          {mayorId && (
            <Text style={styles.statusText}>
              Mayor:{' '}
              {roster.find(entry => entry.id === mayorId)?.name ?? 'a player'} (double vote)
            </Text>
          )}
          {clock && (
            <Text style={styles.timerText}>
              {formatRemaining(clock.remainingMs - (tickNow - clock.receivedAt))} left
            </Text>
          )}
          {deaths.length > 0 && (
            <Text style={styles.deathText}>
              Died in the night: {deaths.map(d => d.name).join(', ')}
            </Text>
          )}
          {voteResult && (
            <>
              <Text style={styles.statusText}>
                Last vote:{' '}
                {voteResult.revote
                  ? 'tied, vote again'
                  : voteResult.eliminatedName
                  ? `${voteResult.eliminatedName} was eliminated`
                  : voteResult.tie
                  ? 'tied, nobody eliminated'
                  : 'no votes cast'}
              </Text>
              {voteResult.ballots?.map(ballot => (
                <Text key={ballot.voterId} style={styles.ballotText}>
                  {ballot.voterName} → {ballot.targetName}
                </Text>
              ))}
            </>
          )}
        </View>
      )}

      {!outcome && ownRole?.allies && ownRole.allies.length > 0 && (
        <View style={styles.secretCard}>
          <Text style={styles.secretHeading}>
            {ownRole.team === 'Wolf' ? 'Your pack' : 'Your alliance'}
          </Text>
          {ownRole.allies.map(ally => (
            <Text key={ally.id} style={styles.secretText}>
              {ally.name}
            </Text>
          ))}
        </View>
      )}

      {roleHidden ? (
        // The panel names the night action, so it would give the role away just
        // as loudly as the card did.
        <Text style={styles.hint}>Show your role to act.</Text>
      ) : (
        <ActionPanel
          phase={phase}
          role={ownRole}
          selfId={localPlayer?.id ?? null}
          targets={roster}
          submitted={submitted}
          gameOver={!!outcome}
          quietNight={quietNight}
          selfAlive={roster.find(entry => entry.id === localPlayer?.id)?.isAlive ?? true}
          candidates={voteResult?.revote ? voteResult.candidates?.map(c => c.id) : undefined}
          nightStage={nightStage}
          victim={victim}
          electionStage={electionStage}
          mayorCandidates={mayorCandidates}
          successionMayorId={successionMayorId}
          dayFrozen={dayFrozen}
          onChoose={submit}
        />
      )}

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

      {log.length > 0 && (
        <View style={styles.secretCard}>
          <Text style={styles.secretHeading}>What has happened</Text>
          {log.slice(0, 12).map((entry, index) => (
            <Text key={index} style={styles.secretText}>
              {entry}
            </Text>
          ))}
        </View>
      )}

      <Text style={styles.subHeader}>Players</Text>
      {roster.map(entry => (
        <Text key={entry.id} style={[styles.playerText, !entry.isAlive && styles.dead]}>
          {entry.name}
          {entry.id === localPlayer?.id ? ' (you)' : ''}
          {entry.isAlive ? '' : ' — dead'}
        </Text>
      ))}

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
  alertCard: {
    backgroundColor: '#3A1E24',
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    marginBottom: theme.spacing.medium,
  },
  alertText: {
    color: theme.colors.text,
    fontSize: 15,
    marginBottom: theme.spacing.small,
  },
  timerText: {
    color: theme.colors.primary,
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: theme.spacing.small,
  },
  ballotText: {
    color: '#999',
    fontSize: 13,
    marginTop: 2,
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
  deathText: {
    color: theme.colors.danger,
    fontSize: 16,
    marginVertical: 4,
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
    marginBottom: theme.spacing.small,
  },
  revealText: {
    color: theme.colors.background,
    fontSize: 15,
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
  playerText: {
    color: theme.colors.text,
    fontSize: 16,
    marginVertical: 2,
  },
  dead: {
    textDecorationLine: 'line-through',
    color: '#666',
  },
  hint: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: theme.spacing.medium,
  },
});
