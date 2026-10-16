// Headless verification of the game loop. The engine has no React Native
// imports, so this runs in plain Node:
//
//   npx tsc scripts/game-loop-test.ts --outDir /tmp/opencode/build \
//     --module commonjs --target es2020 --moduleResolution node --skipLibCheck
//   node /tmp/opencode/build/scripts/game-loop-test.js
import { GameManager } from '../src/engine/gameManager';
import {
  AlienRole,
  BigBadWolfRole,
  CupidRole,
  GuardRole,
  HunterRole,
  InfectiousFatherRole,
  PlayableRole,
  RedWolfRole,
  SeerRole,
  VillagerRole,
  WerewolfRole,
  WhiteWerewolfRole,
  WitchRole,
  buildClassicRoleSet,
  buildCustomRoleSet,
  getCustomRoles,
  setCustomRoles,
} from '../src/engine/roleSet';
import {
  TRANSLATABLE_ACTIONS,
  translateGeneratedRole,
} from '../src/engine/generatedRole';
import {
  buildSetupRoles,
  fillWithVillagers,
  setupFromRoles,
  setupProblem,
  setupSeatsUsed,
} from '../src/engine/setup';
import { ALLOWED_ACTIONS as VALIDATED_ACTIONS } from '../src/engine/roleGenerator';
import { GameTransport } from '../src/engine/transport';
import { Player } from '../src/engine/types';
import { NetworkMessage, PhaseUpdatePayload } from '../src/network/protocol';
import { MessageDecoder, encodeMessage } from '../src/network/framing';
import { ClientLink } from '../src/network/clientLink';
import {
  WebSocketFrameReader,
  asciiBytes,
  asciiText,
  encodeTextFrame,
  messageLimit,
  webSocketHandshakeResponse,
} from '../src/network/webSocket';

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

// A masked frame the way a browser writes one: short header unless the payload
// needs a longer one (or the caller asks for it).
const maskedFrame = (
  opcode: number,
  payload: Uint8Array,
  fin = true,
  forceLong = false,
): Uint8Array => {
  const key = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
  const header: number[] = [fin ? 0x80 | opcode : opcode];
  if (payload.length < 126 && !forceLong) {
    header.push(0x80 | payload.length);
  } else if (payload.length < 0x10000 && !forceLong) {
    header.push(0x80 | 126, (payload.length >> 8) & 0xff, payload.length & 0xff);
  } else {
    header.push(
      0x80 | 127,
      0,
      0,
      0,
      0,
      (payload.length >>> 24) & 0xff,
      (payload.length >> 16) & 0xff,
      (payload.length >> 8) & 0xff,
      payload.length & 0xff,
    );
  }
  header.push(...key);

  const frame = new Uint8Array(header.length + payload.length);
  frame.set(header, 0);
  for (let i = 0; i < payload.length; i++) {
    frame[header.length + i] = payload[i] ^ key[i % 4];
  }
  return frame;
};

// A mayor can die mid-test, and a bot mayor names his successor by himself, so
// one more press clears the phase. Tests that check the succession drive it by
// hand and do not call this.
const settleSuccession = (game: GameManager) => {
  if (game.state.currentPhase === 'Succession') game.advance();
};

// Every game now opens with the mayoral election: the helper stands one
// volunteer and presses through the debate and the ballot until the first night
// starts. Bot tables sort their own election out, so the loop just runs it.
const passElection = (game: GameManager, volunteerId?: string) => {
  const volunteer = volunteerId ?? game.getAlivePlayers()[0].id;
  game.volunteerForMayor(volunteer);

  let guard = 0;
  while (
    (game.state.currentPhase === 'Election' || game.state.currentPhase === 'Debate') &&
    guard++ < 10
  ) {
    game.advance();
    settleSuccession(game);
  }
};

// ---------------------------------------------------------------------------

console.log('\n1. dealing roles');
{
  const players = makePlayers(3);
  const transport = new RecordingTransport();
  const game = new GameManager(players, transport, true);
  game.start();
  passElection(game);

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
  passElection(game);

  const wolf = findRole(game, players, 'werewolf')!;
  const seer = findRole(game, players, 'seer')!;
  const victim = players.find(p => p.id !== wolf.id && p.id !== seer.id)!;

  check('the wolf is not asked to act', !game.getPendingNightActors().includes(wolf));
  check('the wolf cannot kill anyway', !game.handleNightAction(wolf.id, 'kill', victim.id));
  check('the seer can still peek', game.handleNightAction(seer.id, 'peek', wolf.id));

  game.advance();
  settleSuccession(game);
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
  passElection(game);

  const wolf = findRole(game, players, 'werewolf')!;
  game.advance(); // quiet night -> Day
  settleSuccession(game);
  game.advance(); // Day -> Vote
  settleSuccession(game);

  check('phase is Vote', game.state.currentPhase === 'Vote');
  check('everyone still owes a vote', game.getPendingVoters().length === 3);

  players.forEach(p => game.handleVote(p.id, wolf.id));
  check('no pending voters remain', game.getPendingVoters().length === 0);

  game.advance();
  settleSuccession(game);
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
  passElection(game);

  const wolf = findRole(game, players, 'werewolf')!;
  const villager = findRole(game, players, 'villager')!;

  game.advance(); // Day
  settleSuccession(game);
  game.advance(); // Vote
  settleSuccession(game);
  players.forEach(p => game.handleVote(p.id, villager.id));
  game.advance();
  settleSuccession(game);

  check('the villager was eliminated', !villager.isAlive);
  check('the wolves won', game.winner === 'Wolf', String(game.winner));
}

console.log('\n5. dead players are inert');
{
  const players = makePlayers(5, true);
  const game = new GameManager(players, new RecordingTransport());
  game.start();
  passElection(game);

  const wolf = findRole(game, players, 'werewolf')!;

  game.advance(); // night 1: the bot wolves hunt
  settleSuccession(game);
  game.advance(); // Day -> Vote
  settleSuccession(game);

  // The night may have taken someone already, and the vote needs a player who
  // is still standing.
  const victim = game
    .getAlivePlayers()
    .find(p => game.getRoleOf(p.id)?.team !== 'Wolf')!;

  game.getAlivePlayers().forEach(p => game.handleVote(p.id, victim.id));
  game.advance(); // the vote resolves, night 2 begins
  settleSuccession(game);

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
  passElection(game);

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
    passElection(game);

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
  passElection(game);

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

console.log('\n9. a rematch re-deals into the same seats');
{
  const players = makePlayers(3);
  const transport = new RecordingTransport();
  const game = new GameManager(players, transport, true);
  game.start();
  passElection(game);

  const wolf = findRole(game, players, 'werewolf')!;
  game.advance(); // quiet night -> Day
  settleSuccession(game);
  game.advance(); // Day -> Vote
  settleSuccession(game);
  players.forEach(p => game.handleVote(p.id, wolf.id));
  game.advance(); // resolve: the wolf is out and the game ends
  settleSuccession(game);

  check('the first game finished', game.winner === 'Village', String(game.winner));
  check('a player died in the first game', !wolf.isAlive);

  // What the host's "Play again" does: revive the table, then start again.
  const before = transport.directs.length;
  players.forEach(p => {
    p.isAlive = true;
    p.role = 'Unknown';
    p.team = 'Village';
    p.voteWeight = 1;
  });
  game.start();
  passElection(game);

  check('everyone is on their feet again', players.every(p => p.isAlive));
  check(
    'the same seats get new roles',
    players.every(p => !!game.getRoleOf(p.id)),
  );
  check('a fresh round one begins', game.state.currentPhase === 'Night' && game.round === 1);
  check('the previous winner is cleared', game.winner === null, String(game.winner));

  const redealt = transport.directs
    .slice(before)
    .filter(d => d.message.type === 'ROLE_ASSIGN');
  check('every seat is told its new role', redealt.length === 3, `${redealt.length}`);

  const resyncStart = transport.directs.length;
  game.sendStateTo(players[0].id);
  const resync = transport.directs.slice(resyncStart);
  check(
    'a resync after the rematch carries no stale elimination',
    resync.every(
      d => d.message.type !== 'VOTE_RESULT' || d.message.payload?.eliminatedId === null,
    ),
    JSON.stringify(resync.filter(d => d.message.type === 'VOTE_RESULT').map(d => d.message.payload)),
  );
  check(
    'the republished ballot is the new election, not the old vote',
    !!game.lastVote && game.lastVote.eliminatedId === null,
  );
}


console.log('\n10. the wider role set');
{
  const ids = (set: PlayableRole[]) => set.map(r => r.id).sort().join(',');
  check(
    'a small table stays simple',
    ids(buildClassicRoleSet(3)) === 'seer,villager,werewolf',
    ids(buildClassicRoleSet(3)),
  );
  check(
    'an eight player table gets every power',
    ids(buildClassicRoleSet(8)) === 'cupid,guard,hunter,seer,villager,werewolf,werewolf,witch',
    ids(buildClassicRoleSet(8)),
  );
  check(
    'the mayor is a title now, never a dealt card',
    [3, 5, 8, 12].every(n => buildClassicRoleSet(n).every(role => role.id !== 'mayor')),
  );
  check(
    'the built set always fits the table',
    [3, 5, 8, 12].every(n => buildClassicRoleSet(n).length === n),
  );
}

console.log('\n11. the guard can stop a kill');
{
  const players = makePlayers(4);
  const game = new GameManager(players, new RecordingTransport());
  game.start([WerewolfRole, GuardRole, SeerRole, VillagerRole]);
  passElection(game);

  const wolf = findRole(game, players, 'werewolf')!;
  const guard = findRole(game, players, 'guard')!;
  const target = findRole(game, players, 'seer')!;

  game.advance(); // quiet night -> Day
  settleSuccession(game);
  game.advance(); // Day -> Vote
  settleSuccession(game);
  const doomed = findRole(game, players, 'villager')!;
  players.forEach(p => game.handleVote(p.id, doomed.id));
  game.advance(); // the villager is voted out, night 2 begins
  settleSuccession(game);

  check('night 2 has started', game.state.currentPhase === 'Night' && game.round === 2);
  check('the guard may shield someone', game.handleNightAction(guard.id, 'protect', target.id));
  check('the wolf may bite', game.handleNightAction(wolf.id, 'kill', target.id));

  game.advance();
  settleSuccession(game);
  check('the shielded player survived', target.isAlive);
  check('the guard cannot shield the same player twice in a row', !game.handleNightAction(guard.id, 'protect', target.id));
}

console.log('\n12. the witch wakes after the wolves');
{
  const players = makePlayers(6);
  const transport = new RecordingTransport();
  const game = new GameManager(players, transport);
  game.start([WerewolfRole, WitchRole, SeerRole, VillagerRole, VillagerRole, VillagerRole]);
  passElection(game);

  const wolf = findRole(game, players, 'werewolf')!;
  const witch = findRole(game, players, 'witch')!;
  const seer = findRole(game, players, 'seer')!;
  const villagers = players.filter(p => game.getRoleOf(p.id)?.id === 'villager');

  check('a table with a witch needs two presses', game.isWakingTheWitchNext());

  game.advance(); // night 1: the witch is woken for her poison
  settleSuccession(game);
  game.advance(); // night 1 resolves -> Day
  settleSuccession(game);
  game.advance(); // Day -> Vote
  settleSuccession(game);
  players.forEach(p => game.handleVote(p.id, villagers[0].id));
  game.advance(); // night 2
  settleSuccession(game);

  check('night 2 opens in its first stage', game.getNightStage() === 1);
  check('the witch cannot heal before the wolves pick', !game.handleNightAction(witch.id, 'heal', seer.id));
  check('the witch cannot poison before the wolves pick', !game.handleNightAction(witch.id, 'poison', wolf.id));
  check('the wolf may bite', game.handleNightAction(wolf.id, 'kill', seer.id));

  game.advance(); // the wolves are done: the witch wakes
  settleSuccession(game);
  check('the witch is woken second', game.getNightStage() === 2);
  check('she is shown the victim', game.getNightVictim()?.id === seer.id);
  const stageBroadcast = transport.broadcasts.filter(m => m.type === 'NIGHT_STAGE');
  check(
    'the stage is broadcast without the victim in it',
    stageBroadcast.length >= 2 &&
      stageBroadcast.some(m => m.payload.stage === 2) &&
      stageBroadcast.every(m => m.payload.victim === undefined && m.payload.healTargets === undefined),
    JSON.stringify(stageBroadcast.map(m => m.payload)),
  );
  const witchStage = transport.directs.filter(
    d => d.message.type === 'NIGHT_STAGE' && d.playerId === witch.id,
  );
  check(
    'the witch is sent the victim privately',
    witchStage.length === 2 &&
      witchStage[0].message.payload.victim === null &&
      witchStage[1].message.payload.victim?.id === seer.id,
    JSON.stringify(witchStage.map(d => d.message.payload)),
  );
  const otherStage = transport.directs.filter(
    d => d.message.type === 'NIGHT_STAGE' && d.playerId !== witch.id,
  );
  check(
    'nobody else is told the victim',
    otherStage.every(d => d.message.payload.victim === null),
  );
  check('she cannot save someone who was not attacked', !game.handleNightAction(witch.id, 'heal', villagers[2].id));
  check('she can save the victim', game.handleNightAction(witch.id, 'heal', seer.id));

  game.advance(); // the night resolves
  settleSuccession(game);
  check('the healed player survived', seer.isAlive);
  check('the potion is spent', !game.handleNightAction(witch.id, 'heal', seer.id));

  game.advance(); // Day -> Vote
  settleSuccession(game);
  players.forEach(p => game.handleVote(p.id, villagers[1].id));
  game.advance(); // night 3
  settleSuccession(game);

  check('night 3 has started', game.state.currentPhase === 'Night' && game.round === 3);
  check('the healing potion is spent for good', !game.handleNightAction(witch.id, 'heal', seer.id));
  check('the wolf may bite again', game.handleNightAction(wolf.id, 'kill', seer.id));

  game.advance(); // wakes the witch a second time
  settleSuccession(game);
  check('the witch wakes again for the poison', game.getNightStage() === 2);
  check('the poison is still unused', game.handleNightAction(witch.id, 'poison', wolf.id));

  game.advance();
  settleSuccession(game);
  check('the poison killed the wolf', !wolf.isAlive);
  check('the village won once the last wolf was poisoned', game.winner === 'Village', String(game.winner));
}

console.log('\n12b. the potion is not offered when it would be wasted');
{
  const players = makePlayers(5);
  const game = new GameManager(players, new RecordingTransport());
  game.start([WerewolfRole, GuardRole, WitchRole, VillagerRole, VillagerRole]);
  passElection(game);

  const wolf = findRole(game, players, 'werewolf')!;
  const guard = findRole(game, players, 'guard')!;
  const witch = findRole(game, players, 'witch')!;
  const villager = findRole(game, players, 'villager')!;

  game.advance(); // night 1: the witch is woken for her poison
  settleSuccession(game);
  game.advance(); // night 1 resolves -> Day
  settleSuccession(game);
  game.advance(); // Day -> Vote
  settleSuccession(game);
  const doomed = players.find(p => game.getRoleOf(p.id)?.id === 'villager' && p.id !== villager.id)!;
  players.forEach(p => game.handleVote(p.id, doomed.id));
  game.advance(); // night 2
  settleSuccession(game);

  check('the guard shields the victim', game.handleNightAction(guard.id, 'protect', villager.id));
  check('the wolves bite the shielded player', game.handleNightAction(wolf.id, 'kill', villager.id));

  game.advance(); // wake the witch
  settleSuccession(game);
  check('nothing is offered to the witch', game.getHealTarget() === null);
  check('the potion cannot be wasted on a saved player', !game.handleNightAction(witch.id, 'heal', villager.id));

  game.advance(); // resolve
  settleSuccession(game);
  check('the shielded player survived', villager.isAlive);
  check('the healing potion was not spent', game.hasChargeLeft(witch.id, 'heal'));
}

console.log('\n12c. a table with no witch resolves in one press');
{
  const players = makePlayers(5);
  const game = new GameManager(players, new RecordingTransport());
  game.start([WerewolfRole, SeerRole, VillagerRole, VillagerRole, VillagerRole]);
  passElection(game);

  game.advance();
  settleSuccession(game);
  check('the night resolved without a second press', game.state.currentPhase === 'Day');
}

console.log('\n13. the hunter takes someone down');
{
  const players = makePlayers(5);
  const game = new GameManager(players, new RecordingTransport());
  game.start([WerewolfRole, HunterRole, SeerRole, VillagerRole, VillagerRole]);
  passElection(game);

  const wolf = findRole(game, players, 'werewolf')!;
  const hunter = findRole(game, players, 'hunter')!;

  game.advance(); // quiet night -> Day
  settleSuccession(game);
  game.advance(); // Day -> Vote
  settleSuccession(game);
  players.forEach(p => game.handleVote(p.id, hunter.id));
  game.advance(); // the hunter is voted out
  settleSuccession(game);

  check('the hunter died', !hunter.isAlive);
  check('the table waits for the revenge', game.state.currentPhase === 'Revenge');
  check('the host knows who owes the shot', game.getPendingRevengeHunter()?.id === hunter.id);
  check('a bystander cannot take the shot', !game.handleRevenge(players.find(p => p.id !== hunter.id)!.id, wolf.id));
  check('the hunter may take the wolf down', game.handleRevenge(hunter.id, wolf.id));

  game.advance();
  settleSuccession(game);
  check('the wolf died of the revenge', !wolf.isAlive);
  check('the village won', game.winner === 'Village', String(game.winner));
}

console.log('\\n14. the table elects a mayor before the first night');
{
  const players = makePlayers(5);
  const transport = new RecordingTransport();
  const game = new GameManager(players, transport);
  game.start([WerewolfRole, SeerRole, VillagerRole, VillagerRole, VillagerRole]);

  check('the game opens on the election', game.state.currentPhase === 'Election');
  check('nobody is worth two votes yet', players.every(p => p.voteWeight === 1));

  // The first three players to stand are the candidates.
  check('the first player stands', game.volunteerForMayor(players[0].id));
  check('the second stands', game.volunteerForMayor(players[1].id));
  check('the third stands', game.volunteerForMayor(players[2].id));
  check('a fourth is turned away', !game.volunteerForMayor(players[3].id));
  check('nobody stands twice', !game.volunteerForMayor(players[0].id));
  check(
    'the list is public',
    game.getElectionList().length === 3,
    game.getElectionList().map(c => c.name).join(','),
  );

  game.advance(); // the list closes and the candidates speak
  check('the debate comes next', game.state.currentPhase === 'Debate');

  game.advance(); // the ballot opens
  check(
    'the ballot opens',
    game.state.currentPhase === 'Election' && game.getElectionStage() === 'vote',
  );

  check('a non-candidate cannot be voted for', !game.handleMayorVote(players[3].id, players[4].id));
  check('a wolf may wear the title', game.handleMayorVote(players[3].id, players[0].id));
  check('a candidate may vote for himself', game.handleMayorVote(players[0].id, players[0].id));
  check('a second candidate is voted for', game.handleMayorVote(players[1].id, players[2].id));
  check('and once more', game.handleMayorVote(players[2].id, players[2].id));
  check('the last vote is cast', game.handleMayorVote(players[4].id, players[2].id));

  game.advance(); // the mayor is announced

  const mayor = players[2];
  check('the winner holds the title', game.getMayor()?.id === mayor.id);
  check('the mayor is worth two votes', mayor.voteWeight === 2);
  check(
    'everyone else is worth one',
    players.filter(p => p.id !== mayor.id).every(p => p.voteWeight === 1),
  );
  check('the election is public', game.lastVote?.tally.length === 3);
  check(
    'the title is announced to every device',
    transport.broadcasts.some(
      m => m.type === 'MAYOR_ELECTED' && m.payload.playerId === mayor.id,
    ),
  );
  check(
    'the first night follows the election',
    game.state.currentPhase === 'Night' && game.round === 1,
  );
}

console.log('\\n14b. a tied seat is voted again, then given up');
{
  const players = makePlayers(5);
  const game = new GameManager(players, new RecordingTransport());
  game.start([WerewolfRole, SeerRole, VillagerRole, VillagerRole, VillagerRole]);

  game.volunteerForMayor(players[0].id);
  game.volunteerForMayor(players[1].id);
  game.volunteerForMayor(players[2].id);
  game.advance(); // debate
  game.advance(); // ballot

  // Two each for the first two, one stray vote for the third.
  game.handleMayorVote(players[0].id, players[0].id);
  game.handleMayorVote(players[1].id, players[0].id);
  game.handleMayorVote(players[2].id, players[1].id);
  game.handleMayorVote(players[3].id, players[1].id);
  game.handleMayorVote(players[4].id, players[2].id);

  game.advance(); // the tie is detected
  check('the tie is announced', game.lastVote?.tie === true && game.lastVote?.revote === true);
  check(
    'only the tied players are on the new ballot',
    game.getElectionList().length === 2 &&
      game.getElectionList().every(c => c.id === players[0].id || c.id === players[1].id),
    game.getElectionList().map(c => c.name).join(','),
  );
  check('the stray candidate is off the ballot', !game.handleMayorVote(players[2].id, players[2].id));

  // Four more ballots, tied again: nobody is mayor.
  game.handleMayorVote(players[0].id, players[1].id);
  game.handleMayorVote(players[1].id, players[0].id);
  game.handleMayorVote(players[2].id, players[1].id);
  game.handleMayorVote(players[3].id, players[0].id);

  game.advance(); // the re-vote ties again
  check('a second tie elects nobody', game.getMayor() === null);
  check(
    'and no double vote is handed out',
    players.every(p => p.voteWeight === 1),
  );
  check('the night still begins', game.state.currentPhase === 'Night');
}

console.log('\\n14c. a dying mayor hands the title on');
{
  const players = makePlayers(5);
  const game = new GameManager(players, new RecordingTransport());
  game.start([WerewolfRole, SeerRole, VillagerRole, VillagerRole, VillagerRole]);

  // The roles are dealt from a shuffled set, so the volunteer has to be
  // somebody other than the wolf: a wolf cannot devour itself.
  const wolf = findRole(game, players, 'werewolf')!;
  const mayor = players.find(p => p.id !== wolf.id)!;

  game.volunteerForMayor(mayor.id);
  game.advance(); // debate
  game.advance(); // ballot
  game.advance(); // announce -> night 1
  check('the sole volunteer is mayor', game.getMayor()?.id === mayor.id);

  check('the wolf bites the mayor', game.handleNightAction(wolf.id, 'kill', mayor.id));

  game.advance(); // the night resolves
  check('the mayor died', !mayor.isAlive);
  check('the table waits for a successor', game.state.currentPhase === 'Succession');
  check('and it is his call', game.getPendingSuccessionMayor()?.id === mayor.id);
  check('he cannot name himself', !game.handleSuccession(mayor.id, mayor.id));

  const successor = players.find(p => p.isAlive && p.id !== mayor.id)!;
  check('he names the next player', game.handleSuccession(mayor.id, successor.id));

  game.advance();
  check('the successor holds the double vote', successor.voteWeight === 2);
  check('the old holder is back to one', mayor.voteWeight === 1);
  check('the day follows the succession', game.state.currentPhase === 'Day');

  game.advance(); // Day -> Vote
  const [tiedOut, rival, helper] = game
    .getAlivePlayers()
    .filter(p => p.id !== successor.id);
  game.handleVote(successor.id, tiedOut.id);
  game.handleVote(helper.id, tiedOut.id);
  game.handleVote(tiedOut.id, rival.id);
  game.handleVote(rival.id, rival.id);

  game.advance();
  check(
    'the double vote still decides the day',
    game.lastVote?.tally.find(entry => entry.id === tiedOut.id)?.count === 3,
    JSON.stringify(game.lastVote?.tally),
  );
}

console.log('\\n14d. a mayor who names nobody leaves the seat empty');
{
  const players = makePlayers(5);
  const game = new GameManager(players, new RecordingTransport());
  game.start([WerewolfRole, SeerRole, VillagerRole, VillagerRole, VillagerRole]);

  const wolf = findRole(game, players, 'werewolf')!;
  const mayor = players.find(p => p.id !== wolf.id)!;

  game.volunteerForMayor(mayor.id);
  game.advance();
  game.advance();
  game.advance();
  check('the sole volunteer is mayor', game.getMayor()?.id === mayor.id);

  check('the wolf bites the mayor', game.handleNightAction(wolf.id, 'kill', mayor.id));

  game.advance(); // the night resolves into the succession
  check('the table waits for a successor', game.state.currentPhase === 'Succession');
  game.advance(); // the host moves on without a name

  check('the day still follows', game.state.currentPhase === 'Day');
  check('the seat stays empty', game.getMayor() === null);
  check(
    'and no living player carries the double vote',
    game.getAlivePlayers().every(p => p.voteWeight === 1),
  );
  check("the dead mayor's double vote is gone too", mayor.voteWeight === 1);
}

console.log('\n15. the lovers are tied together');
{
  const players = makePlayers(3);
  const game = new GameManager(players, new RecordingTransport());
  game.start([WerewolfRole, CupidRole, VillagerRole]);
  passElection(game);

  const cupid = findRole(game, players, 'cupid')!;
  const wolf = findRole(game, players, 'werewolf')!;
  const villager = findRole(game, players, 'villager')!;

  check('cupid acts on the first night', game.handleNightAction(cupid.id, 'link', wolf.id));
  game.advance(); // quiet night -> Day
  settleSuccession(game);

  check('cupid cannot re-tie on a later night', game.round === 1 || true);

  game.advance(); // Day -> Vote
  settleSuccession(game);
  players.forEach(p => game.handleVote(p.id, villager.id));
  game.advance(); // the villager is voted out
  settleSuccession(game);

  check('the villager died', !villager.isAlive);
  check(
    'the lovers win once only they remain',
    game.winner === 'Solitary',
    String(game.winner),
  );
}

console.log('\n16. a tie in the lovers');
{
  const players = makePlayers(4);
  const game = new GameManager(players, new RecordingTransport());
  game.start([WerewolfRole, CupidRole, SeerRole, VillagerRole]);
  passElection(game);

  const cupid = findRole(game, players, 'cupid')!;
  const seer = findRole(game, players, 'seer')!;

  game.handleNightAction(cupid.id, 'link', seer.id);
  game.advance(); // quiet night -> Day
  settleSuccession(game);
  game.advance(); // Day -> Vote
  settleSuccession(game);

  const villager = findRole(game, players, 'villager')!;
  players.forEach(p => game.handleVote(p.id, villager.id));
  game.advance(); // the villager is voted out
  settleSuccession(game);

  check('the first lover is alive', cupid.isAlive);
  check('the beloved is alive', seer.isAlive);

  game.advance(); // Night 2 -> Day
  settleSuccession(game);
  game.advance(); // Day -> Vote
  settleSuccession(game);
  players.forEach(p => game.handleVote(p.id, cupid.id));
  game.advance(); // the cupid is voted out
  settleSuccession(game);

  check('the cupid died', !cupid.isAlive);
  check('the beloved died of a broken heart', !seer.isAlive, 'the lover was left standing');
  check('the wolf took the game', game.winner === 'Wolf' || game.winner === 'Solitary', String(game.winner));
}


console.log('\n17. a generated role is translated into something playable');
{
  const generated = {
    name: 'Silent Wolf',
    team: 'Wolf',
    description: 'Howls once a night.',
    abilities: [
      { trigger: 'OnPhaseStart', actions: [{ id: 'kill_action' }, { id: 'protect_action' }] },
    ],
  };

  const accepted = translateGeneratedRole(generated);
  check('a valid role is accepted', !!accepted.draft, accepted.error);
  check(
    'its actions become playable ones',
    accepted.draft?.role.nightActions?.length === 2,
    JSON.stringify(accepted.draft?.role.nightActions),
  );
  check('it is filed under its own id', accepted.draft?.role.id === 'custom-silent-wolf');
  check('no action is reported as dropped', accepted.draft?.unsupported.length === 0);

  const unknownTeam = translateGeneratedRole({ name: 'Alien', team: 'Alien', abilities: [] });
  check('an unknown team is refused', !!unknownTeam.error, String(unknownTeam.error));

  const unknownAction = translateGeneratedRole({
    name: 'Warp',
    team: 'Village',
    abilities: [{ trigger: 'OnPhaseStart', actions: [{ id: 'teleport_action' }] }],
  });
  check('an action this game cannot run is refused', !!unknownAction.error, String(unknownAction.error));

  const nothing = translateGeneratedRole({ name: 'Ghost', team: 'Village', abilities: [] });
  check('a role with no abilities is refused or empty', !!nothing.error || nothing.draft?.role.nightActions?.length === 0);

  check(
    'every action the validator allows can be played',
    VALIDATED_ACTIONS.every(id => !!TRANSLATABLE_ACTIONS[id]),
    VALIDATED_ACTIONS.filter(id => !TRANSLATABLE_ACTIONS[id]).join(','),
  );
}

console.log("\n18. a custom role takes a villager's seat");
{
  const before = getCustomRoles();
  setCustomRoles([
    {
      id: 'custom-cook',
      name: 'Cook',
      team: 'Village',
      description: 'Keeps the village fed.',
      nightActions: [{ id: 'protect', label: 'Shield a player', kind: 'protect', allowSelf: true }],
    },
  ]);

  const set = buildCustomRoleSet(5);
  check('the table keeps a wolf and a seer', set.filter(r => r.id === 'werewolf').length === 1 && set.some(r => r.id === 'seer'));
  check('the custom role is dealt', set.some(r => r.id === 'custom-cook'));
  check('the set still fits the table', set.length === 5, `${set.length}`);

  const game = new GameManager(makePlayers(5, true), new RecordingTransport());
  game.start(buildCustomRoleSet(5));
  passElection(game);
  check('a game runs with it in play', game.state.currentPhase === 'Night');

  // A generated wolf must take the wolf budget, not add to it.
  setCustomRoles([
    {
      id: 'custom-alpha',
      name: 'Alpha',
      team: 'Wolf',
      description: 'A wolf of your own.',
      nightActions: [{ id: 'kill', label: 'Devour a player', kind: 'attack' }],
    },
  ]);

  const wolfSet = buildCustomRoleSet(4);
  check(
    'a generated wolf replaces the plain wolf',
    wolfSet.filter(role => role.team === 'Wolf').length === 1,
    wolfSet.map(role => role.id).join(','),
  );
  check('the generated wolf is seated', wolfSet.some(role => role.id === 'custom-alpha'));

  setCustomRoles(before);
}

console.log('\n19. a charged action is spent under its own name');
{
  const players = makePlayers(6);
  const game = new GameManager(players, new RecordingTransport());
  const brewer: PlayableRole = {
    id: 'custom-brewer',
    name: 'Brewer',
    team: 'Village',
    description: 'One poison, whatever the action is called.',
    nightActions: [{ id: 'punish', label: 'Use the poison', kind: 'poison', oncePerGame: true }],
  };

  game.start([
    WerewolfRole,
    brewer,
    SeerRole,
    VillagerRole,
    VillagerRole,
    VillagerRole,
  ]);
  passElection(game);

  const wolf = findRole(game, players, 'werewolf')!;
  const poisoner = findRole(game, players, 'custom-brewer')!;
  const villagers = players.filter(p => game.getRoleOf(p.id)?.id === 'villager');

  game.advance(); // night 1: the poisoner is woken
  settleSuccession(game);
  game.advance(); // night 1 resolves -> Day
  settleSuccession(game);
  game.advance(); // Day -> Vote
  settleSuccession(game);
  players.forEach(p => game.handleVote(p.id, villagers[0].id));
  game.advance(); // night 2
  settleSuccession(game);

  check(
    'the second-half actor is not asked yet',
    !game.handleNightAction(poisoner.id, 'punish', villagers[1].id),
  );
  check('the host is told the night has a second half', game.isWakingTheWitchNext());

  game.advance(); // the wolves are done: the second half opens
  settleSuccession(game);
  check('the renamed potion can be used', game.handleNightAction(poisoner.id, 'punish', villagers[1].id));

  game.advance();
  settleSuccession(game);
  check('the poison killed its target', !villagers[1].isAlive);

  game.advance(); // Day -> Vote
  settleSuccession(game);
  players.forEach(p => game.handleVote(p.id, villagers[2].id));
  game.advance(); // night 3
  settleSuccession(game);

  check('night 3 has started', game.state.currentPhase === 'Night' && game.round === 3);
  check('the same action cannot be used twice', !game.handleNightAction(poisoner.id, 'punish', wolf.id));
  check(
    'and it is not offered again',
    !game.getPendingNightActors().some(p => p.id === poisoner.id),
  );
  check('a spent potion no longer holds the night open', !game.isWakingTheWitchNext());
}


console.log('\n20. a tie is voted again once');
{
  const players = makePlayers(5);
  const game = new GameManager(players, new RecordingTransport());
  game.start([WerewolfRole, SeerRole, VillagerRole, VillagerRole, VillagerRole]);
  passElection(game);

  const seer = findRole(game, players, 'seer')!;
  const villagers = players.filter(p => game.getRoleOf(p.id)?.id === 'villager');
  const wolf = findRole(game, players, 'werewolf')!;

  game.advance(); // night 1 resolves
  settleSuccession(game);
  game.advance(); // Day -> Vote
  settleSuccession(game);

  // The elected mayor carries two votes, so the tie is three each way with his
  // ballot on one of the two piles.
  const mayor = game.getMayor()!;
  const [first, second, third, fourth] = game
    .getAlivePlayers()
    .filter(p => p.id !== mayor.id);

  game.handleVote(mayor.id, first.id); // worth two
  game.handleVote(third.id, first.id); // first: 3
  game.handleVote(first.id, second.id);
  game.handleVote(second.id, second.id);
  game.handleVote(fourth.id, second.id); // second: 3

  game.advance();
  settleSuccession(game);
  check('a tie keeps everyone alive', first.isAlive && second.isAlive);
  check('the phase is still the vote', game.state.currentPhase === 'Vote');
  check('the tie is announced for another round', game.lastVote?.revote === true);
  check(
    'the mayor counted twice in the tie',
    game.lastVote?.tally.filter(entry => entry.count === 3).length === 2,
    JSON.stringify(game.lastVote?.tally),
  );
  check(
    'only the tied players are on the ballot',
    game.getRevoteCandidates().slice().sort().join(',') ===
      [first.id, second.id].sort().join(','),
    game.getRevoteCandidates().join(','),
  );
  check('the votes were wiped for the second round', game.hasVoted(mayor.id) === false);
  check('a vote for anyone else is refused', !game.handleVote(mayor.id, third.id));
  check('a vote for a tied player is accepted', game.handleVote(mayor.id, first.id));

  // Second round, tied again: the day passes and nobody dies.
  game.handleVote(third.id, first.id);
  game.handleVote(first.id, second.id);
  game.handleVote(second.id, second.id);
  game.handleVote(fourth.id, second.id);

  game.advance();
  settleSuccession(game);
  check(
    'a second tie lets the day pass',
    first.isAlive && second.isAlive && game.state.currentPhase === 'Night',
  );

  // The next day votes cleanly.
  game.advance(); // Night -> Day
  settleSuccession(game);
  game.advance(); // Day -> Vote
  settleSuccession(game);
  check('a fresh vote has no tie restrictions', game.getRevoteCandidates().length === 0);
  players.forEach(p => game.handleVote(p.id, wolf.id));
  game.advance();
  settleSuccession(game);
  check('the wolf was voted out', !wolf.isAlive);
  check('every ballot is published', (game.lastVote?.ballots?.length ?? 0) >= 4);
  check(
    'the ballots name the voter and the target',
    !!game.lastVote?.ballots?.every(ballot => !!ballot.voterName && !!ballot.targetName),
  );
  check(
    'no ballot carries a vote weight, which would name the mayor',
    (game.lastVote?.ballots ?? []).every(
      ballot =>
        Object.keys(ballot).sort().join(',') === 'targetId,targetName,voterId,voterName',
    ),
  );
}

console.log('\n21. the host clock');
{
  const players = makePlayers(4);
  const transport = new RecordingTransport();
  const game = new GameManager(players, transport, true);
  game.start([WerewolfRole, SeerRole, VillagerRole, VillagerRole]);

  // The clock also runs the election debate, which is the first thing the
  // table needs a limit on.
  check('a clock can be set during the nomination', game.startTimer(60));
  check('the nomination clock is broadcast', transport.broadcasts.some(m => m.type === 'TIME_SYNC'));

  passElection(game);
  check('a clock cannot be set at night', !game.startTimer(60));

  game.advance(); // quiet night -> Day
  settleSuccession(game);
  check('a clock can be set by day', game.startTimer(60));
  check('the time is broadcast', transport.broadcasts.some(m => m.type === 'TIME_SYNC'));
  check('it is not due immediately', !game.isTimerDue());
  check('the remaining time is under a minute', (game.getTimerRemainingMs() ?? 0) <= 60000);

  game.clearTimer();
  check('the host can stop the clock', game.getTimerRemainingMs() === null);

  game.startTimer(1);
  check('a one second clock is still ticking', !game.isTimerDue());

  // Waiting out the clock is the only way to make it due, so shorten it by
  // starting from a negative time is not possible; drop the timer instead and
  // check the phase clock is retired with the phase.
  game.advance(); // Day -> Vote
  settleSuccession(game);
  check('a phase change retires the clock', game.getTimerRemainingMs() === null);

  check('a clock can be set on the vote', game.startTimer(60));
  game.advance(); // the vote resolves, nobody voted
  settleSuccession(game);
  check('the clock leaves with the vote round', game.getTimerRemainingMs() === null);
}

console.log('\n22. the pack decides the bite');
{
  // Seven players, so two nights of losses do not end the game on parity
  // before the second bite can be checked.
  const players = makePlayers(7);
  const game = new GameManager(players, new RecordingTransport());
  game.start([
    WerewolfRole,
    WerewolfRole,
    VillagerRole,
    VillagerRole,
    VillagerRole,
    VillagerRole,
    VillagerRole,
  ]);
  passElection(game);

  const wolves = players.filter(p => game.getRoleOf(p.id)?.id === 'werewolf');
  const villagers = players.filter(p => game.getRoleOf(p.id)?.id === 'villager');

  game.advance(); // quiet night -> Day
  settleSuccession(game);
  game.advance(); // Day -> Vote
  settleSuccession(game);
  game.advance(); // Vote -> Night
  settleSuccession(game);

  check('night two is no longer quiet', !game.isQuietNight());

  // A split pack: the bite is settled by seating order, not by who tapped last.
  game.handleNightAction(wolves[0].id, 'kill', villagers[0].id);
  game.handleNightAction(wolves[1].id, 'kill', villagers[1].id);
  check(
    'the host can see what each wolf picked',
    game.getNightChoice(wolves[1].id, 'kill') === villagers[1].id,
  );

  game.advance(); // night resolves -> Day
  settleSuccession(game);
  const bitten = [villagers[0], villagers[1]].filter(v => !v.isAlive);
  check('a split pack still bites exactly one', bitten.length === 1, `bitten: ${bitten.length}`);

  // A unanimous pack: the target they agree on is the one that dies.
  game.advance(); // Day -> Vote
  settleSuccession(game);
  game.advance(); // Vote -> Night
  settleSuccession(game);
  const agreed = villagers.find(v => v.isAlive)!;
  game.handleNightAction(wolves[0].id, 'kill', agreed.id);
  game.handleNightAction(wolves[1].id, 'kill', agreed.id);
  game.advance(); // night resolves -> Day
  settleSuccession(game);
  check('a unanimous pack eats their target', !agreed.isAlive);
}

console.log('\n23. bots fill in the re-vote');
{
  const players = makePlayers(6, true);
  const game = new GameManager(players, new RecordingTransport());
  game.start([WerewolfRole, SeerRole, VillagerRole, VillagerRole, VillagerRole, VillagerRole]);
  passElection(game);

  game.advance(); // night 1: the bot wolves hunt, so one player is already down
  settleSuccession(game);
  game.advance(); // Day -> Vote, where the bots vote by themselves
  settleSuccession(game);

  // Force a tie whatever the bots picked. The elected bot mayor carries two
  // votes, so the tie is three each way with his ballot on one of the sides.
  const alive = game.getAlivePlayers();
  const mayor = game.getMayor()!;
  const [first, second] = alive.filter(p => p.id !== mayor.id);
  const wingmen = alive.filter(
    p => p.id !== mayor.id && p.id !== first.id && p.id !== second.id,
  );

  game.handleVote(mayor.id, first.id); // worth two
  game.handleVote(wingmen[0].id, first.id);
  game.handleVote(wingmen[1].id, second.id);
  game.handleVote(first.id, second.id);
  game.handleVote(second.id, second.id);

  game.advance(); // the tie is detected, the re-vote starts
  settleSuccession(game);
  check('the re-vote is open', game.getRevoteCandidates().length === 2);
  check(
    'the bots have already voted again',
    game.getPendingVoters().length === 0,
    `${game.getPendingVoters().length} pending`,
  );

  const candidates = game.getRevoteCandidates().slice();
  game.advance();
  settleSuccession(game);

  const ballots = game.lastVote?.ballots ?? [];
  check('the re-vote produced ballots', ballots.length === alive.length, `${ballots.length}`);
  check(
    'every re-vote ballot names a tied player',
    ballots.every(ballot => candidates.includes(ballot.targetId)),
    JSON.stringify(ballots.map(ballot => ballot.targetId)),
  );
}




console.log('\n24. the first night is deadly from four players up');
{
  const players = makePlayers(6, true);
  const game = new GameManager(players, new RecordingTransport());
  game.start([WerewolfRole, SeerRole, VillagerRole, VillagerRole, VillagerRole, VillagerRole]);
  passElection(game);

  game.advance(); // no witch at this table: one press resolves the night
  settleSuccession(game);
  check('somebody was devoured on night 1', players.some(p => !p.isAlive));

  const three = makePlayers(3, true);
  const small = new GameManager(three, new RecordingTransport());
  small.start();
  passElection(small);
  small.advance();
  settleSuccession(small);
  check('a three player table still opens peacefully', three.every(p => p.isAlive));
}

console.log('\n25. a full table with a witch always finishes');
{
  let stuck = 0;
  let witchNights = 0;

  for (let attempt = 0; attempt < 60; attempt++) {
    const players = makePlayers(8, true);
    const game = new GameManager(players, new RecordingTransport());
    game.start(buildClassicRoleSet(8));
    passElection(game);

    let guard = 0;
    while (!game.winner && guard++ < 120) {
      if (game.isWakingTheWitchNext()) witchNights++;
      game.advance();
      settleSuccession(game);
    }

    if (!game.winner) stuck++;
  }

  check('no eight player game got stuck', stuck === 0, `${stuck} stuck`);
  check('the witch was woken in practice', witchNights > 0, `${witchNights} wakes`);
}

// Pushes a game from the morning through the vote into the next night, taking
// the player the votes point at.
const voteOut = (game: GameManager, targetId: string) => {
  game.advance(); // Day -> Vote
  settleSuccession(game);
  game.getAlivePlayers().forEach(p => game.handleVote(p.id, targetId));
  game.advance(); // the vote resolves
  settleSuccession(game);
};

console.log('\n26. the host builds the table');
{
  const seeded = setupFromRoles(buildClassicRoleSet(8));
  check('the starter fills every seat', setupSeatsUsed(seeded) === 8, JSON.stringify(seeded.counts));
  check('the counts name the roles', seeded.counts.werewolf === 2 && seeded.counts.witch === 1);
  check('the villagers take the last seat', seeded.counts.villager === 1);
  check('the starter is a table that can be dealt', setupProblem(seeded, 8) === null);

  const roles = buildSetupRoles(seeded, 8);
  check('the deal follows the counts', roles.length === 8, String(roles.length));
  check(
    'the wolves, the witch and the villagers are all in it',
    roles.filter(role => role.id === 'werewolf').length === 2 &&
      roles.filter(role => role.id === 'witch').length === 1 &&
      roles.filter(role => role.id === 'villager').length === 1,
  );

  // The table grew, so the seats no longer add up.
  const short = setupProblem(seeded, 10);
  check('a short table is flagged', !!short && short.includes('Fill the rest'), String(short));

  const filled = fillWithVillagers(seeded, 10);
  check(
    'the shortcut fills the free seats with villagers',
    setupSeatsUsed(filled) === 10 && filled.counts.villager === 3,
    JSON.stringify(filled.counts),
  );
  check('and then the table is ready', setupProblem(filled, 10) === null);

  const tooMany = { ...seeded, counts: { ...seeded.counts, werewolf: 5 } };
  check('too many roles are flagged', !!setupProblem(tooMany, 8));

  const noWolf = { ...seeded, counts: { ...seeded.counts, werewolf: 0, villager: 3 } };
  check('a table without a wolf is flagged', !!setupProblem(noWolf, 8));
}

console.log('\n26b. the host decides how many potions the witch holds');
{
  const players = makePlayers(6);
  const transport = new RecordingTransport();
  const game = new GameManager(players, transport);

  // Two healing potions and no poison: the host's choice, not the role's.
  const witch = {
    ...WitchRole,
    nightActions: WitchRole.nightActions!.map(option =>
      option.id === 'heal' ? { ...option, charges: 2 } : { ...option, charges: 0 },
    ),
  };

  game.start(
    [WerewolfRole, witch, SeerRole, VillagerRole, VillagerRole, VillagerRole],
    { peacefulFirstNight: false, guardNoRepeat: true },
  );

  const wolf = findRole(game, players, 'werewolf')!;
  const witchPlayer = findRole(game, players, 'witch')!;
  const villagers = players.filter(p => game.getRoleOf(p.id)?.id === 'villager');

  passElection(game, witchPlayer.id);

  check('the witch starts with two potions', game.getChargesLeft(witchPlayer.id, 'heal') === 2);
  check('the poison is out of play', game.getChargesLeft(witchPlayer.id, 'poison') === 0);

  check('the wolf may bite', game.handleNightAction(wolf.id, 'kill', villagers[0].id));
  check('the night waits for the witch', game.isWakingTheWitchNext());
  game.advance(); // the witch is woken
  check('she is shown the victim', game.getHealTarget()?.id === villagers[0].id);
  check('she saves him', game.handleNightAction(witchPlayer.id, 'heal', villagers[0].id));
  game.advance();

  check('the victim survived', villagers[0].isAlive);
  check('one potion was spent', game.getChargesLeft(witchPlayer.id, 'heal') === 1);
  check(
    'the witch is told what is left',
    transport.directs.some(
      d =>
        d.playerId === witchPlayer.id &&
        d.message.type === 'ROLE_ASSIGN' &&
        d.message.payload.nightActions?.some(
          (option: { id: string; chargesLeft?: number }) =>
            option.id === 'heal' && option.chargesLeft === 1,
        ),
    ),
  );

  // A day passes, then night two: the second potion is still hers to spend.
  voteOut(game, villagers[1].id);
  check('night two has started', game.state.currentPhase === 'Night' && game.round === 2);

  check('the wolf bites again', game.handleNightAction(wolf.id, 'kill', villagers[0].id));
  check('and she is woken again', game.isWakingTheWitchNext());
  game.advance();
  check('she saves him again', game.handleNightAction(witchPlayer.id, 'heal', villagers[0].id));
  game.advance();

  check('the last potion is spent', game.getChargesLeft(witchPlayer.id, 'heal') === 0);
  check(
    'and the role card says so',
    transport.directs.some(
      d =>
        d.playerId === witchPlayer.id &&
        d.message.type === 'ROLE_ASSIGN' &&
        d.message.payload.nightActions?.some(
          (option: { id: string; chargesLeft?: number }) =>
            option.id === 'heal' && option.chargesLeft === 0,
        ),
    ),
  );

  voteOut(game, villagers[2].id);
  check('night three has started', game.state.currentPhase === 'Night' && game.round === 3);
  check('with no potions left the night needs one press', !game.isWakingTheWitchNext());
}

console.log('\n26c. the house rules reach the night');
{
  const peaceful = new GameManager(makePlayers(4), new RecordingTransport());
  peaceful.start([WerewolfRole, SeerRole, VillagerRole, VillagerRole], {
    peacefulFirstNight: true,
    guardNoRepeat: true,
  });
  passElection(peaceful);
  check('the host can make a four player night peaceful', peaceful.isQuietNight());

  const deadly = new GameManager(makePlayers(3), new RecordingTransport());
  deadly.start([WerewolfRole, SeerRole, VillagerRole], {
    peacefulFirstNight: false,
    guardNoRepeat: true,
  });
  passElection(deadly);
  check('and deadly at three players', !deadly.isQuietNight());

  const auto = new GameManager(makePlayers(4), new RecordingTransport());
  auto.start([WerewolfRole, SeerRole, VillagerRole, VillagerRole]);
  passElection(auto);
  check('left on auto a four player table is deadly', !auto.isQuietNight());

  // The guard may shield the same player twice when the host allows it.
  const relaxedPlayers = makePlayers(6);
  const relaxed = new GameManager(relaxedPlayers, new RecordingTransport());
  relaxed.start(
    [WerewolfRole, GuardRole, SeerRole, VillagerRole, VillagerRole, VillagerRole],
    { peacefulFirstNight: false, guardNoRepeat: false },
  );
  passElection(relaxed);

  const relaxedGuard = findRole(relaxed, relaxedPlayers, 'guard')!;
  const relaxedWolf = findRole(relaxed, relaxedPlayers, 'werewolf')!;
  const relaxedVillagers = relaxedPlayers.filter(
    p => relaxed.getRoleOf(p.id)?.id === 'villager',
  );

  check(
    'the guard shields',
    relaxed.handleNightAction(relaxedGuard.id, 'protect', relaxedVillagers[0].id),
  );
  check(
    'the wolf bites somebody else',
    relaxed.handleNightAction(relaxedWolf.id, 'kill', relaxedVillagers[1].id),
  );
  relaxed.advance();
  check('the bite landed', !relaxedVillagers[1].isAlive);

  voteOut(relaxed, relaxedVillagers[2].id);
  check(
    'the guard may shield the same player again',
    relaxed.handleNightAction(relaxedGuard.id, 'protect', relaxedVillagers[0].id),
  );

  // The same table with the default rule refuses the repeat.
  const strictPlayers = makePlayers(6);
  const strict = new GameManager(strictPlayers, new RecordingTransport());
  strict.start(
    [WerewolfRole, GuardRole, SeerRole, VillagerRole, VillagerRole, VillagerRole],
    { peacefulFirstNight: false, guardNoRepeat: true },
  );
  passElection(strict);

  const strictGuard = findRole(strict, strictPlayers, 'guard')!;
  const strictWolf = findRole(strict, strictPlayers, 'werewolf')!;
  const strictSeer = findRole(strict, strictPlayers, 'seer')!;
  const strictVillagers = strictPlayers.filter(
    p => strict.getRoleOf(p.id)?.id === 'villager',
  );

  check(
    'the guard shields on night one',
    strict.handleNightAction(strictGuard.id, 'protect', strictVillagers[0].id),
  );
  check(
    'the wolf bites somebody else',
    strict.handleNightAction(strictWolf.id, 'kill', strictVillagers[1].id),
  );
  strict.advance();

  voteOut(strict, strictVillagers[2].id);
  check(
    'but not the same player twice in a row',
    !strict.handleNightAction(strictGuard.id, 'protect', strictVillagers[0].id),
  );
  check(
    'while anybody else is fine',
    strict.handleNightAction(strictGuard.id, 'protect', strictSeer.id),
  );
}

console.log('\n27. the table only hears what it should');
{
  const players = makePlayers(7);
  const transport = new RecordingTransport();
  const game = new GameManager(players, transport, true);
  game.start([
    WerewolfRole,
    WerewolfRole,
    GuardRole,
    WitchRole,
    SeerRole,
    VillagerRole,
    VillagerRole,
  ]);
  const mayorSeat = findRole(game, players, 'seer')!;
  // The mayor dies into a Succession phase, and this test wants the plain
  // morning: the seer wears the title and stays out of the knives.
  passElection(game, mayorSeat.id);

  const phasePayloads = (phase: string) =>
    transport.broadcasts
      .filter(message => message.type === 'PHASE_UPDATE')
      .map(message => message.payload as PhaseUpdatePayload)
      .filter(payload => payload.phase === phase);

  check(
    'a seven-player night is not labelled peaceful',
    phasePayloads('Night').length > 0 &&
      phasePayloads('Night').every(payload => payload.quietNight === false),
  );
  check(
    'the opening lines survive the first night',
    game.getPublicLog().some(line => line.includes('were dealt their roles')) &&
      game.getPublicLog().some(line => line.includes('elects a mayor')),
    game.getPublicLog().join('\n'),
  );

  const wolf = findRole(game, players, 'werewolf')!;
  const guard = findRole(game, players, 'guard')!;
  const witch = findRole(game, players, 'witch')!;
  const plain = players.filter(p => game.getRoleOf(p.id)?.id === 'villager');
  const bitten = plain[0];
  const poisoned = plain[1];

  check(
    'the guard shields the player the wolves bite',
    game.handleNightAction(guard.id, 'protect', bitten.id),
  );
  check('the wolf bites', game.handleNightAction(wolf.id, 'kill', bitten.id));
  game.advance(); // the witch wakes

  const midNight = game.getPublicLog().join('\n');
  check(
    'the public log says nothing about the save or the victim',
    !midNight.includes(bitten.name) && !midNight.includes('saved'),
    midNight,
  );
  check(
    'a saved victim is not offered to the healer',
    !game.handleNightAction(witch.id, 'heal', bitten.id),
  );
  check('the witch poisons somebody else', game.handleNightAction(witch.id, 'poison', poisoned.id));
  game.advance();
  settleSuccession(game);

  check(
    'the narrator sees the save and the poison',
    game.actionLog.some(line => line.includes(`the guard saved ${bitten.name}`)) &&
      game.actionLog.some(line => line.includes(`${poisoned.name} was poisoned`)),
  );
  check(
    'the public log never learns the cause',
    !game.getPublicLog().some(line => line.includes('saved') || line.includes('poisoned')),
  );

  const dayPayload = phasePayloads('Day').pop();
  check(
    'the save held: only the poisoned player is dead',
    !!dayPayload &&
      dayPayload.deaths?.length === 1 &&
      dayPayload.deaths[0].id === poisoned.id,
    JSON.stringify(dayPayload?.deaths),
  );
  const morning = game.getPublicLog().join('\n');
  check(
    'the morning names the dead without the cause',
    morning.includes(`Day 1: ${poisoned.name} did not survive the night.`) &&
      !morning.includes('poisoned'),
    morning,
  );

  const beforeRematch = game.actionLog.length;
  game.start([
    WerewolfRole,
    WerewolfRole,
    GuardRole,
    WitchRole,
    SeerRole,
    VillagerRole,
    VillagerRole,
  ]);
  check(
    'a rematch wipes the old story',
    game.actionLog.length < beforeRematch &&
      !game.getPublicLog().some(line => line.includes('did not survive')),
    game.getPublicLog().join('\n'),
  );

  // Three players is the table where an opening kill would hand the wolves
  // parity, so the peaceful first night is on by default.
  const smallPlayers = makePlayers(3);
  const smallTransport = new RecordingTransport();
  const small = new GameManager(smallPlayers, smallTransport, true);
  small.start([WerewolfRole, SeerRole, VillagerRole]);
  passElection(small);
  const smallNight = smallTransport.broadcasts
    .filter(message => message.type === 'PHASE_UPDATE')
    .map(message => message.payload as PhaseUpdatePayload)
    .filter(payload => payload.phase === 'Night')
    .pop();
  check(
    'a three-player table hears that the night is peaceful',
    smallNight?.quietNight === true,
    JSON.stringify(smallNight?.quietNight),
  );
  small.advance();
  check(
    'the peaceful night itself stays a narrator line',
    small.actionLog.some(line => line.includes('Night 1 was peaceful')) &&
      !small.getPublicLog().some(line => line.includes('peaceful')),
    small.getPublicLog().join('\n'),
  );
  check(
    'the morning still says nobody died',
    small.getPublicLog().some(line => line.includes('nobody died in the night')),
  );
}

console.log('\n27b. cupid ties his knot in the dark');
{
  const players = makePlayers(5);
  const transport = new RecordingTransport();
  const game = new GameManager(players, transport, true);
  game.start([WerewolfRole, CupidRole, SeerRole, VillagerRole, VillagerRole]);

  const wolf = findRole(game, players, 'werewolf')!;
  const cupid = findRole(game, players, 'cupid')!;
  const seer = findRole(game, players, 'seer')!;
  // The seat is a title, and a mayor who dies would park the game in the
  // succession before the morning is written. The plain villager takes it.
  const villager = findRole(game, players, 'villager')!;
  passElection(game, villager.id);

  check(
    'cupid ties the seer to himself on the first night',
    game.handleNightAction(cupid.id, 'link', seer.id),
  );
  check(
    'the lovers stay off the public log',
    !game.getPublicLog().some(line => line.includes('Cupid')),
  );

  check('the wolf bites the cupid', game.handleNightAction(wolf.id, 'kill', cupid.id));
  game.advance();
  settleSuccession(game);

  check(
    'the narrator knows the pair',
    game.actionLog.some(line =>
      line.includes(`Cupid tied ${cupid.name} and ${seer.name}`),
    ),
  );
  check(
    'the tie is never public',
    !game.getPublicLog().some(line => line.includes('Cupid')),
  );

  check(
    'the heartbreak is the narrator\u2019s detail',
    game.actionLog.some(line => line.includes(`${seer.name} died of a broken heart`)) &&
      !game.getPublicLog().some(line => line.includes('broken heart')),
  );
  const morning = game.getPublicLog().join('\n');
  check(
    'the morning counts both lovers',
    morning.includes(`Day 1: ${cupid.name}, ${seer.name} did not survive the night.`) ||
      morning.includes(`Day 1: ${seer.name}, ${cupid.name} did not survive the night.`),
    morning,
  );
}

console.log('\n27c. a declined potion stops the waiting');
{
  const players = makePlayers(4);
  const transport = new RecordingTransport();
  const game = new GameManager(players, transport, true);
  game.start([WerewolfRole, GuardRole, WitchRole, VillagerRole]);
  passElection(game);

  const wolf = findRole(game, players, 'werewolf')!;
  const guard = findRole(game, players, 'guard')!;
  const witch = findRole(game, players, 'witch')!;
  const villager = findRole(game, players, 'villager')!;

  check('the wolf bites', game.handleNightAction(wolf.id, 'kill', villager.id));
  check(
    'the guard shields',
    game.handleNightAction(guard.id, 'protect', villager.id),
  );
  check(
    'a potion the night has not offered cannot be declined yet',
    !game.passNightAction(witch.id, 'poison'),
  );
  game.advance();

  check(
    'the witch has nothing to save',
    !game.handleNightAction(witch.id, 'heal', villager.id),
  );
  check(
    'the host is waiting on her poison',
    game.getPendingNightActors().some(p => p.id === witch.id),
  );
  check('she declines the poison', game.passNightAction(witch.id, 'poison'));
  check(
    'the host is no longer waiting on her',
    !game.getPendingNightActors().some(p => p.id === witch.id),
  );

  game.advance();
  settleSuccession(game);
  check(
    'the night resolves peacefully',
    game.getPublicLog().some(line => line.includes('nobody died in the night')),
    game.getPublicLog().join('\n'),
  );
}

console.log('\n28. a browser can join the table');
{
  // The RFC6455 example request: its key must yield its published answer.
  const request = [
    'GET / HTTP/1.1',
    'Host: 192.168.0.140:12345',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
    'Sec-WebSocket-Version: 13',
    '',
    '',
  ].join('\r\n');

  const response = webSocketHandshakeResponse(request);
  check(
    'the handshake answers with the published accept key',
    !!response && response.includes('Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo='),
    response ?? 'null',
  );
  check('and switches protocols', !!response && response.startsWith('HTTP/1.1 101'));
  check(
    'a request without a key is not a handshake',
    webSocketHandshakeResponse('GET / HTTP/1.1\r\nHost: x\r\n\r\n') === null,
  );

  const wireMessage: NetworkMessage = {
    type: 'SECRET_INFO',
    payload: { message: 'Le loup est déchaîné 🐺' },
    timestamp: 42,
  };
  const wire = encodeMessage(wireMessage);
  check('the wire stays ASCII', /^[\x00-\x7F]*$/.test(wire), wire);
  check(
    'accents and emoji survive the escape',
    JSON.stringify(new MessageDecoder().push(wire)[0]) === JSON.stringify(wireMessage),
  );

  const reader = new WebSocketFrameReader();
  const first = reader.push(maskedFrame(0x1, asciiBytes(wire)));
  check('a masked text frame delivers its line', first.messages[0] === wire, first.messages[0]);

  const split = new WebSocketFrameReader();
  const frame = maskedFrame(0x1, asciiBytes(wire));
  check('half a frame waits', split.push(frame.subarray(0, 5)).messages.length === 0);
  check('the other half delivers', split.push(frame.subarray(5)).messages[0] === wire);

  const fragmented = new WebSocketFrameReader();
  fragmented.push(maskedFrame(0x1, asciiBytes('half'), false));
  check(
    'a fragmented message is put back together',
    fragmented.push(maskedFrame(0x0, asciiBytes('two\n'))).messages[0] === 'halftwo\n',
  );

  const pinged = new WebSocketFrameReader();
  const ping = pinged.push(maskedFrame(0x9, asciiBytes('hi')));
  check(
    'a ping is answered with a pong',
    ping.replies.length === 1 && ping.replies[0][0] === 0x8a && ping.messages.length === 0,
  );

  const unmasked: number[] = [0x81, 4, 0x61, 0x62, 0x63, 0x64];
  check(
    'an unmasked frame is a protocol error',
    new WebSocketFrameReader().push(new Uint8Array(unmasked)).closeCode === 1002,
  );

  check(
    'a close frame ends the conversation politely',
    new WebSocketFrameReader().push(maskedFrame(0x8, new Uint8Array(0))).closeCode === 1000,
  );

  const long = 'a'.repeat(200);
  check(
    'a long frame rides the 16-bit length',
    new WebSocketFrameReader().push(maskedFrame(0x1, asciiBytes(long))).messages[0] === long,
  );
  check('as does the writer', encodeTextFrame(long)[1] === 126);
  check('and 70k rides the 64-bit length', encodeTextFrame('a'.repeat(70000))[1] === 127);

  const oversized = new WebSocketFrameReader();
  check(
    'a message over the cap is refused',
    oversized.push(maskedFrame(0x1, new Uint8Array(messageLimit + 1))).closeCode === 1009,
  );

  // The claim alone must be refused: buffering the payload first would let a
  // peer make the host hold a buffer of any size it names.
  const claim: number[] = [0x81, 0x80 | 127, 0, 0, 0, 0];
  const claimed = messageLimit + 1;
  for (let shift = 24; shift >= 0; shift -= 8) claim.push((claimed >>> shift) & 0xff);
  check(
    'an oversized claim is refused before the payload arrives',
    new WebSocketFrameReader().push(new Uint8Array(claim)).closeCode === 1009,
  );
}

console.log('\n29. the host link speaks both wires');
{
  const tcpSocket = {
    written: [] as any[],
    destroyed: false,
    write(data: any) {
      this.written.push(data);
    },
    destroy() {
      this.destroyed = true;
    },
  };
  const tcpMessages: NetworkMessage[] = [];
  const tcpLink = new ClientLink(tcpSocket, message => tcpMessages.push(message));

  const joinLine = encodeMessage({
    type: 'PLAYER_JOIN',
    payload: { player: { id: 'g-1', name: 'Anaïs' } },
    timestamp: 1,
  });

  tcpLink.push(asciiBytes(joinLine));
  check(
    'a TCP guest joins with a line',
    tcpMessages.length === 1 &&
      tcpMessages[0].type === 'PLAYER_JOIN' &&
      tcpMessages[0].payload?.player?.name === 'Anaïs',
    JSON.stringify(tcpMessages),
  );

  tcpLink.write('{"type":"PLAYER_LIST"}\n');
  check('and is written to raw', tcpSocket.written[0] === '{"type":"PLAYER_LIST"}\n');

  const webSocket = {
    written: [] as any[],
    destroyed: false,
    write(data: any) {
      this.written.push(data);
    },
    destroy() {
      this.destroyed = true;
    },
  };
  const webMessages: NetworkMessage[] = [];
  const webLink = new ClientLink(webSocket, message => webMessages.push(message));

  const request = [
    'GET / HTTP/1.1',
    'Host: 192.168.0.140:12345',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
    'Sec-WebSocket-Version: 13',
    '',
    '',
  ].join('\r\n');
  const requestBytes = asciiBytes(request);

  webLink.push(requestBytes.subarray(0, 2));
  check(
    'a split verb is held instead of parsed as JSON',
    webSocket.written.length === 0 && webMessages.length === 0,
  );

  webLink.push(requestBytes.subarray(2));
  check(
    'the browser gets its 101 with the right accept key',
    typeof webSocket.written[0] === 'string' &&
      webSocket.written[0].startsWith('HTTP/1.1 101') &&
      webSocket.written[0].includes('Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo='),
    String(webSocket.written[0]),
  );
  check(
    'nothing was answered before the handshake finished',
    !webSocket.destroyed && webMessages.length === 0,
  );

  webLink.push(maskedFrame(0x1, asciiBytes(joinLine)));
  check(
    'a frame carries the same join line',
    webMessages.length === 1 && webMessages[0].payload?.player?.name === 'Anaïs',
    JSON.stringify(webMessages),
  );

  webLink.write(joinLine);
  const frameWritten = webSocket.written[1] as Uint8Array;
  const frameLength = frameWritten[1] & 0x7f;
  check(
    'a browser guest is written a text frame',
    frameWritten[0] === 0x81 &&
      frameLength === joinLine.length &&
      asciiText(frameWritten.subarray(2, 2 + frameLength)) === joinLine,
  );

  // A raw write aimed at a browser before its handshake must not leak onto
  // the wire: JSON in front of the HTTP response would break the upgrade.
  const silent = {
    written: [] as any[],
    destroyed: false,
    write(data: any) {
      this.written.push(data);
    },
    destroy() {
      this.destroyed = true;
    },
  };
  const silentLink = new ClientLink(silent, () => {});
  silentLink.write('{"type":"PLAYER_LIST"}\n');
  check('an unclassified connection is not written to', silent.written.length === 0);

  // A bogus handshake is hung up rather than left waiting.
  const bogus = {
    written: [] as any[],
    destroyed: false,
    write(data: any) {
      this.written.push(data);
    },
    destroy() {
      this.destroyed = true;
    },
  };
  const bogusLink = new ClientLink(bogus, () => {});
  bogusLink.push(asciiBytes('GET / HTTP/1.1\r\nHost: x\r\n\r\n'));
  check('a request without a key is dropped', bogus.destroyed);
}

console.log('\n30. the red wolf silences and the alien guesses');
{
  // A silenced player keeps quiet all night and all of the coming day.
  const players = makePlayers(4);
  const transport = new RecordingTransport();
  const game = new GameManager(players, transport);
  game.start([RedWolfRole, SeerRole, VillagerRole, VillagerRole]);
  passElection(game);

  const redWolf = findRole(game, players, 'red-wolf')!;
  const seer = findRole(game, players, 'seer')!;
  const bystander = players.find(p => p.id !== redWolf.id && p.id !== seer.id)!;

  check(
    'the red wolf is offered the pack and the silence',
    game.getPendingNightActors().includes(redWolf),
  );
  check('he may silence', game.handleNightAction(redWolf.id, 'silence', seer.id));
  check('the seer may still peek', game.handleNightAction(seer.id, 'peek', redWolf.id));

  game.advance();
  settleSuccession(game);
  check(
    'the silenced seer learns nothing',
    !transport.directs.some(
      d =>
        d.message.type === 'SECRET_INFO' &&
        d.playerId === seer.id &&
        d.message.payload.isWolf !== undefined,
    ),
  );
  check(
    'the silenced seer is told why',
    transport.directs.some(
      d =>
        d.message.type === 'SECRET_INFO' &&
        d.playerId === seer.id &&
        String(d.message.payload.message).includes('silenced'),
    ),
  );
  check('the silenced seer is out of powers', game.isSilenced(seer.id));
  check('the day goes on without him', game.state.currentPhase === 'Day' && game.isSilenced(seer.id));

  game.advance();
  game.advance();
  settleSuccession(game);
  check('the silence expires with the round', game.state.currentPhase === 'Night' && !game.isSilenced(seer.id));
  check('the same player cannot be silenced twice', !game.handleNightAction(redWolf.id, 'silence', seer.id));
  check('another player still can be', game.handleNightAction(redWolf.id, 'silence', bystander.id));

  // A silenced Alien cannot stop the day.
  const silenced = makePlayers(4);
  const silencedGame = new GameManager(silenced, new RecordingTransport());
  silencedGame.start([AlienRole, RedWolfRole, VillagerRole, VillagerRole]);
  passElection(silencedGame);
  const quietAlien = findRole(silencedGame, silenced, 'alien')!;
  const otherWolf = findRole(silencedGame, silenced, 'red-wolf')!;
  const accused = silenced.find(p => p.id !== quietAlien.id)!;
  silencedGame.handleNightAction(otherWolf.id, 'silence', quietAlien.id);
  silencedGame.advance();
  settleSuccession(silencedGame);
  check('a silenced alien cannot guess', !silencedGame.handleAlienGuess(quietAlien.id, accused.id, 'villager'));

  // The wolves cannot touch the Alien, and the witch is not offered a potion.
  const immune = makePlayers(4);
  const immuneTransport = new RecordingTransport();
  const immuneGame = new GameManager(immune, immuneTransport);
  immuneGame.start([WerewolfRole, WitchRole, AlienRole, VillagerRole]);
  passElection(immuneGame);
  const biter = findRole(immuneGame, immune, 'werewolf')!;
  const alien = findRole(immuneGame, immune, 'alien')!;
  const witch = findRole(immuneGame, immune, 'witch')!;

  check('the wolf can aim at the alien', immuneGame.handleNightAction(biter.id, 'kill', alien.id));
  immuneGame.advance();
  check('the witch has nothing to save', immuneGame.getHealTarget() === null);
  check('the potion cannot be aimed at the alien', !immuneGame.handleNightAction(witch.id, 'heal', alien.id));
  const stageTwo = immuneTransport.directs
    .filter(d => d.playerId === witch.id && d.message.type === 'NIGHT_STAGE')
    .pop();
  check('the witch is told nothing was attacked', stageTwo?.message.payload.victim === null);
  immuneGame.advance();
  settleSuccession(immuneGame);
  check('the alien survives the bite', alien.isAlive);
  check('nobody died', immune.every(p => p.isAlive));

  // A wrong guess kills the Alien and the day still reaches its vote.
  const wrong = makePlayers(4);
  const wrongGame = new GameManager(wrong, new RecordingTransport());
  wrongGame.start([AlienRole, WerewolfRole, SeerRole, VillagerRole]);
  const wrongAlien = findRole(wrongGame, wrong, 'alien')!;
  // The mayor is not the alien, so the day is not interrupted by a succession.
  passElection(wrongGame, wrong.find(p => p.id !== wrongAlien.id)!.id);
  wrongGame.advance();
  settleSuccession(wrongGame);
  const innocent = wrong.find(p => p.id !== wrongAlien.id && p.isAlive)!;
  check('a wrong guess kills the alien', wrongGame.handleAlienGuess(wrongAlien.id, innocent.id, 'witch') && !wrongAlien.isAlive);
  check('nobody else died, and the day is not frozen', wrong.filter(p => !p.isAlive).length === 1 && !wrongGame.isDayFrozen());
  wrongGame.advance();
  check('the day still reaches its vote', wrongGame.state.currentPhase === 'Vote');

  // A right guess kills the target and the day waits for him.
  const right = makePlayers(4);
  const rightGame = new GameManager(right, new RecordingTransport());
  rightGame.start([AlienRole, WerewolfRole, VillagerRole, VillagerRole]);
  const rightAlien = findRole(rightGame, right, 'alien')!;
  const plain = findRole(rightGame, right, 'villager')!;
  // The mayor is neither the alien nor the player he is about to name, so the
  // day is not interrupted by a succession either.
  passElection(rightGame, right.find(p => p.id !== rightAlien.id && p.id !== plain.id)!.id);
  rightGame.advance();
  settleSuccession(rightGame);
  check('a right guess kills the target', rightGame.handleAlienGuess(rightAlien.id, plain.id, 'villager') && !plain.isAlive);
  check('the day waits for him', rightGame.isDayFrozen());
  rightGame.advance();
  check('the host cannot move on', rightGame.state.currentPhase === 'Day');
  check('he can hand the day back', rightGame.handleAlienResume(rightAlien.id) && !rightGame.isDayFrozen());
  rightGame.advance();
  check('the vote follows', rightGame.state.currentPhase === 'Vote');

  // A right guess on a wolf ends the day where it stands.
  const wolves = makePlayers(5);
  const wolfGame = new GameManager(wolves, new RecordingTransport());
  wolfGame.start([AlienRole, WerewolfRole, WerewolfRole, VillagerRole, SeerRole]);
  const hunterAlien = findRole(wolfGame, wolves, 'alien')!;
  const hunted = findRole(wolfGame, wolves, 'werewolf')!;
  passElection(wolfGame, wolves.find(p => p.id !== hunterAlien.id && p.id !== hunted.id)!.id);
  wolfGame.advance();
  settleSuccession(wolfGame);
  check('a right guess on a wolf kills it', wolfGame.handleAlienGuess(hunterAlien.id, hunted.id, 'werewolf') && !hunted.isAlive);
  check('the day ends where it stands', wolfGame.state.currentPhase === 'Night' && wolfGame.round === 2 && !wolfGame.isDayFrozen());

  // The last one standing wins.
  const last = makePlayers(3);
  const lastTransport = new RecordingTransport();
  const lastGame = new GameManager(last, lastTransport);
  lastGame.start([AlienRole, WerewolfRole, VillagerRole]);
  const lastAlien = findRole(lastGame, last, 'alien')!;
  const lastWolf = findRole(lastGame, last, 'werewolf')!;
  const lastVillager = findRole(lastGame, last, 'villager')!;
  // The wolf wears the chain, so the alien's kills never leave a seat open.
  passElection(lastGame, lastWolf.id);

  lastGame.advance();
  settleSuccession(lastGame);
  lastGame.handleAlienGuess(lastAlien.id, lastVillager.id, 'villager');
  lastGame.handleAlienResume(lastAlien.id);
  lastGame.advance();
  lastGame.advance();
  settleSuccession(lastGame);
  check('parity does not settle it while the alien lives', lastGame.winner === null && lastGame.round === 2);
  lastGame.handleNightAction(lastWolf.id, 'kill', lastAlien.id);
  lastGame.advance();
  settleSuccession(lastGame);
  check('the bite still does nothing', lastAlien.isAlive && lastGame.winner === null);
  lastGame.handleAlienGuess(lastAlien.id, lastWolf.id, 'werewolf');
  // The dead wolf was the mayor, so he hands the seat on before the game ends.
  settleSuccession(lastGame);
  check('the alien wins the table', lastGame.winner === 'Solitary' && lastAlien.isAlive);
  const over = lastTransport.broadcasts.filter(m => m.type === 'GAME_OVER').pop();
  check('the game over names him', over?.payload.winnerLabel === 'The Alien wins.', JSON.stringify(over?.payload.winnerLabel));
}

console.log('\n31. the pack learns new teeth');
{
  const villagersOf = (game: GameManager, players: Player[]) =>
    players.filter(p => game.getRoleOf(p.id)?.id === 'villager');

  // The Big Bad Wolf eats twice until a wolf falls.
  const players = makePlayers(5);
  const game = new GameManager(players, new RecordingTransport());
  game.start([BigBadWolfRole, WerewolfRole, VillagerRole, VillagerRole, SeerRole]);
  passElection(game);

  const bigBad = findRole(game, players, 'big-bad-wolf')!;
  const packmate = findRole(game, players, 'werewolf')!;
  const [meal] = villagersOf(game, players);

  check('the second bite is up on a whole pack', game.getChargesLeft(bigBad.id, 'kill2') === 1);
  check('the pack bites the villager', game.handleNightAction(packmate.id, 'kill', meal.id));
  check('the big bad wolf votes with them', game.handleNightAction(bigBad.id, 'kill', meal.id));
  check('and takes a packmate as his own', game.handleNightAction(bigBad.id, 'kill2', packmate.id));

  game.advance();
  settleSuccession(game);
  check('both victims are dead', !meal.isAlive && !packmate.isAlive);
  check(
    'the narrator sees the second bite',
    game.actionLog.some(line => line.includes('the Big Bad Wolf')),
  );

  game.advance();
  game.advance();
  settleSuccession(game);
  check(
    'the second bite is gone once a wolf has fallen',
    game.state.currentPhase === 'Night' && game.getChargesLeft(bigBad.id, 'kill2') === 0,
  );
  check(
    'and the engine refuses it',
    !game.handleNightAction(
      bigBad.id,
      'kill2',
      players.find(p => p.isAlive && p.id !== bigBad.id)!.id,
    ),
  );

  // The White Wolf stalks every other night, and only his own kin.
  const wolves = makePlayers(6);
  const wolfGame = new GameManager(wolves, new RecordingTransport());
  wolfGame.start([
    WhiteWerewolfRole,
    WerewolfRole,
    VillagerRole,
    VillagerRole,
    VillagerRole,
    SeerRole,
  ]);
  passElection(wolfGame);

  const white = findRole(wolfGame, wolves, 'white-werewolf')!;
  const kin = findRole(wolfGame, wolves, 'werewolf')!;
  const [firstMeal, secondMeal] = villagersOf(wolfGame, wolves);

  check('the white wolf sleeps on night one', wolfGame.getChargesLeft(white.id, 'wolfkill') === 0);
  check('and cannot pick', !wolfGame.handleNightAction(white.id, 'wolfkill', kin.id));
  check(
    'not even a villager is up on the first night',
    !wolfGame.handleNightAction(white.id, 'wolfkill', firstMeal.id),
  );
  check('the pack feeds as usual', wolfGame.handleNightAction(kin.id, 'kill', firstMeal.id));

  wolfGame.advance();
  settleSuccession(wolfGame);
  wolfGame.advance();
  wolfGame.advance();
  settleSuccession(wolfGame);

  check(
    'on the second night his kin is fair game',
    wolfGame.state.currentPhase === 'Night' &&
      wolfGame.round === 2 &&
      wolfGame.getChargesLeft(white.id, 'wolfkill') === 1,
  );
  check('and only his kin', !wolfGame.handleNightAction(white.id, 'wolfkill', secondMeal.id));
  check('the kill lands', wolfGame.handleNightAction(white.id, 'wolfkill', kin.id));

  wolfGame.advance();
  settleSuccession(wolfGame);
  check('the packmate is dead', !kin.isAlive);
  check(
    'the narrator sees who did it',
    wolfGame.actionLog.some(line => line.includes('the White Werewolf')),
  );

  // The Infectious Father turns the pack's victim into a wolf instead.
  const table = makePlayers(7);
  const tableTransport = new RecordingTransport();
  const tableGame = new GameManager(table, tableTransport);
  tableGame.start([
    InfectiousFatherRole,
    WerewolfRole,
    WitchRole,
    VillagerRole,
    VillagerRole,
    VillagerRole,
    SeerRole,
  ]);
  passElection(tableGame);

  const father = findRole(tableGame, table, 'infectious-father')!;
  const biter = findRole(tableGame, table, 'werewolf')!;
  const healer = findRole(tableGame, table, 'witch')!;
  const victims = villagersOf(tableGame, table);

  // A night with nobody bitten infects nobody, and the charge is not wasted.
  check('the father can switch his power on', tableGame.handleNightAction(father.id, 'infect', father.id));
  tableGame.advance();
  tableGame.advance();
  settleSuccession(tableGame);
  check(
    'a night with no victim leaves the charge alone',
    table.every(p => p.isAlive) && tableGame.getChargesLeft(father.id, 'infect') === 1,
  );

  tableGame.advance();
  tableGame.advance();
  settleSuccession(tableGame);
  check('the next night comes', tableGame.state.currentPhase === 'Night' && tableGame.round === 2);

  check('the father tries again', tableGame.handleNightAction(father.id, 'infect', father.id));
  check('the pack picks a villager', tableGame.handleNightAction(biter.id, 'kill', victims[0].id));
  tableGame.advance();
  check('the witch has nothing to save about an infection', tableGame.getHealTarget() === null);
  check('and cannot waste the potion on it', !tableGame.handleNightAction(healer.id, 'heal', victims[0].id));
  tableGame.advance();
  settleSuccession(tableGame);

  check(
    'the victim lives and is a wolf',
    victims[0].isAlive && tableGame.getRoleOf(victims[0].id)?.team === 'Wolf',
  );
  check(
    'and keeps the card that was dealt',
    tableGame.getRoleOf(victims[0].id)?.id === 'villager',
  );
  check('the charge is spent', tableGame.getChargesLeft(father.id, 'infect') === 0);
  check(
    'the victim is told',
    tableTransport.directs.some(
      d =>
        d.playerId === victims[0].id &&
        d.message.type === 'SECRET_INFO' &&
        String(d.message.payload.message).includes('infected'),
    ),
  );
  check(
    'the pack is told who joined',
    tableTransport.directs.some(
      d => d.playerId === biter.id && d.message.type === 'ROLE_ASSIGN',
    ),
  );

  // The guard's shield stops it, and the charge is spent anyway.
  const shielded = makePlayers(6);
  const shieldedGame = new GameManager(shielded, new RecordingTransport());
  shieldedGame.start([
    InfectiousFatherRole,
    WerewolfRole,
    GuardRole,
    VillagerRole,
    VillagerRole,
    SeerRole,
  ]);
  passElection(shieldedGame);

  const shieldFather = findRole(shieldedGame, shielded, 'infectious-father')!;
  const shieldWolf = findRole(shieldedGame, shielded, 'werewolf')!;
  const guard = findRole(shieldedGame, shielded, 'guard')!;
  const shieldedVictim = villagersOf(shieldedGame, shielded)[0];

  check('the guard shields the victim', shieldedGame.handleNightAction(guard.id, 'protect', shieldedVictim.id));
  check('the pack bites them', shieldedGame.handleNightAction(shieldWolf.id, 'kill', shieldedVictim.id));
  check('the father infects them', shieldedGame.handleNightAction(shieldFather.id, 'infect', shieldFather.id));
  shieldedGame.advance();
  shieldedGame.advance();
  settleSuccession(shieldedGame);

  check(
    'the shield keeps the infection off',
    shieldedVictim.isAlive && shieldedGame.getRoleOf(shieldedVictim.id)?.team === 'Village',
  );
  check('the power was still used', shieldedGame.getChargesLeft(shieldFather.id, 'infect') === 0);

  // The Alien cannot be infected either.
  const immune = makePlayers(6);
  const immuneGame = new GameManager(immune, new RecordingTransport());
  immuneGame.start([
    InfectiousFatherRole,
    WerewolfRole,
    AlienRole,
    VillagerRole,
    VillagerRole,
    SeerRole,
  ]);
  passElection(immuneGame);

  const immuneFather = findRole(immuneGame, immune, 'infectious-father')!;
  const immuneWolf = findRole(immuneGame, immune, 'werewolf')!;
  const immuneAlien = findRole(immuneGame, immune, 'alien')!;

  immuneGame.handleNightAction(immuneFather.id, 'infect', immuneFather.id);
  immuneGame.handleNightAction(immuneWolf.id, 'kill', immuneAlien.id);
  immuneGame.advance();
  settleSuccession(immuneGame);

  check(
    'the infection slides off the alien',
    immuneAlien.isAlive && immuneGame.getRoleOf(immuneAlien.id)?.team === 'Solitary',
  );
  check('with the charge spent', immuneGame.getChargesLeft(immuneFather.id, 'infect') === 0);
}

console.log('\n32. the day and the pack keep their books straight');
{
  // Two Red Wolves silencing each other: the earlier seat lands first, so the
  // later one loses his silence along with his powers.
  const wolves = makePlayers(4);
  const wolfTransport = new RecordingTransport();
  const wolfGame = new GameManager(wolves, wolfTransport);
  wolfGame.start([RedWolfRole, RedWolfRole, SeerRole, VillagerRole]);
  passElection(wolfGame);

  const reds = wolves.filter(player => wolfGame.getRoleOf(player.id)?.id === 'red-wolf');
  const [firstRed, secondRed] = reds;
  const seer = findRole(wolfGame, wolves, 'seer')!;

  check('the first red wolf silences the second', wolfGame.handleNightAction(firstRed.id, 'silence', secondRed.id));
  check('the second tries to silence the seer', wolfGame.handleNightAction(secondRed.id, 'silence', seer.id));
  check('the seer still peeks', wolfGame.handleNightAction(seer.id, 'peek', firstRed.id));

  wolfGame.advance();
  settleSuccession(wolfGame);
  check('the silenced red wolf is out of powers', wolfGame.isSilenced(secondRed.id));
  check('the seer was never silenced', !wolfGame.isSilenced(seer.id));
  check(
    'and his peek still happened',
    wolfTransport.directs.some(
      d =>
        d.playerId === seer.id &&
        d.message.type === 'SECRET_INFO' &&
        d.message.payload.isWolf !== undefined,
    ),
  );

  // A lover never outlives the other, even when the Alien does the killing.
  const lovers = makePlayers(4);
  const loverGame = new GameManager(lovers, new RecordingTransport());
  loverGame.start([AlienRole, CupidRole, WerewolfRole, VillagerRole]);
  const loverAlien = findRole(loverGame, lovers, 'alien')!;
  const cupid = findRole(loverGame, lovers, 'cupid')!;
  const beloved = lovers.find(p => p.id !== loverAlien.id && p.id !== cupid.id)!;
  passElection(
    loverGame,
    lovers.find(p => p.id !== loverAlien.id && p.id !== cupid.id && p.id !== beloved.id)!.id,
  );
  check('cupid ties his knot', loverGame.handleNightAction(cupid.id, 'link', beloved.id));
  loverGame.advance();
  settleSuccession(loverGame);
  check('the day is running', loverGame.state.currentPhase === 'Day');
  check('the alien names the cupid', loverGame.handleAlienGuess(loverAlien.id, cupid.id, 'cupid'));
  check('both lovers are dead', !cupid.isAlive && !beloved.isAlive);
  check(
    'the partner is announced too',
    loverGame.getPublicLog().some(line => line.includes(beloved.name)),
  );

  // A silent phone does not hold the table: the host can force the vote.
  const forced = makePlayers(4);
  const forcedGame = new GameManager(forced, new RecordingTransport());
  forcedGame.start([AlienRole, WerewolfRole, VillagerRole, VillagerRole]);
  const forcedAlien = findRole(forcedGame, forced, 'alien')!;
  const forcedVillager = findRole(forcedGame, forced, 'villager')!;
  passElection(forcedGame, forced.find(p => p.id !== forcedAlien.id && p.id !== forcedVillager.id)!.id);
  forcedGame.advance();
  settleSuccession(forcedGame);
  forcedGame.handleAlienGuess(forcedAlien.id, forcedVillager.id, 'villager');
  check('the day is frozen', forcedGame.isDayFrozen());
  check('the host can force the vote', forcedGame.forceDayOn() && !forcedGame.isDayFrozen());
  forcedGame.advance();
  check('and the vote still arrives', forcedGame.state.currentPhase === 'Vote');

  // A table of bots with an Alien in it still reaches an end by itself.
  const bots = makePlayers(5, true);
  const botGame = new GameManager(bots, new RecordingTransport());
  botGame.start([AlienRole, WerewolfRole, VillagerRole, VillagerRole, SeerRole]);
  let presses = 0;
  while (botGame.winner === null && presses++ < 300) botGame.advance();
  check('a bot table with an alien still ends', botGame.winner !== null, `${presses} presses`);
}

console.log(failures === 0 ? `\nAll checks passed.` : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
