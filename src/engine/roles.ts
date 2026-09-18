import { TriggerType, Action, Condition } from './types';

export interface Role {
  id: string;
  name: string;
  team: 'Village' | 'Wolf' | 'Solitary';
  // Mapping of events (triggers) to lists of actions and conditions
  abilities: {
    trigger: TriggerType;
    conditions?: Condition[];
    actions: Action[];
  }[];
}

// Example: How a "Detective" role would be defined in our engine
export const DetectiveRole: Role = {
  id: 'detective',
  name: 'Detective',
  team: 'Village',
  abilities: [
    {
      trigger: 'OnPhaseStart',
      actions: [
        // This is where we would attach the "Inspect" action logic
      ]
    }
  ]
};
