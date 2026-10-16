import { Team } from './types';

// What a night action does when it is resolved. The engine keys its
// resolution order off this, not off the role, so a new role only has to
// declare which kinds of action it uses.
export type ActionKind =
  | 'attack'
  | 'extraAttack'
  | 'wolfAttack'
  | 'infect'
  | 'protect'
  | 'heal'
  | 'poison'
  | 'inspect'
  | 'link'
  | 'block'
  | 'fox'
  | 'spy'
  | 'curse'
  | 'side'
  | 'model';

// One choice a role gets to make at night.
export interface NightActionOption {
  id: string;
  label: string;
  kind: ActionKind;
  // May the player point the action at themselves?
  allowSelf?: boolean;
  // May a wolf point the action at another wolf?
  allowPack?: boolean;
  // How many times the whole game this action may be used. Left out means it
  // can be used every night; the host can set it per role.
  charges?: number;
  // Older custom roles say it this way. Kept so a role made before charges
  // existed still works; `charges` wins when both are present.
  oncePerGame?: boolean;
}

// How many uses one action has in a game. Unlimited unless the role or the
// host says otherwise.
export const actionChargeLimit = (option?: NightActionOption): number => {
  if (!option) return Number.POSITIVE_INFINITY;
  if (typeof option.charges === 'number') return Math.max(0, option.charges);
  return option.oncePerGame ? 1 : Number.POSITIVE_INFINITY;
};

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
  // The wolves' bite and their infection cannot touch this role.
  wolfImmune?: boolean;
  // May stop the day to name a player's role, and kill them if it is right.
  guessesRoles?: boolean;
  // Wins the game outright by being the last player alive.
  winsAlone?: boolean;
  // Growls at daybreak when one of its two neighbours is a wolf.
  bearTamer?: boolean;
  // Players carrying the same tag know each other: sisters, brothers.
  alliance?: string;
  // Voted out, he is unmasked, survives, and never votes again.
  survivesVote?: boolean;
  // Pays for a vote that stays tied, and bans tomorrow's voters on his way out.
  scapegoat?: boolean;
  // Once per game: one more vote right after an execution.
  judge?: boolean;
  // Wins outright by the first night's bite or the first day's vote.
  angel?: boolean;
}

export const WerewolfRole: PlayableRole = {
  id: 'werewolf',
  name: 'Werewolf',
  team: 'Wolf',
  description: 'Each night you devour one player. Stay hidden by day.',
  nightActions: [{ id: 'kill', label: 'Devour a player', kind: 'attack' }],
};

// The lone half of the Red Wolf's night is folded into the same stage: nothing
// resolves until the night ends, so the silence still lands on the night it is
// sent, and the pack vote still works.
export const RedWolfRole: PlayableRole = {
  id: 'red-wolf',
  name: 'Red Wolf',
  team: 'Wolf',
  description:
    'You hunt with the pack, then silence a player: their night action fails and their powers stay dead all through the coming day. Never the same player twice.',
  nightActions: [
    { id: 'kill', label: 'Devour a player', kind: 'attack' },
    { id: 'silence', label: 'Silence a player', kind: 'block' },
  ],
};

export const AlienRole: PlayableRole = {
  id: 'alien',
  name: 'Alien',
  team: 'Solitary',
  description:
    "The wolves cannot bite or infect you. During the day you may name a player's role: right, they die; wrong, you do. You win only as the last player alive.",
  wolfImmune: true,
  guessesRoles: true,
  winsAlone: true,
};

export const BigBadWolfRole: PlayableRole = {
  id: 'big-bad-wolf',
  name: 'Big Bad Wolf',
  team: 'Wolf',
  description:
    'You hunt with the pack, then devour a second player on your own. You lose that second bite for good once any wolf dies.',
  nightActions: [
    { id: 'kill', label: 'Devour a player', kind: 'attack' },
    { id: 'kill2', label: 'Devour a second player', kind: 'extraAttack' },
  ],
};

export const InfectiousFatherRole: PlayableRole = {
  id: 'infectious-father',
  name: 'Infectious Father',
  team: 'Wolf',
  description:
    "You hunt with the pack. Once in the game you may infect the pack's victim instead of devouring them: they become a werewolf and keep their powers.",
  nightActions: [
    { id: 'kill', label: 'Devour a player', kind: 'attack' },
    {
      id: 'infect',
      label: 'Infect the victim instead',
      kind: 'infect',
      charges: 1,
      allowSelf: true,
    },
  ],
};

export const WhiteWerewolfRole: PlayableRole = {
  id: 'white-werewolf',
  name: 'White Werewolf',
  team: 'Wolf',
  description:
    'You hunt with the pack. Every second night you may devour one of your own kin. You win only as the last player alive.',
  nightActions: [
    { id: 'kill', label: 'Devour a player', kind: 'attack' },
    { id: 'wolfkill', label: 'Devour a werewolf', kind: 'wolfAttack' },
  ],
  winsAlone: true,
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
    { id: 'heal', label: 'Use the healing potion', kind: 'heal', allowSelf: true, charges: 1 },
    { id: 'poison', label: 'Use the poison', kind: 'poison', charges: 1 },
  ],
};

export const HunterRole: PlayableRole = {
  id: 'hunter',
  name: 'Hunter',
  team: 'Village',
  description: 'You have no night action, but when you die you take one player down with you.',
  revengeOnDeath: true,
};

export const FoxRole: PlayableRole = {
  id: 'fox',
  name: 'Fox',
  team: 'Village',
  description:
    'Each night you sniff at a player and their two nearest neighbours. One wolf among them and you keep your nose; find nothing and you lose it for good.',
  nightActions: [{ id: 'sniff', label: 'Sniff out a player and their neighbours', kind: 'fox' }],
};

export const LittleGirlRole: PlayableRole = {
  id: 'little-girl',
  name: 'Little Girl',
  team: 'Village',
  description:
    'At night you may spy on the wolves and learn who they are. If the wolves catch you, you die in the victim\'s place.',
  nightActions: [{ id: 'spy', label: 'Spy on the wolves', kind: 'spy', allowSelf: true }],
};

// No night action: the bear does the work at daybreak.
export const BearTamerRole: PlayableRole = {
  id: 'bear-tamer',
  name: 'Bear Tamer',
  team: 'Village',
  description:
    'Your bear growls at daybreak whenever one of your two neighbours is a wolf. The whole table hears it.',
  bearTamer: true,
};

export const RavenRole: PlayableRole = {
  id: 'raven',
  name: 'Raven',
  team: 'Village',
  description:
    "Each night you place two secret votes against one player. They count in the next day's vote, on top of whatever the table decides.",
  nightActions: [{ id: 'curse', label: 'Add two votes against a player', kind: 'curse' }],
};

// The two sisters and the three brothers are the same card taken several
// times: each copy knows the others from the first night.
export const TwoSistersRole: PlayableRole = {
  id: 'two-sisters',
  name: 'Two Sisters',
  team: 'Village',
  description:
    'You and your sister know each other from the first night. Pick this card twice so that both sisters are at the table.',
  alliance: 'sisters',
};

export const ThreeBrothersRole: PlayableRole = {
  id: 'three-brothers',
  name: 'Three Brothers',
  team: 'Village',
  description:
    'You and your brothers know each other from the first night. Pick this card three times so that the trio is at the table.',
  alliance: 'brothers',
};

export const WolfDogRole: PlayableRole = {
  id: 'wolf-dog',
  name: 'Wolf-Dog',
  team: 'Village',
  description:
    'On the first night you choose your camp once and for all: the village, or the wolves. Stay undecided and you stay a villager.',
  nightActions: [
    { id: 'stay', label: 'Stay with the village', kind: 'side', allowSelf: true, charges: 1 },
    { id: 'join', label: 'Join the wolves', kind: 'side', allowSelf: true, charges: 1 },
  ],
};

export const WildChildRole: PlayableRole = {
  id: 'wild-child',
  name: 'Wild Child',
  team: 'Village',
  description:
    'On the first night you pick a role model. The moment your model dies you become a Werewolf, keeping your own card.',
  nightActions: [{ id: 'model', label: 'Choose a role model', kind: 'model', charges: 1 }],
};

// He acts through THIEF_SWAP rather than a night action: the two spare cards
// only exist once the deal is done.
export const ThiefRole: PlayableRole = {
  id: 'thief',
  name: 'Thief',
  team: 'Village',
  description:
    'On the first night two spare cards lie face down in front of you. You may keep yours or take one of them, whatever it turns out to be.',
};

export const ScapegoatRole: PlayableRole = {
  id: 'scapegoat',
  name: 'Scapegoat',
  team: 'Village',
  description:
    'When a vote stays tied after the re-vote, you die in the village\'s place. Before you go you may bar players from voting the next day.',
  scapegoat: true,
};

export const VillageIdiotRole: PlayableRole = {
  id: 'village-idiot',
  name: 'Village Idiot',
  team: 'Village',
  description:
    'The village cannot get rid of you: voted out, you are unmasked and survive, but you never vote again.',
  survivesVote: true,
};

export const StutteringJudgeRole: PlayableRole = {
  id: 'stuttering-judge',
  name: 'Stuttering Judge',
  team: 'Village',
  description:
    'Once per game, right after an execution, you may demand a second vote before the night falls.',
  judge: true,
};

export const AngelRole: PlayableRole = {
  id: 'angel',
  name: 'Angel',
  team: 'Village',
  description:
    'You win outright if the first night attack or the first day vote takes you. Survive it and you are a simple villager.',
  angel: true,
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
  RedWolfRole,
  BigBadWolfRole,
  InfectiousFatherRole,
  WhiteWerewolfRole,
  AlienRole,
  SeerRole,
  VillagerRole,
  GuardRole,
  WitchRole,
  HunterRole,
  CupidRole,
  FoxRole,
  LittleGirlRole,
  BearTamerRole,
  RavenRole,
  TwoSistersRole,
  ThreeBrothersRole,
  WolfDogRole,
  WildChildRole,
  ThiefRole,
  ScapegoatRole,
  VillageIdiotRole,
  StutteringJudgeRole,
  AngelRole,
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
  if (playerCount >= 8) set.push(CupidRole);

  return fill(set, playerCount);
};

// Everything at once, for a table that knows the game well.
export const buildChaosRoleSet = (playerCount: number): PlayableRole[] => {
  if (playerCount <= 0) return [];

  const wolfCount = Math.max(1, Math.round(playerCount / 3));
  const set: PlayableRole[] = [];
  for (let i = 0; i < wolfCount; i++) set.push(WerewolfRole);

  [SeerRole, GuardRole, WitchRole, HunterRole, CupidRole].forEach(role => {
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
    description: 'Adds the guard, witch, hunter and cupid as the table grows.',
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
