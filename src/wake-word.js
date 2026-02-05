const { Porcupine, getBuiltinKeywordPath } = require('@picovoice/porcupine-node');

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
      // Initialize Porcupine with multiple keywords
      const keywordPaths = this.config.WAKE_WORDS.map(kw => getBuiltinKeywordPath(kw));
      const sensitivities = this.config.WAKE_WORDS.map(() => 0.5);

      this.porcupine = new Porcupine(
        this.config.PICOVOICE_ACCESS_KEY,
        keywordPaths,
        sensitivities
      );

      const frameLength = this.porcupine.frameLength;
      const sampleRate = this.porcupine.sampleRate;

      console.log(`[Niavi] Porcupine initialized — frameLength: ${frameLength}, sampleRate: ${sampleRate}`);
      console.log(`[Niavi] Listening for: ${this.config.WAKE_WORDS.join(', ')}`);

      const record = require('node-record-lpcm16');

      this.recorder = record.record({
        sampleRate: sampleRate,
        channels: 1,
        audioType: 'raw',
        encoding: 'signed-integer',
        bitDepth: 16,
        recorder: process.platform === 'darwin' ? 'sox' : 'sox',
      });

      let audioBuffer = Buffer.alloc(0);
      const bytesPerFrame = frameLength * 2;

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
            const action = this.config.WAKE_WORD_ACTIONS[keywordIndex];
            this.callbacks.onDetected(keywordIndex, action);
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
