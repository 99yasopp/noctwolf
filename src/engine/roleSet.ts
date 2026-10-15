import { Team } from './types';

// What a night action does when it is resolved. The engine keys its
// resolution order off this, not off the role, so a new role only has to
// declare which kinds of action it uses.
export type ActionKind = 'attack' | 'protect' | 'heal' | 'poison' | 'inspect' | 'link';

// One choice a role gets to make at night.
export interface NightActionOption {
  id: string;
  label: string;
  kind: ActionKind;
  // May the player point the action at themselves?
  allowSelf?: boolean;
  // May a wolf point the action at another wolf?
  allowPack?: boolean;
  // Consumed on use: the witch's potions are spent once per game.
  oncePerGame?: boolean;
}

// A concrete, playable role. Kept separate from the abstract `Role` in
// roles.ts, which describes the composable ability system.
export interface PlayableRole {
  id: string;
  name: string;
  team: Team;
  description: string;
  nightActions?: NightActionOption[];
  // Votes count this many times. The Mayor is worth two.
  voteWeight?: number;
  // Takes a player down when they die, by night or by vote.
  revengeOnDeath?: boolean;
  // Set by Cupid on the first night.
  linksLovers?: boolean;
}

export const WerewolfRole: PlayableRole = {
  id: 'werewolf',
  name: 'Werewolf',
  team: 'Wolf',
  description: 'Each night you devour one player. Stay hidden by day.',
  nightActions: [{ id: 'kill', label: 'Devour a player', kind: 'attack' }],
};

export const SeerRole: PlayableRole = {
  id: 'seer',
  name: 'Seer',
  team: 'Village',
  description: 'Each night you learn whether one player is a Werewolf.',
  nightActions: [{ id: 'peek', label: 'Inspect a player', kind: 'inspect' }],
};

export const VillagerRole: PlayableRole = {
  id: 'villager',
  name: 'Villager',
  team: 'Village',
  description: 'You have no night action. Find the wolves by day.',
};

export const GuardRole: PlayableRole = {
  id: 'guard',
  name: 'Guard',
  team: 'Village',
  description: 'Each night you shield one player from the wolves. Not the same player twice in a row.',
  nightActions: [{ id: 'protect', label: 'Shield a player', kind: 'protect', allowSelf: true }],
};

export const WitchRole: PlayableRole = {
  id: 'witch',
  name: 'Witch',
  team: 'Village',
  description: 'You hold one healing potion and one poison, each usable once in the whole game.',
  nightActions: [
    { id: 'heal', label: 'Use the healing potion', kind: 'heal', allowSelf: true, oncePerGame: true },
    { id: 'poison', label: 'Use the poison', kind: 'poison', oncePerGame: true },
  ],
};

export const HunterRole: PlayableRole = {
  id: 'hunter',
  name: 'Hunter',
  team: 'Village',
  description: 'You have no night action, but when you die you take one player down with you.',
  revengeOnDeath: true,
};

export const MayorRole: PlayableRole = {
  id: 'mayor',
  name: 'Mayor',
  team: 'Village',
  description: 'You have no night action, but your vote counts twice.',
  voteWeight: 2,
};

export const CupidRole: PlayableRole = {
  id: 'cupid',
  name: 'Cupid',
  team: 'Village',
  description: 'On the first night you tie two players together as lovers. If one dies, so does the other.',
  nightActions: [{ id: 'link', label: 'Tie two players together', kind: 'link' }],
  linksLovers: true,
};

export const ALL_ROLES: PlayableRole[] = [
  WerewolfRole,
  SeerRole,
  VillagerRole,
  GuardRole,
  WitchRole,
  HunterRole,
  MayorRole,
  CupidRole,
];

export const getRoleById = (id: string): PlayableRole | undefined =>
  ALL_ROLES.find(role => role.id === id);

// ---------------------------------------------------------------------- setups

// A setup is a named way of filling a table of n players.
export interface RolePreset {
  id: string;
  name: string;
  description: string;
  build: (playerCount: number) => PlayableRole[];
}

const fill = (set: PlayableRole[], playerCount: number): PlayableRole[] => {
  const built = [...set];
  while (built.length < playerCount) built.push(VillagerRole);
  return built.slice(0, playerCount);
};

// One wolf, one seer, everyone else a villager. Three players therefore means
// Werewolf + Seer + Villager.
export const buildSimpleRoleSet = (playerCount: number): PlayableRole[] => {
  if (playerCount <= 0) return [];

  const wolfCount = Math.max(1, Math.floor(playerCount / 4));
  const seerCount = playerCount >= 3 ? 1 : 0;
  const set: PlayableRole[] = [];
  for (let i = 0; i < wolfCount; i++) set.push(WerewolfRole);
  if (seerCount) set.push(SeerRole);
  return fill(set, playerCount);
};

// The village's full toolbox. Powers only appear once the table is big enough
// to absorb a mistake, so a small game stays readable.
export const buildClassicRoleSet = (playerCount: number): PlayableRole[] => {
  if (playerCount <= 0) return [];

  const wolfCount = Math.max(1, Math.floor(playerCount / 4));
  const set: PlayableRole[] = [];
  for (let i = 0; i < wolfCount; i++) set.push(WerewolfRole);

  if (playerCount >= 3) set.push(SeerRole);
  if (playerCount >= 5) set.push(GuardRole);
  if (playerCount >= 6) set.push(WitchRole);
  if (playerCount >= 7) set.push(HunterRole);
  if (playerCount >= 7) set.push(MayorRole);
  if (playerCount >= 8) set.push(CupidRole);

  return fill(set, playerCount);
};

// Everything at once, for a table that knows the game well.
export const buildChaosRoleSet = (playerCount: number): PlayableRole[] => {
  if (playerCount <= 0) return [];

  const wolfCount = Math.max(1, Math.round(playerCount / 3));
  const set: PlayableRole[] = [];
  for (let i = 0; i < wolfCount; i++) set.push(WerewolfRole);

  [SeerRole, GuardRole, WitchRole, HunterRole, MayorRole, CupidRole].forEach(role => {
    if (set.length < playerCount) set.push(role);
  });

  return fill(set, playerCount);
};

// ---------------------------------------------------------------- custom roles

// Roles the host generated and approved. They live in the engine rather than
// in a screen so a preset can be built without an import cycle.
let customRoles: PlayableRole[] = [];

export const setCustomRoles = (roles: PlayableRole[]) => {
  customRoles = roles;
};

export const getCustomRoles = (): PlayableRole[] => customRoles;

// Custom roles take the villagers' seats. A generated wolf counts against the
// wolf budget rather than adding to it, or a three player game would start
// with two wolves and end on the first day.
export const buildCustomRoleSet = (playerCount: number): PlayableRole[] => {
  if (playerCount <= 0) return [];

  const wolfCount = Math.max(1, Math.floor(playerCount / 4));
  const customWolves = customRoles.filter(role => role.team === 'Wolf');
  const customOthers = customRoles.filter(role => role.team !== 'Wolf');

  const set: PlayableRole[] = customWolves.slice(0, wolfCount);
  while (set.length < wolfCount) set.push(WerewolfRole);

  if (playerCount >= 3) set.push(SeerRole);

  customOthers.forEach(role => {
    if (set.length < playerCount) set.push(role);
  });

  return fill(set, playerCount);
};

export const ROLE_PRESETS: RolePreset[] = [
  {
    id: 'simple',
    name: 'Simple',
    description: 'One wolf, one seer, the rest villagers. Best for three players.',
    build: buildSimpleRoleSet,
  },
  {
    id: 'classic',
    name: 'Classic',
    description: 'Adds the guard, witch, hunter, mayor and cupid as the table grows.',
    build: buildClassicRoleSet,
  },
  {
    id: 'chaos',
    name: 'Chaos',
    description: 'More wolves, every power in play.',
    build: buildChaosRoleSet,
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'The roles you made with the AI, in place of the villagers.',
    build: buildCustomRoleSet,
  },
];

export const getPreset = (id: string): RolePreset =>
  ROLE_PRESETS.find(preset => preset.id === id) ?? ROLE_PRESETS[0];

// Kept as the default so an unconfigured game behaves as it always has.
export const buildRoleSet = buildSimpleRoleSet;
