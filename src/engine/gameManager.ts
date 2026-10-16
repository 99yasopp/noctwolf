import { GameState } from './state';
import { ActionContext, Phase, Player, Team } from './types';
import { Role } from './roles';
import { GameTransport, nullTransport } from './transport';
import {
  ALL_ROLES,
  ActionKind,
  NightActionOption,
  PlayableRole,
  actionChargeLimit,
  buildCustomRoleSet,
  getCustomRoles,
  getRoleById,
} from './roleSet';
import { SettingValue, Settings, defaultSettings, settingDefault } from './setup';
import {
  KillAction,
  ProtectAction,
  ApplyPunishmentAction,
  EstablishChannelAction,
} from './actions';
import {
  GameOverPayload,
  NightActionPayload,
  NightStagePayload,
  PhaseUpdatePayload,
  PlayerRef,
  RoleAssignPayload,
  SecretInfoPayload,
  TimeSyncPayload,
  VoteBallot,
  VoteResultPayload,
} from '../network/protocol';

// The night runs in two stages. The wolves and the other night actors work
// first; the witch wakes second, with the victim in front of her, because
// healing someone she never saw attacked is not the rule.
const STAGE_TWO_KINDS: ActionKind[] = ['heal', 'poison'];

const stageOfKind = (kind: ActionKind): 1 | 2 =>
  STAGE_TWO_KINDS.includes(kind) ? 2 : 1;

// A settled decision to do nothing, so a bot that keeps its potion is not
// reported as still owing an action.
const PASSED = '__passed__';

// Registry of every action a role is allowed to trigger.
const ACTION_REGISTRY = {
  [KillAction.id]: KillAction,
  [ProtectAction.id]: ProtectAction,
  [ApplyPunishmentAction.id]: ApplyPunishmentAction,
  [EstablishChannelAction.id]: EstablishChannelAction,
};

export type GameEvent =
  | { type: 'changed' }
  | { type: 'secret'; playerId: string; message: string }
  | { type: 'gameOver'; winner: Team };

const shuffle = <T>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export class GameManager {
  public state: GameState;
  public round: number = 1;
  public winner: Team | null = null;
  public lastVote: VoteResultPayload | null = null;
  // What happened, in the order it happened. The narrator reads this, secrets
  // and all.
  public actionLog: string[] = [];
  // The part of it the whole table was told: deaths in the morning, votes,
  // elections. A host who is playing the game sees only this.
  private publicLog: { message: string; phase: Phase; round: number }[] = [];

  private transport: GameTransport;
  private roles: Role[] = [];
  private assignments = new Map<string, PlayableRole>();

  // Every night choice this round, keyed by player and then by action id, so
  // a role with two actions (the witch) can use both.
  private nightChoices = new Map<string, Map<string, string>>();
  // 1 while the wolves and the other actors choose, 2 once the witch is up.
  private nightStage: 1 | 2 = 1;
  // The pack's vote left several names level: whoever breaks the tie, and the
  // names themselves, wait here until the victim is named.
  private packTieOpen = false;
  private packTie: string[] = [];
  private packTiePick: string | null = null;
  // How many times a player has used each action, keyed `playerId:actionId`.
  // A count rather than a flag, because a host may give the witch two potions.
  private chargesUsed = new Map<string, number>();
  // The rules the host picked for this table, by id.
  private settings: Settings = defaultSettings();
  // The guard may not shield the same player twice in a row.
  private lastProtected = new Map<string, string>();
  // Set by Cupid on the first night.
  private lovers: [string, string] | null = null;
  // Round until which each silenced player is out of powers. A silence sent on
  // night r covers the rest of night r and all of day r, which is the same
  // round here, then expires by itself.
  private silencedUntil = new Map<string, number>();
  // `blocker:target` pairs, so two Red Wolves each keep their own list of
  // players they may never silence again.
  private blockedTargets = new Set<string>();
  // Set while the Alien still owes the table an answer: the day cannot move on
  // to the vote until he stops guessing.
  private alienGuess: string | null = null;
  // The Fox keeps his nose only until it fails him once.
  private foxLost = new Set<string>();
  // The Raven's two votes against one player, counted in the next day's vote.
  private ravenTarget: string | null = null;
  // What the seer found, held until the morning so the village can be told.
  private seerSighting: string | null = null;
  // Set by the host when the wolves spotted the little girl tonight.
  private girlCaught = false;
  // The Thief's two spare cards, live only while the first night is.
  private thiefCards = new Map<string, PlayableRole[]>();
  // Who each Wild Child is watching.
  private roleModels = new Map<string, string>();
  // Players who have lost the vote: the unmasked idiot, and whoever a dying
  // scapegoat barred.
  private noVote = new Set<string>();
  private voteBanned = new Set<string>();
  // The scapegoat who must die when the next advance comes, and the players he
  // is barring on his way out.
  private scapegoatPending: string | null = null;
  private scapegoatBans = new Set<string>();
  // Judges who already spent their one second vote.
  private judgeUsed = new Set<string>();
  // The first vote's deaths, kept while a judge decides whether the day gets
  // another one, so the mayor and the hunter still get their due.
  private judgeDeaths: Player[] = [];
  // Everyone the Pied Piper has charmed so far.
  private charmed = new Set<string>();
  // Who won when 'Solitary' is not the lovers: the announcement text, also
  // carried to the screens.
  private winnerLabel: string | null = null;
  // Whoever owes a revenge kill, and the deaths that triggered it.
  private pendingRevenge: string | null = null;
  private revengeChoice: { hunterId: string; targetId: string } | null = null;
  private revengeOrigin: 'Night' | 'Vote' | 'Day' | null = null;
  private revengeDeaths: Player[] = [];

  private votes = new Map<string, string>();
  // Set while the day's vote is being re-run between tied players.
  private revoteCandidates: string[] = [];
  // The mayor is elected, not dealt: a title any player can wear. The
  // PresidentManager holds the title and the double vote that rides with it.
  private mayorVolunteers: string[] = [];
  private electionStage: 'nominate' | 'vote' = 'nominate';
  private electionRevote = false;
  // Who is still on the ballot when the seat goes to a re-vote.
  private mayorRevoteLeaders: string[] = [];
  // A mayor who dies hands the title on, so the table waits for his word.
  private pendingSuccession: string | null = null;
  private successionChoice: { mayorId: string; targetId: string } | null = null;
  private successionOrigin: 'Night' | 'Vote' | 'Day' = 'Night';
  private successionDeaths: Player[] = [];
  // The host's clock for the current phase, if one was set.
  private timer: { endsAt: number; totalMs: number } | null = null;
  private listeners = new Set<(event: GameEvent) => void>();

  constructor(
    players: Player[],
    transport: GameTransport = nullTransport,
    isHost: boolean = false,
  ) {
    this.state = new GameState(players, isHost);
    this.transport = transport;
    console.log(`Game Manager initialized. Is Host: ${isHost}`);
  }

  subscribe(listener: (event: GameEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // A line the whole table hears, so it belongs in the public log too. The
  // phase can be given for lines written just before a phase change, which
  // would otherwise be filed under the phase that is already over.
  private announce(message: string, phase: Phase = this.state.currentPhase) {
    const line = { message, phase, round: this.round };
    this.publicLog.push(line);
    this.actionLog.push(message);

    // Every phone keeps the same journal the host sees, line for line.
    this.transport.broadcast({
      type: 'PUBLIC_LOG',
      payload: line,
      timestamp: Date.now(),
    });
  }

  private emit(event: GameEvent) {
    this.listeners.forEach(listener => listener(event));
  }

  // ---------------------------------------------------------------- lifecycle

  // Assign roles and open the first night. Roles are drawn from a shuffled
  // set so the same player is not always the wolf.
  start(roleSet?: PlayableRole[], settings: Settings = defaultSettings()) {
    const players = this.state.players;
    this.settings = { ...defaultSettings(), ...settings };
    if (players.length === 0) {
      console.warn('Cannot start a game without players');
      return;
    }

    const set = shuffle(
      roleSet && roleSet.length ? roleSet : buildCustomRoleSet(players.length),
    );
    this.assignments.clear();
    this.votes.clear();
    this.nightChoices.clear();
    this.chargesUsed.clear();
    this.lastProtected.clear();
    this.lovers = null;
    this.silencedUntil.clear();
    this.blockedTargets.clear();
    this.alienGuess = null;
    this.winnerLabel = null;
    this.foxLost.clear();
    this.ravenTarget = null;
    this.seerSighting = null;
    this.girlCaught = false;
    this.thiefCards.clear();
    this.roleModels.clear();
    this.noVote.clear();
    this.voteBanned.clear();
    this.scapegoatPending = null;
    this.scapegoatBans.clear();
    this.judgeUsed.clear();
    this.judgeDeaths = [];
    this.charmed.clear();
    this.pendingRevenge = null;
    this.revengeChoice = null;
    this.revengeOrigin = null;
    this.revengeDeaths = [];
    this.revoteCandidates = [];
    this.timer = null;
    this.nightStage = 1;
    this.packTieOpen = false;
    this.packTie = [];
    this.packTiePick = null;
    this.mayorVolunteers = [];
    this.electionStage = 'nominate';
    this.electionRevote = false;
    this.mayorRevoteLeaders = [];
    this.pendingSuccession = null;
    this.successionChoice = null;
    this.successionDeaths = [];
    this.state.presidentManager.reset(this.state.players);
    this.actionLog = [];
    this.publicLog = [];
    this.lastVote = null;
    this.round = 1;
    this.winner = null;

    players.forEach((player, index) => {
      const role = set[index % set.length];
      this.assignments.set(player.id, role);
      player.role = role.name;
      player.team = role.team;
      player.isAlive = true;
      player.statusEffects = [];
      player.voteWeight = role.voteWeight ?? 1;
    });

    // Two spare cards land in front of every Thief. They are drawn from every
    // role the app knows, his own among the exclusions, because the setup
    // deals exactly one card per seat and keeps nothing back.
    const deck = [...ALL_ROLES, ...getCustomRoles()];
    players.forEach(player => {
      if (this.assignments.get(player.id)?.id !== 'thief') return;
      const own = this.assignments.get(player.id)!.id;
      const pool = deck.filter(role => role.id !== own);
      const drawn: PlayableRole[] = [];
      while (drawn.length < 2 && pool.length > 0) {
        const pick = Math.floor(Math.random() * pool.length);
        drawn.push(pool.splice(pick, 1)[0]);
      }
      this.thiefCards.set(player.id, drawn);
    });

    players.forEach(player => {
      const role = this.assignments.get(player.id);
      if (role) this.sendRoleAssign(player.id, role);
    });

    // The table's rules travel to the guests with the deal: only the host can
    // change them, but everyone can read what they are.
    this.transport.broadcast({
      type: 'RULES_UPDATE',
      payload: { settings: { ...this.settings } },
      timestamp: Date.now(),
    });

    // These two are filed under the election the table is about to enter:
    // tagged with the phase that is still on the clock they would disappear
    // from the blind host's log for the whole first night.
    this.announce(`${players.length} players were dealt their roles.`, 'Election');
    // The mayor is chosen before the first night, and a wolf may win the seat.
    this.announce('The table elects a mayor before the first night.', 'Election');
    this.setPhase('Election');
  }

  // { phase: 'Night' } opens a fresh night, { phase: 'Day' } announces the
  // night's deaths, { phase: 'Vote' } collects votes.
  transitionTo(phase: Phase) {
    this.setPhase(phase);
  }

  // The single host-driven button: resolves the current phase and moves on.
  advance() {
    if (this.winner) return;

    switch (this.state.currentPhase) {
      case 'Night':
        // The pack's vote left two names level: nothing resolves until one of
        // them is named, by the father or by the host.
        if (this.nightStage === 1 && this.packTieOpen && !this.packTiePick) return;
        // First press: a split pack opens the tie window, or the wolves are
        // done and the witch wakes. Second press: the night resolves. A table
        // with no witch and no tie skips straight through.
        if (this.nightStage === 1 && this.openPackTie()) return;
        if (this.nightStage === 1 && this.hasStageTwoActors()) {
          this.wakeTheWitch();
          return;
        }
        this.enterAfterDeaths('Night', this.resolveNight());
        return;

      case 'Revenge':
        this.enterAfterDeaths(this.revengeOrigin ?? 'Vote', this.resolveRevenge());
        return;

      case 'Day':
        // The Alien still owes the table an answer: the vote must wait.
        if (this.alienGuess) return;
        this.setPhase('Vote');
        return;

      case 'Vote':
        this.resolveVote();
        return;

      case 'Election':
        // First press closes the nominations, the host then runs the debate,
        // and the last press counts the ballots.
        if (this.electionStage === 'nominate') this.closeNominations();
        else this.resolveMayorVote();
        return;

      case 'Debate':
        this.electionStage = 'vote';
        this.votes.clear();
        this.setPhase('Election');
        return;

      case 'Succession':
        this.resolveSuccession();
        return;

      case 'Scapegoat': {
        // He pays for the tie now, and the voters he barred keep their ban for
        // tomorrow's vote.
        const goat = this.state.players.find(p => p.id === this.scapegoatPending);
        this.scapegoatPending = null;
        this.voteBanned = new Set(this.scapegoatBans);
        this.scapegoatBans.clear();

        const deaths: Player[] = [];
        if (goat?.isAlive) {
          goat.isAlive = false;
          deaths.push(goat);
          this.applyLoverDeaths(deaths);
          // A hunter from the day's vote keeps the shot he is owed.
          if (!this.pendingRevenge) {
            this.pendingRevenge =
              deaths.find(
                dead =>
                  this.assignments.get(dead.id)?.revengeOnDeath &&
                  this.state.players.some(other => other.isAlive),
              )?.id ?? null;
          }
          this.announce(`Day ${this.round}: ${goat.name}, the scapegoat, is dead.`);
        }

        // The day can end on this death: the votes that came before it still
        // owe their mayor a succession and their hunter a shot.
        const allDeaths = [...this.judgeDeaths, ...deaths];
        this.judgeDeaths = [];
        this.enterAfterDeaths('Vote', allDeaths);
        return;
      }

      case 'Judge':
        // He said nothing, so the day ends on the vote that already happened.
        this.enterAfterDeaths('Vote', this.judgeDeaths);
        this.judgeDeaths = [];
        return;

      default:
        this.setPhase('Night');
    }
  }

  // Deaths hand the game to whoever is still owed an action: the dying mayor
  // names a successor first, then the hunter fires, and only then does the
  // phase close.
  private enterAfterDeaths(origin: 'Night' | 'Vote' | 'Day', deaths: Player[]) {
    const mayorId = this.state.presidentManager.getPresidentId();

    if (
      mayorId &&
      deaths.some(dead => dead.id === mayorId) &&
      this.state.players.some(player => player.isAlive)
    ) {
      this.pendingSuccession = mayorId;
    }

    if (this.pendingSuccession) {
      this.successionOrigin = origin;
      this.successionDeaths = deaths;
      this.setPhase('Succession');
      return;
    }

    if (this.pendingRevenge) {
      this.revengeOrigin = origin;
      this.revengeDeaths = deaths;
      this.setPhase('Revenge');
      return;
    }

    this.endPhase(origin, deaths);
  }

  private endPhase(origin: 'Night' | 'Vote' | 'Day', deaths: Player[]) {
    if (origin === 'Night') this.enterDay(deaths);
    else if (origin === 'Day') this.resumeDay();
    else this.enterNextRound();
  }

  // A day that lost a player without reaching its vote, which is what the
  // Alien's guess leaves behind.
  private resumeDay() {
    if (this.winner) return;

    this.setPhase('Day');
    const winner = this.checkWin();
    if (winner) this.finish(winner);
  }

  private enterDay(deaths: Player[]) {
    this.setPhase('Day', { deaths: this.toRefs(deaths) });

    // The table is told who died, not how: the cause is the narrator's detail.
    this.announce(
      deaths.length > 0
        ? `Day ${this.round}: ${deaths.map(p => p.name).join(', ')} did not survive the night.`
        : `Day ${this.round}: nobody died in the night.`,
    );

    // A table that lets the seer speak hears what he found, never who he saw.
    if (this.seerSighting) {
      this.announce(`Day ${this.round}: ${this.seerSighting}`);
      this.seerSighting = null;
    }

    // The Angel wanted the first night's attack to be theirs, and takes the
    // game with it instead of a villager's life.
    if (this.round === 1 && deaths.some(dead => this.assignments.get(dead.id)?.angel)) {
      this.winnerLabel = 'The Angel wins.';
      this.finish('Solitary');
      return;
    }

    // A bear growls when a wolf is sitting next to its tamer. Nobody is named,
    // but the table hears it.
    this.state.players
      .filter(player => player.isAlive && this.assignments.get(player.id)?.bearTamer)
      .forEach(tamer => {
        const neighbours = this.neighbourhood(tamer.id).filter(p => p.id !== tamer.id);
        if (neighbours.some(p => this.assignments.get(p.id)?.team === 'Wolf')) {
          this.announce(`Day ${this.round}: the bear tamer's bear growls.`);
        }
      });

    const winner = this.checkWin();
    if (winner) this.finish(winner);
  }

  private enterNextRound() {
    // The model may have died to the day's vote: the child turns before the
    // win is judged, or a parity win would be a morning late.
    this.turnWildChildren();

    const winner = this.checkWin();
    if (winner) {
      this.finish(winner);
      return;
    }

    this.round += 1;

    // The Thief's spare cards were for the first night alone, and every card
    // is sent again so the panels show tonight's powers rather than last
    // night's. The role is unchanged, so the screens refresh in place.
    this.thiefCards.clear();
    this.state.players.forEach(player => this.resendRoleTo(player.id));

    this.setPhase('Night');
  }

  // ------------------------------------------------------------------ actions

  private choicesFor(playerId: string): Map<string, string> {
    let choices = this.nightChoices.get(playerId);
    if (!choices) {
      choices = new Map<string, string>();
      this.nightChoices.set(playerId, choices);
    }
    return choices;
  }

  private chargeKey(playerId: string, actionId: string): string {
    return `${playerId}:${actionId}`;
  }

  private hasChoice(playerId: string, actionId: string): boolean {
    return this.nightChoices.get(playerId)?.has(actionId) ?? false;
  }

  // How many times this player has used this action.
  private chargesUsedBy(playerId: string, actionId: string): number {
    return this.chargesUsed.get(this.chargeKey(playerId, actionId)) ?? 0;
  }

  private spendCharge(playerId: string, actionId: string) {
    this.chargesUsed.set(
      this.chargeKey(playerId, actionId),
      this.chargesUsedBy(playerId, actionId) + 1,
    );
  }

  // Whether this action is on the table for this player tonight. The wolves
  // skip the first night, the cupid only works on the first night, a spent
  // potion is gone for good, and each kind belongs to one half of the night.
  // `ignoreStage` asks the same question about the other half, which is how the
  // engine knows whether a witch is still waiting to be woken.
  private isOptionOffered(
    playerId: string,
    option: NightActionOption,
    ignoreStage = false,
  ): boolean {
    if (!ignoreStage && stageOfKind(option.kind) !== this.nightStage) return false;
    // A silenced player has no powers at all, night or day.
    if (this.isSilenced(playerId)) return false;
    if (this.chargesUsedBy(playerId, option.id) >= actionChargeLimit(option)) return false;
    if (option.kind === 'link' && this.round !== 1) return false;
    if (option.kind === 'attack' && this.isQuietNight()) return false;
    // A peaceful night gives the Big Bad Wolf nothing to add to either.
    if (option.kind === 'extraAttack' && (this.isQuietNight() || this.anyWolfDead())) {
      return false;
    }
    // The White Wolf stalks every second night, and the infection replaces a
    // bite that a peaceful night never takes.
    if (option.kind === 'wolfAttack' && this.round % 2 !== 0) return false;
    if (option.kind === 'infect' && this.isQuietNight()) return false;
    // A fox that once found nothing has lost his nose for good.
    if (option.kind === 'fox' && this.foxLost.has(playerId)) return false;
    // The raven may hold his mark for the day itself, so the night offers him
    // nothing.
    if (option.kind === 'curse' && this.setting('raven.timing') === 'beforeVote') {
      return false;
    }
    // First-night choices: the Wolf-Dog picks a camp and the Wild Child picks
    // the player he watches. Neither can be taken later.
    if ((option.kind === 'side' || option.kind === 'model') && this.round !== 1) {
      return false;
    }
    // Nothing to save means no potion to offer.
    if (option.kind === 'heal' && !this.healTarget()) return false;
    return true;
  }

  // True once any wolf has fallen: the Big Bad Wolf's second bite is gone for
  // good from that night on.
  private anyWolfDead(): boolean {
    return this.state.players.some(
      player => !player.isAlive && this.assignments.get(player.id)?.team === 'Wolf',
    );
  }

  // The Infectious Father's choice for tonight, if he made it: his infection
  // replaces the pack's bite on whoever they picked.
  private pendingInfection(): { playerId: string; actionId: string } | null {
    let found: { playerId: string; actionId: string } | null = null;

    this.nightChoices.forEach((choices, playerId) => {
      const actor = this.state.players.find(p => p.id === playerId);
      const role = this.assignments.get(playerId);
      if (!actor?.isAlive || !role || this.isSilenced(playerId)) return;

      choices.forEach((targetId, actionId) => {
        if (targetId === PASSED) return;
        const option = role.nightActions?.find(candidate => candidate.id === actionId);
        if (option?.kind === 'infect') found = { playerId, actionId };
      });
    });

    return found;
  }

  // True while a Red Wolf's silence still covers this player.
  isSilenced(playerId: string): boolean {
    return this.round <= (this.silencedUntil.get(playerId) ?? 0);
  }

  // The Little Girl, if she spied tonight: the host's catch is hers to take.
  private whoSpied(): string | null {
    let found: string | null = null;

    this.nightChoices.forEach((choices, playerId) => {
      const actor = this.state.players.find(p => p.id === playerId);
      const role = this.assignments.get(playerId);
      if (!actor?.isAlive || !role || this.isSilenced(playerId)) return;

      choices.forEach((targetId, actionId) => {
        if (targetId === PASSED) return;
        if (role.nightActions?.find(candidate => candidate.id === actionId)?.kind === 'spy') {
          found = playerId;
        }
      });
    });

    return found;
  }

  // A player and the living seats around him: the fox reads all three, and the
  // bear tamer only cares about the two neighbours.
  private neighbourhood(playerId: string): Player[] {
    const alive = this.getAlivePlayers();
    const index = alive.findIndex(player => player.id === playerId);
    if (index < 0) return [];

    const count = alive.length;
    const at = (offset: number) => alive[(index + offset + count) % count];
    return [...new Set([at(-1), at(0), at(1)])];
  }

  // The day waits for the Alien: no vote, and the host cannot move it on.
  isDayFrozen(): boolean {
    return this.alienGuess !== null;
  }

  // True when a Little Girl sits at this table. The host asked for her card,
  // so this only tells his own screen when the button is worth showing.
  hasLittleGirl(): boolean {
    return this.state.players.some(
      p => p.isAlive && this.assignments.get(p.id)?.id === 'little-girl',
    );
  }

  // The host decides: the wolves spotted the little girl tonight, so she dies
  // in the victim's place. A night she did not spy on changes nothing.
  catchLittleGirl(): boolean {
    if (this.winner) return false;
    if (this.state.currentPhase !== 'Night' || this.girlCaught) return false;

    this.girlCaught = true;
    this.actionLog.push(`Night ${this.round}: the little girl was caught.`);
    this.emit({ type: 'changed' });
    return true;
  }

  isGirlCaught(): boolean {
    return this.girlCaught;
  }

  isCharmed(playerId: string): boolean {
    return this.charmed.has(playerId);
  }

  // The Piper's flock so far, for the host's own panel.
  getCharmedIds(): string[] {
    return [...this.charmed];
  }

  // The Thief's live spare cards, for the host's own panel: the guests get
  // theirs with the role card.
  getThiefCards(playerId: string): { id: string; name: string }[] {
    return (this.thiefCards.get(playerId) ?? []).map(card => ({
      id: card.id,
      name: card.name,
    }));
  }

  // Who the wolves took tonight, as far as the choice alone says. Null when
  // they have not picked, or picked nobody. The father's tie-break outranks
  // the tally the moment he names a name.
  private victimOfNight(): Player | null {
    if (this.packTiePick) {
      return this.state.players.find(p => p.id === this.packTiePick) ?? null;
    }

    const targetId = this.pickMostVoted(this.attackTally());
    return this.state.players.find(p => p.id === targetId) ?? null;
  }

  // Every block that lands tonight, in seating order. Seating order is what
  // settles two wolves silencing each other: the earlier seat lands first and
  // takes the later one's voice with it.
  private blockChoices(): { actorId: string; targetId: string }[] {
    const chosen: { actorId: string; targetId: string }[] = [];

    this.state.players.forEach(actor => {
      const role = this.assignments.get(actor.id);
      const choices = this.nightChoices.get(actor.id);
      if (!actor.isAlive || !role || !choices) return;
      // A Red Wolf still under an earlier silence has no powers tonight.
      if (this.isSilenced(actor.id)) return;
      if (chosen.some(choice => choice.targetId === actor.id)) return;

      choices.forEach((targetId, actionId) => {
        const option = role.nightActions?.find(candidate => candidate.id === actionId);
        if (option?.kind !== 'block' || targetId === PASSED) return;
        chosen.push({ actorId: actor.id, targetId });
      });
    });

    return chosen;
  }

  // The pack's picks, counted once and read by the tie window, the witch's
  // victim and the resolution itself, so they can never disagree. Resolution
  // drops a wolf the block catches tonight and the father's own kill vote when
  // he is infecting instead, and those two filters are read here the same way.
  private attackTally(): Map<string, number> {
    const votes = new Map<string, number>();
    const silenced = new Set(this.blockChoices().map(choice => choice.targetId));
    const infection = this.pendingInfection();

    this.nightChoices.forEach((choices, playerId) => {
      const actor = this.state.players.find(p => p.id === playerId);
      const role = this.assignments.get(playerId);
      if (!actor?.isAlive || !role) return;
      // A player silenced on an earlier night has no powers tonight; tonight's
      // silence lands with the block above.
      if (this.isSilenced(playerId) || silenced.has(playerId)) return;
      if (infection?.playerId === playerId) return;

      choices.forEach((targetId, actionId) => {
        const option = role.nightActions?.find(candidate => candidate.id === actionId);
        if (option?.kind !== 'attack' || targetId === PASSED) return;
        votes.set(targetId, (votes.get(targetId) ?? 0) + 1);
      });
    });

    return votes;
  }

  // Every name the pack left level on the top count. Two or more means a tie.
  private packTieLeaders(): Player[] {
    const tally = this.attackTally();
    let top = 0;
    tally.forEach(count => {
      if (count > top) top = count;
    });
    if (top === 0) return [];

    const leaders = [...tally.entries()]
      .filter(([, count]) => count === top)
      .map(([id]) => id);
    if (leaders.length < 2) return [];

    return this.state.players.filter(player => player.isAlive && leaders.includes(player.id));
  }

  // The Infectious Father decides a split pack. He has to be awake and holding
  // his powers: a silenced wolf says nothing.
  private packTieBreaker(): Player | null {
    return (
      this.state.players.find(
        player =>
          player.isAlive &&
          !this.isSilenced(player.id) &&
          this.assignments
            .get(player.id)
            ?.nightActions?.some(option => option.kind === 'infect'),
      ) ?? null
    );
  }

  private isShieldedBySomeone(targetId: string): boolean {
    let shielded = false;

    this.nightChoices.forEach((choices, playerId) => {
      const role = this.assignments.get(playerId);
      choices.forEach((chosenTarget, actionId) => {
        const option = role?.nightActions?.find(candidate => candidate.id === actionId);
        if (option?.kind === 'protect' && chosenTarget === targetId) shielded = true;
      });
    });

    return shielded;
  }

  // The one player the healing potion may be pointed at, if any.
  private healTarget(): Player | null {
    const victim = this.victimOfNight();
    if (!victim?.isAlive) return null;
    if (this.isShieldedBySomeone(victim.id)) return null;
    // Nothing for the potion to do against a player the wolves cannot even
    // hurt: the Alien keeps his skin and the witch keeps her potion.
    if (this.assignments.get(victim.id)?.wolfImmune) return null;
    // The father is about to infect the pack's victim instead of killing
    // them, so there is no death to save.
    if (this.pendingInfection()) return null;
    // The wolves have the little girl instead: the victim walks away unhurt.
    if (this.girlCaught && this.whoSpied()) return null;
    return victim;
  }

  // Whether anyone is still waiting for the second half of the night.
  private hasStageTwoActors(): boolean {
    return this.state.players.some(player => {
      if (!player.isAlive) return false;
      const role = this.assignments.get(player.id);

      return !!role?.nightActions?.some(
        option => stageOfKind(option.kind) === 2 && this.isOptionOffered(player.id, option, true),
      );
    });
  }

  // The legal targets for one action, shared by the players and the bots.
  private validTargets(player: Player, option: NightActionOption): Player[] {
    const victim = option.kind === 'heal' ? this.healTarget() : null;

    return this.state.players.filter(target => {
      if (!target.isAlive) return false;
      // The healing potion saves the wolves' victim, nobody else.
      if (option.kind === 'heal') return !!victim && victim.id === target.id;
      if (target.id === player.id && !option.allowSelf) return false;
      if (option.kind === 'attack' && this.assignments.get(target.id)?.team === 'Wolf') return false;
      // The White Wolf picks among his own kin, and the father only switches
      // the infection on: the pack's victim is whoever the pack picked. The
      // little girl has no target either: she only opens her eyes.
      if (option.kind === 'wolfAttack' && this.assignments.get(target.id)?.team !== 'Wolf') {
        return false;
      }
      if ((option.kind === 'infect' || option.kind === 'spy' || option.kind === 'side') && target.id !== player.id) {
        return false;
      }
      if (
        option.kind === 'protect' &&
        this.setting('guardNoRepeat') === true &&
        this.lastProtected.get(player.id) === target.id
      ) {
        return false;
      }
      // A Red Wolf never silences the same player twice in a whole game.
      if (option.kind === 'block' && this.blockedTargets.has(`${player.id}:${target.id}`)) {
        return false;
      }
      // Nobody is charmed twice: the piper's flock grows by new names only.
      if (option.kind === 'charm' && this.charmed.has(target.id)) return false;
      return true;
    });
  }

  handleNightAction(playerId: string, actionId: string, targetId: string): boolean {
    if (this.winner) return false;
    if (this.state.currentPhase !== 'Night') return false;

    const actor = this.state.players.find(p => p.id === playerId);
    if (!actor || !actor.isAlive) return false;

    const role = this.assignments.get(playerId);
    const option = role?.nightActions?.find(candidate => candidate.id === actionId);
    if (!role || !option) return false;
    if (!this.isOptionOffered(playerId, option)) return false;
    if (!this.validTargets(actor, option).some(target => target.id === targetId)) return false;

    const chosen = this.choicesFor(playerId);
    // One charm per player per night: a second tap on the same name would be
    // spent for nothing.
    if (option.kind === 'charm' && [...chosen.values()].includes(targetId)) return false;
    // The Wolf-Dog's camps are one decision: the second tap would silently
    // overrule the first.
    if (option.kind === 'side') {
      const sideIds = (role.nightActions ?? [])
        .filter(candidate => candidate.kind === 'side')
        .map(candidate => candidate.id);
      if (sideIds.some(id => chosen.has(id))) return false;
    }

    chosen.set(actionId, targetId);
    this.emit({ type: 'changed' });
    return true;
  }

  // Keeping a potion is a decision too, and it has to be visible as one or the
  // host waits on a player who has already made up his mind.
  passNightAction(playerId: string, actionId: string): boolean {
    if (this.winner) return false;
    if (this.state.currentPhase !== 'Night') return false;

    const actor = this.state.players.find(p => p.id === playerId);
    if (!actor || !actor.isAlive) return false;

    const role = this.assignments.get(playerId);
    const option = role?.nightActions?.find(candidate => candidate.id === actionId);
    if (!option) return false;
    // The same gate as an actual choice: a pass can only decline an action the
    // engine is offering right now, not a stale one from an earlier night.
    if (!this.isOptionOffered(playerId, option)) return false;

    this.choicesFor(playerId).set(actionId, PASSED);
    this.emit({ type: 'changed' });
    return true;
  }

  // The dead hunter's parting shot.
  handleRevenge(playerId: string, targetId: string): boolean {
    if (this.winner) return false;
    if (this.state.currentPhase !== 'Revenge') return false;
    if (this.pendingRevenge !== playerId) return false;

    const hunter = this.state.players.find(p => p.id === playerId);
    const target = this.state.players.find(p => p.id === targetId);
    if (!hunter || !target || !target.isAlive) return false;
    if (target.id === playerId) return false;

    this.revengeChoice = { hunterId: playerId, targetId };
    this.emit({ type: 'changed' });
    return true;
  }

  // The dying mayor hands the double vote on. He is dead, so unlike the
  // hunter he is not required to be alive to make the call.
  handleSuccession(playerId: string, targetId: string): boolean {
    if (this.winner) return false;
    if (this.state.currentPhase !== 'Succession') return false;
    if (this.pendingSuccession !== playerId) return false;

    const mayor = this.state.players.find(p => p.id === playerId);
    const target = this.state.players.find(p => p.id === targetId);
    if (!mayor || !target?.isAlive) return false;
    if (target.id === playerId) return false;

    this.successionChoice = { mayorId: playerId, targetId };
    this.emit({ type: 'changed' });
    return true;
  }

  private resolveSuccession() {
    const dyingMayorId = this.pendingSuccession;
    const choice = this.successionChoice;

    this.pendingSuccession = null;
    this.successionChoice = null;

    if (dyingMayorId && choice?.mayorId === dyingMayorId) {
      const successor = this.state.players.find(p => p.id === choice.targetId);

      if (successor?.isAlive) {
        this.state.presidentManager.handleSuccession(
          dyingMayorId,
          successor.id,
          this.state.players,
        );
        this.announce(`${successor.name} takes the mayor's seat.`);

        this.transport.broadcast({
          type: 'MAYOR_ELECTED',
          payload: { playerId: successor.id, playerName: successor.name },
          timestamp: Date.now(),
        });
      }
    } else if (dyingMayorId) {
      // The seat goes unfilled, and the dead mayor's double vote goes with it.
      const mayor = this.state.players.find(p => p.id === dyingMayorId);
      if (mayor) mayor.voteWeight = 1;

      this.announce('The mayor died without naming anyone: the seat stays empty.');
      // No successor means nobody wears the double vote until a new election.
      this.state.presidentManager.clearPresident(this.state.players);
    }

    this.emit({ type: 'changed' });
    this.enterAfterDeaths(this.successionOrigin, this.successionDeaths);
  }

  handleVote(voterId: string, targetId: string): boolean {
    if (this.winner) return false;
    if (this.state.currentPhase !== 'Vote') return false;

    const voter = this.state.players.find(p => p.id === voterId);
    if (!voter || !voter.isAlive) return false;

    // The unmasked idiot and the scapegoat's bans have no ballot to cast.
    if (this.noVote.has(voterId) || this.voteBanned.has(voterId)) return false;

    const target = this.state.players.find(p => p.id === targetId);
    if (!target || !target.isAlive) return false;

    // During a re-vote only the tied players are on the ballot.
    if (this.revoteCandidates.length > 0 && !this.revoteCandidates.includes(targetId)) {
      return false;
    }

    this.votes.set(voterId, targetId);
    this.emit({ type: 'changed' });
    return true;
  }

  // -------------------------------------------------------- the Alien's day

  // The Alien names a player's role. Wrong: the Alien dies and the day goes on.
  // Right: the target dies, and a wolf target ends the day where it stands.
  handleAlienGuess(alienId: string, targetId: string, roleId: string): boolean {
    if (this.winner) return false;
    if (this.state.currentPhase !== 'Day') return false;
    if (this.alienGuess !== null && this.alienGuess !== alienId) return false;

    const alien = this.state.players.find(p => p.id === alienId);
    const role = this.assignments.get(alienId);
    if (!alien?.isAlive || !role?.guessesRoles) return false;
    if (this.isSilenced(alienId)) return false;

    const target = this.state.players.find(p => p.id === targetId);
    if (!target?.isAlive || target.id === alienId) return false;

    // Any role the app knows may be named, not only the ones in play.
    if (
      !getRoleById(roleId) &&
      !getCustomRoles().some(candidate => candidate.id === roleId)
    ) {
      return false;
    }

    const truth = this.assignments.get(target.id);
    const correct = truth?.id === roleId;
    // Whatever happens next, the open question is answered.
    this.alienGuess = null;
    this.actionLog.push(
      `Day ${this.round}: the Alien named ${target.name} as ${roleId} and was ${
        correct ? 'right' : 'wrong'
      }.`,
    );

    const deaths: Player[] = [];
    if (correct) {
      this.killInDay(target, deaths);
      this.sendAlienResult(
        alienId,
        `${target.name} was ${truth?.name} and is dead. Point again, or let the day go on.`,
      );
    } else {
      this.killInDay(alien, deaths);
      this.sendAlienResult(alienId, `${target.name} was not that role. The guess has killed you.`);
    }

    // A lover never outlives the other, day or night.
    this.applyLoverDeaths(deaths);

    // A hunter still gets his parting shot, Alien or not.
    this.pendingRevenge =
      deaths.find(
        dead =>
          this.assignments.get(dead.id)?.revengeOnDeath &&
          this.state.players.some(other => other.isAlive),
      )?.id ?? null;

    // A wolf's death mid-day ends the day: nobody votes after that. The death
    // chain runs first either way, so a dying mayor still names a successor
    // and a hunter still fires before the day takes its leave.
    const dayEnds = correct && truth?.team === 'Wolf';
    if (correct && !dayEnds) {
      // He may point again; the frozen flag holds the host at the day.
      this.alienGuess = alienId;
    }

    // Everyone the guess took is announced, never why.
    deaths.forEach(dead => this.announce(`Day ${this.round}: ${dead.name} has died.`));

    this.enterAfterDeaths(dayEnds ? 'Vote' : 'Day', deaths);
    return true;
  }

  // The Alien hands the day back without pointing at anyone else.
  handleAlienResume(alienId: string): boolean {
    if (this.winner) return false;
    if (this.state.currentPhase !== 'Day') return false;
    if (this.alienGuess !== alienId) return false;

    this.alienGuess = null;
    this.broadcastPhase();
    this.emit({ type: 'changed' });
    return true;
  }

  // The Thief turns one of his two spare cards over, or keeps his own. Only
  // the first night is open for it, and only the cards he was dealt.
  handleThiefSwap(playerId: string, roleId: string | null): boolean {
    if (this.winner) return false;
    if (this.state.currentPhase !== 'Night' || this.round !== 1) return false;

    const player = this.state.players.find(p => p.id === playerId);
    if (!player?.isAlive) return false;

    const cards = this.thiefCards.get(playerId);
    if (!cards || cards.length === 0) return false;

    const taken = roleId === null ? undefined : cards.find(card => card.id === roleId);
    if (roleId !== null && !taken) return false;

    this.thiefCards.delete(playerId);

    if (taken) {
      this.assignments.set(playerId, taken);
      player.role = taken.name;
      player.team = taken.team;
      // The mayor's title outranks the card: his double vote is not the
      // thief's to lose.
      player.voteWeight =
        this.state.presidentManager.getPresidentId() === playerId
          ? 2
          : taken.voteWeight ?? 1;
      this.actionLog.push(`Night 1: ${player.name} took the ${taken.name}.`);
    } else {
      this.actionLog.push(`Night 1: ${player.name} kept his own card.`);
    }

    this.sendRoleAssign(playerId, this.assignments.get(playerId)!);
    const message = taken ? `You are the ${taken.name} now.` : 'You keep your own card.';
    this.transport.sendToPlayer(playerId, {
      type: 'SECRET_INFO',
      payload: { message },
      timestamp: Date.now(),
    });
    this.emit({ type: 'secret', playerId, message });

    // A wolf card makes him one of the pack, and the pack learns a name.
    if (taken?.team === 'Wolf') {
      this.state.players
        .filter(
          other =>
            other.isAlive &&
            other.id !== playerId &&
            this.assignments.get(other.id)?.team === 'Wolf',
        )
        .forEach(wolf => this.sendRoleAssign(wolf.id, this.assignments.get(wolf.id)!, true));
    }

    this.emit({ type: 'changed' });
    return true;
  }

  // Once per game the judge bangs the table for one more vote, right after an
  // execution and before the night falls.
  handleJudgeRepeat(playerId: string): boolean {
    if (this.winner) return false;
    if (this.state.currentPhase !== 'Judge') return false;

    const judge = this.state.players.find(p => p.id === playerId);
    const role = this.assignments.get(playerId);
    if (!judge?.isAlive || !role?.judge || this.judgeUsed.has(playerId)) return false;
    // Only an execution earns a second vote.
    if (this.judgeDeaths.length === 0) return false;

    this.judgeUsed.add(playerId);
    this.actionLog.push(`Day ${this.round}: the judge demanded one more vote.`);
    this.announce(
      `Day ${this.round}: the judge bangs the table. One more vote, then night falls.`,
    );

    this.setPhase('Vote');
    return true;
  }

  // While he is dying the scapegoat points at players one at a time: each name
  // may not vote tomorrow. He may point at nobody at all.
  handleScapegoatBan(playerId: string, targetId: string): boolean {
    if (this.winner) return false;
    if (this.state.currentPhase !== 'Scapegoat') return false;
    if (this.scapegoatPending !== playerId) return false;

    const goat = this.state.players.find(p => p.id === playerId);
    const target = this.state.players.find(p => p.id === targetId);
    if (!goat?.isAlive || !target?.isAlive || target.id === playerId) return false;
    if (this.scapegoatBans.has(targetId)) return false;

    this.scapegoatBans.add(targetId);
    this.announce(`Day ${this.round}: the scapegoat bars ${target.name} from voting tomorrow.`);
    this.emit({ type: 'changed' });
    return true;
  }

  // The Alien went silent: the host may hand the day back himself rather than
  // let a disconnected phone hold the whole table.
  forceDayOn(): boolean {
    if (this.winner) return false;
    if (this.state.currentPhase !== 'Day' || !this.alienGuess) return false;

    this.alienGuess = null;
    this.broadcastPhase();
    this.emit({ type: 'changed' });
    return true;
  }

  // The raven may hold his mark for the day itself, and move it as often as he
  // likes until the vote opens: from the vote onwards the phases stop him.
  handleRavenMark(playerId: string, targetId: string): boolean {
    if (this.winner) return false;
    if (this.state.currentPhase !== 'Day') return false;
    if (this.setting('raven.timing') !== 'beforeVote') return false;

    const raven = this.state.players.find(p => p.id === playerId);
    const target = this.state.players.find(p => p.id === targetId);
    if (!raven?.isAlive || !target?.isAlive) return false;
    // The mark names another player: a raven cannot curse himself.
    if (targetId === playerId) return false;
    if (this.isSilenced(playerId)) return false;
    // Only the raven's own card knows the mark, and a spent or missing power
    // has nothing to place.
    const card = this.assignments.get(playerId);
    if (!card?.nightActions?.some(option => option.kind === 'curse')) return false;

    this.ravenTarget = targetId;
    this.actionLog.push(`Day ${this.round}: the raven marked ${target.name}.`);
    this.emit({ type: 'changed' });
    return true;
  }

  // Who the raven marked for the next vote, as far as anyone knows.
  getRavenMark(): PlayerRef | null {
    if (!this.ravenTarget) return null;

    const target = this.state.players.find(p => p.id === this.ravenTarget);
    return target ? { id: target.id, name: target.name, isAlive: target.isAlive } : null;
  }

  // A death in the middle of the day, from the Alien's guess or from his own
  // wrong one. The day is not over, so the lovers are chained here and the
  // rest of the death chain waits for enterAfterDeaths.
  private killInDay(victim: Player, deaths: Player[]) {
    victim.isAlive = false;
    deaths.push(victim);
  }

  private sendAlienResult(alienId: string, message: string) {
    this.transport.sendToPlayer(alienId, {
      type: 'SECRET_INFO',
      payload: { message },
      timestamp: Date.now(),
    });
    this.emit({ type: 'secret', playerId: alienId, message });
  }

  // ------------------------------------------------------------------ queries

  getRoleOf(playerId: string): PlayableRole | undefined {
    return this.assignments.get(playerId);
  }

  // The engine's own words when a solo role took the game: null for the three
  // sides, whose announcements the screens already know.
  getWinnerLabel(): string | null {
    return this.winnerLabel;
  }

  getAlivePlayers(): Player[] {
    return this.state.players.filter(p => p.isAlive);
  }

  // What a player has already picked for one of tonight's actions, if anything.
  // A deliberate pass reads as nothing chosen.
  getNightChoice(playerId: string, actionId: string): string | null {
    const choice = this.nightChoices.get(playerId)?.get(actionId) ?? null;
    return choice === PASSED ? null : choice;
  }

  // 1 while the wolves and the other actors choose, 2 once the witch is up.
  getNightStage(): 1 | 2 {
    return this.nightStage;
  }

  // True while the pack's vote is split and the night waits on a name.
  hasOpenPackTie(): boolean {
    return this.packTieOpen && !this.packTiePick && this.state.currentPhase === 'Night';
  }

  // The tied names, for the father's panel and the host's override buttons.
  getPackTieTargets(): PlayerRef[] {
    return this.packTie
      .map(id => this.state.players.find(player => player.id === id))
      .filter((player): player is Player => !!player)
      .map(player => ({ id: player.id, name: player.name, isAlive: player.isAlive }));
  }

  // The seat the tie waits on, when an infectious father can still decide.
  getPackTieBreakerId(): string | null {
    return this.packTieBreaker()?.id ?? null;
  }

  // True when the host's next press only wakes the witch rather than resolving
  // the night, so the button can say so.
  isWakingTheWitchNext(): boolean {
    return (
      !this.winner &&
      this.state.currentPhase === 'Night' &&
      this.nightStage === 1 &&
      this.hasStageTwoActors()
    );
  }

  // Who the wolves took, once their picks are in. Only the witch is sent this
  // before the morning announcement.
  getNightVictim(): PlayerRef | null {
    if (this.state.currentPhase !== 'Night') return null;

    const victim = this.victimOfNight();
    return victim ? { id: victim.id, name: victim.name, isAlive: victim.isAlive } : null;
  }

  // The one player the healing potion could still save tonight: null once the
  // wolves have picked nobody, or once the guard is already saving them.
  getHealTarget(): PlayerRef | null {
    if (this.state.currentPhase !== 'Night') return null;

    const victim = this.healTarget();
    return victim ? { id: victim.id, name: victim.name, isAlive: victim.isAlive } : null;
  }

  // How many uses this player has left of an action, or null when the action
  // is unlimited. The screens show this so a witch knows what is left.
  getChargesLeft(playerId: string, actionId: string): number | null {
    const option = this.assignments
      .get(playerId)
      ?.nightActions?.find(candidate => candidate.id === actionId);
    // Two pack powers carry no count of their own: the White Wolf's pick is up
    // every second night, the Big Bad Wolf keeps his only while the pack is
    // whole. Reporting 0 or 1 is what hides the button on the other nights.
    if (option?.kind === 'wolfAttack') return this.round % 2 === 0 ? 1 : 0;
    if (option?.kind === 'extraAttack') return this.anyWolfDead() ? 0 : 1;
    if (option?.kind === 'fox') return this.foxLost.has(playerId) ? 0 : 1;
    // Two first-night decisions the panel reads the same way: up while the
    // first night lasts, gone after.
    if (option?.kind === 'side' || option?.kind === 'model') {
      return this.round === 1 ? 1 : 0;
    }
    const limit = actionChargeLimit(option);
    if (!Number.isFinite(limit)) return null;

    return Math.max(0, limit - this.chargesUsedBy(playerId, actionId));
  }

  // Whether a charged action is still available to this player.
  hasChargeLeft(playerId: string, actionId: string): boolean {
    const left = this.getChargesLeft(playerId, actionId);
    return left === null || left > 0;
  }

  // What the table already knows. A death written during the night is only
  // announced in the morning, so it is left out until then.
  getPublicLog(): string[] {
    const hiddenNight = this.state.currentPhase === 'Night' ? this.round : null;

    return this.publicLog
      .filter(entry => !(entry.phase === 'Night' && entry.round === hiddenNight))
      .map(entry => entry.message);
  }

  // The rules this table was started with, and one rule read back by id. A
  // value the table never set falls back to the rule's own default.
  getSettings(): Settings {
    return { ...this.settings };
  }

  private setting(id: string): SettingValue {
    return this.settings[id] ?? settingDefault(id);
  }

  // The opening night is peaceful when the host says so. Left on auto it is
  // peaceful at the smallest table only: with three players a kill would hand
  // the wolves parity before anyone has spoken.
  isQuietNight(): boolean {
    if (this.round !== 1) return false;

    const forced = this.setting('peacefulFirstNight');
    if (forced === true || forced === false) return forced;
    return this.state.players.length <= 3;
  }

  // Players who still owe a night action this round.
  getPendingNightActors(): Player[] {
    if (this.state.currentPhase !== 'Night') return [];

    return this.state.players.filter(player => {
      if (!player.isAlive) return false;
      const role = this.assignments.get(player.id);
      if (!role?.nightActions) return false;

      return role.nightActions.some(
        option => this.isOptionOffered(player.id, option) && !this.hasChoice(player.id, option.id),
      );
    });
  }

  // Who the table is waiting on to take someone down with them.
  getPendingRevengeHunter(): Player | null {
    if (this.state.currentPhase !== 'Revenge' || !this.pendingRevenge) return null;
    return this.state.players.find(p => p.id === this.pendingRevenge) ?? null;
  }

  // The mayor who died and still owes the table a successor.
  getPendingSuccessionMayor(): Player | null {
    if (this.state.currentPhase !== 'Succession' || !this.pendingSuccession) return null;
    return this.state.players.find(p => p.id === this.pendingSuccession) ?? null;
  }

  hasChosenSuccession(playerId: string): boolean {
    return this.successionChoice?.mayorId === playerId;
  }

  hasChosenRevenge(playerId: string): boolean {
    return this.revengeChoice?.hunterId === playerId;
  }

  getLovers(): [string, string] | null {
    return this.lovers;
  }

  // Players who have not voted yet.
  // Players who hold no ballot: the unmasked idiot, and whoever the last
  // scapegoat barred. Public: the table heard both announcements.
  getBarredVoters(): string[] {
    return [...new Set([...this.noVote, ...this.voteBanned])];
  }

  getPendingVoters(): Player[] {
    if (this.state.currentPhase !== 'Vote') return [];
    return this.state.players.filter(
      p =>
        p.isAlive && !this.votes.has(p.id) && !this.noVote.has(p.id) && !this.voteBanned.has(p.id),
    );
  }

  hasActed(playerId: string): boolean {
    const role = this.assignments.get(playerId);
    if (!role?.nightActions) return false;

    const offered = role.nightActions.filter(option =>
      this.isOptionOffered(playerId, option),
    );
    // The Wolf-Dog's two camps are one decision: any side button counts for
    // the group.
    const sides = offered.filter(option => option.kind === 'side');
    if (sides.length > 0 && !sides.some(option => this.hasChoice(playerId, option.id))) {
      return false;
    }
    return offered
      .filter(option => option.kind !== 'side')
      .every(option => this.hasChoice(playerId, option.id));
  }

  hasVoted(playerId: string): boolean {
    return this.votes.has(playerId);
  }

  // ----------------------------------------------------------------- plumbing

  // Re-send the private state a player needs. Used when a client connects
  // after the game already started, so a late join screen cannot miss it.
  sendStateTo(playerId: string) {
    const role = this.assignments.get(playerId);
    if (role) this.sendRoleAssign(playerId, role, true);

    // The house rules, in case the deal's copy was sent before this screen was
    // listening: without them a guest cannot read the table's rules back, and a
    // raven in a before-the-vote game never sees his day panel.
    this.transport.sendToPlayer(playerId, {
      type: 'RULES_UPDATE',
      payload: { settings: { ...this.settings } },
      timestamp: Date.now(),
    });

    this.transport.sendToPlayer(playerId, {
      type: 'PHASE_UPDATE',
      payload: this.buildPhasePayload(),
      timestamp: Date.now(),
    });

    // A player who joins mid-night needs the stage, and the witch needs the
    // victim she may save.
    if (this.state.currentPhase === 'Night') this.sendNightStageTo(playerId);

    // The journal so far, line by line, so a screen that just woke up reads
    // the same story as the phones that never slept.
    this.publicLog.forEach(line => {
      this.transport.sendToPlayer(playerId, {
        type: 'PUBLIC_LOG',
        payload: line,
        timestamp: Date.now(),
      });
    });

    if (this.lastVote) {
      this.transport.sendToPlayer(playerId, {
        type: 'VOTE_RESULT',
        payload: this.lastVote,
        timestamp: Date.now(),
      });
    }

    if (this.timer) {
      const payload: TimeSyncPayload = {
        remainingMs: this.getTimerRemainingMs(),
        totalMs: this.timer.totalMs,
      };
      this.transport.sendToPlayer(playerId, {
        type: 'TIME_SYNC',
        payload,
        timestamp: Date.now(),
      });
    }

    if (this.winner) {
      this.transport.sendToPlayer(playerId, {
        type: 'GAME_OVER',
        payload: this.buildGameOverPayload(),
        timestamp: Date.now(),
      });
    }
  }

  // A spent potion changes what the role card can do, so the card is sent
  // again to the player who spent it. The count is what tells them it is gone.
  private resendRoleTo(playerId: string) {
    const role = this.assignments.get(playerId);
    if (role) this.sendRoleAssign(playerId, role, true);
  }

  private sendRoleAssign(playerId: string, role: PlayableRole, refresh = false) {
    const group = role.alliance;
    const allies =
      role.team === 'Wolf'
        ? this.state.players
            .filter(
              p => p.id !== playerId && this.assignments.get(p.id)?.team === 'Wolf',
            )
            .map(p => ({ id: p.id, name: p.name, isAlive: p.isAlive }))
        : group
        ? this.state.players
            .filter(
              p => p.id !== playerId && this.assignments.get(p.id)?.alliance === group,
            )
            .map(p => ({ id: p.id, name: p.name, isAlive: p.isAlive }))
        : [];

    const payload: RoleAssignPayload = {
      roleId: role.id,
      roleName: role.name,
      team: role.team,
      description: role.description,
      allies,
      nightActions: role.nightActions?.map(option => ({
        id: option.id,
        label: option.label,
        kind: option.kind,
        // Left out for an action the player may use every night.
        chargesLeft: this.getChargesLeft(playerId, option.id) ?? undefined,
      })),
      revengeOnDeath: role.revengeOnDeath,
      linksLovers: role.linksLovers,
      guessesRoles: role.guessesRoles,
      thiefCards: this.thiefCards.get(playerId)?.map(card => ({ id: card.id, name: card.name })),
      charmedIds: role.charms ? [...this.charmed] : undefined,
      scapegoat: role.scapegoat,
      judge: role.judge,
      // A resend of the same card: the screen updates in place instead of
      // treating it as a fresh deal.
      refresh: refresh || undefined,
    };

    this.transport.sendToPlayer(playerId, {
      type: 'ROLE_ASSIGN',
      payload,
      timestamp: Date.now(),
    });
  }

  // The election is public and its own broadcasts go out between phases, so
  // they share this one sender with setPhase.
  private broadcastPhase(extra: Partial<PhaseUpdatePayload> = {}) {
    this.transport.broadcast({
      type: 'PHASE_UPDATE',
      payload: this.buildPhasePayload(extra),
      timestamp: Date.now(),
    });
  }

  private buildPhasePayload(extra: Partial<PhaseUpdatePayload> = {}): PhaseUpdatePayload {
    const phase = this.state.currentPhase;

    return {
      phase,
      round: this.round,
      players: this.toRefs(this.state.players),
      // The election is public: who stands, who may be voted for, and who won.
      ...(phase === 'Election' || phase === 'Debate'
        ? {
            electionStage: this.electionStage,
            // While the list is open there is nobody to vote for yet, so the
            // list means "who is standing".
            mayorCandidates: this.getElectionList(),
            mayorId: this.state.presidentManager.getPresidentId(),
          }
        : { mayorId: this.state.presidentManager.getPresidentId() }),
      ...(phase === 'Succession' ? { successionMayorId: this.pendingSuccession } : {}),
      // The panels must be able to say "Night 1 is peaceful" without guessing
      // from the round number, which the election can throw off.
      quietNight: this.isQuietNight(),
      ...(phase === 'Day' ? { dayFrozen: this.isDayFrozen() } : {}),
      ...(phase === 'Vote' ? { barredVoters: this.getBarredVoters() } : {}),
      ...extra,
    };
  }

  private buildGameOverPayload(): GameOverPayload {
    return {
      winner: this.winner ?? 'Village',
      winnerLabel: this.winnerLabel ?? undefined,
      reveal: this.state.players.map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        team: p.team,
        isAlive: p.isAlive,
      })),
    };
  }

  private toRefs(players: Player[]): PlayerRef[] {
    return players.map(p => ({ id: p.id, name: p.name, isAlive: p.isAlive }));
  }

  // ------------------------------------------------------------ the night half

  // The wolves are done, so the witch wakes and is shown who was attacked.
  // Without her the night has no second half and advance() resolves it.
  private wakeTheWitch() {
    this.nightStage = 2;
    this.broadcastNightStage();

    this.state.players.forEach(player => {
      if (player.isAlive && this.hearsTheVictim(player.id)) this.sendNightStageTo(player.id);
    });

    this.autoPlayBots();
    this.emit({ type: 'changed' });
  }

  // Stage only: the victim never travels in a broadcast. Announcing an attack
  // the guard then cancels would give the save away.
  private broadcastNightStage() {
    const payload: NightStagePayload = { stage: this.nightStage };

    this.transport.broadcast({
      type: 'NIGHT_STAGE',
      payload,
      timestamp: Date.now(),
    });
  }

  private sendNightStageTo(playerId: string) {
    this.transport.sendToPlayer(playerId, {
      type: 'NIGHT_STAGE',
      payload: this.nightStagePayloadFor(playerId),
      timestamp: Date.now(),
    });
  }

  // Only the witch learns the victim before the morning.
  private hearsTheVictim(playerId: string): boolean {
    const role = this.assignments.get(playerId);
    return !!role?.nightActions?.some(option => option.kind === 'heal');
  }

  private nightStagePayloadFor(playerId: string): NightStagePayload {
    const victim = this.hearsTheVictim(playerId) ? this.healTarget() : null;

    return {
      stage: this.nightStage,
      victim: victim ? { id: victim.id, name: victim.name, isAlive: victim.isAlive } : null,
      healTargets: victim ? [victim.id] : [],
      // A father whose phone woke up mid-tie is handed the tied names again,
      // or the night waits on a player who cannot answer.
      ...(this.hasOpenPackTie() && this.packTieBreaker()?.id === playerId
        ? { tieTargets: this.getPackTieTargets() }
        : {}),
    };
  }

  // ------------------------------------------------------- the split pack

  // Called by the host's press on the night. True when a tie has to be named
  // before the night can move on: the infectious father is woken with the tied
  // names in front of him, or the host is asked to choose when the setting
  // says so. With neither, one of the tied names is taken at random.
  private openPackTie(): boolean {
    if (this.packTieOpen || this.packTiePick) return false;

    const leaders = this.packTieLeaders();
    if (leaders.length === 0) return false;

    const breaker = this.packTieBreaker();
    if (!breaker && this.setting('wolfTieBreak') !== 'host') {
      // One of the tied names, at random, and the narrator log hears about it
      // like every other pick.
      this.setPackTiePick(leaders[Math.floor(Math.random() * leaders.length)].id);
      return false;
    }

    this.packTieOpen = true;
    this.packTie = leaders.map(player => player.id);
    if (breaker) this.sendPackTieTo(breaker.id);

    this.autoPlayBots();
    this.emit({ type: 'changed' });
    return true;
  }

  private sendPackTieTo(playerId: string) {
    this.transport.sendToPlayer(playerId, {
      type: 'NIGHT_STAGE',
      payload: { stage: this.nightStage, tieTargets: this.getPackTieTargets() },
      timestamp: Date.now(),
    });
  }

  // The infectious father names the victim among the pack's tied picks.
  handleTieBreak(playerId: string, targetId: string): boolean {
    if (this.state.currentPhase !== 'Night' || this.nightStage !== 1) return false;
    if (!this.packTieOpen || this.packTiePick) return false;
    if (this.packTieBreaker()?.id !== playerId) return false;
    if (!this.packTie.includes(targetId)) return false;

    return this.setPackTiePick(targetId);
  }

  // The host's own tap: the whole rule when the table asked for it, and a way
  // out when a father will not answer his phone.
  handlePackTie(targetId: string): boolean {
    if (this.state.currentPhase !== 'Night' || this.nightStage !== 1) return false;
    if (!this.packTieOpen || this.packTiePick) return false;
    if (!this.packTie.includes(targetId)) return false;

    return this.setPackTiePick(targetId);
  }

  private setPackTiePick(targetId: string): boolean {
    this.packTiePick = targetId;
    this.packTieOpen = false;

    const target = this.state.players.find(player => player.id === targetId);
    if (target) {
      this.actionLog.push(
        `Night ${this.round}: the pack's vote was split, and the victim chosen was ${target.name}.`,
      );
    }

    this.emit({ type: 'changed' });
    return true;
  }

  private setPhase(phase: Phase, extra: Partial<PhaseUpdatePayload> = {}) {
    this.state.setPhase(phase);

    // Deaths land in other phases; the Wild Child's turn is noticed here,
    // whichever of them it was, before the new phase reports anything.
    this.turnWildChildren();

    if (phase === 'Night') {
      this.nightChoices.clear();
      this.votes.clear();
      this.revoteCandidates = [];
      this.nightStage = 1;
      this.packTieOpen = false;
      this.packTie = [];
      this.packTiePick = null;
    }

    if (phase === 'Vote') {
      this.votes.clear();
      this.lastVote = null;
      // A stale tie list would restrict the judge's second vote to the first
      // vote's pair.
      this.revoteCandidates = [];
    }

    // Any phase change retires the clock: the next phase needs its own.
    this.timer = null;

    this.broadcastPhase(extra);

    // Night falls in the first stage; the witch is woken from advance().
    if (phase === 'Night') this.broadcastNightStage();

    // Test players act by themselves so a host can verify the loop without
    // three devices.
    this.autoPlayBots();

    this.emit({ type: 'changed' });
  }

  // Bots pick at random: good enough to exercise every branch of the loop.
  private autoPlayBots() {
    if (this.state.currentPhase === 'Night') {
      this.state.players
        .filter(player => player.isAlive && player.isBot)
        .forEach(player => {
          const role = this.assignments.get(player.id);
          role?.nightActions?.forEach(option => {
            if (!this.isOptionOffered(player.id, option)) return;
            if (this.hasChoice(player.id, option.id)) return;

            const targets = this.validTargets(player, option);
            if (targets.length === 0) return;

            // A potion is a choice, not a reflex: a bot witch sometimes keeps
            // hers, and says so, or the host would wait on her forever.
            if (option.kind === 'heal' && Math.random() < 0.4) {
              this.passNightAction(player.id, option.id);
              return;
            }

            const target = targets[Math.floor(Math.random() * targets.length)];
            this.handleNightAction(player.id, option.id, target.id);
          });
        });

      // A split pack is the father's call, and a bot father makes it at once
      // rather than leaving the host waiting on a phone nobody holds.
      if (this.packTieOpen && !this.packTiePick) {
        const breaker = this.packTieBreaker();
        if (breaker?.isBot && this.packTie.length > 0) {
          const target = this.packTie[Math.floor(Math.random() * this.packTie.length)];
          this.handleTieBreak(breaker.id, target);
        }
      }
    }

    // A bot Alien would otherwise let a two-player endgame run forever: it
    // points at whoever is left and names a role at random, then hands the day
    // back rather than sitting on a freeze it cannot press away.
    if (this.state.currentPhase === 'Day' && this.winner === null) {
      const botAlien = this.state.players.find(
        player =>
          player.isAlive &&
          player.isBot &&
          this.assignments.get(player.id)?.guessesRoles === true &&
          !this.isSilenced(player.id),
      );

      if (botAlien) {
        if (this.alienGuess === botAlien.id) {
          this.handleAlienResume(botAlien.id);
        } else if (!this.alienGuess) {
          const targets = this.state.players.filter(
            player => player.isAlive && player.id !== botAlien.id,
          );
          const roles = [...ALL_ROLES, ...getCustomRoles()];
          if (targets.length > 0 && roles.length > 0) {
            const target = targets[Math.floor(Math.random() * targets.length)];
            const guess = roles[Math.floor(Math.random() * roles.length)];
            this.handleAlienGuess(botAlien.id, target.id, guess.id);
            // A right guess freezes the day, and nobody is there to press on.
            if (this.alienGuess === botAlien.id) this.handleAlienResume(botAlien.id);
          }
        }
      }
    }

    if (this.state.currentPhase === 'Vote') {
      const alive = this.state.players.filter(p => p.isAlive);
      alive.forEach(voter => {
        if (!voter.isBot || this.votes.has(voter.id)) return;
        // During a re-vote only the tied players are on the ballot, and the
        // engine would refuse anything else.
        const candidates =
          this.revoteCandidates.length > 0
            ? alive.filter(p => this.revoteCandidates.includes(p.id))
            : alive.filter(p => p.id !== voter.id);
        if (candidates.length === 0) return;
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        this.votes.set(voter.id, target.id);
      });
    }

    if (this.state.currentPhase === 'Revenge') {
      const hunter = this.getPendingRevengeHunter();
      if (hunter?.isBot && !this.hasChosenRevenge(hunter.id)) {
        const candidates = this.state.players.filter(p => p.isAlive && p.id !== hunter.id);
        if (candidates.length > 0) {
          const target = candidates[Math.floor(Math.random() * candidates.length)];
          this.handleRevenge(hunter.id, target.id);
        }
      }
    }

    if (this.state.currentPhase === 'Succession') {
      const mayor = this.getPendingSuccessionMayor();
      if (mayor?.isBot && !this.hasChosenSuccession(mayor.id)) {
        const candidates = this.state.players.filter(p => p.isAlive && p.id !== mayor.id);
        if (candidates.length > 0) {
          const target = candidates[Math.floor(Math.random() * candidates.length)];
          this.handleSuccession(mayor.id, target.id);
        }
      }
    }

    if (this.state.currentPhase === 'Election') {
      if (this.electionStage === 'vote') {
        const candidates = this.getElectionList().map(candidate => candidate.id);

        this.state.players
          .filter(player => player.isAlive && player.isBot && !this.votes.has(player.id))
          .forEach(voter => {
            // A bot does not vote for itself unless it is the only candidate.
            const preferred = candidates.filter(id => id !== voter.id);
            const pool = preferred.length > 0 ? preferred : candidates;
            if (pool.length === 0) return;

            this.votes.set(voter.id, pool[Math.floor(Math.random() * pool.length)]);
          });
      } else {
        // Some bots stand, so a table of test players still has a contest.
        this.state.players
          .filter(player => player.isAlive && player.isBot && !this.mayorVolunteers.includes(player.id))
          .forEach(player => {
            if (this.mayorVolunteers.length >= 3) return;
            if (Math.random() < 0.35) this.volunteerForMayor(player.id);
          });
      }
    }
  }

  // --------------------------------------------------------------- resolution

  // The most chosen entry of a tally. Ties go to the first player in seating
  // order, so every device settles on the same victim.
  private pickMostVoted(tally: Map<string, number>): string | null {
    let best: string | null = null;
    let bestCount = 0;

    for (const player of this.state.players) {
      const count = tally.get(player.id) ?? 0;
      if (count > bestCount) {
        best = player.id;
        bestCount = count;
      }
    }

    return best;
  }

  private resolveNight(): Player[] {
    const deaths: Player[] = [];

    // The Red Wolf's silence lands before anything else resolves, so a player
    // silenced tonight loses a choice he may already have sent.
    const silenced = new Set<string>();
    this.blockChoices().forEach(({ actorId, targetId }) => {
      silenced.add(targetId);
      this.silencedUntil.set(targetId, this.round);
      this.blockedTargets.add(`${actorId}:${targetId}`);

      const target = this.state.players.find(p => p.id === targetId);
      if (target) {
        this.actionLog.push(`Night ${this.round}: the Red Wolf silenced ${target.name}.`);
        // The player is told, not the table: a silenced role that says
        // nothing looks like a broken app.
        const message =
          'You have been silenced: your powers fail until the end of the coming day.';
        this.transport.sendToPlayer(targetId, {
          type: 'SECRET_INFO',
          payload: { message },
          timestamp: Date.now(),
        });
        this.emit({ type: 'secret', playerId: targetId, message });
      }
    });

    // Gather every choice made tonight, by kind of action.
    const shielded = new Set<string>();
    // Charged actions remember which action id spent them, so a role whose
    // potion is not literally called "heal" still spends exactly once.
    const healed = new Map<string, { playerId: string; actionId: string }>();
    const poisoned = new Map<string, { playerId: string; actionId: string }>();
    // Wolves hunt as a pack: their bite is the majority of the pack's picks,
    // not whichever device happened to tap last. attackTally reads the same
    // block and infection filters this resolution does.
    // The two solo bites of the pack, each resolved on its own.
    const extraAttacks: string[] = [];
    const wolfAttacks: string[] = [];
    let inspect: { sourceId: string; targetId: string } | null = null;
    let link: { sourceId: string; targetId: string } | null = null;
    let fox: { sourceId: string; targetId: string } | null = null;
    let raven: { sourceId: string; targetId: string } | null = null;
    let side: { playerId: string; actionId: string } | null = null;
    let model: { sourceId: string; targetId: string } | null = null;
    // Every Piper at the table keeps his own flock.
    const charmPlan = new Map<string, string[]>();

    // Read before the choices are tallied: the father's infection replaces the
    // pack's bite, so his own kill vote must not be counted.
    const infection = this.pendingInfection();

    this.nightChoices.forEach((choices, playerId) => {
      const actor = this.state.players.find(p => p.id === playerId);
      const role = this.assignments.get(playerId);
      if (!actor?.isAlive || !role) return;
      // Silenced by the block resolved just above: the choice does not happen.
      if (silenced.has(playerId)) return;

      choices.forEach((targetId, actionId) => {
        const option = role.nightActions?.find(candidate => candidate.id === actionId);
        if (!option) return;
        if (targetId === PASSED) return;

        switch (option.kind) {
          case 'protect':
            shielded.add(targetId);
            this.lastProtected.set(playerId, targetId);
            break;
          case 'heal':
            healed.set(targetId, { playerId, actionId });
            break;
          case 'poison':
            poisoned.set(targetId, { playerId, actionId });
            break;
          case 'attack':
            // Counted by attackTally, which reads the same filters.
            break;
          case 'extraAttack':
            if (!this.anyWolfDead()) extraAttacks.push(targetId);
            break;
          case 'wolfAttack':
            wolfAttacks.push(targetId);
            break;
          case 'inspect':
            inspect = { sourceId: playerId, targetId };
            break;
          case 'link':
            link = { sourceId: playerId, targetId };
            break;
          case 'fox':
            fox = { sourceId: playerId, targetId };
            break;
          case 'curse':
            raven = { sourceId: playerId, targetId };
            break;
          case 'side':
            side = { playerId, actionId };
            break;
          case 'model':
            model = { sourceId: playerId, targetId };
            break;
          case 'charm': {
            const targets = charmPlan.get(playerId) ?? [];
            targets.push(targetId);
            charmPlan.set(playerId, targets);
            break;
          }
        }
      });
    });

    // Read once into locals: the values were assigned inside a callback, which
    // control-flow analysis cannot follow.
    const biteTarget = this.packTiePick ?? this.pickMostVoted(this.attackTally());
    const peek = inspect as { sourceId: string; targetId: string } | null;
    const bond = link as { sourceId: string; targetId: string } | null;
    const sniff = fox as { sourceId: string; targetId: string } | null;
    const mark = raven as { sourceId: string; targetId: string } | null;
    const pickedSide = side as { playerId: string; actionId: string } | null;
    const watched = model as { sourceId: string; targetId: string } | null;

    // Every wolf kill takes the same path: the Alien shrugs it off, the
    // guard's shield stops it, the witch may already have saved the victim,
    // and only then does anyone die. The potion is spent only by the bite the
    // witch was actually shown.
    const wolfKill = (target: Player, source: string, spendHeal: boolean) => {
      if (this.assignments.get(target.id)?.wolfImmune) {
        this.actionLog.push(
          `Night ${this.round}: ${source} attacked ${target.name}, and it did nothing.`,
        );
        return;
      }
      if (shielded.has(target.id)) {
        this.actionLog.push(`Night ${this.round}: the guard saved ${target.name} from ${source}.`);
        return;
      }
      const mender = healed.get(target.id);
      if (mender) {
        if (spendHeal) {
          this.spendCharge(mender.playerId, mender.actionId);
          this.resendRoleTo(mender.playerId);
        }
        this.actionLog.push(`Night ${this.round}: the witch saved ${target.name} from ${source}.`);
        return;
      }

      target.isAlive = false;
      deaths.push(target);
      this.actionLog.push(`Night ${this.round}: ${target.name} was devoured by ${source}.`);
    };

    if (this.isQuietNight()) {
      // The players' panels say so from the phase payload; the log line is
      // narrator-only trivia, and the morning already reports the outcome.
      this.actionLog.push('Night 1 was peaceful: the wolves only looked around.');
    } else if (biteTarget) {
      const target = this.state.players.find(p => p.id === biteTarget);
      if (target?.isAlive) {
        const spy = this.girlCaught ? this.whoSpied() : null;
        const girl = spy ? this.state.players.find(p => p.id === spy) : undefined;
        if (girl?.isAlive) {
          // The wolves took her instead of the victim: nobody else is hurt,
          // and the victim never learns how close it was.
          girl.isAlive = false;
          deaths.push(girl);
          this.actionLog.push(`Night ${this.round}: the wolves caught ${girl.name} spying.`);
        } else if (infection) {
          // Spent whether or not it lands: the father used his one charge.
          this.spendCharge(infection.playerId, infection.actionId);
          this.resendRoleTo(infection.playerId);
          this.infectPlayer(target);
        } else {
          wolfKill(target, 'the pack', true);
        }
      }
    }

    // The pack's own extra bites: no potion reaches these.
    if (!this.isQuietNight()) {
      extraAttacks.forEach(targetId => {
        const target = this.state.players.find(p => p.id === targetId);
        if (target?.isAlive) wolfKill(target, 'the Big Bad Wolf', false);
      });
      wolfAttacks.forEach(targetId => {
        const target = this.state.players.find(p => p.id === targetId);
        if (target?.isAlive) wolfKill(target, 'the White Werewolf', false);
      });
    }

    // The little girl's night: if the host caught her the bite above already
    // took her, otherwise she saw exactly who was awake.
    const spy = this.whoSpied();
    const spyPlayer = spy ? this.state.players.find(p => p.id === spy) : undefined;
    if (spy && spyPlayer?.isAlive) {
      const pack = this.state.players
        .filter(p => p.isAlive && this.assignments.get(p.id)?.team === 'Wolf')
        .map(p => p.name);
      const message =
        pack.length > 0
          ? `You saw the wolves awake: ${pack.join(', ')}.`
          : 'You saw nobody awake tonight.';
      this.transport.sendToPlayer(spy, {
        type: 'SECRET_INFO',
        payload: { message },
        timestamp: Date.now(),
      });
      this.emit({ type: 'secret', playerId: spy, message });
    }

    // Poison is not the wolves' bite: shielding does not stop it.
    poisoned.forEach((spentBy, targetId) => {
      this.spendCharge(spentBy.playerId, spentBy.actionId);
      this.resendRoleTo(spentBy.playerId);

      const target = this.state.players.find(p => p.id === targetId);
      if (target?.isAlive) {
        target.isAlive = false;
        deaths.push(target);
        this.actionLog.push(`Night ${this.round}: ${target.name} was poisoned.`);
      }
    });

    if (bond) {
      this.lovers = [bond.sourceId, bond.targetId];
      const cupid = this.state.players.find(p => p.id === bond.sourceId);
      const beloved = this.state.players.find(p => p.id === bond.targetId);
      this.actionLog.push(`Cupid tied ${cupid?.name} and ${beloved?.name} together.`);
      this.emit({
        type: 'secret',
        playerId: bond.sourceId,
        message: `You are tied to ${beloved?.name}. If either of you dies, the other dies too.`,
      });
    }

    if (peek) {
      const { sourceId, targetId } = peek;
      const target = this.state.players.find(p => p.id === targetId);
      if (target) {
        const role = this.assignments.get(target.id);
        const isWolf = role?.team === 'Wolf';
        // The table's rule decides how much the seer is told, and whatever he
        // is told is what he could say out loud.
        const exact = this.setting('seer.depth') === 'exact';
        const seen = exact
          ? `the ${role?.name ?? 'Villager'} card`
          : isWolf
          ? 'a Werewolf'
          : 'no Werewolf';
        const message = exact
          ? `${target.name} is the ${role?.name ?? 'Villager'}.`
          : `${target.name} is ${isWolf ? 'a Werewolf' : 'not a Werewolf'}.`;
        const payload: SecretInfoPayload = { message, isWolf };

        this.transport.sendToPlayer(sourceId, {
          type: 'SECRET_INFO',
          payload,
          timestamp: Date.now(),
        });
        this.emit({ type: 'secret', playerId: sourceId, message });

        // Some tables let the seer speak at dawn. The village hears what was
        // found, never who was looked at.
        if (this.setting('seer.publicReport') === true) {
          this.seerSighting = `The seer saw ${seen}.`;
        }
      }
    }

    if (sniff) {
      const { sourceId, targetId } = sniff;
      const seat = this.state.players.find(p => p.id === targetId);
      const around = this.neighbourhood(targetId);
      const found = around.some(p => this.assignments.get(p.id)?.team === 'Wolf');
      // One fruitless night and the nose is gone for good.
      if (!found) this.foxLost.add(sourceId);

      const names = around.map(p => p.name).join(', ');
      const message = found
        ? `Yes: a wolf is among ${names}. Your nose stays sharp.`
        : `No: no wolf is among ${names}. Your nose is gone for good.`;
      this.actionLog.push(
        `Night ${this.round}: the fox sniffed around ${seat?.name ?? targetId} and found ${
          found ? 'a wolf' : 'nothing'
        }.`,
      );
      this.transport.sendToPlayer(sourceId, {
        type: 'SECRET_INFO',
        payload: { message },
        timestamp: Date.now(),
      });
      this.emit({ type: 'secret', playerId: sourceId, message });
    }

    if (mark) {
      // Counted in the next day's vote, and again in a re-vote, until the vote
      // is truly over.
      this.ravenTarget = mark.targetId;
      const marked = this.state.players.find(p => p.id === mark.targetId);
      this.actionLog.push(
        `Night ${this.round}: the raven marked ${marked?.name ?? mark.targetId}.`,
      );
    }

    if (charmPlan.size > 0) {
      charmPlan.forEach((targets, piperId) => {
        const piper = this.state.players.find(p => p.id === piperId);
        if (!piper?.isAlive) return;

        const fresh: string[] = [];
        targets.forEach(targetId => {
          if (this.charmed.has(targetId)) return;
          const target = this.state.players.find(p => p.id === targetId);
          if (!target?.isAlive) return;
          this.charmed.add(targetId);
          fresh.push(target.id);
        });
        if (fresh.length === 0) return;

        const names = fresh.map(id => this.state.players.find(p => p.id === id)?.name ?? id);
        this.actionLog.push(`Night ${this.round}: the piper charmed ${names.join(', ')}.`);

        fresh.forEach(id => {
          const message = 'The Pied Piper played for you: you are charmed.';
          this.transport.sendToPlayer(id, {
            type: 'SECRET_INFO',
            payload: { message },
            timestamp: Date.now(),
          });
          this.emit({ type: 'secret', playerId: id, message });
        });

        const flock = this.state.players
          .filter(p => this.charmed.has(p.id))
          .map(p => p.name)
          .join(', ');
        const message = `Your flock so far: ${flock}. Charm every player still alive and the game is yours.`;
        this.transport.sendToPlayer(piperId, {
          type: 'SECRET_INFO',
          payload: { message },
          timestamp: Date.now(),
        });
        this.emit({ type: 'secret', playerId: piperId, message });
      });
    }

    if (pickedSide) {
      const chooser = this.state.players.find(p => p.id === pickedSide.playerId);
      if (pickedSide.actionId === 'join') {
        this.actionLog.push(`Night 1: ${chooser?.name} chose the wolves.`);
        this.admitToPack(pickedSide.playerId, 'You run with the wolves now.');
      } else {
        this.actionLog.push(`Night 1: ${chooser?.name} chose the village.`);
        const message = 'You stay with the village for good.';
        this.transport.sendToPlayer(pickedSide.playerId, {
          type: 'SECRET_INFO',
          payload: { message },
          timestamp: Date.now(),
        });
        this.emit({ type: 'secret', playerId: pickedSide.playerId, message });
      }
    }

    if (watched) {
      this.roleModels.set(watched.sourceId, watched.targetId);
      const child = this.state.players.find(p => p.id === watched.sourceId);
      const modelPlayer = this.state.players.find(p => p.id === watched.targetId);
      this.actionLog.push(`Night 1: ${child?.name} watches over ${modelPlayer?.name}.`);
      const message = `You watch over ${modelPlayer?.name}. The day they die, you become a werewolf.`;
      this.transport.sendToPlayer(watched.sourceId, {
        type: 'SECRET_INFO',
        payload: { message },
        timestamp: Date.now(),
      });
      this.emit({ type: 'secret', playerId: watched.sourceId, message });
    }

    this.applyLoverDeaths(deaths);

    // Whoever dies leaves a parting shot for the hunter.
    this.pendingRevenge =
      deaths.find(
        dead =>
          this.assignments.get(dead.id)?.revengeOnDeath &&
          this.state.players.some(other => other.isAlive),
      )?.id ?? null;

    if (deaths.length === 0) {
      this.actionLog.push(`Night ${this.round}: nobody died.`);
    }

    // The catch was for one night only.
    this.girlCaught = false;

    return deaths;
  }

  // The card stays, the team changes: whoever turns keeps every power he had,
  // and the rest of the pack learns his name.
  private admitToPack(playerId: string, message: string) {
    const role = this.assignments.get(playerId);
    if (!role) return;

    this.assignments.set(playerId, { ...role, team: 'Wolf' });
    this.sendRoleAssign(playerId, this.assignments.get(playerId)!, true);
    this.transport.sendToPlayer(playerId, {
      type: 'SECRET_INFO',
      payload: { message },
      timestamp: Date.now(),
    });
    this.emit({ type: 'secret', playerId, message });

    this.state.players
      .filter(
        player =>
          player.isAlive &&
          player.id !== playerId &&
          this.assignments.get(player.id)?.team === 'Wolf',
      )
      .forEach(wolf => this.sendRoleAssign(wolf.id, this.assignments.get(wolf.id)!, true));
  }

  // The Wild Child turns the moment his model dies, wherever the death came
  // from: every phase change looks for a model who is gone.
  private turnWildChildren() {
    this.state.players.forEach(child => {
      if (!child.isAlive) return;
      const model = this.roleModels.get(child.id);
      if (!model) return;

      const modelPlayer = this.state.players.find(player => player.id === model);
      if (modelPlayer?.isAlive) return;

      const role = this.assignments.get(child.id);
      if (!role || role.team === 'Wolf') return;

      this.roleModels.delete(child.id);
      this.actionLog.push(
        `Round ${this.round}: ${child.name} lost ${modelPlayer?.name} and turned.`,
      );
      this.admitToPack(child.id, `${modelPlayer?.name} is dead. You are a werewolf now.`);
    });
  }

  // The Infectious Father's bite, converted: the victim keeps the card and its
  // powers but wakes up a wolf. The guard's shield and the Alien's nature stop
  // it, and the charge was spent either way.
  private infectPlayer(target: Player) {
    const role = this.assignments.get(target.id);
    if (!role) return;

    if (role.wolfImmune) {
      this.actionLog.push(`Night ${this.round}: the infection slid off ${target.name}.`);
      return;
    }
    if (this.isShieldedBySomeone(target.id)) {
      this.actionLog.push(
        `Night ${this.round}: the guard's shield kept the infection off ${target.name}.`,
      );
      return;
    }

    this.actionLog.push(
      `Night ${this.round}: ${target.name} was infected and is a werewolf now (${role.name}).`,
    );
    this.admitToPack(
      target.id,
      'You have been infected: you are a werewolf now, and you keep your powers.',
    );
  }

  // Lovers are tied together: one going takes the other along.
  private applyLoverDeaths(deaths: Player[]) {
    if (!this.lovers) return;

    const [first, second] = this.lovers;
    const queue = [...deaths];

    while (queue.length > 0) {
      const fallen = queue.shift()!;
      const partnerId = fallen.id === first ? second : fallen.id === second ? first : null;
      if (!partnerId) continue;

      const partner = this.state.players.find(p => p.id === partnerId);
      if (!partner?.isAlive) continue;

      partner.isAlive = false;
      deaths.push(partner);
      queue.push(partner);
      // The Alien can break a heart in broad daylight too.
      const when = this.state.currentPhase === 'Night' ? 'Night' : 'Day';
      this.actionLog.push(`${when} ${this.round}: ${partner.name} died of a broken heart.`);
    }
  }

  private resolveRevenge(): Player[] {
    const deaths = [...this.revengeDeaths];
    const hunterId = this.pendingRevenge;
    const hunter = hunterId ? this.state.players.find(p => p.id === hunterId) : null;

    if (this.revengeChoice) {
      const target = this.state.players.find(p => p.id === this.revengeChoice!.targetId);
      if (target?.isAlive) {
        target.isAlive = false;
        deaths.push(target);
        this.announce(`${hunter?.name ?? 'The Hunter'} took ${target.name} down.`);
        this.applyLoverDeaths(deaths);
      }
    } else if (hunter) {
      // A hunter who keeps his powder dry is the narrator's trivia: announcing
      // it would reveal him for nothing.
      this.actionLog.push(`${hunter.name} took nobody down.`);
    }

    this.pendingRevenge = null;
    this.revengeChoice = null;
    this.revengeDeaths = [];

    return deaths;
  }

  // ------------------------------------------------------ the mayoral election

  // Any player may stand: the seat is a title, so a wolf can wear it.
  volunteerForMayor(playerId: string): boolean {
    if (this.winner) return false;
    if (this.state.currentPhase !== 'Election' || this.electionStage !== 'nominate') return false;

    const actor = this.state.players.find(p => p.id === playerId);
    if (!actor?.isAlive) return false;
    if (this.mayorVolunteers.includes(playerId)) return false;
    if (this.mayorVolunteers.length >= 3) return false;

    this.mayorVolunteers.push(playerId);
    // The nomination list is public: every device redraws it as names come in.
    this.broadcastPhase();
    this.emit({ type: 'changed' });
    return true;
  }

  hasVolunteered(playerId: string): boolean {
    return this.mayorVolunteers.includes(playerId);
  }

  // The nominated candidates, once the nominations are closed.
  getMayorCandidates(): PlayerRef[] {
    return this.state.presidentManager
      .getCandidates()
      .map(id => this.state.players.find(p => p.id === id))
      .filter((player): player is Player => !!player)
      .map(player => ({ id: player.id, name: player.name, isAlive: player.isAlive }));
  }

  // One list for the whole table, because the election is public: who is
  // standing while the list is open, who may be voted for once it closes, and
  // only the tied players if the seat goes to a re-vote.
  getElectionList(): PlayerRef[] {
    if (this.electionStage === 'nominate') {
      return this.toRefs(
        this.state.players.filter(player => this.mayorVolunteers.includes(player.id)),
      );
    }

    if (this.electionRevote && this.mayorRevoteLeaders.length > 0) {
      return this.toRefs(
        this.state.players.filter(player => this.mayorRevoteLeaders.includes(player.id)),
      );
    }

    return this.getMayorCandidates();
  }

  getMayor(): PlayerRef | null {
    const mayorId = this.state.presidentManager.getPresidentId();
    if (!mayorId) return null;

    const mayor = this.state.players.find(p => p.id === mayorId);
    return mayor ? { id: mayor.id, name: mayor.name, isAlive: mayor.isAlive } : null;
  }

  getElectionStage(): 'nominate' | 'vote' {
    return this.electionStage;
  }

  // One player, one vote for the seat. There is no mayor yet, so no ballot
  // weighs more than another.
  handleMayorVote(voterId: string, targetId: string): boolean {
    if (this.winner) return false;
    if (this.state.currentPhase !== 'Election' || this.electionStage !== 'vote') return false;

    const voter = this.state.players.find(p => p.id === voterId);
    if (!voter?.isAlive) return false;
    // Only the players actually on the ballot: on a re-vote that is the tied
    // few, not the whole list.
    if (!this.getElectionList().some(candidate => candidate.id === targetId)) return false;

    this.votes.set(voterId, targetId);
    this.emit({ type: 'changed' });
    return true;
  }

  private closeNominations() {
    const alive = this.getAlivePlayers();

    // Nobody stood? Three are drawn, or the table would start the night with
    // no one to vote for.
    const standing =
      this.mayorVolunteers.length > 0
        ? this.mayorVolunteers
        : alive.map(player => player.id);

    this.state.presidentManager.startElection(this.state.players, 3, standing);

    this.announce(
      `The candidates are ${this.getMayorCandidates().map(candidate => candidate.name).join(', ')}.`,
    );

    this.electionStage = 'vote';
    this.electionRevote = false;
    this.mayorRevoteLeaders = [];
    this.votes.clear();
    this.setPhase('Debate');
  }

  private resolveMayorVote() {
    // The ballots are being counted, so the clock that was running for them is
    // over. Without this a re-vote would inherit a clock already past due.
    this.timer = null;

    const candidates = this.getElectionList().map(candidate => candidate.id);
    const tally = new Map<string, number>();
    const ballots: VoteBallot[] = [];

    this.votes.forEach((targetId, voterId) => {
      const voter = this.state.players.find(p => p.id === voterId);
      if (!voter?.isAlive) return;
      if (!candidates.includes(targetId)) return;

      tally.set(targetId, (tally.get(targetId) ?? 0) + (voter.voteWeight || 1));

      const target = this.state.players.find(p => p.id === targetId);
      if (target) {
        ballots.push({
          voterId,
          voterName: voter.name,
          targetId,
          targetName: target.name,
        });
      }
    });

    let topVotes = 0;
    tally.forEach(count => {
      if (count > topVotes) topVotes = count;
    });

    const leaders = candidates.filter(id => (tally.get(id) ?? 0) === topVotes && topVotes > 0);
    const tie = leaders.length > 1;
    const nameOf = (id: string) => this.state.players.find(p => p.id === id)?.name ?? id;
    const rows = candidates.map(id => ({ id, name: nameOf(id), count: tally.get(id) ?? 0 }));

    // A tied seat is voted again once; a second tie leaves the table without a
    // mayor rather than stalling the evening.
    if (tie && !this.electionRevote) {
      this.electionRevote = true;
      this.mayorRevoteLeaders = leaders;
      this.votes.clear();

      const redo: VoteResultPayload = {
        eliminatedId: null,
        eliminatedName: null,
        tie: true,
        tally: rows,
        ballots,
        revote: true,
        candidates: leaders.map(id => ({ id, name: nameOf(id) })),
      };

      this.lastVote = redo;
      this.announce(
        `The mayor vote is tied between ${leaders.map(nameOf).join(' and ')}. They vote again.`,
      );

      this.transport.broadcast({ type: 'VOTE_RESULT', payload: redo, timestamp: Date.now() });
      // The re-vote has a shorter ballot, and every guest's panel has to show
      // the tied few and let them vote again.
      this.broadcastPhase();
      this.autoPlayBots();
      this.emit({ type: 'changed' });
      return;
    }

    const winnerId = tie ? null : leaders[0] ?? (candidates.length === 1 ? candidates[0] : null);

    const result: VoteResultPayload = {
      eliminatedId: null,
      eliminatedName: null,
      tie,
      tally: rows,
      ballots,
    };

    this.lastVote = result;
    this.transport.broadcast({ type: 'VOTE_RESULT', payload: result, timestamp: Date.now() });

    if (winnerId) {
      this.state.presidentManager.setPresident(winnerId, this.state.players);

      const mayor = this.state.players.find(p => p.id === winnerId);
      this.announce(`${mayor?.name} was elected mayor.`);

      this.transport.broadcast({
        type: 'MAYOR_ELECTED',
        payload: { playerId: winnerId, playerName: mayor?.name ?? winnerId },
        timestamp: Date.now(),
      });
    } else {
      this.announce('The table could not agree on a mayor. The night begins without one.');
    }

    this.emit({ type: 'changed' });

    // Straight into the first night: the election is what opens the game.
    this.round = 1;
    this.setPhase('Night');
  }

  private resolveVote() {
    // The vote is being counted, so whatever clock was running for it is over.
    // Without this a re-vote would inherit a clock that is already past due
    // and be resolved instantly.
    this.timer = null;

    const alive = this.state.players.filter(p => p.isAlive);

    const tally = new Map<string, number>();
    alive.forEach(p => tally.set(p.id, 0));

    const ballots: VoteBallot[] = [];

    this.votes.forEach((targetId, voterId) => {
      const voter = this.state.players.find(p => p.id === voterId);
      if (!voter || !voter.isAlive) return;
      if (!tally.has(targetId)) return;

      const weight = voter.voteWeight || 1;
      tally.set(targetId, (tally.get(targetId) ?? 0) + weight);

      const target = this.state.players.find(p => p.id === targetId);
      if (target) {
        ballots.push({
          voterId,
          voterName: voter.name,
          targetId,
          targetName: target.name,
        });
      }
    });

    // The raven's two votes count like any others, without a ballot row of
    // their own: the table sees the total, never who added to it. On a re-run
    // only the tied names may be voted for, so the mark only lands when it is
    // one of them.
    if (
      this.ravenTarget &&
      tally.has(this.ravenTarget) &&
      (this.revoteCandidates.length === 0 || this.revoteCandidates.includes(this.ravenTarget))
    ) {
      tally.set(this.ravenTarget, (tally.get(this.ravenTarget) ?? 0) + 2);
    }

    let topVotes = 0;
    tally.forEach(count => {
      if (count > topVotes) topVotes = count;
    });

    const leaders =
      topVotes > 0
        ? [...tally.entries()].filter(([, count]) => count === topVotes).map(([id]) => id)
        : [];
    const tie = leaders.length > 1;
    const candidates = leaders.map(id => ({
      id,
      name: this.state.players.find(p => p.id === id)?.name ?? id,
    }));

    const tallyRows = () =>
      alive.map(p => ({ id: p.id, name: p.name, count: tally.get(p.id) ?? 0 }));

    // A first tie is re-run between the tied players. A second one lets the
    // day pass, or two stubborn camps could stall the table forever.
    if (tie && this.revoteCandidates.length === 0) {
      this.revoteCandidates = leaders;
      this.votes.clear();

      const redo: VoteResultPayload = {
        eliminatedId: null,
        eliminatedName: null,
        tie: true,
        tally: tallyRows(),
        ballots,
        revote: true,
        candidates,
      };

      this.lastVote = redo;
      this.announce(
        `Day ${this.round}: the vote was tied between ${candidates
          .map(candidate => candidate.name)
          .join(' and ')}. They vote again.`,
      );

      this.transport.broadcast({
        type: 'VOTE_RESULT',
        payload: redo,
        timestamp: Date.now(),
      });

      // Test players fill in their new ballots by themselves, or a table of
      // bots would always let the re-vote pass.
      this.autoPlayBots();

      this.emit({ type: 'changed' });
      return;
    }

    let eliminatedId: string | null = null;
    let eliminatedName: string | null = null;
    const deaths: Player[] = [];

    if (topVotes > 0 && !tie) {
      const target = this.state.players.find(p => p.id === leaders[0]);
      if (target) {
        const role = this.assignments.get(target.id);
        if (role?.survivesVote) {
          // The village unmasked the idiot. He lives, and never votes again.
          this.noVote.add(target.id);
          this.announce(
            `Day ${this.round}: ${target.name} was voted out and turned out to be the village idiot. He survives, and may never vote again.`,
          );
        } else {
          target.isAlive = false;
          eliminatedId = target.id;
          eliminatedName = target.name;
          deaths.push(target);
          this.announce(`Day ${this.round}: ${target.name} was voted out.`);
          this.applyLoverDeaths(deaths);
        }
      }
    } else if (topVotes > 0) {
      const goat = this.state.players.find(
        p => p.isAlive && this.assignments.get(p.id)?.scapegoat,
      );
      if (goat) {
        // The tie is nobody's fault, and the scapegoat pays for it: he dies
        // when the host moves the phase on, after naming tomorrow's voters.
        this.scapegoatPending = goat.id;
        this.announce(
          `Day ${this.round}: the vote was tied again. ${goat.name} was the scapegoat, and pays for it.`,
        );
      } else {
        this.announce(
          `Day ${this.round}: the vote was tied again, nobody was eliminated.`,
        );
      }
    } else {
      this.announce(`Day ${this.round}: nobody voted.`);
    }

    const result: VoteResultPayload = {
      eliminatedId,
      eliminatedName,
      tie,
      tally: tallyRows(),
      ballots,
    };

    this.lastVote = result;

    // The raven's votes were for this vote and the re-votes it took to settle.
    this.ravenTarget = null;
    // So were the scapegoat's bans: the next day's voters start clean.
    this.voteBanned.clear();

    this.transport.broadcast({
      type: 'VOTE_RESULT',
      payload: result,
      timestamp: Date.now(),
    });

    // A hunter from an earlier vote of the same day keeps his shot.
    if (!this.pendingRevenge) {
      this.pendingRevenge =
        deaths.find(
          dead =>
            this.assignments.get(dead.id)?.revengeOnDeath &&
            this.state.players.some(other => other.isAlive),
        )?.id ?? null;
    }

    this.emit({ type: 'changed' });

    // The Angel wanted the first vote to be theirs, and takes the game with it.
    if (this.round === 1 && deaths.some(dead => this.assignments.get(dead.id)?.angel)) {
      this.winnerLabel = 'The Angel wins.';
      this.finish('Solitary');
      return;
    }

    // The scapegoat's turn to act comes before the night.
    if (this.scapegoatPending) {
      this.setPhase('Scapegoat');
      return;
    }

    // This vote's deaths and any earlier one from the same day, so the judge's
    // second vote does not bury the mayor or the hunter of the first.
    const allDeaths = [...this.judgeDeaths, ...deaths];
    this.judgeDeaths = [];

    // The judge may force one more vote before the day is over.
    const judge = this.state.players.find(
      p => p.isAlive && this.assignments.get(p.id)?.judge && !this.judgeUsed.has(p.id),
    );
    if (allDeaths.length > 0 && judge) {
      this.judgeDeaths = allDeaths;
      this.setPhase('Judge');
      return;
    }

    // The hunter may still owe a shot before the round can close.
    this.enterAfterDeaths('Vote', allDeaths);
  }

  // The players the current re-vote is limited to, or an empty list.
  getRevoteCandidates(): string[] {
    return this.revoteCandidates;
  }

  // -------------------------------------------------------------------- clock

  // The host runs the clock, not the engine: the host UI ticks once a second
  // and asks whether the phase is up. That keeps the loop deterministic and
  // runnable in plain Node, with no timers of its own.
  startTimer(seconds: number): boolean {
    if (this.winner) return false;
    // The clock runs the talking phases: the day, the vote, and the election
    // debate are all "decide now or the host moves on".
    const timed: Phase[] = ['Day', 'Vote', 'Debate', 'Election'];
    if (!timed.includes(this.state.currentPhase)) return false;
    if (!(seconds > 0)) return false;

    this.timer = { endsAt: Date.now() + seconds * 1000, totalMs: seconds * 1000 };
    this.broadcastTime();
    this.emit({ type: 'changed' });
    return true;
  }

  clearTimer() {
    if (!this.timer) return;
    this.timer = null;
    this.broadcastTime();
    this.emit({ type: 'changed' });
  }

  getTimerRemainingMs(): number | null {
    if (!this.timer) return null;
    return Math.max(0, this.timer.endsAt - Date.now());
  }

  getTimerTotalMs(): number | null {
    return this.timer?.totalMs ?? null;
  }

  // True once the host's clock has run out. The tick calls this, then advance.
  isTimerDue(): boolean {
    return !!this.timer && this.getTimerRemainingMs() === 0;
  }

  private broadcastTime() {
    const payload: TimeSyncPayload = {
      remainingMs: this.getTimerRemainingMs(),
      totalMs: this.timer?.totalMs,
    };

    this.transport.broadcast({
      type: 'TIME_SYNC',
      payload,
      timestamp: Date.now(),
    });
  }

  private checkWin(): Team | null {
    const alive = this.state.players.filter(p => p.isAlive);

    // The lovers win as a pair once everyone else is gone, whatever teams
    // they were dealt. Checked first: with two players left the wolves would
    // otherwise win on parity before the pair could be recognised.
    if (
      this.lovers &&
      alive.length === 2 &&
      this.lovers.every(id => alive.some(p => p.id === id))
    ) {
      this.winnerLabel = 'The Lovers win.';
      return 'Solitary';
    }

    // The Piper wins the moment everyone still standing dances to his tune.
    const piper = alive.find(p => this.assignments.get(p.id)?.charms);
    if (piper && alive.every(p => p.id === piper.id || this.charmed.has(p.id))) {
      this.winnerLabel = 'The Pied Piper wins.';
      return 'Solitary';
    }

    // A role that only wins alone has won the moment the table is his.
    if (alive.length === 1 && this.assignments.get(alive[0].id)?.winsAlone) {
      this.winnerLabel = `The ${alive[0].role} wins.`;
      return 'Solitary';
    }

    const wolves = alive.filter(p => this.assignments.get(p.id)?.team === 'Wolf');
    const others = alive.filter(p => this.assignments.get(p.id)?.team !== 'Wolf');

    this.winnerLabel = null;
    if (wolves.length === 0) return 'Village';
    // Parity settles nothing while the Alien is alive: he can still kill a
    // wolf by daylight, so the game runs until one side is actually gone.
    if (alive.some(p => this.assignments.get(p.id)?.guessesRoles)) return null;
    // Once the wolves are at least half of the survivors they can no longer
    // be outvoted, which is the classic werewolf win condition.
    if (wolves.length >= others.length) return 'Wolf';
    return null;
  }

  private finish(winner: Team) {
    this.winner = winner;
    this.announce(
      this.winnerLabel ??
        (winner === 'Wolf'
          ? 'The Werewolves win.'
          : winner === 'Solitary'
          ? 'The Lovers win.'
          : 'The Village wins.'),
    );

    this.transport.broadcast({
      type: 'GAME_OVER',
      payload: this.buildGameOverPayload(),
      timestamp: Date.now(),
    });

    this.emit({ type: 'gameOver', winner });
    this.emit({ type: 'changed' });
  }

  // ----------------------------------------------------- abstract ability layer

  // Handle player actions from the composable ability system in roles.ts.
  performAction(actionId: string, sourceId: string, targetIds: string[]): boolean {
    const action = (ACTION_REGISTRY as Record<string, typeof KillAction>)[actionId];
    if (!action) {
      console.warn(`Unknown action: ${actionId}`);
      return false;
    }

    const source = this.state.players.find(p => p.id === sourceId);
    if (!source) {
      console.warn(`Unknown source player: ${sourceId}`);
      return false;
    }

    const targets = this.state.players.filter(p => targetIds.includes(p.id));
    if (targets.length !== targetIds.length) {
      console.warn('Some action targets were not found in the current game state');
    }

    const context: ActionContext = {
      gameState: this.state,
      source,
      targets,
    };

    this.state.queueAction(action, context);
    return true;
  }

  // Execute every queued action in priority order.
  processActions() {
    this.state.processQueue();
  }

  getRoles(): Role[] {
    return this.roles;
  }
}
