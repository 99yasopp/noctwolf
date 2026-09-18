import React, { createContext, useContext, useState } from 'react';
import { GameManager } from '/home/yasopp/Documents/Program/LoupGarou/src/engine/gameManager';

const GameContext = createContext<GameManager | null>(null);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize the manager here (or load it from storage later)
  const [manager] = useState(new GameManager([], [])); 

  return (
    <GameContext.Provider value={manager}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};
