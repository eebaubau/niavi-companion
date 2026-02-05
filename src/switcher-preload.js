const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onAppsData: (callback) => ipcRenderer.on('apps-data', (event, data) => callback(data)),
  selectApp: (appName) => ipcRenderer.send('select-app', appName),
  selectAppByNumber: (num) => ipcRenderer.send('select-app-number', num),
  closeSwitcher: () => ipcRenderer.send('close-switcher'),
});
