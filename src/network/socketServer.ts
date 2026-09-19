import { EventEmitter } from 'events';
import { NetworkMessage } from './protocol';
import { Platform } from 'react-native';

// Lazy load the native module only on mobile
let TcpSocket: any;
if (Platform.OS !== 'web') {
  TcpSocket = require('react-native-tcp-socket').default;
}

export class NarratorServer extends EventEmitter {
  private clients: any[] = [];
  private server: any;

  constructor(port: number = 12345) {
    super();
    if (Platform.OS === 'web') {
        console.warn("TCP Server not supported on Web");
        return;
    }

    this.server = TcpSocket.createServer((socket: any) => {
      this.clients.push(socket);
      socket.on('data', (data: any) => {
        try {
          const message = JSON.parse(data.toString());
          this.emit('message', message, socket);
        } catch (e) {
          console.error("Failed to parse message", e);
        }
      });
      socket.on('close', () => {
        this.clients = this.clients.filter(c => c !== socket);
      });
    });

    this.server.listen({ port, host: '0.0.0.0' });
    console.log(`TCP Server started on port ${port}`);
  }

  // Broadcast to all clients
  broadcast(message: NetworkMessage) {
    if (Platform.OS === 'web') return;
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      client.write(data);
    });
  }

  // Send to specific player (this assumes player has a socket reference)
  sendToPlayer(playerSocket: any, message: NetworkMessage) {
    if (Platform.OS === 'web') return;
    playerSocket.write(JSON.stringify(message));
  }
}
