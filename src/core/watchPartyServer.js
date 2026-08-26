const { EventEmitter } = require('events');
const WebSocket = require('ws');
const os = require('os');

class WatchPartyServer extends EventEmitter {
  constructor(port) {
    super();
    this.port = port;
    this.wss = null;
    this.clients = new Map();
    this.guestCount = 0;
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocket.Server({ port: this.port }, () => resolve());
      this.wss.on('error', reject);
      this.wss.on('connection', (ws) => this._handleConnection(ws));
    });
  }

  _handleConnection(ws) {
    const id = ++this.guestCount;
    const name = `Guest ${id}`;
    this.clients.set(id, { ws, name });
    ws.send(JSON.stringify({ type: 'welcome', id, name }));
    this.emit('guest-joined', { id, name, count: this.clients.size });
    this.broadcast({ type: 'system', text: `${name} joined the party 🎉` }, id);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'chat') {
          this.emit('chat-msg', { from: name, text: msg.text, time: Date.now() });
          this.broadcast({ type: 'chat', from: name, text: msg.text, time: Date.now() });
        } else if (msg.type === 'sync-request') {
          this.emit('sync-request', msg);
        }
      } catch(e) {}
    });

    ws.on('close', () => {
      this.clients.delete(id);
      this.broadcast({ type: 'system', text: `${name} left the party` });
    });
  }

  broadcast(data, excludeId = null) {
    const msg = JSON.stringify(data);
    this.clients.forEach(({ ws }, id) => {
      if (id !== excludeId && ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
  }

  getRoomCode() {
    const interfaces = os.networkInterfaces();
    let ip = '127.0.0.1';
    for (const iface of Object.values(interfaces)) {
      for (const alias of iface) {
        if (alias.family === 'IPv4' && !alias.internal) { ip = alias.address; break; }
      }
    }
    return Buffer.from(`${ip}:${this.port}`).toString('base64');
  }

  stop() { this.wss?.close(); }
}

module.exports = { WatchPartyServer };
