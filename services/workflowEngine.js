const EventEmitter = require('events');

const dcx = require('./dcxService');
const teensyFlashService = require('./teensyFlashService');

const IDLE_STATUS = {
  state: 'idle',
  isRunning: false,
  message: 'IDLE',
  currentLine: 0,
  totalLines: 0,
  command: null,
  error: null
};

class WorkflowEngine extends EventEmitter {
  constructor() {
    super();

    this.running = false;
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

  parseScript(script) {
    const lines = String(script || '')
      .split('\n')
      .map((line, index) => {
        const text = line.replace(/\s*\/\/.*$/, '').trim();
        return {
          lineNumber: index + 1,
          text,
          raw: line
        };
      })
      .filter(({ text }) => text);

    if (!lines.length) {
      throw new Error('Workflow script is empty');
    }

    return lines.map(({ lineNumber, text }) => this.parseInstruction(text, lineNumber));
  }

  parseInstruction(text, lineNumber) {
    const [cmd, ...args] = text.split(/\s+/);
    const command = String(cmd || '').toUpperCase();

    switch (command) {
      case 'START': {
        const amplitude = args.length ? this.parseAmplitude(args[0], lineNumber, 'START') : 80;
        if (args.length > 1) {
          throw new Error(`START accepts at most one argument on line ${lineNumber}`);
        }

        return { lineNumber, command, amplitude };
      }
      case 'STOP':
      case 'FLASH':
      case 'SEEK':
      case 'RESET':
        if (args.length) {
          throw new Error(`${command} does not accept arguments on line ${lineNumber}`);
        }

        return { lineNumber, command };
      case 'SET_AMP':
        if (args.length !== 1) {
          throw new Error(`SET_AMP requires exactly one amplitude argument on line ${lineNumber}`);
        }

        return {
          lineNumber,
          command,
          amplitude: this.parseAmplitude(args[0], lineNumber, 'SET_AMP')
        };
      case 'WAIT':
        if (args.length !== 1) {
          throw new Error(`WAIT requires exactly one duration argument on line ${lineNumber}`);
        }

        return {
          lineNumber,
          command,
          duration: this.parseDuration(args[0], lineNumber)
        };
      default:
        throw new Error(`Unknown workflow command "${cmd}" on line ${lineNumber}`);
    }
  }

  parseAmplitude(value, lineNumber, command) {
    const normalizedValue = typeof value === 'string' ? value.trim() : value;
    const amplitude = Number(normalizedValue);

    if (!Number.isInteger(amplitude) || amplitude < 0 || amplitude > 100) {
      throw new Error(`${command} amplitude must be between 0 and 100 on line ${lineNumber}`);
    }

    return amplitude;
  }

  parseDuration(value, lineNumber) {
    const normalizedValue = typeof value === 'string' ? value.trim() : value;
    const duration = Number(normalizedValue);

    if (!Number.isInteger(duration) || duration < 0) {
      throw new Error(`WAIT duration must be a non-negative integer on line ${lineNumber}`);
    }

    return duration;
  }

  async assertReady() {
    const status = await dcx.getStatus();
    if (status?.status !== 'online') {
      throw new Error('Connect to hardware or simulator before running a workflow');
    }
  }

  async executeInstruction(instruction) {
    switch (instruction.command) {
      case 'START':
        await dcx.control('start', instruction.amplitude);
        break;
      case 'STOP':
        await dcx.control('stop');
        break;
      case 'SET_AMP':
        await dcx.control('setAmp', { weldAmp: instruction.amplitude });
        break;
      case 'SEEK':
        await dcx.control('seek', undefined, { transport: 'serial' });
        break;
      case 'RESET':
        await dcx.control('reset', undefined, { transport: 'serial' });
        break;
      case 'WAIT':
        await this.waitWithCancel(instruction.duration);
        break;
      case 'FLASH': {
        const status = await dcx.getStatus();
        if (status?.simulation) {
          throw new Error('Teensy flashing is unavailable in simulation mode');
        }

        if (typeof dcx.hasActiveOperation === 'function' && dcx.hasActiveOperation()) {
          throw new Error('FLASH requires sonics, seek, and scan activity to be idle');
        }

        const result = await teensyFlashService.flash();
        if (!result?.success) {
          throw new Error(result?.error || result?.message || 'Teensy flash failed');
        }
        break;
      }
      default:
        throw new Error(`Unsupported workflow command "${instruction.command}"`);
    }
  }

  async run(script) {
    if (this.running) {
      return {
        success: false,
        error: 'A workflow is already running',
        status: this.getStatus()
      };
    }

    let instructions;

    try {
      instructions = this.parseScript(script);
      await this.assertReady();
    } catch (error) {
      this.resetStatus({
        message: 'ERROR',
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        message: 'Workflow validation failed'
      };
    }

    this.running = true;
    this.stopRequested = false;
    this.setStatus({
      state: 'starting',
      isRunning: true,
      message: 'PREPARING',
      currentLine: 0,
      totalLines: instructions.length,
      command: null,
      error: null
    });

    try {
      for (let index = 0; index < instructions.length; index += 1) {
        if (this.stopRequested) {
          await this.safeStop();
          this.resetStatus({ message: 'STOPPED' });
          return { success: false, stopped: true, message: 'Workflow stopped' };
        }

        const instruction = instructions[index];
        this.setStatus({
          state: 'running',
          isRunning: true,
          message: `LINE ${index + 1}/${instructions.length} · ${instruction.command}`,
          currentLine: index + 1,
          totalLines: instructions.length,
          command: instruction.command,
          error: null
        });

        await this.executeInstruction(instruction);
      }

      await this.safeStop();
      this.resetStatus({ message: 'COMPLETED' });

      return {
        success: true,
        message: 'Workflow finished',
        totalLines: instructions.length
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
        message: 'Workflow failed'
      };
    } finally {
      this.running = false;
      this.stopRequested = false;
      this.cancelWait();
    }
  }

  async stop() {
    if (!this.running) {
      return {
        success: false,
        message: 'No workflow is running'
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
      message: 'Workflow stop requested'
    };
  }

  async waitWithCancel(ms) {
    let remaining = ms;

    while (remaining > 0) {
      if (this.stopRequested) {
        return;
      }

      const slice = Math.min(remaining, 250);
      await this.waitSlice(slice);
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
      console.error('[WORKFLOW STOP ERROR]', error.message);
    }
  }
}

module.exports = new WorkflowEngine();
