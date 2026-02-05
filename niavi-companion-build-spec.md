# Niavi Companion — Build Spec for Claude Code

> **What this document is:** A complete technical specification for building the Niavi Companion app. Follow it step by step. Ask clarifying questions if anything is ambiguous. Do not add features beyond what is specified here.

---

## 1. Project Overview

Build a lightweight **Electron menu bar app** (macOS primary, cross-platform) that:
1. Sits in the system tray / menu bar — no dock icon, no visible window
2. Listens for the wake word **"Picovoice"** using Picovoice Porcupine (on-device, no cloud)
3. When the wake word is detected, sends a signal to the **Niavi Chrome extension** via Chrome Native Messaging
4. The Chrome extension receives the signal, opens its side panel, and starts listening for a voice command

---

## 2. Project Setup

### 2.1 Initialize the project

```bash
mkdir niavi-companion
cd niavi-companion
npm init -y
```

### 2.2 Install dependencies

```bash
# Electron + menu bar helper
npm install electron
npm install menubar  # https://github.com/nicholassulistyo/menubar-v2 or electron-tray directly

# Picovoice Porcupine for Node.js
npm install @picovoice/porcupine-node

# Audio input (PCM mic stream for Node.js)
npm install node-record-lpcm16

# Dev tooling
npm install --save-dev electron-builder
```

**Note on `node-record-lpcm16`:** This package requires **SoX** to be installed on the system.
- macOS: `brew install sox`
- Windows: Download SoX from https://sourceforge.net/projects/sox/ and add to PATH
- Document this requirement in the project README

**Alternative if SoX is problematic:** Use `mic` npm package or Electron's built-in `desktopCapturer` / Web Audio API from a hidden renderer process. The key requirement is: produce a 16-bit PCM stream at 16kHz sample rate, mono channel, in frames of `porcupine.frameLength` samples.

### 2.3 Project structure

```
niavi-companion/
├── package.json
├── .env                          # Picovoice access key (gitignored)
├── .gitignore
├── README.md
├── src/
│   ├── main.js                   # Electron main process entry
│   ├── tray.js                   # Tray icon, menu, and state management
│   ├── wake-word.js              # Porcupine wake word detection engine
│   ├── native-messaging.js       # Chrome Native Messaging host
│   └── config.js                 # App configuration and constants
├── assets/
│   ├── tray-icon.png             # Menu bar icon (22x22, template image for macOS)
│   ├── tray-icon-active.png      # Icon when listening / wake word active
│   └── tray-icon-disabled.png    # Icon when detection is paused
├── native-messaging-host/
│   ├── com.niavi.companion.json  # Chrome native messaging host manifest
│   └── install-host.sh           # Script to register the host with Chrome (macOS)
│   └── install-host.bat          # Script to register the host with Chrome (Windows)
├── extension-patch/
│   └── EXTENSION-PATCH.md        # Instructions for what to add to the Chrome extension
└── build/                        # electron-builder output
```

---

## 3. Configuration

### 3.1 `.env` file

```
PICOVOICE_ACCESS_KEY=4ao3dhqqT4oB3E4On2+BZetEy1DCLaerOKr+C7YphO5Di1K6d9GYAg==
```

### 3.2 `src/config.js`

```javascript
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
  // Picovoice
  PICOVOICE_ACCESS_KEY: process.env.PICOVOICE_ACCESS_KEY,
  WAKE_WORD: 'Picovoice',  // Built-in keyword — change to .ppn path for custom "Hey Niavi" later

  // Chrome Native Messaging
  NATIVE_HOST_NAME: 'com.niavi.companion',
  CHROME_EXTENSION_ID: 'nnebdbifipedjdcjcjkhoediaoopkkgo',

  // Audio
  SAMPLE_RATE: 16000,    // Porcupine requires 16kHz
  FRAME_LENGTH: 512,     // Will be overridden by porcupine.frameLength at runtime

  // App
  APP_NAME: 'Niavi Companion',
};
```

Also install dotenv: `npm install dotenv`

---

## 4. Core Implementation

### 4.1 `src/main.js` — Electron Main Process

```javascript
const { app, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { createTray } = require('./tray');
const { WakeWordEngine } = require('./wake-word');
const { NativeMessagingHost } = require('./native-messaging');
const config = require('./config');

// Prevent dock icon on macOS
if (process.platform === 'darwin') {
  app.dock.hide();
}

let tray = null;
let wakeWordEngine = null;
let nativeMessaging = null;

app.whenReady().then(() => {
  // Initialize native messaging
  nativeMessaging = new NativeMessagingHost(config);

  // Initialize wake word engine
  wakeWordEngine = new WakeWordEngine(config, {
    onDetected: () => {
      console.log('[Niavi] Wake word detected!');
      tray.setImage(getIcon('active'));

      // Send signal to Chrome extension
      nativeMessaging.sendWakeSignal();

      // Reset icon after brief flash
      setTimeout(() => {
        tray.setImage(getIcon('default'));
      }, 1500);
    },
    onError: (err) => {
      console.error('[Niavi] Wake word error:', err);
    }
  });

  // Create tray
  tray = createTray({
    onToggleListening: (enabled) => {
      if (enabled) {
        wakeWordEngine.start();
      } else {
        wakeWordEngine.stop();
      }
    },
    onQuit: () => {
      wakeWordEngine.stop();
      app.quit();
    }
  });

  // Start listening by default
  wakeWordEngine.start();
});

app.on('window-all-closed', (e) => {
  e.preventDefault(); // Keep app running — it's a tray app
});

function getIcon(state) {
  const iconName = state === 'active' ? 'tray-icon-active.png'
    : state === 'disabled' ? 'tray-icon-disabled.png'
    : 'tray-icon.png';
  return nativeImage.createFromPath(path.join(__dirname, '..', 'assets', iconName));
}
```

### 4.2 `src/tray.js` — System Tray

```javascript
const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

function createTray({ onToggleListening, onQuit }) {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  const tray = new Tray(nativeImage.createFromPath(iconPath));

  let isListening = true;

  function buildMenu() {
    return Menu.buildFromTemplate([
      {
        label: `Niavi Companion`,
        enabled: false,  // Just a header
      },
      { type: 'separator' },
      {
        label: isListening ? '✓ Listening for wake word' : '  Wake word paused',
        click: () => {
          isListening = !isListening;
          onToggleListening(isListening);
          tray.setContextMenu(buildMenu());
        }
      },
      { type: 'separator' },
      {
        label: 'Quit Niavi Companion',
        click: onQuit
      }
    ]);
  }

  tray.setToolTip('Niavi Companion');
  tray.setContextMenu(buildMenu());

  return tray;
}

module.exports = { createTray };
```

### 4.3 `src/wake-word.js` — Porcupine Engine

```javascript
const Porcupine = require('@picovoice/porcupine-node');
// For built-in keywords:
const { BUILTIN_KEYWORD_PATHS, getBuiltinKeywordPath } = require('@picovoice/porcupine-node');

class WakeWordEngine {
  constructor(config, callbacks) {
    this.config = config;
    this.callbacks = callbacks;
    this.porcupine = null;
    this.recorder = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;

    try {
      // Initialize Porcupine with built-in keyword
      this.porcupine = new Porcupine(
        this.config.PICOVOICE_ACCESS_KEY,
        [getBuiltinKeywordPath(this.config.WAKE_WORD)],  // keyword path(s)
        [0.5]  // sensitivity — 0.5 is default, range [0, 1]
      );

      const frameLength = this.porcupine.frameLength;
      const sampleRate = this.porcupine.sampleRate;

      console.log(`[Niavi] Porcupine initialized — frameLength: ${frameLength}, sampleRate: ${sampleRate}`);

      // Start mic recording
      // IMPORTANT: The exact mic recording approach may vary.
      // Option A: node-record-lpcm16 (requires SoX)
      // Option B: mic npm package
      // Option C: Hidden BrowserWindow with Web Audio API
      //
      // Use whichever works. The critical contract is:
      // - 16-bit signed PCM
      // - 16000 Hz sample rate
      // - Mono
      // - Deliver audio in chunks, buffer into frames of `frameLength` samples

      const record = require('node-record-lpcm16');

      this.recorder = record.record({
        sampleRate: sampleRate,
        channels: 1,
        audioType: 'raw',     // raw PCM
        encoding: 'signed-integer',
        bitDepth: 16,
        recorder: process.platform === 'darwin' ? 'sox' : 'sox',
      });

      let audioBuffer = Buffer.alloc(0);
      const bytesPerFrame = frameLength * 2; // 16-bit = 2 bytes per sample

      this.recorder.stream().on('data', (chunk) => {
        audioBuffer = Buffer.concat([audioBuffer, chunk]);

        while (audioBuffer.length >= bytesPerFrame) {
          const frame = new Int16Array(frameLength);
          for (let i = 0; i < frameLength; i++) {
            frame[i] = audioBuffer.readInt16LE(i * 2);
          }
          audioBuffer = audioBuffer.slice(bytesPerFrame);

          const keywordIndex = this.porcupine.process(frame);
          if (keywordIndex >= 0) {
            this.callbacks.onDetected();
          }
        }
      });

      this.recorder.stream().on('error', (err) => {
        this.callbacks.onError(err);
      });

      this.isRunning = true;
      console.log('[Niavi] Wake word detection started');

    } catch (err) {
      this.callbacks.onError(err);
    }
  }

  stop() {
    if (!this.isRunning) return;

    if (this.recorder) {
      this.recorder.stop();
      this.recorder = null;
    }
    if (this.porcupine) {
      this.porcupine.release();
      this.porcupine = null;
    }

    this.isRunning = false;
    console.log('[Niavi] Wake word detection stopped');
  }
}

module.exports = { WakeWordEngine };
```

### 4.4 `src/native-messaging.js` — Chrome Native Messaging Host

This is the **most critical and nuanced part**. Chrome Native Messaging works by Chrome launching a **separate host process** (a standalone executable/script), NOT by the Electron app connecting to Chrome. The communication flow is:

```
Chrome extension calls chrome.runtime.sendNativeMessage(hostName, message)
  → Chrome launches the native messaging host process
  → Host process reads from stdin, writes to stdout
  → Messages are length-prefixed JSON (4-byte uint32 LE header + JSON body)
```

**However**, for our use case the flow is **reversed** — the Companion app needs to **push** a message to the extension (not the other way around). Chrome Native Messaging doesn't support this natively — the host can only respond when the extension initiates contact.

#### Solution: Hybrid approach

The Companion app will write a signal file and use **two communication channels**:

**Channel A — File-based signaling + Extension polling (simple, reliable):**
1. Companion app writes a timestamp to a known signal file when wake word is detected
2. The Chrome extension polls this file periodically via a native messaging host that reads it
3. This is the simplest approach that definitely works

**Channel B — WebSocket (lower latency, recommended):**
1. Companion app runs a tiny local WebSocket server on `ws://localhost:38741`
2. Chrome extension connects to it from its service worker
3. Companion sends `{ "type": "wake_word_detected" }` over the WebSocket
4. Extension receives it instantly, opens side panel, starts listening

**Go with Channel B (WebSocket).** It's the standard approach for Electron ↔ extension communication and gives instant response.

```javascript
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

      ws.on('message', (data) => {
        // Extension can send messages to companion if needed in the future
        console.log('[Niavi] Received from extension:', data.toString());
      });

      // Send a handshake confirmation
      ws.send(JSON.stringify({ type: 'connected', app: 'niavi-companion' }));
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
        client.send(message);
        console.log('[Niavi] Wake signal sent to extension');
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
```

Install WebSocket: `npm install ws`

---

## 5. Chrome Extension Patch

The existing Niavi Chrome extension needs a small addition to connect to the Companion app's WebSocket server. Create this file in the `extension-patch/` directory with instructions.

### 5.1 `extension-patch/EXTENSION-PATCH.md`

```markdown
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
```

---

## 6. Tray Icons

Generate simple tray icons. For macOS, template images work best (black silhouettes on transparent background, 22x22px). For initial development, create placeholder icons:

```javascript
// In main.js, for dev/placeholder icons, you can create them programmatically:
// Or just use simple PNG files. For macOS template images, name them xxxTemplate.png
// and Electron will auto-handle dark/light mode.
```

**Minimum icons needed:**
- `tray-icon.png` — Default state (listening). Simple microphone icon, 22x22, black on transparent. On macOS, name it `tray-iconTemplate.png` for auto dark mode support.
- `tray-icon-active.png` — Wake word just detected. Same icon but with a highlight/pulse color.
- `tray-icon-disabled.png` — Paused. Same icon but grayed out or with a line through it.

For v1, even a simple colored circle (green=listening, yellow=detected, gray=paused) is fine as placeholder.

---

## 7. package.json Scripts

```json
{
  "name": "niavi-companion",
  "version": "1.0.0",
  "description": "Companion app for Niavi Chrome extension — wake word detection",
  "main": "src/main.js",
  "scripts": {
    "start": "electron .",
    "build:mac": "electron-builder --mac",
    "build:win": "electron-builder --win",
    "build": "electron-builder --mac --win"
  },
  "build": {
    "appId": "com.niavi.companion",
    "productName": "Niavi Companion",
    "mac": {
      "category": "public.app-category.utilities",
      "target": "dmg",
      "icon": "assets/app-icon.icns"
    },
    "win": {
      "target": "nsis",
      "icon": "assets/app-icon.ico"
    }
  }
}
```

---

## 8. README.md

Include:
- What the app does (one paragraph)
- Prerequisites: Node.js 18+, SoX (`brew install sox` on macOS)
- Setup: `npm install`, create `.env` with Picovoice key
- Run: `npm start`
- How to connect to Chrome extension (link to EXTENSION-PATCH.md)
- Wake word: Currently "Picovoice" (built-in), will be "Hey Niavi" (custom) in future

---

## 9. .gitignore

```
node_modules/
dist/
build/
.env
*.ppn
```

---

## 10. Testing Checklist

After building, verify:

1. [ ] `npm start` launches with no visible window, only a tray/menu bar icon
2. [ ] Clicking tray icon shows context menu with listening toggle and quit
3. [ ] Console shows "Porcupine initialized" with frame length and sample rate
4. [ ] Saying "Picovoice" triggers a console log "[Niavi] Wake word detected!"
5. [ ] WebSocket server starts on ws://127.0.0.1:38741
6. [ ] A test WebSocket client (e.g., `wscat -c ws://127.0.0.1:38741`) receives the handshake
7. [ ] Saying "Picovoice" with a test client connected delivers the wake signal JSON
8. [ ] Toggle listening off → saying "Picovoice" does NOT trigger
9. [ ] Quit from tray menu cleanly exits the app

---

## 11. Important Notes for Claude Code

- **Do NOT add features beyond this spec.** No settings window, no auto-updater, no analytics. Keep it minimal.
- **The Picovoice API may have changed.** If `@picovoice/porcupine-node` has a different API than shown above, check the latest docs at https://github.com/Picovoice/porcupine and adapt. The core concept stays the same: initialize with access key + keyword, feed audio frames, check for detection.
- **If `node-record-lpcm16` doesn't work**, try the `mic` npm package or capture audio from a hidden Electron BrowserWindow using Web Audio API + `AudioWorklet`. The only requirement is getting 16-bit 16kHz PCM frames to Porcupine.
- **The WebSocket approach is simpler than Chrome Native Messaging** for this use case. Native Messaging requires Chrome to initiate the connection, but we need the companion app to push to the extension. WebSocket solves this cleanly.
- **Extension ID will change** when the extension is published to the Chrome Web Store. The current ID `nnebdbifipedjdcjcjkhoediaoopkkgo` is for the unpacked dev version. This only matters if we add Chrome Native Messaging later; the WebSocket approach doesn't care about extension IDs.
- **Port 38741** is arbitrary. If it conflicts, pick any unused port above 1024.

---

## 12. File Dependency Summary

```
npm install electron @picovoice/porcupine-node node-record-lpcm16 ws dotenv
npm install --save-dev electron-builder
```

System requirement: `brew install sox` (macOS)
