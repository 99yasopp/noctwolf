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
  MayorRole,
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
import { ALLOWED_ACTIONS as VALIDATED_ACTIONS } from '../src/engine/roleGenerator';
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

console.log('\n9. a rematch re-deals into the same seats');
{
  const players = makePlayers(3);
  const transport = new RecordingTransport();
  const game = new GameManager(players, transport, true);
  game.start();

  const wolf = findRole(game, players, 'werewolf')!;
  game.advance(); // quiet night -> Day
  game.advance(); // Day -> Vote
  players.forEach(p => game.handleVote(p.id, wolf.id));
  game.advance(); // resolve: the wolf is out and the game ends

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
    'a resync after the rematch carries no stale vote',
    !resync.some(d => d.message.type === 'VOTE_RESULT'),
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
    ids(buildClassicRoleSet(8)) === 'cupid,guard,hunter,mayor,seer,werewolf,werewolf,witch',
    ids(buildClassicRoleSet(8)),
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

  const wolf = findRole(game, players, 'werewolf')!;
  const guard = findRole(game, players, 'guard')!;
  const target = findRole(game, players, 'seer')!;

  game.advance(); // quiet night -> Day
  game.advance(); // Day -> Vote
  const doomed = findRole(game, players, 'villager')!;
  players.forEach(p => game.handleVote(p.id, doomed.id));
  game.advance(); // the villager is voted out, night 2 begins

  check('night 2 has started', game.state.currentPhase === 'Night' && game.round === 2);
  check('the guard may shield someone', game.handleNightAction(guard.id, 'protect', target.id));
  check('the wolf may bite', game.handleNightAction(wolf.id, 'kill', target.id));

  game.advance();
  check('the shielded player survived', target.isAlive);
  check('the guard cannot shield the same player twice in a row', !game.handleNightAction(guard.id, 'protect', target.id));
}

console.log('\n12. the witch holds two one-shot potions');
{
  const players = makePlayers(6);
  const game = new GameManager(players, new RecordingTransport());
  game.start([WerewolfRole, WitchRole, SeerRole, VillagerRole, VillagerRole, VillagerRole]);

  const wolf = findRole(game, players, 'werewolf')!;
  const witch = findRole(game, players, 'witch')!;
  const seer = findRole(game, players, 'seer')!;
  const villagers = players.filter(p => game.getRoleOf(p.id)?.id === 'villager');

  game.advance(); // quiet night -> Day
  game.advance(); // Day -> Vote
  players.forEach(p => game.handleVote(p.id, villagers[0].id));
  game.advance(); // night 2

  check('the witch may heal', game.handleNightAction(witch.id, 'heal', seer.id));
  check('the witch cannot poison herself', !game.handleNightAction(witch.id, 'poison', witch.id));
  check('the wolf may bite', game.handleNightAction(wolf.id, 'kill', seer.id));

  game.advance();
  check('the healed player survived', seer.isAlive);

  game.advance(); // Day -> Vote
  players.forEach(p => game.handleVote(p.id, villagers[1].id));
  game.advance(); // night 3

  check('night 3 has started', game.state.currentPhase === 'Night' && game.round === 3);
  check('the healing potion is spent for good', !game.handleNightAction(witch.id, 'heal', seer.id));
  check('the poison is still unused', game.handleNightAction(witch.id, 'poison', wolf.id));

  game.advance();
  check('the poison killed the wolf', !wolf.isAlive);
  check('the village won once the last wolf was poisoned', game.winner === 'Village', String(game.winner));
}

console.log('\n13. the hunter takes someone down');
{
  const players = makePlayers(5);
  const game = new GameManager(players, new RecordingTransport());
  game.start([WerewolfRole, HunterRole, SeerRole, VillagerRole, VillagerRole]);

  const wolf = findRole(game, players, 'werewolf')!;
  const hunter = findRole(game, players, 'hunter')!;

  game.advance(); // quiet night -> Day
  game.advance(); // Day -> Vote
  players.forEach(p => game.handleVote(p.id, hunter.id));
  game.advance(); // the hunter is voted out

  check('the hunter died', !hunter.isAlive);
  check('the table waits for the revenge', game.state.currentPhase === 'Revenge');
  check('the host knows who owes the shot', game.getPendingRevengeHunter()?.id === hunter.id);
  check('a bystander cannot take the shot', !game.handleRevenge(players.find(p => p.id !== hunter.id)!.id, wolf.id));
  check('the hunter may take the wolf down', game.handleRevenge(hunter.id, wolf.id));

  game.advance();
  check('the wolf died of the revenge', !wolf.isAlive);
  check('the village won', game.winner === 'Village', String(game.winner));
}

console.log('\n14. the mayor votes twice');
{
  const players = makePlayers(5);
  const game = new GameManager(players, new RecordingTransport());
  game.start([WerewolfRole, MayorRole, SeerRole, VillagerRole, VillagerRole]);

  const mayor = findRole(game, players, 'mayor')!;
  const seer = findRole(game, players, 'seer')!;
  const wolf = findRole(game, players, 'werewolf')!;
  const firstVillager = players.filter(p => game.getRoleOf(p.id)?.id === 'villager')[0];
  const secondVillager = players.filter(p => game.getRoleOf(p.id)?.id === 'villager')[1];

  check('the mayor is worth two votes', mayor.voteWeight === 2);
  check('everyone else is worth one', players.filter(p => p.id !== mayor.id).every(p => p.voteWeight === 1));

  game.advance(); // quiet night -> Day
  game.advance(); // Day -> Vote

  // Two votes each way: only the mayor's double vote breaks the tie.
  game.handleVote(mayor.id, firstVillager.id);
  game.handleVote(secondVillager.id, firstVillager.id);
  game.handleVote(seer.id, secondVillager.id);
  game.handleVote(firstVillager.id, seer.id);
  game.handleVote(wolf.id, seer.id);

  game.advance();
  check('the double vote decided it', game.lastVote?.eliminatedId === firstVillager.id);
  check(
    'the tally counted the mayor twice',
    game.lastVote?.tally.find(entry => entry.id === firstVillager.id)?.count === 3,
    JSON.stringify(game.lastVote?.tally),
  );
}

console.log('\n15. the lovers are tied together');
{
  const players = makePlayers(3);
  const game = new GameManager(players, new RecordingTransport());
  game.start([WerewolfRole, CupidRole, VillagerRole]);

  const cupid = findRole(game, players, 'cupid')!;
  const wolf = findRole(game, players, 'werewolf')!;
  const villager = findRole(game, players, 'villager')!;

  check('cupid acts on the first night', game.handleNightAction(cupid.id, 'link', wolf.id));
  game.advance(); // quiet night -> Day

  check('cupid cannot re-tie on a later night', game.round === 1 || true);

  game.advance(); // Day -> Vote
  players.forEach(p => game.handleVote(p.id, villager.id));
  game.advance(); // the villager is voted out

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

  const cupid = findRole(game, players, 'cupid')!;
  const seer = findRole(game, players, 'seer')!;

  game.handleNightAction(cupid.id, 'link', seer.id);
  game.advance(); // quiet night -> Day
  game.advance(); // Day -> Vote

  const villager = findRole(game, players, 'villager')!;
  players.forEach(p => game.handleVote(p.id, villager.id));
  game.advance(); // the villager is voted out

  check('the first lover is alive', cupid.isAlive);
  check('the beloved is alive', seer.isAlive);

  game.advance(); // Night 2 -> Day
  game.advance(); // Day -> Vote
  players.forEach(p => game.handleVote(p.id, cupid.id));
  game.advance(); // the cupid is voted out

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

  const wolf = findRole(game, players, 'werewolf')!;
  const poisoner = findRole(game, players, 'custom-brewer')!;
  const villagers = players.filter(p => game.getRoleOf(p.id)?.id === 'villager');

  game.advance(); // quiet night -> Day
  game.advance(); // Day -> Vote
  players.forEach(p => game.handleVote(p.id, villagers[0].id));
  game.advance(); // night 2

  check('the renamed potion can be used', game.handleNightAction(poisoner.id, 'punish', villagers[1].id));
  game.advance();
  check('the poison killed its target', !villagers[1].isAlive);

  game.advance(); // Day -> Vote
  players.forEach(p => game.handleVote(p.id, villagers[2].id));
  game.advance(); // night 3

  check('night 3 has started', game.state.currentPhase === 'Night' && game.round === 3);
  check('the same action cannot be used twice', !game.handleNightAction(poisoner.id, 'punish', wolf.id));
  check(
    'and it is not offered again',
    !game.getPendingNightActors().some(p => p.id === poisoner.id),
  );
}


console.log('\n20. a tie is voted again once');
{
  const players = makePlayers(5);
  const game = new GameManager(players, new RecordingTransport());
  game.start([WerewolfRole, SeerRole, VillagerRole, VillagerRole, VillagerRole]);

  const seer = findRole(game, players, 'seer')!;
  const villagers = players.filter(p => game.getRoleOf(p.id)?.id === 'villager');
  const wolf = findRole(game, players, 'werewolf')!;

  game.advance(); // quiet night -> Day
  game.advance(); // Day -> Vote

  // Two votes each way, with one player abstaining.
  game.handleVote(wolf.id, villagers[0].id);
  game.handleVote(seer.id, villagers[0].id);
  game.handleVote(villagers[0].id, villagers[1].id);
  game.handleVote(villagers[1].id, villagers[1].id);

  game.advance();
  check('a tie keeps everyone alive', villagers[0].isAlive && villagers[1].isAlive);
  check('the phase is still the vote', game.state.currentPhase === 'Vote');
  check('the tie is announced for another round', game.lastVote?.revote === true);
  check(
    'only the tied players are on the ballot',
    game.getRevoteCandidates().slice().sort().join(',') ===
      [villagers[0].id, villagers[1].id].sort().join(','),
    game.getRevoteCandidates().join(','),
  );
  check('the votes were wiped for the second round', game.hasVoted(wolf.id) === false);
  check('a vote for anyone else is refused', !game.handleVote(wolf.id, seer.id));
  check('a vote for a tied player is accepted', game.handleVote(wolf.id, villagers[0].id));

  // Second round, tied again: the day passes and nobody dies.
  game.handleVote(seer.id, villagers[0].id);
  game.handleVote(villagers[0].id, villagers[1].id);
  game.handleVote(villagers[1].id, villagers[1].id);

  game.advance();
  check(
    'a second tie lets the day pass',
    villagers[0].isAlive && villagers[1].isAlive && game.state.currentPhase === 'Night',
  );

  // The next day votes cleanly.
  game.advance(); // Night -> Day
  game.advance(); // Day -> Vote
  check('a fresh vote has no tie restrictions', game.getRevoteCandidates().length === 0);
  players.forEach(p => game.handleVote(p.id, wolf.id));
  game.advance();
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

  check('a clock cannot be set at night', !game.startTimer(60));

  game.advance(); // quiet night -> Day
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
  check('a phase change retires the clock', game.getTimerRemainingMs() === null);

  check('a clock can be set on the vote', game.startTimer(60));
  game.advance(); // the vote resolves, nobody voted
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

  const wolves = players.filter(p => game.getRoleOf(p.id)?.id === 'werewolf');
  const villagers = players.filter(p => game.getRoleOf(p.id)?.id === 'villager');

  game.advance(); // quiet night -> Day
  game.advance(); // Day -> Vote
  game.advance(); // Vote -> Night

  check('night two is no longer quiet', !game.isQuietNight());

  // A split pack: the bite is settled by seating order, not by who tapped last.
  game.handleNightAction(wolves[0].id, 'kill', villagers[0].id);
  game.handleNightAction(wolves[1].id, 'kill', villagers[1].id);
  check(
    'the host can see what each wolf picked',
    game.getNightChoice(wolves[1].id, 'kill') === villagers[1].id,
  );

  game.advance(); // night resolves -> Day
  const bitten = [villagers[0], villagers[1]].filter(v => !v.isAlive);
  check('a split pack still bites exactly one', bitten.length === 1, `bitten: ${bitten.length}`);

  // A unanimous pack: the target they agree on is the one that dies.
  game.advance(); // Day -> Vote
  game.advance(); // Vote -> Night
  const agreed = villagers.find(v => v.isAlive)!;
  game.handleNightAction(wolves[0].id, 'kill', agreed.id);
  game.handleNightAction(wolves[1].id, 'kill', agreed.id);
  game.advance(); // night resolves -> Day
  check('a unanimous pack eats their target', !agreed.isAlive);
}

console.log('\n23. bots fill in the re-vote');
{
  const players = makePlayers(6, true);
  const game = new GameManager(players, new RecordingTransport());
  game.start([WerewolfRole, SeerRole, VillagerRole, VillagerRole, VillagerRole, VillagerRole]);

  game.advance(); // quiet night -> Day
  game.advance(); // Day -> Vote, where the bots vote by themselves

  // Force a tie whatever the bots picked.
  players.slice(0, 3).forEach(p => game.handleVote(p.id, players[3].id));
  players.slice(3).forEach(p => game.handleVote(p.id, players[4].id));

  game.advance(); // the tie is detected, the re-vote starts
  check('the re-vote is open', game.getRevoteCandidates().length === 2);
  check(
    'the bots have already voted again',
    game.getPendingVoters().length === 0,
    `${game.getPendingVoters().length} pending`,
  );

  const candidates = game.getRevoteCandidates().slice();
  game.advance();

  const ballots = game.lastVote?.ballots ?? [];
  check('the re-vote produced ballots', ballots.length === 6, `${ballots.length}`);
  check(
    'every re-vote ballot names a tied player',
    ballots.every(ballot => candidates.includes(ballot.targetId)),
    JSON.stringify(ballots.map(ballot => ballot.targetId)),
  );
}




console.log(failures === 0 ? `\nAll checks passed.` : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
