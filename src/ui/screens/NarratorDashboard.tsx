import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, InteractionManager } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '../text';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { PlayerGrid } from '../components/PlayerGrid';
import { RoleBar } from '../components/RoleBar';
import { RolePanel } from '../components/RolePanel';
import { RoleSigil } from '../components/RoleSigil';
import { Sheet } from '../components/Sheet';
import { TableMenu } from '../components/TableMenu';
import { PageOverlay } from '../components/PageOverlay';
import { TableStrip } from '../components/TableStrip';
import { useBack } from '../back';
import { useResponsive } from '../layout';
import { ActionPanel, OwnRole } from '../components/ActionPanel';
import { TabBar } from '../components/TabBar';
import { NotesTab } from '../components/NotesTab';
import { ChatTab } from '../components/ChatTab';
import { RevealedRoles } from '../components/RevealedRoles';
import { InfoTab } from '../components/InfoTab';
import { digestSections, flatSection } from '../info';
import { formatRemaining, winnerText } from '../format';
import { useI18n } from '../i18n';
import { SaidLine, roleName } from '../../i18n';
import { GameManager, packIsKnown } from '../../engine/gameManager';
import { RulesScreen } from './RulesScreen';
import { SettingsScreen } from './SettingsScreen';
import { useGame } from '../GameContext';
import { Phase, Player } from '../../engine/types';
import { lobby } from '../../network/lobby';

interface NarratorDashboardLiveProps {
  manager: GameManager;
  localPlayer: Player;
  returnToLobby: () => void;
  rematch: () => void;
  changeTable: () => void;
  gameId: number;
}

// The live screen must unmount as a whole when the table closes. Returning
// null from inside it skipped hooks mid-life and crashed on the way back.
export const NarratorDashboard = () => {
  const { manager, localPlayer, returnToLobby, rematch, changeTable, gameId } = useGame();

  if (!manager || !localPlayer) return null;

  return (
    <NarratorDashboardLive
      manager={manager}
      localPlayer={localPlayer}
      returnToLobby={returnToLobby}
      rematch={rematch}
      changeTable={changeTable}
      gameId={gameId}
    />
  );
};

const NarratorDashboardLive: React.FC<NarratorDashboardLiveProps> = ({
  manager,
  localPlayer,
  returnToLobby,
  rematch,
  changeTable,
  gameId,
}) => {
  const { t } = useI18n();
  const [, forceRender] = useState(0);
  const [secrets, setSecrets] = useState<SaidLine[]>([]);
  const [submitted, setSubmitted] = useState<string[]>([]);
  // Which page of the dashboard is open: the running game, the host's own
  // notes about it, the private windows he holds as a player, or — once he is
  // out of the game — every card on the table.
  const [tab, setTab] = useState<'play' | 'info' | 'notes' | 'chat'>('play');
  const [roleHidden, setRoleHidden] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [overlay, setOverlay] = useState<'rules' | 'settings' | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const { gutter } = useResponsive();

  // The menu is a modal of its own; let it finish closing before the page
  // overlay takes the screen.
  const openOverlay = (page: 'rules' | 'settings') => {
    setMenuOpen(false);
    InteractionManager.runAfterInteractions(() => setOverlay(page));
  };

  useEffect(() => {
    if (!manager || !localPlayer) return;

    return manager.subscribe(event => {
      // Secrets belong to one player only: the host must not learn what the
      // seer was told unless the host is the seer.
      if (event.type === 'secret' && event.playerId === localPlayer.id) {
        setSecrets(prev => [...prev, { key: event.key, params: event.params }]);
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

  const players = manager.state.players;
  const role = manager.getRoleOf(localPlayer.id);

  // The host plays too, so his own private windows are his own.
  const hostGroups = manager.getChatGroups(localPlayer.id);
  const hostOpen = manager.getOpenChatGroups(localPlayer.id);

  // Only a test game prints every role on the host's screen: a real table
  // bought his place the same way anyone else did, so he sees what any phone
  // sees.
  const isTestGame = manager.getSettings()['testGame'] === true;
  const seeEverything = isTestGame;
  // The pack's aim is the host's business when he is in the pack, and nobody
  // else's.
  const hostIsWolf = role?.team === 'Wolf';

  // What the host's own info window holds: the whole story, and in a test game
  // the narrator's own log on top. His private readings stay on the Play tab,
  // where he acts on them.
  const infoSections = [
    ...digestSections(manager.getPublicLogEntries(), t),
    ...(seeEverything
      ? [
          flatSection(
            t('ui.host.narratorLog'),
            manager.actionLog.map(line => t(line.key, line.params)),
          ),
        ]
      : []),
  ];

  // The card a dead player carries in a blind host's list, when the table
  // reveals its dead. Nothing for the living: the roster is public.
  const revealedCards = new Map(
    manager
      .getPlayerRefs()
      .filter(ref => ref.role)
      .map(ref => [ref.id, roleName(ref.roleId ?? '', ref.role as string)]),
  );

  // The pack: the host is a player too, so his screen reads the pack the same
  // way a guest's does — wolves only, and only once the table has its mayor.
  const packReady = role?.team === 'Wolf' && packIsKnown(manager.state.currentPhase);

  const ownRole: OwnRole | null = role
    ? {
        roleId: role.id,
        name: role.name,
        team: role.team,
        description: role.description,
        nightActions: role.nightActions
          // A rule the host turned off takes its button with it.
          ?.filter(option => option.kind !== 'spy' || manager.getSettings()['girl.spy'] !== false)
          .map(option => ({
          id: option.id,
          label: option.label,
          kind: option.kind,
          chargesLeft: manager.getChargesLeft(localPlayer.id, option.id) ?? undefined,
        })),
        revengeOnDeath: role.revengeOnDeath,
        linksLovers: role.linksLovers,
        guessesRoles: role.guessesRoles,
        thiefCards: manager.getThiefCards(localPlayer.id),
        charmedIds: role.charms ? manager.getCharmedIds() : undefined,
        scapegoat: role.scapegoat,
        judge: role.judge,
        allies:
          role.team === 'Wolf'
            ? players
                .filter(p => p.id !== localPlayer.id && manager.getRoleOf(p.id)?.team === 'Wolf')
                .map(p => ({ id: p.id, name: p.name }))
            : role.alliance
            ? players
                .filter(
                  p =>
                    p.id !== localPlayer.id &&
                    manager.getRoleOf(p.id)?.alliance === role.alliance,
                )
                .map(p => ({ id: p.id, name: p.name }))
            : [],
      }
    : null;

  // The pack the host reads in his own list: the same names every guest sees,
  // and the same wait for the mayor.
  const packIds = new Set(packReady ? (ownRole?.allies ?? []).map(ally => ally.id) : []);

  const aliveCount = players.filter(p => p.isAlive).length;
  // The live roster, not the seat held since the lobby: a host who dies sees
  // the Roles tab like any other dead player.
  const selfAlive = players.find(player => player.id === localPlayer.id)?.isAlive ?? true;
  const guests = players.filter(p => p.id !== localPlayer.id && !p.isBot);
  const droppedGuests = lobby.disconnectedPlayers().length;
  const pendingActors = manager.getPendingNightActors();
  const pendingVoters = manager.getPendingVoters();
  const pendingHunter = manager.getPendingRevengeHunter();
  const revoteCandidates = manager.getRevoteCandidates();
  // The host's screen counts one thing at a time: the stage's own window while
  // one is open, and his clock for the talking phases otherwise.
  const remaining = manager.getClockRemainingMs();
  const deadline = manager.getDeadlineRemainingMs();

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

  // One tick a second while a countdown is running: it moves the countdown,
  // closes a stage whose actors are all done, and ends a window that ran out.
  // The talking phases keep the host's own press.
  useEffect(() => {
    if (remaining === null) return;

    const handle = setInterval(() => {
      forceRender(n => n + 1);
      if (manager.isTimerDue()) {
        advanceOnce();
        setSubmitted([]);
      } else if (manager.pump()) {
        setSubmitted([]);
      }
    }, 1000);

    return () => clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining === null, manager]);

  // Only the talking phases have a press left: every decision closes itself
  // when its actors are all done, or when its window runs out.
  const nextLabel = manager.winner
    ? null
    : phase === 'Debate'
    ? t('ui.host.startVoteMayor')
    : phase === 'Day'
    ? // The Alien's turn is his own, but a phone that went to sleep must not
      // hold the whole table: the host can force the vote.
      manager.isDayFrozen()
      ? t('ui.host.forceVote')
      : t('ui.host.startVote')
    : null;

  const submitLocalAction = (actionId: string, targetId: string, roleId?: string) => {
    const ok =
      actionId === 'alienGuess' && roleId
        ? manager.handleAlienGuess(localPlayer.id, targetId, roleId)
        : actionId === 'alienResume'
        ? manager.handleAlienResume(localPlayer.id)
        : actionId === 'thiefSwap'
        ? manager.handleThiefSwap(localPlayer.id, targetId)
        : actionId === 'thiefKeep'
        ? manager.handleThiefSwap(localPlayer.id, null)
        : actionId === 'judgeRepeat'
        ? manager.handleJudgeRepeat(localPlayer.id)
        : actionId === 'scapegoatBan'
        ? manager.handleScapegoatBan(localPlayer.id, targetId)
        : actionId === 'vote'
        ? manager.handleVote(localPlayer.id, targetId)
        : actionId === 'mayor-vote'
        ? manager.handleMayorVote(localPlayer.id, targetId)
        : actionId === 'volunteer'
        ? manager.volunteerForMayor(localPlayer.id)
        : actionId === 'succession'
        ? manager.handleSuccession(localPlayer.id, targetId)
        : actionId === 'revenge'
        ? manager.handleRevenge(localPlayer.id, targetId)
        : actionId === 'pass'
        ? manager.passNightAction(localPlayer.id, targetId)
        : actionId === 'decline'
        ? manager.handleDecline(localPlayer.id, targetId as Phase)
        : actionId === 'tieBreak'
        ? manager.handleTieBreak(localPlayer.id, targetId)
        : actionId === 'ravenMark'
        ? manager.handleRavenMark(localPlayer.id, targetId)
        : manager.handleNightAction(localPlayer.id, actionId, targetId);

    if (ok) setSubmitted(prev => [...prev, actionId === 'pass' ? targetId : actionId]);
  };

  // The phone's back gesture leaves the table, like the button used to.
  useBack(returnToLobby);

  const mayor = manager.getMayor();
  const inspected = inspect ? players.find(player => player.id === inspect) ?? null : null;
  const inspectedCard = inspected ? manager.getRoleOf(inspected.id) : null;
  const inspectedKnown =
    inspected && (seeEverything || (!inspected.isAlive && revealedCards.has(inspected.id)))
      ? inspectedCard
      : null;
  const topMs = deadline ?? remaining;
  const tabs = [
    { id: 'play', label: t('ui.tab.play') },
    { id: 'info', label: t('ui.tab.info') },
    { id: 'notes', label: t('ui.tab.notes') },
    ...(hostGroups.length > 0 ? [{ id: 'chat', label: t('ui.tab.chat') }] : []),
  ];
  // The rail is outside the scroll now, so a page change has to send the new
  // page back to its top itself.
  const scrollRef = React.useRef<ScrollView>(null);
  const selectTab = (id: string) => {
    setTab(id as 'play' | 'info' | 'notes' | 'chat');
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={
          phase
            ? t('ui.play.phaseLine', {
                phase: t(`phase.${phase}`, undefined, phase),
                round,
              })
            : t('ui.play.title')
        }
        meta={
          lobby.getRoomCode()
            ? `${t('ui.lobby.roomCodeLabel')} ${lobby.getRoomCode()}`
            : undefined
        }
        backLabel={t('ui.back.lobby')}
        onMenu={() => setMenuOpen(true)}
        right={
          topMs !== null ? (
            <View style={[styles.topClock, topMs <= 10_000 && styles.topClockUrgent]}>
              <Ionicons
                name="timer-outline"
                size={14}
                color={topMs <= 10_000 ? theme.colors.danger : theme.colors.primary}
              />
              <Text style={[styles.topClockText, topMs <= 10_000 && styles.urgentText]}>
                {formatRemaining(topMs)}
              </Text>
            </View>
          ) : undefined
        }
      />
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
      >
      {tab === 'play' && (
        <>
      {isTestGame && (
        <View style={styles.testBanner}>
          <Text style={styles.bannerText}>{t('ui.host.testGame')}</Text>
        </View>
      )}

      {/* The host plays too; the card waits behind the same private tap. */}
      <RoleBar
        roleName={role?.name}
        hidden={!!role && roleHidden}
        emptyLabel={t('ui.host.unassigned')}
        onPress={() => setRoleOpen(true)}
      />

      {/* Out of the game, the host reads the table like any other corpse. */}
      {!manager.winner && !selfAlive && !seeEverything && (
        <RevealedRoles entries={manager.getReveal()} />
      )}

      <TableStrip
        cells={[
          { value: t('ui.host.aliveLine', { alive: aliveCount, total: players.length }) },
          ...(mayor
            ? [
                {
                  value:
                    t('ui.play.mayorLine', {
                      name: mayor.name,
                      how:
                        manager.getSettings()['mayor.doubleVote'] === false
                          ? t('ui.play.mayorSingle')
                          : t('ui.play.mayorDouble'),
                    }) + (mayor.id === localPlayer.id ? t('ui.roster.you') : ''),
                },
              ]
            : []),
        ]}
      >
        <Text style={styles.youAre}>
          {t('ui.host.youAre', { name: localPlayer.name })}
        </Text>

        {/* The host plays too: a blind host is told how many players still
            have to act, not which ones. */}
        {pendingActors.length > 0 && (
          <Text style={styles.pending}>
            {seeEverything
              ? t('ui.host.waitingNight', {
                  names: pendingActors.map(p => p.name).join(', '),
                })
              : t('ui.host.stillToAct', { count: pendingActors.length })}
          </Text>
        )}
        {pendingVoters.length > 0 && (
          <Text style={styles.pending}>
            {seeEverything
              ? t('ui.host.waitingVotes', {
                  names: pendingVoters.map(p => p.name).join(', '),
                })
              : t('ui.host.stillToVote', { count: pendingVoters.length })}
          </Text>
        )}
        {pendingHunter && (
          <Text style={styles.pending}>
            {seeEverything
              ? t('ui.host.hunterChoosing', { name: pendingHunter.name })
              : t('ui.host.dyingChoosing')}
          </Text>
        )}

        {/* Wolves hunt as a pack, and the engine settles the bite by a
            majority of their picks: a host who is in the pack sees them, and
            a narrator sees everything. Nobody else does. */}
        {phase === 'Night' && (hostIsWolf || seeEverything) && packPicks.length > 0 && (
          <Text style={styles.pending}>
            {t('ui.host.packAiming', { names: packPicks.join(', ') })}
          </Text>
        )}
        {phase === 'Vote' && aliveCount > 0 && pendingVoters.length === 0 && (
          <Text style={styles.ready}>{t('ui.host.everyoneVoted')}</Text>
        )}

        {/* The clock is the host's: a party game dies when the day never ends.
            Only the talking phases get it: every decision carries its own
            window, shown below. */}
        {(phase === 'Day' || phase === 'Debate') && !manager.winner && (
          <View style={styles.timerRow}>
            {manager.getTimerRemainingMs() !== null ? (
              <>
                <Text style={styles.timerText}>
                  {t('ui.host.left', {
                    time: formatRemaining(manager.getTimerRemainingMs() ?? 0),
                  })}
                </Text>
                <BaseButton
                  title={t('ui.host.stopClock')}
                  onPress={() => manager.clearTimer()}
                  variant="secondary"
                />
              </>
            ) : (
              <>
                <Text style={styles.pending}>{t('ui.host.putOnClock')}</Text>
                <View style={styles.timerButtons}>
                  <BaseButton
                    title={t('ui.host.minutes', { count: 1 })}
                    onPress={() => manager.startTimer(60)}
                    variant="secondary"
                  />
                  <BaseButton
                    title={t('ui.host.minutes', { count: 2 })}
                    onPress={() => manager.startTimer(120)}
                    variant="secondary"
                  />
                  <BaseButton
                    title={t('ui.host.minutes', { count: 5 })}
                    onPress={() => manager.startTimer(300)}
                    variant="secondary"
                  />
                </View>
              </>
            )}
          </View>
        )}

        {/* The stage's own window: it closes itself the moment every actor has
            answered, so this only ever counts down to a decision. */}
        {deadline !== null && !manager.winner && (
          <Text style={[styles.timerText, deadline <= 10_000 && styles.urgentText]}>
            {t('ui.host.stageLeft', { time: formatRemaining(deadline) })}
          </Text>
        )}
      </TableStrip>

      {manager.winner && (
        <View style={styles.winnerCard}>
          <Text style={styles.winnerText}>
            {winnerText(manager.winner, t, manager.getWinnerKey())}
          </Text>
          <Text style={styles.winnerSub}>{t('ui.host.playAgainHint')}</Text>
          <BaseButton title={t('ui.host.playAgain')} onPress={rematch} />
          <BaseButton
            title={t('ui.host.changeTable')}
            onPress={changeTable}
            variant="secondary"
          />
        </View>
      )}

      {manager.winner && <RevealedRoles entries={manager.getReveal()} />}

      {manager.lastVote && (
        <View style={styles.ledgerBlock}>
          <Text style={styles.statusText}>
            {t('ui.play.lastVote', {
              what: manager.lastVote.revote
                ? t('ui.vote.revote')
                : manager.lastVote.eliminatedName
                ? t('ui.vote.eliminated', { name: manager.lastVote.eliminatedName })
                : manager.lastVote.tie
                ? t('ui.vote.tied')
                : t('ui.vote.none'),
            })}
          </Text>
          {manager.lastVote.tally
            .filter(entry => entry.count > 0)
            .map(entry => (
              <Text key={entry.id} style={styles.tallyText}>
                {entry.name}: {entry.count}
              </Text>
            ))}
          {/* Who voted for whom is public: every guest phone already prints
              the same ballot list, so the host is not shown less than the
              table. */}
          {manager.lastVote.ballots?.map(ballot => (
            <Text key={ballot.voterId} style={styles.ballotText}>
              {t('ui.host.voteArrow', {
                voter: ballot.voterName,
                target: ballot.targetName,
              })}
            </Text>
          ))}
        </View>
      )}

      {phase === 'Night' && isTestGame && manager.hasOpenPackTie() && (
        <>
          <Text style={styles.hint}>
            {manager.getPackTieBreakerId()
              ? t('ui.host.splitVoteFather')
              : t('ui.host.splitVote')}
          </Text>
          {manager.getPackTieTargets().map(target => (
            <BaseButton
              key={target.id}
              title={t('ui.host.devour', { name: target.name })}
              variant="secondary"
              onPress={() => {
                manager.handlePackTie(target.id);
                setSubmitted([]);
              }}
            />
          ))}
        </>
      )}

      {!manager.winner && nextLabel && (
        <BaseButton
          title={nextLabel}
          onPress={() => {
            // A frozen day is the Alien's to release; the host's press is the
            // escape hatch for a phone that is gone.
            if (manager.isDayFrozen()) manager.forceDayOn();
            else advanceOnce();
            setSubmitted([]);
          }}
        />
      )}

      <View style={styles.sectionRow}>
        <Text style={styles.subHeader}>{t('ui.play.players')}</Text>
        <Text style={styles.sectionCount}>{players.length}</Text>
      </View>
      <PlayerGrid
        seats={players.map(player => {
          const dropped = lobby.disconnectedPlayers().some(p => p.id === player.id);
          const card = manager.getRoleOf(player.id);
          const dead = !player.isAlive;
          const known =
            seeEverything || (dead && revealedCards.has(player.id)) ? card : null;
          const waiting =
            pendingActors.some(actor => actor.id === player.id)
              ? { label: t('ui.roster.toAct'), icon: 'time-outline' as const }
              : phase === 'Vote' &&
                player.isAlive &&
                pendingVoters.some(voter => voter.id === player.id)
              ? { label: t('ui.roster.toVote'), icon: 'time-outline' as const }
              : null;
          const voted =
            phase === 'Vote' && player.isAlive && manager.hasVoted(player.id);
          const badge = dropped
            ? { label: t('ui.roster.noConnection'), icon: 'cloud-offline-outline' as const, tone: theme.colors.danger }
            : voted
            ? { label: t('ui.roster.voted'), icon: 'checkmark-circle-outline' as const, tone: theme.colors.success }
            : waiting
            ? { ...waiting, tone: theme.colors.primary }
            : dead
            ? { label: t('ui.common.dead'), icon: 'skull-outline' as const, tone: theme.colors.dim }
            : player.id === localPlayer.id
            ? { label: t('ui.roster.you'), icon: 'person-outline' as const, tone: theme.colors.primary }
            : undefined;

          return {
            id: player.id,
            name: player.name,
            isAlive: player.isAlive,
            roleId: known?.id,
            roleTeam: known?.team,
            self: player.id === localPlayer.id,
            pack: player.isAlive && packIds.has(player.id),
            badge: badge?.label,
            badgeIcon: badge?.icon,
            badgeTone: badge?.tone,
            accent: dropped || dead
              ? theme.colors.dim
              : packIds.has(player.id)
              ? theme.colors.danger
              : player.id === localPlayer.id
              ? theme.colors.primary
              : theme.colors.secondary,
            onPress: () => setInspect(player.id),
          };
        })}
      />

      {roleHidden ? (
        <Text style={styles.hint}>{t('ui.play.showToAct')}</Text>
      ) : (
        <ActionPanel
          phase={manager.state.currentPhase}
          role={ownRole}
          selfId={localPlayer.id}
          targets={players}
          submitted={submitted}
          gameOver={!!manager.winner}
          quietNight={manager.isQuietNight()}
          dayFrozen={manager.isDayFrozen()}
          ravenTiming={String(manager.getSettings()['raven.timing'] ?? 'night')}
          ravenMark={manager.getRavenMark()}
          barredVoters={manager.getBarredVoters()}
          selfAlive={localPlayer.isAlive}
          nightStage={manager.getNightStage()}
          victim={manager.getHealTarget()}
          tieTargets={
            manager.hasOpenPackTie() && manager.getPackTieBreakerId() === localPlayer.id
              ? manager.getPackTieTargets()
              : undefined
          }
          electionStage={manager.getElectionStage()}
          mayorCandidates={manager.getElectionList()}
          successionMayorId={manager.getPendingSuccessionMayor()?.id ?? null}
          candidates={revoteCandidates.length > 0 ? revoteCandidates : undefined}
          onChoose={submitLocalAction}
        />
      )}

      <Text style={styles.hint}>
        {t('ui.host.guests', {
          here: guests.length - droppedGuests,
          total: guests.length,
        })}
        {droppedGuests > 0 ? t('ui.host.dropHint') : ''}
      </Text>

        </>
      )}

      {tab === 'info' && <InfoTab sections={infoSections} />}

      {tab === 'notes' && (
        <NotesTab
          gameKey={`host-${String(gameId)}`}
          myRole={role ? roleName(role.id, role.name) : t('ui.host.hostRole')}
          players={players.map(player => player.name)}
        />
      )}

      {tab === 'chat' && (
        <ChatTab
          groups={hostGroups}
          open={hostOpen}
          lines={manager.getChatLog()}
          selfId={localPlayer.id}
          onSend={(group, text) => {
            manager.handleChat(localPlayer.id, group, text);
            forceRender(count => count + 1);
          }}
        />
      )}

    </ScrollView>
    <TabBar tabs={tabs} active={tab} onSelect={selectTab} />

    <Sheet visible={roleOpen} onClose={() => setRoleOpen(false)} title={t('ui.play.yourRole')}>
      <RolePanel
        role={ownRole}
        hidden={!!role && roleHidden}
        onShow={() => setRoleHidden(false)}
        onHide={role ? () => setRoleHidden(true) : undefined}
        emptyLabel={t('ui.host.unassigned')}
        alliesKnown={!hostIsWolf || packReady}
        secrets={secrets}
      />
    </Sheet>

    <Sheet
      visible={!!inspected}
      onClose={() => setInspect(null)}
      title={inspected?.name}
    >
      {inspected ? (
        <View style={styles.inspector}>
          {inspectedKnown ? (
            <RoleSigil
              roleId={inspectedKnown.id}
              team={inspectedKnown.team}
              size={78}
              muted={!inspected.isAlive}
            />
          ) : (
            <View style={styles.inspectorSeal}>
              <Ionicons name="person" size={30} color={theme.colors.secondary} />
            </View>
          )}
          <Text style={styles.inspectorName}>{inspected.name}</Text>
          <Text style={styles.inspectorState}>
            {inspected.isAlive ? t('ui.host.aliveTag') : t('ui.common.dead')}
            {inspected.isBot ? t('ui.roster.botTag') : ''}
          </Text>
          {inspectedKnown ? (
            <Text style={styles.inspectorRole}>
              {roleName(inspectedKnown.id, inspectedKnown.name)}
            </Text>
          ) : null}
          {inspected.id !== localPlayer.id ? (
            <BaseButton
              title={t('ui.common.remove')}
              variant="danger"
              onPress={() => {
                lobby.removePlayer(inspected.id);
                setInspect(null);
              }}
            />
          ) : null}
        </View>
      ) : null}
    </Sheet>

    <TableMenu
      visible={menuOpen}
      onClose={() => setMenuOpen(false)}
      onRules={() => openOverlay('rules')}
      onSettings={() => openOverlay('settings')}
    />

    <PageOverlay visible={overlay === 'rules'}>
      <RulesScreen onBack={() => setOverlay(null)} />
    </PageOverlay>

    <PageOverlay visible={overlay === 'settings'}>
      <SettingsScreen onBack={() => setOverlay(null)} />
    </PageOverlay>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingVertical: theme.spacing.medium,
    paddingBottom: theme.spacing.large,
  },
  topClock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    minHeight: 32,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(246,198,103,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(246,198,103,0.28)',
  },
  topClockUrgent: {
    backgroundColor: theme.colors.tintDanger,
    borderColor: theme.colors.danger,
  },
  topClockText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  inspector: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  inspectorSeal: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.raised,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  inspectorName: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  inspectorState: {
    color: theme.colors.dim,
    fontSize: 14,
    fontWeight: '700',
  },
  inspectorRole: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  youAre: {
    color: theme.colors.dim,
    fontSize: 13,
    lineHeight: 18,
  },
  pending: {
    color: theme.colors.secondary,
    fontSize: theme.type.small,
    fontWeight: '600',
  },
  tallyText: {
    color: theme.colors.dim,
    fontSize: theme.type.small,
  },
  statusText: {
    color: theme.colors.text,
    fontSize: theme.type.body,
    lineHeight: 22,
    marginVertical: 2,
  },
  ledgerBlock: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 10,
    marginBottom: theme.spacing.medium,
  },
  winnerCard: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 3,
    borderTopColor: theme.colors.primary,
    padding: theme.spacing.medium,
    marginBottom: theme.spacing.medium,
  },
  winnerText: {
    color: theme.colors.primary,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  winnerSub: {
    color: theme.colors.dim,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: theme.spacing.small,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: theme.spacing.small,
    marginBottom: 4,
  },
  subHeader: {
    fontSize: theme.type.section,
    color: theme.colors.text,
    fontWeight: '800',
  },
  sectionCount: {
    color: theme.colors.dim,
    fontSize: 13,
    fontWeight: '700',
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
    fontSize: 22,
    fontWeight: '900',
    marginBottom: theme.spacing.small,
  },
  urgentText: {
    color: theme.colors.danger,
  },
  ready: {
    color: theme.colors.secondary,
    fontSize: 15,
    fontWeight: '700',
    marginTop: theme.spacing.small,
  },
  ballotText: {
    color: theme.colors.dim,
    fontSize: 13,
    marginTop: 2,
  },
  testBanner: {
    backgroundColor: theme.colors.tintGood,
    borderStartWidth: 3,
    borderStartColor: theme.colors.success,
    padding: theme.spacing.medium,
    marginBottom: theme.spacing.medium,
  },
  bannerText: {
    color: theme.colors.text,
    fontSize: theme.type.small,
    fontWeight: '600',
    textAlign: 'center',
  },
  hint: {
    color: theme.colors.dim,
    fontSize: 13,
    textAlign: 'center',
    marginTop: theme.spacing.medium,
  },
});
