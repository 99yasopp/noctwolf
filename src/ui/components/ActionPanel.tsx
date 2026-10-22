import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from './BaseButton';
import { Phase } from '../../engine/types';
import { ALL_ROLES, getCustomRoles } from '../../engine/roleSet';
import { actionLabel } from '../../i18n';
import { useI18n } from '../i18n';

// The role as the local device knows it, normalised so the dashboard and the
// player screen can share the same action UI.
export interface OwnRole {
  // The shipped role this card came from, so a phone can read its own words
  // for it. A role the host invented carries its own id and keeps its text.
  roleId?: string;
  name: string;
  team: string;
  description: string;
  // `chargesLeft` is left out when the action may be used every night.
  nightActions?: { id: string; label: string; kind: string; chargesLeft?: number }[];
  revengeOnDeath?: boolean;
  linksLovers?: boolean;
  allies?: { id: string; name: string }[];
  // The Alien's daylight power.
  guessesRoles?: boolean;
  // The Thief's two spare cards, only while the first night is open.
  thiefCards?: { id: string; name: string }[];
  // The Piper's flock, so his panel does not offer them again.
  charmedIds?: string[];
  // The phases where this card is asked for something of its own.
  scapegoat?: boolean;
  judge?: boolean;
}

export interface ActionTarget {
  id: string;
  name: string;
  isAlive: boolean;
}

interface Props {
  phase: Phase | null;
  role: OwnRole | null;
  selfId: string | null;
  targets: ActionTarget[];
  // Action ids already sent this phase, so one part of a two-part role is not
  // hidden when the other has been answered.
  submitted: string[];
  gameOver: boolean;
  // Night 1 is peaceful, so the wolf is not asked to choose anyone.
  quietNight?: boolean;
  // Whether this player is still in the game. The dead can watch, not act.
  selfAlive?: boolean;
  // During a re-vote only these players are on the ballot.
  candidates?: string[];
  // Which half of the night this is: the wolves first, the witch second.
  nightStage?: number;
  // Who the wolves took, as told to the witch alone.
  victim?: { id: string; name: string } | null;
  // The names the pack left level, sent to the infectious father alone.
  tieTargets?: { id: string; name: string }[];
  // The mayoral election: who is standing, and which half of it is running.
  electionStage?: 'nominate' | 'vote';
  mayorCandidates?: { id: string; name: string }[];
  // The mayor who died and still owes the table a successor.
  successionMayorId?: string | null;
  // The Alien still owes an answer, so the day cannot reach its vote.
  dayFrozen?: boolean;
  // The raven's rule, and the mark he already holds for this vote.
  ravenTiming?: string;
  ravenMark?: { id: string; name: string } | null;
  // Who holds no ballot this vote: the unmasked idiot, the barred players.
  barredVoters?: string[];
  // `roleId` rides along for the Alien's guess: he names a role, not a player.
  onChoose: (actionId: string, targetId: string, roleId?: string) => void;
}

// Only the guard's shield and the witch's potion may be aimed at yourself.
const allowsSelf = (kind: string) => kind === 'protect' || kind === 'heal';
// The White Wolf picks among his pack, and the father only switches his
// infection on, which is why these two do not follow the pack rule above.
const wantsPack = (kind: string) => kind === 'wolfAttack';
// These report 0/1 for "up right now" rather than uses left, so the count
// would read as a lie.
const upNow = (kind: string) =>
  kind === 'wolfAttack' ||
  kind === 'extraAttack' ||
  kind === 'fox' ||
  kind === 'side' ||
  kind === 'model';
// A wolf never eats its own pack.
const excludesPack = (kind: string) => kind === 'attack';

// The same split the engine uses: the night actors first, the witch second,
// because she decides with the wolves' victim in front of her.
const STAGE_TWO_KINDS = ['heal', 'poison'];
const stageOfKind = (kind: string) => (STAGE_TWO_KINDS.includes(kind) ? 2 : 1);

export const ActionPanel: React.FC<Props> = ({
  phase,
  role,
  selfId,
  targets,
  submitted,
  gameOver,
  quietNight = false,
  selfAlive = true,
  candidates,
  nightStage = 1,
  victim = null,
  tieTargets = [],
  electionStage = 'nominate',
  mayorCandidates = [],
  successionMayorId = null,
  dayFrozen = false,
  ravenTiming = 'night',
  ravenMark = null,
  barredVoters = [],
  onChoose,
}) => {
  const { t } = useI18n();

  // The Alien points at a player first, then at a role.
  const [guessTarget, setGuessTarget] = useState<string | null>(null);

  if (gameOver || !phase || !role || !selfId) return null;

  const alive = targets.filter(target => target.isAlive);
  const allyIds = new Set((role.allies ?? []).map(ally => ally.id));
  const charmedIds = new Set(role.charmedIds ?? []);

  if (phase === 'Revenge') {
    // Only the hunter who died gets this panel, so it comes before the
    // "you are out" note below.
    if (!role.revengeOnDeath) return null;

    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>{t('ui.action.takeDown')}</Text>
        {submitted.includes('revenge') ? (
          <Text style={styles.body}>{t('ui.action.chosenWaiting')}</Text>
        ) : (
          <>
            {alive
              .filter(target => target.id !== selfId)
              .map(target => (
                <BaseButton
                  key={target.id}
                  title={target.name}
                  onPress={() => onChoose('revenge', target.id)}
                  variant="secondary"
                />
              ))}
            <BaseButton
              title={t('ui.action.dontShoot')}
              onPress={() => onChoose('decline', 'Revenge')}
              variant="secondary"
            />
          </>
        )}
      </View>
    );
  }

  // The dying mayor names his successor, so this also comes before the
  // "you are out" note: he is dead and still has a call to make.
  if (phase === 'Succession') {
    const isTheMayor = !!successionMayorId && successionMayorId === selfId;

    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>{t('ui.action.mayorDied')}</Text>
        {isTheMayor ? (
          submitted.includes('succession') ? (
            <Text style={styles.body}>{t('ui.action.chosenWaiting')}</Text>
          ) : (
            <>
              <Text style={styles.body}>{t('ui.action.nameSuccessor')}</Text>
              {alive
                .filter(target => target.id !== selfId)
                .map(target => (
                  <BaseButton
                    key={target.id}
                    title={target.name}
                    onPress={() => onChoose('succession', target.id)}
                    variant="secondary"
                  />
                ))}
              <BaseButton
                title={t('ui.action.leaveToTable')}
                onPress={() => onChoose('decline', 'Succession')}
                variant="secondary"
              />
            </>
          )
        ) : (
          <Text style={styles.body}>{t('ui.action.mayorNaming')}</Text>
        )}
      </View>
    );
  }

  if (phase === 'Election' || phase === 'Debate') {
    const iAmStanding = mayorCandidates.some(candidate => candidate.id === selfId);
    const list = mayorCandidates.map(candidate => candidate.name).join(', ');

    if (phase === 'Debate') {
      return (
        <View style={styles.panel}>
          <Text style={styles.heading}>{t('ui.action.candidatesSpeak')}</Text>
          <Text style={styles.body}>
            {t('ui.action.candidatesThen', {
              list: list || t('ui.action.nobodyStanding'),
            })}
          </Text>
        </View>
      );
    }

    if (electionStage === 'nominate') {
      return (
        <View style={styles.panel}>
          <Text style={styles.heading}>{t('ui.action.runForMayor')}</Text>
          {iAmStanding ? (
            <Text style={styles.body}>{t('ui.action.youAreStanding')}</Text>
          ) : mayorCandidates.length >= 3 ? (
            <Text style={styles.body}>{t('ui.action.threeIn', { list })}</Text>
          ) : (
            <>
              <Text style={styles.body}>{t('ui.action.firstThree')}</Text>
              <BaseButton
                title={t('ui.action.standForMayor')}
                onPress={() => onChoose('volunteer', selfId)}
                variant="secondary"
              />
            </>
          )}
          {mayorCandidates.length > 0 && (
            <Text style={styles.body}>{t('ui.action.standing', { list })}</Text>
          )}
        </View>
      );
    }

    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>{t('ui.action.voteForMayor')}</Text>
        {submitted.includes('mayor-vote') ? (
          <Text style={styles.body}>{t('ui.action.submittedWaiting')}</Text>
        ) : (
          mayorCandidates.map(candidate => (
            <BaseButton
              key={candidate.id}
              title={
                candidate.id === selfId
                  ? t('ui.action.yourself', { name: candidate.name })
                  : candidate.name
              }
              onPress={() => onChoose('mayor-vote', candidate.id)}
              variant="secondary"
            />
          ))
        )}
      </View>
    );
  }

  // The dead watch. Saying so is better than leaving the screen blank.
  if (!selfAlive) {
    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>{t('ui.action.youAreOut')}</Text>
        <Text style={styles.body}>{t('ui.action.watchOnly')}</Text>
      </View>
    );
  }

  if (phase === 'Day' && role.guessesRoles) {
    const guessable = [...ALL_ROLES, ...getCustomRoles()].filter(
      (candidate, index, list) =>
        list.findIndex(other => other.id === candidate.id) === index,
    );
    const accused = guessTarget ? alive.find(target => target.id === guessTarget) : null;

    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>
          {dayFrozen ? t('ui.action.pointAgainOrResume') : t('ui.action.alienGuess')}
        </Text>
        {accused ? (
          <>
            <Text style={styles.body}>
              {t('ui.action.whatIsName', { name: accused.name })}
            </Text>
            {guessable.map(candidate => (
              <BaseButton
                key={candidate.id}
                title={candidate.name}
                onPress={() => onChoose('alienGuess', accused.id, candidate.id)}
                variant="secondary"
              />
            ))}
            <BaseButton
              title={t('ui.action.pickSomeoneElse')}
              onPress={() => setGuessTarget(null)}
              variant="secondary"
            />
          </>
        ) : (
          <>
            <Text style={styles.body}>{t('ui.action.pointThenName')}</Text>
            {alive
              .filter(target => target.id !== selfId)
              .map(target => (
                <BaseButton
                  key={target.id}
                  title={target.name}
                  onPress={() => setGuessTarget(target.id)}
                  variant="secondary"
                />
              ))}
          </>
        )}
        {dayFrozen && (
          <BaseButton
            title={t('ui.action.letDayGoOn')}
            onPress={() => onChoose('alienResume', selfId)}
            variant="secondary"
          />
        )}
      </View>
    );
  }

  // The raven's mark is his to move until the vote opens: one name, changed by
  // tapping another.
  if (
    phase === 'Day' &&
    ravenTiming === 'beforeVote' &&
    role.nightActions?.some(option => option.kind === 'curse')
  ) {
    const markable = alive.filter(target => target.id !== selfId);

    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>{t('ui.action.ravenMark')}</Text>
        <Text style={styles.body}>
          {ravenMark
            ? t('ui.action.ravenAgainst', { name: ravenMark.name })
            : t('ui.action.ravenHint')}
        </Text>
        {markable.map(target => (
          <BaseButton
            key={target.id}
            title={target.id === ravenMark?.id ? `${target.name} ✓` : target.name}
            variant="secondary"
            onPress={() => onChoose('ravenMark', target.id)}
          />
        ))}
      </View>
    );
  }

  // Everyone else is told why the vote has not started.
  if (phase === 'Day' && dayFrozen) {
    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>{t('ui.action.dayPaused')}</Text>
        <Text style={styles.body}>{t('ui.action.waitHostBusy')}</Text>
      </View>
    );
  }

  if (phase === 'Vote') {
    const voted = submitted.includes('vote');

    if (barredVoters.includes(selfId)) {
      return (
        <View style={styles.panel}>
          <Text style={styles.heading}>{t('ui.action.mayNotVote')}</Text>
          <Text style={styles.body}>{t('ui.action.ballotTaken')}</Text>
        </View>
      );
    }

    const onBallot =
      candidates && candidates.length > 0
        ? alive.filter(target => candidates.includes(target.id))
        : alive.filter(target => target.id !== selfId);

    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>
          {candidates && candidates.length > 0
            ? t('ui.action.tiedVoteAgain')
            : t('ui.action.voteToEliminate')}
        </Text>
        {voted ? (
          <Text style={styles.body}>{t('ui.action.submittedWaiting')}</Text>
        ) : (
          onBallot.map(target => (
            <BaseButton
              key={target.id}
              title={target.name}
              onPress={() => onChoose('vote', target.id)}
              variant="secondary"
            />
          ))
        )}
      </View>
    );
  }

  // The scapegoat pays for a vote that stayed tied, and bans tomorrow's
  // voters on his way out.
  if (phase === 'Scapegoat') {
    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>
          {role.scapegoat ? t('ui.action.youAreScapegoat') : t('ui.action.scapegoatTie')}
        </Text>
        {role.scapegoat ? (
          <>
            <Text style={styles.body}>{t('ui.action.scapegoatBody')}</Text>
            {alive
              .filter(target => target.id !== selfId)
              .map(target => (
                <BaseButton
                  key={target.id}
                  title={t('ui.action.nameMayNotVote', { name: target.name })}
                  onPress={() => onChoose('scapegoatBan', target.id)}
                  variant="secondary"
                />
              ))}
            <BaseButton
              title={t('ui.action.donePointing')}
              onPress={() => onChoose('decline', 'Scapegoat')}
              variant="secondary"
            />
          </>
        ) : (
          <Text style={styles.body}>{t('ui.action.scapegoatOther')}</Text>
        )}
      </View>
    );
  }

  // One more vote, once per game, when the judge says so.
  if (phase === 'Judge') {
    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>{t('ui.action.judgeHeading')}</Text>
        {role.judge ? (
          <>
            <Text style={styles.body}>{t('ui.action.judgeBody')}</Text>
            <BaseButton title={t('ui.action.oneMoreVote')} onPress={() => onChoose('judgeRepeat', '')} />
            <BaseButton
              title={t('ui.action.letVoteStand')}
              onPress={() => onChoose('decline', 'Judge')}
              variant="secondary"
            />
          </>
        ) : (
          <Text style={styles.body}>{t('ui.action.waitJudge')}</Text>
        )}
      </View>
    );
  }

  if (phase !== 'Night') return null;

  // The pack's vote is split, and the father is the one who names the victim.
  if (nightStage === 1 && tieTargets.length > 0) {
    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>{t('ui.action.packSplit')}</Text>
        {submitted.includes('tieBreak') ? (
          <Text style={styles.body}>{t('ui.action.packNameIn')}</Text>
        ) : (
          <>
            <Text style={styles.body}>{t('ui.action.packSplitBody')}</Text>
            {tieTargets.map(target => (
              <BaseButton
                key={target.id}
                title={target.name}
                onPress={() => onChoose('tieBreak', target.id)}
              />
            ))}
          </>
        )}
      </View>
    );
  }

  const declared = role.nightActions ?? [];
  // The Wolf-Dog picks one camp and the other button goes with it.
  const sideChosen = declared.some(
    option => option.kind === 'side' && submitted.includes(option.id),
  );
  // The wolves look around on the first night instead of feeding, the witch is
  // not woken until the wolves have chosen, and a spent action is gone.
  const offered = declared.filter(option => {
    if (stageOfKind(option.kind) !== nightStage) return false;
    if (option.kind === 'side' && sideChosen) return false;
    if (quietNight && (option.kind === 'attack' || option.kind === 'extraAttack')) {
      return false;
    }
    // In a before-the-vote game the raven marks during the day: the engine
    // would refuse this night button, so it is not offered.
    if (option.kind === 'curse' && ravenTiming === 'beforeVote') return false;
    if (option.chargesLeft === 0) return false;
    return true;
  });

  if (offered.length === 0 && !(role.thiefCards && role.thiefCards.length > 0)) {
    const peaceful = quietNight && declared.some(option => option.kind === 'attack');
    // The witch still holds a potion but the night has not reached her yet.
    const stillToCome = declared.some(
      option =>
        stageOfKind(option.kind) === 2 && nightStage === 1 && option.chargesLeft !== 0,
    );

    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>
          {peaceful
            ? t('ui.action.peacefulNight')
            : stillToCome
            ? t('ui.action.notYet')
            : t('ui.action.night')}
        </Text>
        <Text style={styles.body}>
          {peaceful
            ? t('ui.action.peacefulBody')
            : stillToCome
            ? t('ui.action.wolvesOut')
            : t('ui.action.noNightAction')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      {role.thiefCards && role.thiefCards.length > 0 && (
        <View>
          <Text style={styles.heading}>{t('ui.action.twoCards')}</Text>
          <Text style={styles.body}>{t('ui.action.twoCardsBody')}</Text>
          {role.thiefCards.map(card => (
            <BaseButton
              key={card.id}
              title={t('ui.action.takeCard', { card: card.name })}
              onPress={() => onChoose('thiefSwap', card.id)}
              variant="secondary"
            />
          ))}
          <BaseButton
            title={t('ui.action.keepOwnCard')}
            onPress={() => onChoose('thiefKeep', '')}
            variant="secondary"
          />
        </View>
      )}
      {offered.map(option => {
        const candidates =
          option.kind === 'heal'
            ? victim
              ? alive.filter(target => target.id === victim.id)
              : []
            : option.kind === 'infect' || option.kind === 'spy' || option.kind === 'side'
            ? alive.filter(target => target.id === selfId)
            : alive.filter(target => {
                if (target.id === selfId && !allowsSelf(option.kind)) return false;
                if (wantsPack(option.kind) && !allyIds.has(target.id)) return false;
                if (excludesPack(option.kind) && allyIds.has(target.id)) return false;
                // A charm already stayed: the piper needs new names.
                if (option.kind === 'charm' && charmedIds.has(target.id)) return false;
                return true;
              });

        return (
          <View key={option.id}>
            <Text style={styles.heading}>
              {actionLabel(role.roleId ?? '', option.id, option.label)}
              {typeof option.chargesLeft === 'number' && !upNow(option.kind)
                ? t('ui.action.chargesLeft', { count: option.chargesLeft })
                : ''}
            </Text>
            {submitted.includes(option.id) ? (
              <Text style={styles.body}>{t('ui.action.submitted')}</Text>
            ) : candidates.length === 0 ? (
              <Text style={styles.body}>
                {option.kind === 'heal'
                  ? t('ui.action.nothingToSave')
                  : t('ui.action.noTargets')}
              </Text>
            ) : (
              <>
                {candidates.map(target => (
                  <BaseButton
                    key={target.id}
                    title={
                      option.kind === 'heal'
                        ? t('ui.action.saveName', { name: target.name })
                        : option.kind === 'infect'
                        ? t('ui.action.infectVictim')
                        : option.kind === 'spy'
                        ? t('ui.action.spyWolves')
                        : option.kind === 'side'
                        ? t('ui.action.decideTonight')
                        : target.name
                    }
                    onPress={() => onChoose(option.id, target.id)}
                    variant="secondary"
                  />
                ))}
                {nightStage === 2 && (
                  <BaseButton
                    title={
                      option.kind === 'heal' || option.kind === 'poison'
                        ? t('ui.action.keepPotion')
                        : t('ui.action.keepIt')
                    }
                    onPress={() => onChoose('pass', option.id)}
                    variant="secondary"
                  />
                )}
              </>
            )}
          </View>
        );
      })}
      {nightStage === 2 && (
        <Text style={styles.body}>{t('ui.action.keepPotionHint')}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    marginBottom: theme.spacing.medium,
  },
  heading: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: theme.spacing.small,
  },
  body: {
    color: '#888',
    fontSize: 15,
  },
});
