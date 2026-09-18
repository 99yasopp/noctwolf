import React, { createContext, useContext, useState } from 'react';
import { GameManager } from '../engine/gameManager';
import { NarratorServer } from '../network/socketServer';

const GameContext = createContext<GameManager | null>(null);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize server and game manager with empty players/roles for now
  const [server] = useState(() => new NarratorServer());
  const [manager] = useState(() => new GameManager([], [], server)); 

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
