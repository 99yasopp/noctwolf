import { Player } from '../engine/types';

export class NetworkServer {
  private connectedPlayers: Player[] = [];

  // Register a player joining the game
  addPlayer(player: Player) {
    this.connectedPlayers.push(player);
    console.log(`Player ${player.name} joined the game.`);
  }

  // Broadcast the game state to all players
  broadcastGameState(gameState: any) {
    // In a real implementation, this would use WebSockets or P2P
    console.log("Broadcasting updated GameState to all players.");
  }

  // Send a specific private message (e.g., role assignment)
  sendPrivateMessage(playerId: string, message: any) {
    console.log(`Sending private message to ${playerId}:`, message);
  }

  getPlayers(): Player[] {
    return this.connectedPlayers;
  }
}
