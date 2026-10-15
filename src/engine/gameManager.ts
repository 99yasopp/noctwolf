import { GameState } from './state';
import { ActionContext, Phase, Player } from './types';
import { Role } from './roles';
import { NarratorServer } from '../network/socketServer';
import {
  KillAction,
  ProtectAction,
  ApplyPunishmentAction,
  EstablishChannelAction,
} from './actions';

// Registry of every action a role is allowed to trigger.
const ACTION_REGISTRY = {
  [KillAction.id]: KillAction,
  [ProtectAction.id]: ProtectAction,
  [ApplyPunishmentAction.id]: ApplyPunishmentAction,
  [EstablishChannelAction.id]: EstablishChannelAction,
};

export class GameManager {
  public state: GameState;
  private server: NarratorServer;
  private roles: Role[];

  constructor(players: Player[], roles: Role[], server: NarratorServer, isHost: boolean = false) {
    this.state = new GameState(players, isHost);
    this.roles = roles;
    this.server = server;
    console.log(`Game Manager initialized. Is Host: ${isHost}`);
  }

  // Orchestrate phase transitions
  transitionTo(phase: Phase) {
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
  performAction(actionId: string, sourceId: string, targetIds: string[]): boolean {
    const action = (ACTION_REGISTRY as Record<string, typeof KillAction>)[actionId];
    if (!action) {
      console.warn(`Unknown action: ${actionId}`);
      return false;
    }

    const source = this.state.players.find(p => p.id === sourceId);
    if (!source) {
      console.warn(`Unknown source player: ${sourceId}`);
      return false;
    }

    const targets = this.state.players.filter(p => targetIds.includes(p.id));
    if (targets.length !== targetIds.length) {
      console.warn('Some action targets were not found in the current game state');
    }

    const context: ActionContext = {
      gameState: this.state,
      source,
      targets,
    };

    this.state.queueAction(action, context);
    return true;
  }

  // Execute every queued action in priority order.
  processActions() {
    this.state.processQueue();
  }

  getRoles(): Role[] {
    return this.roles;
  }
}
