const WebSocket = require('ws');

class NativeMessagingHost {
  constructor(config) {
    this.config = config;
    this.wss = null;
    this.clients = new Set();
    this.startServer();
  }

  startServer() {
    const PORT = 38741; // Arbitrary high port unlikely to conflict

    this.wss = new WebSocket.Server({ port: PORT, host: '127.0.0.1' });

    this.wss.on('connection', (ws) => {
      console.log('[Niavi] Chrome extension connected via WebSocket');
      this.clients.add(ws);

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('[Niavi] Chrome extension disconnected');
      });

      ws.on('error', (err) => {
        console.error('[Niavi] WebSocket client error:', err.message);
        this.clients.delete(ws);
      });

      ws.on('message', (data) => {
        // Extension can send messages to companion if needed in the future
        console.log('[Niavi] Received from extension:', data.toString());
      });

      // Send a handshake confirmation
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'connected', app: 'niavi-companion' }));
        }
      } catch (err) {
        console.error('[Niavi] Failed to send handshake:', err.message);
      }
    });

    this.wss.on('error', (err) => {
      console.error('[Niavi] WebSocket server error:', err);
    });

    console.log(`[Niavi] WebSocket server listening on ws://127.0.0.1:${PORT}`);
  }

  sendWakeSignal() {
    const message = JSON.stringify({
      type: 'wake_word_detected',
      timestamp: Date.now()
    });

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
          console.log('[Niavi] Wake signal sent to extension');
        } catch (err) {
          console.error('[Niavi] Failed to send wake signal:', err.message);
          this.clients.delete(client);
        }
      }
    }

    if (this.clients.size === 0) {
      console.log('[Niavi] No extension connected — wake signal not delivered');
    }
  }

  stop() {
    if (this.wss) {
      this.wss.close();
    }
  }
}

module.exports = { NativeMessagingHost };
