import { NetworkMessage } from './protocol';

// TCP is a stream, not a message bus: a single read may contain several
// messages concatenated, or only part of one. We frame every message with a
// trailing newline and buffer partial reads until a complete line arrives.

export const encodeMessage = (message: NetworkMessage): string =>
  `${JSON.stringify(message)}\n`;

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
