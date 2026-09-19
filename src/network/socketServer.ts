import { EventEmitter } from 'events';
import { NetworkMessage } from './protocol';
import TcpSocket from 'react-native-tcp-socket';

export class NarratorServer extends EventEmitter {
  private clients: any[] = [];
  private server: any;

  constructor(port: number = 12345) {
    super();
    this.server = TcpSocket.createServer((socket) => {
      this.clients.push(socket);
      socket.on('data', (data) => {
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
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      client.write(data);
    });
  }

  // Send to specific player (this assumes player has a socket reference)
  sendToPlayer(playerSocket: any, message: NetworkMessage) {
    playerSocket.write(JSON.stringify(message));
  }
}
