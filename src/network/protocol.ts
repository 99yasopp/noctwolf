import { Phase, Player, Team } from '../engine/types';

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
  | 'THIEF_SWAP';

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
}

export interface PlayerListPayload {
  players: Player[];
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
}

// The night runs in two stages: everyone acts first, then the witch wakes and
// is shown who the wolves took. The victim travels only to her, never in the
// broadcast copy of this message.
export interface NightStagePayload {
  stage: 1 | 2;
  victim?: PlayerRef | null;
  // The only player her healing potion may be pointed at, if any.
  healTargets?: string[];
}

export interface MayorElectedPayload {
  playerId: string;
  playerName: string;
}

export interface SecretInfoPayload {
  message: string;
  isWolf?: boolean;
}

export interface GameOverPayload {
  winner: Team;
  // The engine's own words when 'Solitary' is not the lovers. The reveal below
  // names everyone anyway.
  winnerLabel?: string;
  reveal: { id: string; name: string; role: string; team: Team; isAlive: boolean }[];
}
