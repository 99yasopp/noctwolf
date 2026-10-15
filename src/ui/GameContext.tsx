import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { GameManager } from '../engine/gameManager';
import { getPreset } from '../engine/roleSet';
import { Player } from '../engine/types';
import { lobby } from '../network/lobby';

export type AppMode = 'lobby' | 'narrator' | 'player';

interface GameContextValue {
  mode: AppMode;
  // The player this device controls. The host plays from the dashboard.
  localPlayer: Player | null;
  // Only set on the host; guests read their state from the network instead.
  manager: GameManager | null;
  startHostGame: (players: Player[], localPlayer: Player, presetId?: string) => void;
  enterPlayerMode: (localPlayer: Player) => void;
  returnToLobby: () => void;
  // Deal a fresh game to the players already at the table.
  rematch: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<AppMode>('lobby');
  const [localPlayer, setLocalPlayer] = useState<Player | null>(null);
  const [manager, setManager] = useState<GameManager | null>(null);
  const managerRef = useRef<GameManager | null>(null);
  // The setup the host picked; a rematch re-deals from the same one.
  const presetRef = useRef<string>('simple');

  const startHostGame = useCallback((players: Player[], host: Player, presetId: string = 'simple') => {
    const game = new GameManager(players, lobby, true);
    managerRef.current = game;
    presetRef.current = presetId;
    setManager(game);
    setLocalPlayer(host);

    // Player actions arrive over the lobby server and are attributed to a
    // player id by the socket that sent them.
    lobby.onGameMessage((playerId, message) => {
      const current = managerRef.current;
      if (!current) return;

      if (message.type === 'NIGHT_ACTION') {
        current.handleNightAction(
          playerId,
          message.payload?.action,
          message.payload?.targetId,
        );
        return;
      }

      if (message.type === 'VOTE_CAST') {
        current.handleVote(playerId, message.payload?.targetId);
        return;
      }

      if (message.type === 'REVENGE') {
        current.handleRevenge(playerId, message.payload?.targetId);
        return;
      }

      if (message.type === 'STATE_REQUEST') {
        current.sendStateTo(playerId);
      }
    });

    game.start(getPreset(presetId).build(players.length));
    setMode('narrator');
  }, []);

  const enterPlayerMode = useCallback((player: Player) => {
    setLocalPlayer(player);
    setMode('player');
  }, []);

  // A rematch keeps the room, the sockets and the seats: nobody has to join
  // again. The roster is revived and GameManager.start() re-deals and
  // re-broadcasts, so every player gets a new role in the seat they already
  // hold.
  const rematch = useCallback(() => {
    const current = managerRef.current;
    if (!current) return;

    lobby.resetRoster();
    current.start(getPreset(presetRef.current).build(lobby.getPlayers().length));
    setMode('narrator');
  }, []);

  const returnToLobby = useCallback(() => {
    const wasHost = managerRef.current !== null;

    managerRef.current = null;
    setManager(null);
    setLocalPlayer(null);

    if (wasHost) {
      lobby.closeRoom();
    } else {
      lobby.disconnectClient();
    }

    setMode('lobby');
  }, []);

  return (
    <GameContext.Provider
      value={{ mode, localPlayer, manager, startHostGame, enterPlayerMode, returnToLobby, rematch }}
    >
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};
