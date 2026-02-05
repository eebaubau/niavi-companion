const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
  // Picovoice
  PICOVOICE_ACCESS_KEY: process.env.PICOVOICE_ACCESS_KEY,
  WAKE_WORDS: ['PICOVOICE', 'COMPUTER'],
  WAKE_WORD_ACTIONS: {
    0: 'niavi',        // Index 0 = Picovoice → open Niavi (existing behavior)
    1: 'app_switcher'  // Index 1 = Computer → open app switcher (new)
  },

  // Chrome Native Messaging
  NATIVE_HOST_NAME: 'com.niavi.companion',
  CHROME_EXTENSION_ID: 'nnebdbifipedjdcjcjkhoediaoopkkgo',

  // Audio
  SAMPLE_RATE: 16000,    // Porcupine requires 16kHz
  FRAME_LENGTH: 512,     // Will be overridden by porcupine.frameLength at runtime

  // App
  APP_NAME: 'Niavi Companion',
};
