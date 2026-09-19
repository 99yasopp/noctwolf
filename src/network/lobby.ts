import { Player } from '../engine/types';
import { NarratorServer } from './socketServer';
import Zeroconf from 'react-native-zeroconf';

const zeroconf = new Zeroconf();

export class LobbyManager {
  private roomCode: string = '';
  private players: Player[] = [];
  public server?: NarratorServer;

  generateRoomCode(): string {
    this.roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    // Start TCP Server
    this.server = new NarratorServer(12345);
    this.server.on('message', (msg, socket) => {
      if (msg.type === 'PLAYER_JOIN') {
        this.players.push(msg.payload.player);
      }
    });

    // Publish service
    zeroconf.publishService('http', 'tcp', 'local.', 'WerewolfServer', 12345, { roomCode: this.roomCode });
    
    return this.roomCode;
  }

  public client?: PlayerClient;
  private discoveredHosts: any[] = [];

  constructor() {
    zeroconf.on('found', (service: any) => {
      this.discoveredHosts.push(service);
      console.log('Found service:', service);
    });
  }

  joinGame(code: string, player: Player): Promise<boolean> {
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
