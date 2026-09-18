import { Player } from '../engine/types';

export class LobbyManager {
  private roomCode: string = '';
  private players: Player[] = [];

  generateRoomCode(): string {
    // Simple 4-letter code for the MVP
    this.roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    return this.roomCode;
  }

  joinGame(code: string, player: Player): boolean {
    if (code === this.roomCode) {
      this.players.push(player);
      return true;
    }
    return false;
  }

  getPlayers(): Player[] {
    return this.players;
  }
}
