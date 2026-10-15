import { Role } from './roles';
import { Action } from './types';

// The whitelist of allowed actions the AI can use
export const ALLOWED_ACTIONS = ['kill_action', 'protect_action', 'apply_punishment_action', 'establish_channel_action'];

export const validateRole = (role: any): { valid: boolean; error?: string } => {
  // 1. Structural Check
  if (!role || typeof role !== 'object') return { valid: false, error: 'Role must be an object' };
  if (!role.name || !role.team) return { valid: false, error: 'Missing basic fields (name/team)' };
  if (!Array.isArray(role.abilities)) return { valid: false, error: 'abilities must be an array' };

  // 2. Logic Check
  for (const ability of role.abilities) {
    if (!ability || !Array.isArray(ability.actions)) {
      return { valid: false, error: 'Each ability must define an actions array' };
    }

    for (const action of ability.actions) {
      if (!action || !ALLOWED_ACTIONS.includes(action.id)) {
        return { valid: false, error: `Invalid action used: ${action?.id}` };
      }
    }
  }

  return { valid: true };
};

export const simulateRole = (role: Role): { valid: boolean; error?: string } => {
  if (!role || !Array.isArray(role.abilities)) {
    return { valid: false, error: 'Role has no abilities to simulate.' };
  }

  // Check for priority conflicts. Actions without a declared priority are
  // left alone: a generated role rarely sets one, and treating every absent
  // value as a conflict would reject every role with two actions.
  const priorities = role.abilities
    .flatMap(a =>
      Array.isArray(a?.actions) ? a.actions.map(act => act?.priority) : []
    )
    .filter(priority => typeof priority === 'number');
  const hasDuplicates = new Set(priorities).size !== priorities.length;
  
  if (hasDuplicates) {
    return { valid: false, error: 'Conflict detected: Multiple actions have the same priority.' };
  }
  
  return { valid: true };
};
