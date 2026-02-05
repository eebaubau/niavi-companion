# Electron-Navi v2 — App Switcher Build Spec

> **What this document is:** A complete technical specification for adding app-switching functionality to Electron-Navi. Claude Code should read this and implement it step by step.

---

## 1. Overview

Add a second wake word ("Computer") to Electron-Navi that opens a **horizontal app switcher overlay** showing currently running macOS apps with their icons — similar to Command+Tab. The user then says a number or the app name to switch to it.

**Flow:**
1. User says **"Computer"**
2. Electron-Navi detects the wake word
3. A centered, frameless overlay window appears showing running apps horizontally with icons
4. User says **"three"** or **"Slack"** (or presses the number key, or clicks)
5. The app switches, overlay disappears

**"Picovoice"** continues to work as before — opens Niavi voice control in Chrome.

---

## 2. Changes to Existing Code

### 2.1 Add "Computer" as a second wake word

**File: `src/config.js`**

```javascript
module.exports = {
  // ...existing config...
  WAKE_WORDS: ['Picovoice', 'Computer'],  // Changed from single WAKE_WORD
  WAKE_WORD_ACTIONS: {
    0: 'niavi',        // Index 0 = Picovoice → open Niavi (existing behavior)
    1: 'app_switcher'  // Index 1 = Computer → open app switcher (new)
  },
};
```

### 2.2 Update wake word engine for multiple keywords

**File: `src/wake-word.js`**

Porcupine natively supports multiple keywords. When initialized with an array, `porcupine.process()` returns the **index** of the detected keyword (or -1 if none).

```javascript
// Before (single keyword):
this.porcupine = new Porcupine(accessKey, [getBuiltinKeywordPath('Picovoice')], [0.5]);

// After (multiple keywords):
const keywordPaths = config.WAKE_WORDS.map(kw => getBuiltinKeywordPath(kw));
const sensitivities = config.WAKE_WORDS.map(() => 0.5);
this.porcupine = new Porcupine(config.PICOVOICE_ACCESS_KEY, keywordPaths, sensitivities);
```

Update detection callback to pass which keyword was detected:

```javascript
const keywordIndex = this.porcupine.process(frame);
if (keywordIndex >= 0) {
  const action = config.WAKE_WORD_ACTIONS[keywordIndex];
  this.callbacks.onDetected(keywordIndex, action);
}
```

**Add pause/resume methods** — needed so the mic can be freed for voice selection:

```javascript
stop() {
  // Stop recording, release mic
}

start() {
  // Resume recording and wake word detection
}
```

### 2.3 Update main.js to route wake words

**File: `src/main.js`**

```javascript
const { openAppSwitcher, setupSwitcherIPC } = require('./app-switcher');

// Call once during app initialization
setupSwitcherIPC();

wakeWordEngine = new WakeWordEngine(config, {
  onDetected: (keywordIndex, action) => {
    console.log(`[Niavi] Wake word: ${config.WAKE_WORDS[keywordIndex]} → ${action}`);

    if (action === 'niavi') {
      // Existing behavior — send wake signal to Chrome extension
      nativeMessaging.sendWakeSignal();
      tray.setImage(getIcon('active'));
      setTimeout(() => tray.setImage(getIcon('default')), 1500);
    
    } else if (action === 'app_switcher') {
      // Pause wake word so Web Speech API can use the mic
      wakeWordEngine.stop();
      tray.setImage(getIcon('active'));

      openAppSwitcher(() => {
        // This callback fires when the switcher closes
        wakeWordEngine.start();
        tray.setImage(getIcon('default'));
      });
    }
  },
});
```

---

## 3. App Switcher Implementation

### 3.1 New file: `src/app-switcher.js`

This module handles everything: getting running apps, extracting icons, creating the overlay, handling selection.

**Key functions:**
- `getRunningApps()` — AppleScript to list visible running apps
- `openAppSwitcher(onClose)` — creates the overlay window, calls onClose when done
- `closeSwitcher()` — closes the overlay
- `switchToApp(appName)` — AppleScript to activate the app
- `setupSwitcherIPC()` — registers IPC handlers for renderer communication

**Getting running apps:**
```javascript
const script = `
  tell application "System Events"
    set appList to {}
    repeat with proc in (every process whose background only is false)
      set appName to name of proc
      set bundleId to bundle identifier of proc
      set end of appList to appName & "|" & bundleId
    end repeat
    return appList
  end tell
`;
```

Filter out system/background apps: Finder, Dock, SystemUIServer, Control Center, Notification Center, WindowServer, Electron (this app itself).

**Getting app icons:**

Use Electron's built-in `app.getFileIcon()`:
```javascript
const { app } = require('electron');

// Get the .app path first via AppleScript, then:
const icon = await app.getFileIcon('/Applications/Slack.app', { size: 'large' });
const iconDataUrl = icon.toDataURL();
```

If `getFileIcon` doesn't work for a particular app, fall back to showing the first letter of the app name.

**Switching apps:**
```javascript
function switchToApp(appName) {
  const script = `tell application "${appName}" to activate`;
  exec(`osascript -e '${script}'`);
}
```

**The overlay window:**
```javascript
switcherWindow = new BrowserWindow({
  width: calculatedWidth,  // Based on number of apps
  height: 140,
  x: centered,
  y: centered,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  focusable: true,
  hasShadow: true,
  webPreferences: {
    preload: path.join(__dirname, 'switcher-preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  }
});
```

**Auto-close:** Close the switcher after 10 seconds of no input.

**onClose callback:** When the switcher window closes (for any reason), call the `onClose` callback so main.js can resume Porcupine wake word detection.

---

### 3.2 New file: `src/switcher-preload.js`

Context bridge for the switcher renderer:

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onAppsData: (callback) => ipcRenderer.on('apps-data', (event, data) => callback(data)),
  selectApp: (appName) => ipcRenderer.send('select-app', appName),
  selectAppByNumber: (num) => ipcRenderer.send('select-app-number', num),
  closeSwitcher: () => ipcRenderer.send('close-switcher'),
});
```

---

### 3.3 New file: `views/switcher.html`

The overlay UI. Key design requirements:

**Visual design (like Command+Tab):**
- Dark translucent background with blur (macOS glass effect)
- `background: rgba(30, 30, 30, 0.92)` with `backdrop-filter: blur(20px)`
- Rounded corners: `border-radius: 16px`
- Subtle border: `1px solid rgba(255, 255, 255, 0.1)`
- Centered on screen

**App items in a horizontal row:**
- Each app: 48×48 icon + app name below + small number badge
- Number badge in top-right corner of each icon (1, 2, 3...)
- App name: 11px, white, truncated with ellipsis if too long
- Hover: light highlight background
- Selected: brighter highlight + subtle blue border

**Status text at the bottom:**
- Small text: "Say a number or app name" with a green pulsing dot
- Updates to "Switching to Slack..." when selected

**Three input methods:**

1. **Voice** — Web Speech API (see section 4)
2. **Keyboard** — Press number keys 1-9 to select
3. **Click** — Click an app icon

**Keyboard support:**
- Number keys 1-9 → select app
- Escape → close switcher

---

## 4. Voice Selection via Web Speech API

When the switcher opens, start listening using Electron's built-in Web Speech API (Chromium's `SpeechRecognition`). This is free, requires no API key, and works for simple words like numbers and app names.

**Add to the switcher.html script:**

```javascript
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 3;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.toLowerCase().trim();

    // Map spoken numbers to digits
    const numberMap = {
      'one': 1, 'won': 1, '1': 1,
      'two': 2, 'to': 2, 'too': 2, '2': 2,
      'three': 3, 'tree': 3, 'free': 3, '3': 3,
      'four': 4, 'for': 4, '4': 4,
      'five': 5, '5': 5,
      'six': 6, '6': 6,
      'seven': 7, '7': 7,
      'eight': 8, 'ate': 8, '8': 8,
      'nine': 9, '9': 9,
    };

    if (numberMap[transcript]) {
      window.electronAPI.selectAppByNumber(numberMap[transcript]);
      return;
    }

    // Fuzzy match against app names
    // (check if transcript contains app name or vice versa)
  };

  // Start after 300ms delay to let Porcupine release the mic
  setTimeout(() => recognition.start(), 300);
}
```

**CRITICAL: Mic handoff.** Porcupine must STOP before the switcher opens so the Web Speech API can access the microphone. Porcupine resumes when the switcher closes. This is handled in main.js (section 2.3).

**Fallback:** If Web Speech API doesn't work in Electron, the user can still use keyboard (number keys) or click. Log a console message: `[Niavi] Web Speech API not available — use keyboard or click to select.`

**Note:** Web Speech API in Chromium requires an internet connection (it sends audio to Google servers). This is fine for now. For offline support later, swap to Picovoice Leopard or local Whisper.

---

## 5. macOS Permissions

The app needs **Accessibility permission** to list running apps and switch between them.

On startup, check and prompt:
```javascript
const { systemPreferences } = require('electron');

if (process.platform === 'darwin') {
  const trusted = systemPreferences.isTrustedAccessibilityClient(false);
  if (!trusted) {
    systemPreferences.isTrustedAccessibilityClient(true); // Shows system prompt
    console.log('[Niavi] Accessibility permission required for app switching.');
  }
}
```

User must grant in: **System Settings → Privacy & Security → Accessibility → Electron-Navi**

---

## 6. File Summary

**New files:**
| File | Purpose |
|------|---------|
| `src/app-switcher.js` | App listing, icon extraction, overlay window, AppleScript switching |
| `src/switcher-preload.js` | IPC bridge for switcher renderer |
| `views/switcher.html` | Horizontal app switcher overlay UI |

**Modified files:**
| File | Change |
|------|--------|
| `src/config.js` | Add second wake word "Computer" and action mapping |
| `src/wake-word.js` | Multiple keywords, pass index to callback, add stop/start methods |
| `src/main.js` | Route wake words to different actions, pause/resume Porcupine, IPC setup |

**Unchanged:**
| File | Why |
|------|-----|
| `src/native-messaging.js` | WebSocket to Chrome is separate, untouched |
| `src/tray.js` | No changes needed (unless adding switcher state to menu) |
| Chrome extension | Not involved in app switching at all |

---

## 7. Testing Checklist

1. [ ] Say "Picovoice" → Niavi opens in Chrome (existing, unchanged)
2. [ ] Say "Computer" → app switcher overlay appears centered on screen
3. [ ] Overlay shows running apps horizontally with icons (like Cmd+Tab)
4. [ ] Each app has a number badge (1, 2, 3...)
5. [ ] Press number key → switches to that app, overlay closes
6. [ ] Click an app icon → switches to that app, overlay closes
7. [ ] Say "three" or "Slack" → switches (if Web Speech API works)
8. [ ] Press Escape → overlay closes without switching
9. [ ] Overlay auto-closes after 10 seconds of no input
10. [ ] Wake word detection pauses while switcher is open
11. [ ] Wake word detection resumes after switcher closes
12. [ ] After switching apps, saying "Computer" again works
13. [ ] Accessibility permission prompt appears on first use
14. [ ] Works with 2-3 apps open, and also with 8-9 apps open

---

## 8. Important Notes for Claude Code

- **macOS only.** AppleScript and sips are macOS-specific. Windows/Linux is future.
- **Don't break existing Picovoice → Niavi flow.** "Computer" is purely additive.
- **Pause Porcupine when switcher is open** — both use the mic, they can't share it.
- **Web Speech API may not work in all Electron builds.** If it doesn't, fall back to keyboard/click only and log a message. Don't crash.
- **App icon extraction may fail** for some apps. Always provide a fallback (first letter of app name in a rounded square).
- **Filter out system apps** — Dock, SystemUIServer, Control Center, WindowServer, loginwindow, universalaccessd, Electron (itself).
- **The overlay should feel fast** — appear within 200ms of saying "Computer."
- **Keep the glassmorphism effect** (blur + translucent dark bg) for the macOS feel.
- **No settings or preferences.** Just list running apps, let user pick, switch. Keep it simple.
