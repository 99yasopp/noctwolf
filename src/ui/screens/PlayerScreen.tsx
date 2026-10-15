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
  PhaseUpdatePayload,
  PlayerRef,
  RoleAssignPayload,
  VoteResultPayload,
} from '../../network/protocol';

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
          setRoster(payload.players ?? []);
          setDeaths(payload.deaths ?? []);
          setSubmitted([]);
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
          break;

        case 'SECRET_INFO':
          setSecrets(prev => [...prev, message.payload?.message].filter(Boolean));
          break;

        case 'VOTE_RESULT':
          setVoteResult(message.payload as VoteResultPayload);
          break;

        case 'GAME_OVER':
          setOutcome(message.payload as GameOverPayload);
          break;

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
        allies: role.allies ?? [],
      }
    : null;

  const submit = (actionId: string, targetId: string) => {
    const client = lobby.client;
    if (!client || !localPlayer) return;

    if (actionId === 'vote') {
      client.sendMessage({
        type: 'VOTE_CAST',
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
    } else {
      client.sendMessage({
        type: 'NIGHT_ACTION',
        payload: { action: actionId, targetId },
        senderId: localPlayer.id,
        timestamp: Date.now(),
      });
    }

    setSubmitted(prev => [...prev, actionId]);
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

      <View style={styles.roleCard}>
        <Text style={styles.roleLabel}>Your Role</Text>
        <Text style={styles.roleName}>{role?.roleName ?? '...'}</Text>
        <Text style={styles.roleTeam}>{role ? `${role.team} team` : ''}</Text>
        {role && <Text style={styles.roleDescription}>{role.description}</Text>}
      </View>

      {!role && (
        <Text style={styles.hint}>
          {status || 'Waiting for the host to start the game...'}
        </Text>
      )}

      {outcome && (
        <View style={styles.winnerCard}>
          <Text style={styles.winnerText}>
            {outcome.winner === 'Wolf'
              ? 'Werewolves win!'
              : outcome.winner === 'Solitary'
              ? 'The Lovers win!'
              : 'Village wins!'}
          </Text>
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
          {deaths.length > 0 && (
            <Text style={styles.deathText}>
              Died in the night: {deaths.map(d => d.name).join(', ')}
            </Text>
          )}
          {voteResult && (
            <Text style={styles.statusText}>
              Last vote:{' '}
              {voteResult.eliminatedName
                ? `${voteResult.eliminatedName} was eliminated`
                : voteResult.tie
                ? 'tied, nobody eliminated'
                : 'no votes cast'}
            </Text>
          )}
        </View>
      )}

      {!outcome && ownRole?.allies && ownRole.allies.length > 0 && (
        <View style={styles.secretCard}>
          <Text style={styles.secretHeading}>Your pack</Text>
          {ownRole.allies.map(ally => (
            <Text key={ally.id} style={styles.secretText}>
              {ally.name}
            </Text>
          ))}
        </View>
      )}

      <ActionPanel
        phase={phase}
        role={ownRole}
        selfId={localPlayer?.id ?? null}
        targets={roster}
        submitted={submitted}
        gameOver={!!outcome}
        quietNight={round === 1}
        onChoose={submit}
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
