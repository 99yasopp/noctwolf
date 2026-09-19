import React, { createContext, useContext, useState, useEffect } from 'react';
import { GameManager } from '../engine/gameManager';
import { NarratorServer } from '../network/socketServer';

const GameContext = createContext<GameManager | null>(null);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [manager, setManager] = useState<GameManager | null>(null);

  useEffect(() => {
    // Initialize server and game manager only after component mounts
    const server = new NarratorServer();
    const newManager = new GameManager([], [], server);
    setManager(newManager);
  }, []);

  if (!manager) {
    // Return null or a loading component until initialized
    return null; 
  }

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
