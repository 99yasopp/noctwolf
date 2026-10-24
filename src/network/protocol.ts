import { ChatGroup, Phase, Player, Team } from '../engine/types';
import { RoleSetup, SettingValue } from '../engine/setup';
import { Params } from '../i18n';

// Define the message types for network communication
export type MessageType =
  | 'PLAYER_JOIN'
  | 'PLAYER_LIST'
  | 'PHASE_UPDATE'
  | 'ROLE_ASSIGN'
  | 'NIGHT_ACTION'
  | 'VOTE_CAST'
  | 'VOTE_RESULT'
  | 'SECRET_INFO'
  | 'STATE_REQUEST'
  | 'GAME_OVER'
  | 'KICK'
  | 'SEAT_TOKEN'
  | 'REVENGE'
  | 'NIGHT_STAGE'
  | 'NIGHT_PASS'
  | 'MAYOR_VOLUNTEER'
  | 'MAYOR_VOTE'
  | 'SUCCESSION'
  | 'MAYOR_ELECTED'
  | 'TIME_SYNC'
  | 'ALIEN_GUESS'
  | 'ALIEN_RESUME'
  | 'THIEF_SWAP'
  | 'JUDGE_REPEAT'
  | 'SCAPEGOAT_BAN'
  | 'TIE_BREAK'
  | 'RULES_UPDATE'
  | 'RAVEN_MARK'
  | 'PUBLIC_LOG'
  | 'CHAT_SEND'
  | 'CHAT_MESSAGE'
  | 'CHAT_GROUPS'
  | 'DECLINE'
  | 'REVEAL';

export interface NetworkMessage {
  type: MessageType;
  payload: any;
  senderId?: string;
  timestamp: number;
}

// The subset of a player that is safe to send to everyone: never the role.
export interface PlayerRef {
  id: string;
  name: string;
  isAlive: boolean;
  // The card of a dead player, when the table plays with cards revealed on
  // death. A living player never carries one. The id is what a phone reads its
  // own word for the card from; the name is what a card the host invented
  // keeps.
  roleId?: string | null;
  role?: string | null;
}

export interface PlayerListPayload {
  players: Player[];
  // The host's table travels with the roster while the room waits, so a guest
  // sees the roles and house rules without waiting for the deal. Optional:
  // the same message still carries a plain roster during a game.
  setup?: RoleSetup | null;
  // Names for roles the guest may not have locally, keyed by role id.
  names?: Record<string, string>;
  // How many of each role were dealt and how many are still alive. Present
  // only during a game; the waiting room has no deaths to count.
  roleTally?: {
    revealDead: boolean;
    roles: Record<string, { total: number; alive: number }>;
    deadTotal: number;
  } | null;
}

// The house rules, sent to the whole table when the deal is made. Guests read
// them; only the host can change them.
export interface RulesUpdatePayload {
  settings: Record<string, SettingValue>;
}

// One line of the table's journal: what everyone heard, and when. A phone that
// joins late is sent the lines it missed, one by one.
// Which kind of news a line is, so the journal can group it without reading
// the words: the same line is filed the same way in every language.
export type LogKind = 'table' | 'vote' | 'death' | 'seer';

// A line in the table's journal: the engine writes the key, the phone writes
// the sentence in its own language.
export interface PublicLogPayload {
  key: string;
  params?: Params;
  kind: LogKind;
  phase: Phase;
  round: number;
}

// Which private windows a phone holds, and one line said inside one of them.
// The engine is the only judge of both.
export interface ChatGroupsPayload {
  groups: ChatGroup[];
}

export interface PhaseUpdatePayload {
  phase: Phase;
  round: number;
  players: PlayerRef[];
  deaths?: PlayerRef[];
  // The mayor is elected before the first night and holds no card, so the
  // candidates, the stage of the election and the title all travel with the
  // phase everyone already receives.
  electionStage?: 'nominate' | 'vote';
  mayorCandidates?: PlayerRef[];
  mayorId?: string | null;
  // Set while the table waits for the dying mayor to name a successor.
  successionMayorId?: string | null;
  // True in the night that follows an election with too few players to feed:
  // the wolves only look around, and the panels must not offer an attack.
  quietNight?: boolean;
  // Set while the Alien still owes the table an answer: the day cannot move on
  // to the vote until he stops guessing.
  dayFrozen?: boolean;
  // The unmasked idiot and the players a scapegoat barred: no ballot for them.
  barredVoters?: string[];
}

export interface RoleAssignPayload {
  roleId: string;
  roleName: string;
  team: Team;
  description: string;
  allies: PlayerRef[];
  // A charged action that has some uses left carries the count; an action with
  // no limit leaves it out.
  nightActions?: { id: string; label: string; kind: string; chargesLeft?: number }[];
  revengeOnDeath?: boolean;
  linksLovers?: boolean;
  // The Alien's day power, so his panel can offer it.
  guessesRoles?: boolean;
  // The Thief's two spare cards, only while the first night is still open.
  thiefCards?: { id: string; name: string }[];
  // A resend of the same card, so the screen updates in place rather than
  // wiping the player's private log for a fresh deal.
  refresh?: boolean;
  // The Pied Piper's flock so far, so his panel stops offering them.
  charmedIds?: string[];
  // The scapegoat and the judge are asked to act in their own phases.
  scapegoat?: boolean;
  judge?: boolean;
}

export interface NightActionPayload {
  action: string;
  targetId: string;
}

// The Alien names a player and a role. Both ids: the host knows the truth.
export interface AlienGuessPayload {
  targetId: string;
  roleId: string;
}

// Declining a night action to its face. The action id is all the host needs.
export interface NightPassPayload {
  action: string;
}

export interface VoteCastPayload {
  targetId: string;
}

export interface VoteBallot {
  voterId: string;
  voterName: string;
  targetId: string;
  targetName: string;
  // No weight here on purpose: the roster keeps the Mayor's double vote out of
  // the public list, and a weight next to a named voter would give him away.
}

export interface VoteResultPayload {
  eliminatedId: string | null;
  eliminatedName: string | null;
  tie: boolean;
  tally: { id: string; name: string; count: number }[];
  // Who voted for whom. Public: the count alone is not much use for arguing.
  ballots?: VoteBallot[];
  // A tie sends the vote back for one more round between the tied players.
  revote?: boolean;
  candidates?: { id: string; name: string }[];
}

export interface TimeSyncPayload {
  // Counted down from the moment this arrives, so a device with a wrong clock
  // still shows the right countdown.
  remainingMs: number | null;
  totalMs?: number;
  // True when this is the window a stage is waiting on, not the host's own
  // clock for the talking phases: only then is a silent answer a lost turn.
  decision?: boolean;
}

// The night runs in two stages: everyone acts first, then the witch wakes and
// is shown who the wolves took. The victim travels only to her, never in the
// broadcast copy of this message.
export interface NightStagePayload {
  stage: 1 | 2;
  victim?: PlayerRef | null;
  // The only player her healing potion may be pointed at, if any.
  healTargets?: string[];
  // Sent to the infectious father alone while the pack's vote is split.
  tieTargets?: PlayerRef[];
}

export interface MayorElectedPayload {
  playerId: string;
  playerName: string;
}

export interface SecretInfoPayload {
  key: string;
  params?: Params;
  // What the seer looked at: the panel colours the answer with it.
  isWolf?: boolean;
}

export interface GameOverPayload {
  winner: Team;
  // The engine's own line when 'Solitary' is not the lovers; the reveal below
  // names everyone anyway. The phone reads the key in its own language.
  winnerKey?: string;
  winnerParams?: Params;
  reveal: RevealEntry[];
}

// One seat and its card: what the table is told at the end, and what a dead
// player is handed the moment he dies. The card travels as an id plus the name
// it was dealt with, so a role the host invented still shows.
export interface RevealEntry {
  id: string;
  name: string;
  roleId?: string;
  role: string;
  team: Team;
  isAlive: boolean;
}

export interface RevealPayload {
  reveal: RevealEntry[];
}

// A player who holds a decision in front of him and wants none of it: "don't
// shoot", "done pointing", "let the vote stand". The engine checks the phase
// against its own before it moves anything.
export interface DeclinePayload {
  phase: Phase;
}
