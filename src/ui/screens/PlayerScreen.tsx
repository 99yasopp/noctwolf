import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text } from '../text';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { RoleCard } from '../components/RoleCard';
import { RosterRow } from '../components/RosterRow';
import { TableStrip } from '../components/TableStrip';
import { useBack } from '../back';
import { ActionPanel, OwnRole } from '../components/ActionPanel';
import { useGame } from '../GameContext';
import { lobby } from '../../network/lobby';
import { ChatGroup, ChatLine, Phase } from '../../engine/types';
import { packIsKnown } from '../../engine/gameManager';
import {
  ChatGroupsPayload,
  GameOverPayload,
  MayorElectedPayload,
  NightStagePayload,
  PhaseUpdatePayload,
  PlayerRef,
  PublicLogPayload,
  RevealEntry,
  RevealPayload,
  RoleAssignPayload,
  RulesUpdatePayload,
  SecretInfoPayload,
  VoteResultPayload,
} from '../../network/protocol';
import { SETTING_DEFS, Settings, settingLabel, settingName } from '../../engine/setup';
import { TabBar } from '../components/TabBar';
import { NotesTab } from '../components/NotesTab';
import { ChatTab } from '../components/ChatTab';
import { RevealedRoles } from '../components/RevealedRoles';
import { InfoTab } from '../components/InfoTab';
import { digestSections, flatSection } from '../info';
import { formatRemaining, winnerText } from '../format';
import { useI18n } from '../i18n';
import { SaidLine, roleName } from '../../i18n';

export const PlayerScreen = () => {
  const { localPlayer, returnToLobby, gameId } = useGame();
  const { t } = useI18n();

  // Which of the phone's pages is open. Play is the game itself.
  const [tab, setTab] = useState<'play' | 'info' | 'notes' | 'chat'>('play');
  // The notes page belongs to one game: a fresh deal opens a new one. On a
  // guest phone the game id never moves, so the deal counts instead.
  const [deal, setDeal] = useState(0);
  // Every card on the table, handed over the moment this player dies.
  const [reveal, setReveal] = useState<RevealEntry[] | null>(null);
  // The journal: every line the table heard, in order, with the round it
  // belonged to.
  const [publicLines, setPublicLines] = useState<PublicLogPayload[]>([]);
  // The private windows this phone holds, and what was said inside them.
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
  const [chatLines, setChatLines] = useState<ChatLine[]>([]);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [round, setRound] = useState(1);
  const [roster, setRoster] = useState<PlayerRef[]>([]);
  const [deaths, setDeaths] = useState<PlayerRef[]>([]);
  const [role, setRole] = useState<RoleAssignPayload | null>(null);
  const [secrets, setSecrets] = useState<SaidLine[]>([]);
  const [voteResult, setVoteResult] = useState<VoteResultPayload | null>(null);
  const [outcome, setOutcome] = useState<GameOverPayload | null>(null);
  const [submitted, setSubmitted] = useState<string[]>([]);
  // Which half of the night it is, and who the wolves took (the witch alone).
  const [nightStage, setNightStage] = useState<1 | 2>(1);
  const [victim, setVictim] = useState<{ id: string; name: string } | null>(null);
  // The names the pack left level, sent to the infectious father alone.
  const [tieTargets, setTieTargets] = useState<{ id: string; name: string }[]>([]);
  // The house rules the deal arrived with. Only the host can change them.
  const [rules, setRules] = useState<Settings | null>(null);
  // The raven's mark, kept on this phone: the table is not told who holds it.
  const [ravenMark, setRavenMark] = useState<{ id: string; name: string } | null>(null);
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
  const [barredVoters, setBarredVoters] = useState<string[]>([]);
  // Whether the role card is covered, for when phones are handed around.
  const [roleHidden, setRoleHidden] = useState(false);
  // The public story of the game, built from what the host already tells us.
  // The countdown is anchored when TIME_SYNC arrives, never on the raw clock,
  // because two phones rarely agree on the time.
  const [clock, setClock] = useState<{
    remainingMs: number;
    receivedAt: number;
    // True when this is a decision this phone still owes, not the host's talk
    // clock: only then is a silent answer a lost turn.
    decision: boolean;
  } | null>(null);
  const [tickNow, setTickNow] = useState(Date.now());
  // The round as the message handler knows it: the handler outlives any single
  // render, so it reads the round from here rather than from state.
  const roundRef = React.useRef(1);
  // The last phase the handler saw. The election rebroadcasts its updates
  // between phases, and those cosmetic updates must not wipe a countdown.
  const phaseRef = React.useRef<Phase | null>(null);
  const [status, setStatus] = useState('');
  const [disconnected, setDisconnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  // Bumped to re-attach the handlers to the new socket after a reconnect.
  const [linkVersion, setLinkVersion] = useState(0);

  useEffect(() => {
    const client = lobby.client;
    if (!client) {
      setStatus(t('ui.play.notConnected'));
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
          setBarredVoters(payload.barredVoters ?? []);
          if (payload.electionStage) setElectionStage(payload.electionStage);
          if (phaseChanged) {
            // Submissions and the phase clock belong to the phase that just
            // ended. A tie re-vote clears its own through VOTE_RESULT.
            setSubmitted([]);
            setClock(null);
            setRavenMark(null);
          }
          setNightStage(1);
          setVictim(null);
          setTieTargets([]);

          break;
        }

        case 'ROLE_ASSIGN': {
          const assign = message.payload as RoleAssignPayload;
          setRole(assign);
          setRoleHidden(false);
          setNightStage(1);
          setVictim(null);
          setTieTargets([]);
          setDayFrozen(false);
          setSubmitted([]);
          // A refresh of the same card keeps the player's own history: only a
          // fresh deal clears the game that came before.
          if (assign.refresh) break;
          // A rematch re-deals into the seat we already hold, so everything
          // from the previous game has to go with the new role.
          setDeal(count => count + 1);
          setSecrets([]);
          setVoteResult(null);
          setOutcome(null);
          setDeaths([]);
          setPublicLines([]);
          setChatGroups([]);
          setChatLines([]);
          setReveal(null);
          setClock(null);
          break;
        }

        case 'TIME_SYNC': {
          const remainingMs = message.payload?.remainingMs;
          setClock(
            typeof remainingMs === 'number'
              ? {
                  remainingMs,
                  receivedAt: Date.now(),
                  decision: !!message.payload?.decision,
                }
              : null,
          );
          break;
        }

        case 'NIGHT_STAGE': {
          const payload = message.payload as NightStagePayload;
          setNightStage(payload.stage === 2 ? 2 : 1);
          // Only the witch is sent the victim; everyone else gets the stage.
          if (payload.victim !== undefined) setVictim(payload.victim ?? null);
          // Only the father is sent the tied names, and only while the pack
          // is split.
          if (payload.tieTargets !== undefined) setTieTargets(payload.tieTargets);
          break;
        }

        case 'SECRET_INFO': {
          const line = message.payload as SecretInfoPayload;
          if (!line?.key) break;
          setSecrets(prev => [...prev, { key: line.key as SaidLine['key'], params: line.params }]);
          break;
        }

        case 'RULES_UPDATE':
          setRules((message.payload as RulesUpdatePayload).settings ?? null);
          break;

        case 'PUBLIC_LOG': {
          const line = message.payload as PublicLogPayload;
          if (!line?.key) break;
          // A phone that reconnected is handed the journal again, so a line it
          // already read must not double.
          setPublicLines(previous =>
            previous.some(
              seen =>
                seen.round === line.round &&
                seen.phase === line.phase &&
                seen.key === line.key &&
                JSON.stringify(seen.params) === JSON.stringify(line.params),
            )
              ? previous
              : [...previous, line],
          );
          break;
        }

        case 'CHAT_GROUPS':
          setChatGroups((message.payload as ChatGroupsPayload)?.groups ?? []);
          break;

        case 'CHAT_MESSAGE': {
          const line = message.payload as ChatLine;
          if (!line?.message) break;
          // A phone that reconnected is handed the window again, so a line it
          // already read must not double.
          setChatLines(previous =>
            previous.some(
              seen =>
                seen.timestamp === line.timestamp &&
                seen.senderId === line.senderId &&
                seen.message === line.message,
            )
              ? previous
              : [...previous, line],
          );
          break;
        }

        case 'VOTE_RESULT': {
          const payload = message.payload as VoteResultPayload;
          setVoteResult(payload);

          // Votes were wiped for a second round between the tied players.
          if (payload.revote) {
            setSubmitted([]);
            setClock(null);
          }
          break;
        }

        case 'MAYOR_ELECTED': {
          const payload = message.payload as MayorElectedPayload;
          setMayorId(payload.playerId);
          break;
        }

        case 'REVEAL': {
          // Out of the game, and handed every card on the table.
          const payload = message.payload as RevealPayload;
          setReveal(payload?.reveal ?? []);
          break;
        }

        case 'GAME_OVER': {
          const payload = message.payload as GameOverPayload;
          setOutcome(payload);
          break;
        }

        case 'KICK':
          // Either the host took this seat away, or the game was already
          // running when this device joined.
          setStatus(
            message.payload?.reason === 'game-running'
              ? t('ui.common.gameRunning')
              : message.payload?.reason === 'seat-taken'
              ? t('ui.common.nameTaken')
              : t('ui.common.removedFromTable'),
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
      setStatus(t('ui.play.lostAgain'));
      return;
    }

    setDisconnected(false);
    // lobby.reconnect swapped in a fresh client, so re-attach to it.
    setLinkVersion(version => version + 1);
  };

  const ownRole: OwnRole | null = role
    ? {
        roleId: role.roleId,
        name: role.roleName,
        team: role.team,
        description: role.description,
        nightActions: role.nightActions,
        revengeOnDeath: role.revengeOnDeath,
        linksLovers: role.linksLovers,
        guessesRoles: role.guessesRoles,
        thiefCards: role.thiefCards,
        charmedIds: role.charmedIds,
        scapegoat: role.scapegoat,
        judge: role.judge,
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
    } else if (actionId === 'thiefSwap') {
      client.sendMessage({
        type: 'THIEF_SWAP',
        payload: { roleId: targetId },
        senderId: localPlayer.id,
        timestamp: Date.now(),
      });
    } else if (actionId === 'thiefKeep') {
      client.sendMessage({
        type: 'THIEF_SWAP',
        payload: { roleId: null },
        senderId: localPlayer.id,
        timestamp: Date.now(),
      });
    } else if (actionId === 'judgeRepeat') {
      client.sendMessage({
        type: 'JUDGE_REPEAT',
        payload: {},
        senderId: localPlayer.id,
        timestamp: Date.now(),
      });
    } else if (actionId === 'scapegoatBan') {
      client.sendMessage({
        type: 'SCAPEGOAT_BAN',
        payload: { targetId },
        senderId: localPlayer.id,
        timestamp: Date.now(),
      });
    } else if (actionId === 'decline') {
      // The phase travels in targetId: the engine checks it against its own.
      client.sendMessage({
        type: 'DECLINE',
        payload: { phase: targetId },
        senderId: localPlayer.id,
        timestamp: Date.now(),
      });
    } else if (actionId === 'tieBreak') {
      client.sendMessage({
        type: 'TIE_BREAK',
        payload: { targetId },
        senderId: localPlayer.id,
        timestamp: Date.now(),
      });
    } else if (actionId === 'ravenMark') {
      client.sendMessage({
        type: 'RAVEN_MARK',
        payload: { targetId },
        senderId: localPlayer.id,
        timestamp: Date.now(),
      });
      setRavenMark({
        id: targetId,
        name: roster.find(entry => entry.id === targetId)?.name ?? targetId,
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

  const sendChat = (group: ChatGroup, text: string) => {
    const client = lobby.client;
    if (!client || !localPlayer) return;

    client.sendMessage({
      type: 'CHAT_SEND',
      payload: { group, message: text },
      senderId: localPlayer.id,
      timestamp: Date.now(),
    });
  };

  // The windows the engine has open right now, read from the table's rules the
  // same way the engine reads them.
  const openGroups = chatGroups.filter(group => {
    if (group === 'lovers') return rules?.['loverChat'] !== 'off';
    if (rules?.['wolfChat'] === 'always') return true;
    if (phase !== 'Night') return false;
    return rules?.['wolfChat'] === 'night' || nightStage === 1;
  });

  const tabs = [
    { id: 'play', label: t('ui.tab.play') },
    { id: 'info', label: t('ui.tab.info') },
    { id: 'notes', label: t('ui.tab.notes') },
    ...(chatGroups.length > 0 ? [{ id: 'chat', label: t('ui.tab.chat') }] : []),
  ];

  // A new page starts at its top: the rail no longer scrolls away with the
  // old page, so it has to put the new one back at the beginning.
  const scrollRef = React.useRef<ScrollView>(null);
  const selectTab = (id: string) => {
    setTab(id as 'play' | 'info' | 'notes' | 'chat');
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  // The pack: a wolf sees who else wears the fur, never which card, and only
  // once the table has its mayor.
  const isWolf = ownRole?.team === 'Wolf';
  const packReady = isWolf && phase !== null && packIsKnown(phase);
  const packIds = new Set(packReady ? (ownRole?.allies ?? []).map(ally => ally.id) : []);
  // The roster is the first word on a death; the reveal follows it.
  const selfAlive = roster.find(entry => entry.id === localPlayer?.id)?.isAlive ?? true;

  // The Info tab reads by round and phase; the table's own rules close it.
  const infoSections = [
    ...digestSections(publicLines, t),
    ...(rules
      ? [
          flatSection(
            t('ui.play.tableRules'),
            SETTING_DEFS.map(def => `${settingName(def)}: ${settingLabel(def, rules[def.id])}`),
          ),
        ]
      : []),
  ];

  // The countdown as this phone sees it: TIME_SYNC is anchored on arrival, so
  // a wrong device clock changes nothing. A decision window turns red for its
  // last ten seconds: that is a turn about to be lost.
  const ticksLeft = clock
    ? Math.max(0, clock.remainingMs - (tickNow - clock.receivedAt))
    : 0;
  const urgent = !!clock?.decision && ticksLeft > 0 && ticksLeft <= 10_000;

  // The phone's back gesture leaves the table, like the button used to.
  useBack(returnToLobby);

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t('ui.play.title')}
        meta={
          phase
            ? t('ui.play.phaseLine', {
                phase: t(`phase.${phase}`, undefined, phase),
                round,
              })
            : undefined
        }
        backLabel={t('ui.back.lobby')}
      />
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
      >
      {tab === 'play' && (
        <>
      {disconnected && (
        <View style={styles.alertCard}>
          <Text style={styles.alertText}>{t('ui.play.seatHeld')}</Text>
          <BaseButton
            title={reconnecting ? t('ui.play.reconnecting') : t('ui.play.reconnect')}
            onPress={reconnect}
          />
        </View>
      )}

      {/* Phones get passed around and glanced at: the role can be covered. */}
      <RoleCard
        role={
          role
            ? {
                id: role.roleId,
                name: role.roleName,
                team: role.team,
                description: role.description,
              }
            : null
        }
        hidden={!!role && roleHidden}
        onShow={() => setRoleHidden(false)}
        onHide={role ? () => setRoleHidden(true) : undefined}
      />

      {/* Out of the game, the dead read the whole table without asking. */}
      {!selfAlive && reveal && !outcome && <RevealedRoles entries={reveal} />}

      {!role && (
        <Text style={styles.hint}>
          {status || (phase ? t('ui.play.waitingStart') : t('ui.play.connecting'))}
        </Text>
      )}

      {outcome && (
        <View style={styles.winnerCard}>
          <Text style={styles.winnerText}>
            {winnerText(outcome.winner, t, {
              key: outcome.winnerKey,
              params: outcome.winnerParams,
            })}
          </Text>
          {outcome.reveal.map(entry => (
            <Text key={entry.id} style={styles.revealText}>
              {entry.name}: {roleName(entry.roleId ?? '', entry.role)}
              {entry.isAlive ? '' : t('ui.roster.deadParen')}
            </Text>
          ))}
        </View>
      )}

      {!outcome && phase && (
        <TableStrip
          cells={[
            {
              value: t('ui.host.aliveLine', {
                alive: roster.filter(entry => entry.isAlive).length,
                total: roster.length,
              }),
            },
            ...(mayorId
              ? [
                  {
                    value: t('ui.play.mayorLine', {
                      name: roster.find(entry => entry.id === mayorId)?.name ?? '',
                      how:
                        rules?.['mayor.doubleVote'] === false
                          ? t('ui.play.mayorSingle')
                          : t('ui.play.mayorDouble'),
                    }),
                  },
                ]
              : []),
          ]}
        >
          {clock && (
            <Text style={[styles.timerText, urgent && styles.urgentText]}>
              {t('ui.play.clockLine', {
                label: clock.decision ? t('ui.play.yourAnswer') : t('ui.play.clock'),
                time: formatRemaining(ticksLeft),
              })}
              {urgent ? t('ui.play.urgent') : ''}
            </Text>
          )}
          {deaths.length > 0 && (
            <Text style={styles.deathText}>
              {t('ui.play.diedNight', { names: deaths.map(d => d.name).join(', ') })}
            </Text>
          )}
          {voteResult && (
            <>
              <Text style={styles.statusText}>
                {t('ui.play.lastVote', {
                  what: voteResult.revote
                    ? t('ui.vote.revote')
                    : voteResult.eliminatedName
                    ? t('ui.vote.eliminated', { name: voteResult.eliminatedName })
                    : voteResult.tie
                    ? t('ui.vote.tied')
                    : t('ui.vote.none'),
                })}
              </Text>
              {voteResult.ballots?.map(ballot => (
                <Text key={ballot.voterId} style={styles.ballotText}>
                  {ballot.voterName} → {ballot.targetName}
                </Text>
              ))}
            </>
          )}
        </TableStrip>
      )}

      {/* Covering the card has to cover the pack too, or the card was never
          really hidden. */}
      {!outcome &&
        !roleHidden &&
        ownRole?.allies &&
        ownRole.allies.length > 0 &&
        (!isWolf || packReady) && (
        <View style={styles.secretCard}>
          <Text style={styles.secretHeading}>
            {ownRole.team === 'Wolf' ? t('ui.pack.yours') : t('ui.pack.alliance')}
          </Text>
          {ownRole.allies.map(ally => (
            <Text key={ally.id} style={styles.secretText}>
              {ally.name}
              {/* The pack is wolves, and only wolves: the cards stay their
                  owners'. */}
              {isWolf ? t('ui.pack.wolfTag') : ''}
            </Text>
          ))}
        </View>
      )}

      {roleHidden ? (
        // The panel names the night action, so it would give the role away just
        // as loudly as the card did.
        <Text style={styles.hint}>{t('ui.play.showToAct')}</Text>
      ) : (
        <ActionPanel
          phase={phase}
          role={ownRole}
          selfId={localPlayer?.id ?? null}
          targets={roster}
          submitted={submitted}
          gameOver={!!outcome}
          quietNight={quietNight}
          selfAlive={selfAlive}
          candidates={voteResult?.revote ? voteResult.candidates?.map(c => c.id) : undefined}
          ravenTiming={
            typeof rules?.['raven.timing'] === 'string'
              ? (rules['raven.timing'] as string)
              : undefined
          }
          ravenMark={ravenMark}
          nightStage={nightStage}
          victim={victim}
          tieTargets={tieTargets}
          electionStage={electionStage}
          mayorCandidates={mayorCandidates}
          successionMayorId={successionMayorId}
          dayFrozen={dayFrozen}
          barredVoters={barredVoters}
          onChoose={submit}
        />
      )}

      {!roleHidden && secrets.length > 0 && (
        <View style={styles.secretCard}>
          <Text style={styles.secretHeading}>{t('ui.play.privateInfo')}</Text>
          {secrets.map((secret, index) => (
            <Text key={index} style={styles.secretText}>
              {t(secret.key, secret.params)}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.sectionRow}>
        <Text style={styles.subHeader}>{t('ui.play.players')}</Text>
        <Text style={styles.sectionCount}>{roster.length}</Text>
      </View>
      {roster.map(entry => {
        const you = entry.id === localPlayer?.id;
        const dead = !entry.isAlive;
        const tags =
          `${you ? t('ui.roster.you') : ''}` +
          `${dead ? t('ui.roster.dead') : ''}` +
          `${!dead && packIds.has(entry.id) ? t('ui.roster.wolfTag') : ''}` +
          `${
            dead && entry.role
              ? t('ui.roster.roleTag', { role: roleName(entry.roleId ?? '', entry.role) })
              : ''
          }`;

        return (
          <RosterRow
            key={entry.id}
            name={entry.name}
            tags={tags}
            dead={dead}
            dotColor={
              dead
                ? theme.colors.dim
                : packIds.has(entry.id)
                ? theme.colors.danger
                : you
                ? theme.colors.primary
                : theme.colors.success
            }
          />
        );
      })}

        </>
      )}

      {tab === 'info' && <InfoTab sections={infoSections} />}

      {tab === 'notes' && (
        <NotesTab
          gameKey={`${gameId}-${deal}`}
          myRole={role ? roleName(role.roleId, role.roleName) : t('ui.play.unknownRole')}
          players={roster.map(entry => entry.name)}
        />
      )}

      {tab === 'chat' && (
        <ChatTab
          groups={chatGroups}
          open={openGroups}
          lines={chatLines}
          selfId={localPlayer?.id ?? ''}
          onSend={sendChat}
        />
      )}

      </ScrollView>
      <TabBar tabs={tabs} active={tab} onSelect={selectTab} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    padding: theme.spacing.medium,
    paddingBottom: theme.spacing.large,
  },
  alertCard: {
    backgroundColor: theme.colors.tintDanger,
    borderStartWidth: 3,
    borderStartColor: theme.colors.danger,
    padding: theme.spacing.medium,
    marginBottom: theme.spacing.medium,
  },
  alertText: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: theme.spacing.small,
  },
  timerText: {
    color: theme.colors.primary,
    fontSize: 22,
    fontWeight: '900',
  },
  urgentText: {
    color: theme.colors.danger,
  },
  ballotText: {
    color: theme.colors.dim,
    fontSize: 13,
    marginTop: 2,
  },
  statusText: {
    color: theme.colors.text,
    fontSize: theme.type.body,
    lineHeight: 22,
    marginVertical: 2,
  },
  deathText: {
    color: theme.colors.danger,
    fontSize: theme.type.body,
    fontWeight: '600',
    marginVertical: 2,
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
    marginBottom: theme.spacing.small,
  },
  revealText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  secretCard: {
    backgroundColor: theme.colors.tintAlliance,
    borderStartWidth: 3,
    borderStartColor: theme.colors.secondary,
    padding: theme.spacing.medium,
    marginBottom: theme.spacing.medium,
  },
  secretHeading: {
    color: theme.colors.primary,
    fontSize: theme.type.card,
    fontWeight: '800',
    marginBottom: theme.spacing.small,
  },
  secretText: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 21,
    marginVertical: 2,
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
  hint: {
    color: theme.colors.dim,
    fontSize: theme.type.small,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: theme.spacing.medium,
  },
});
