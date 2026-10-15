// Headless verification of the game loop. The engine has no React Native
// imports, so this runs in plain Node:
//
//   npx tsc scripts/game-loop-test.ts --outDir /tmp/opencode/build \
//     --module commonjs --target es2020 --moduleResolution node --skipLibCheck
//   node /tmp/opencode/build/scripts/game-loop-test.js
import { GameManager } from '../src/engine/gameManager';
import { GameTransport } from '../src/engine/transport';
import { Player } from '../src/engine/types';
import { NetworkMessage } from '../src/network/protocol';

let failures = 0;

const check = (label: string, condition: boolean, detail = '') => {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label} ${detail}`);
  }
};

const makePlayers = (count: number, isBot = false): Player[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `P${index + 1}`,
    role: 'Unknown',
    team: 'Village' as const,
    isAlive: true,
    statusEffects: [],
    voteWeight: 1,
    isBot,
  }));

class RecordingTransport implements GameTransport {
  public broadcasts: NetworkMessage[] = [];
  public directs: { playerId: string; message: NetworkMessage }[] = [];

  broadcast(message: NetworkMessage) {
    this.broadcasts.push(message);
  }

  sendToPlayer(playerId: string, message: NetworkMessage) {
    this.directs.push({ playerId, message });
  }
}

const roleOf = (game: GameManager, players: Player[], id: string) =>
  players.find(p => p.id === id)!;

const findRole = (game: GameManager, players: Player[], roleId: string) =>
  players.find(p => game.getRoleOf(p.id)?.id === roleId);

// ---------------------------------------------------------------------------

console.log('\n1. dealing roles');
{
  const players = makePlayers(3);
  const transport = new RecordingTransport();
  const game = new GameManager(players, transport, true);
  game.start();

  const dealt = players.map(p => game.getRoleOf(p.id)?.id).sort();
  check(
    'roles are one wolf, one seer, one villager',
    JSON.stringify(dealt) === JSON.stringify(['seer', 'villager', 'werewolf']),
    JSON.stringify(dealt),
  );
  check('starts on night 1', game.state.currentPhase === 'Night' && game.round === 1);

  const roleMessages = transport.directs.filter(d => d.message.type === 'ROLE_ASSIGN');
  check('every player is told their own role', roleMessages.length === 3, `${roleMessages.length}`);
  check(
    'roles are never broadcast',
    transport.broadcasts.every(m => m.type !== 'ROLE_ASSIGN'),
  );
  check(
    'role messages carry the role of the recipient',
    transport.directs.every(
      d =>
        d.message.type !== 'ROLE_ASSIGN' ||
        d.message.payload.roleId === game.getRoleOf(d.playerId)?.id,
    ),
  );
}

console.log('\n2. first night is peaceful');
{
  const players = makePlayers(3);
  const transport = new RecordingTransport();
  const game = new GameManager(players, transport);
  game.start();

  const wolf = findRole(game, players, 'werewolf')!;
  const seer = findRole(game, players, 'seer')!;
  const victim = players.find(p => p.id !== wolf.id && p.id !== seer.id)!;

  check('the wolf is not asked to act', !game.getPendingNightActors().includes(wolf));
  check('the wolf cannot kill anyway', !game.handleNightAction(wolf.id, 'kill', victim.id));
  check('the seer can still peek', game.handleNightAction(seer.id, 'peek', wolf.id));

  game.advance();
  check('phase moved to Day', game.state.currentPhase === 'Day');
  check('nobody died', players.every(p => p.isAlive));

  const dayBroadcast = transport.broadcasts[transport.broadcasts.length - 1];
  check('the day announcement reports no deaths', (dayBroadcast.payload.deaths ?? []).length === 0);

  const secret = transport.directs.find(d => d.message.type === 'SECRET_INFO');
  check('the peek result is sent', !!secret);
  check('only the seer gets the peek', secret?.playerId === seer.id, secret?.playerId);
  check(
    'the peek tells the truth',
    secret?.message.payload.isWolf === true,
    JSON.stringify(secret?.message.payload),
  );
}

console.log('\n3. village wins by voting out the wolf');
{
  const players = makePlayers(3);
  const transport = new RecordingTransport();
  const game = new GameManager(players, transport);
  game.start();

  const wolf = findRole(game, players, 'werewolf')!;
  game.advance(); // quiet night -> Day
  game.advance(); // Day -> Vote

  check('phase is Vote', game.state.currentPhase === 'Vote');
  check('everyone still owes a vote', game.getPendingVoters().length === 3);

  players.forEach(p => game.handleVote(p.id, wolf.id));
  check('no pending voters remain', game.getPendingVoters().length === 0);

  game.advance();
  check('the wolf was eliminated', !wolf.isAlive);
  check('the village won', game.winner === 'Village', String(game.winner));

  const over = transport.broadcasts.filter(m => m.type === 'GAME_OVER');
  check('the result was broadcast once', over.length === 1, `${over.length}`);
  check('the final reveal lists every role', (over[0]?.payload.reveal ?? []).length === 3);
}

console.log('\n4. wolves win when they reach parity');
{
  const players = makePlayers(3);
  const game = new GameManager(players, new RecordingTransport());
  game.start();

  const wolf = findRole(game, players, 'werewolf')!;
  const villager = findRole(game, players, 'villager')!;

  game.advance(); // Day
  game.advance(); // Vote
  players.forEach(p => game.handleVote(p.id, villager.id));
  game.advance();

  check('the villager was eliminated', !villager.isAlive);
  check('the wolves won', game.winner === 'Wolf', String(game.winner));
}

console.log('\n5. dead players are inert');
{
  const players = makePlayers(5, true);
  const game = new GameManager(players, new RecordingTransport());
  game.start();

  const wolf = findRole(game, players, 'werewolf')!;
  const victim = players.find(p => p.id !== wolf.id && game.getRoleOf(p.id)?.team !== 'Wolf')!;

  game.advance(); // quiet night -> Day
  game.advance(); // Day -> Vote
  players.forEach(p => game.handleVote(p.id, victim.id));
  game.advance(); // resolve: victim eliminated, night 2 begins

  check('the voted out player died', !victim.isAlive);
  check('the game continued', game.winner === null, String(game.winner));
  check('phase is Night again', game.state.currentPhase === 'Night' && game.round === 2);
  check('the wolf may kill on night 2', game.handleNightAction(wolf.id, 'kill', players.find(p => p.isAlive && p.id !== wolf.id)!.id));
  check('the dead cannot vote', !game.handleVote(victim.id, wolf.id));
}

console.log('\n6. the seer cannot inspect itself, wolves cannot eat wolves');
{
  const players = makePlayers(6, true);
  const game = new GameManager(players, new RecordingTransport());
  game.start();

  const seer = findRole(game, players, 'seer')!;
  const wolf = findRole(game, players, 'werewolf')!;

  check('the seer cannot peek itself', !game.handleNightAction(seer.id, 'peek', seer.id));
  check('a villager cannot kill', !game.handleNightAction(seer.id, 'kill', wolf.id));
}

console.log('\n7. a full bot game always terminates');
{
  let wolfWins = 0;
  let villageWins = 0;
  let stuck = 0;

  for (let attempt = 0; attempt < 200; attempt++) {
    const players = makePlayers(3, true);
    const game = new GameManager(players, new RecordingTransport());
    game.start();

    let guard = 0;
    while (!game.winner && guard++ < 20) game.advance();

    if (!game.winner) stuck++;
    else if (game.winner === 'Wolf') wolfWins++;
    else villageWins++;
  }

  check('no game ever got stuck', stuck === 0, `${stuck} stuck`);
  check('both outcomes are reachable', wolfWins > 0 && villageWins > 0, `wolf=${wolfWins} village=${villageWins}`);
  console.log(`       (${villageWins} village wins, ${wolfWins} wolf wins out of 200)`);
}

console.log('\n8. a late-joining player can resync');
{
  const players = makePlayers(3);
  const transport = new RecordingTransport();
  const game = new GameManager(players, transport, true);
  game.start();

  const before = transport.directs.length;
  game.sendStateTo(players[0].id);
  const resync = transport.directs.slice(before);

  check(
    'resync resends the role and the phase',
    resync.some(d => d.message.type === 'ROLE_ASSIGN') &&
      resync.some(d => d.message.type === 'PHASE_UPDATE'),
  );
  check('resync only targets the asking player', resync.every(d => d.playerId === players[0].id));
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
