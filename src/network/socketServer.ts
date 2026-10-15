import { EventEmitter } from 'events';
import { NetworkMessage } from './protocol';
import { encodeMessage, MessageDecoder } from './framing';
import { Platform } from 'react-native';

// Lazy load the native module only on mobile
let TcpSocket: any;
if (Platform.OS !== 'web') {
  TcpSocket = require('react-native-tcp-socket').default;
}

export class NarratorServer extends EventEmitter {
  private clients: any[] = [];
  private decoders = new Map<any, MessageDecoder>();
  private server: any;
  private port: number;
  private isListening = false;

  constructor(port: number = 12345) {
    super();
    this.port = port;

    if (Platform.OS === 'web') {
      console.warn('TCP Server not supported on Web');
      return;
    }

    this.server = TcpSocket.createServer((socket: any) => {
      this.clients.push(socket);
      this.decoders.set(socket, new MessageDecoder());

      socket.on('data', (data: any) => {
        const decoder = this.decoders.get(socket);
        if (!decoder) return;
        for (const message of decoder.push(data.toString())) {
          this.emit('message', message, socket);
        }
      });

      socket.on('error', (error: any) => {
        console.error('Client socket error', error);
      });

      socket.on('close', () => {
        this.clients = this.clients.filter(c => c !== socket);
        this.decoders.delete(socket);
      });
    });

    // Surface bind failures (e.g. EADDRINUSE) instead of failing silently.
    // Deliberately not 'error': EventEmitter throws when 'error' has no listener.
    this.server.on('error', (error: any) => {
      this.isListening = false;
      console.error(`TCP Server error on port ${this.port}`, error);
      this.emit('server-error', error);
    });
  }

  // Bind the listener. Safe to call more than once.
  start(): boolean {
    if (Platform.OS === 'web') return false;
    if (!this.server || this.isListening) return false;

    this.server.listen({ port: this.port, host: '0.0.0.0' });
    this.isListening = true;
    console.log(`TCP Server started on port ${this.port}`);
    return true;
  }

  stop() {
    if (!this.server || !this.isListening) return;
    this.server.close();
    this.isListening = false;
    this.clients = [];
    this.decoders.clear();
  }

  isStarted(): boolean {
    return this.isListening;
  }

  // Broadcast to all clients
  broadcast(message: NetworkMessage) {
    if (Platform.OS === 'web') return;
    const data = encodeMessage(message);
    this.clients.forEach(client => {
      client.write(data);
    });
  }

  // Send to specific player (this assumes player has a socket reference)
  sendToPlayer(playerSocket: any, message: NetworkMessage) {
    if (Platform.OS === 'web') return;
    if (!playerSocket) return;
    playerSocket.write(encodeMessage(message));
  }
}
