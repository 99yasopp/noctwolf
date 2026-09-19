import { GameState } from './state';
import { Player } from './types';
import { Role } from './roles';
import { NarratorServer } from '../network/socketServer';

export class GameManager {
  public state: GameState;
  private server: NarratorServer;

  constructor(players: Player[], roles: Role[], server: NarratorServer, isHost: boolean = false) {
    this.state = new GameState(players, isHost);
    this.server = server;
    console.log(`Game Manager initialized. Is Host: ${isHost}`);
  }

  // Orchestrate phase transitions
  transitionTo(phase: 'Night' | 'Day' | 'Vote' | 'Election') {
    this.state.setPhase(phase);
    
    // Broadcast the phase update to all players
    this.server.broadcast({
      type: 'PHASE_UPDATE',
      payload: { phase },
      timestamp: Date.now(),
    });

    if (phase === 'Election') {
      console.log("Election phase started. Awaiting candidate input...");
    }
  }

  // Handle player actions
  performAction(actionId: string, sourceId: string, targetIds: string[]) {
    // Logic to fetch the action from the registry and queue it
  }
}
