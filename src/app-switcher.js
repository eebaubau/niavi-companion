const { BrowserWindow, ipcMain, screen, app, systemPreferences } = require('electron');
const { exec } = require('child_process');
const path = require('path');

let switcherWindow = null;
let onCloseCallback = null;
let autoCloseTimer = null;
let appsList = [];

// Apps to filter out
const SYSTEM_APPS = [
  'Finder', 'Dock', 'SystemUIServer', 'Control Center',
  'Notification Center', 'WindowServer', 'loginwindow',
  'universalaccessd', 'Electron', 'niavi-companion'
];

function checkAccessibilityPermission() {
  if (process.platform === 'darwin') {
    const trusted = systemPreferences.isTrustedAccessibilityClient(false);
    if (!trusted) {
      systemPreferences.isTrustedAccessibilityClient(true);
      console.log('[Niavi] Accessibility permission required for app switching.');
    }
    return trusted;
  }
  return true;
}

async function getRunningApps() {
  return new Promise((resolve, reject) => {
    const script = `
      tell application "System Events"
        set appList to {}
        repeat with proc in (every process whose background only is false)
          set appName to name of proc
          try
            set appPath to POSIX path of (file of proc as alias)
          on error
            set appPath to ""
          end try
          set end of appList to appName & "|" & appPath
        end repeat
        return appList
      end tell
    `;

    exec(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }

      const apps = stdout.trim().split(', ')
        .map(item => {
          const [name, appPath] = item.split('|');
          return { name: name.trim(), path: appPath ? appPath.trim() : '' };
        })
        .filter(app => app.name && !SYSTEM_APPS.includes(app.name));

      resolve(apps);
    });
  });
}

async function getAppIcon(appPath, appName) {
  if (!appPath) {
    return null;
  }

  try {
    const icon = await app.getFileIcon(appPath, { size: 'large' });
    return icon.toDataURL();
  } catch (err) {
    console.log(`[Niavi] Could not get icon for ${appName}:`, err.message);
    return null;
  }
}

async function getAppsWithIcons() {
  const apps = await getRunningApps();

  const appsWithIcons = await Promise.all(
    apps.map(async (app, index) => {
      const icon = await getAppIcon(app.path, app.name);
      return {
        ...app,
        icon,
        number: index + 1
      };
    })
  );

  return appsWithIcons;
}

function switchToApp(appName) {
  const escapedName = appName.replace(/"/g, '\\"');
  const script = `tell application "${escapedName}" to activate`;

  exec(`osascript -e '${script}'`, (err) => {
    if (err) {
      console.error(`[Niavi] Failed to switch to ${appName}:`, err);
    } else {
      console.log(`[Niavi] Switched to ${appName}`);
    }
  });
}

function closeSwitcher() {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }

  if (switcherWindow) {
    switcherWindow.close();
    switcherWindow = null;
  }

  if (onCloseCallback) {
    onCloseCallback();
    onCloseCallback = null;
  }
}

function resetAutoCloseTimer() {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
  }
  autoCloseTimer = setTimeout(() => {
    console.log('[Niavi] App switcher timed out');
    closeSwitcher();
  }, 10000);
}

async function openAppSwitcher(onClose) {
  if (switcherWindow) {
    switcherWindow.focus();
    return;
  }

  checkAccessibilityPermission();
  onCloseCallback = onClose;

  try {
    appsList = await getAppsWithIcons();
  } catch (err) {
    console.error('[Niavi] Failed to get running apps:', err);
    if (onClose) onClose();
    return;
  }

  if (appsList.length === 0) {
    console.log('[Niavi] No apps to show');
    if (onClose) onClose();
    return;
  }

  const display = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;

  const appItemWidth = 80;
  const padding = 24;
  const windowWidth = Math.min(
    appsList.length * appItemWidth + padding * 2,
    screenWidth - 100
  );
  const windowHeight = 140;

  const x = Math.round((screenWidth - windowWidth) / 2);
  const y = Math.round((screenHeight - windowHeight) / 2);

  switcherWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
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

  switcherWindow.loadFile(path.join(__dirname, '..', 'views', 'switcher.html'));

  switcherWindow.webContents.on('did-finish-load', () => {
    switcherWindow.webContents.send('apps-data', appsList);
  });

  switcherWindow.on('closed', () => {
    switcherWindow = null;
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
    if (onCloseCallback) {
      onCloseCallback();
      onCloseCallback = null;
    }
  });

  switcherWindow.on('blur', () => {
    closeSwitcher();
  });

  resetAutoCloseTimer();
}

function setupSwitcherIPC() {
  ipcMain.on('select-app', (event, appName) => {
    resetAutoCloseTimer();
    switchToApp(appName);
    closeSwitcher();
  });

  ipcMain.on('select-app-number', (event, num) => {
    resetAutoCloseTimer();
    const app = appsList[num - 1];
    if (app) {
      switchToApp(app.name);
      closeSwitcher();
    }
  });

  ipcMain.on('close-switcher', () => {
    closeSwitcher();
  });
}

module.exports = {
  openAppSwitcher,
  closeSwitcher,
  setupSwitcherIPC
};
