const { EventEmitter } = require('events');
const WebSocket = require('ws');

class WatchPartyClient extends EventEmitter {
  constructor() { super(); this.ws = null; }

  connect(host, port) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://${host}:${port}`);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          if (msg.type === 'sync') this.emit('sync', msg);
          else if (msg.type === 'chat' || msg.type === 'system') this.emit('chat-msg', msg);
        } catch(e) {}
      });
    });
  }

  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify(data));
  }

  disconnect() { this.ws?.close(); this.ws = null; }
}

module.exports = { WatchPartyClient };
