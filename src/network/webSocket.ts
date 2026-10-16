// A WebSocket server small enough to ride on the phone's TCP socket.
// react-native-tcp-socket hands us raw bytes and browsers insist on RFC6455, so
// the handshake, the frame reader and the frame writer all live here, with no
// React Native imports so the headless test can exercise them directly.
//
// The wire stays ASCII: every message is a newline-framed JSON line whose
// non-ASCII characters are escaped by encodeMessage (framing.ts). That makes
// bytes and characters interchangeable one-for-one, which is all this file
// needs.

// RFC6455, section 1.3.
const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// A browser never sends more than a few hundred bytes of HTTP, and a burst of
// JSON that big is a client that has lost the plot.
const MAX_HEADER_BYTES = 16 * 1024;
// Same idea for a single message: the largest legitimate one carries a player
// or a role, nowhere near a megabyte.
const MAX_MESSAGE_BYTES = 1024 * 1024;

// SHA-1 (FIPS 180-1). Only the handshake needs it, but a browser will not
// accept a response without it.
export const sha1Bytes = (text: string): number[] => {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i) & 0xff);

  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((high >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((low >>> shift) & 0xff);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Array<number>(80);
    for (let i = 0; i < 16; i++) {
      words[i] =
        (bytes[offset + i * 4] << 24) |
        (bytes[offset + i * 4 + 1] << 16) |
        (bytes[offset + i * 4 + 2] << 8) |
        bytes[offset + i * 4 + 3];
    }
    for (let i = 16; i < 80; i++) {
      const w = words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16];
      words[i] = (w << 1) | (w >>> 31);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = ((((a << 5) | (a >>> 27)) + f + e + k + words[i]) | 0) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out: number[] = [];
  [h0, h1, h2, h3, h4].forEach(word => {
    out.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
  });
  return out;
};

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const toBase64 = (bytes: number[]): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? BASE64_ALPHABET[b2 & 0x3f] : '=';
  }
  return out;
};

// One character per byte, both ways. The wire is ASCII (see the header note),
// so nothing is lost.
export const asciiBytes = (text: string): Uint8Array => {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
};

export const asciiText = (bytes: Uint8Array): string => {
  let out = '';
  // Chunked: fromCharCode with a huge argument list overflows the call stack.
  for (let i = 0; i < bytes.length; i += 4096) {
    out += String.fromCharCode(...Array.from(bytes.subarray(i, i + 4096)));
  }
  return out;
};

export const isWebSocketRequest = (chunk: string): boolean => chunk.startsWith('GET ');

// The 101 response for a browser's upgrade request, or null when the request
// carries no key and is therefore not a WebSocket handshake at all.
export const webSocketHandshakeResponse = (request: string): string | null => {
  const match = /sec-websocket-key:\s*(\S+)/i.exec(request);
  if (!match) return null;

  const accept = toBase64(sha1Bytes(match[1] + WEBSOCKET_GUID));
  return [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n');
};

const encodeFrame = (opcode: number, payload: Uint8Array): Uint8Array => {
  const header: number[] = [0x80 | opcode];
  if (payload.length < 126) {
    header.push(payload.length);
  } else if (payload.length < 0x10000) {
    header.push(126, (payload.length >> 8) & 0xff, payload.length & 0xff);
  } else {
    header.push(
      127,
      0,
      0,
      0,
      0,
      (payload.length >>> 24) & 0xff,
      (payload.length >> 16) & 0xff,
      (payload.length >> 8) & 0xff,
      payload.length & 0xff,
    );
  }

  const frame = new Uint8Array(header.length + payload.length);
  frame.set(header, 0);
  frame.set(payload, header.length);
  return frame;
};

export const encodeTextFrame = (text: string): Uint8Array =>
  encodeFrame(0x1, asciiBytes(text));

export const encodeCloseFrame = (code: number): Uint8Array =>
  encodeFrame(0x8, new Uint8Array([(code >> 8) & 0xff, code & 0xff]));

export interface FrameEvents {
  messages: string[];
  // Pong answers to answer pings, already framed and ready to write.
  replies: Uint8Array[];
  // Set when the peer broke the protocol or said goodbye: the caller writes a
  // close frame with this code and hangs up.
  closeCode: number | null;
}

// Reads the frames a browser sends. Client frames are always masked, text
// messages may arrive fragmented, and control frames can slip in between.
export class WebSocketFrameReader {
  private buffer = new Uint8Array(0);
  private pending = '';
  private fragmenting = false;

  push(chunk: Uint8Array): FrameEvents {
    const combined = new Uint8Array(this.buffer.length + chunk.length);
    combined.set(this.buffer, 0);
    combined.set(chunk, this.buffer.length);
    this.buffer = combined;

    const messages: string[] = [];
    const replies: Uint8Array[] = [];
    let closeCode: number | null = null;

    while (closeCode === null && this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = (first & 0x80) !== 0;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (this.buffer.length < 4) break;
        length = (this.buffer[2] << 8) | this.buffer[3];
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) break;
        const high =
          (this.buffer[2] << 24) | (this.buffer[3] << 16) | (this.buffer[4] << 8) | this.buffer[5];
        if (high !== 0) {
          closeCode = 1009;
          break;
        }
        length =
          ((this.buffer[6] << 24) |
            (this.buffer[7] << 16) |
            (this.buffer[8] << 8) |
            this.buffer[9]) >>>
          0;
        offset = 10;
      }

      // Refuse an oversized claim before a single payload byte is buffered:
      // waiting for the frame to arrive first would let a peer make the host
      // hold (and re-copy) a buffer of any declared size.
      if (length + this.pending.length > MAX_MESSAGE_BYTES) {
        closeCode = 1009;
        break;
      }

      let maskKey: Uint8Array | null = null;
      if (masked) {
        if (this.buffer.length < offset + 4) break;
        maskKey = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (this.buffer.length < offset + length) break;

      const payload = this.buffer.slice(offset, offset + length);
      this.buffer = this.buffer.slice(offset + length);
      // Every frame a client sends must be masked: an unmasked frame is not a
      // browser, and unmasking garbage would feed the parser lies.
      if (!maskKey) {
        closeCode = 1002;
        break;
      }
      for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];

      if (opcode === 0x0 || opcode === 0x1) {
        // A masked text frame, or a continuation of one.
        if (opcode === 0x0 && !this.fragmenting) {
          closeCode = 1002;
          break;
        }
        if (opcode === 0x1 && this.fragmenting) {
          closeCode = 1002;
          break;
        }
        const text = asciiText(payload);
        this.pending += text;
        if (fin) {
          messages.push(this.pending);
          this.pending = '';
          this.fragmenting = false;
        } else {
          this.fragmenting = true;
        }
      } else if (opcode === 0x2) {
        // Binary is not part of this protocol.
        closeCode = 1003;
        break;
      } else if (opcode === 0x8) {
        // The browser said goodbye; acknowledge and hang up.
        closeCode = 1000;
        break;
      } else if (opcode === 0x9) {
        // A ping must be answered with the same payload, unfragmented.
        if (!fin || payload.length > 125) {
          closeCode = 1002;
          break;
        }
        replies.push(encodeFrame(0xa, payload));
      } else if (opcode === 0xa) {
        if (!fin || payload.length > 125) {
          closeCode = 1002;
          break;
        }
        // Pong: nothing to do.
      } else {
        // 0x3-0x7 reserved data, 0xb-0xf reserved control.
        closeCode = 1002;
        break;
      }
    }

    return { messages, replies, closeCode };
  }
}

export const headerLimit = MAX_HEADER_BYTES;
export const messageLimit = MAX_MESSAGE_BYTES;
