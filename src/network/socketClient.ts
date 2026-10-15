import { NetworkMessage } from './protocol';
import { encodeMessage, MessageDecoder } from './framing';
import { loadTcpSocket } from './nativeModules';

export class PlayerClient {
  private socket: any;
  private decoder = new MessageDecoder();
  private messageHandler: ((message: NetworkMessage) => void) | null = null;

  constructor(host: string, port: number = 12345) {
    const TcpSocket = loadTcpSocket();
    if (!TcpSocket || typeof TcpSocket.connect !== 'function') {
      console.error('TCP client unavailable: react-native-tcp-socket could not be loaded');
      return;
    }

    this.socket = TcpSocket.connect({ port, host }, () => {
      console.log('Connected to host');
    });

    this.socket.on('error', (error: any) => {
      console.error('Client socket error', error);
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
    return !!this.socket;
  }

  sendMessage(message: NetworkMessage) {
    if (this.socket) {
      this.socket.write(encodeMessage(message));
    }
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
  }
}
