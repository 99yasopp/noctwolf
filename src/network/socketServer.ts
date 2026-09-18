import { EventEmitter } from 'events';
import { NetworkMessage } from './protocol';

export class NarratorServer extends EventEmitter {
  // Simulate connected clients
  private clients: any[] = []; 

  constructor() {
    super();
  }

  // Broadcast to all clients
  broadcast(message: NetworkMessage) {
    console.log(`Broadcasting ${message.type} to all players...`);
    this.clients.forEach(client => {
      // In real WebSocket implementation, this would be client.send(JSON.stringify(message))
    });
  }

  // Send to specific player
  sendToPlayer(playerId: string, message: NetworkMessage) {
    console.log(`Sending ${message.type} to player ${playerId}`);
  }
}
