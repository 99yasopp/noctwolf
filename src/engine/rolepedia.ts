export interface RoleInfo {
  id: string;
  name: string;
  description: string;
  tips: string[];
}

export const RoleDatabase: Record<string, RoleInfo> = {
  'seer': {
    id: 'seer',
    name: 'Seer',
    description: 'Each night, the Seer can peek at the role of one player.',
    tips: ['Be careful not to reveal yourself too early.', 'If you see a Wolf, try to guide the village without outing yourself.']
  },
  'wolf': {
    id: 'wolf',
    name: 'Simple Wolf',
    description: 'Each night, the wolves choose a villager to eliminate.',
    tips: ['Act like a villager during the day.', 'Try to deflect suspicion onto others.']
  },
  // We can dynamically add to this map as we create/generate new roles
};

export const getRoleInfo = (roleId: string): RoleInfo | undefined => {
  return RoleDatabase[roleId];
};
