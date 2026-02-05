const { app, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { createTray } = require('./tray');
const { WakeWordEngine } = require('./wake-word');
const { NativeMessagingHost } = require('./native-messaging');
const { openAppSwitcher, setupSwitcherIPC } = require('./app-switcher');
const config = require('./config');

// Prevent dock icon on macOS
if (process.platform === 'darwin') {
  app.dock.hide();
}

let tray = null;
let wakeWordEngine = null;
let nativeMessaging = null;

app.whenReady().then(() => {
  // Setup IPC handlers for app switcher
  setupSwitcherIPC();

  // Initialize native messaging
  nativeMessaging = new NativeMessagingHost(config);

  // Initialize wake word engine
  wakeWordEngine = new WakeWordEngine(config, {
    onDetected: (keywordIndex, action) => {
      console.log(`[Niavi] Wake word: ${config.WAKE_WORDS[keywordIndex]} → ${action}`);

      if (action === 'niavi') {
        // Existing behavior — send wake signal to Chrome extension
        tray.setImage(getIcon('active'));
        nativeMessaging.sendWakeSignal();

        setTimeout(() => {
          tray.setImage(getIcon('default'));
        }, 1500);

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
