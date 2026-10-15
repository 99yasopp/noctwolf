import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { GAME_PORT, HOST_PLAYER_ID, LOCAL_GUEST_ID, lobby } from '../../network/lobby';
import { getPreset, getCustomRoles, ROLE_PRESETS, setCustomRoles } from '../../engine/roleSet';
import { loadCustomRoles } from '../../services/customRoles';
import { SettingsScreen } from './SettingsScreen';
import { Player } from '../../engine/types';
import { useGame } from '../GameContext';
import { randomPlayerName } from '../randomName';

type LobbyView = 'menu' | 'host' | 'join' | 'waiting' | 'settings';

const MIN_PLAYERS = 3;

// Randomised so two devices left on the default do not look alike, and stable
// for the life of the app run so leaving a game does not rename the player.
const initialPlayerName = randomPlayerName();

export const LobbyScreen = () => {
  const { startHostGame, enterPlayerMode } = useGame();

  // Stable guest identity: the host keys players by id, so it must not change
  // between the join attempt and the game starting.
  const guestRef = React.useRef<Player | null>(null);

  const [view, setView] = useState<LobbyView>('menu');
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [inputIp, setInputIp] = useState('');
  const [playerName, setPlayerName] = useState(initialPlayerName);
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [presetId, setPresetId] = useState(ROLE_PRESETS[0].id);
  // Lets the setup picker show Custom only once there are roles to deal.
  const [customRoleCount, setCustomRoleCount] = useState(0);

  useEffect(() => {
    loadCustomRoles().then(roles => {
      setCustomRoles(roles);
      setCustomRoleCount(roles.length);
    });
  }, []);

  const availablePresets = ROLE_PRESETS.filter(
    entry => entry.id !== 'custom' || customRoleCount > 0,
  );
  const preset = getPreset(presetId);
  const cyclePreset = () =>
    setPresetId(current => {
      const index = availablePresets.findIndex(entry => entry.id === current);
      return availablePresets[(index + 1) % availablePresets.length].id;
    });

  // The host owns the roster; guests receive it over the network.
  useEffect(() => {
    if (view !== 'waiting' || !isHost) return;

    const refresh = () => setPlayers([...lobby.getPlayers()]);
    refresh();

    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, [view, isHost]);

  // A guest stays in the waiting room until the host starts the game, which
  // is signalled by the first role or phase message.
  useEffect(() => {
    if (view !== 'waiting' || isHost) return;

    const client = lobby.client;
    const me = guestRef.current;
    if (!client || !me) return;

    let handedOff = false;

    const handler = (message: any) => {
      if (message?.type === 'PLAYER_LIST') {
        setPlayers(message.payload?.players ?? []);
        return;
      }

      if (message?.type === 'KICK') {
        setError(
          message.payload?.reason === 'game-running'
            ? 'A game is already running on this host.'
            : 'The host removed you from the table.',
        );
        return;
      }

      if (
        message?.type === 'ROLE_ASSIGN' ||
        message?.type === 'PHASE_UPDATE' ||
        message?.type === 'GAME_OVER'
      ) {
        handedOff = true;
        // PlayerScreen takes over the message handler on mount.
        enterPlayerMode(me);
      }
    };

    client.onMessage(handler);
    client.onClose(() => setError('Lost connection to the host.'));
    return () => {
      if (!handedOff) client.offMessage();
    };
  }, [view, isHost, enterPlayerMode]);

  const buildGuest = (): Player => {
    // Clearing the name field must not put us back on a shared default.
    const name = playerName.trim() || initialPlayerName;

    if (!guestRef.current) {
      guestRef.current = guest(LOCAL_GUEST_ID, name);
    }
    guestRef.current.name = name;
    return guestRef.current;
  };

  const hostGame = () => {
    setError('');

    const code = lobby.generateRoomCode();
    if (!code) {
      setError('Could not start hosting on this device.');
      return;
    }

    lobby.addPlayer({
      id: HOST_PLAYER_ID,
      name: playerName.trim() || initialPlayerName,
      role: 'Unknown',
      team: 'Village',
      isAlive: true,
      statusEffects: [],
      voteWeight: 1,
    });

    setIsHost(true);
    setRoomCode(code);
    setView('waiting');
  };

  const joinGame = async () => {
    setError('');
    setBusy(true);

    const succeeded = inputIp.trim()
      ? await lobby.joinGameByIp(inputIp, buildGuest(), GAME_PORT)
      : await lobby.joinGame(inputCode.trim().toUpperCase(), buildGuest());

    setBusy(false);

    if (!succeeded) {
      setError(
        inputIp.trim()
          ? `Could not reach ${inputIp.trim()}:${GAME_PORT}. Check the address and that the host is hosting.`
          : 'Could not find that room code. Try joining by IP instead.',
      );
      return;
    }

    setIsHost(false);
    setView('waiting');
  };

  const startGame = () => {
    const roster = lobby.getPlayers();
    const host = roster.find(p => p.id === HOST_PLAYER_ID);

    if (!host || roster.length < MIN_PLAYERS) {
      setError(`You need at least ${MIN_PLAYERS} players to start.`);
      return;
    }

    setError('');
    startHostGame(roster, host, presetId);
  };

  // Lets the host exercise a full game without extra devices. Bots act and
  // vote on their own.
  const addTestPlayer = () => {
    const botNumber = lobby.getPlayers().filter(p => p.isBot).length + 1;

    lobby.addPlayer({
      id: `bot-${botNumber}`,
      name: `Bot ${botNumber}`,
      role: 'Unknown',
      team: 'Village',
      isAlive: true,
      statusEffects: [],
      voteWeight: 1,
      isBot: true,
    });

    setPlayers([...lobby.getPlayers()]);
  };

  const backToMenu = () => {
    if (isHost) lobby.closeRoom();
    else lobby.disconnectClient();

    setIsHost(false);
    setPlayers([]);
    setRoomCode('');
    setError('');
    setView('menu');
  };

  const renderView = () => {
    switch (view) {
      case 'menu':
        return (
          <View style={styles.menu}>
            <TextInput
              style={styles.input}
              placeholder="Enter your name"
              placeholderTextColor="#666"
              value={playerName}
              onChangeText={setPlayerName}
            />
            <BaseButton title="Host a Game" onPress={() => setView('host')} />
            <BaseButton title="Join a Game" onPress={() => setView('join')} variant="secondary" />
            <BaseButton
              title="Settings"
              onPress={() => setView('settings')}
              variant="secondary"
            />
          </View>
        );

      case 'host':
        return (
          <View style={styles.menu}>
            <Text style={styles.text}>Hosting...</Text>
            <BaseButton title="Generate Code & Start" onPress={hostGame} />
            <BaseButton title="Back" onPress={() => setView('menu')} variant="danger" />
          </View>
        );

      case 'join':
        return (
          <View style={styles.menu}>
            <TextInput
              style={styles.input}
              placeholder="Host IP (e.g. 192.168.0.42)"
              placeholderTextColor="#666"
              value={inputIp}
              onChangeText={setInputIp}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              Leave the IP empty to search for the room code instead.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Room code (optional)"
              placeholderTextColor="#666"
              value={inputCode}
              onChangeText={setInputCode}
              autoCapitalize="characters"
            />
            <BaseButton title={busy ? 'Joining...' : 'Join'} onPress={joinGame} />
            <BaseButton title="Back" onPress={() => setView('menu')} variant="danger" />
          </View>
        );

      case 'waiting':
        return (
          <ScrollView contentContainerStyle={styles.menu}>
            {isHost && <Text style={styles.text}>Room Code: {roomCode}</Text>}
            {isHost && (
              <Text style={styles.hint}>
                Guests join by IP. Your address is shown on your phone's Wi-Fi settings.
              </Text>
            )}
            <Text style={styles.title}>Waiting Room</Text>
            <Text style={styles.text}>Players connected ({players.length}):</Text>

            {players.map(p => (
              <Text key={p.id} style={styles.playerText}>
                {p.name}
                {p.id === HOST_PLAYER_ID ? ' (host)' : ''}
                {p.isBot ? ' [bot]' : ''}
              </Text>
            ))}

            {isHost && (
              <BaseButton
                title={`Setup: ${preset.name}`}
                onPress={cyclePreset}
                variant="secondary"
              />
            )}
            {isHost && <Text style={styles.hint}>{preset.description}</Text>}
            {isHost && (
              <Text style={styles.hint}>
                This table: {preset.build(Math.max(players.length, 1)).map(r => r.name).join(', ')}
              </Text>
            )}

            {isHost && (
              <BaseButton title="Add Test Player" onPress={addTestPlayer} variant="secondary" />
            )}

            {isHost && (
              <BaseButton
                title={
                  players.length >= MIN_PLAYERS
                    ? 'Start Game'
                    : `Start Game (${players.length}/${MIN_PLAYERS})`
                }
                onPress={startGame}
              />
            )}

            {!isHost && <Text style={styles.hint}>Waiting for the host to start...</Text>}

            <BaseButton title="Back" onPress={backToMenu} variant="danger" />
          </ScrollView>
        );
    }
  };

  // Settings takes the whole screen: it has its own scrolling and header.
  if (view === 'settings') {
    return <SettingsScreen onBack={() => setView('menu')} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Werewolf Manager</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {renderView()}
    </View>
  );
};

const guest = (id: string, name: string): Player => ({
  id,
  name: name.trim() || initialPlayerName,
  role: 'Unknown',
  team: 'Village',
  isAlive: true,
  statusEffects: [],
  voteWeight: 1,
});

const styles = StyleSheet.create({
  menu: {
    width: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    padding: theme.spacing.medium,
  },
  title: {
    fontSize: 32,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.large,
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    marginBottom: theme.spacing.small,
  },
  playerText: {
    color: theme.colors.secondary,
    fontSize: 18,
    textAlign: 'center',
    marginVertical: 4,
  },
  text: {
    color: theme.colors.text,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: theme.spacing.small,
  },
  hint: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: theme.spacing.small,
  },
  error: {
    color: theme.colors.danger,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: theme.spacing.small,
  },
});
