import { EventEmitter } from 'events';
import { NetworkMessage } from './protocol';
import { encodeMessage, MessageDecoder } from './framing';
import { loadTcpSocket } from './nativeModules';
import { Platform } from 'react-native';
import {
  asciiBytes,
  asciiText,
  encodeCloseFrame,
  encodeTextFrame,
  headerLimit,
  webSocketHandshakeResponse,
  WebSocketFrameReader,
} from './webSocket';

// One connected guest, whichever wire it speaks. An app guest sends
// newline-framed JSON over TCP; a browser guest sends the same lines inside
// RFC6455 text frames (see webSocket.ts). The lobby never needs to know which:
// it holds a link, writes strings to it and receives messages from it.
class ClientLink {
  private mode: 'sniff' | 'handshake' | 'line' | 'ws' = 'sniff';
  private decoder = new MessageDecoder();
  private frames = new WebSocketFrameReader();
  private header = '';

  constructor(
    private socket: any,
    private onMessage: (message: NetworkMessage) => void,
  ) {}

  push(data: any) {
    const bytes = toBytes(data);
    if (bytes.length === 0) return;

    if (this.mode === 'sniff') {
      // A browser opens with "GET / HTTP/1.1"; the app's guests open with
      // "{". Wait out a split verb so "GE" is not mistaken for JSON.
      const peek = asciiText(bytes.subarray(0, Math.min(bytes.length, 4)));
      if ('GET '.startsWith(peek)) {
        if (peek.length < 4) return;
        this.mode = 'handshake';
      } else {
        this.mode = 'line';
      }
    }

    if (this.mode === 'handshake') {
      this.header += asciiText(bytes);
      if (this.header.length > headerLimit) {
        this.destroy();
        return;
      }

      const end = this.header.indexOf('\r\n\r\n');
      if (end === -1) return;

      const request = this.header.slice(0, end + 4);
      this.header = '';
      const response = webSocketHandshakeResponse(request);
      if (!response) {
        this.destroy();
        return;
      }

      this.socket.write?.(response);
      this.mode = 'ws';
      // A browser waits for the 101 before it sends a frame, so anything left
      // here would be a courtesy, not a protocol case.
      return;
    }

    if (this.mode === 'ws') {
      const events = this.frames.push(bytes);
      events.replies.forEach(reply => this.socket.write?.(reply));
      // A text frame carries the same newline-framed JSON line an app guest
      // writes to the socket, so the decoder is shared.
      events.messages.forEach(text => {
        this.decoder.push(text).forEach(message => this.onMessage(message));
      });
      if (events.closeCode !== null) {
        this.socket.write?.(encodeCloseFrame(events.closeCode));
        this.destroy();
      }
      return;
    }

    this.decoder.push(asciiText(bytes)).forEach(message => this.onMessage(message));
  }

  // Lines are framed JSON; a browser gets the same text inside a WS frame.
  write(text: string) {
    if (this.mode === 'ws') {
      this.socket.write?.(encodeTextFrame(text));
      return;
    }

    // A connection that never finished its handshake has no business being
    // written to: broadcasting to it would corrupt the HTTP response.
    if (this.mode === 'line') this.socket.write?.(text);
  }

  destroy() {
    this.socket.destroy?.();
  }
}

const toBytes = (data: any): Uint8Array => {
  // react-native-tcp-socket hands out Buffer (a Uint8Array), and the WebSocket
  // frames in the tests are plain ones.
  if (data instanceof Uint8Array) return data;
  if (typeof data === 'string') return asciiBytes(data);
  return new Uint8Array(data);
};

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
