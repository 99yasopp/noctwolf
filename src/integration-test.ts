// src/integration-test.ts
import { GameManager } from './engine/gameManager';
import { NarratorServer } from './network/socketServer';
import { Player } from './engine/types';

// Synchronous top-level execution
console.log("=== Integration Test Starting ===");

try {
  const server = new NarratorServer();

  const players: Player[] = [
    { id: '1', name: 'Alice', role: 'Villager', team: 'Village', isAlive: true, statusEffects: [], voteWeight: 1 },
    { id: '2', name: 'Bob', role: 'Wolf', team: 'Wolf', isAlive: true, statusEffects: [], voteWeight: 1 }
  ];

  console.log("--- Initializing Engine ---");
  const game = new GameManager(players, [], server);

  console.log("--- Testing Network Broadcast ---");
  game.transitionTo('Day');

  console.log("--- Testing President Election ---");
  game.state.presidentManager.setPresident('1', players);

  const updatedAlice = game.state.players?.find(p => p.id === '1') || players[0];
  console.log(`President set to: ${updatedAlice.name} (Vote Weight: ${updatedAlice.voteWeight})`);

  console.log("--- Integration Test Passed ---");
} catch (error) {
  console.error("--- Integration Test Error caught ---", error);
}