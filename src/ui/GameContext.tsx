import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { GameManager } from '../engine/gameManager';
import { buildRoleSet } from '../engine/roleSet';
import { RoleSetup, buildSetupRoles, setupFromRoles } from '../engine/setup';
import { Player } from '../engine/types';
import { lobby } from '../network/lobby';

export type AppMode = 'lobby' | 'narrator' | 'player';

interface GameContextValue {
  mode: AppMode;
  // The player this device controls. The host plays from the dashboard.
  localPlayer: Player | null;
  // Only set on the host; guests read their state from the network instead.
  manager: GameManager | null;
  // The table the host built: its counts decide the deal, its options the rules.
  startHostGame: (players: Player[], localPlayer: Player, setup?: RoleSetup) => void;
  enterPlayerMode: (localPlayer: Player) => void;
  returnToLobby: () => void;
  // Deal a fresh game to the players already at the table.
  rematch: () => void;
  // Keep the room and the seats, but leave the finished game behind: the host
  // wants a different table for the next round.
  changeTable: () => void;
  // Bumped for every fresh deal, so the screens can drop the notes they kept
  // about the previous game.
  gameId: number;
}

const GameContext = createContext<GameContextValue | null>(null);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<AppMode>('lobby');
  const [localPlayer, setLocalPlayer] = useState<Player | null>(null);
  const [manager, setManager] = useState<GameManager | null>(null);
  const [gameId, setGameId] = useState(0);
  const managerRef = useRef<GameManager | null>(null);
  // The table the host built; a rematch re-deals from the same one.
  const setupRef = useRef<RoleSetup>(setupFromRoles(buildRoleSet(3)));

  const startHostGame = useCallback((players: Player[], host: Player, setup?: RoleSetup) => {
    // A table that comes back from a finished game still has its dead, and a
    // new deal has to start from a living roster.
    lobby.resetRoster();
    const game = new GameManager(players, lobby, true);
    managerRef.current = game;
    setupRef.current = setup ?? setupFromRoles(buildRoleSet(players.length));
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

      if (message.type === 'NIGHT_PASS') {
        current.passNightAction(playerId, message.payload?.action);
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

      if (message.type === 'MAYOR_VOLUNTEER') {
        current.volunteerForMayor(playerId);
        return;
      }

      if (message.type === 'MAYOR_VOTE') {
        current.handleMayorVote(playerId, message.payload?.targetId);
        return;
      }

      if (message.type === 'SUCCESSION') {
        current.handleSuccession(playerId, message.payload?.targetId);
        return;
      }

      if (message.type === 'STATE_REQUEST') {
        current.sendStateTo(playerId);
      }
    });

    game.start(buildSetupRoles(setupRef.current, players.length), setupRef.current.options);
    setGameId(id => id + 1);
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
    // The same table, re-dealt: the counts are rebuilt for the seats that are
    // actually still there, in case somebody left.
    const roster = lobby.getPlayers();
    current.start(buildSetupRoles(setupRef.current, roster.length), setupRef.current.options);
    setGameId(id => id + 1);
    setMode('narrator');
  }, []);

  // Keep the room up, drop the finished game. The host lands in the waiting
  // room with the same seats and can pick another table before dealing again.
  const changeTable = useCallback(() => {
    managerRef.current = null;
    setManager(null);
    setLocalPlayer(null);
    // Player actions have no game to reach any more.
    lobby.onGameMessage(null);
    setMode('lobby');
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
      value={{ mode, localPlayer, manager, startHostGame, enterPlayerMode, returnToLobby, rematch, changeTable, gameId }}
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
