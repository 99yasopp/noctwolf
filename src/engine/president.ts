import { Player } from './types';

export class PresidentManager {
  private presidentId: string | null = null;
  private timeBank: number = 0; // In seconds
  private candidates: string[] = [];

  constructor(players: Player[]) {
    // Initialize everyone with vote weight 1
    players.forEach(p => p.voteWeight = 1);
  }

  // Phase 1: Collect candidates
  startElection(players: Player[], limit: number, volunteerIds: string[]) {
    let finalCandidates: string[] = [];

    if (volunteerIds.length === 0) {
      // Fallback: Randomly select all players if no one volunteers
      finalCandidates = players.map(p => p.id);
    } else if (volunteerIds.length > limit) {
      // Randomly trim to limit
      finalCandidates = [...volunteerIds].sort(() => 0.5 - Math.random()).slice(0, limit);
    } else {
      finalCandidates = volunteerIds;
    }

    this.candidates = finalCandidates;
    console.log("Candidates for Mayor:", this.candidates);
  }

  // Phase 2: Finalize President
  setPresident(playerId: string, players: Player[]) {
    if (this.presidentId) {
      const oldPresident = players.find(p => p.id === this.presidentId);
      if (oldPresident) oldPresident.voteWeight = 1;
    }

    this.presidentId = playerId;
    const newPresident = players.find(p => p.id === playerId);
    if (newPresident) {
      newPresident.voteWeight = 2;
    }
  }

  handleSuccession(deceasedId: string, successorId: string, players: Player[]) {
    if (this.presidentId === deceasedId) {
      console.log(`President ${deceasedId} died. Transferring power to ${successorId}`);
      this.setPresident(successorId, players);
    }
  }

  consumeTime(seconds: number): boolean {
    if (this.timeBank >= seconds) {
      this.timeBank -= seconds;
      return true;
    }
    return false;
  }

  addTime(seconds: number) {
    this.timeBank += seconds;
  }
}
