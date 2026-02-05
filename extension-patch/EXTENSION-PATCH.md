# Chrome Extension Patch for Niavi Companion

Add the following to the Niavi Chrome extension to receive wake word signals
from the Companion app.

## Step 1: Add to manifest.json

Add WebSocket permission (if not already present, though WebSocket to localhost
typically doesn't require special permissions for service workers):

No manifest changes needed — service workers can connect to ws://localhost without
additional permissions.

## Step 2: Add companion-link.js to the extension

Create a new file in the extension project:

### `companion-link.js` (load in service worker / background.js)

```js
// companion-link.js — Connects to Niavi Companion desktop app
(function initCompanionLink() {
  const WS_URL = 'ws://127.0.0.1:38741';
  let ws = null;
  let reconnectTimer = null;

  function connect() {
    try {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('[Niavi] Connected to Companion app');
        clearReconnectTimer();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'wake_word_detected') {
            console.log('[Niavi] Wake word detected — activating side panel');
            handleWakeWord();
          }
        } catch (e) {
          console.error('[Niavi] Failed to parse companion message:', e);
        }
      };

      ws.onclose = () => {
        console.log('[Niavi] Disconnected from Companion app, will retry...');
        scheduleReconnect();
      };

      ws.onerror = (err) => {
        // Connection refused is expected when Companion app isn't running
        ws.close();
      };
    } catch (e) {
      scheduleReconnect();
    }
  }

  function handleWakeWord() {
    // Option A: Send internal message to open side panel and start listening
    // This uses the extension's existing chrome.runtime.onMessage handler
    chrome.runtime.sendMessage({
      type: 'WAKE_WORD_ACTIVATED',
      source: 'companion'
    });

    // Option B (if the extension has a direct function):
    // You may need to adapt this to match the extension's existing
    // side panel opening logic. The key action is:
    // 1. Open the side panel
    // 2. Start voice recognition (same as what Ctrl+Z does)
  }

  function scheduleReconnect() {
    clearReconnectTimer();
    reconnectTimer = setTimeout(() => {
      connect();
    }, 5000); // Retry every 5 seconds
  }

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  // Start connection
  connect();
})();
```

## Step 3: Import in background/service worker

In the extension's service worker (background.js or wherever the service worker is defined),
add at the top:

```js
importScripts('companion-link.js');
```

Or if using ES modules, import it accordingly.

## Step 4: Handle the WAKE_WORD_ACTIVATED message

In the extension's existing message handler (chrome.runtime.onMessage), add a case:

```js
if (message.type === 'WAKE_WORD_ACTIVATED') {
  // Open side panel — use the same logic that Ctrl+Z currently triggers
  // This likely involves:
  chrome.sidePanel.open({ windowId: sender.tab?.windowId || (await chrome.windows.getCurrent()).id });
  // Then send a message to the side panel to start listening
  // (The exact implementation depends on how the extension currently handles Ctrl+Z activation)
}
```

The extension developer (you, with Claude Code on the extension project) should adapt
`handleWakeWord()` to match whatever the Ctrl+Z shortcut currently does.
