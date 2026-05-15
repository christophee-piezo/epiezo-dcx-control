const EventEmitter = require('events');

const dcx = require('./dcxService');

const IDLE_STATUS = {
  state: 'idle',
  isRunning: false,
  message: 'IDLE',
  currentLoop: 0,
  totalLoops: 0,
  currentBlock: 0,
  totalBlocks: 0,
  blockType: null,
  error: null
};

class SequenceEngine extends EventEmitter {
  constructor() {
    super();

    this.isRunning = false;
    this.stopRequested = false;
    this.waitCancel = null;
    this.status = { ...IDLE_STATUS };
  }

  getStatus() {
    return {
      ...this.status
    };
  }

  setStatus(patch = {}) {
    this.status = {
      ...this.status,
      ...patch,
      updatedAt: Date.now()
    };

    this.emit('status', this.getStatus());
  }

  resetStatus(patch = {}) {
    this.status = {
      ...IDLE_STATUS,
      ...patch,
      updatedAt: Date.now()
    };

    this.emit('status', this.getStatus());
  }

  normalizeRequest(request) {
    const payload = Array.isArray(request)
      ? { timeline: request, options: {} }
      : {
          timeline: request?.timeline,
          options: request?.options || {}
        };

    if (!Array.isArray(payload.timeline) || payload.timeline.length === 0) {
      throw new Error('Sequence timeline is empty');
    }

    const timeline = payload.timeline.map((block, index) => this.normalizeBlock(block, index));
    const options = {
      loopCount: this.parseNonNegativeInt(payload.options.loopCount, 1, 'Loop count'),
      autoAbort: payload.options.autoAbort === 'NEVER' ? 'NEVER' : 'ALARM'
    };

    if (options.loopCount < 1) {
      throw new Error('Loop count must be at least 1');
    }

    return { timeline, options };
  }

  normalizeBlock(block, index) {
    const type = String(block?.type || '').toUpperCase();

    if (!['PULSE', 'PAUSE'].includes(type)) {
      throw new Error(`Unsupported block type at position ${index + 1}`);
    }

    const duration = this.parseNonNegativeInt(block?.duration, 0, `Duration for block ${index + 1}`);

    if (type === 'PAUSE') {
      return { type, duration };
    }

    const amplitude = this.parseNonNegativeInt(block?.amplitude, 80, `Amplitude for block ${index + 1}`);
    const ramp = this.parseNonNegativeInt(block?.ramp, 50, `Ramp for block ${index + 1}`);

    if (amplitude > 100) {
      throw new Error(`Amplitude for block ${index + 1} must be between 0 and 100`);
    }

    return { type, duration, amplitude, ramp };
  }

  parseNonNegativeInt(value, fallback, label) {
    if (value == null || value === '') {
      return fallback;
    }

    const normalizedValue = typeof value === 'string' ? value.trim() : value;
    const parsed = Number(normalizedValue);

    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`${label} must be a non-negative integer`);
    }

    return parsed;
  }

  async runSequence(request) {
    if (this.isRunning) {
      return {
        success: false,
        error: 'A sequence is already running',
        status: this.getStatus()
      };
    }

    let timeline;
    let options;

    try {
      ({ timeline, options } = this.normalizeRequest(request));
    } catch (error) {
      this.resetStatus({
        message: 'ERROR',
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        message: 'Sequence validation failed'
      };
    }

    this.isRunning = true;
    this.stopRequested = false;
    this.setStatus({
      state: 'starting',
      isRunning: true,
      message: 'PREPARING',
      currentLoop: 0,
      totalLoops: options.loopCount,
      currentBlock: 0,
      totalBlocks: timeline.length,
      blockType: null,
      error: null
    });

    try {
      await this.applySequenceOptions(options);

      for (let loopIndex = 0; loopIndex < options.loopCount; loopIndex += 1) {
        for (let blockIndex = 0; blockIndex < timeline.length; blockIndex += 1) {
          if (this.stopRequested) {
            await this.safeStop();
            this.resetStatus({ message: 'STOPPED' });
            return { success: false, stopped: true, message: 'Sequence stopped' };
          }

          const block = timeline[blockIndex];
          const blockLabel = block.type === 'PAUSE' ? 'STOP' : block.type;

          this.setStatus({
            state: 'running',
            isRunning: true,
            currentLoop: loopIndex + 1,
            totalLoops: options.loopCount,
            currentBlock: blockIndex + 1,
            totalBlocks: timeline.length,
            blockType: block.type,
            message: `LOOP ${loopIndex + 1}/${options.loopCount} · BLOCK ${blockIndex + 1}/${timeline.length} · ${blockLabel}`,
            error: null
          });

          await this.assertAlarmState(options);

          if (block.type === 'PULSE') {
            await this.applyPulseRamp(block.ramp);
            await dcx.control('start', block.amplitude);
            await this.waitWithChecks(block.duration, options);
            await this.safeStop();
          } else {
            await this.waitWithChecks(block.duration, options);
          }
        }
      }

      await this.safeStop();
      this.resetStatus({ message: 'COMPLETED' });

      return {
        success: true,
        message: 'Sequence finished'
      };
    } catch (error) {
      await this.safeStop();
      this.resetStatus({
        message: 'ERROR',
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        message: 'Sequence failed'
      };
    } finally {
      this.isRunning = false;
      this.stopRequested = false;
      this.cancelWait();
    }
  }

  async stop() {
    if (!this.isRunning) {
      return {
        success: false,
        message: 'No sequence is running'
      };
    }

    this.stopRequested = true;
    this.setStatus({
      state: 'stopping',
      isRunning: true,
      message: 'STOPPING'
    });

    this.cancelWait();
    await this.safeStop();

    return {
      success: true,
      message: 'Sequence stop requested'
    };
  }

  async applySequenceOptions() {
  }

  async applyPulseRamp(ramp) {
    await dcx.setParameters({
      startRamp: ramp,
      seekRamp: ramp
    });
  }

  async assertAlarmState(options) {
    if (options.autoAbort !== 'ALARM') {
      return;
    }

    const telemetry = typeof dcx.getTelemetrySnapshot === 'function'
      ? dcx.getTelemetrySnapshot()
      : {};

    if (telemetry?.alarm) {
      throw new Error('Sequence aborted due to active alarm');
    }
  }

  async waitWithChecks(ms, options) {
    let remaining = ms;

    while (remaining > 0) {
      if (this.stopRequested) {
        return;
      }

      const slice = Math.min(remaining, 250);
      await this.waitSlice(slice);
      await this.assertAlarmState(options);
      remaining -= slice;
    }
  }

  waitSlice(ms) {
    if (ms <= 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let settled = false;
      let timer = null;

      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;

        if (this.waitCancel === finish) {
          this.waitCancel = null;
        }

        if (timer) {
          clearTimeout(timer);
        }

        resolve();
      };

      this.waitCancel = finish;
      timer = setTimeout(finish, ms);
    });
  }

  cancelWait() {
    if (this.waitCancel) {
      const cancel = this.waitCancel;
      this.waitCancel = null;
      cancel();
    }
  }

  async safeStop() {
    try {
      await dcx.control('stop');
    } catch (error) {
      console.error('[SEQUENCE STOP ERROR]', error.message);
    }
  }
}

module.exports = new SequenceEngine();
