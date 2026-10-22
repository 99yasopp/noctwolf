export type Phase =
  | 'Night'
  | 'Day'
  | 'Vote'
  | 'Revenge'
  | 'Debate'
  | 'Election'
  // The dying mayor names the player who takes the double vote.
  | 'Succession'
  // The scapegoat pays for a tied vote and bans the voters of tomorrow.
  | 'Scapegoat'
  // The stuttering judge decides whether the day gets one more vote.
  | 'Judge';

export type Team = 'Village' | 'Wolf' | 'Solitary';

// The private windows of the game: the wolves' whisper, the bond between the
// lovers, and the dead's own table. Whatever is said there stays off the
// table's journal.
export type ChatGroup = 'wolves' | 'lovers' | 'ghosts';

export interface ChatLine {
  group: ChatGroup;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: number;
}

export interface Player {
  id: string;
  name: string;
  role: string;
  team: Team;
  isAlive: boolean;
  statusEffects: string[];
  voteWeight: number; // For the President
  // Test players the host adds so a game can be played without extra devices.
  isBot?: boolean;
}

export type TriggerType = 
  | 'OnPhaseStart' 
  | 'OnActionTriggered' 
  | 'OnDeath' 
  | 'OnVoteCast' 
  | 'OnGameStart' 
  | 'OnRoleChange';

export interface PrimitiveBlock {
  id: string;
  type: 'Trigger' | 'Condition' | 'Action' | 'Modifier';
  priority?: number; // For resolve ordering
}

export interface ActionContext {
  gameState: any; // Will be typed as GameState later
  source: Player;
  targets: Player[];
}

export interface Action {
  id: string;
  name: string;
  priority: number;
  execute: (context: ActionContext) => void;
}

export interface Condition extends PrimitiveBlock {
  type: 'Condition';
  evaluate: (context: any) => boolean;
}
