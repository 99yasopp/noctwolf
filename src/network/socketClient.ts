import { Platform } from 'react-native';
import { NetworkMessage } from './protocol';
import { encodeMessage, MessageDecoder } from './framing';

// Lazy load the native module only on mobile (keeps the web bundle native-free)
let TcpSocket: any;
if (Platform.OS !== 'web') {
  TcpSocket = require('react-native-tcp-socket').default;
}

export class PlayerClient {
  private socket: any;
  private decoder = new MessageDecoder();
  private messageHandler: ((message: NetworkMessage) => void) | null = null;

  constructor(host: string, port: number = 12345) {
    if (Platform.OS === 'web') {
      console.warn('TCP Client not supported on Web');
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
