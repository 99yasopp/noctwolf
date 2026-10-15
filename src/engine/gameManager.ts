import { GameState } from './state';
import { ActionContext, Phase, Player, Team } from './types';
import { Role } from './roles';
import { GameTransport, nullTransport } from './transport';
import { NightActionKind, PlayableRole, buildRoleSet } from './roleSet';
import {
  KillAction,
  ProtectAction,
  ApplyPunishmentAction,
  EstablishChannelAction,
} from './actions';
import {
  GameOverPayload,
  NightActionPayload,
  PhaseUpdatePayload,
  PlayerRef,
  RoleAssignPayload,
  SecretInfoPayload,
  VoteResultPayload,
} from '../network/protocol';

// Registry of every action a role is allowed to trigger.
const ACTION_REGISTRY = {
  [KillAction.id]: KillAction,
  [ProtectAction.id]: ProtectAction,
  [ApplyPunishmentAction.id]: ApplyPunishmentAction,
  [EstablishChannelAction.id]: EstablishChannelAction,
};

export type GameEvent =
  | { type: 'changed' }
  | { type: 'secret'; playerId: string; message: string }
  | { type: 'gameOver'; winner: Team };

const shuffle = <T>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export class GameManager {
  public state: GameState;
  public round: number = 1;
  public winner: Team | null = null;
  public lastVote: VoteResultPayload | null = null;
  public actionLog: string[] = [];

  private transport: GameTransport;
  private roles: Role[] = [];
  private assignments = new Map<string, PlayableRole>();
  private nightKill: { sourceId: string; targetId: string } | null = null;
  private nightPeek: { sourceId: string; targetId: string } | null = null;
  private votes = new Map<string, string>();
  private listeners = new Set<(event: GameEvent) => void>();

  constructor(
    players: Player[],
    transport: GameTransport = nullTransport,
    isHost: boolean = false,
  ) {
    this.state = new GameState(players, isHost);
    this.transport = transport;
    console.log(`Game Manager initialized. Is Host: ${isHost}`);
  }

  subscribe(listener: (event: GameEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: GameEvent) {
    this.listeners.forEach(listener => listener(event));
  }

  // ---------------------------------------------------------------- lifecycle

  // Assign roles and open the first night. Roles are drawn from a shuffled
  // set so the same player is not always the wolf.
  start(roleSet?: PlayableRole[]) {
    const players = this.state.players;
    if (players.length === 0) {
      console.warn('Cannot start a game without players');
      return;
    }

    const set = shuffle(roleSet && roleSet.length ? roleSet : buildRoleSet(players.length));
    this.assignments.clear();
    this.votes.clear();
    this.nightKill = null;
    this.nightPeek = null;
    this.actionLog = [];
    this.lastVote = null;
    this.round = 1;
    this.winner = null;

    players.forEach((player, index) => {
      const role = set[index % set.length];
      this.assignments.set(player.id, role);
      player.role = role.name;
      player.team = role.team;
      player.isAlive = true;
      player.statusEffects = [];
      player.voteWeight = 1;
    });

    players.forEach(player => {
      const role = this.assignments.get(player.id);
      if (role) this.sendRoleAssign(player.id, role);
    });

    this.actionLog.push(`${players.length} players were dealt their roles.`);
    this.setPhase('Night');
  }

  // { phase: 'Night' } opens a fresh night, { phase: 'Day' } announces the
  // night's deaths, { phase: 'Vote' } collects votes.
  transitionTo(phase: Phase) {
    this.setPhase(phase);
  }

  // The single host-driven button: resolves the current phase and moves on.
  advance() {
    if (this.winner) return;

    const phase = this.state.currentPhase;

    if (phase === 'Night') {
      const deaths = this.resolveNight();
      this.setPhase('Day', { deaths: this.toRefs(deaths) });

      const winner = this.checkWin();
      if (winner) this.finish(winner);
      return;
    }

    if (phase === 'Day') {
      this.setPhase('Vote');
      return;
    }

    if (phase === 'Vote') {
      this.resolveVote();

      const winner = this.checkWin();
      if (winner) {
        this.finish(winner);
        return;
      }

      this.round += 1;
      this.setPhase('Night');
      return;
    }

    this.setPhase('Night');
  }

  // ------------------------------------------------------------------ actions

  handleNightAction(playerId: string, action: NightActionKind, targetId: string): boolean {
    if (this.winner) return false;
    if (this.state.currentPhase !== 'Night') return false;

    const actor = this.state.players.find(p => p.id === playerId);
    if (!actor || !actor.isAlive) return false;

    const role = this.assignments.get(playerId);
    if (!role || role.nightAction !== action) return false;

    // Without this the wolf reaches parity on night one in a three player
    // game, which hands it a win before the village ever gets to vote.
    if (action === 'kill' && this.isQuietNight()) return false;

    const target = this.state.players.find(p => p.id === targetId);
    if (!target || !target.isAlive) return false;

    if (action === 'kill') {
      // A wolf cannot devour its own pack.
      if (this.assignments.get(targetId)?.team === 'Wolf') return false;
      this.nightKill = { sourceId: playerId, targetId };
    } else {
      if (targetId === playerId) return false;
      this.nightPeek = { sourceId: playerId, targetId };
    }

    this.emit({ type: 'changed' });
    return true;
  }

  handleVote(voterId: string, targetId: string): boolean {
    if (this.winner) return false;
    if (this.state.currentPhase !== 'Vote') return false;

    const voter = this.state.players.find(p => p.id === voterId);
    if (!voter || !voter.isAlive) return false;

    const target = this.state.players.find(p => p.id === targetId);
    if (!target || !target.isAlive) return false;

    this.votes.set(voterId, targetId);
    this.emit({ type: 'changed' });
    return true;
  }

  // ------------------------------------------------------------------ queries

  getRoleOf(playerId: string): PlayableRole | undefined {
    return this.assignments.get(playerId);
  }

  getAlivePlayers(): Player[] {
    return this.state.players.filter(p => p.isAlive);
  }

  // The opening night is peaceful: the seer still gets a read, but nobody is
  // devoured, so the first day vote actually decides the game.
  isQuietNight(): boolean {
    return this.round === 1;
  }

  // Players who still owe a night action this round.
  getPendingNightActors(): Player[] {
    if (this.state.currentPhase !== 'Night') return [];

    return this.state.players.filter(player => {
      if (!player.isAlive) return false;
      const role = this.assignments.get(player.id);
      if (!role?.nightAction) return false;
      if (role.nightAction === 'kill' && this.isQuietNight()) return false;
      return role.nightAction === 'kill' ? !this.nightKill : !this.nightPeek;
    });
  }

  // Players who have not voted yet.
  getPendingVoters(): Player[] {
    if (this.state.currentPhase !== 'Vote') return [];
    return this.state.players.filter(p => p.isAlive && !this.votes.has(p.id));
  }

  hasActed(playerId: string): boolean {
    const role = this.assignments.get(playerId);
    if (!role?.nightAction) return false;
    return role.nightAction === 'kill' ? !!this.nightKill : !!this.nightPeek;
  }

  hasVoted(playerId: string): boolean {
    return this.votes.has(playerId);
  }

  // ----------------------------------------------------------------- plumbing

  // Re-send the private state a player needs. Used when a client connects
  // after the game already started, so a late join screen cannot miss it.
  sendStateTo(playerId: string) {
    const role = this.assignments.get(playerId);
    if (role) this.sendRoleAssign(playerId, role);

    this.transport.sendToPlayer(playerId, {
      type: 'PHASE_UPDATE',
      payload: this.buildPhasePayload(),
      timestamp: Date.now(),
    });

    if (this.lastVote) {
      this.transport.sendToPlayer(playerId, {
        type: 'VOTE_RESULT',
        payload: this.lastVote,
        timestamp: Date.now(),
      });
    }

    if (this.winner) {
      this.transport.sendToPlayer(playerId, {
        type: 'GAME_OVER',
        payload: this.buildGameOverPayload(),
        timestamp: Date.now(),
      });
    }
  }

  private sendRoleAssign(playerId: string, role: PlayableRole) {
    const allies =
      role.team === 'Wolf'
        ? this.state.players
            .filter(
              p => p.id !== playerId && this.assignments.get(p.id)?.team === 'Wolf',
            )
            .map(p => ({ id: p.id, name: p.name, isAlive: p.isAlive }))
        : [];

    const payload: RoleAssignPayload = {
      roleId: role.id,
      roleName: role.name,
      team: role.team,
      description: role.description,
      allies,
      nightAction: role.nightAction,
      nightActionLabel: role.nightActionLabel,
    };

    this.transport.sendToPlayer(playerId, {
      type: 'ROLE_ASSIGN',
      payload,
      timestamp: Date.now(),
    });
  }

  private buildPhasePayload(extra: Partial<PhaseUpdatePayload> = {}): PhaseUpdatePayload {
    return {
      phase: this.state.currentPhase,
      round: this.round,
      players: this.toRefs(this.state.players),
      ...extra,
    };
  }

  private buildGameOverPayload(): GameOverPayload {
    return {
      winner: this.winner ?? 'Village',
      reveal: this.state.players.map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        team: p.team,
        isAlive: p.isAlive,
      })),
    };
  }

  private toRefs(players: Player[]): PlayerRef[] {
    return players.map(p => ({ id: p.id, name: p.name, isAlive: p.isAlive }));
  }

  private setPhase(phase: Phase, extra: Partial<PhaseUpdatePayload> = {}) {
    this.state.setPhase(phase);

    if (phase === 'Night') {
      this.nightKill = null;
      this.nightPeek = null;
      this.votes.clear();
    }

    if (phase === 'Vote') {
      this.votes.clear();
      this.lastVote = null;
    }

    this.transport.broadcast({
      type: 'PHASE_UPDATE',
      payload: this.buildPhasePayload(extra),
      timestamp: Date.now(),
    });

    // Test players act by themselves so a host can verify the loop without
    // three devices.
    this.autoPlayBots();

    this.emit({ type: 'changed' });
  }

  // Bots pick at random: good enough to exercise every branch of the loop.
  private autoPlayBots() {
    const alive = this.state.players.filter(p => p.isAlive);

    if (this.state.currentPhase === 'Night') {
      if (!this.nightKill && !this.isQuietNight()) {
        const wolf = alive.find(
          p => p.isBot && this.assignments.get(p.id)?.nightAction === 'kill',
        );
        if (wolf) {
          const prey = alive.filter(
            p => p.id !== wolf.id && this.assignments.get(p.id)?.team !== 'Wolf',
          );
          if (prey.length > 0) {
            const target = prey[Math.floor(Math.random() * prey.length)];
            this.nightKill = { sourceId: wolf.id, targetId: target.id };
          }
        }
      }

      if (!this.nightPeek) {
        const seer = alive.find(
          p => p.isBot && this.assignments.get(p.id)?.nightAction === 'peek',
        );
        if (seer) {
          const candidates = alive.filter(p => p.id !== seer.id);
          if (candidates.length > 0) {
            const target = candidates[Math.floor(Math.random() * candidates.length)];
            this.nightPeek = { sourceId: seer.id, targetId: target.id };
          }
        }
      }
    }

    if (this.state.currentPhase === 'Vote') {
      alive.forEach(voter => {
        if (!voter.isBot || this.votes.has(voter.id)) return;
        const candidates = alive.filter(p => p.id !== voter.id);
        if (candidates.length === 0) return;
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        this.votes.set(voter.id, target.id);
      });
    }
  }

  // --------------------------------------------------------------- resolution

  private resolveNight(): Player[] {
    const deaths: Player[] = [];

    if (this.isQuietNight()) {
      this.actionLog.push('Night 1 was peaceful: the wolves only looked around.');
    } else if (this.nightKill) {
      const target = this.state.players.find(p => p.id === this.nightKill!.targetId);
      if (target && target.isAlive && !target.statusEffects.includes('Protected')) {
        target.isAlive = false;
        deaths.push(target);
        this.actionLog.push(`Night ${this.round}: ${target.name} was devoured.`);
      }
    }

    if (this.nightPeek) {
      const { sourceId, targetId } = this.nightPeek;
      const target = this.state.players.find(p => p.id === targetId);
      if (target) {
        const isWolf = this.assignments.get(target.id)?.team === 'Wolf';
        const message = `${target.name} is ${isWolf ? 'a Werewolf' : 'not a Werewolf'}.`;
        const payload: SecretInfoPayload = { message, isWolf };

        this.transport.sendToPlayer(sourceId, {
          type: 'SECRET_INFO',
          payload,
          timestamp: Date.now(),
        });
        this.emit({ type: 'secret', playerId: sourceId, message });
      }
    }

    if (deaths.length === 0) {
      this.actionLog.push(`Night ${this.round}: nobody died.`);
    }

    return deaths;
  }

  private resolveVote() {
    const alive = this.state.players.filter(p => p.isAlive);

    const tally = new Map<string, number>();
    alive.forEach(p => tally.set(p.id, 0));

    this.votes.forEach((targetId, voterId) => {
      const voter = this.state.players.find(p => p.id === voterId);
      if (!voter || !voter.isAlive) return;
      if (!tally.has(targetId)) return;
      tally.set(targetId, (tally.get(targetId) ?? 0) + (voter.voteWeight || 1));
    });

    let topId: string | null = null;
    let topVotes = 0;
    let tie = false;

    tally.forEach((count, id) => {
      if (count > topVotes) {
        topId = id;
        topVotes = count;
        tie = false;
      } else if (count === topVotes && count > 0) {
        tie = true;
      }
    });

    let eliminatedId: string | null = null;
    let eliminatedName: string | null = null;

    if (topId && !tie && topVotes > 0) {
      const target = this.state.players.find(p => p.id === topId);
      if (target) {
        target.isAlive = false;
        eliminatedId = target.id;
        eliminatedName = target.name;
        this.actionLog.push(`Day ${this.round}: ${target.name} was voted out.`);
      }
    } else if (topVotes > 0) {
      this.actionLog.push(`Day ${this.round}: the vote was tied, nobody was eliminated.`);
    } else {
      this.actionLog.push(`Day ${this.round}: nobody voted.`);
    }

    const result: VoteResultPayload = {
      eliminatedId,
      eliminatedName,
      tie,
      tally: alive.map(p => ({
        id: p.id,
        name: p.name,
        count: tally.get(p.id) ?? 0,
      })),
    };

    this.lastVote = result;

    this.transport.broadcast({
      type: 'VOTE_RESULT',
      payload: result,
      timestamp: Date.now(),
    });

    this.emit({ type: 'changed' });
  }

  private checkWin(): Team | null {
    const alive = this.state.players.filter(p => p.isAlive);
    const wolves = alive.filter(p => this.assignments.get(p.id)?.team === 'Wolf');
    const others = alive.filter(p => this.assignments.get(p.id)?.team !== 'Wolf');

    if (wolves.length === 0) return 'Village';
    // Once the wolves are at least half of the survivors they can no longer
    // be outvoted, which is the classic werewolf win condition.
    if (wolves.length >= others.length) return 'Wolf';
    return null;
  }

  private finish(winner: Team) {
    this.winner = winner;
    this.actionLog.push(
      winner === 'Wolf' ? 'The Werewolves win.' : 'The Village wins.',
    );

    this.transport.broadcast({
      type: 'GAME_OVER',
      payload: this.buildGameOverPayload(),
      timestamp: Date.now(),
    });

    this.emit({ type: 'gameOver', winner });
    this.emit({ type: 'changed' });
  }

  // ----------------------------------------------------- abstract ability layer

  // Handle player actions from the composable ability system in roles.ts.
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
