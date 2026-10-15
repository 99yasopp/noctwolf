import { NetworkMessage } from './protocol';
import { encodeMessage, MessageDecoder } from './framing';
import { loadTcpSocket } from './nativeModules';

export class PlayerClient {
  private socket: any;
  private decoder = new MessageDecoder();
  private messageHandler: ((message: NetworkMessage) => void) | null = null;
  private connectHandler: (() => void) | null = null;
  private errorHandler: ((error: any) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private connected = false;

  constructor(host: string, port: number = 12345) {
    const TcpSocket = loadTcpSocket();
    if (!TcpSocket || typeof TcpSocket.connect !== 'function') {
      console.error('TCP client unavailable: react-native-tcp-socket could not be loaded');
      return;
    }

    this.socket = TcpSocket.connect({ port, host }, () => {
      this.connected = true;
      console.log('Connected to host');
      this.connectHandler?.();
    });

    this.socket.on('error', (error: any) => {
      console.error('Client socket error', error);
      this.errorHandler?.(error);
    });

    // The host closing the room, or the phone sleeping, ends the connection
    // without an error. Without this the client screen just freezes.
    this.socket.on('close', () => {
      this.connected = false;
      this.closeHandler?.();
    });

    // A single 'data' listener dispatches to the registered callback, so
    // calling onMessage() repeatedly cannot stack duplicate listeners.
    this.socket.on('data', (data: any) => {
      for (const message of this.decoder.push(data.toString())) {
        this.messageHandler?.(message);
      }
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  sendMessage(message: NetworkMessage) {
    if (this.socket) {
      this.socket.write(encodeMessage(message));
    }
  }

  // Fires once the TCP handshake succeeds. Replays immediately when the
  // connection was already established, so a late caller cannot miss it.
  onConnect(callback: () => void) {
    this.connectHandler = callback;
    if (this.connected) callback();
  }

  onError(callback: (error: any) => void) {
    this.errorHandler = callback;
  }

  onClose(callback: () => void) {
    this.closeHandler = callback;
  }

  offClose() {
    this.closeHandler = null;
  }

  onMessage(callback: (message: NetworkMessage) => void) {
    this.messageHandler = callback;
  }

  offMessage() {
    this.messageHandler = null;
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = undefined;
    }
    this.decoder.reset();
    this.messageHandler = null;
    this.connectHandler = null;
    this.errorHandler = null;
    this.closeHandler = null;
    this.connected = false;
  }
}
