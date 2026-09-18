import { NetworkMessage } from './protocol';

export class PlayerClient {
  private roomId: string;
  
  constructor(roomId: string) {
    this.roomId = roomId;
  }

  // Send action to Narrator
  sendMessage(message: NetworkMessage) {
    console.log(`Sending message to host: ${message.type}`);
  }

  // Listener for server updates
  onMessage(callback: (message: NetworkMessage) => void) {
    console.log("Listening for messages from host...");
    // In real implementation, this would be websocket.on('message', ...)
  }
}
