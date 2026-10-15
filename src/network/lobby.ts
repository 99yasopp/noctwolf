import { Player } from '../engine/types';
import { NarratorServer } from './socketServer';
import { PlayerClient } from './socketClient';
import { createZeroconf } from './nativeModules';
import { Platform } from 'react-native';

type ZeroconfLike = any;

// Discovery is best-effort. If the native module is missing or fails to load
// we simply disable it and let players join by room code.
let zeroconf: ZeroconfLike | null = null;
let zeroconfUnavailable = false;

export class LobbyManager {
  private roomCode: string = '';
  public players: Player[] = [];
  public server?: NarratorServer;
  public client?: PlayerClient;
  private discoveredHosts: any[] = [];
  private foundListenerAttached = false;

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

  // Returns the room code, or null when hosting could not be started.
  generateRoomCode(): string | null {
    if (Platform.OS === 'web') {
      console.warn("Networking not supported on web");
      return null;
    }

    // Reuse one server instance so hosting twice cannot bind the port twice.
    if (!this.server) {
      this.server = new NarratorServer(12345);
      this.server.on('message', (msg: any) => {
        if (msg.type === 'PLAYER_JOIN') {
          this.addPlayer(msg.payload.player);
        }
      });
      this.server.on('server-error', (error: any) => {
        console.error('Lobby server error', error);
      });
    }

    // Binding is explicit now, so players that never host never open a port.
    if (!this.server.start()) {
      console.error('Failed to start the lobby server; hosting is unavailable');
      return null;
    }

    this.roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();

    // Advertising is best-effort: joining by code still works without it, and
    // a discovery failure must never break hosting.
    const zc = this.getZeroconf();
    if (zc) {
      try {
        zc.publishService('http', 'tcp', 'local.', 'WerewolfServer', 12345, { roomCode: this.roomCode });
      } catch (error) {
        console.error('Failed to advertise the room; players can still join by code', error);
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
    this.server = undefined;
    this.players = [];
    this.roomCode = '';
  }

  joinGame(code: string, player: Player): Promise<boolean> {
    const zc = this.getZeroconf();
    if (!zc) {
      console.warn("Local discovery is not available on this platform");
      return Promise.resolve(false);
    }

    try {
      zc.scan('http', 'tcp', 'local.');
    } catch (error) {
      console.error('Failed to start the discovery scan', error);
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        // Stop the scan whether or not we found the host.
        try {
          zc.stop();
        } catch (error) {
          console.error('Failed to stop the discovery scan', error);
        }

        const host = this.discoveredHosts.find(h => h.txt?.roomCode === code);
        if (host) {
          const hostIp = host.addresses[0];
          this.client = new PlayerClient(hostIp, 12345);
          this.client.sendMessage({ 
            type: 'PLAYER_JOIN', 
            payload: { player }, 
            timestamp: Date.now() 
          });
          resolve(true);
        } else {
          resolve(false);
        }
      }, 2000); // Give 2 seconds for discovery
    });
  }

  // Upserts by id so re-hosting (or a reconnecting player) cannot create
  // duplicate entries, which would also break React's list keys.
  addPlayer(player: Player) {
    const existingIndex = this.players.findIndex(p => p.id === player.id);
    if (existingIndex >= 0) {
      this.players[existingIndex] = player;
      return;
    }
    this.players.push(player);
  }

  getPlayers(): Player[] {
    return this.players;
  }
}
