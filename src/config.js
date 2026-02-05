const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
  // Picovoice
  PICOVOICE_ACCESS_KEY: process.env.PICOVOICE_ACCESS_KEY,
  WAKE_WORD: 'PICOVOICE',  // Built-in keyword — change to .ppn path for custom "Hey Niavi" later

  // Chrome Native Messaging
  NATIVE_HOST_NAME: 'com.niavi.companion',
  CHROME_EXTENSION_ID: 'nnebdbifipedjdcjcjkhoediaoopkkgo',

  // Audio
  SAMPLE_RATE: 16000,    // Porcupine requires 16kHz
  FRAME_LENGTH: 512,     // Will be overridden by porcupine.frameLength at runtime

  // App
  APP_NAME: 'Niavi Companion',
};
