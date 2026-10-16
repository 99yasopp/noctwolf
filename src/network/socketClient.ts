import { Platform } from 'react-native';
import { NetworkMessage } from './protocol';
import { encodeMessage, MessageDecoder } from './framing';
import { loadTcpSocket } from './nativeModules';

// The bookkeeping every guest client shares: connection callbacks, the seat
// token, and turning wire text into messages. The transport underneath is
// TCP on a phone and a WebSocket in a browser, and neither the lobby nor the
// screens ever need to know which one is in use.
export abstract class GuestClient {
  protected connected = false;
  private decoder = new MessageDecoder();
  private messageHandler: ((message: NetworkMessage) => void) | null = null;
  private connectHandler: (() => void) | null = null;
  private errorHandler: ((error: any) => void) | null = null;
  private closeHandler: (() => void) | null = null;

  // The token the host handed this seat. Sent back with every join so a
  // stranger cannot claim a seat by guessing a player id.
  seatToken: string | null = null;
  private seatTokenHandler: ((token: string | null) => void) | null = null;

  protected handleData(text: string) {
    for (const message of this.decoder.push(text)) {
      // The seat token belongs to the connection, not to a screen, so it is
      // taken here. It arrives right after the join, before any screen has
      // registered its handler.
      if (message.type === 'SEAT_TOKEN') {
        const token = message.payload?.token ?? null;
        this.seatToken = token;
        this.seatTokenHandler?.(token);
        continue;
      }

      this.messageHandler?.(message);
    }
  }

  protected handleConnect() {
    this.connected = true;
    console.log('Connected to host');
    this.connectHandler?.();
  }

  protected handleError(error: any) {
    console.error('Client socket error', error);
    this.errorHandler?.(error);
  }

  protected handleClose() {
    this.connected = false;
    this.closeHandler?.();
  }

  // Used by disconnect(): the screen that owned this client is going away.
  protected forgetHandlers() {
    this.decoder.reset();
    this.messageHandler = null;
    this.connectHandler = null;
    this.errorHandler = null;
    this.closeHandler = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // Fires once the handshake with the host succeeds. Replays immediately when
  // the connection was already established, so a late caller cannot miss it.
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

  onSeatToken(callback: (token: string | null) => void) {
    this.seatTokenHandler = callback;
  }

  abstract sendMessage(message: NetworkMessage): void;
  abstract disconnect(): void;
}

// The phone's guest: newline-framed JSON over a raw TCP socket.
export class PlayerClient extends GuestClient {
  private socket: any;

  constructor(host: string, port: number = 12345) {
    super();

    const TcpSocket = loadTcpSocket();
    if (!TcpSocket || typeof TcpSocket.connect !== 'function') {
      console.error('TCP client unavailable: react-native-tcp-socket could not be loaded');
      return;
    }

    this.socket = TcpSocket.connect({ port, host }, () => {
      this.handleConnect();
    });

    this.socket.on('error', (error: any) => {
      this.handleError(error);
    });

    // The host closing the room, or the phone sleeping, ends the connection
    // without an error. Without this the client screen just freezes.
    this.socket.on('close', () => {
      this.handleClose();
    });

    // A single 'data' listener dispatches to the registered callback, so
    // calling onMessage() repeatedly cannot stack duplicate listeners.
    this.socket.on('data', (data: any) => {
      this.handleData(data.toString());
    });
  }

  sendMessage(message: NetworkMessage) {
    if (this.socket) {
      this.socket.write(encodeMessage(message));
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = undefined;
    }
    this.forgetHandlers();
  }
}

// The browser's guest: the same lines, each one inside an RFC6455 text frame.
// The host accepts both wires on the same port, so the address a player types
// is the same one the phone app uses.
export class WebPlayerClient extends GuestClient {
  private socket: any = null;

  constructor(host: string, port: number = 12345) {
    super();

    const WebSocketImpl = (globalThis as any).WebSocket;
    if (typeof WebSocketImpl !== 'function') {
      console.error('WebSocket unavailable in this browser');
      return;
    }

    const socket = new WebSocketImpl(`ws://${host}:${port}`);
    this.socket = socket;

    socket.onopen = () => {
      this.handleConnect();
    };

    socket.onerror = (event: any) => {
      this.handleError(event);
    };

    socket.onclose = () => {
      this.handleClose();
    };

    socket.onmessage = (event: any) => {
      // The whole protocol is text; anything else is not ours to parse.
      if (typeof event?.data === 'string') this.handleData(event.data);
    };
  }

  sendMessage(message: NetworkMessage) {
    this.socket?.send?.(encodeMessage(message));
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.forgetHandlers();
  }
}

// The lobby asks for a guest client and gets the one this platform can run.
export const createGuestClient = (host: string, port: number): GuestClient =>
  Platform.OS === 'web' ? new WebPlayerClient(host, port) : new PlayerClient(host, port);
