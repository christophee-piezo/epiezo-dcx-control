const EventEmitter = require('events');

const DcxEthernetService = require('./dcxEthernetService');
const DcxSerialService = require('./dcxSerialService');
const { parseHornScanTabStatus, buildHornScanDatasetsFromSamples, buildSimulatedHornScanSamples, runHardwareHornScan } = require('./dcxHornScan');
const { buildSimulatedWeldGraphSamples, buildWeldGraphDatasetsFromSamples, runHardwareWeldGraph } = require('./dcxWeldGraph');
const {
  extractTelemetryFromRaw,
  extractSystemInfoFromRaw,
  parseSetupPayload,
  parseIoPayload,
  mergeIoSnapshots,
  getIoDigitalState
} = require('./dcxResponseParsers');

const DCX_MIN_AMPLITUDE = 0;
const DCX_MAX_AMPLITUDE = 100;
const INVALID_SERIAL_PORT_VALUES = new Set([
  'detecting...',
  'detection...',
  'no serial ports found',
  'aucun port serie detecte'
]);
const ACTIVE_CONTROL_ACTIONS = new Set(['start', 'seek']);
const DEFAULT_SETUP_SETTINGS = {
  weldAmp: '100',
  startRamp: '80',
  FreqOff: '0',
  endofweldstore: '1',
  externalamplitude: '0',
  externalfrequency: '0',
  seekRamp: '80',
  seekTime: '500',
  SeekFreqOff: '0',
  powerup: '1',
  ClrMemAtPwrUp: '1',
  timedSeek: '0',
  stoponalarm: '1',
  digitaltune: '39900',
  JP2: '1',
  ClrMemReset: '0',
  ClrMemBfrSeek: '1',
  SetDigTuneWithScan: '0'
};
const STATUS_SIGNAL_FIELDS = ['ready', 'active', 'alarm', 'seek'];
const STATUS_SIGNAL_PINS = {
  ready: 'PIN14',
  active: 'PIN15',
  alarm: 'PIN0',
  seek: 'PIN1'
};

function averageFiniteValues(values = []) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (!finiteValues.length) {
    return null;
  }

  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function buildSimulatedHornScanMetadata(samples = []) {
  const frequencies = samples
    .map((sample) => Number(sample?.frequency))
    .filter((value) => Number.isFinite(value));
  const amplitudes = samples
    .map((sample) => Number(sample?.amplitude))
    .filter((value) => Number.isFinite(value));
  const currents = samples
    .map((sample) => Number(sample?.current))
    .filter((value) => Number.isFinite(value));
  const firstFrequency = frequencies[0] ?? null;
  const lastFrequency = frequencies.length ? frequencies[frequencies.length - 1] : null;
  const frequencyStep = frequencies.length > 1 ? frequencies[1] - frequencies[0] : 1;
  const midpoint = frequencies.length ? Math.floor(frequencies.length / 2) : 0;
  const seriesResonantPoint1 = frequencies[midpoint > 0 ? Math.max(0, midpoint - Math.floor(midpoint * 0.2)) : 0] ?? null;
  const parallelResonantPoint1 = frequencies[midpoint > 0 ? Math.min(frequencies.length - 1, midpoint + Math.floor(midpoint * 0.45)) : 0] ?? null;

  return {
    preset: {
      presetIndex: 1,
      frequencyStart: firstFrequency,
      frequencyStop: lastFrequency,
      frequencyStep: Number.isFinite(frequencyStep) && frequencyStep > 0 ? frequencyStep : 1,
      stepDelayMs: 10,
      amplitudePercent: averageFiniteValues(amplitudes) != null ? Math.round(averageFiniteValues(amplitudes)) : null,
      currentPercent: averageFiniteValues(currents) != null ? Math.round(averageFiniteValues(currents)) : null,
      seriesResonantPoint1,
      parallelResonantPoint1,
      raw: 'simulated'
    },
    resonance: {
      series: Number.isFinite(seriesResonantPoint1) ? [seriesResonantPoint1] : [],
      parallel: Number.isFinite(parallelResonantPoint1) ? [parallelResonantPoint1] : [],
      seriesResonantPoint1,
      parallelResonantPoint1,
      raw: 'simulated'
    }
  };
}

function buildSimulatedWeldGraphPreset(samples = [], settings = {}) {
  const frequencies = samples
    .map((sample) => Number(sample?.frequency))
    .filter((value) => Number.isFinite(value));
  const frequencyStart = frequencies.length ? Math.min(...frequencies) : null;
  const frequencyStop = frequencies.length ? Math.max(...frequencies) : null;

  return {
    frequencyStart,
    frequencyStop,
    entries: [
      { label: 'Weld Amplitude', value: Number(settings.weldAmp) || 10 },
      { label: 'Frequency Offset', value: Number(settings.FreqOff) || 0 },
      { label: 'Weld Ramp Time', value: Number(settings.startRamp) || 80 },
      { label: 'Seek Ramp Time', value: Number(settings.seekRamp) || 80 },
      { label: 'Seek Time', value: Number(settings.seekTime) || 500 },
      { label: 'Alarm Reset Request', value: Number(settings.ClrMemReset) || 0 }
    ],
    raw: 'simulated'
  };
}

class DcxService extends EventEmitter {
  constructor() {
    super();

    this.baseUrl = '';
    this.userid = '1234';
    this.status = 'offline';
    this.mode = 'http';
    this.simulation = false;
    this.ethernetConnected = false;
    this.serialService = new DcxSerialService();
    this.ethernetService = new DcxEthernetService({ userid: this.userid });
    this.simulationTimer = null;
    this.simulationTick = 0;

    this.queue = [];
    this.processing = false;
    this.pendingActivityAction = null;
    this.hornScanActive = false;
    this.hornScanAbortRequested = false;
    this.acquisitionPaused = false;
    this.httpRequestCount = 0;
    this.ioSnapshot = null;
    this.setupMetadata = {};
    this.serialTelemetryEnabled = false;
    this.serialTelemetryForced = false;

    this.telemetry = {
      deviceStatus: 'Disconnected',
      frequency: 0,
      power: 0,
      amplitude: 0,
      alarm: 0,
      ready: 0,
      active: 0,
      seek: 0,
      cycles: 0
    };

    this.systemInfo = {};

    this.defaultSettings = {
      ...DEFAULT_SETUP_SETTINGS,
      lang: '0',
      userid1: this.userid
    };

    this.settings = {
      ...this.defaultSettings
    };

    this.serialService.on('data', (data) => {
      if (!this.simulation && this.serialService.isConnected() && (this.serialTelemetryEnabled || this.serialTelemetryForced)) {
        this.updateTelemetry(data, { source: 'serial' });
      }
    });

    this.serialService.on('disconnect', () => {
      if (!this.simulation) {
        this.refreshHardwareConnectionState();

        if (!this.ethernetConnected) {
          this.updateTelemetry({
            deviceStatus: 'Disconnected',
            ready: 0,
            active: 0,
            seek: 0
          });
        } else {
          this.updateTelemetry({
            deviceStatus: 'DCX Ethernet Connected'
          });
        }
      }
    });

  }

  isAcquisitionPaused() {
    return Boolean(this.acquisitionPaused || this.hornScanActive);
  }

  async waitForHttpIdle({ timeoutMs = 1500, intervalMs = 20 } = {}) {
    const start = Date.now();

    while (this.httpRequestCount > 0) {
      if (Date.now() - start >= timeoutMs) {
        throw new Error('Timed out waiting for acquisition requests to finish before starting graph capture');
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  updateTelemetry(data, { source = 'unknown' } = {}) {
    const sanitizedTelemetry = { ...data };

    if (source === 'http' && this.serialService.isConnected()) {
      STATUS_SIGNAL_FIELDS.forEach((field) => {
        delete sanitizedTelemetry[field];
      });
    }

    const nextTelemetry = {
      ...this.telemetry,
      ...sanitizedTelemetry
    };
    const resolvedTelemetry = this.getResolvedTelemetrySnapshot(nextTelemetry);

    // Live frequency/cycle readback is only meaningful during sonics or seek/scan.
    if (this.status === 'online' && !resolvedTelemetry.active && !resolvedTelemetry.seek) {
      delete sanitizedTelemetry.frequency;
      delete sanitizedTelemetry.cycles;
    }

    this.telemetry = {
      ...this.telemetry,
      ...sanitizedTelemetry
    };

    this.emit('telemetry', this.getTelemetrySnapshot());
  }

  getTelemetrySnapshot() {
    return this.getResolvedTelemetrySnapshot(this.telemetry);
  }

  getSystemInfoSnapshot() {
    return {
      ...this.systemInfo
    };
  }

  getSettingsSnapshot() {
    return {
      ...this.settings
    };
  }

  getSetupMetadataSnapshot() {
    return {
      ...this.setupMetadata
    };
  }

  getSetupDefaultsSnapshot() {
    return {
      ...this.defaultSettings
    };
  }

  clearSystemInfo() {
    this.systemInfo = {};
  }

  updateSystemInfo(systemInfo = {}) {
    const nextEntries = Object.entries(systemInfo).filter(([, value]) => value != null && String(value).trim() !== '');

    this.systemInfo = nextEntries.reduce((nextSystemInfo, [key, value]) => ({
      ...nextSystemInfo,
      [key]: value
    }), {
      ...this.systemInfo
    });

    return this.getSystemInfoSnapshot();
  }

  setConnectionState({
    status = this.status,
    mode = this.mode,
    simulation = this.simulation,
    baseUrl = this.baseUrl,
    ethernetConnected = this.ethernetConnected
  } = {}) {
    this.status = status;
    this.mode = mode;
    this.simulation = simulation;
    this.baseUrl = baseUrl;
    this.ethernetConnected = ethernetConnected;
  }

  syncTransportState() {
    this.baseUrl = this.ethernetService.baseUrl;
    this.ethernetConnected = this.ethernetService.isConnected();
  }

  refreshHardwareConnectionState() {
    if (this.simulation) {
      return;
    }

    this.syncTransportState();
    this.status = this.ethernetConnected || this.serialService.isConnected()
      ? 'online'
      : 'offline';
  }

  getTransportConnections() {
    if (this.simulation) {
      return {
        ethernet: false,
        teensy: false
      };
    }

    this.syncTransportState();

    return {
      ethernet: Boolean(this.ethernetConnected),
      teensy: Boolean(this.serialService.isConnected())
    };
  }

  setSerialTelemetryEnabled(enabled) {
    this.serialTelemetryEnabled = Boolean(enabled);

    return {
      success: true,
      enabled: this.serialTelemetryEnabled
    };
  }

  normalizeConfig(config = {}) {
    const normalizedPort = String(config.port || '').trim();

    return {
      mode: config.mode || 'http',
      host: String(config.host || '').trim(),
      port: INVALID_SERIAL_PORT_VALUES.has(normalizedPort.toLowerCase()) ? '' : normalizedPort,
      simulation: Boolean(config.simulation)
    };
  }

  getOnlineStatus(extra = {}) {
    return {
      status: 'online',
      mode: this.mode,
      simulation: this.simulation,
      connections: this.getTransportConnections(),
      telemetry: this.getTelemetrySnapshot(),
      systemInfo: this.getSystemInfoSnapshot(),
      ...extra
    };
  }

  getOfflineStatus(error) {
    return {
      status: 'offline',
      mode: this.mode,
      simulation: this.simulation,
      connections: this.getTransportConnections(),
      systemInfo: this.getSystemInfoSnapshot(),
      ...(error ? { error } : {})
    };
  }

  hasActiveOperation() {
    const telemetry = this.getTelemetrySnapshot();
    return Boolean(telemetry.active || telemetry.seek || this.pendingActivityAction || this.hornScanActive);
  }

  getActiveOperationError(action = 'switch') {
    return action === 'disconnect'
      ? 'Stop sonics, seek, or scan before disconnecting.'
      : 'Stop sonics, seek, or scan before switching modes.';
  }

  stopSimulationLoop() {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
  }

  startSimulationLoop() {
    this.stopSimulationLoop();
    this.simulationTick = 0;
    this.simulationTimer = setInterval(() => {
      this.stepSimulation();
    }, 500);
  }

  stepSimulation() {
    if (!this.simulation || this.status !== 'online' || this.isAcquisitionPaused()) {
      return;
    }

    this.simulationTick += 1;

    const phase = this.simulationTick / 3;
    const amplitude = Number(this.telemetry.amplitude) || Number(this.settings.weldAmp) || 0;
    const isActive = Boolean(this.telemetry.active);
    const isSeek = Boolean(this.telemetry.seek);

    let frequency = 0;
    let power = 0;
    let cycleIncrement = 0;
    let deviceStatus = 'Simulator Ready';

    if (isActive) {
      frequency = 39950 + Math.round(Math.sin(phase) * 35);
      power = Math.max(5, Math.round(amplitude * 0.8));
      cycleIncrement = Math.max(1, Math.round(amplitude / 4));
      deviceStatus = 'Simulating Weld Cycle';
    } else if (isSeek) {
      frequency = 39880 + Math.round(Math.sin(phase * 1.4) * 90);
      power = 8;
      deviceStatus = 'Simulating Seek';
    } else {
      frequency = 40000;
      deviceStatus = 'Simulator Ready';
    }

    this.updateTelemetry({
      ready: 1,
      active: isActive ? 1 : 0,
      seek: isSeek ? 1 : 0,
      alarm: 0,
      amplitude,
      frequency,
      power,
      cycles: (Number(this.telemetry.cycles) || 0) + cycleIncrement,
      deviceStatus
    });
  }

  resolveStatusSignal(field, fallbackValue = null) {
    if (!this.ethernetConnected) {
      if (fallbackValue == null) {
        return null;
      }

      return fallbackValue ? 1 : 0;
    }

    const pin = STATUS_SIGNAL_PINS[field];
    const ioState = getIoDigitalState(this.ioSnapshot?.entries?.[pin] || null);
    if (ioState != null) {
      return ioState ? 1 : 0;
    }

    if (fallbackValue == null) {
      return null;
    }

    return fallbackValue ? 1 : 0;
  }

  getResolvedTelemetrySnapshot(telemetry = {}) {
    const snapshot = {
      ...telemetry
    };

    STATUS_SIGNAL_FIELDS.forEach((field) => {
      const resolvedValue = this.resolveStatusSignal(field, snapshot[field]);
      if (resolvedValue != null) {
        snapshot[field] = resolvedValue;
      }
    });

    return snapshot;
  }

  async resolveHardwareSerialPort(preferredPort = '') {
    return this.serialService.resolvePort(preferredPort);
  }

  enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  async processQueue() {
    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();

      try {
        await job();
      } catch (error) {
        console.error('[DCX QUEUE ERROR]', error.message);
      }
    }

    this.processing = false;
  }

  async connect(config) {
    const nextConfig = this.normalizeConfig(config);

    this.serialTelemetryForced = false;

    if (this.hasActiveOperation()) {
      return {
        success: false,
        ...(this.status === 'online' ? this.getOnlineStatus() : this.getOfflineStatus()),
        error: this.getActiveOperationError('switch')
      };
    }

    this.serialService.disconnect();
    this.ethernetService.disconnect();
    this.syncTransportState();

    if (!nextConfig.simulation) {
      this.stopSimulationLoop();
    }

    this.clearSystemInfo();
    this.ioSnapshot = null;

    this.setConnectionState({
      mode: nextConfig.mode,
      simulation: nextConfig.simulation,
      baseUrl: '',
      status: 'offline',
      ethernetConnected: false
    });

    if (nextConfig.simulation) {
      this.setConnectionState({ status: 'online' });
      this.updateTelemetry({
        deviceStatus: 'Simulator Ready',
        ready: 1,
        active: 0,
        seek: 0,
        alarm: 0,
        power: 0,
        frequency: 40000
      });
      this.startSimulationLoop();

      return {
        success: true,
        status: 'online',
        simulation: true,
        connections: this.getTransportConnections()
      };
    }

    const shouldAttemptEthernet = nextConfig.mode !== 'serial';
    const warnings = [];
    let port = '';

    if (shouldAttemptEthernet) {
      if (!nextConfig.host) {
        warnings.push('Missing DCX host IP');
      } else {
        try {
          await this.ethernetService.connect(nextConfig.host);
          this.syncTransportState();
        } catch (error) {
          warnings.push(error.message);
        }
      }
    }

    try {
      const serialResult = await this.serialService.connect(nextConfig.port);
      port = serialResult.port;
    } catch (error) {
      warnings.push(error.message);
    }

    this.refreshHardwareConnectionState();

    if (this.status !== 'online') {
      this.clearSystemInfo();
      this.ioSnapshot = null;
      return {
        success: false,
        ...(warnings.length ? { warnings } : {}),
        ...this.getOfflineStatus(warnings[0] || 'No hardware transport connected')
      };
    }

    const hardwareReadyTargets = [];
    if (this.ethernetConnected) {
      hardwareReadyTargets.push(nextConfig.host);
    }
    if (port) {
      hardwareReadyTargets.push(port);
    }

    this.updateTelemetry({
      deviceStatus: hardwareReadyTargets.length
        ? `Hardware Ready (${hardwareReadyTargets.join(' / ')})`
        : (this.ethernetConnected ? 'DCX Ethernet Ready' : 'Teensy Serial Ready')
    });

    let status = this.getOnlineStatus();
    let systemInfo = this.getSystemInfoSnapshot();

    if (this.ethernetConnected) {
      status = await this.getStatus();
      systemInfo = await this.getSystemInfo({ status });
    }

    return {
      success: true,
      status: 'online',
      mode: nextConfig.mode,
      ...(this.ethernetConnected ? { host: nextConfig.host } : {}),
      ...(port ? { port } : {}),
      ...(warnings.length ? { warnings } : {}),
      connections: this.getTransportConnections(),
      telemetry: status?.telemetry ?? this.getTelemetrySnapshot(),
      systemInfo
    };
  }

  async disconnect() {
    this.serialTelemetryForced = false;

    if (this.hasActiveOperation()) {
      return {
        success: false,
        ...(this.status === 'online' ? this.getOnlineStatus() : this.getOfflineStatus()),
        error: this.getActiveOperationError('disconnect')
      };
    }

    this.serialService.disconnect();
    this.ethernetService.disconnect();
    this.syncTransportState();

    this.stopSimulationLoop();
    this.clearSystemInfo();
    this.ioSnapshot = null;

    this.queue = [];
    this.setConnectionState({
      status: 'offline',
      simulation: false,
      baseUrl: '',
      ethernetConnected: false
    });
    this.updateTelemetry({
      deviceStatus: 'Disconnected',
      frequency: 0,
      power: 0,
      amplitude: 0,
      cycles: 0,
      active: 0,
      seek: 0,
      ready: 0
    });

    return { success: true };
  }

  async _post(func, cmd, body = '') {
    if (!this.baseUrl || !this.ethernetConnected) {
      throw new Error('Ethernet transport is not connected');
    }

    this.httpRequestCount += 1;

    try {
      return await this.ethernetService.post(func, cmd, body);
    } finally {
      this.httpRequestCount = Math.max(0, this.httpRequestCount - 1);
    }
  }

  parseAmplitudeValue(value, context = 'Amplitude') {
    const normalizedValue = typeof value === 'string' ? value.trim() : value;
    const amplitude = Number(normalizedValue);

    if (!Number.isInteger(amplitude) || amplitude < DCX_MIN_AMPLITUDE || amplitude > DCX_MAX_AMPLITUDE) {
      throw new Error(`${context} must be an integer between ${DCX_MIN_AMPLITUDE} and ${DCX_MAX_AMPLITUDE}`);
    }

    return amplitude;
  }

  normalizeParameterUpdates(kwargs = {}) {
    const nextSettings = {};

    for (const [key, value] of Object.entries(kwargs)) {
      if (value == null || value === '') {
        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(this.settings, key)) {
        throw new Error(`Unknown DCX parameter: ${key}`);
      }

      if (key === 'weldAmp') {
        nextSettings.weldAmp = String(this.parseAmplitudeValue(value, 'weldAmp'));
        nextSettings.externalamplitude = '0';
        continue;
      }

      nextSettings[key] = String(value);
    }

    return nextSettings;
  }

  async postParameterUpdate(body) {
    if (!this.baseUrl || !this.ethernetConnected) {
      throw new Error('Ethernet transport is not connected');
    }

    this.httpRequestCount += 1;

    try {
      return await this.ethernetService.postParameterUpdate(body);
    } finally {
      this.httpRequestCount = Math.max(0, this.httpRequestCount - 1);
    }
  }

  runSerialCommand(command) {
    if (!this.serialService.isConnected()) {
      throw new Error('Serial transport is not connected');
    }

    return this.serialService.sendCommand(command);
  }

  updateTelemetryFromControl(action, value) {
    const shouldUpdateStatusSignals = this.simulation || !this.ethernetConnected;

    switch (action) {
      case 'start':
        this.updateTelemetry({
          ...(shouldUpdateStatusSignals ? {
            active: 1,
            seek: 0,
            ready: 1,
            alarm: 0
          } : {}),
          amplitude: typeof value === 'number' ? value : this.telemetry.amplitude,
          deviceStatus: this.simulation ? 'Simulating Weld Cycle' : this.telemetry.deviceStatus
        });
        break;
      case 'stop':
        this.updateTelemetry({
          ...(shouldUpdateStatusSignals ? {
            active: 0,
            seek: 0
          } : {}),
          frequency: this.simulation ? 40000 : this.telemetry.frequency,
          power: 0,
          deviceStatus: this.simulation ? 'Simulator Ready' : this.telemetry.deviceStatus
        });
        break;
      case 'seek':
        this.updateTelemetry({
          ...(shouldUpdateStatusSignals ? {
            active: 0,
            seek: 1,
            ready: 1,
            alarm: 0
          } : {}),
          deviceStatus: this.simulation ? 'Simulating Seek' : this.telemetry.deviceStatus
        });
        break;
      case 'reset':
      case 'resetOverload':
        this.updateTelemetry({
          ...(shouldUpdateStatusSignals ? {
            alarm: 0,
            seek: 0,
            active: 0,
            ready: 1
          } : {}),
          frequency: this.simulation ? 40000 : this.telemetry.frequency,
          power: 0,
          deviceStatus: this.simulation ? 'Simulator Ready' : this.telemetry.deviceStatus
        });
        break;
      default:
        break;
    }
  }

  getTransportError(action) {
    const requiresHttp = ['seek', 'reset', 'resetOverload', 'setAmp'].includes(action);
    const requiresSerial = ['start', 'stop'].includes(action);

    if (requiresHttp && (!this.baseUrl || !this.ethernetConnected)) {
      return 'Ethernet transport is not connected';
    }

    if (requiresSerial && !this.serialService.isConnected()) {
      return 'Teensy serial transport is not connected';
    }

    return null;
  }

  async control(action, value) {
    if (this.hornScanActive) {
      return {
        success: false,
        error: 'A graph capture is currently running'
      };
    }

    return this.enqueue(async () => {
      let result;
      const marksActivityPending = ACTIVE_CONTROL_ACTIONS.has(action);

      if (marksActivityPending) {
        this.pendingActivityAction = action;
      }

      try {
        if (this.simulation) {
          if (action === 'start' && typeof value === 'number' && !Number.isNaN(value)) {
            value = this.parseAmplitudeValue(value, 'Start amplitude');
          }

          if (action === 'setAmp' && value?.weldAmp != null) {
            const weldAmp = this.parseAmplitudeValue(value.weldAmp, 'weldAmp');
            this.updateTelemetry({ amplitude: weldAmp });
            value = { ...value, weldAmp };
          }

          this.updateTelemetryFromControl(action, value);
          return { success: true, action, value, simulation: true };
        }

        const transportError = this.getTransportError(action);
        if (transportError) {
          return {
            success: false,
            error: transportError
          };
        }

        switch (action) {
          case 'start':
            if (this.getTelemetrySnapshot().alarm) {
              return {
                success: false,
                error: 'Cannot start sonics while an alarm is active'
              };
            }

            {
              const previousSerialTelemetryForced = this.serialTelemetryForced;
            this.serialTelemetryForced = true;

            if (typeof value === 'number' && !Number.isNaN(value)) {
              value = this.parseAmplitudeValue(value, 'Start amplitude');

              if (this.ethernetConnected) {
                const amplitudeUpdate = await this.setParameters({ weldAmp: value });
                if (!amplitudeUpdate?.success) {
                  this.serialTelemetryForced = previousSerialTelemetryForced;
                  return amplitudeUpdate;
                }
              }
            }

            try {
              result = this.runSerialCommand('START');
            } catch (error) {
              this.serialTelemetryForced = previousSerialTelemetryForced;
              throw error;
            }

            if (typeof value === 'number' && !this.ethernetConnected) {
              result = {
                ...result,
                warning: 'Amplitude update skipped because Ethernet transport is not connected'
              };
            }
            }
            break;
          case 'stop':
            result = this.runSerialCommand('STOP');
            if (!this.serialTelemetryEnabled) {
              this.serialTelemetryForced = false;
            }
            break;
          case 'seek':
            result = await this._post(13, 9);
            break;
          case 'reset':
            result = await this._post(4, 1);
            break;
          case 'resetOverload':
            result = await this._post(16, 0);
            break;
          case 'setAmp':
            result = await this.setParameters(value);
            break;
          default:
            return { success: false, error: `Unknown action: ${action}` };
        }

        this.updateTelemetryFromControl(action, value);
        return result;
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      } finally {
        if (marksActivityPending && this.pendingActivityAction === action) {
          this.pendingActivityAction = null;
        }
      }
    });
  }

  async setParameters(kwargs = {}) {
    if (this.hornScanActive) {
      return {
        success: false,
        error: 'A graph capture is currently running',
        settings: {}
      };
    }

    const nextSettings = this.normalizeParameterUpdates(kwargs);

    if (Object.keys(nextSettings).length === 0) {
      return { success: true, settings: {} };
    }

    const nextState = {
      ...this.settings,
      ...nextSettings
    };

    if (this.simulation) {
      this.settings = nextState;

      if (this.settings.weldAmp != null) {
        this.updateTelemetry({ amplitude: Number(this.settings.weldAmp) || 0 });
      }

      return {
        success: true,
        simulation: true,
        settings: nextSettings
      };
    }

    const primaryKey = Object.keys(nextSettings)[0] || 'weldAmp';
    const primaryVal = nextState[primaryKey];

    const paramString =
      `WELD:${primaryKey}=${primaryVal}&` +
      Object.entries(nextState)
        .map(([key, value]) => `${key}=${value}`)
        .join('&');

    const body = `param=${paramString}`;
    const res = await this.postParameterUpdate(body);

    if (res.status !== 200) {
      throw new Error(`DCX parameter update failed with status ${res.status}`);
    }

    this.settings = nextState;

    if (this.settings.weldAmp != null) {
      this.updateTelemetry({ amplitude: Number(this.settings.weldAmp) || 0 });
    }

    return { success: res.status === 200, status: res.status };
  }

  async getStatus() {
    if (this.isAcquisitionPaused()) {
      return this.status === 'online'
        ? this.getOnlineStatus({ hornScanActive: true, acquisitionPaused: true })
        : this.getOfflineStatus();
    }

    if (this.simulation) {
      return this.getOnlineStatus();
    }

    if (!this.baseUrl && !this.serialService.isConnected()) {
      this.setConnectionState({ status: 'offline', ethernetConnected: false });
      return this.getOfflineStatus();
    }

    if (!this.ethernetConnected) {
      this.setConnectionState({ status: 'online' });
      return this.getOnlineStatus();
    }

    try {
      const res = await this._post(7, 0);
      const nextTelemetry = extractTelemetryFromRaw(res.data);

      if (Object.keys(nextTelemetry).length) {
        this.updateTelemetry(nextTelemetry, { source: 'http' });
      }

      this.setConnectionState({ status: 'online', ethernetConnected: true });
      return this.getOnlineStatus({ raw: res.data });
    } catch (error) {
      this.ethernetService.disconnect();
      this.syncTransportState();
      this.ioSnapshot = null;

      if (this.serialService.isConnected()) {
        this.setConnectionState({ status: 'online', ethernetConnected: false });
        return this.getOnlineStatus({ error: error.message });
      }

      this.setConnectionState({ status: 'offline', ethernetConnected: false });
      return this.getOfflineStatus(error.message);
    }
  }

  async getSystemInfo({ status = null } = {}) {
    if (this.isAcquisitionPaused()) {
      return this.getSystemInfoSnapshot();
    }

    if (this.simulation) {
      return this.getSystemInfoSnapshot();
    }

    const nextStatus = status?.raw ? status : await this.getStatus();
    if (nextStatus?.status !== 'online' || !nextStatus?.raw) {
      return this.getSystemInfoSnapshot();
    }

    const nextSystemInfo = extractSystemInfoFromRaw(nextStatus.raw, {
      frequencyFallback: this.telemetry.frequency || this.settings.digitaltune
    });
    if (Object.keys(nextSystemInfo).length) {
      this.updateSystemInfo(nextSystemInfo);
    }

    return this.getSystemInfoSnapshot();
  }

  async getSetup() {
    if (this.isAcquisitionPaused()) {
      return {
        success: true,
        hornScanActive: true,
        acquisitionPaused: true,
        cached: true,
        fetchedAt: Date.now(),
        settings: this.getSettingsSnapshot(),
        metadata: this.getSetupMetadataSnapshot()
      };
    }

    if (this.simulation) {
      return {
        success: true,
        simulation: true,
        fetchedAt: Date.now(),
        settings: this.getSettingsSnapshot(),
        metadata: this.getSetupMetadataSnapshot()
      };
    }

    if (!this.baseUrl || !this.ethernetConnected) {
      return {
        success: false,
        error: 'Ethernet transport is not connected',
        settings: this.getSettingsSnapshot(),
        metadata: this.getSetupMetadataSnapshot()
      };
    }

    const response = await this._post(4, 0);
    const { settings: nextSettings, metadata: nextMetadata } = parseSetupPayload(response.data);
    if (Object.keys(nextSettings).length) {
      this.settings = {
        ...this.settings,
        ...nextSettings
      };
    }

    if (Object.keys(nextMetadata).length) {
      this.setupMetadata = {
        ...this.setupMetadata,
        ...nextMetadata
      };
    }

    return {
      success: true,
      fetchedAt: Date.now(),
      raw: response.data,
      settings: this.getSettingsSnapshot(),
      metadata: this.getSetupMetadataSnapshot()
    };
  }

  async getSetupDefaults() {
    return {
      success: true,
      settings: this.getSetupDefaultsSnapshot()
    };
  }

  getEmptyIoSnapshot() {
    return {
      entries: {},
      digitalInputs: {},
      digitalOutputs: {},
      analogInputs: {},
      analogOutputs: {}
    };
  }

  async readIoSnapshot(func, cmd) {
    if (this.isAcquisitionPaused()) {
      return {
        success: true,
        hornScanActive: true,
        acquisitionPaused: true,
        cached: true,
        fetchedAt: Date.now(),
        ...mergeIoSnapshots(this.getEmptyIoSnapshot(), this.ioSnapshot)
      };
    }

    if (this.simulation) {
      return {
        success: true,
        simulation: true,
        fetchedAt: Date.now(),
        ...this.getEmptyIoSnapshot()
      };
    }

    if (!this.baseUrl || !this.ethernetConnected) {
      return {
        success: false,
        error: 'Ethernet transport is not connected',
        ...this.getEmptyIoSnapshot()
      };
    }

    const response = await this._post(func, cmd);
    const snapshot = parseIoPayload(response.data);
    this.ioSnapshot = mergeIoSnapshots(this.ioSnapshot, snapshot);

    return {
      success: true,
      fetchedAt: Date.now(),
      ...this.ioSnapshot
    };
  }

  async getIoBootstrapSnapshot() {
    return this.readIoSnapshot(6, 0);
  }

  async getIoLiveSnapshot() {
    return this.readIoSnapshot(10, 15);
  }

  async getIoSnapshot() {
    return this.getIoLiveSnapshot();
  }

  async getHornScanStatus() {
    if (this.simulation) {
      return {
        success: true,
        simulation: true,
        ready: true,
        state: {
          complete: false,
          running: false,
          indeterminate: false,
          progressPercent: 0,
          error: null,
          code: 'READY',
          payload: '',
          values: [],
          raw: 'simulation'
        },
        raw: 'simulation'
      };
    }

    if (!this.baseUrl || !this.ethernetConnected) {
      return {
        success: false,
        error: 'Ethernet transport is not connected'
      };
    }

    const response = await this._post(17, 0);
    return {
      success: true,
      ...parseHornScanTabStatus(response.data),
      raw: String(response.data ?? '')
    };
  }

  async runHornScan() {
    if (this.hornScanActive) {
      return {
        success: false,
        error: 'A graph capture is already running'
      };
    }

    this.acquisitionPaused = true;

    return this.enqueue(async () => {
      const previousPendingAction = this.pendingActivityAction;
      const previousDeviceStatus = this.telemetry.deviceStatus;

      this.hornScanActive = true;
      this.hornScanAbortRequested = false;
      this.pendingActivityAction = 'hornScan';

      try {
        if (this.simulation) {
          this.updateTelemetry({ deviceStatus: 'Simulating Horn Scan' });
          this.emit('horn-scan-progress', {
            stage: 'start',
            started: true,
            code: 'SIMULATION',
            message: 'Simulation started',
            progressPercent: 0,
            raw: 'simulation'
          });
          for (let step = 0; step < 8; step += 1) {
            if (this.hornScanAbortRequested) {
              return {
                success: false,
                aborted: true,
                message: 'Horn scan aborted'
              };
            }

            this.emit('horn-scan-progress', {
              stage: 'running',
              started: true,
              code: 'SIMULATION',
              message: 'Simulation in progress',
              progressPercent: Math.round((step / 7) * 100),
              raw: 'simulation'
            });
            await new Promise((resolve) => setTimeout(resolve, 100));
          }

          this.emit('horn-scan-progress', {
            stage: 'complete',
            started: true,
            code: 'SIMULATION',
            message: 'Simulation complete',
            progressPercent: 100,
            raw: 'simulation'
          });
          const samples = buildSimulatedHornScanSamples();
          const { preset, resonance } = buildSimulatedHornScanMetadata(samples);

          return {
            success: true,
            simulation: true,
            message: 'Horn scan complete',
            pollCount: 0,
            datasets: buildHornScanDatasetsFromSamples(samples),
            samples,
            preset,
            resonance
          };
        }

        const transportError = this.getTransportError('seek');
        if (transportError) {
          return {
            success: false,
            error: transportError
          };
        }

        await this.waitForHttpIdle();

        this.updateTelemetry({ deviceStatus: 'Preparing Horn Scan' });

        this.updateTelemetry({ deviceStatus: 'Horn Scan Running' });

        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          const result = await runHardwareHornScan(
            (func, cmd) => this._post(func, cmd),
            {
              shouldAbort: () => this.hornScanAbortRequested,
              onProgress: (progress) => {
                this.emit('horn-scan-progress', progress);
              }
            }
          );

          const startCode = String(result?.startState?.code || '').toUpperCase();
          const busyStart = startCode === 'SYSTEMBUSY'
            || /busy/i.test(String(result?.error || ''));

          if (!busyStart || attempt >= maxAttempts || this.hornScanAbortRequested) {
            return result;
          }

          console.log('[DCX HORN SCAN] Retrying after SYSTEMBUSY', {
            attempt,
            maxAttempts,
            error: result?.error ?? null,
            start: result?.raw?.start ?? null
          });
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        return {
          success: false,
          error: 'Horn scan could not be started'
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      } finally {
        this.hornScanActive = false;
        this.hornScanAbortRequested = false;
        this.acquisitionPaused = false;
        this.pendingActivityAction = previousPendingAction;
        this.updateTelemetry({
          deviceStatus: this.simulation ? 'Simulator Ready' : (previousDeviceStatus || this.telemetry.deviceStatus)
        });
      }
    });
  }

  async abortHornScan() {
    if (!this.hornScanActive) {
      return {
        success: false,
        error: 'No horn scan is currently running'
      };
    }

    this.hornScanAbortRequested = true;
    this.updateTelemetry({ deviceStatus: 'Horn Scan Abort Requested' });

    if (this.simulation) {
      return {
        success: true,
        message: 'Horn scan abort requested'
      };
    }

    const transportError = this.getTransportError('reset');
    if (transportError) {
      this.hornScanAbortRequested = false;
      return {
        success: false,
        error: transportError
      };
    }

    try {
      const response = await this._post(14, 8);
      const raw = String(response.data ?? '');
      const aborted = /SCANABORTED/i.test(raw);

      if (!aborted) {
        this.hornScanAbortRequested = false;
        return {
          success: false,
          error: 'Horn scan abort was not acknowledged by the controller',
          raw
        };
      }

      return {
        success: true,
        message: 'Horn scan abort requested',
        raw
      };
    } catch (error) {
      this.hornScanAbortRequested = false;
      return {
        success: false,
        error: error.message
      };
    }
  }

  async runWeldGraph() {
    if (this.hornScanActive) {
      return {
        success: false,
        error: 'A graph capture is already running'
      };
    }

    this.acquisitionPaused = true;

    return this.enqueue(async () => {
      const previousPendingAction = this.pendingActivityAction;
      const previousDeviceStatus = this.telemetry.deviceStatus;

      this.hornScanActive = true;
      this.pendingActivityAction = 'weldGraph';

      try {
        if (this.simulation) {
          this.updateTelemetry({ deviceStatus: 'Simulating Weld Graph Load' });
          await new Promise((resolve) => setTimeout(resolve, 750));
          const samples = buildSimulatedWeldGraphSamples();

          return {
            success: true,
            simulation: true,
            message: 'Weld graph loaded',
            datasets: buildWeldGraphDatasetsFromSamples(samples),
            samples,
            preset: buildSimulatedWeldGraphPreset(samples, this.settings)
          };
        }

        const transportError = this.getTransportError('seek');
        if (transportError) {
          return {
            success: false,
            error: transportError
          };
        }

        await this.waitForHttpIdle();

        this.updateTelemetry({ deviceStatus: 'Loading Weld Graph' });
        console.log('[DCX WELD GRAPH] Telemetry before capture:', this.getTelemetrySnapshot());

        return runHardwareWeldGraph(
          (func, cmd) => this._post(func, cmd),
          {
            onArm: () => {
              console.log('[DCX WELD GRAPH] Telemetry after arm:', this.getTelemetrySnapshot());
            }
          }
        );
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      } finally {
        this.hornScanActive = false;
        this.acquisitionPaused = false;
        this.pendingActivityAction = previousPendingAction;
        this.updateTelemetry({
          deviceStatus: this.simulation ? 'Simulator Ready' : (previousDeviceStatus || this.telemetry.deviceStatus)
        });
      }
    });
  }

  async runSequence(steps = []) {
    for (const step of steps) {
      if (step.type === 'PULSE') {
        await this.control('start', step.amplitude || 100);
      } else {
        await this.control('stop');
      }

      await new Promise((resolve) => setTimeout(resolve, step.duration || 0));
    }

    await this.control('stop');
    return { success: true };
  }

  async runWorkflow(text) {
    const lines = String(text || '').split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const [cmd, arg] = trimmed.split(/\s+/);

      switch ((cmd || '').toUpperCase()) {
        case 'START':
          await this.control('start', parseInt(arg, 10));
          break;
        case 'STOP':
          await this.control('stop');
          break;
        case 'WAIT':
          await new Promise((resolve) => setTimeout(resolve, parseInt(arg, 10) || 0));
          break;
        default:
          break;
      }
    }

    return { success: true };
  }

  async listSerialPorts() {
    return this.serialService.listPorts();
  }
}

module.exports = new DcxService();
