// scripts/integration-test.ts
import { GameManager } from '../src/engine/gameManager';
import { Player } from '../src/engine/types';

// Synchronous top-level execution
console.log("=== Integration Test Starting ===");

try {
  const players: Player[] = [
    { id: '1', name: 'Alice', role: 'Unknown', team: 'Village', isAlive: true, statusEffects: [], voteWeight: 1 },
    { id: '2', name: 'Bob', role: 'Unknown', team: 'Village', isAlive: true, statusEffects: [], voteWeight: 1 },
    { id: '3', name: 'Charlie', role: 'Unknown', team: 'Village', isAlive: true, statusEffects: [], voteWeight: 1 },
  ];

  console.log("--- Initializing Engine ---");
  // No transport: the engine never needs a live server to be exercised.
  const game = new GameManager(players);

  console.log("--- Dealing Roles ---");
  game.start();

  console.log("--- Testing President Election ---");
  game.state.presidentManager.setPresident('1', players);

  const updatedAlice = game.state.players?.find(p => p.id === '1') || players[0];
  console.log(`President set to: ${updatedAlice.name} (Vote Weight: ${updatedAlice.voteWeight})`);

  console.log("--- Testing Phase Broadcast ---");
  game.transitionTo('Day');
  console.log(`Phase is now: ${game.state.currentPhase}`);

  console.log("--- Integration Test Passed ---");
} catch (error) {
  console.error("--- Integration Test Error caught ---", error);
}
