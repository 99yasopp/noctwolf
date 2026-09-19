import { Phase, Player } from './types';
import { PresidentManager } from './president';

export class GameState {
  currentPhase: Phase = 'Night';
  players: Player[] = [];
  queue: any[] = [];
  presidentManager: PresidentManager;
  isHost: boolean;

  constructor(players: Player[], isHost: boolean = false) {
    this.players = players;
    this.presidentManager = new PresidentManager(players);
    this.isHost = isHost;
  }

  setPhase(phase: Phase) {
    this.currentPhase = phase;
    console.log(`Phase changed to: ${this.currentPhase}`);
  }

  // Queue an action to be executed
  queueAction(action: any, context: any) {
    this.queue.push({
      ...action,
      execute: () => action.execute(context)
    });
  }

  processQueue() {
    // Sort by priority before execution (lower number = higher priority/earlier execution)
    this.queue.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    
    while (this.queue.length > 0) {
      const action = this.queue.shift();
      action.execute();
    }
  }
}
