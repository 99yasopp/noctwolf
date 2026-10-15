// Playing advice, keyed by the id of a playable role. The role's own name,
// team and description live in roleSet.ts; only the coaching lives here.

export interface RoleInfo {
  id: string;
  name: string;
  tips: string[];
}

export const RoleDatabase: Record<string, RoleInfo> = {
  werewolf: {
    id: 'werewolf',
    name: 'Werewolf',
    tips: [
      'Look like a villager: say what a villager would say, at the same speed.',
      'Do not always eat the loudest player. Eat the one who trusts you.',
      'The first night is peaceful here, so the first day vote decides who leaves.',
    ],
  },
  seer: {
    id: 'seer',
    name: 'Seer',
    tips: [
      'Reveal yourself when you have a wolf, not before: a dead seer tells nobody anything.',
      'If you find a wolf, push the vote without saying how you know.',
      'A "not a werewolf" result is worth keeping quiet for a round: it can clear an ally later.',
    ],
  },
  villager: {
    id: 'villager',
    name: 'Villager',
    tips: [
      'Villagers win by asking who is useful and who is only talking.',
      'Count the votes before you speak: a split vote saves the wolves.',
    ],
  },
  guard: {
    id: 'guard',
    name: 'Guard',
    tips: [
      'Protect the player the wolves are afraid of, not the one they like.',
      'You cannot shield the same player twice in a row, so think one night ahead.',
    ],
  },
  witch: {
    id: 'witch',
    name: 'Witch',
    tips: [
      'Your healing potion is only spent when it actually saves someone.',
      'Save the poison for a night when you are sure, not for revenge.',
    ],
  },
  hunter: {
    id: 'hunter',
    name: 'Hunter',
    tips: [
      'You have no night action, so survive the day: being voted out is how you shoot.',
      'Say who you will shoot if the village votes you out. It changes the vote.',
    ],
  },
  mayor: {
    id: 'mayor',
    name: 'Mayor',
    tips: [
      'Your double vote decides ties. Ask for two names, then pick.',
      'Announcing that you are the mayor makes you a target and a leader at once.',
    ],
  },
  cupid: {
    id: 'cupid',
    name: 'Cupid',
    tips: [
      'You are tied to whoever you pick: if they die, you die.',
      'Tie yourself to someone you trust, not to the most suspicious player.',
    ],
  },
};

export const getRoleInfo = (roleId: string): RoleInfo | undefined => RoleDatabase[roleId];

export const getRoleTips = (roleId: string): string[] => RoleDatabase[roleId]?.tips ?? [];
