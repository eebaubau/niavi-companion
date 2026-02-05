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
      // Initialize Porcupine with built-in keyword
      this.porcupine = new Porcupine(
        this.config.PICOVOICE_ACCESS_KEY,
        [getBuiltinKeywordPath(this.config.WAKE_WORD)],  // keyword path(s)
        [0.5]  // sensitivity — 0.5 is default, range [0, 1]
      );

      const frameLength = this.porcupine.frameLength;
      const sampleRate = this.porcupine.sampleRate;

      console.log(`[Niavi] Porcupine initialized — frameLength: ${frameLength}, sampleRate: ${sampleRate}`);

      // Start mic recording
      // IMPORTANT: The exact mic recording approach may vary.
      // Option A: node-record-lpcm16 (requires SoX)
      // Option B: mic npm package
      // Option C: Hidden BrowserWindow with Web Audio API
      //
      // Use whichever works. The critical contract is:
      // - 16-bit signed PCM
      // - 16000 Hz sample rate
      // - Mono
      // - Deliver audio in chunks, buffer into frames of `frameLength` samples

      const record = require('node-record-lpcm16');

      this.recorder = record.record({
        sampleRate: sampleRate,
        channels: 1,
        audioType: 'raw',     // raw PCM
        encoding: 'signed-integer',
        bitDepth: 16,
        recorder: process.platform === 'darwin' ? 'sox' : 'sox',
      });

      let audioBuffer = Buffer.alloc(0);
      const bytesPerFrame = frameLength * 2; // 16-bit = 2 bytes per sample

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
            this.callbacks.onDetected();
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
