import { Player } from '../engine/types';
import { NarratorServer } from './socketServer';
import { GuestClient, createGuestClient } from './socketClient';
import { createZeroconf } from './nativeModules';
import { NetworkMessage } from './protocol';
import { GameTransport } from '../engine/transport';
import { Platform } from 'react-native';

type ZeroconfLike = any;

export const GAME_PORT = 12345;

// Connecting can be genuinely slow (an emulator NAT hop measured ~4s), and a
// premature timeout would report failure for a connection that then succeeds.
const JOIN_TIMEOUT_MS = 15000;

// The host plays from the narrator dashboard and has no socket of its own, so
// anything addressed to it is handled locally by the UI instead.
export const HOST_PLAYER_ID = 'host-1';

// Stable for the life of the app run. The host keys a seat by player id, so a
// guest that reconnects has to send the id it used the first time to reclaim
// its seat instead of appearing as a second player.
export const LOCAL_GUEST_ID = `g-${Math.random().toString(36).substring(2, 10)}`;

// Discovery is best-effort. If the native module is missing or fails to load
// we simply disable it and let players join by IP.
let zeroconf: ZeroconfLike | null = null;
let zeroconfUnavailable = false;

export class LobbyManager implements GameTransport {
  private roomCode: string = '';
  public players: Player[] = [];
  public server?: NarratorServer;
  public client?: GuestClient;

  // The host can only talk to individual players through their socket, so the
  // join message is what establishes this mapping.
  private sockets = new Map<string, any>();
  private socketOwners = new Map<any, string>();

  private gameMessageHandler:
    | ((playerId: string, message: NetworkMessage) => void)
    | null = null;

  private discoveredHosts: any[] = [];
  private foundListenerAttached = false;

  // The last address this device joined, so a dropped guest can come back to
  // the same host without retyping it.
  private lastHost: string | null = null;
  private lastPort: number = GAME_PORT;

  // The token this device was given for its seat, kept here so a reconnect
  // can present it again.
  private seatToken: string | null = null;

  // Seats already handed out, by player id. Player ids travel in the roster,
  // so they are not a secret: the token is what proves a device owns a seat.
  private seatTokens = new Map<string, string>();

  // The roster is owned here but rendered elsewhere; screens subscribe so a
  // player joining, leaving or being removed shows up without polling.
  private rosterListeners = new Set<() => void>();

  onRosterChanged(listener: () => void): () => void {
    this.rosterListeners.add(listener);
    return () => {
      this.rosterListeners.delete(listener);
    };
  }

  private notifyRoster() {
    this.rosterListeners.forEach(listener => listener());
  }

  private getZeroconf(): ZeroconfLike | null {
    if (zeroconfUnavailable) return null;

    if (!zeroconf) {
      zeroconf = createZeroconf();
      if (!zeroconf) {
        zeroconfUnavailable = true;
        return null;
      }
    }

    if (!this.foundListenerAttached) {
      try {
        zeroconf.on('found', (service: any) => {
          this.discoveredHosts.push(service);
          console.log('Found service:', service);
        });
        this.foundListenerAttached = true;
      } catch (error) {
        console.error('Failed to attach the discovery listener', error);
        zeroconfUnavailable = true;
        return null;
      }
    }

    return zeroconf;
  }

  getRoomCode(): string {
    return this.roomCode;
  }

  // Returns the room code, or null when hosting could not be started.
  generateRoomCode(): string | null {
    if (Platform.OS === 'web') {
      console.warn('Networking not supported on web');
      return null;
    }

    // Reuse one server instance so hosting twice cannot bind the port twice.
    if (!this.server) {
      this.server = new NarratorServer(GAME_PORT);

      this.server.on('message', (msg: any, socket: any) => {
        if (!msg || typeof msg.type !== 'string') return;

        if (msg.type === 'PLAYER_JOIN') {
          const player = msg.payload?.player;
          if (!player?.id) return;

          const gameRunning = this.gameMessageHandler !== null;
          const knownSeat = this.players.some(p => p.id === player.id);

          // Mid-game the roster is frozen: a stranger joining now would have
          // no role and would swing the win conditions.
          if (gameRunning && !knownSeat) {
            this.server?.sendToPlayer(socket, {
              type: 'KICK',
              payload: { reason: 'game-running' },
              timestamp: Date.now(),
            });
            return;
          }

          // A player id is public: it is broadcast with the roster. Only a
          // device holding the token issued for that seat may take it over,
          // which stops a guest from claiming someone else's seat and being
          // sent that player's role.
          const expected = this.seatTokens.get(player.id);
          const claimed = player.id === HOST_PLAYER_ID || (knownSeat && expected !== msg.payload?.token);

          if (claimed) {
            this.server?.sendToPlayer(socket, {
              type: 'KICK',
              payload: { reason: 'seat-taken' },
              timestamp: Date.now(),
            });
            return;
          }

          if (!knownSeat) {
            const token = `${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
            this.seatTokens.set(player.id, token);
            this.server?.sendToPlayer(socket, {
              type: 'SEAT_TOKEN',
              payload: { token },
              timestamp: Date.now(),
            });
          }

          // Only overwrite the seat before the game starts. During a game the
          // reconnect must not revive a dead player or blank their role.
          if (!gameRunning) this.addPlayer(player);

          this.registerSocket(player.id, socket);
          this.broadcastPlayerList();

          // A reconnecting player missed whatever happened while they were
          // away, so replay what is private to them.
          if (gameRunning) {
            this.gameMessageHandler?.(player.id, {
              type: 'STATE_REQUEST',
              payload: {},
              timestamp: Date.now(),
            });
          }
          return;
        }

        const playerId = this.socketOwners.get(socket);
        if (playerId) {
          this.gameMessageHandler?.(playerId, msg);
        } else {
          console.warn(`Ignoring ${msg.type} from an unrecognised client`);
        }
      });

      this.server.on('server-error', (error: any) => {
        console.error('Lobby server error', error);
      });

      // A guest that goes away must not linger in the roster, otherwise the
      // host sees phantom players and can start a game with people who left.
      this.server.on('client-disconnected', (socket: any) => {
        const playerId = this.socketOwners.get(socket);
        if (!playerId) return;

        this.socketOwners.delete(socket);

        // A reconnect registers a fresh socket before the old one's close
        // lands; that stale close must not wipe the new mapping.
        if (this.sockets.get(playerId) !== socket) return;
        this.sockets.delete(playerId);

        // Mid-game the player keeps their seat so they can reconnect; before
        // the game starts they are simply removed.
        const gameRunning = this.gameMessageHandler !== null;
        if (gameRunning) {
          // Keep the seat, but the screen has to be able to say so.
          this.notifyRoster();
          return;
        }

        const before = this.players.length;
        this.removePlayerById(playerId);
        if (this.players.length !== before) {
          this.seatTokens.delete(playerId);
          this.broadcastPlayerList();
        }
      });
    }

    // Binding is explicit now, so players that never host never open a port.
    if (!this.server.start()) {
      console.error('Failed to start the lobby server; hosting is unavailable');
      return null;
    }

    this.roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();

    // Advertising is best-effort: joining by IP still works without it, and a
    // discovery failure must never break hosting.
    const zc = this.getZeroconf();
    if (zc) {
      try {
        zc.publishService('http', 'tcp', 'local.', 'WerewolfServer', GAME_PORT, {
          roomCode: this.roomCode,
        });
      } catch (error) {
        console.error('Failed to advertise the room; players can still join by IP', error);
      }
    }

    return this.roomCode;
  }

  closeRoom() {
    if (zeroconf) {
      try {
        zeroconf.unpublishService('WerewolfServer');
      } catch (error) {
        console.error('Failed to stop advertising the room', error);
      }
    }

    this.server?.stop();
    // Drop the instance entirely: a server that was closed cannot always be
    // re-listened on, so the next host session builds a fresh one.
    this.server = undefined;
    this.sockets.clear();
    this.socketOwners.clear();
    this.gameMessageHandler = null;
    this.players = [];
    this.roomCode = '';
    this.notifyRoster();
  }

  // ---------------------------------------------------------------- roster ops

  // Remove a player from the table: a guest that is stuck, idle, or simply not
  // wanted. The host can keep the game moving without restarting the room.
  removePlayer(playerId: string) {
    const socket = this.sockets.get(playerId);

    if (socket) {
      this.sendToPlayer(playerId, {
        type: 'KICK',
        payload: { reason: 'removed' },
        timestamp: Date.now(),
      });
      this.sockets.delete(playerId);
      this.socketOwners.delete(socket);
      // Send the kick before hanging up, then close: a removed player must not
      // keep a live link into the room. The delay lets the write flush first,
      // so the guest is told why instead of just losing the connection.
      setTimeout(() => socket.destroy?.(), 250);
    }

    this.seatTokens.delete(playerId);

    const before = this.players.length;
    this.removePlayerById(playerId);
    if (this.players.length === before) return;

    this.broadcastPlayerList();
    this.notifyRoster();
  }

  // Removed in place: the running game holds a reference to this same array,
  // so replacing it would leave the departed player on the board.
  private removePlayerById(playerId: string): boolean {
    const index = this.players.findIndex(p => p.id === playerId);
    if (index < 0) return false;

    this.players.splice(index, 1);
    return true;
  }

  // Put every player back on their feet for a rematch. Roles are cleared here
  // and re-dealt by GameManager.start(); the sockets are deliberately kept so
  // nobody has to rejoin.
  resetRoster() {
    this.players.forEach(player => {
      player.isAlive = true;
      player.role = 'Unknown';
      player.team = 'Village';
      player.statusEffects = [];
      player.voteWeight = 1;
    });

    this.broadcastPlayerList();
    this.notifyRoster();
  }

  // Seats that should have a socket but do not: a guest whose link dropped.
  // The host and the test players are local and never have one.
  disconnectedPlayers(): Player[] {
    return this.players.filter(
      p => p.id !== HOST_PLAYER_ID && !p.isBot && !this.sockets.has(p.id),
    );
  }

  isHosting(): boolean {
    return !!this.server?.isStarted();
  }

  // Hosting binds a TCP port, which only the phone build can do; a browser is
  // a guest.
  canHost(): boolean {
    return Platform.OS !== 'web';
  }

  // Join a host found over mDNS/Bonjour. Kept for the room-code flow.
  async joinGame(code: string, player: Player): Promise<boolean> {
    const zc = this.getZeroconf();
    if (!zc) {
      console.warn('Local discovery is not available on this platform');
      return false;
    }

    try {
      zc.scan('http', 'tcp', 'local.');
    } catch (error) {
      console.error('Failed to start the discovery scan', error);
      return false;
    }

    return new Promise(resolve => {
      setTimeout(() => {
        // Stop the scan whether or not we found the host.
        try {
          zc.stop();
        } catch (error) {
          console.error('Failed to stop the discovery scan', error);
        }

        const host = this.discoveredHosts.find(h => h.txt?.roomCode === code);
        const hostIp = host?.addresses?.[0];
        if (!hostIp) {
          resolve(false);
          return;
        }

        this.connect(hostIp, player).then(resolve);
      }, 2000); // Give 2 seconds for discovery
    });
  }

  // Join by typing the host's IP. This is the reliable path when mDNS is
  // blocked or when the two devices are on different subnets.
  joinGameByIp(ip: string, player: Player, port: number = GAME_PORT): Promise<boolean> {
    return this.connect(ip.trim(), player, port);
  }

  private connect(host: string, player: Player, port: number = GAME_PORT): Promise<boolean> {
    this.disconnectClient();
    // A phone guest speaks TCP, a browser guest WebSocket; both land on the
    // host's one port. The browser client throws on an address it cannot even
    // build a URL from, and that must fail the join rather than the button.
    let client: GuestClient;
    try {
      client = createGuestClient(host, port);
    } catch (error) {
      console.error('Could not open a connection to the host', error);
      return Promise.resolve(false);
    }

    this.client = client;
    this.lastHost = host;
    this.lastPort = port;

    // Carry the seat token across reconnects, which build a new client.
    client.seatToken = this.seatToken;
    client.onSeatToken(token => {
      this.seatToken = token;
    });

    return new Promise(resolve => {
      let settled = false;

      const fail = () => {
        if (settled) return;
        settled = true;

        // Never leave a half-open client behind: it would finish connecting
        // after we already reported failure and silently join the room.
        if (this.client === client) this.disconnectClient();
        resolve(false);
      };

      client.onConnect(() => {
        if (settled) return;
        settled = true;

        client.sendMessage({
          type: 'PLAYER_JOIN',
          payload: { player, token: this.seatToken },
          senderId: player.id,
          timestamp: Date.now(),
        });
        resolve(true);
      });

      client.onError(fail);

      // A refused connection reports an error, but an unreachable host can
      // hang, so time out rather than leave the UI spinning forever.
      setTimeout(fail, JOIN_TIMEOUT_MS);
    });
  }

  disconnectClient() {
    this.client?.disconnect();
    this.client = undefined;
  }

  // Where this device last joined, or null when it never has.
  lastHostAddress(): string | null {
    return this.lastHost;
  }

  // Join the same host again with the same player id. The host maps the id to
  // the new socket and keeps the seat, so the game can continue.
  reconnect(player: Player): Promise<boolean> {
    if (!this.lastHost) return Promise.resolve(false);
    return this.connect(this.lastHost, player, this.lastPort);
  }

  // ------------------------------------------------------------- game traffic

  // Set by the host session so player actions reach the game engine.
  onGameMessage(handler: ((playerId: string, message: NetworkMessage) => void) | null) {
    this.gameMessageHandler = handler;
  }

  broadcast(message: NetworkMessage) {
    this.server?.broadcast(message);
  }

  sendToPlayer(playerId: string, message: NetworkMessage) {
    const socket = this.sockets.get(playerId);
    if (!socket) return; // the host itself has no socket

    try {
      this.server?.sendToPlayer(socket, message);
    } catch (error) {
      console.error(`Failed to send to player ${playerId}`, error);
    }
  }

  private registerSocket(playerId: string, socket: any) {
    this.sockets.set(playerId, socket);
    this.socketOwners.set(socket, playerId);
  }

  // Roles never leave the host, so the shared roster is stripped down.
  private publicPlayers(): Player[] {
    return this.players.map(p => ({
      id: p.id,
      name: p.name,
      role: 'Unknown',
      team: 'Village' as const,
      isAlive: p.isAlive,
      statusEffects: [...p.statusEffects],
      // Always one: the real weight would tell every guest who the Mayor is.
      voteWeight: 1,
    }));
  }

  private broadcastPlayerList() {
    this.server?.broadcast({
      type: 'PLAYER_LIST',
      payload: { players: this.publicPlayers() },
      timestamp: Date.now(),
    });
    this.notifyRoster();
  }

  // Upserts by id so re-hosting (or a reconnecting player) cannot create
  // duplicate entries, which would also break React's list keys.
  addPlayer(player: Player) {
    const existingIndex = this.players.findIndex(p => p.id === player.id);
    if (existingIndex >= 0) {
      this.players[existingIndex] = player;
      this.notifyRoster();
      return;
    }
    this.players.push(player);
    this.notifyRoster();
  }

  getPlayers(): Player[] {
    return this.players;
  }
}

// One session per app instance: the lobby screen, the narrator dashboard and
// the player screen all talk to the same connections.
export const lobby = new LobbyManager();
