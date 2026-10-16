import { EventEmitter } from 'events';
import { NetworkMessage } from './protocol';
import { encodeMessage } from './framing';
import { loadTcpSocket } from './nativeModules';
import { Platform } from 'react-native';
import { ClientLink } from './clientLink';

export class NarratorServer extends EventEmitter {
  private clients: ClientLink[] = [];
  private server: any = null;
  private port: number;
  private isListening = false;

  constructor(port: number = 12345) {
    super();
    this.port = port;
  }

  // The native server is created on first use, never in the constructor:
  // simply constructing a NarratorServer (which GameProvider does on app
  // start) must not touch the native module or bind a port.
  private createServer(): any {
    if (this.server) return this.server;

    const TcpSocket = loadTcpSocket();
    if (!TcpSocket || typeof TcpSocket.createServer !== 'function') {
      console.error('TCP server unavailable: react-native-tcp-socket could not be loaded');
      return null;
    }

    this.server = TcpSocket.createServer((socket: any) => {
      const link = new ClientLink(socket, message => this.emit('message', message, link));
      this.clients.push(link);

      socket.on('data', (data: any) => {
        link.push(data);
      });

      socket.on('error', (error: any) => {
        console.error('Client socket error', error);
      });

      socket.on('close', () => {
        this.clients = this.clients.filter(c => c !== link);
        // The host needs this to drop players that went away instead of
        // leaving phantom entries in the lobby roster.
        this.emit('client-disconnected', link);
      });
    });

    // Surface bind failures (e.g. EADDRINUSE) instead of failing silently.
    // Deliberately not 'error': EventEmitter throws when 'error' has no listener.
    this.server.on('error', (error: any) => {
      this.isListening = false;
      console.error(`TCP Server error on port ${this.port}`, error);
      this.emit('server-error', error);
    });

    return this.server;
  }

  // Bind the listener. Idempotent: returns true when the server is listening
  // (including when it already was) and false when it cannot be started.
  start(): boolean {
    if (this.isListening) return true;

    const server = this.createServer();
    if (!server) return false;

    server.listen({ port: this.port, host: '0.0.0.0' });
    this.isListening = true;
    console.log(`TCP Server started on port ${this.port}`);
    return true;
  }

  stop() {
    if (!this.server || !this.isListening) return;
    this.server.close();
    // A browser would otherwise keep its socket (and its seat) open across a
    // new hosting session.
    this.clients.forEach(link => link.destroy());
    this.clients = [];
    this.isListening = false;
  }

  isStarted(): boolean {
    return this.isListening;
  }

  // Broadcast to all clients
  broadcast(message: NetworkMessage) {
    if (Platform.OS === 'web') return;
    const data = encodeMessage(message);
    this.clients.forEach(client => client.write(data));
  }

  // Send to specific player (this assumes player has a socket reference)
  sendToPlayer(playerSocket: any, message: NetworkMessage) {
    if (Platform.OS === 'web') return;
    if (!playerSocket) return;
    playerSocket.write(encodeMessage(message));
  }
}
