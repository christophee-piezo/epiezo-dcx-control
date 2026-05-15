const { execFile } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { SerialPort } = require('serialport');
const { promisify } = require('util');

const DEFAULT_ARDUINO_CLI_COMMAND = 'C:\\Program Files\\Arduino IDE\\resources\\app\\lib\\backend\\resources\\arduino-cli.exe';
const DEFAULT_CLI_COMMAND = 'teensy_loader_cli.exe';
const DEFAULT_FACTORY_SKETCH_DIR = path.join(__dirname, '..', 'firmware', 'factory', 'epiezo_teensy_factory');
const DEFAULT_MCU = 'TEENSY41';
const DEFAULT_FQBN = 'teensy:avr:teensy41';
const FACTORY_OPERATION_TIMEOUT_MS = 300000;
const FLASH_TIMEOUT_MS = 120000;
const FLASH_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const CONFIG_KEYS = {
  cliPath: 'teensy-flash.cliPath',
  firmwarePath: 'teensy-flash.firmwarePath'
};
const IDLE_STATUS = {
  state: 'idle',
  isRunning: false,
  message: 'IDLE',
  error: null,
  stdout: '',
  stderr: '',
  updatedAt: Date.now(),
  lastCompletedAt: null
};

const execFileAsync = promisify(execFile);

function normalizePathValue(value) {
  if (value == null) {
    return '';
  }

  const normalized = String(value).trim();
  return normalized;
}

function hasPathSeparator(value) {
  return value.includes('\\') || value.includes('/');
}

function trimProcessOutput(value) {
  return String(value || '').trim();
}

function joinOutputs(...values) {
  return values
    .map((value) => trimProcessOutput(value))
    .filter(Boolean)
    .join('\n\n');
}

class TeensyFlashService extends EventEmitter {
  constructor() {
    super();

    this.store = null;
    this.config = {
      cliPath: '',
      firmwarePath: ''
    };
    this.status = { ...IDLE_STATUS };
  }

  setStore(store) {
    this.store = store || null;

    if (this.store) {
      this.config = {
        cliPath: normalizePathValue(this.store.get(CONFIG_KEYS.cliPath)),
        firmwarePath: normalizePathValue(this.store.get(CONFIG_KEYS.firmwarePath))
      };
    }

    this.emitStatus();
  }

  getStatus() {
    return {
      ...this.status,
      cliPath: this.config.cliPath,
      cliFileName: this.config.cliPath ? path.basename(this.config.cliPath) : '',
      firmwarePath: this.config.firmwarePath,
      firmwareFileName: this.config.firmwarePath ? path.basename(this.config.firmwarePath) : '',
      mcu: DEFAULT_MCU
    };
  }

  setStatus(patch = {}) {
    this.status = {
      ...this.status,
      ...patch,
      updatedAt: Date.now()
    };

    this.emitStatus();
  }

  emitStatus() {
    this.emit('status', this.getStatus());
  }

  persistConfig() {
    if (!this.store) {
      return;
    }

    this.store.set(CONFIG_KEYS.cliPath, this.config.cliPath);
    this.store.set(CONFIG_KEYS.firmwarePath, this.config.firmwarePath);
  }

  setCliPath(cliPath) {
    this.config.cliPath = normalizePathValue(cliPath);
    this.persistConfig();
    this.emitStatus();
    return this.getStatus();
  }

  setFirmwarePath(firmwarePath) {
    this.config.firmwarePath = normalizePathValue(firmwarePath);
    this.persistConfig();
    this.emitStatus();
    return this.getStatus();
  }

  resolveCliPath(cliPath) {
    const configuredPath = normalizePathValue(cliPath) || this.config.cliPath;
    return configuredPath || DEFAULT_CLI_COMMAND;
  }

  resolveFirmwarePath(firmwarePath) {
    return normalizePathValue(firmwarePath) || this.config.firmwarePath;
  }

  resolveArduinoCliPath(arduinoCliPath) {
    const configuredPath = normalizePathValue(arduinoCliPath);
    return configuredPath || DEFAULT_ARDUINO_CLI_COMMAND;
  }

  resolveFactorySketchPath(sketchPath) {
    return normalizePathValue(sketchPath) || DEFAULT_FACTORY_SKETCH_DIR;
  }

  resolveFactoryBuildDir(buildDir) {
    return normalizePathValue(buildDir) || path.join(os.tmpdir(), 'epiezo-teensy-factory-build');
  }

  async ensureReadableFile(filePath, label) {
    if (!filePath) {
      throw new Error(`${label} is required`);
    }

    try {
      await fs.access(filePath);
    } catch (error) {
      throw new Error(`${label} was not found: ${filePath}`);
    }
  }

  formatExecutionError(error) {
    if (error?.code === 'ENOENT') {
      return 'Teensy Loader CLI was not found. Select teensy_loader_cli.exe in Settings or add it to PATH.';
    }

    if (error?.killed || error?.signal === 'SIGTERM') {
      return 'Teensy flashing timed out while waiting for the board to enter programming mode.';
    }

    return error?.message || 'Teensy flashing failed';
  }

  formatFactoryError(error) {
    if (error?.code === 'ENOENT') {
      return 'Arduino CLI was not found. Install Arduino IDE 2 with Teensy support before restoring factory firmware.';
    }

    if (error?.killed || error?.signal === 'SIGTERM') {
      return 'Factory Teensy firmware build or upload timed out.';
    }

    return error?.message || 'Factory Teensy firmware restore failed';
  }

  async runExecFile(command, args, { timeoutMs = FLASH_TIMEOUT_MS } = {}) {
    return execFileAsync(command, args, {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: FLASH_MAX_BUFFER_BYTES
    });
  }

  async resolveFactorySketchFile(sketchPath) {
    await this.ensureReadableFile(sketchPath, 'Factory firmware sketch folder');
    const sketchName = path.basename(sketchPath);
    const sketchFile = path.join(sketchPath, `${sketchName}.ino`);
    await this.ensureReadableFile(sketchFile, 'Factory firmware sketch');
    return sketchFile;
  }

  isTeensyPort(port = {}) {
    const manufacturer = String(port.manufacturer || '').toLowerCase();
    const pnpId = String(port.pnpId || '').toLowerCase();
    const vendorId = String(port.vendorId || '').toLowerCase();
    const productId = String(port.productId || '').toLowerCase();

    return manufacturer.includes('teensy')
      || pnpId.includes('vid_16c0&pid_0483')
      || (vendorId === '16c0' && productId === '0483');
  }

  async resolveUploadPort(preferredPort = '') {
    const requestedPort = normalizePathValue(preferredPort);
    if (requestedPort) {
      return requestedPort;
    }

    const ports = await SerialPort.list();
    const detectedPort = ports.find((port) => this.isTeensyPort(port)) || ports[0];
    if (!detectedPort?.path) {
      throw new Error('No Teensy serial port detected');
    }

    return detectedPort.path;
  }

  async restoreFactoryFirmware(options = {}) {
    if (this.status.isRunning) {
      return {
        success: false,
        error: 'A Teensy operation is already running',
        message: 'Teensy operation already in progress',
        status: this.getStatus()
      };
    }

    const arduinoCliPath = this.resolveArduinoCliPath(options.arduinoCliPath);
    const sketchPath = this.resolveFactorySketchPath(options.sketchPath);
    const buildDir = this.resolveFactoryBuildDir(options.buildDir);
    let uploadPort = '';
    let compileStdout = '';
    let compileStderr = '';

    try {
      await this.resolveFactorySketchFile(sketchPath);
      if (hasPathSeparator(arduinoCliPath)) {
        await this.ensureReadableFile(arduinoCliPath, 'Arduino CLI');
      }

      try {
        uploadPort = await this.resolveUploadPort(options.port);
      } catch (error) {
        if (options.skipIfNoPort) {
          this.setStatus({
            state: 'idle',
            isRunning: false,
            message: 'NO TEENSY DETECTED',
            error: null,
            stdout: '',
            stderr: ''
          });

          return {
            success: true,
            skipped: true,
            message: 'Skipped factory Teensy firmware restore because no Teensy port was detected'
          };
        }

        throw error;
      }

      await fs.mkdir(buildDir, { recursive: true });
    } catch (error) {
      this.setStatus({
        state: 'error',
        isRunning: false,
        message: 'FACTORY RESTORE FAILED',
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        message: 'Factory Teensy firmware restore failed'
      };
    }

    this.setStatus({
      state: 'compiling',
      isRunning: true,
      message: 'COMPILING FACTORY FIRMWARE',
      error: null,
      stdout: '',
      stderr: ''
    });

    try {
      const compileResult = await this.runExecFile(arduinoCliPath, [
        'compile',
        '--clean',
        '--fqbn',
        DEFAULT_FQBN,
        '--board-options',
        'usb=serial',
        '--output-dir',
        buildDir,
        sketchPath
      ], {
        timeoutMs: FACTORY_OPERATION_TIMEOUT_MS
      });

      compileStdout = trimProcessOutput(compileResult.stdout);
      compileStderr = trimProcessOutput(compileResult.stderr);

      this.setStatus({
        state: 'uploading',
        isRunning: true,
        message: `UPLOADING FACTORY FIRMWARE ${uploadPort}`,
        stdout: compileStdout,
        stderr: compileStderr,
        error: null
      });

      const uploadResult = await this.runExecFile(arduinoCliPath, [
        'upload',
        '--fqbn',
        DEFAULT_FQBN,
        '--input-dir',
        buildDir,
        '--port',
        uploadPort,
        sketchPath
      ], {
        timeoutMs: FACTORY_OPERATION_TIMEOUT_MS
      });

      const stdout = joinOutputs(compileStdout, uploadResult.stdout);
      const stderr = joinOutputs(compileStderr, uploadResult.stderr);
      const result = {
        success: true,
        message: 'Factory Teensy firmware restored',
        sketchPath,
        buildDir,
        port: uploadPort,
        fqbn: DEFAULT_FQBN,
        stdout,
        stderr
      };

      this.setStatus({
        state: 'completed',
        isRunning: false,
        message: 'FACTORY FIRMWARE RESTORED',
        error: null,
        stdout,
        stderr,
        lastCompletedAt: Date.now()
      });

      return result;
    } catch (error) {
      const restoreError = this.formatFactoryError(error);
      const stdout = joinOutputs(compileStdout, error?.stdout);
      const stderr = joinOutputs(compileStderr, error?.stderr);

      this.setStatus({
        state: 'error',
        isRunning: false,
        message: 'FACTORY RESTORE FAILED',
        error: restoreError,
        stdout,
        stderr,
        lastCompletedAt: Date.now()
      });

      return {
        success: false,
        error: restoreError,
        message: 'Factory Teensy firmware restore failed',
        sketchPath,
        buildDir,
        port: uploadPort,
        fqbn: DEFAULT_FQBN,
        stdout,
        stderr
      };
    }
  }

  async flash(options = {}) {
    if (this.status.isRunning) {
      return {
        success: false,
        error: 'A Teensy flash is already running',
        message: 'Teensy flash already in progress',
        status: this.getStatus()
      };
    }

    const firmwarePath = this.resolveFirmwarePath(options.firmwarePath);
    const cliPath = this.resolveCliPath(options.cliPath);

    try {
      await this.ensureReadableFile(firmwarePath, 'Selected firmware file');

      if (hasPathSeparator(cliPath)) {
        await this.ensureReadableFile(cliPath, 'Selected Teensy Loader CLI');
      }
    } catch (error) {
      this.setStatus({
        state: 'error',
        isRunning: false,
        message: 'FLASH FAILED',
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        message: 'Teensy flash failed'
      };
    }

    this.setStatus({
      state: 'flashing',
      isRunning: true,
      message: `FLASHING ${path.basename(firmwarePath)}`,
      error: null,
      stdout: '',
      stderr: ''
    });

    try {
      const { stdout, stderr } = await this.runExecFile(cliPath, [
        `--mcu=${DEFAULT_MCU}`,
        '-w',
        firmwarePath
      ]);

      const result = {
        success: true,
        message: 'Teensy flash completed',
        firmwarePath,
        cliPath,
        mcu: DEFAULT_MCU,
        stdout: trimProcessOutput(stdout),
        stderr: trimProcessOutput(stderr)
      };

      this.setStatus({
        state: 'completed',
        isRunning: false,
        message: 'FLASH COMPLETED',
        error: null,
        stdout: result.stdout,
        stderr: result.stderr,
        lastCompletedAt: Date.now()
      });

      return result;
    } catch (error) {
      const flashError = this.formatExecutionError(error);
      const stdout = trimProcessOutput(error?.stdout);
      const stderr = trimProcessOutput(error?.stderr);

      this.setStatus({
        state: 'error',
        isRunning: false,
        message: 'FLASH FAILED',
        error: flashError,
        stdout,
        stderr,
        lastCompletedAt: Date.now()
      });

      return {
        success: false,
        error: flashError,
        message: 'Teensy flash failed',
        firmwarePath,
        cliPath,
        mcu: DEFAULT_MCU,
        stdout,
        stderr
      };
    }
  }
}

module.exports = new TeensyFlashService();
