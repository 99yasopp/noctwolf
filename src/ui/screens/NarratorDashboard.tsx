import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { ActionPanel, OwnRole } from '../components/ActionPanel';
import { TabBar } from '../components/TabBar';
import { NotesTab } from '../components/NotesTab';
import { ChatTab } from '../components/ChatTab';
import { RevealedRoles } from '../components/RevealedRoles';
import { InfoTab, digestSections } from '../components/InfoTab';
import { formatRemaining, winnerText } from '../format';
import { useGame } from '../GameContext';
import { Phase } from '../../engine/types';
import { lobby } from '../../network/lobby';

export const NarratorDashboard = () => {
  const { manager, localPlayer, returnToLobby, rematch, changeTable, gameId } = useGame();
  const [, forceRender] = useState(0);
  const [secrets, setSecrets] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState<string[]>([]);
  // Which page of the dashboard is open: the running game, the host's own
  // notes about it, the private windows he holds as a player, or — once he is
  // out of the game — every card on the table.
  const [tab, setTab] = useState<'play' | 'info' | 'notes' | 'chat' | 'roles'>('play');

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
    ...digestSections(manager.getPublicLogEntries()),
    ...(seeEverything ? [{ title: 'Narrator log', lines: manager.actionLog }] : []),
  ];

  // The card a dead player carries in a blind host's list, when the table
  // reveals its dead. Nothing for the living: the roster is public.
  const revealedCards = new Map(
    manager
      .getPlayerRefs()
      .filter(ref => ref.role)
      .map(ref => [ref.id, ref.role as string]),
  );

  const ownRole: OwnRole | null = role
    ? {
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
    ? 'Start the vote for mayor'
    : phase === 'Day'
    ? // The Alien's turn is his own, but a phone that went to sleep must not
      // hold the whole table: the host can force the vote.
      manager.isDayFrozen()
      ? 'Force the vote'
      : 'Start the vote'
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Narrator Dashboard</Text>

      <TabBar
        tabs={[
          { id: 'play', label: 'Play' },
          { id: 'info', label: 'Info' },
          { id: 'notes', label: 'Notes' },
          ...(hostGroups.length > 0 ? [{ id: 'chat', label: 'Chat' }] : []),
          ...(selfAlive ? [] : [{ id: 'roles', label: 'Roles' }]),
        ]}
        active={tab}
        onSelect={id => setTab(id as 'play' | 'info' | 'notes' | 'chat' | 'roles')}
      />

      {tab === 'play' && (
        <>
      {isTestGame && (
        <View style={styles.testBanner}>
          <Text style={styles.bannerText}>
            TEST GAME — every role and every secret is printed on this screen.
            Turn Test game off in the house rules to play it straight.
          </Text>
        </View>
      )}

      {/* The host plays too, so his own role must be as visible to him as a
          guest's role card is to a guest. */}
      <View style={styles.roleCard}>
        <Text style={styles.roleLabel}>Your Role</Text>
        <Text style={styles.roleName}>{role?.name ?? 'unassigned'}</Text>
        <Text style={styles.roleTeam}>{role ? `${role.team} team` : ''}</Text>
        {role && <Text style={styles.roleDescription}>{role.description}</Text>}
        {ownRole && ownRole.allies && ownRole.allies.length > 0 && (
          <Text style={styles.roleDescription}>
            {ownRole.team === 'Wolf' ? 'Your pack' : 'Your alliance'}:{' '}
            {ownRole.allies.map(ally => ally.name).join(', ')}
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
            {manager.getMayor()?.id === localPlayer.id ? ' (you)' : ''}
          </Text>
        )}
        <Text style={styles.statusText}>You are: {localPlayer.name}</Text>

        {/* The host plays too: a blind host is told how many players still
            have to act, not which ones. */}
        {pendingActors.length > 0 && (
          <Text style={styles.pending}>
            {seeEverything
              ? `Waiting on night actions: ${pendingActors.map(p => p.name).join(', ')}`
              : `${pendingActors.length} player${pendingActors.length > 1 ? 's' : ''} still to act tonight.`}
          </Text>
        )}
        {pendingVoters.length > 0 && (
          <Text style={styles.pending}>
            {seeEverything
              ? `Waiting on votes: ${pendingVoters.map(p => p.name).join(', ')}`
              : `${pendingVoters.length} player${pendingVoters.length > 1 ? 's' : ''} still to vote.`}
          </Text>
        )}
        {pendingHunter && (
          <Text style={styles.pending}>
            {seeEverything
              ? `${pendingHunter.name} is choosing who to take down.`
              : 'A dying player is choosing who to take down.'}
          </Text>
        )}

        {/* Wolves hunt as a pack, and the engine settles the bite by a
            majority of their picks: a host who is in the pack sees them, and
            a narrator sees everything. Nobody else does. */}
        {phase === 'Night' && (hostIsWolf || seeEverything) && packPicks.length > 0 && (
          <Text style={styles.pending}>
            The pack is aiming at: {packPicks.join(', ')}
          </Text>
        )}
        {phase === 'Vote' && aliveCount > 0 && pendingVoters.length === 0 && (
          <Text style={styles.ready}>Everyone has voted.</Text>
        )}

        {/* The clock is the host's: a party game dies when the day never ends.
            Only the talking phases get it: every decision carries its own
            window, shown below. */}
        {(phase === 'Day' || phase === 'Debate') && !manager.winner && (
          <View style={styles.timerRow}>
            {manager.getTimerRemainingMs() !== null ? (
              <>
                <Text style={styles.timerText}>
                  {formatRemaining(manager.getTimerRemainingMs() ?? 0)} left
                </Text>
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

        {/* The stage's own window: it closes itself the moment every actor has
            answered, so this only ever counts down to a decision. */}
        {deadline !== null && !manager.winner && (
          <Text style={[styles.timerText, deadline <= 10_000 && styles.urgentText]}>
            {formatRemaining(deadline)} left on this stage
          </Text>
        )}
      </View>

      {manager.winner && (
        <View style={styles.winnerCard}>
          <Text style={styles.winnerText}>
            {winnerText(manager.winner, manager.getWinnerLabel())}
          </Text>
          <Text style={styles.winnerSub}>
            Everyone keeps their seat. Playing again deals new roles to the
            same table; changing the table keeps the seats but lets you pick
            another setup first.
          </Text>
          <BaseButton title="Play again" onPress={rematch} />
          <BaseButton
            title="Change the table"
            onPress={changeTable}
            variant="secondary"
          />
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
          {/* Who voted for whom is public: every guest phone already prints
              the same ballot list, so the host is not shown less than the
              table. */}
          {manager.lastVote.ballots?.map(ballot => (
            <Text key={ballot.voterId} style={styles.ballotText}>
              {ballot.voterName} → {ballot.targetName}
            </Text>
          ))}
        </View>
      )}

      {phase === 'Night' && isTestGame && manager.hasOpenPackTie() && (
        <>
          <Text style={styles.hint}>
            {manager.getPackTieBreakerId()
              ? 'The pack split its vote: the infectious father names the victim, and a test game lets you answer for him.'
              : 'The pack split its vote. Choose the victim.'}
          </Text>
          {manager.getPackTieTargets().map(target => (
            <BaseButton
              key={target.id}
              title={`Devour ${target.name}`}
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
              {/* A blind host sees who is alive and who has voted, nothing
                  more: the roles belong to the narrator view. */}
              <Text style={styles.playerRole}>
                {seeEverything
                  ? `${manager.getRoleOf(player.id)?.name ?? 'unknown'}${
                      player.isAlive ? '' : ' — dead'
                    }`
                  : player.isAlive
                  ? 'alive'
                  : revealedCards.has(player.id)
                  ? `dead — ${revealedCards.get(player.id)}`
                  : 'dead'}
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

      <Text style={styles.hint}>
        Guests connected: {guests.length - droppedGuests} / {guests.length}
        {droppedGuests > 0 ? ' — a dropped guest keeps their seat and can rejoin' : ''}
      </Text>

      <BaseButton title="Back to Lobby" onPress={returnToLobby} variant="danger" />
        </>
      )}

      {tab === 'info' && <InfoTab sections={infoSections} />}

      {tab === 'notes' && (
        <NotesTab
          gameKey={`host-${String(gameId)}`}
          myRole={role?.name ?? 'Host'}
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

      {tab === 'roles' && <RevealedRoles entries={manager.getReveal()} />}
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
  urgentText: {
    color: theme.colors.danger,
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
  testBanner: {
    backgroundColor: '#1F3A2A',
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    marginBottom: theme.spacing.medium,
  },
  bannerText: {
    color: theme.colors.text,
    fontSize: 14,
    textAlign: 'center',
  },
  hint: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginTop: theme.spacing.medium,
  },
});
