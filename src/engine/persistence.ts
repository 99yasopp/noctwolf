import { GameState } from './state';

export const saveGameState = (state: GameState): string => {
  const data = {
    currentPhase: state.currentPhase,
    players: state.players,
    president: {
      // We would extend this to capture specific PresidentManager state
    }
  };
  return JSON.stringify(data);
};

export const loadGameState = (json: string): any => {
  return JSON.parse(json);
};
