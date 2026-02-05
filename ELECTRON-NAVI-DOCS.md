# Electron-Navi — Project Documentation

## What It Is

Electron-Navi is a lightweight macOS menu bar app that enables hands-free voice activation for the Niavi Chrome extension. Instead of pressing Option+Z to open Niavi, you say a wake word and Niavi opens automatically, ready to listen for your command.

## How It Works

```
You say "Picovoice"
        ↓
Electron-Navi (menu bar app)
  → Picovoice Porcupine detects the wake word on-device (no cloud)
  → Sends a WebSocket message to the Chrome extension
        ↓
Niavi Chrome Extension
  → Receives the wake signal
  → Opens a floating voice control window
  → Starts listening for your command
        ↓
You say your command (e.g. "Go to YouTube")
  → Niavi executes it
  → Say "I'm done" to close
```

## Architecture

There are two separate projects that work together:

### 1. Electron-Navi (this project — `~/electron-navi/`)

A tray/menu bar Electron app that:
- Runs silently in the macOS menu bar (star icon, no dock icon)
- Listens continuously for the wake word using Picovoice Porcupine
- Runs a local WebSocket server on `ws://127.0.0.1:38741`
- When wake word detected → sends `{ "type": "wake_word_detected" }` to any connected client

**Key files:**
- `src/main.js` — Electron main process, tray setup, coordinates everything
- `src/wake-word.js` — Porcupine wake word engine, mic input, audio processing
- `src/native-messaging.js` — WebSocket server that talks to the Chrome extension
- `src/config.js` — Configuration (Picovoice key, wake word, port)
- `.env` — Picovoice access key (gitignored, not committed)

**Tech stack:**
- Electron (menu bar app)
- @picovoice/porcupine-node (on-device wake word detection)
- node-record-lpcm16 + SoX (microphone audio capture)
- ws (WebSocket server)

### 2. Niavi Chrome Extension (separate project — `~/niavi-io/`)

The existing Niavi extension with a small addition:

- `companion-link.js` — WebSocket client that connects to Electron-Navi
  - Auto-connects to `ws://127.0.0.1:38741`
  - Reconnects every 5 seconds if Electron-Navi isn't running
  - When `wake_word_detected` received → opens floating voice control window
  - Tracks the floating window ID for refocusing and closing
  - Exports `refocusCompanionWindow()` and `closeCompanionWindow()`
- `background.js` — Updated to import companion-link.js and handle the floating window lifecycle

**Branch:** The companion integration lives on the `companion-integration` branch.

## Communication Flow

```
Electron-Navi                          Chrome Extension
┌─────────────────┐                   ┌─────────────────┐
│ WebSocket Server │◄──connection────│ companion-link.js│
│ port 38741       │                  │ (WebSocket client)│
│                  │──wake signal──►│                   │
└─────────────────┘                   │ Opens floating   │
                                      │ window + listens │
                                      └─────────────────┘
```

- The connection is initiated by the Chrome extension (client) to Electron-Navi (server)
- The wake word signal is pushed from Electron-Navi to the extension
- If Electron-Navi isn't running, the extension silently retries every 5 seconds
- If the extension isn't connected, Electron-Navi logs "No extension connected"

## Why a Floating Window (Not the Side Panel)

Chrome's `sidePanel.open()` API requires a "user gesture" — meaning a physical click or keypress from the user. A programmatic trigger from a WebSocket message doesn't count. This is a Chrome security restriction with no workaround.

The solution: `chrome.windows.create({ type: 'popup' })` creates a floating window that doesn't require a user gesture. It loads the same `sidepanel.html` and auto-starts listening. The floating window:
- Refocuses itself after tab-switching commands (150ms delay)
- Closes when the user says "I'm done"
- Tracks its own window ID to prevent duplicates

## Wake Word

**Current:** "Picovoice" (built-in Porcupine keyword, free)

**Future:** "Hey Niavi" (requires custom .ppn model trained in Picovoice Console)

**All available built-in keywords:**
Alexa, Americano, Blueberry, Bumblebee, Computer, Grapefruit, Grasshopper, Hey Google, Hey Siri, Jarvis, OK Google, Picovoice, Porcupine, Terminator

To change the wake word, edit `src/config.js`:
```javascript
WAKE_WORD: 'Jarvis',  // or any built-in keyword
```
For a custom keyword, replace with the path to the .ppn file:
```javascript
WAKE_WORD: '/path/to/hey-niavi.ppn',
```

## Setup & Running

### Prerequisites
- Node.js 18+
- SoX: `brew install sox`
- Picovoice access key (in `.env` file)

### Start the app
```bash
cd ~/electron-navi
npm start
```

### Verify it's running
- Star icon appears in menu bar (green = listening)
- Console shows: `[Niavi] WebSocket server listening on ws://127.0.0.1:38741`
- Console shows: `[Niavi] Porcupine initialized`
- Console shows: `[Niavi] Chrome extension connected via WebSocket` (when Chrome is open with Niavi)

### Stop the app
- Click star icon → Quit Electron-Navi
- Or `Ctrl+C` in terminal
- Or: `lsof -ti:38741 | xargs kill -9` (force kill if stuck)

### Common issues
| Problem | Fix |
|---------|-----|
| `EADDRINUSE: address already in use` | Old instance still running. Run `lsof -ti:38741 \| xargs kill -9` |
| `No extension connected` | Reload extension in Chrome (`chrome://extensions` → refresh) |
| Wake word not detecting | Check mic permissions in System Settings → Privacy → Microphone |
| Star icon not appearing | Check if another instance is running |

## Tray Icon States

- **Green star** — Listening for wake word
- **Purple star** — Wake word just detected (flashes briefly)
- **Gray star** — Paused (toggled off from menu)

## Project Structure

```
electron-navi/
├── .env                          # Picovoice access key (gitignored)
├── .gitignore
├── package.json
├── README.md
├── electron-navi-build-spec.md   # Original build spec (reference)
├── src/
│   ├── main.js                   # Electron main process
│   ├── tray.js                   # Tray icon and menu
│   ├── wake-word.js              # Porcupine wake word engine
│   ├── native-messaging.js       # WebSocket server
│   └── config.js                 # Configuration
├── assets/
│   ├── tray-icon.png             # Green star (listening)
│   ├── tray-icon-active.png      # Purple star (detected)
│   └── tray-icon-disabled.png    # Gray star (paused)
└── native-messaging-host/        # Chrome native messaging (not used in v1)
```

## Future Roadmap (v2)

Once the native app exists, it can be extended to:

1. **Cross-app switching** — "Hey Niavi, switch to Slack" using AppleScript/macOS Accessibility APIs
2. **Speech-to-text after wake word** — Record and transcribe what you say after the wake word, then parse whether it's a browser command or system command
3. **Global hotkeys** — Work even when Chrome isn't focused
4. **Custom "Hey Niavi" wake word** — Train via Picovoice Console
5. **System-wide voice commands** — Evolve from browser assistant to desktop assistant

## Key Decisions & Tradeoffs

| Decision | Why |
|----------|-----|
| WebSocket over Chrome Native Messaging | Native Messaging requires Chrome to initiate; we need the app to push to the extension |
| Floating window over side panel | `sidePanel.open()` requires user gesture; `windows.create` doesn't |
| Picovoice Porcupine | On-device, no cloud, minimal battery, free tier available |
| SoX for audio capture | Reliable cross-platform PCM audio; requires system install |
| Port 38741 | Arbitrary high port, unlikely to conflict |
| Built-in "Picovoice" wake word | Free, no custom model needed; swap to "Hey Niavi" later |

## Dependencies

```json
{
  "electron": "menu bar app framework",
  "@picovoice/porcupine-node": "on-device wake word detection",
  "node-record-lpcm16": "microphone audio capture (requires SoX)",
  "ws": "WebSocket server",
  "dotenv": "environment variable management",
  "electron-builder": "packaging (dev dependency)"
}
```

System: `brew install sox`
