import {
  ALL_ROLES,
  PlayableRole,
  VillagerRole,
  getCustomRoles,
} from './roleSet';

// The rules a host can change for the whole table, as opposed to which roles
// are dealt. One list is the single source of truth: the engine reads the
// values, and the screens render whatever is in the list, so a new rule costs
// one entry and no new UI.

export type SettingValue = boolean | string | number | null;

export interface SettingDef {
  id: string;
  label: string;
  // Rules that belong together on the host's screen.
  group: string;
  // What the rule does, in the host's words. Shown under the button.
  help: string;
  // A rule with choices is cycled through them; without, it is on or off.
  choices?: { value: SettingValue; label: string }[];
  // A rule with a count is a stepper between two bounds.
  count?: { min: number; max: number };
  // Only shown when this role takes at least one seat.
  whenRole?: string;
  default: SettingValue;
}

export type Settings = Record<string, SettingValue>;

export const SETTING_DEFS: SettingDef[] = [
  {
    id: 'peacefulFirstNight',
    label: 'First night',
    group: 'Table',
    help: 'A peaceful first night lets the wolves look around without feeding, so the first vote decides everything. At three players that is the only way the game can start fairly.',
    choices: [
      { value: null, label: 'Auto (peaceful at 3 players)' },
      { value: true, label: 'Always peaceful' },
      { value: false, label: 'Never peaceful' },
    ],
    default: null,
  },
  {
    id: 'guardNoRepeat',
    label: 'Guard repeat',
    group: 'Village powers',
    help: 'Whether the guard may shield the same player two nights in a row.',
    choices: [
      { value: true, label: 'Forbidden' },
      { value: false, label: 'Allowed' },
    ],
    whenRole: 'guard',
    default: true,
  },
  {
    id: 'witch.healCharges',
    label: 'Healing potions',
    group: 'Village powers',
    help: 'How many players the witch can save. A count of zero means the potion is not in play.',
    count: { min: 0, max: 3 },
    whenRole: 'witch',
    default: 1,
  },
  {
    id: 'witch.poisonCharges',
    label: 'Poison',
    group: 'Village powers',
    help: 'How many players the witch can poison. Poison is not stopped by the guard.',
    count: { min: 0, max: 3 },
    whenRole: 'witch',
    default: 1,
  },
  {
    id: 'seer.depth',
    label: 'Seer reads',
    group: 'Village powers',
    help: 'What the seer learns about the player he looks at: which camp they belong to, or the exact role.',
    choices: [
      { value: 'camp', label: 'Camp only' },
      { value: 'exact', label: 'The exact role' },
    ],
    whenRole: 'seer',
    default: 'camp',
  },
  {
    id: 'seer.publicReport',
    label: 'Seer reports in public',
    group: 'Village powers',
    help: 'At dawn the whole table hears what the seer found, without being told who was looked at. The detail follows the seer\'s own reading.',
    whenRole: 'seer',
    default: false,
  },
  {
    id: 'raven.timing',
    label: 'Raven marks',
    group: 'Village powers',
    help: 'The raven adds two votes against a player. He may mark at night, or on the day itself, and move the mark right up to the vote.',
    choices: [
      { value: 'night', label: 'At night' },
      { value: 'beforeVote', label: 'On the day, before the vote' },
    ],
    whenRole: 'raven',
    default: 'night',
  },
  {
    id: 'wolfTieBreak',
    label: 'Tie between wolves',
    group: 'Wolves',
    help: 'When the pack splits its vote, the infectious father names the victim if he is alive. This decides who names it when he is not.',
    choices: [
      { value: 'random', label: 'Random victim' },
      { value: 'host', label: 'The host picks' },
    ],
    default: 'random',
  },
  {
    id: 'wolfChat',
    label: 'Pack whispers',
    group: 'Wolves',
    help: 'When the wolves may write to each other on their phones. Whatever is said there never reaches the table.',
    choices: [
      { value: 'wake', label: 'While choosing a victim' },
      { value: 'night', label: 'All night' },
      { value: 'always', label: 'All game' },
    ],
    default: 'wake',
  },
  {
    id: 'loverChat',
    label: 'Lovers talk',
    group: 'Village powers',
    help: 'Whether Cupid\'s pair may write to each other. Their window closes for good when one of the two dies.',
    choices: [
      { value: 'always', label: 'Any hour' },
      { value: 'off', label: 'Never' },
    ],
    whenRole: 'cupid',
    default: 'always',
  },
  {
    id: 'mayor.doubleVote',
    label: 'Mayor votes twice',
    group: 'Table',
    help: 'The elected mayor holds two votes in every tally. Turning this off leaves the title itself and nothing else.',
    choices: [
      { value: true, label: 'Two votes' },
      { value: false, label: 'One vote' },
    ],
    default: true,
  },
  {
    id: 'hunter.shoots',
    label: 'Hunter shoots',
    group: 'Village powers',
    help: 'When the hunter dies he takes one player with him. Turning this off deals the card without its parting shot.',
    choices: [
      { value: true, label: 'Takes a player' },
      { value: false, label: 'No shot' },
    ],
    whenRole: 'hunter',
    default: true,
  },
  {
    id: 'thief.swap',
    label: 'Thief swaps',
    group: 'Village powers',
    help: 'The thief may trade his card for one of two spare cards on the first night.',
    choices: [
      { value: true, label: 'Two spare cards' },
      { value: false, label: 'Keeps his card' },
    ],
    whenRole: 'thief',
    default: true,
  },
  {
    id: 'girl.spy',
    label: 'Little girl spies',
    group: 'Village powers',
    help: 'The little girl may peek at the wolves while they choose, and the host may catch her at it.',
    choices: [
      { value: true, label: 'May spy' },
      { value: false, label: 'Stays in bed' },
    ],
    whenRole: 'little-girl',
    default: true,
  },
];

export const defaultSettings = (): Settings =>
  Object.fromEntries(SETTING_DEFS.map(def => [def.id, def.default]));

export const settingDefault = (id: string): SettingValue => {
  const def = SETTING_DEFS.find(entry => entry.id === id);
  // Not `??`: a rule whose default is null would read as false instead.
  return def ? def.default : false;
};

// The label of the value a setting holds now, for its button.
export const settingLabel = (def: SettingDef, value: SettingValue | undefined): string => {
  const current = value === undefined ? def.default : value;
  const choice = def.choices?.find(entry => entry.value === current);
  if (choice) return choice.label;

  return current === true ? 'On' : current === false ? 'Off' : String(current);
};

// The value the next tap should store: the following choice, or the other
// side of a toggle. Counts are stepped, never cycled.
export const nextSettingValue = (
  def: SettingDef,
  value: SettingValue | undefined,
): SettingValue => {
  if (def.count) return value === undefined ? def.default : value;
  if (!def.choices || def.choices.length === 0) return value === true ? false : true;

  const current = value === undefined ? def.default : value;
  const index = def.choices.findIndex(entry => entry.value === current);
  return def.choices[(index + 1) % def.choices.length].value;
};

// One rule read out of a setup, defaulted for a table that never set it.
export const setupSetting = (setup: RoleSetup, id: string): SettingValue =>
  setup.settings?.[id] ?? settingDefault(id);

// The host's table: how many seats each role takes and the house rules. Seats
// nobody claims are filled with villagers; the potions a witch holds are rules
// like any other.
export interface RoleSetup {
  counts: Record<string, number>;
  settings: Settings;
}

export const defaultRoleSetup = (): RoleSetup => ({
  counts: {},
  settings: defaultSettings(),
});

// A setup saved before every rule lived in one record: its potion counts and
// its old options fold into the settings, so an evening that was left set up
// opens exactly as the host left it.
export const migrateSetup = (
  saved: RoleSetup & {
    options?: Record<string, SettingValue>;
    witchHealCharges?: number;
    witchPoisonCharges?: number;
  },
): RoleSetup => {
  const settings: Settings = {
    ...defaultSettings(),
    ...(saved.options ?? {}),
    ...(saved.settings ?? {}),
  };

  if (typeof saved.witchHealCharges === 'number') {
    settings['witch.healCharges'] = saved.witchHealCharges;
  }
  if (typeof saved.witchPoisonCharges === 'number') {
    settings['witch.poisonCharges'] = saved.witchPoisonCharges;
  }

  return { counts: { ...(saved.counts ?? {}) }, settings };
};

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
const withWitchPotions = (role: PlayableRole, setup: RoleSetup): PlayableRole => {
  const potions = (id: string) => {
    const value = setupSetting(setup, id);
    return typeof value === 'number' ? Math.max(0, Math.floor(value)) : 1;
  };

  return {
    ...role,
    nightActions: role.nightActions?.map(option =>
      option.id === 'heal'
        ? { ...option, charges: potions('witch.healCharges') }
        : option.id === 'poison'
        ? { ...option, charges: potions('witch.poisonCharges') }
        : option,
    ),
  };
};

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

// A setup built from a list of roles. The potions a witch holds, and every
// other rule, come from the settings' own defaults.
export const setupFromRoles = (roles: PlayableRole[]): RoleSetup => ({
  counts: countsFromRoles(roles),
  settings: defaultSettings(),
});
