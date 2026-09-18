import { Role } from './roles';
import { Action } from './types';

// The whitelist of allowed actions the AI can use
const ALLOWED_ACTIONS = ['kill_action', 'protect_action', 'apply_punishment_action', 'establish_channel_action'];

export const validateRole = (role: any): { valid: boolean; error?: string } => {
  // 1. Structural Check
  if (!role.name || !role.team) return { valid: false, error: 'Missing basic fields (name/team)' };

  // 2. Logic Check
  for (const ability of role.abilities) {
    for (const action of ability.actions) {
      if (!ALLOWED_ACTIONS.includes(action.id)) {
        return { valid: false, error: `Invalid action used: ${action.id}` };
      }
    }
  }

  return { valid: true };
};

export const simulateRole = (role: Role): { valid: boolean; error?: string } => {
  // Check for priority conflicts
  const priorities = role.abilities.flatMap(a => a.actions.map(act => act.priority));
  const hasDuplicates = new Set(priorities).size !== priorities.length;
  
  if (hasDuplicates) {
    return { valid: false, error: 'Conflict detected: Multiple actions have the same priority.' };
  }
  
  return { valid: true };
};
