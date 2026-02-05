# Niavi Companion

A lightweight Electron menu bar app that listens for the wake word "Picovoice" using Picovoice Porcupine (on-device, no cloud) and sends a signal to the Niavi Chrome extension via WebSocket.

## Prerequisites

- Node.js 18+
- SoX (for audio recording)
  - macOS: `brew install sox`
  - Windows: Download SoX from https://sourceforge.net/projects/sox/ and add to PATH

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file with your Picovoice access key:
   ```
   PICOVOICE_ACCESS_KEY=your_access_key_here
   ```

## Run

```bash
npm start
```

The app will appear in your menu bar (macOS) or system tray (Windows). It will start listening for the wake word immediately.

## Chrome Extension Integration

See `extension-patch/EXTENSION-PATCH.md` for instructions on how to connect the Niavi Chrome extension to this companion app.

## Wake Word

Currently uses "Picovoice" (built-in keyword). Will be changed to "Hey Niavi" (custom keyword) in a future update.

## Tray Menu

- **Listening for wake word**: Toggle wake word detection on/off
- **Quit Niavi Companion**: Exit the app
