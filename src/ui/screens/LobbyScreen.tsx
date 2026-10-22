import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, TextInput } from '../text';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { TactileButton } from '../components/TactileButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { RosterRow } from '../components/RosterRow';
import { useBack } from '../back';
import { useResponsive } from '../layout';
import { GAME_PORT, HOST_PLAYER_ID, LOCAL_GUEST_ID, lobby } from '../../network/lobby';
import { splitHostAddress } from '../../network/address';
import { setCustomRoles } from '../../engine/roleSet';
import { loadCustomRoles } from '../../services/customRoles';
import { loadPreferences, savePreferences } from '../../services/preferences';
import { SettingsScreen } from './SettingsScreen';
import { RulesScreen } from './RulesScreen';
import { SetupScreen } from './SetupScreen';
import {
  SETTING_DEFS,
  RoleSetup,
  defaultRoleSetup,
  settingLabel,
  settingName,
  setupProblem,
  setupRoleLines,
  setupSetting,
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

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const MenuLink = ({
  title,
  icon,
  onPress,
}: {
  title: string;
  icon: IconName;
  onPress: () => void;
}) => (
  <Pressable
    style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={title}
  >
    <Ionicons name={icon} size={17} color={theme.colors.dim} />
    <Text style={styles.linkText}>{title}</Text>
  </Pressable>
);

export const LobbyScreen = () => {
  const { startHostGame, enterPlayerMode } = useGame();

  // Stable guest identity: the host keys players by id, so it must not change
  // between the join attempt and the game starting.
  const guestRef = React.useRef<Player | null>(null);
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { gutter } = useResponsive();

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
  // A room the host left and came back to may already have bots on it.
  const botSeq = React.useRef(lastBotNumber());

  useEffect(() => {
    loadCustomRoles().then(roles => setCustomRoles(roles));

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

  // The host owns the roster; guests receive the same snapshot over the
  // network. Both read the lobby cache, so a screen that mounts after the
  // first snapshot still sees the table.
  useEffect(() => {
    if (view !== 'waiting') return;

    const refresh = () => {
      setPlayers([...lobby.getPlayers()]);
      if (!isHost) setSetup(lobby.getTableSetup());
    };

    refresh();
    return lobby.onRosterChanged(refresh);
  }, [view, isHost]);

  // Publish the table as the host builds it. A guest sees the roles and house
  // rules change while he waits, not only when the deal is made.
  useEffect(() => {
    if (!isHost || !setup) return;
    lobby.setTableSetup(setup);
  }, [isHost, setup]);

  // A guest stays in the waiting room until the host starts the game, which
  // is signalled by the first role or phase message.
  useEffect(() => {
    if (view !== 'waiting' || isHost) return;

    const client = lobby.client;
    const me = guestRef.current;
    if (!client || !me) return;

    let handedOff = false;

    const handler = (message: any) => {
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

    lobby.onGuestMessage(handler);
    client.onClose(() => setError(t('ui.common.lostConnection')));
    return () => {
      if (!handedOff) lobby.offGuestMessage();
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

  // A browser can be stopped before the phone ever answers: an https page may
  // not open ws://, and the machine may sit behind a VPN. Say which one it is.
  const webFailureHint = () => {
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:') {
      return t('ui.lobby.webHttps');
    }
    return t('ui.lobby.webCheck');
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
      const reason = code
        ? t('ui.lobby.codeNotFound')
        : t('ui.lobby.hostUnreachable', {
            host: address.host,
            port: address.port,
          });
      setError(WEB ? `${reason}\n${webFailureHint()}` : reason);
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

    lobby.publishLobbyState();
  };

  // A bot that no longer fits the table goes back out without a restart.
  const removeBot = (id: string) => {
    lobby.removePlayer(id);
    setError('');
  };

  const backToMenu = () => {
    if (isHost) lobby.closeRoom();
    else lobby.disconnectClient();

    setIsHost(false);
    setPlayers([]);
    setSetup(isHost ? setup : null);
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

  const tableRoles = setup
    ? setupRoleLines(setup, lobby.getRoleNames(), players.length).map(line => {
        const name = roleName(line.id, line.name);
        return line.count > 1 ? `${name} ×${line.count}` : name;
      })
    : [];
  const tableRules = setup
    ? SETTING_DEFS.filter(
        def => !def.whenRole || (setup.counts?.[def.whenRole] ?? 0) > 0,
      )
    : [];

  const renderView = () => {
    switch (view) {
      case 'menu':
        return (
          <View style={styles.menu}>
            <View style={styles.brand}>
              <View style={styles.mark}>
                <View style={styles.moon} />
                <View style={styles.moonCut} />
              </View>
              <Text style={styles.wordmark}>Loup</Text>
              <Text style={[styles.wordmark, styles.wordmarkGold]}>Garou</Text>
              <Text style={styles.tagline}>{t('ui.lobby.tagline')}</Text>
            </View>

            <View style={styles.form}>
              <Text style={styles.fieldLabel}>{t('ui.lobby.namePlaceholder')}</Text>
              <TextInput
                style={styles.field}
                value={playerName}
                onChangeText={setPlayerName}
              />
              {lobby.canHost() ? (
                <TactileButton
                  title={t('ui.lobby.host')}
                  icon="people"
                  onPress={() => setView('host')}
                  style={styles.menuButton}
                />
              ) : null}
              <TactileButton
                title={t('ui.lobby.join')}
                icon={lobby.canHost() ? 'log-in-outline' : 'log-in'}
                variant={lobby.canHost() ? 'secondary' : 'primary'}
                onPress={() => setView('join')}
                style={styles.menuButton}
              />
              {!lobby.canHost() && (
                <Text style={styles.menuHint}>{t('ui.lobby.webGuest')}</Text>
              )}

              <View style={styles.links}>
                <MenuLink
                  title={t('ui.lobby.howToPlay')}
                  icon="book-outline"
                  onPress={() => setView('rules')}
                />
                <View style={styles.linkDivider} />
                <MenuLink
                  title={t('ui.lobby.settings')}
                  icon="settings-outline"
                  onPress={() => setView('settings')}
                />
              </View>
            </View>
          </View>
        );

      case 'host':
        return (
          <View style={styles.menu}>
            <Text style={styles.text}>{t('ui.lobby.hostIntro')}</Text>
            <BaseButton title={t('ui.lobby.generate')} onPress={hostGame} />
          </View>
        );

      case 'join':
        return (
          <View style={styles.menu}>
            {!WEB && (
              <>
                <Text style={styles.fieldLabel}>{t('ui.lobby.roomCodePlaceholder')}</Text>
                <TextInput
                  style={styles.field}
                  value={inputCode}
                  onChangeText={setInputCode}
                  autoCapitalize="characters"
                />
              </>
            )}
            <Text style={styles.fieldLabel}>{t('ui.lobby.hostIpPlaceholder')}</Text>
            <TextInput
              style={styles.field}
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
          <View style={styles.menu}>
            {isHost && roomCode ? (
              <View style={styles.ticket}>
                <Text style={styles.ticketLabel}>{t('ui.lobby.roomCodeLabel')}</Text>
                <Text style={styles.ticketCode}>{roomCode}</Text>
                <Text style={styles.ticketAddress}>
                  {t('ui.lobby.addressLine', {
                    address: lobby.getHostAddress() ?? t('ui.lobby.unknownAddress'),
                  })}
                </Text>
              </View>
            ) : null}
            {isHost && <Text style={styles.hint}>{t('ui.lobby.twoWays')}</Text>}
            <Text style={styles.connected}>
              {t('ui.lobby.connected', { count: players.length })}
            </Text>
            {/* Links that reached the phone, even before a seat exists. A
                browser that shows up here is on the network; one that never
                does has not reached the host at all. */}
            {isHost && lobby.getConnectionCount() > 0 && (
              <Text style={styles.hint}>
                {t('ui.lobby.devicesConnected', {
                  count: lobby.getConnectionCount(),
                })}
              </Text>
            )}

            {players.map(p => (
              <RosterRow
                key={p.id}
                name={p.name}
                tags={`${p.id === HOST_PLAYER_ID ? t('ui.common.hostTag') : ''}${
                  p.isBot ? t('ui.roster.botTag') : ''
                }`}
                dotColor={
                  p.id === HOST_PLAYER_ID
                    ? theme.colors.primary
                    : p.isBot
                    ? theme.colors.secondary
                    : theme.colors.success
                }
                onRemove={isHost && p.isBot ? () => removeBot(p.id) : undefined}
                removeLabel={t('ui.common.remove')}
              />
            ))}

            {isHost && setup && (
              <BaseButton
                title={t('ui.lobby.tableSetup')}
                onPress={() => setView('setup')}
                variant="secondary"
              />
            )}

            {setup && (
              <View style={styles.tableCard}>
                <Text style={styles.tableTitle}>{t('ui.lobby.tableSetup')}</Text>
                {tableRoles.length > 0 && (
                  <Text style={styles.tableRoles}>
                    {t('ui.lobby.thisTable', { roles: tableRoles.join(', ') })}
                  </Text>
                )}
                <Text style={styles.tableSubtitle}>{t('ui.setup.houseRules')}</Text>
                {tableRules.map(def => (
                  <View key={def.id} style={styles.ruleRow}>
                    <Text style={styles.ruleName}>{settingName(def)}</Text>
                    <Text style={styles.ruleValue}>
                      {settingLabel(def, setupSetting(setup, def.id))}
                    </Text>
                  </View>
                ))}
              </View>
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
          </View>
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
    return <SettingsScreen onBack={() => setView('menu')} />;
  }

  const menu = view === 'menu';
  const title =
    view === 'host'
      ? t('ui.lobby.host')
      : view === 'join'
      ? t('ui.lobby.join')
      : t('ui.lobby.waitingRoom');

  return (
    <View style={styles.container}>
      {!menu && (
        <ScreenHeader
          title={title}
          backLabel={view === 'waiting' ? t('ui.back.lobby') : t('ui.common.back')}
        />
      )}
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.page,
          menu && styles.menuPage,
          {
            paddingHorizontal: menu ? Math.max(24, gutter) : gutter,
            paddingTop: menu ? insets.top + 24 : theme.spacing.medium,
            paddingBottom: insets.bottom + 24,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {error ? (
          <View style={styles.errorNote}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}
        {renderView()}
      </ScrollView>
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
  },
  page: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: theme.spacing.medium,
    paddingBottom: theme.spacing.large,
  },
  menuPage: {
    flexGrow: 1,
    justifyContent: 'center',
    maxWidth: 440,
  },
  brand: {
    alignItems: 'center',
  },
  mark: {
    width: 64,
    height: 64,
    marginBottom: 10,
  },
  moon: {
    position: 'absolute',
    left: 4,
    top: 4,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
  },
  moonCut: {
    position: 'absolute',
    left: 22,
    top: -8,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.background,
  },
  wordmark: {
    color: theme.colors.text,
    fontSize: 44,
    lineHeight: 43,
    fontWeight: '900',
    textAlign: 'center',
  },
  wordmarkGold: {
    color: theme.colors.primary,
  },
  tagline: {
    color: theme.colors.dim,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280,
    marginTop: 10,
  },
  form: {
    marginTop: 28,
  },
  fieldLabel: {
    color: theme.colors.dim,
    fontSize: theme.type.label,
    lineHeight: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  field: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '700',
    minHeight: 50,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.fieldBorder,
    marginBottom: theme.spacing.medium,
  },
  menuButton: {
    marginTop: 10,
  },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.medium,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 8,
    alignSelf: 'center',
  },
  link: {
    minHeight: theme.inlineTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radius.pill,
  },
  linkPressed: {
    backgroundColor: theme.colors.highlight,
  },
  linkText: {
    color: theme.colors.dim,
    fontSize: 13,
    fontWeight: '700',
  },
  linkDivider: {
    width: 1,
    height: 16,
    backgroundColor: theme.colors.border,
  },
  menuHint: {
    color: theme.colors.dim,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: theme.spacing.small,
  },
  connected: {
    color: theme.colors.dim,
    fontSize: theme.type.label,
    fontWeight: '800',
    marginTop: theme.spacing.medium,
    marginBottom: 4,
  },
  tableCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    marginTop: theme.spacing.medium,
    marginBottom: theme.spacing.small,
  },
  tableTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 5,
  },
  tableRoles: {
    color: theme.colors.dim,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  tableSubtitle: {
    color: theme.colors.secondary,
    fontSize: theme.type.label,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 3,
  },
  ruleName: {
    color: theme.colors.dim,
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  ruleValue: {
    color: theme.colors.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 1,
  },
  ticket: {
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(246,198,103,0.38)',
    padding: 16,
    marginBottom: 14,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
  },
  ticketLabel: {
    color: theme.colors.dim,
    fontSize: theme.type.label,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  ticketCode: {
    color: theme.colors.primary,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '900',
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
  },
  ticketAddress: {
    color: theme.colors.dim,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  text: {
    color: theme.colors.text,
    fontSize: theme.type.body,
    lineHeight: 23,
    marginBottom: 12,
  },
  hint: {
    color: theme.colors.dim,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  errorNote: {
    backgroundColor: theme.colors.tintDanger,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    borderRadius: theme.radius.control,
    padding: 12,
    marginBottom: theme.spacing.medium,
  },
  error: {
    color: theme.colors.danger,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
});
