import { Action, ActionContext } from './types';

export const KillAction: Action = {
  id: 'kill_action',
  name: 'Kill',
  priority: 1,
  execute: (context: ActionContext) => {
    context.targets.forEach(target => {
      console.log(`${target.name} was killed by ${context.source.name}`);
      target.isAlive = false;
    });
  }
};

export const ProtectAction: Action = {
  id: 'protect_action',
  name: 'Protect',
  priority: 0,
  execute: (context: ActionContext) => {
    context.targets.forEach(target => {
      console.log(`${target.name} is now protected`);
      target.statusEffects.push('Protected');
    });
  }
};

export const ApplyPunishmentAction: Action = {
  id: 'apply_punishment_action',
  name: 'Apply Punishment',
  priority: 2,
  execute: (context: ActionContext) => {
    context.targets.forEach(target => {
      console.log(`Punishment applied to ${target.name}`);
      target.isAlive = false;
    });
  }
};

export const EstablishChannelAction: Action = {
  id: 'establish_channel_action',
  name: 'Establish Private Channel',
  priority: 2,
  execute: (context: ActionContext) => {
    console.log(`Channel established between: ${context.targets.map(t => t.name).join(', ')}`);
  }
};
