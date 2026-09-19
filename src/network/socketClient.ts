import TcpSocket from 'react-native-tcp-socket';
import { NetworkMessage } from './protocol';

export class PlayerClient {
  private socket: any;

  constructor(host: string, port: number = 12345) {
    this.socket = TcpSocket.connect({ port, host }, () => {
      console.log('Connected to host');
    });

    this.socket.on('data', (data: any) => {
      console.log('Message from host:', data.toString());
    });
  }

  sendMessage(message: NetworkMessage) {
    if (this.socket) {
      this.socket.write(JSON.stringify(message));
    }
  }

  onMessage(callback: (message: NetworkMessage) => void) {
    this.socket.on('data', (data: any) => {
      callback(JSON.parse(data.toString()));
    });
  }
}
