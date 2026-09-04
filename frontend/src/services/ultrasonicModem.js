/**
 * Ultrasonic Modem (Web Audio API)
 * Clock-Synchronized Time-Slotted FSK Modem
 */

export const FREQ_CONFIG = {
  nearUltra: {
    name: 'Near-Ultrasound (15.5 - 16.8 kHz - High Hardware Compatibility)',
    preamble: 15200,
    base: 15500,
    step: 70,       // 16 symbols: 15,500 to 16,550 Hz
    terminator: 16800,
    minSearch: 14800,
    maxSearch: 17200
  },
  ultrasonic: {
    name: 'Full Ultrasound (17.5 - 19.0 kHz - Requires Good Speakers)',
    preamble: 17200,
    base: 17500,
    step: 70,
    terminator: 18800,
    minSearch: 16800,
    maxSearch: 19200
  },
  audible: {
    name: 'Audible Demo (1.4 - 2.8 kHz - Works on ALL Devices)',
    preamble: 1300,
    base: 1500,
    step: 70,       // 16 symbols: 1500 to 2550 Hz
    terminator: 2800,
    minSearch: 1100,
    maxSearch: 3000
  }
};

const HEX_SYMBOLS = '0123456789ABCDEF';

let sharedCtx = null;

export async function getSharedAudioContext() {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    sharedCtx = new AudioCtx();
  }
  if (sharedCtx.state === 'suspended') {
    await sharedCtx.resume();
  }
  return sharedCtx;
}

export class UltrasonicTransmitter {
  constructor(mode = 'audible') {
    this.mode = mode;
    this.config = FREQ_CONFIG[mode] || FREQ_CONFIG.audible;
    this.isTransmitting = false;
    this.loopTimer = null;
    this.volume = 0.95;
  }

  setMode(mode) {
    this.mode = mode;
    this.config = FREQ_CONFIG[mode] || FREQ_CONFIG.audible;
  }

  setVolume(vol) {
    this.volume = Math.max(0.1, Math.min(1.0, vol));
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async playTone(frequency, durationMs, customVol = null) {
    const ctx = await getSharedAudioContext();
    const vol = customVol !== null ? customVol : this.volume;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    const now = ctx.currentTime;
    const dur = durationMs / 1000;
    const ramp = Math.min(0.012, dur / 4);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + ramp);
    gain.gain.setValueAtTime(vol, now + dur - ramp);
    gain.gain.linearRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + dur + 0.02);

    await this.sleep(durationMs);
  }

  async playTestBeep(freq = 1000, durationMs = 350) {
    await this.playTone(freq, durationMs, 0.9);
  }

  // Time-Slotted Packet Structure:
  // [SYNC: 250ms] -> Gap 50ms -> 4x [Slot: 140ms + Gap 40ms] -> [Terminator: 150ms]
  async transmitToken(token, onProgress) {
    if (this.isTransmitting) return;
    this.isTransmitting = true;
    await getSharedAudioContext();

    const cleanToken = token.trim().toUpperCase();
    const chars = cleanToken.split('');
    const TONE_DUR = 140; // ms
    const GAP_DUR = 40;   // ms

    try {
      // 1. Sync Preamble (250ms)
      if (onProgress) onProgress({ step: 'sync', char: 'SYNC', freq: this.config.preamble, index: 0, total: chars.length });
      await this.playTone(this.config.preamble, 250);
      await this.sleep(50);

      // 2. Data Slots
      for (let i = 0; i < chars.length; i++) {
        if (!this.isTransmitting) break;
        const char = chars[i];
        const hexVal = HEX_SYMBOLS.indexOf(char);
        const freq = hexVal >= 0 ? this.config.base + (hexVal * this.config.step) : this.config.base;

        if (onProgress) onProgress({ step: 'data', char, freq, index: i + 1, total: chars.length });
        await this.playTone(freq, TONE_DUR);
        await this.sleep(GAP_DUR);
      }

      // 3. Terminator
      if (this.isTransmitting) {
        if (onProgress) onProgress({ step: 'end', char: 'END', freq: this.config.terminator, index: chars.length + 1, total: chars.length });
        await this.playTone(this.config.terminator, 150);
        await this.sleep(40);
      }
    } catch (e) {
      console.error('[Transmitter Error]', e);
    } finally {
      this.isTransmitting = false;
      if (onProgress) onProgress({ step: 'idle', char: '', freq: 0 });
    }
  }

  startContinuousBroadcast(token, intervalMs = 2800, onProgress) {
    this.stopContinuousBroadcast();
    const cycle = async () => {
      await this.transmitToken(token, onProgress);
      if (this.loopTimer !== null) {
        this.loopTimer = setTimeout(cycle, intervalMs);
      }
    };
    this.loopTimer = setTimeout(cycle, 100);
  }

  stopContinuousBroadcast() {
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    this.isTransmitting = false;
  }

  destroy() {
    this.stopContinuousBroadcast();
  }
}

export class UltrasonicReceiver {
  constructor(mode = 'audible') {
    this.mode = mode;
    this.config = FREQ_CONFIG[mode] || FREQ_CONFIG.audible;
    this.analyser = null;
    this.mediaStream = null;
    this.isListening = false;
    this.animFrameId = null;

    // Thresholds
    this.minEnergy = 35;
    this.minSnr = 10;

    // Receiver State: 'IDLE' | 'SAMPLING'
    this.state = 'IDLE';
    this.statusText = 'Listening for Sync...';
    this.syncCount = 0;
    this.samplingTimer = null;
    this.currentBuffer = [];
  }

  setMode(mode) {
    this.mode = mode;
    this.config = FREQ_CONFIG[mode] || FREQ_CONFIG.audible;
    this.resetDecoder();
  }

  setSensitivity(energyThreshold, snrThreshold) {
    this.minEnergy = energyThreshold;
    this.minSnr = snrThreshold;
  }

  resetDecoder() {
    this.state = 'IDLE';
    this.statusText = 'Listening for Sync...';
    this.syncCount = 0;
    this.currentBuffer = [];
    if (this.samplingTimer) {
      clearTimeout(this.samplingTimer);
      this.samplingTimer = null;
    }
  }

  async startListening(onPacketDecoded, onSpectrumUpdate) {
    if (this.isListening) return;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
    } catch {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    const ctx = await getSharedAudioContext();
    const source = ctx.createMediaStreamSource(this.mediaStream);
    this.analyser = ctx.createAnalyser();

    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.08;
    source.connect(this.analyser);

    this.isListening = true;
    this.resetDecoder();

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const processLoop = () => {
      if (!this.isListening) return;

      this.analyser.getByteFrequencyData(dataArray);
      const sampleRate = ctx.sampleRate;
      const binWidth = sampleRate / this.analyser.fftSize;

      // Overall mic level (0 - 100)
      let sumAll = 0;
      for (let i = 0; i < 48; i++) sumAll += dataArray[i];
      const micInputLevel = Math.min(100, Math.round((sumAll / 48 / 255) * 100 * 2.2));

      // Scan band
      const minBin = Math.floor(this.config.minSearch / binWidth);
      const maxBin = Math.min(Math.ceil(this.config.maxSearch / binWidth), bufferLength - 1);

      let peakEnergy = 0;
      let peakBin = -1;
      let energySum = 0;
      let count = 0;

      for (let b = minBin; b <= maxBin; b++) {
        const val = dataArray[b];
        energySum += val;
        count++;
        if (val > peakEnergy) {
          peakEnergy = val;
          peakBin = b;
        }
      }

      const noiseFloor = count > 0 ? (energySum - peakEnergy) / Math.max(1, count - 1) : 0;
      const peakFreq = peakBin >= 0 ? Math.round(peakBin * binWidth) : 0;
      const snr = Math.max(0, peakEnergy - noiseFloor);

      if (onSpectrumUpdate) {
        onSpectrumUpdate({
          dataArray,
          sampleRate,
          fftSize: this.analyser.fftSize,
          peakFreq,
          peakEnergy,
          noiseFloor,
          snr,
          micInputLevel,
          state: this.state,
          statusText: this.statusText,
          buffer: this.currentBuffer.join('')
        });
      }

      const isSignalPresent = peakEnergy >= this.minEnergy && snr >= this.minSnr;

      // Sync preamble detection in IDLE state
      if (this.state === 'IDLE' && isSignalPresent) {
        if (Math.abs(peakFreq - this.config.preamble) <= 35) {
          this.syncCount++;
          // Require 2 consecutive frames (~30ms) of SYNC
          if (this.syncCount >= 2) {
            this.startSlotSampling(ctx, binWidth, onPacketDecoded);
          }
        } else {
          this.syncCount = 0;
        }
      } else if (this.state === 'IDLE') {
        this.syncCount = 0;
      }

      this.animFrameId = requestAnimationFrame(processLoop);
    };

    processLoop();
  }

  // Clock-Synchronized Slot Sampler:
  // Once SYNC is detected, we sample each slot exactly at its center!
  startSlotSampling(ctx, binWidth, onPacketDecoded) {
    this.state = 'SAMPLING';
    this.statusText = 'Sync locked! Sampling slots...';
    this.currentBuffer = [];
    this.syncCount = 0;

    // Packet timing:
    // SYNC ends at ~+180ms from detection point
    // Gap: 50ms
    // Slot 0 center: ~230ms + 70ms = 300ms
    // Slot 1 center: 300ms + 180ms = 480ms
    // Slot 2 center: 480ms + 180ms = 660ms
    // Slot 3 center: 660ms + 180ms = 840ms
    const slotCenters = [300, 480, 660, 840];
    const decodedChars = [];

    const bufferLength = this.analyser.frequencyBinCount;
    const tempArray = new Uint8Array(bufferLength);

    const sampleSlot = (slotIdx) => {
      this.statusText = `Reading Symbol ${slotIdx + 1}/4...`;
      this.analyser.getByteFrequencyData(tempArray);

      // Search for highest peak in hex symbol band
      let bestChar = '?';
      let bestEnergy = 0;

      for (let i = 0; i < 16; i++) {
        const targetFreq = this.config.base + (i * this.config.step);
        const centerBin = Math.round(targetFreq / binWidth);

        // Check center bin and +/- 1 bin
        for (let b = centerBin - 1; b <= centerBin + 1; b++) {
          if (b >= 0 && b < bufferLength) {
            if (tempArray[b] > bestEnergy) {
              bestEnergy = tempArray[b];
              bestChar = HEX_SYMBOLS[i];
            }
          }
        }
      }

      decodedChars.push(bestChar);
      this.currentBuffer = [...decodedChars];

      if (slotIdx < 3) {
        const nextDelay = slotCenters[slotIdx + 1] - slotCenters[slotIdx];
        this.samplingTimer = setTimeout(() => sampleSlot(slotIdx + 1), nextDelay);
      } else {
        // All 4 slots sampled!
        const finalToken = decodedChars.join('');
        this.statusText = `Decoded: ${finalToken}`;

        if (!finalToken.includes('?')) {
          if (onPacketDecoded) {
            onPacketDecoded({
              token: finalToken,
              timestamp: new Date(),
              confidence: 99.9,
              mode: this.mode
            });
          }
        }

        // Return to IDLE after a short pause
        this.samplingTimer = setTimeout(() => {
          this.resetDecoder();
        }, 800);
      }
    };

    // Trigger Slot 0 sampling
    this.samplingTimer = setTimeout(() => sampleSlot(0), slotCenters[0]);
  }

  stopListening() {
    this.isListening = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.samplingTimer) {
      clearTimeout(this.samplingTimer);
      this.samplingTimer = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    this.resetDecoder();
  }
}
