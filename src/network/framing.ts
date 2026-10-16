import { NetworkMessage } from './protocol';

// TCP is a stream, not a message bus: a single read may contain several
// messages concatenated, or only part of one. We frame every message with a
// trailing newline and buffer partial reads until a complete line arrives.
//
// The line itself is kept to ASCII: any other character becomes a \uXXXX
// escape, which JSON.parse turns back into the original text. That is what
// lets the same bytes travel over a WebSocket frame without a UTF-8 codec on
// either side of the phone (see webSocket.ts).
const asciiSafe = (text: string): string =>
  text.replace(/[^\x00-\x7F]/g, char => {
    const code = char.charCodeAt(0).toString(16).padStart(4, '0');
    return `\\u${code}`;
  });

export const encodeMessage = (message: NetworkMessage): string =>
  `${asciiSafe(JSON.stringify(message))}\n`;

export class MessageDecoder {
  private buffer = '';

  push(chunk: string): NetworkMessage[] {
    this.buffer += chunk;

    const messages: NetworkMessage[] = [];
    let newlineIndex = this.buffer.indexOf('\n');

    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line) {
        try {
          messages.push(JSON.parse(line));
        } catch (e) {
          console.error('Failed to parse message', e);
        }
      }

      newlineIndex = this.buffer.indexOf('\n');
    }

    return messages;
  }

  reset() {
    this.buffer = '';
  }
}
