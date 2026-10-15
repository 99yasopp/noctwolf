import { NetworkMessage } from '../network/protocol';

// The engine reaches the outside world only through this interface, so it
// never imports React Native and stays runnable in plain Node.
export interface GameTransport {
  // To every connected player.
  broadcast(message: NetworkMessage): void;
  // To one player only (private role and night information).
  sendToPlayer(playerId: string, message: NetworkMessage): void;
}

// Used in tests and in any context where nothing is connected.
export const nullTransport: GameTransport = {
  broadcast: () => {},
  sendToPlayer: () => {},
};
