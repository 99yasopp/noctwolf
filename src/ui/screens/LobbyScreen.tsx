import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Platform } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { GAME_PORT, HOST_PLAYER_ID, LOCAL_GUEST_ID, lobby } from '../../network/lobby';
import { getPreset, ROLE_PRESETS, setCustomRoles } from '../../engine/roleSet';
import { loadCustomRoles } from '../../services/customRoles';
import { loadPreferences, savePreferences } from '../../services/preferences';
import { SettingsScreen } from './SettingsScreen';
import { RulesScreen } from './RulesScreen';
import { SetupScreen } from './SetupScreen';
import {
  RoleSetup,
  buildSetupRoles,
  setupFromRoles,
  setupProblem,
} from '../../engine/setup';
import { Player } from '../../engine/types';
import { useGame } from '../GameContext';
import { randomPlayerName } from '../randomName';

type LobbyView = 'menu' | 'host' | 'join' | 'waiting' | 'settings' | 'rules' | 'setup';

const MIN_PLAYERS = 3;

// A browser cannot bind a port, so it is always a guest. The rest of the
// screen only differs in the hints it shows.
const WEB = Platform.OS === 'web';

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
  // The host's table: null until the saved one is read or a starter is seeded.
  const [setup, setSetup] = useState<RoleSetup | null>(null);
  // Seeding a starter from the preset must wait for the saved table: the two
  // land in the same breath when this screen mounts straight from a game.
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  // Lets the setup picker show Custom only once there are roles to deal.
  const [customRoleCount, setCustomRoleCount] = useState(0);

  useEffect(() => {
    loadCustomRoles().then(roles => {
      setCustomRoles(roles);
      setCustomRoleCount(roles.length);
    });

    // Remember where this device last joined, and which setup this host likes.
    loadPreferences().then(saved => {
      if (saved.lastHost) setInputIp(saved.lastHost);
      if (saved.presetId) setPresetId(saved.presetId);
      if (saved.setup) setSetup(saved.setup);
      setPrefsLoaded(true);
    });
  }, []);

  // The host can come back here from a finished game with the room still up:
  // he lands in the waiting room he left, with the same seats, instead of the
  // main menu where he would start over.
  useEffect(() => {
    if (!lobby.isHosting()) return;

    setIsHost(true);
    setRoomCode(lobby.getRoomCode());
    setPlayers([...lobby.getPlayers()]);
    setView('waiting');
  }, []);

  const preset = getPreset(presetId);

  // Every change to the table is kept, so the next evening opens on it.
  const changeSetup = (next: RoleSetup) => {
    setSetup(next);
    savePreferences({ setup: next });
  };

  // The first look at the waiting room seeds the table from the chosen
  // starter: after that the host's own counts are left alone.
  useEffect(() => {
    if (view !== 'waiting' || !isHost || setup || !prefsLoaded) return;
    changeSetup(setupFromRoles(preset.build(Math.max(players.length, 1))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, isHost, setup, players.length, preset, prefsLoaded]);

  const seedFromPreset = (id: string) => {
    setPresetId(id);
    savePreferences({ presetId: id });
  };

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
            : message.payload?.reason === 'seat-taken'
            ? 'That name is already taken by another device at this table.'
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

    const code = inputCode.trim().toUpperCase();
    const ip = inputIp.trim();

    // Nothing to try: an empty code would just spend the search window.
    if (!code && !ip) {
      setError(
        WEB
          ? 'Enter the host address to join.'
          : 'Enter the room code, or the host address.',
      );
      return;
    }

    setBusy(true);

    // The code is the phone's primary path, so it wins when both fields are
    // filled; the IP is only there for when the search finds nothing. The IP
    // field is pre-filled from the last session, so the reverse order would
    // make the code field unusable on a returning device.
    const succeeded = code
      ? await lobby.joinGame(code, buildGuest())
      : await lobby.joinGameByIp(ip, buildGuest(), GAME_PORT);

    setBusy(false);

    if (!succeeded) {
      setError(
        code
          ? 'Could not find that room code. Check it, or clear it and join by the IP.'
          : `Could not reach ${ip}:${GAME_PORT}. Check the address and that the host is hosting.`,
      );
      return;
    }

    setIsHost(false);
    setView('waiting');
    if (ip) savePreferences({ lastHost: ip });
  };

  const startGame = () => {
    const roster = lobby.getPlayers();
    const host = roster.find(p => p.id === HOST_PLAYER_ID);

    if (!host || roster.length < MIN_PLAYERS) {
      setError(`You need at least ${MIN_PLAYERS} players to start.`);
      return;
    }

    const problem = setup ? setupProblem(setup, roster.length) : null;
    if (problem) {
      setError(problem);
      return;
    }

    setError('');
    startHostGame(roster, host, setup ?? setupFromRoles(preset.build(roster.length)));
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
            {lobby.canHost() && (
              <BaseButton title="Host a Game" onPress={() => setView('host')} />
            )}
            <BaseButton title="Join a Game" onPress={() => setView('join')} variant="secondary" />
            {!lobby.canHost() && (
              <Text style={styles.hint}>
                This browser joins as a guest. Host the table from the phone app.
              </Text>
            )}
            <BaseButton title="How to Play" onPress={() => setView('rules')} variant="secondary" />
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
            {!WEB && (
              <TextInput
                style={styles.input}
                placeholder="Room code"
                placeholderTextColor="#666"
                value={inputCode}
                onChangeText={setInputCode}
                autoCapitalize="characters"
              />
            )}
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
              {WEB
                ? 'Type the address shown in the waiting room on the host phone.'
                : "The IP is the fallback: fill it only if the code search finds nothing."}
            </Text>
            <BaseButton title={busy ? 'Joining...' : 'Join'} onPress={joinGame} />
            <BaseButton title="Back" onPress={() => setView('menu')} variant="danger" />
          </View>
        );

      case 'waiting':
        return (
          <ScrollView contentContainerStyle={styles.menu}>
            {isHost && <Text style={styles.text}>Room Code: {roomCode}</Text>}
            {isHost && (
              <Text style={styles.text}>
                Address: {lobby.getHostAddress() ?? 'unknown - check Wi-Fi settings'}
              </Text>
            )}
            {isHost && (
              <Text style={styles.hint}>
                Guests type one of the two: the code, or the address. Both work
                from the app, the address also from a browser.
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

            {isHost && setup && (
              <BaseButton
                title="Table setup"
                onPress={() => setView('setup')}
                variant="secondary"
              />
            )}
            {isHost && setup && (
              <Text style={styles.hint}>
                This table:{' '}
                {buildSetupRoles(setup, Math.max(players.length, 1))
                  .map(role => role.name)
                  .join(', ')}
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

  if (view === 'setup' && setup) {
    return (
      <SetupScreen
        setup={setup}
        presetId={presetId}
        playerCount={Math.max(players.length, 1)}
        onChange={changeSetup}
        onPreset={seedFromPreset}
        onBack={() => setView('waiting')}
      />
    );
  }

  // Settings takes the whole screen: it has its own scrolling and header.
  if (view === 'rules') {
    return <RulesScreen onBack={() => setView('menu')} />;
  }

  if (view === 'settings') {
    return (
      <SettingsScreen
        onBack={() => {
          setView('menu');
          // Roles made in the workshop have to show up in the setup picker
          // straight away, without restarting the app.
          loadCustomRoles().then(roles => setCustomRoleCount(roles.length));
        }}
      />
    );
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
