import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Text, TextInput } from '../text';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { BackBar } from '../components/BackBar';
import { useBack } from '../back';
import { GAME_PORT, HOST_PLAYER_ID, LOCAL_GUEST_ID, lobby } from '../../network/lobby';
import { splitHostAddress } from '../../network/address';
import { setCustomRoles } from '../../engine/roleSet';
import { loadCustomRoles } from '../../services/customRoles';
import { loadPreferences, savePreferences } from '../../services/preferences';
import { SettingsScreen } from './SettingsScreen';
import { RulesScreen } from './RulesScreen';
import { SetupScreen } from './SetupScreen';
import {
  RoleSetup,
  buildSetupRoles,
  defaultRoleSetup,
  setupProblem,
} from '../../engine/setup';
import { Player } from '../../engine/types';
import { useGame } from '../GameContext';
import { useI18n } from '../i18n';
import { roleName } from '../../i18n';
import { randomPlayerName } from '../randomName';

type LobbyView = 'menu' | 'host' | 'join' | 'waiting' | 'settings' | 'rules' | 'setup';

const MIN_PLAYERS = 3;

// A browser cannot bind a port, so it is always a guest. The rest of the
// screen only differs in the hints it shows.
const WEB = Platform.OS === 'web';

// Randomised so two devices left on the default do not look alike, and stable
// for the life of the app run so leaving a game does not rename the player.
const initialPlayerName = randomPlayerName();

// The highest bot number on the roster, so a fresh bot never takes an id that
// is already in use.
const lastBotNumber = () =>
  lobby.getPlayers().reduce((max, p) => {
    const n = p.isBot ? Number(p.id.split('-')[1]) : 0;
    return n > max ? n : max;
  }, 0);

export const LobbyScreen = () => {
  const { startHostGame, enterPlayerMode } = useGame();

  // Stable guest identity: the host keys players by id, so it must not change
  // between the join attempt and the game starting.
  const guestRef = React.useRef<Player | null>(null);
  const { t } = useI18n();

  const [view, setView] = useState<LobbyView>('menu');
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [inputIp, setInputIp] = useState('');
  const [playerName, setPlayerName] = useState(initialPlayerName);
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [isHost, setIsHost] = useState(false);
  // The host's table: null until the saved one is read, then the empty table
  // he builds himself.
  const [setup, setSetup] = useState<RoleSetup | null>(null);
  // Reading the saved table has to finish before an empty one is kept in its
  // place, or it would be overwritten the moment the waiting room opens.
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  // Lets the setup picker show Custom only once there are roles to deal.
  const [customRoleCount, setCustomRoleCount] = useState(0);
  // A room the host left and came back to may already have bots on it.
  const botSeq = React.useRef(lastBotNumber());

  useEffect(() => {
    loadCustomRoles().then(roles => {
      setCustomRoles(roles);
      setCustomRoleCount(roles.length);
    });

    // Remember where this device last joined, and the setup this host likes.
    loadPreferences().then(saved => {
      if (saved.lastHost) setInputIp(saved.lastHost);
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

  // Every change to the table is kept, so the next evening opens on it.
  const changeSetup = (next: RoleSetup) => {
    setSetup(next);
    savePreferences({ setup: next });
  };

  // The first look at the waiting room opens an empty table: no role is dealt
  // until the host has named one himself.
  useEffect(() => {
    if (view !== 'waiting' || !isHost || setup || !prefsLoaded) return;
    changeSetup(defaultRoleSetup());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, isHost, setup, prefsLoaded]);

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
            ? t('ui.common.gameRunning')
            : message.payload?.reason === 'seat-taken'
            ? t('ui.common.nameTaken')
            : t('ui.common.removedFromTable'),
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
    client.onClose(() => setError(t('ui.common.lostConnection')));
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
      setError(t('ui.lobby.hostFailed'));
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
    // What the error sentence reports: the port may have come with the typed
    // address, and the game's own port fills in when it did not.
    const address = splitHostAddress(ip, GAME_PORT);

    // Nothing to try: an empty code would just spend the search window.
    if (!code && !ip) {
      setError(WEB ? t('ui.lobby.enterIp') : t('ui.lobby.enterCodeOrIp'));
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
          ? t('ui.lobby.codeNotFound')
          : t('ui.lobby.hostUnreachable', {
              host: address.host,
              port: address.port,
            }),
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
      setError(t('ui.lobby.needPlayers', { count: MIN_PLAYERS }));
      return;
    }

    // A table with nothing on it is not a problem to report: it is simply not
    // ready, and setupProblem says so.
    const setupToDeal = setup ?? defaultRoleSetup();
    const problem = setupProblem(setupToDeal, roster.length);
    if (problem) {
      setError(problem);
      return;
    }

    setError('');
    startHostGame(roster, host, setupToDeal);
  };

  // Lets the host exercise a full game without extra devices. Bots act and
  // vote on their own.
  const addTestPlayer = () => {
    // Bot seats are numbered once and never reused, so removing one and adding
    // another cannot land on the same id.
    const botNumber = ++botSeq.current;

    lobby.addPlayer({
      id: `bot-${botNumber}`,
      name: t('ui.lobby.botName', { number: botNumber }),
      role: 'Unknown',
      team: 'Village',
      isAlive: true,
      statusEffects: [],
      voteWeight: 1,
      isBot: true,
    });

    setPlayers([...lobby.getPlayers()]);
  };

  // A bot that no longer fits the table goes back out without a restart.
  const removeBot = (id: string) => {
    lobby.removePlayer(id);
    setPlayers([...lobby.getPlayers()]);
    setError('');
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

  // The back gesture means what the screen's own back control means. The table
  // picker, the rules and the settings bring theirs with them.
  useBack(
    view === 'host' || view === 'join'
      ? () => setView('menu')
      : view === 'waiting'
      ? backToMenu
      : null,
  );

  const renderView = () => {
    switch (view) {
      case 'menu':
        return (
          <View style={styles.menu}>
            <TextInput
              style={styles.input}
              placeholder={t('ui.lobby.namePlaceholder')}
              placeholderTextColor="#666"
              value={playerName}
              onChangeText={setPlayerName}
            />
            {lobby.canHost() && (
              <BaseButton title={t('ui.lobby.host')} onPress={() => setView('host')} />
            )}
            <BaseButton
              title={t('ui.lobby.join')}
              onPress={() => setView('join')}
              variant="secondary"
            />
            {!lobby.canHost() && (
              <Text style={styles.hint}>{t('ui.lobby.webGuest')}</Text>
            )}
            <BaseButton
              title={t('ui.lobby.howToPlay')}
              onPress={() => setView('rules')}
              variant="secondary"
            />
            <BaseButton
              title={t('ui.lobby.settings')}
              onPress={() => setView('settings')}
              variant="secondary"
            />
          </View>
        );

      case 'host':
        return (
          <View style={styles.menu}>
            <Text style={styles.text}>{t('ui.lobby.hosting')}</Text>
            <BaseButton title={t('ui.lobby.generate')} onPress={hostGame} />
          </View>
        );

      case 'join':
        return (
          <View style={styles.menu}>
            {!WEB && (
              <TextInput
                style={styles.input}
                placeholder={t('ui.lobby.roomCodePlaceholder')}
                placeholderTextColor="#666"
                value={inputCode}
                onChangeText={setInputCode}
                autoCapitalize="characters"
              />
            )}
            <TextInput
              style={styles.input}
              placeholder={t('ui.lobby.hostIpPlaceholder')}
              placeholderTextColor="#666"
              value={inputIp}
              onChangeText={setInputIp}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              {WEB ? t('ui.lobby.codeHint') : t('ui.lobby.ipHint')}
            </Text>
            <BaseButton
              title={busy ? t('ui.lobby.joining') : t('ui.lobby.joinAction')}
              onPress={joinGame}
            />
          </View>
        );

      case 'waiting':
        return (
          <ScrollView contentContainerStyle={styles.menu}>
            {isHost && <Text style={styles.text}>
              {t('ui.lobby.roomCodeLine', { code: roomCode })}
            </Text>}
            {isHost && (
              <Text style={styles.text}>
                {t('ui.lobby.addressLine', {
                  address: lobby.getHostAddress() ?? t('ui.lobby.unknownAddress'),
                })}
              </Text>
            )}
            {isHost && (
              <Text style={styles.hint}>{t('ui.lobby.twoWays')}</Text>
            )}
            <Text style={styles.title}>{t('ui.lobby.waitingRoom')}</Text>
            <Text style={styles.text}>
              {t('ui.lobby.connected', { count: players.length })}
            </Text>

            {players.map(p => (
              <View key={p.id} style={styles.playerRow}>
                <Text style={styles.playerText}>
                  {p.name}
                  {p.id === HOST_PLAYER_ID ? t('ui.common.hostTag') : ''}
                  {p.isBot ? t('ui.roster.botTag') : ''}
                </Text>
                {isHost && p.isBot && (
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeBot(p.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.removeText}>{t('ui.common.remove')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {isHost && setup && (
              <BaseButton
                title={t('ui.lobby.tableSetup')}
                onPress={() => setView('setup')}
                variant="secondary"
              />
            )}
            {isHost && setup && (
              <Text style={styles.hint}>
                {t('ui.lobby.thisTable', {
                  roles: buildSetupRoles(setup, Math.max(players.length, 1))
                    .map(role => roleName(role.id, role.name))
                    .join(', '),
                })}
              </Text>
            )}

            {isHost && (
              <BaseButton
                title={t('ui.lobby.addBot')}
                onPress={addTestPlayer}
                variant="secondary"
              />
            )}

            {isHost && (
              <BaseButton
                title={
                  players.length >= MIN_PLAYERS
                    ? t('ui.lobby.startGame')
                    : t('ui.lobby.startGameCount', {
                        count: players.length,
                        min: MIN_PLAYERS,
                      })
                }
                onPress={startGame}
              />
            )}

            {!isHost && <Text style={styles.hint}>{t('ui.lobby.waitingForHost')}</Text>}
          </ScrollView>
        );
    }
  };

  if (view === 'setup' && setup) {
    return (
      <SetupScreen
        setup={setup}
        playerCount={Math.max(players.length, 1)}
        onChange={changeSetup}
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
      {view !== 'menu' && <BackBar />}
      <View style={styles.center}>
        <Text style={styles.title}>Werewolf Manager</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {renderView()}
      </View>
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
  },
  // The main menu sits in the middle of the screen; the back bar stays on top.
  center: {
    flex: 1,
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
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
