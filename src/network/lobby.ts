import { Player } from '../engine/types';
import { NarratorServer } from './socketServer';
import { PlayerClient } from './socketClient';
import { Platform } from 'react-native';

type ZeroconfLike = any;

// The native Zeroconf module is loaded lazily and defensively: if it is
// missing or fails to initialise, the lobby degrades to code-only joining
// instead of crashing the screen at import time.
let zeroconf: ZeroconfLike | null = null;
let zeroconfFailed = false;

export class LobbyManager {
  private roomCode: string = '';
  public players: Player[] = [];
  public server?: NarratorServer;
  public client?: PlayerClient;
  private discoveredHosts: any[] = [];
  private foundListenerAttached = false;

  private getZeroconf(): ZeroconfLike | null {
    if (Platform.OS === 'web' || zeroconfFailed) return null;

    if (!zeroconf) {
      try {
        const Zeroconf = require('react-native-zeroconf').default;
        zeroconf = new Zeroconf();
      } catch (error) {
        console.error('Zeroconf unavailable, local discovery is disabled', error);
        zeroconfFailed = true;
        return null;
      }
    }

    if (!this.foundListenerAttached) {
      zeroconf.on('found', (service: any) => {
        this.discoveredHosts.push(service);
        console.log('Found service:', service);
      });
      this.foundListenerAttached = true;
    }

    return zeroconf;
  }

  generateRoomCode(): string {
    this.roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();

    if (Platform.OS === 'web') {
      console.warn("Networking not supported on web");
      return this.roomCode;
    }

    // Reuse one server instance so hosting twice cannot bind the port twice.
    if (!this.server) {
      this.server = new NarratorServer(12345);
      this.server.on('message', (msg: any) => {
        if (msg.type === 'PLAYER_JOIN') {
          this.players.push(msg.payload.player);
        }
      });
      this.server.on('server-error', (error: any) => {
        console.error('Lobby server error', error);
      });
    }

    // Binding is explicit now, so players that never host never open a port.
    this.server.start();

    // Advertising is best-effort: joining by code still works without it.
    this.getZeroconf()?.publishService('http', 'tcp', 'local.', 'WerewolfServer', 12345, { roomCode: this.roomCode });

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

    zc.scan('http', 'tcp', 'local.');

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

  addPlayer(player: Player) {
    this.players.push(player);
  }

  getPlayers(): Player[] {
    return this.players;
  }
}
