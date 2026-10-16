import {
  ALL_ROLES,
  PlayableRole,
  VillagerRole,
  getCustomRoles,
} from './roleSet';

// The rules a host can change for the whole table, as opposed to which roles
// are dealt. Kept in one record so the setup screen, the engine and the saved
// preferences all speak about the same thing.

export interface GameOptions {
  // null follows the table size: only a three-player table opens peacefully.
  // true and false force it on or off.
  peacefulFirstNight: boolean | null;
  // The guard may not shield the same player two nights in a row.
  guardNoRepeat: boolean;
  // Who breaks a tie in the pack's vote when no infectious father is left to
  // decide: the game takes one at random, or the host names the victim.
  // Optional so older saved setups keep the random default.
  wolfTieBreak?: 'random' | 'host';
}

export const defaultGameOptions = (): GameOptions => ({
  peacefulFirstNight: null,
  guardNoRepeat: true,
  wolfTieBreak: 'random',
});

// The host's table: how many seats each role takes, how many potions the witch
// holds, and the house rules. Seats nobody claims are filled with villagers.
export interface RoleSetup {
  counts: Record<string, number>;
  witchHealCharges: number;
  witchPoisonCharges: number;
  options: GameOptions;
}

export const defaultRoleSetup = (): RoleSetup => ({
  counts: {},
  witchHealCharges: 1,
  witchPoisonCharges: 1,
  options: defaultGameOptions(),
});

// Every role a setup may name: the built-in list plus the host's own roles.
export const setupRoleById = (id: string): PlayableRole | undefined =>
  ALL_ROLES.find(role => role.id === id) ?? getCustomRoles().find(role => role.id === id);

export const setupSeatsUsed = (setup: RoleSetup): number =>
  Object.values(setup.counts).reduce((total, count) => total + Math.max(0, count), 0);

export const setupWolfSeats = (setup: RoleSetup): number =>
  Object.entries(setup.counts).reduce((total, [id, count]) => {
    const role = setupRoleById(id);
    return total + (role?.team === 'Wolf' ? Math.max(0, count) : 0);
  }, 0);

// Why a setup cannot be dealt, or null when it can. The host screen shows this
// instead of starting a game that makes no sense. Every seat has to be named:
// the villagers are the seats nobody else takes, and the shortcut next to the
// message fills them in one tap.
export const setupProblem = (setup: RoleSetup, playerCount: number): string | null => {
  if (playerCount <= 0) return null;

  const used = setupSeatsUsed(setup);
  if (used === 0) return 'Choose the roles for this table.';

  if (used < playerCount) {
    return `${playerCount - used} seat${playerCount - used > 1 ? 's' : ''} still free. Fill the rest with villagers.`;
  }

  if (used > playerCount) {
    return `${used - playerCount} role${used - playerCount > 1 ? 's' : ''} too many for ${playerCount} players.`;
  }

  if (setupWolfSeats(setup) === 0) return 'At least one wolf has to be in play.';

  return null;
};

// Puts villagers in every seat nobody else claims.
export const fillWithVillagers = (setup: RoleSetup, playerCount: number): RoleSetup => {
  const others = setupSeatsUsed(setup) - (setup.counts.villager ?? 0);
  const villagers = Math.max(0, playerCount - others);

  return { ...setup, counts: { ...setup.counts, villager: villagers } };
};

// The witch's potions are the one role the host reshapes, so her card is
// copied with the chosen counts rather than changed in place: the same role
// object is handed to every game of the evening.
const withWitchPotions = (role: PlayableRole, setup: RoleSetup): PlayableRole => ({
  ...role,
  nightActions: role.nightActions?.map(option =>
    option.id === 'heal'
      ? { ...option, charges: Math.max(0, Math.floor(setup.witchHealCharges)) }
      : option.id === 'poison'
      ? { ...option, charges: Math.max(0, Math.floor(setup.witchPoisonCharges)) }
      : option,
  ),
});

// The role list a setup deals. The counts already name every seat, and the
// villagers below are only a safety net for a list that came up short.
export const buildSetupRoles = (setup: RoleSetup, playerCount: number): PlayableRole[] => {
  const roles: PlayableRole[] = [];

  Object.entries(setup.counts).forEach(([id, count]) => {
    const role = setupRoleById(id);
    if (!role) return;

    const copies = Math.max(0, Math.floor(count));
    for (let i = 0; i < copies && roles.length < playerCount; i++) {
      roles.push(role.id === 'witch' ? withWitchPotions(role, setup) : role);
    }
  });

  while (roles.length < playerCount) roles.push(VillagerRole);

  return roles;
};

// What a preset puts on the table, written as counts so the steppers can show
// it and the host can then change it.
export const countsFromRoles = (roles: PlayableRole[]): Record<string, number> => {
  const counts: Record<string, number> = {};

  roles.forEach(role => {
    counts[role.id] = (counts[role.id] ?? 0) + 1;
  });

  return counts;
};

// A setup seeded from a preset, including the witch's default potions.
export const setupFromRoles = (roles: PlayableRole[]): RoleSetup => {
  const witch = roles.find(role => role.id === 'witch');

  return {
    counts: countsFromRoles(roles),
    witchHealCharges:
      witch?.nightActions?.find(option => option.id === 'heal')?.charges ?? 1,
    witchPoisonCharges:
      witch?.nightActions?.find(option => option.id === 'poison')?.charges ?? 1,
    options: defaultGameOptions(),
  };
};
