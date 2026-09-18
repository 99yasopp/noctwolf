// Define the message types for network communication
export type MessageType = 
  | 'PLAYER_JOIN' 
  | 'PHASE_UPDATE' 
  | 'ROLE_ASSIGN' 
  | 'VOTE_CAST' 
  | 'TIME_SYNC';

export interface NetworkMessage {
  type: MessageType;
  payload: any;
  senderId?: string;
  timestamp: number;
}
