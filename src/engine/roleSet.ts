import { Team } from './types';

export type NightActionKind = 'kill' | 'peek';

// A concrete, playable role. Kept separate from the abstract `Role` in
// roles.ts, which describes the composable ability system.
export interface PlayableRole {
  id: string;
  name: string;
  team: Team;
  description: string;
  nightAction?: NightActionKind;
  nightActionLabel?: string;
}

export const WerewolfRole: PlayableRole = {
  id: 'werewolf',
  name: 'Werewolf',
  team: 'Wolf',
  description: 'Each night you devour one player. Stay hidden by day.',
  nightAction: 'kill',
  nightActionLabel: 'Devour a player',
};

export const SeerRole: PlayableRole = {
  id: 'seer',
  name: 'Seer',
  team: 'Village',
  description: 'Each night you learn whether one player is a Werewolf.',
  nightAction: 'peek',
  nightActionLabel: 'Inspect a player',
};

export const VillagerRole: PlayableRole = {
  id: 'villager',
  name: 'Villager',
  team: 'Village',
  description: 'You have no night action. Find the wolves by day.',
};

export const getRoleById = (id: string): PlayableRole | undefined =>
  [WerewolfRole, SeerRole, VillagerRole].find(role => role.id === id);

// A deliberately small setup: one wolf, one seer, everyone else a villager.
// Three players therefore means Werewolf + Seer + Villager.
export function buildRoleSet(playerCount: number): PlayableRole[] {
  if (playerCount <= 0) return [];

  const wolfCount = Math.max(1, Math.floor(playerCount / 4));
  const seerCount = playerCount >= 3 ? 1 : 0;
  const villagerCount = Math.max(0, playerCount - wolfCount - seerCount);

  const set: PlayableRole[] = [];
  for (let i = 0; i < wolfCount; i++) set.push(WerewolfRole);
  for (let i = 0; i < seerCount; i++) set.push(SeerRole);
  for (let i = 0; i < villagerCount; i++) set.push(VillagerRole);
  return set;
}
