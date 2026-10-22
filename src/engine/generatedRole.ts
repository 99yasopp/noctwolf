import { NightActionOption, PlayableRole } from './roleSet';
import { Role } from './roles';
import { validateRole, simulateRole } from './roleGenerator';

// The AI writes in the abstract ability system; the playable engine only runs
// the actions below. Anything else is reported at review time rather than
// silently ignored.
export const TRANSLATABLE_ACTIONS: Record<string, NightActionOption> = {
  kill_action: { id: 'kill', label: 'Devour a player', kind: 'attack' },
  protect_action: {
    id: 'protect',
    label: 'Shield a player',
    kind: 'protect',
    allowSelf: true,
  },
  apply_punishment_action: {
    id: 'punish',
    label: 'Punish a player',
    kind: 'poison',
    oncePerGame: true,
  },
  establish_channel_action: {
    id: 'channel',
    label: 'Bind a player to you',
    kind: 'link',
  },
};

export interface DraftRole {
  role: PlayableRole;
  // Actions the AI asked for that this game cannot run.
  unsupported: string[];
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'role';

// Models sometimes wrap JSON in a ``` fence even when asked for raw JSON.
export const stripCodeFence = (text: string): string => {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text.trim());
  return (fenced ? fenced[1] : text).trim();
};

// Turn whatever the AI produced into something the engine can actually run,
// or explain why it cannot.
export const translateGeneratedRole = (
  generated: any,
): { draft?: DraftRole; error?: string } => {
  const validation = validateRole(generated);
  if (!validation.valid) return { error: validation.error };

  const simulation = simulateRole(generated as Role);
  if (!simulation.valid) return { error: simulation.error };

  const team = generated.team;
  if (team !== 'Village' && team !== 'Wolf' && team !== 'Solitary') {
    return { error: `Unknown team: ${String(team)}` };
  }

  const requested: string[] = [];
  generated.abilities.forEach((ability: any) => {
    (ability?.actions ?? []).forEach((action: any) => {
      if (typeof action?.id === 'string' && !requested.includes(action.id)) {
        requested.push(action.id);
      }
    });
  });

  const nightActions: NightActionOption[] = [];
  const unsupported: string[] = [];

  requested.forEach(id => {
    const option = TRANSLATABLE_ACTIONS[id];
    if (!option) {
      unsupported.push(id);
      return;
    }
    if (!nightActions.some(existing => existing.id === option.id)) {
      nightActions.push(option);
    }
  });

  if (nightActions.length === 0 && unsupported.length === 0) {
    return { error: 'The role has no actions at all.' };
  }

  return {
    draft: {
      role: {
        id: `custom-${slug(String(generated.name))}`,
        name: String(generated.name),
        team,
        description:
          typeof generated.description === 'string' && generated.description.trim()
            ? generated.description
            : 'A role of your own making.',
        nightActions,
      },
      unsupported,
    },
  };
};
