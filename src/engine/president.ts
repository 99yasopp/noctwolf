import { Player } from './types';

// The mayor is a title, not a card: anybody the table elects holds it, and a
// wolf can wear it. This class only keeps the title and the double vote with
// it; the election itself is driven by the game manager's phase machine.
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

  // A rematch deals the whole table again, and the old mayor's double vote
  // must not survive into it.
  reset(players: Player[]) {
    this.presidentId = null;
    this.candidates = [];
    this.timeBank = 0;
    players.forEach(p => p.voteWeight = 1);
  }

  // The mayor died without naming a successor: the seat is empty, and so is
  // the double vote that went with it.
  clearPresident(players: Player[]) {
    if (this.presidentId) {
      const old = players.find(p => p.id === this.presidentId);
      if (old) old.voteWeight = 1;
    }

    this.presidentId = null;
    this.candidates = [];
  }

  getPresidentId(): string | null {
    return this.presidentId;
  }

  getCandidates(): string[] {
    return [...this.candidates];
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
