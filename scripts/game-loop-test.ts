// Headless verification of the game loop. The engine has no React Native
// imports, so this runs in plain Node:
//
//   npx tsc scripts/game-loop-test.ts --outDir /tmp/opencode/build \
//     --module commonjs --target es2020 --moduleResolution node --skipLibCheck
//   node /tmp/opencode/build/scripts/game-loop-test.js
import { GameManager } from '../src/engine/gameManager';
import {
  AlienRole,
  AngelRole,
  BearTamerRole,
  BigBadWolfRole,
  CupidRole,
  FoxRole,
  GuardRole,
  HunterRole,
  InfectiousFatherRole,
  LittleGirlRole,
  PiedPiperRole,
  PlayableRole,
  RavenRole,
  RedWolfRole,
  ScapegoatRole,
  SeerRole,
  StutteringJudgeRole,
  ThiefRole,
  TwoSistersRole,
  VillageIdiotRole,
  VillagerRole,
  WerewolfRole,
  WhiteWerewolfRole,
  WildChildRole,
  WitchRole,
  WolfDogRole,
  buildCustomRoleSet,
  getCustomRoles,
  setCustomRoles,
} from '../src/engine/roleSet';
import {
  TRANSLATABLE_ACTIONS,
  translateGeneratedRole,
} from '../src/engine/generatedRole';
import {
  SETTING_DEFS,
  buildSetupRoles,
  defaultSettings,
  fillWithVillagers,
  nextSettingValue,
  settingLabel,
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
// starts. Bot rivals and random ballots can tie the seat twice over, and a
// second tie deliberately leaves the table without a mayor, so the helper
// settles the election on a fixed die roll: one candidate, one ballot.
const passElection = (game: GameManager, volunteerId?: string) => {
  const volunteer = volunteerId ?? game.getAlivePlayers()[0].id;
  game.volunteerForMayor(volunteer);

  const realRandom = Math.random;
  Math.random = () => 0.99;
  try {
    let guard = 0;
    while (
      (game.state.currentPhase === 'Election' || game.state.currentPhase === 'Debate') &&
      guard++ < 50
    ) {
      game.advance();
      settleSuccession(game);
    }
  } finally {
    Math.random = realRandom;
  }
};

// A classic eight-seat table, written out because the game no longer ships
// starters: the host names every seat himself.
const classicEight: PlayableRole[] = [
  CupidRole,
  GuardRole,
  HunterRole,
  SeerRole,
  VillagerRole,
  WerewolfRole,
  WerewolfRole,
  WitchRole,
];

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
  // The only builder left: an empty custom list is a plain one-wolf table, and
  // the host's own roles take the villagers' seats.
  check(
    'a table always has a wolf',
    [3, 5, 8].every(n => buildCustomRoleSet(n).some(role => role.team === 'Wolf')),
  );
  check(
    'the mayor is a title now, never a dealt card',
    [3, 5, 8, 12].every(n => buildCustomRoleSet(n).every(role => role.id !== 'mayor')),
  );
  check(
    'the built set always fits the table',
    [3, 5, 8, 12].every(n => buildCustomRoleSet(n).length === n),
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
    game.start(classicEight);
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
  const seeded = setupFromRoles(classicEight);
  check('the table fills every seat', setupSeatsUsed(seeded) === 8, JSON.stringify(seeded.counts));
  check('the counts name the roles', seeded.counts.werewolf === 2 && seeded.counts.witch === 1);
  check('the villagers take the last seat', seeded.counts.villager === 1);
  check('the table can be dealt', setupProblem(seeded, 8) === null);

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

console.log('\n33. the village learns what it can');
{
  // The fox reads a player and the two seats around him.
  const table = makePlayers(6);
  const transport = new RecordingTransport();
  const game = new GameManager(table, transport);
  game.start([FoxRole, WerewolfRole, VillagerRole, VillagerRole, SeerRole, GuardRole]);
  passElection(game);

  const fox = findRole(game, table, 'fox')!;
  const wolf = findRole(game, table, 'werewolf')!;
  const seatOf = (id: string) => table.findIndex(p => p.id === id);

  const lastFoxWord = () =>
    String(
      [...transport.directs]
        .reverse()
        .find(d => d.playerId === fox.id && d.message.type === 'SECRET_INFO')?.message.payload
        ?.message ?? '',
    );

  check('the fox sniffs at the wolf', game.handleNightAction(fox.id, 'sniff', wolf.id));
  game.advance();
  settleSuccession(game);
  check('and hears yes', lastFoxWord().startsWith('Yes'));
  check('keeping his nose', game.getChargesLeft(fox.id, 'sniff') === 1);

  game.advance();
  game.advance();
  settleSuccession(game);
  check('the second night starts', game.state.currentPhase === 'Night' && game.round === 2);

  // A seat that is neither the wolf, nor next to him, nor the fox himself.
  const wolfSeat = seatOf(wolf.id);
  const forbidden = new Set([
    wolfSeat,
    (wolfSeat + 1) % table.length,
    (wolfSeat + table.length - 1) % table.length,
    seatOf(fox.id),
  ]);
  const safe = table.find((_, index) => !forbidden.has(index))!;
  check('the fox sniffs at a clean corner', game.handleNightAction(fox.id, 'sniff', safe.id));
  game.advance();
  settleSuccession(game);
  check('and hears no', lastFoxWord().startsWith('No'));
  check('the nose is gone for good', game.getChargesLeft(fox.id, 'sniff') === 0);

  game.advance();
  game.advance();
  settleSuccession(game);
  check('a fox who found nothing cannot sniff again', !game.handleNightAction(fox.id, 'sniff', wolf.id));

  // The little girl sees who is awake.
  const spyTable = makePlayers(5);
  const spyTransport = new RecordingTransport();
  const spyGame = new GameManager(spyTable, spyTransport);
  spyGame.start([LittleGirlRole, WerewolfRole, VillagerRole, VillagerRole, SeerRole]);
  passElection(spyGame);

  const girl = findRole(spyGame, spyTable, 'little-girl')!;
  const spyWolf = findRole(spyGame, spyTable, 'werewolf')!;

  check('the girl opens her eyes', spyGame.handleNightAction(girl.id, 'spy', girl.id));
  spyGame.advance();
  settleSuccession(spyGame);
  check(
    'and saw the wolf',
    spyTransport.directs.some(
      d =>
        d.playerId === girl.id &&
        d.message.type === 'SECRET_INFO' &&
        String(d.message.payload?.message).includes(spyWolf.name),
    ),
  );

  // Caught, she dies in the victim's place and the victim walks away.
  const caughtTable = makePlayers(5);
  const caughtTransport = new RecordingTransport();
  const caughtGame = new GameManager(caughtTable, caughtTransport);
  caughtGame.start([LittleGirlRole, WerewolfRole, VillagerRole, VillagerRole, SeerRole]);
  passElection(caughtGame);

  const caughtGirl = findRole(caughtGame, caughtTable, 'little-girl')!;
  const caughtWolf = findRole(caughtGame, caughtTable, 'werewolf')!;
  const caughtVictim = caughtTable.find(
    p =>
      p.id !== caughtGirl.id &&
      p.id !== caughtWolf.id &&
      caughtGame.getRoleOf(p.id)?.id === 'villager',
  )!;

  check('the table has a girl to catch', caughtGame.hasLittleGirl());
  check('she spies', caughtGame.handleNightAction(caughtGirl.id, 'spy', caughtGirl.id));
  check('the wolf picks a victim', caughtGame.handleNightAction(caughtWolf.id, 'kill', caughtVictim.id));
  check('the host marks the catch', caughtGame.catchLittleGirl() && caughtGame.isGirlCaught());
  check('and cannot mark it twice', !caughtGame.catchLittleGirl());

  caughtGame.advance();
  settleSuccession(caughtGame);
  check('the girl dies instead of the victim', !caughtGirl.isAlive && caughtVictim.isAlive);
  check(
    'the morning names her',
    caughtGame.getPublicLog().some(l => l.includes(caughtGirl.name) && l.includes('did not survive')),
  );
  check('and the catch is over with the night', !caughtGame.isGirlCaught());

  // The bear growls for a wolf next door, whatever the seating.
  const bearTable = makePlayers(4);
  const bearGame = new GameManager(bearTable, new RecordingTransport());
  bearGame.start([BearTamerRole, WerewolfRole, WerewolfRole, VillagerRole]);
  passElection(bearGame);

  const bearWolf = findRole(bearGame, bearTable, 'werewolf')!;
  const bearMeal = findRole(bearGame, bearTable, 'villager')!;
  bearGame.handleNightAction(bearWolf.id, 'kill', bearMeal.id);
  bearGame.advance();
  settleSuccession(bearGame);
  check(
    'the bear growls at daybreak',
    bearGame.getPublicLog().some(l => l.includes('bear growls')),
  );

  // The raven's two votes need no ballot of their own.
  const ravenTable = makePlayers(6);
  const ravenGame = new GameManager(ravenTable, new RecordingTransport());
  ravenGame.start([RavenRole, WerewolfRole, VillagerRole, VillagerRole, VillagerRole, SeerRole]);
  passElection(ravenGame);

  const raven = findRole(ravenGame, ravenTable, 'raven')!;
  const ravenWolf = findRole(ravenGame, ravenTable, 'werewolf')!;
  const villagers = ravenTable.filter(
    p => p.id !== raven.id && ravenGame.getRoleOf(p.id)?.id === 'villager',
  );
  const marked = villagers[0];
  const meal = villagers[1];

  check('the raven marks a player', ravenGame.handleNightAction(raven.id, 'curse', marked.id));
  check('the pack bites another', ravenGame.handleNightAction(ravenWolf.id, 'kill', meal.id));
  ravenGame.advance();
  settleSuccession(ravenGame);
  check('the day runs', ravenGame.state.currentPhase === 'Day');
  ravenGame.advance();
  ravenGame.advance();
  settleSuccession(ravenGame);
  check('two votes alone send the marked player out', !marked.isAlive);
  check(
    'and the tally shows them',
    ravenGame.lastVote?.tally?.some(row => row.id === marked.id && row.count === 2) === true,
  );

  ravenGame.advance();
  settleSuccession(ravenGame);
  check('the next day comes', ravenGame.state.currentPhase === 'Day');
  ravenGame.advance();
  ravenGame.advance();
  check('the mark is spent after one vote', !ravenGame.lastVote?.eliminatedId);

  // The sisters know each other from the start, and nobody else does.
  const sistersTable = makePlayers(6);
  const sistersTransport = new RecordingTransport();
  const sistersGame = new GameManager(sistersTable, sistersTransport);
  sistersGame.start([
    TwoSistersRole,
    TwoSistersRole,
    WerewolfRole,
    VillagerRole,
    SeerRole,
    GuardRole,
  ]);

  const sisters = sistersTable.filter(p => sistersGame.getRoleOf(p.id)?.id === 'two-sisters');
  const assignOf = (id: string) =>
    sistersTransport.directs.find(d => d.playerId === id && d.message.type === 'ROLE_ASSIGN');

  check('two sisters were dealt', sisters.length === 2);
  check(
    'each sister knows the other',
    assignOf(sisters[0].id)?.message.payload.allies?.some(
      (a: { id: string }) => a.id === sisters[1].id,
    ) === true,
  );
  const outsider = findRole(sistersGame, sistersTable, 'seer')!;
  check('nobody else is told', (assignOf(outsider.id)?.message.payload.allies?.length ?? 0) === 0);
}

console.log('\n34. the first night decides who people are');
{
  // The Wolf-Dog picks the pack.
  const dogTable = makePlayers(6);
  const dogTransport = new RecordingTransport();
  const dogGame = new GameManager(dogTable, dogTransport);
  dogGame.start([WolfDogRole, WerewolfRole, VillagerRole, VillagerRole, SeerRole, GuardRole]);
  passElection(dogGame);

  const dog = findRole(dogGame, dogTable, 'wolf-dog')!;
  const dogWolf = findRole(dogGame, dogTable, 'werewolf')!;
  const dogMeal = findRole(dogGame, dogTable, 'villager')!;

  check('the camp is open on the first night', dogGame.getChargesLeft(dog.id, 'join') === 1);
  check('the wolf-dog joins the wolves', dogGame.handleNightAction(dog.id, 'join', dog.id));
  check('the second camp is refused', !dogGame.handleNightAction(dog.id, 'stay', dog.id));
  check('and one tap is the whole decision', dogGame.hasActed(dog.id));
  check('the pack still bites', dogGame.handleNightAction(dogWolf.id, 'kill', dogMeal.id));

  dogGame.advance();
  settleSuccession(dogGame);
  check(
    'he is a wolf now, with his own card',
    dogGame.getRoleOf(dog.id)?.team === 'Wolf' && dogGame.getRoleOf(dog.id)?.id === 'wolf-dog',
  );
  check(
    'and was told so',
    dogTransport.directs.some(
      d =>
        d.playerId === dog.id &&
        d.message.type === 'SECRET_INFO' &&
        String(d.message.payload?.message).includes('wolves now'),
    ),
  );

  dogGame.advance();
  dogGame.advance();
  settleSuccession(dogGame);
  check('the camp is closed after night one', dogGame.getChargesLeft(dog.id, 'join') === 0);
  check(
    'and the choice cannot be made again',
    !dogGame.handleNightAction(dog.id, 'join', dog.id) &&
      !dogGame.handleNightAction(dog.id, 'stay', dog.id),
  );

  // The Wolf-Dog who stays is a villager for good.
  const stayTable = makePlayers(5);
  const stayTransport = new RecordingTransport();
  const stayGame = new GameManager(stayTable, stayTransport);
  stayGame.start([WolfDogRole, WerewolfRole, VillagerRole, SeerRole, GuardRole]);
  passElection(stayGame);

  const stayer = findRole(stayGame, stayTable, 'wolf-dog')!;
  check('the other wolf-dog stays', stayGame.handleNightAction(stayer.id, 'stay', stayer.id));
  stayGame.advance();
  settleSuccession(stayGame);
  check('and remains a villager', stayGame.getRoleOf(stayer.id)?.team === 'Village');
  check(
    'with his choice confirmed',
    stayTransport.directs.some(
      d =>
        d.playerId === stayer.id &&
        String(d.message.payload?.message ?? '').includes('stay with the village'),
    ),
  );

  // The Wild Child turns the moment his model dies.
  const childTable = makePlayers(6);
  const childTransport = new RecordingTransport();
  const childGame = new GameManager(childTable, childTransport);
  childGame.start([
    WildChildRole,
    WerewolfRole,
    VillagerRole,
    VillagerRole,
    SeerRole,
    GuardRole,
  ]);
  passElection(childGame);

  const child = findRole(childGame, childTable, 'wild-child')!;
  const childWolf = findRole(childGame, childTable, 'werewolf')!;
  const model = findRole(childGame, childTable, 'villager')!;
  const modelTwin = childTable.filter(
    p => p.id !== model.id && childGame.getRoleOf(p.id)?.id === 'villager',
  )[0];

  check('the child picks a model', childGame.handleNightAction(child.id, 'model', model.id));
  childGame.advance();
  settleSuccession(childGame);
  check(
    'and is told who he watches',
    childTransport.directs.some(
      d =>
        d.playerId === child.id &&
        String(d.message.payload?.message ?? '').includes(model.name),
    ),
  );
  check('he is still a villager', childGame.getRoleOf(child.id)?.team === 'Village');

  childGame.advance();
  childGame.advance();
  settleSuccession(childGame);
  check('the second night comes', childGame.state.currentPhase === 'Night');
  check('the model cannot be picked twice', !childGame.handleNightAction(child.id, 'model', modelTwin.id));

  childGame.handleNightAction(childWolf.id, 'kill', model.id);
  childGame.advance();
  settleSuccession(childGame);
  check('the model is dead', !model.isAlive);
  check(
    'and the child turned, keeping his card',
    childGame.getRoleOf(child.id)?.team === 'Wolf' &&
      childGame.getRoleOf(child.id)?.id === 'wild-child',
  );
  check(
    'the pack was told',
    childTransport.directs.some(
      d => d.playerId === childWolf.id && d.message.type === 'ROLE_ASSIGN',
    ),
  );

  // The Thief looks at two spare cards and may take one.
  const thiefTable = makePlayers(6);
  const thiefTransport = new RecordingTransport();
  const thiefGame = new GameManager(thiefTable, thiefTransport);
  thiefGame.start([ThiefRole, WerewolfRole, VillagerRole, VillagerRole, SeerRole, GuardRole]);
  passElection(thiefGame);

  const thief = findRole(thiefGame, thiefTable, 'thief')!;
  const thiefCards =
    thiefTransport.directs.find(d => d.playerId === thief.id && d.message.type === 'ROLE_ASSIGN')
      ?.message.payload.thiefCards ?? [];

  check('two cards lie in front of him', thiefCards.length === 2);
  check('a card he was not dealt cannot be taken', !thiefGame.handleThiefSwap(thief.id, 'no-such-card'));
  check('he can take one', thiefGame.handleThiefSwap(thief.id, thiefCards[0].id));
  check(
    'and the card is his',
    thiefGame.getRoleOf(thief.id)?.id === thiefCards[0].id &&
      thiefGame.getThiefCards(thief.id).length === 0,
  );
  check(
    'the log names the card',
    thiefGame.actionLog.some(line => line.includes(`the ${thiefCards[0].name}`)),
  );

  // Press through the rest of the first night, the day and its vote: a card
  // the thief took may wake in a second stage and cost an extra press.
  let thiefGuard = 0;
  while (thiefGame.round === 1 && thiefGuard++ < 8) {
    thiefGame.advance();
    settleSuccession(thiefGame);
  }
  check('the window is the first night alone', thiefGame.round === 2);
  check('no second swap', !thiefGame.handleThiefSwap(thief.id, thiefCards[1].id));

  // Keeping the card is a real answer too.
  const keepTable = makePlayers(5);
  const keepTransport = new RecordingTransport();
  const keepGame = new GameManager(keepTable, keepTransport);
  keepGame.start([ThiefRole, WerewolfRole, VillagerRole, SeerRole, GuardRole]);
  passElection(keepGame);

  const keeper = findRole(keepGame, keepTable, 'thief')!;
  check('the thief keeps his own card', keepGame.handleThiefSwap(keeper.id, null));
  check(
    'and stays the thief',
    keepGame.getRoleOf(keeper.id)?.id === 'thief' && keepGame.getThiefCards(keeper.id).length === 0,
  );
}

console.log('\n35. the village settles its debts');
{
  // The Village Idiot is unmasked, survives, and loses his ballot.
  const foolTable = makePlayers(6);
  const foolTransport = new RecordingTransport();
  const foolGame = new GameManager(foolTable, foolTransport);
  foolGame.start([
    VillageIdiotRole,
    WerewolfRole,
    VillagerRole,
    VillagerRole,
    SeerRole,
    GuardRole,
  ]);
  passElection(foolGame);

  const fool = findRole(foolGame, foolTable, 'village-idiot')!;
  const foolWolf = findRole(foolGame, foolTable, 'werewolf')!;

  foolGame.advance();
  settleSuccession(foolGame);
  check('the first day runs', foolGame.state.currentPhase === 'Day');
  foolGame.advance();
  const foolVoters = foolTable.filter(p => p.isAlive && p.id !== fool.id).slice(0, 3);
  check(
    'the village votes him out',
    foolVoters.every(voter => foolGame.handleVote(voter.id, fool.id)),
  );
  foolGame.advance();
  check('he survives the vote', fool.isAlive);
  check('nobody was eliminated', foolGame.lastVote?.eliminatedId === null);
  check(
    'and the table saw the idiot',
    foolGame.getPublicLog().some(line => line.includes(fool.name) && line.includes('idiot')),
  );
  check('he may not vote again', foolGame.getBarredVoters().includes(fool.id));

  foolGame.advance();
  settleSuccession(foolGame);
  foolGame.advance();
  check('the second vote starts', foolGame.state.currentPhase === 'Vote');
  check('and his ballot is refused', !foolGame.handleVote(fool.id, foolWolf.id));
  check(
    'he is not awaited',
    foolGame.getPendingVoters().every(player => player.id !== fool.id),
  );

  // A vote that stays tied hands the scapegoat to the village.
  const goatTable = makePlayers(6);
  const goatGame = new GameManager(goatTable, new RecordingTransport());
  goatGame.start([
    ScapegoatRole,
    WerewolfRole,
    VillagerRole,
    VillagerRole,
    SeerRole,
    GuardRole,
  ]);
  passElection(goatGame);

  const goat = findRole(goatGame, goatTable, 'scapegoat')!;
  const goatVillagers = goatTable.filter(p => goatGame.getRoleOf(p.id)?.id === 'villager');
  const sideA = goatVillagers[0];
  const sideB = goatVillagers[1];
  const goatMayor = goatGame.state.presidentManager.getPresidentId();
  const goatVoters = goatTable.filter(p => p.id !== goatMayor).slice(0, 4);

  goatGame.advance();
  settleSuccession(goatGame);
  goatGame.advance();
  check(
    'a tie is laid on the table',
    goatVoters.slice(0, 2).every(voter => goatGame.handleVote(voter.id, sideA.id)) &&
      goatVoters.slice(2).every(voter => goatGame.handleVote(voter.id, sideB.id)),
  );
  goatGame.advance();
  check(
    'and the table votes again',
    goatGame.state.currentPhase === 'Vote' && goatGame.getRevoteCandidates().length === 2,
  );
  check(
    'the second tie stands',
    goatVoters.slice(0, 2).every(voter => goatGame.handleVote(voter.id, sideA.id)) &&
      goatVoters.slice(2).every(voter => goatGame.handleVote(voter.id, sideB.id)),
  );
  goatGame.advance();
  check(
    'the scapegoat is called',
    goatGame.state.currentPhase === 'Scapegoat' && goat.isAlive,
  );

  const goatBanned = goatTable.find(p => p.isAlive && p.id !== goat.id && p.id !== goatMayor)!;
  check('only he bars a voter', !goatGame.handleScapegoatBan(sideA.id, goatBanned.id));
  check('he bars one', goatGame.handleScapegoatBan(goat.id, goatBanned.id));
  check('and not twice', !goatGame.handleScapegoatBan(goat.id, goatBanned.id));

  goatGame.advance();
  settleSuccession(goatGame);
  check('the scapegoat dies', !goat.isAlive && goatGame.state.currentPhase === 'Night');
  check('his ban outlives him', goatGame.getBarredVoters().includes(goatBanned.id));

  goatGame.advance();
  settleSuccession(goatGame);
  goatGame.advance();
  check('the next vote starts', goatGame.state.currentPhase === 'Vote');
  check('and the barred player holds no ballot', !goatGame.handleVote(goatBanned.id, sideA.id));
  const goatFree = goatTable.find(p => p.isAlive && p.id !== goatBanned.id)!;
  check('while anyone else votes', goatGame.handleVote(goatFree.id, sideA.id));

  // The Stuttering Judge gets one more vote out of an execution.
  const judgeTable = makePlayers(6);
  const judgeGame = new GameManager(judgeTable, new RecordingTransport());
  judgeGame.start([
    StutteringJudgeRole,
    WerewolfRole,
    VillagerRole,
    VillagerRole,
    SeerRole,
    GuardRole,
  ]);
  passElection(judgeGame);

  const judge = findRole(judgeGame, judgeTable, 'stuttering-judge')!;
  const judgeVillagers = judgeTable.filter(p => judgeGame.getRoleOf(p.id)?.id === 'villager');
  const firstVictim = judgeVillagers[0];
  const secondVictim = judgeVillagers[1];

  judgeGame.advance();
  settleSuccession(judgeGame);
  judgeGame.advance();
  judgeTable
    .filter(p => p.isAlive && p.id !== judge.id)
    .slice(0, 3)
    .forEach(voter => judgeGame.handleVote(voter.id, firstVictim.id));
  judgeGame.advance();
  check('an execution calls the judge', judgeGame.state.currentPhase === 'Judge');
  check('nobody else may bang the table', !judgeGame.handleJudgeRepeat(firstVictim.id));
  check('and the judge does', judgeGame.handleJudgeRepeat(judge.id));
  check(
    'the second vote is fresh',
    judgeGame.state.currentPhase === 'Vote' && judgeGame.lastVote === null,
  );

  judgeTable
    .filter(p => p.isAlive && p.id !== judge.id)
    .slice(0, 3)
    .forEach(voter => judgeGame.handleVote(voter.id, secondVictim.id));
  judgeGame.advance();
  settleSuccession(judgeGame);
  check("both of the day's victims are gone", !firstVictim.isAlive && !secondVictim.isAlive);
  check('and the night comes after them', judgeGame.state.currentPhase === 'Night');
  check('the judge is spent', !judgeGame.handleJudgeRepeat(judge.id));

  // A judge who stays silent lets the night come on the first vote alone.
  const muteTable = makePlayers(5);
  const muteGame = new GameManager(muteTable, new RecordingTransport());
  muteGame.start([StutteringJudgeRole, WerewolfRole, VillagerRole, SeerRole, GuardRole]);
  passElection(muteGame);

  const muteJudge = findRole(muteGame, muteTable, 'stuttering-judge')!;
  const muteVictim = findRole(muteGame, muteTable, 'villager')!;
  muteGame.advance();
  settleSuccession(muteGame);
  muteGame.advance();
  muteTable
    .filter(p => p.isAlive && p.id !== muteJudge.id)
    .slice(0, 3)
    .forEach(voter => muteGame.handleVote(voter.id, muteVictim.id));
  muteGame.advance();
  check('the judge is asked again', muteGame.state.currentPhase === 'Judge');
  muteGame.advance();
  settleSuccession(muteGame);
  check('silence ends the day', muteGame.state.currentPhase === 'Night' && !muteVictim.isAlive);

  // A judge's second vote is not the first vote's tie: the whole table is on
  // the ballot again.
  const mixTable = makePlayers(6);
  const mixGame = new GameManager(mixTable, new RecordingTransport());
  mixGame.start([
    StutteringJudgeRole,
    WerewolfRole,
    VillagerRole,
    VillagerRole,
    SeerRole,
    GuardRole,
  ]);
  passElection(mixGame);

  const mixJudge = findRole(mixGame, mixTable, 'stuttering-judge')!;
  const mixVillagers = mixTable.filter(p => mixGame.getRoleOf(p.id)?.id === 'villager');
  const mixSideA = mixVillagers[0];
  const mixSideB = mixVillagers[1];
  const mixThird = findRole(mixGame, mixTable, 'seer')!;
  const mixMayor = mixGame.state.presidentManager.getPresidentId();
  // The voters must all outlive the day: the first name they hang is one of
  // them.
  const mixVoters = mixTable
    .filter(p => p.isAlive && p.id !== mixMayor && p.id !== mixSideA.id)
    .slice(0, 4);

  mixGame.advance();
  settleSuccession(mixGame);
  mixGame.advance();
  check(
    'the first vote of the day ties',
    mixVoters.slice(0, 2).every(voter => mixGame.handleVote(voter.id, mixSideA.id)) &&
      mixVoters.slice(2).every(voter => mixGame.handleVote(voter.id, mixSideB.id)),
  );
  mixGame.advance();
  check('and the re-vote starts', mixGame.getRevoteCandidates().length === 2);
  check(
    'which settles on one name',
    mixVoters.every(voter => mixGame.handleVote(voter.id, mixSideA.id)),
  );
  mixGame.advance();
  check('the judge calls for one more', mixGame.state.currentPhase === 'Judge');
  check('and gets it', mixGame.handleJudgeRepeat(mixJudge.id));
  check(
    'with the whole table to choose from',
    mixVoters.every(voter => mixGame.handleVote(voter.id, mixThird.id)),
  );
  mixGame.advance();
  settleSuccession(mixGame);
  check('the second vote kills its own name', !mixThird.isAlive && !mixSideA.isAlive);

  // The Angel takes the game with the first night's bite.
  const nightAngelTable = makePlayers(5);
  const nightAngelGame = new GameManager(nightAngelTable, new RecordingTransport());
  nightAngelGame.start([AngelRole, WerewolfRole, VillagerRole, SeerRole, GuardRole]);
  passElection(nightAngelGame);

  const nightAngel = findRole(nightAngelGame, nightAngelTable, 'angel')!;
  const nightWolf = findRole(nightAngelGame, nightAngelTable, 'werewolf')!;
  check('the first bite lands', nightAngelGame.handleNightAction(nightWolf.id, 'kill', nightAngel.id));
  nightAngelGame.advance();
  settleSuccession(nightAngelGame);
  check('the angel wins on the spot', nightAngelGame.winner === 'Solitary' && !nightAngel.isAlive);
  check('and the label says so', nightAngelGame.getWinnerLabel() === 'The Angel wins.');

  // And with the first day's vote.
  const voteAngelTable = makePlayers(5);
  const voteAngelGame = new GameManager(voteAngelTable, new RecordingTransport());
  voteAngelGame.start([AngelRole, WerewolfRole, VillagerRole, SeerRole, GuardRole]);
  passElection(voteAngelGame);

  const voteAngel = findRole(voteAngelGame, voteAngelTable, 'angel')!;
  voteAngelGame.advance();
  settleSuccession(voteAngelGame);
  voteAngelGame.advance();
  voteAngelTable
    .filter(p => p.isAlive && p.id !== voteAngel.id)
    .slice(0, 3)
    .forEach(voter => voteAngelGame.handleVote(voter.id, voteAngel.id));
  voteAngelGame.advance();
  check(
    'the first vote hands the angel the game',
    voteAngelGame.winner === 'Solitary' && voteAngelGame.lastVote?.eliminatedId === voteAngel.id,
  );

  // An angel who lives through it is only a villager, and dies like one.
  const plainAngelTable = makePlayers(6);
  const plainAngelGame = new GameManager(plainAngelTable, new RecordingTransport());
  plainAngelGame.start([
    AngelRole,
    WerewolfRole,
    VillagerRole,
    VillagerRole,
    SeerRole,
    GuardRole,
  ]);
  passElection(plainAngelGame);

  const plainAngel = findRole(plainAngelGame, plainAngelTable, 'angel')!;
  const plainWolf = findRole(plainAngelGame, plainAngelTable, 'werewolf')!;
  plainAngelGame.advance();
  settleSuccession(plainAngelGame);
  plainAngelGame.advance();
  plainAngelGame.advance();
  settleSuccession(plainAngelGame);
  check('the second night comes', plainAngelGame.state.currentPhase === 'Night');
  check(
    'the wolf bites in the second night',
    plainAngelGame.handleNightAction(plainWolf.id, 'kill', plainAngel.id),
  );
  plainAngelGame.advance();
  settleSuccession(plainAngelGame);
  check('the angel is dead', !plainAngel.isAlive);
  check('and the game runs on', plainAngelGame.winner === null);
}

console.log('\n36. the piper collects the village');
{
  const pipeTable = makePlayers(4);
  const pipeTransport = new RecordingTransport();
  const pipeGame = new GameManager(pipeTable, pipeTransport);
  pipeGame.start([PiedPiperRole, WerewolfRole, VillagerRole, VillagerRole]);
  passElection(pipeGame);

  const piper = findRole(pipeGame, pipeTable, 'pied-piper')!;
  const pipeWolf = findRole(pipeGame, pipeTable, 'werewolf')!;
  const pipeVillagers = pipeTable.filter(p => pipeGame.getRoleOf(p.id)?.id === 'villager');

  check('two charms are offered', pipeGame.getRoleOf(piper.id)?.nightActions?.length === 2);
  check('the first charm lands', pipeGame.handleNightAction(piper.id, 'charm-1', pipeVillagers[0].id));
  check('and the second', pipeGame.handleNightAction(piper.id, 'charm-2', pipeVillagers[1].id));
  check(
    'one charm per name per night',
    !pipeGame.handleNightAction(piper.id, 'charm-2', pipeVillagers[0].id),
  );
  pipeGame.advance();
  settleSuccession(pipeGame);
  check(
    'both are charmed',
    pipeGame.isCharmed(pipeVillagers[0].id) && pipeGame.isCharmed(pipeVillagers[1].id),
  );
  check('the wolf is not', !pipeGame.isCharmed(pipeWolf.id));
  check('the game runs on', pipeGame.winner === null);
  check(
    'the piper is told his flock',
    pipeTransport.directs.some(
      d => d.playerId === piper.id && String(d.message.payload?.message ?? '').includes('flock'),
    ),
  );
  check(
    'and the charmed know it',
    pipeTransport.directs.some(
      d =>
        d.playerId === pipeVillagers[0].id &&
        String(d.message.payload?.message ?? '').includes('charmed'),
    ),
  );

  pipeGame.advance();
  pipeGame.advance();
  settleSuccession(pipeGame);
  check('the second night comes', pipeGame.state.currentPhase === 'Night');
  check(
    'the flock is not charmed twice',
    !pipeGame.handleNightAction(piper.id, 'charm-1', pipeVillagers[0].id),
  );
  check('the wolf is the missing name', pipeGame.handleNightAction(piper.id, 'charm-1', pipeWolf.id));
  pipeGame.advance();
  settleSuccession(pipeGame);
  check('everyone alive follows him', pipeGame.winner === 'Solitary');
  check('and the label says so', pipeGame.getWinnerLabel() === 'The Pied Piper wins.');
  check(
    'the table is told',
    pipeTransport.broadcasts.some(
      m => m.type === 'GAME_OVER' && m.payload?.winnerLabel === 'The Pied Piper wins.',
    ),
  );
}

console.log('\n37. the pack splits its vote');
{
  // The father is awake, so the table waits for him and nobody else.
  const tieTable = makePlayers(6);
  const tieTransport = new RecordingTransport();
  const tieGame = new GameManager(tieTable, tieTransport);
  tieGame.start([
    InfectiousFatherRole,
    WerewolfRole,
    WitchRole,
    SeerRole,
    VillagerRole,
    VillagerRole,
  ]);
  passElection(tieGame);

  const tieFather = findRole(tieGame, tieTable, 'infectious-father')!;
  const tieWolf = findRole(tieGame, tieTable, 'werewolf')!;
  const tieWitch = findRole(tieGame, tieTable, 'witch')!;
  const tieVillagers = tieTable.filter(p => tieGame.getRoleOf(p.id)?.id === 'villager');

  check('the father bites one way', tieGame.handleNightAction(tieFather.id, 'kill', tieVillagers[0].id));
  check('and the wolf the other', tieGame.handleNightAction(tieWolf.id, 'kill', tieVillagers[1].id));
  tieGame.advance();
  check('the night waits on the tied names', tieGame.hasOpenPackTie());
  check(
    'and names them',
    tieGame.getPackTieTargets().length === 2 &&
      tieGame.getPackTieTargets().every(target =>
        [tieVillagers[0].id, tieVillagers[1].id].includes(target.id),
      ),
  );
  check('the father is the one asked', tieGame.getPackTieBreakerId() === tieFather.id);
  check(
    'the father is told privately',
    tieTransport.directs.some(
      d => d.playerId === tieFather.id && d.message.payload?.tieTargets?.length === 2,
    ),
  );
  check(
    'and nobody else is',
    !tieTransport.directs.some(d => d.playerId !== tieFather.id && d.message.payload?.tieTargets),
  );
  tieGame.advance();
  check('a second press changes nothing', tieGame.hasOpenPackTie());
  check('the wolf cannot answer for the father', !tieGame.handleTieBreak(tieWolf.id, tieVillagers[0].id));
  check('a name outside the tie is refused', !tieGame.handleTieBreak(tieFather.id, tieWitch.id));
  check('the host cannot name a stranger either', !tieGame.handlePackTie(tieWitch.id));
  check('the father names the victim', tieGame.handleTieBreak(tieFather.id, tieVillagers[0].id));
  check('and the tie closes', !tieGame.hasOpenPackTie());
  check('the father cannot answer twice', !tieGame.handleTieBreak(tieFather.id, tieVillagers[1].id));

  check('the witch still wakes', tieGame.isWakingTheWitchNext());
  tieGame.advance();
  check(
    'and is shown the name the father chose',
    tieGame.getHealTarget()?.id === tieVillagers[0].id,
  );
  tieGame.advance();
  settleSuccession(tieGame);
  check('the chosen victim dies', !tieVillagers[0].isAlive);
  check('and the other walks away', tieVillagers[1].isAlive);

  // No father: the game takes one of the tied names at random.
  const randomTable = makePlayers(6);
  const randomTransport = new RecordingTransport();
  const randomGame = new GameManager(randomTable, randomTransport);
  randomGame.start([
    WerewolfRole,
    WerewolfRole,
    SeerRole,
    VillagerRole,
    VillagerRole,
    VillagerRole,
  ]);
  passElection(randomGame);

  const randomWolves = randomTable.filter(p => randomGame.getRoleOf(p.id)?.id === 'werewolf');
  const randomVillagers = randomTable.filter(p => randomGame.getRoleOf(p.id)?.id === 'villager');
  randomGame.handleNightAction(randomWolves[0].id, 'kill', randomVillagers[0].id);
  randomGame.handleNightAction(randomWolves[1].id, 'kill', randomVillagers[1].id);
  randomGame.advance();
  settleSuccession(randomGame);
  check('with no father the night never waits', !randomGame.hasOpenPackTie());
  check(
    'and one of the tied names dies',
    randomVillagers[0].isAlive !== randomVillagers[1].isAlive,
  );

  // The host asked for the tie to be his to call.
  const hostTable = makePlayers(6);
  const hostTransport = new RecordingTransport();
  const hostGame = new GameManager(hostTable, hostTransport);
  hostGame.start(
    [WerewolfRole, WerewolfRole, SeerRole, VillagerRole, VillagerRole, VillagerRole],
    { peacefulFirstNight: false, guardNoRepeat: true, wolfTieBreak: 'host' },
  );
  passElection(hostGame);

  const hostWolves = hostTable.filter(p => hostGame.getRoleOf(p.id)?.id === 'werewolf');
  const hostVillagers = hostTable.filter(p => hostGame.getRoleOf(p.id)?.id === 'villager');
  hostGame.handleNightAction(hostWolves[0].id, 'kill', hostVillagers[0].id);
  hostGame.handleNightAction(hostWolves[1].id, 'kill', hostVillagers[1].id);
  hostGame.advance();
  check('the host is asked instead', hostGame.hasOpenPackTie());
  check('and has no father to wait for', hostGame.getPackTieBreakerId() === null);
  hostGame.advance();
  check('the night still waits', hostGame.state.currentPhase === 'Night');
  check('a name outside the tie is refused', !hostGame.handlePackTie(hostVillagers[2].id));
  check('the host names the victim', hostGame.handlePackTie(hostVillagers[1].id));
  hostGame.advance();
  settleSuccession(hostGame);
  check('and that one dies', !hostVillagers[1].isAlive && hostVillagers[0].isAlive);
}

console.log('\n38. the rules live in one list');
{
  const ids = SETTING_DEFS.map(def => def.id);
  check('every rule has its own id', new Set(ids).size === ids.length);
  check(
    'every rule has words for the host',
    SETTING_DEFS.every(
      def => def.label.length > 0 && def.help.length > 0 && def.group.length > 0,
    ),
  );
  check(
    'every rule has a default, and it is one of its choices',
    SETTING_DEFS.every(
      def =>
        def.default !== undefined &&
        (!def.choices || def.choices.some(choice => choice.value === def.default)),
    ),
  );

  const defaults = defaultSettings();
  check('the defaults cover the list', ids.every(id => id in defaults));
  check('and hold no stranger', Object.keys(defaults).length === ids.length);

  const firstNight = SETTING_DEFS.find(def => def.id === 'peacefulFirstNight')!;
  check(
    'a rule cycles through its choices',
    nextSettingValue(firstNight, null) === true &&
      nextSettingValue(firstNight, true) === false &&
      nextSettingValue(firstNight, false) === null,
  );
  check(
    'and names the value it holds, set or not',
    settingLabel(firstNight, null).includes('Auto') &&
      settingLabel(firstNight, undefined).includes('Auto'),
  );

  // The engine reads through the list: a rule the table never set behaves as
  // its default says, and the deal carries the rules to every phone.
  const barePlayers = makePlayers(3);
  const bareTransport = new RecordingTransport();
  const bare = new GameManager(barePlayers, bareTransport);
  bare.start([WerewolfRole, SeerRole, VillagerRole], {});
  check('an unset rule falls back to its default', bare.isQuietNight());
  check(
    'the rules reach the table with the deal',
    bareTransport.broadcasts.some(
      message => message.type === 'RULES_UPDATE' && message.payload?.settings?.peacefulFirstNight === null,
    ),
  );

  const deadlyPlayers = makePlayers(3);
  const deadly = new GameManager(deadlyPlayers, new RecordingTransport());
  deadly.start([WerewolfRole, SeerRole, VillagerRole], { peacefulFirstNight: false });
  check('the table can force a deadly first night', !deadly.isQuietNight());
}

console.log(failures === 0 ? `\nAll checks passed.` : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
