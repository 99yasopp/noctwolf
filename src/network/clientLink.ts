import { NetworkMessage } from './protocol';
import { MessageDecoder } from './framing';
import {
  asciiBytes,
  asciiText,
  encodeCloseFrame,
  encodeTextFrame,
  headerLimit,
  webSocketHandshakeResponse,
  WebSocketFrameReader,
} from './webSocket';
import { GUEST_PAGE_HTML } from './guestPage';

// One connected guest, whichever wire it speaks. An app guest sends
// newline-framed JSON over TCP; a browser guest sends the same lines inside
// RFC6455 text frames (see webSocket.ts). The lobby never needs to know which:
// it holds a link, writes strings to it and receives messages from it.
//
// This file stays free of React Native imports so the headless test can drive
// a link with a fake socket and check both wires.
export class ClientLink {
  private mode: 'sniff' | 'handshake' | 'line' | 'ws' = 'sniff';
  private decoder = new MessageDecoder();
  private frames = new WebSocketFrameReader();
  private header = '';
  private sniffed: Uint8Array = new Uint8Array(0);

  constructor(
    private socket: any,
    private onMessage: (message: NetworkMessage) => void,
  ) {}

  push(data: any) {
    let bytes = toBytes(data);
    if (bytes.length === 0) return;

    if (this.mode === 'sniff') {
      // A browser opens with "GET / HTTP/1.1"; the app's guests open with
      // "{". Hold the bytes back until the verb gives the game away, so a
      // split inside "GET " cannot be mistaken for JSON.
      this.sniffed = concat(this.sniffed, bytes);
      const peek = asciiText(this.sniffed.subarray(0, 4));
      if ('GET '.startsWith(peek)) {
        if (peek.length < 4) return;
        this.mode = 'handshake';
      } else {
        this.mode = 'line';
      }
      bytes = this.sniffed;
      this.sniffed = new Uint8Array(0);
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
        // A browser navigating here (no Sec-WebSocket-Key) gets the guest page
        // served from the game port itself, so one address does both jobs.
        this.serveGuestPage(request);
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

  // Answer a plain browser GET with the guest page. The page opens its own
  // WebSocket back to this same host:port, so one address does both jobs.
  private serveGuestPage(request: string) {
    if (!/^GET /.test(request)) {
      this.destroy();
      return;
    }
    // Content-Length is left out on purpose: the page is long and its byte
    // length is not worth computing, and `Connection: close` already tells
    // the browser where the body ends.
    this.socket.write?.(
      [
        'HTTP/1.1 200 OK',
        'Content-Type: text/html; charset=utf-8',
        'Cache-Control: no-store',
        'Connection: close',
        '',
        '',
        GUEST_PAGE_HTML,
      ].join('\r\n'),
    );
    this.destroy();
  }
}

const toBytes = (data: any): Uint8Array => {
  // react-native-tcp-socket hands out Buffer (a Uint8Array), and the WebSocket
  // frames in the tests are plain ones.
  if (data instanceof Uint8Array) return data;
  if (typeof data === 'string') return asciiBytes(data);
  return new Uint8Array(data);
};

const concat = (left: Uint8Array, right: Uint8Array): Uint8Array => {
  const joined = new Uint8Array(left.length + right.length);
  joined.set(left, 0);
  joined.set(right, left.length);
  return joined;
};
