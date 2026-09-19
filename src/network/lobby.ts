import { Player } from '../engine/types';
import { NarratorServer } from './socketServer';
import { PlayerClient } from './socketClient';
import { Platform } from 'react-native';

// Lazy load the native module only on mobile
let Zeroconf: any;
if (Platform.OS !== 'web') {
  Zeroconf = require('react-native-zeroconf').default;
}

const zeroconf = Platform.OS !== 'web' ? new Zeroconf() : null;

export class LobbyManager {
  private roomCode: string = '';
  public players: Player[] = [];
  public server?: NarratorServer;
  public client?: PlayerClient;
  private discoveredHosts: any[] = [];

  constructor() {
    if (zeroconf) {
      zeroconf.on('found', (service: any) => {
        this.discoveredHosts.push(service);
        console.log('Found service:', service);
      });
    }
  }

  generateRoomCode(): string {
    this.roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    // Start TCP Server
    if (Platform.OS !== 'web') {
      this.server = new NarratorServer(12345);
      this.server.on('message', (msg, socket) => {
        if (msg.type === 'PLAYER_JOIN') {
          this.players.push(msg.payload.player);
        }
      });

      // Publish service
      zeroconf.publishService('http', 'tcp', 'local.', 'WerewolfServer', 12345, { roomCode: this.roomCode });
    }
    
    return this.roomCode;
  }

  joinGame(code: string, player: Player): Promise<boolean> {
    if (Platform.OS === 'web') {
      console.warn("Networking not supported on web");
      return Promise.resolve(false);
    }

    zeroconf.scan('http', 'tcp', 'local.');
    
    return new Promise((resolve) => {
      setTimeout(() => {
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
