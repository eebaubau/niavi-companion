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
