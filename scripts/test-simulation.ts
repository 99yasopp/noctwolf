import { GameState } from '../src/engine/state';
import { Player } from '../src/engine/types';
import { KillAction } from '../src/engine/actions';

// 1. Setup Players
const players: Player[] = [
  { id: '1', name: 'Alice (Villager)', role: 'Villager', team: 'Village', isAlive: true, statusEffects: [], voteWeight: 1 },
  { id: '2', name: 'Bob (Wolf)', role: 'Wolf', team: 'Wolf', isAlive: true, statusEffects: [], voteWeight: 1 },
  { id: '3', name: 'Charlie (Seer)', role: 'Seer', team: 'Village', isAlive: true, statusEffects: [], voteWeight: 1 },
];

// 2. Initialize GameState
const game = new GameState(players);

console.log("--- Initial State ---");
console.log(game.players.map(p => `${p.name} (Alive: ${p.isAlive})`));

// 3. Simulate a Night Phase Action (Wolf kills Alice)
console.log("\n--- Simulating Wolf Night Action ---");
game.queueAction(KillAction, {
  gameState: game,
  source: players[1], // Bob
  targets: [players[0]] // Alice
});

// 4. Process Queue
game.processQueue();

console.log("\n--- After Processing ---");
console.log(game.players.map(p => `${p.name} (Alive: ${p.isAlive})`));
