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
  | 'TIME_SYNC';

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
}

export interface RoleAssignPayload {
  roleId: string;
  roleName: string;
  team: Team;
  description: string;
  allies: PlayerRef[];
  nightActions?: { id: string; label: string; kind: string }[];
  revengeOnDeath?: boolean;
  linksLovers?: boolean;
}

export interface NightActionPayload {
  action: string;
  targetId: string;
}

export interface VoteCastPayload {
  targetId: string;
}

export interface VoteBallot {
  voterId: string;
  voterName: string;
  targetId: string;
  targetName: string;
  weight: number;
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

export interface SecretInfoPayload {
  message: string;
  isWolf?: boolean;
}

export interface GameOverPayload {
  winner: Team;
  reveal: { id: string; name: string; role: string; team: Team; isAlive: boolean }[];
}
