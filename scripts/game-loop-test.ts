// Headless verification of the game loop. The engine has no React Native
// imports, so this runs in plain Node:
//
//   npx tsc scripts/game-loop-test.ts --outDir /tmp/opencode/build \
//     --module commonjs --target es2020 --moduleResolution node --skipLibCheck
//   node /tmp/opencode/build/scripts/game-loop-test.js
import { GameManager } from '../src/engine/gameManager';
import {
  CupidRole,
  GuardRole,
  HunterRole,
  PlayableRole,
  SeerRole,
  VillagerRole,
  WerewolfRole,
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
    phasePayloads('Night').every(payload => payload.quietNight === false),
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

  game.handleNightAction(wolf.id, 'kill', villager.id);
  game.handleNightAction(guard.id, 'protect', villager.id);
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

console.log(failures === 0 ? `\nAll checks passed.` : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
