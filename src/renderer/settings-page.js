import Chart from 'chart.js/auto';

import { loadSystemInfo } from './controls.js';
import { $, runtimeState } from './runtime.js';
import { log } from './logger.js';
import { t } from './preferences.js';
import { getResolvedTelemetry, showFooterFeedback } from './status-ui.js';

const SETTINGS_TABS = ['system', 'setup', 'io', 'signature', 'alarms', 'docs'];
const MAX_SIGNATURE_SAMPLES = 240;
const WELD_DATA_CAPTURE_MS = 5000;
const IO_POLL_INTERVAL_MS = 10;
const DEFAULT_SIGNATURE_DRAW_FROM = 0;
const DEFAULT_SIGNATURE_DRAW_TO = WELD_DATA_CAPTURE_MS;
const DEFAULT_HORN_SCAN_DRAW_FROM = 38900;
const DEFAULT_HORN_SCAN_DRAW_TO = 40900;
const SETUP_INPUT_FIELDS = {
  weldAmp: {
    inputId: 'amplitude-input',
    indicatorId: 'amplitude-input-range'
  },
  startRamp: {
    inputId: 'settings-setup-amplitude-ramp',
    indicatorId: 'settings-setup-amplitude-ramp-range'
  },
  digitaltune: {
    inputId: 'settings-setup-digital-tune',
    indicatorId: 'settings-setup-digital-tune-range'
  },
  FreqOff: {
    inputId: 'settings-setup-internal-offset',
    indicatorId: 'settings-setup-internal-offset-range'
  },
  seekRamp: {
    inputId: 'settings-setup-seek-ramp',
    indicatorId: 'settings-setup-seek-ramp-range'
  },
  seekTime: {
    inputId: 'settings-setup-seek-time',
    indicatorId: 'settings-setup-seek-time-range'
  },
  SeekFreqOff: {
    inputId: 'settings-setup-seek-frequency-offset',
    indicatorId: 'settings-setup-seek-frequency-offset-range'
  }
};
const SETUP_CHECKBOX_FIELD_IDS = {
  externalamplitude: 'settings-setup-amplitude-external',
  externalfrequency: 'settings-setup-external-offset',
  endofweldstore: 'settings-setup-end-of-weld-store',
  ClrMemReset: 'settings-setup-clear-memory-reset',
  ClrMemBfrSeek: 'settings-setup-clear-memory-seek',
  SetDigTuneWithScan: 'settings-setup-set-with-horn-scan',
  stoponalarm: 'settings-setup-alarms-reset-required',
  timedSeek: 'settings-setup-timed-seek',
  ClrMemAtPwrUp: 'settings-setup-power-on-clear-memory'
};
const SETUP_POWERUP_RADIO_IDS = {
  0: 'settings-setup-power-on-off',
  1: 'settings-setup-power-on-seek',
  2: 'settings-setup-power-on-scan'
};
const IO_INPUT_INDICATORS = [
  ['PIN1', 'settings-io-input-external-start'],
  ['PIN2', 'settings-io-input-external-seek'],
  ['PIN3', 'settings-io-input-external-reset'],
  ['PIN4', 'settings-io-input-memory-clear']
];
const IO_OUTPUT_INDICATORS = [
  ['PIN7', 'settings-io-output-ready', 'ready'],
  ['PIN8', 'settings-io-output-active', 'active'],
  ['PIN9', 'settings-io-output-alarm', 'alarm'],
  ['PIN10', 'settings-io-output-seek', 'seek']
];
const IO_ANALOG_INPUT_READINGS = [
  ['PIN17', 'settings-io-amplitude-in'],
  ['PIN18', 'settings-io-frequency-offset']
];
const IO_ANALOG_OUTPUT_READINGS = [
  ['PIN24', 'settings-io-power-out', 'power'],
  ['PIN25', 'settings-io-amplitude-out', 'amplitude']
];
const SIGNATURE_CHART_SERIES = [
  {
    key: 'frequency',
    field: 'frequency',
    color: '#38bdf8',
    axis: 'y',
    checkboxId: 'settings-signature-series-frequency',
    labelKey: 'settings.signature.dataset.frequency',
    fallback: 'Frequency'
  },
  {
    key: 'power',
    field: 'power',
    color: '#f59e0b',
    axis: 'y1',
    checkboxId: 'settings-signature-series-power',
    labelKey: 'settings.signature.dataset.power',
    fallback: 'Power'
  },
  {
    key: 'phase',
    field: 'phase',
    color: '#a78bfa',
    axis: 'y2',
    checkboxId: 'settings-signature-series-phase',
    labelKey: 'settings.signature.dataset.phase',
    fallback: 'Phase'
  },
  {
    key: 'current',
    field: 'current',
    color: '#f472b6',
    axis: 'y3',
    checkboxId: 'settings-signature-series-current',
    labelKey: 'settings.signature.dataset.current',
    fallback: 'Current'
  },
  {
    key: 'amplitude',
    field: 'amplitude',
    color: '#34d399',
    axis: 'y1',
    checkboxId: 'settings-signature-series-amplitude',
    labelKey: 'settings.signature.dataset.amplitude',
    fallback: 'Amplitude'
  },
  {
    key: 'pwmAmplitude',
    field: 'pwmAmplitude',
    color: '#facc15',
    axis: 'y1',
    checkboxId: 'settings-signature-series-pwm-amplitude',
    labelKey: 'settings.signature.dataset.pwmAmplitude',
    fallback: 'PWM Amplitude'
  }
];
const SIGNATURE_MODE_CONFIG = {
  weldData: {
    descriptionKey: 'settings.signature.weldDataDescription',
    descriptionFallback: 'Load the stored weld graph from the DCX over Ethernet and view or export the selected parameters.',
    startLabelKey: 'settings.signature.startWeldCapture',
    startLabelFallback: 'Load Weld Graph',
    exportPrefix: 'weld-data-graph',
    defaultSelection: 'amplitude',
    series: ['phase', 'current', 'amplitude', 'power', 'pwmAmplitude', 'frequency'],
    action: 'start'
  },
  hornSignature: {
    descriptionKey: 'settings.signature.hornSignatureDescription',
    descriptionFallback: 'Use the horn signature graph to diagnose horn resonance and export the selected scan parameters.',
    startLabelKey: 'settings.signature.startHornScan',
    startLabelFallback: 'Start Horn Scan',
    exportPrefix: 'horn-signature-graph',
    defaultSelection: 'amplitude',
    series: ['phase', 'current', 'amplitude'],
    action: 'seek'
  }
};

let activeSettingsTab = 'system';
let activeSignatureMode = 'weldData';
let signatureChart = null;
let signatureSamples = [];
let previousAlarmState = false;
let alarmEventCount = 0;
let signatureAutoStopTimer = null;
let ioPollingTimer = null;
let ioPollingStarting = false;
let ioPollingBusy = false;
let ioBootstrapLoaded = false;
let lastIoSnapshot = null;
let setupLoading = false;
let setupLoaded = false;
let setupDefaultsLoading = false;
let weldGraphPreset = null;
let weldGraphSummary = null;
let hornScanPreset = null;
let hornScanResonance = null;
let hornScanUiState = 'idle';
let hornScanProgressPercent = 0;
let hornScanProgressMessage = '';
let hornScanProgressSubscriptionActive = false;
let hornScanStatusLoading = false;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setInputValue(id, value) {
  const element = $(id);
  if (element && value != null) {
    element.value = String(value);
  }
}

function setInputConstraints(id, { min = null, max = null } = {}) {
  const element = $(id);
  if (!element) {
    return;
  }

  if (min == null || min === '') {
    element.removeAttribute('min');
  } else {
    element.min = String(min);
  }

  if (max == null || max === '') {
    element.removeAttribute('max');
  } else {
    element.max = String(max);
  }
}

function setRangeIndicator(id, metadata = {}) {
  const element = $(id);
  if (!element) {
    return;
  }

  const hasRange = metadata?.min != null && metadata?.min !== '' && metadata?.max != null && metadata?.max !== '';
  element.textContent = hasRange
    ? t('settings.setup.rangeIndicator', 'Range: {min} to {max}')
      .replace('{min}', String(metadata.min))
      .replace('{max}', String(metadata.max))
    : '';
}

function normalizeSetupState(settings = {}) {
  return settings && typeof settings === 'object'
    ? { ...settings }
    : {};
}

function normalizeSetupMetadata(metadata = {}) {
  return metadata && typeof metadata === 'object'
    ? { ...metadata }
    : {};
}

function setToggleChecked(id, checked) {
  const element = $(id);
  if (element) {
    element.checked = Boolean(checked);
  }
}

function isSetupEnabledValue(value) {
  return String(value ?? '').trim() === '1';
}

function applySetupConfiguration(settings = {}, metadata = {}, { persist = true } = {}) {
  const nextSettings = normalizeSetupState(settings);
  const nextMetadata = normalizeSetupMetadata(metadata);

  if (persist) {
    runtimeState.setupConfig = nextSettings;
    runtimeState.setupMetadata = nextMetadata;
  }

  const activeSettings = persist ? runtimeState.setupConfig : nextSettings;
  const activeMetadata = persist ? runtimeState.setupMetadata : nextMetadata;

  Object.entries(SETUP_INPUT_FIELDS).forEach(([field, binding]) => {
    const fieldMetadata = activeMetadata?.[field] || {};
    setInputValue(binding.inputId, activeSettings?.[field]);
    setInputConstraints(binding.inputId, fieldMetadata);
    setRangeIndicator(binding.indicatorId, fieldMetadata);
  });

  Object.entries(SETUP_CHECKBOX_FIELD_IDS).forEach(([field, id]) => {
    if (activeSettings?.[field] != null) {
      setToggleChecked(id, isSetupEnabledValue(activeSettings[field]));
    }
  });

  Object.values(SETUP_POWERUP_RADIO_IDS).forEach((id) => {
    setToggleChecked(id, false);
  });

  if (activeSettings?.powerup != null) {
    const radioId = SETUP_POWERUP_RADIO_IDS[String(activeSettings.powerup).trim()];
    if (radioId) {
      setToggleChecked(radioId, true);
    }
  }
}

function canLoadSetupConfiguration() {
  return String(runtimeState.status || 'offline').toLowerCase() === 'online'
    && !runtimeState.hornScanRunning
    && !runtimeState.simulation
    && Boolean(runtimeState.connections?.ethernet)
    && typeof window.api?.dcx?.getSetup === 'function';
}

async function loadSetupConfiguration({ force = false } = {}) {
  if (setupLoading || !canLoadSetupConfiguration() || (!force && setupLoaded)) {
    return runtimeState.setupConfig || {};
  }

  setupLoading = true;

  try {
    const res = await window.api.dcx.getSetup();
    if (!res?.success || !res?.settings) {
      return runtimeState.setupConfig || {};
    }

    applySetupConfiguration(res.settings, res.metadata || {});
    setupLoaded = true;
    return res.settings;
  } catch (error) {
    log({ setup_load_error: error.message });
    return runtimeState.setupConfig || {};
  } finally {
    setupLoading = false;
  }
}

async function loadSetupDefaults() {
  if (setupDefaultsLoading || typeof window.api?.dcx?.getSetupDefaults !== 'function') {
    return runtimeState.setupDefaults || {};
  }

  setupDefaultsLoading = true;

  try {
    const res = await window.api.dcx.getSetupDefaults();
    if (res?.success && res.settings) {
      runtimeState.setupDefaults = normalizeSetupState(res.settings);
    }

    return runtimeState.setupDefaults || {};
  } catch (error) {
    log({ setup_defaults_error: error.message });
    return runtimeState.setupDefaults || {};
  } finally {
    setupDefaultsLoading = false;
  }
}

function getSetupIntegerValue(field) {
  const binding = SETUP_INPUT_FIELDS[field];
  if (!binding) {
    return null;
  }

  const rawValue = $(binding.inputId)?.value;
  const numericValue = Number(String(rawValue ?? '').trim());
  const metadata = runtimeState.setupMetadata?.[field] || {};
  const min = Number(metadata.min);
  const max = Number(metadata.max);

  if (!Number.isInteger(numericValue)) {
    throw new Error(`${field} must be an integer value.`);
  }

  if (Number.isFinite(min) && numericValue < min) {
    throw new Error(`${field} must be greater than or equal to ${min}.`);
  }

  if (Number.isFinite(max) && numericValue > max) {
    throw new Error(`${field} must be less than or equal to ${max}.`);
  }

  return numericValue;
}

function getSelectedPowerupMode() {
  const selectedRadio = Object.entries(SETUP_POWERUP_RADIO_IDS)
    .find(([, id]) => Boolean($(id)?.checked));

  return selectedRadio ? selectedRadio[0] : String(runtimeState.setupConfig?.powerup ?? '0');
}

function collectSetupFormValues() {
  return {
    weldAmp: getSetupIntegerValue('weldAmp'),
    startRamp: getSetupIntegerValue('startRamp'),
    digitaltune: getSetupIntegerValue('digitaltune'),
    FreqOff: getSetupIntegerValue('FreqOff'),
    seekRamp: getSetupIntegerValue('seekRamp'),
    seekTime: getSetupIntegerValue('seekTime'),
    SeekFreqOff: getSetupIntegerValue('SeekFreqOff'),
    externalamplitude: $('settings-setup-amplitude-external')?.checked ? '1' : '0',
    externalfrequency: $('settings-setup-external-offset')?.checked ? '1' : '0',
    endofweldstore: $('settings-setup-end-of-weld-store')?.checked ? '1' : '0',
    ClrMemReset: $('settings-setup-clear-memory-reset')?.checked ? '1' : '0',
    ClrMemBfrSeek: $('settings-setup-clear-memory-seek')?.checked ? '1' : '0',
    SetDigTuneWithScan: $('settings-setup-set-with-horn-scan')?.checked ? '1' : '0',
    stoponalarm: $('settings-setup-alarms-reset-required')?.checked ? '1' : '0',
    timedSeek: $('settings-setup-timed-seek')?.checked ? '1' : '0',
    powerup: getSelectedPowerupMode(),
    ClrMemAtPwrUp: $('settings-setup-power-on-clear-memory')?.checked ? '1' : '0'
  };
}

async function saveSetupConfiguration() {
  try {
    const payload = collectSetupFormValues();
    const res = await window.api?.dcx?.setParameters?.(payload);
    if (!res?.success) {
      throw new Error(res?.error || res?.message || 'Setup save failed');
    }

    await loadSetupConfiguration({ force: true });
    showFooterFeedback('Setup saved.', { tone: 'success', timeout: 4000 });
  } catch (error) {
    showFooterFeedback(`Setup save failed: ${error.message}`, { tone: 'error', timeout: 8000 });
  }
}

function cancelSetupConfiguration() {
  applySetupConfiguration(runtimeState.setupConfig || {}, runtimeState.setupMetadata || {}, { persist: false });
  showFooterFeedback('Setup changes canceled.', { tone: 'info', timeout: 3000 });
}

async function restoreSetupDefaults() {
  const defaults = await loadSetupDefaults();
  applySetupConfiguration(defaults || {}, runtimeState.setupMetadata || {}, { persist: false });
  showFooterFeedback('Default setup values loaded. Save to apply them.', { tone: 'info', timeout: 5000 });
}

function bindSetupControls() {
  const buttonBindings = [
    ['settings-setup-save-btn', saveSetupConfiguration],
    ['settings-setup-cancel-btn', cancelSetupConfiguration],
    ['settings-setup-restore-defaults-btn', restoreSetupDefaults]
  ];

  buttonBindings.forEach(([id, handler]) => {
    const element = $(id);
    if (!element || element.dataset.bound === 'true') {
      return;
    }

    element.dataset.bound = 'true';
    element.addEventListener('click', handler);
  });
}

function scalePercentToVoltage(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.max(0, Math.min(100, numericValue)) * 0.05;
}

function formatIoVoltage(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return numericValue.toFixed(2).padStart(5, '0');
}

function getIoEntry(ioSnapshot, pin) {
  return ioSnapshot?.entries?.[pin] || null;
}

function getIoDigitalState(entry) {
  if (!entry) {
    return null;
  }

  const rawValue = String(entry.rawValue ?? '').trim().toUpperCase();
  if (['1', 'ON', 'TRUE', 'READY', 'ACTIVE', 'HIGH'].includes(rawValue)) {
    return true;
  }

  if (['0', 'OFF', 'FALSE', 'IDLE', 'INACTIVE', 'LOW'].includes(rawValue)) {
    return false;
  }

  if (entry.numericValue == null) {
    return null;
  }

  return Boolean(entry.numericValue);
}

function formatControllerIoVoltage(entry) {
  if (!entry || entry.numericValue == null) {
    return null;
  }

  const absoluteValue = Math.abs(entry.numericValue);
  const nextVoltage = absoluteValue > 10 ? entry.numericValue / 1000 : entry.numericValue;
  return formatIoVoltage(nextVoltage);
}

function setIoIndicatorState(id, active) {
  const indicator = $(id);
  if (indicator) {
    indicator.classList.toggle('active', Boolean(active));
  }
}

function setIoReading(id, value, fallback = '--.--') {
  const reading = $(id);
  if (reading) {
    reading.textContent = value ?? fallback;
  }
}

function mergeIoSnapshotData(currentSnapshot = null, nextSnapshot = null) {
  if (!nextSnapshot) {
    return currentSnapshot;
  }

  return {
    ...(currentSnapshot || {}),
    ...nextSnapshot,
    raw: [currentSnapshot?.raw, nextSnapshot.raw].filter(Boolean).join('\n'),
    entries: {
      ...(currentSnapshot?.entries || {}),
      ...(nextSnapshot.entries || {})
    },
    digitalInputs: {
      ...(currentSnapshot?.digitalInputs || {}),
      ...(nextSnapshot.digitalInputs || {})
    },
    digitalOutputs: {
      ...(currentSnapshot?.digitalOutputs || {}),
      ...(nextSnapshot.digitalOutputs || {})
    },
    analogInputs: {
      ...(currentSnapshot?.analogInputs || {}),
      ...(nextSnapshot.analogInputs || {})
    },
    analogOutputs: {
      ...(currentSnapshot?.analogOutputs || {}),
      ...(nextSnapshot.analogOutputs || {})
    }
  };
}

function refreshIoSummary({ telemetry = runtimeState.lastTelemetry || {}, ioSnapshot = lastIoSnapshot } = {}) {
  const hasEthernetConnection = Boolean(runtimeState.connections?.ethernet);
  const resolvedTelemetry = getResolvedTelemetry(telemetry);

  IO_INPUT_INDICATORS.forEach(([pin, id]) => {
    setIoIndicatorState(id, getIoDigitalState(getIoEntry(ioSnapshot, pin)));
  });

  IO_OUTPUT_INDICATORS.forEach(([pin, id, telemetryField]) => {
    const controllerState = getIoDigitalState(getIoEntry(ioSnapshot, pin));
    const outputState = hasEthernetConnection ? controllerState : resolvedTelemetry[telemetryField];
    setIoIndicatorState(id, outputState);
  });

  IO_ANALOG_INPUT_READINGS.forEach(([pin, id]) => {
    setIoReading(id, formatControllerIoVoltage(getIoEntry(ioSnapshot, pin)));
  });

  IO_ANALOG_OUTPUT_READINGS.forEach(([pin, id, telemetryField]) => {
    const controllerVoltage = formatControllerIoVoltage(getIoEntry(ioSnapshot, pin));
    const fallbackVoltage = formatIoVoltage(scalePercentToVoltage(telemetry[telemetryField]));
    setIoReading(id, controllerVoltage ?? fallbackVoltage, '00.00');
  });
}

function isIoConfigurationVisible() {
  return runtimeState.currentView === 'settings' && activeSettingsTab === 'io';
}

function canPollIoConfiguration() {
  return isIoConfigurationVisible()
    && !runtimeState.hornScanRunning
    && !runtimeState.simulation
    && Boolean(runtimeState.connections?.ethernet)
    && typeof window.api?.dcx?.getIoBootstrapSnapshot === 'function'
    && typeof window.api?.dcx?.getIoLiveSnapshot === 'function';
}

function stopIoPolling({ clearSnapshot = false } = {}) {
  if (ioPollingTimer) {
    window.clearInterval(ioPollingTimer);
    ioPollingTimer = null;
  }

  ioPollingStarting = false;
  ioPollingBusy = false;

  if (clearSnapshot) {
    ioBootstrapLoaded = false;
    lastIoSnapshot = null;
    runtimeState.ioSnapshot = null;
  }
}

async function loadIoBootstrapSnapshot() {
  if (ioBootstrapLoaded || !canPollIoConfiguration()) {
    return;
  }

  const ioSnapshot = await window.api.dcx.getIoBootstrapSnapshot();
  if (!ioSnapshot?.success) {
    return;
  }

  ioBootstrapLoaded = true;
  lastIoSnapshot = mergeIoSnapshotData(lastIoSnapshot, ioSnapshot);
  runtimeState.ioSnapshot = lastIoSnapshot;
  refreshIoSummary({ ioSnapshot: lastIoSnapshot });
}

async function pollIoSnapshot() {
  if (ioPollingBusy || !canPollIoConfiguration()) {
    return;
  }

  ioPollingBusy = true;

  try {
    const ioSnapshot = await window.api.dcx.getIoLiveSnapshot();
    if (!ioSnapshot?.success) {
      return;
    }

    lastIoSnapshot = mergeIoSnapshotData(lastIoSnapshot, ioSnapshot);
    runtimeState.ioSnapshot = lastIoSnapshot;
    refreshIoSummary({ ioSnapshot: lastIoSnapshot });
  } catch (error) {
    log({ io_poll_error: error.message });
  } finally {
    ioPollingBusy = false;
  }
}

async function startIoPolling() {
  if (ioPollingStarting || ioPollingTimer || !canPollIoConfiguration()) {
    return;
  }

  ioPollingStarting = true;

  try {
    await loadIoBootstrapSnapshot();
    if (!canPollIoConfiguration()) {
      return;
    }

    await pollIoSnapshot();
    if (!canPollIoConfiguration()) {
      return;
    }

    ioPollingTimer = window.setInterval(pollIoSnapshot, IO_POLL_INTERVAL_MS);
  } catch (error) {
    log({ io_poll_start_error: error.message });
  } finally {
    ioPollingStarting = false;
  }
}

function syncIoPollingState() {
  if (!canPollIoConfiguration()) {
    stopIoPolling({ clearSnapshot: !runtimeState.connections?.ethernet || runtimeState.simulation || !isIoConfigurationVisible() });
    refreshIoSummary();
    return;
  }

  if (ioPollingTimer) {
    return;
  }

  startIoPolling();
}

function renderSystemInfo(systemInfo = runtimeState.systemInfo || {}) {
  document.querySelectorAll('[data-system-info-field]').forEach((element) => {
    const field = element.dataset.systemInfoField;
    const fallback = element.dataset.defaultValue || '--';
    const nextValue = field ? systemInfo?.[field] : null;
    element.textContent = nextValue != null && String(nextValue).trim() !== '' ? String(nextValue) : fallback;
  });
}

function refreshSystemInfoTab() {
  if (runtimeState.currentView !== 'settings' || activeSettingsTab !== 'system') {
    return;
  }

  loadSystemInfo().catch((error) => {
    log({ system_info_tab_error: error.message });
  });
}

function setActiveSettingsTab(tab) {
  activeSettingsTab = SETTINGS_TABS.includes(tab) ? tab : 'system';

  document.querySelectorAll('[data-settings-tab]').forEach((button) => {
    const isActive = button.dataset.settingsTab === activeSettingsTab;
    button.classList.toggle('active', isActive);
    button.classList.toggle('text-muted-foreground', !isActive);
  });

  document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.settingsPanel !== activeSettingsTab);
  });

  syncIoPollingState();

  if (activeSettingsTab === 'system') {
    refreshSystemInfoTab();
  }

  if (activeSettingsTab === 'signature' && isHornSignatureMode()) {
    refreshHornScanTabStatus();
  }
}

function bindSettingsTabs() {
  document.querySelectorAll('[data-settings-tab]').forEach((button) => {
    if (button.dataset.bound === 'true') {
      return;
    }

    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      setActiveSettingsTab(button.dataset.settingsTab || 'system');
    });
  });
}

function formatSignatureTime(sample, firstTimestamp) {
  return Math.max(0, Math.round(sample.timestamp - firstTimestamp));
}

function isHornSignatureMode() {
  return activeSignatureMode === 'hornSignature';
}

function parseSignatureInputValue(id, fallback) {
  const value = Number($(id)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function setSignatureInputValue(id, value) {
  const element = $(id);
  if (element) {
    element.value = String(value);
  }
}

function formatSignatureNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? String(numericValue) : '--';
}

function getLatestSignatureSampleValue(field) {
  for (let index = signatureSamples.length - 1; index >= 0; index -= 1) {
    const value = Number(signatureSamples[index]?.[field]);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getDefaultWeldGraphRange() {
  if (signatureSamples.length > 1) {
    const firstTimestamp = Number(signatureSamples[0]?.timestamp);
    const lastTimestamp = Number(signatureSamples.at(-1)?.timestamp);
    if (Number.isFinite(firstTimestamp) && Number.isFinite(lastTimestamp) && lastTimestamp > firstTimestamp) {
      return {
        from: 0,
        to: Math.max(100, Math.round(lastTimestamp - firstTimestamp))
      };
    }
  }

  return { from: DEFAULT_SIGNATURE_DRAW_FROM, to: DEFAULT_SIGNATURE_DRAW_TO };
}

function renderWeldGraphPresetEntries() {
  const emptyState = $('settings-signature-weld-preset-empty');
  const list = $('settings-signature-weld-preset-list');
  if (!list) {
    return;
  }

  const entries = Array.isArray(weldGraphPreset?.entries) ? weldGraphPreset.entries : [];
  list.replaceChildren();
  if (emptyState) {
    emptyState.classList.toggle('hidden', entries.length > 0);
  }

  entries.forEach((entry) => {
    const row = document.createElement('div');
    const label = document.createElement('div');
    const value = document.createElement('div');

    row.className = 'flex items-start justify-between gap-4 rounded-lg border border-border/50 bg-background/70 px-3 py-2';
    label.className = 'text-sm text-foreground/88';
    value.className = 'text-sm font-medium text-foreground';

    label.textContent = String(entry?.label ?? '--');
    value.textContent = String(entry?.value ?? '--');

    row.append(label, value);
    list.appendChild(row);
  });
}

function renderWeldGraphMetadata() {
  setSignatureInputValue('settings-signature-weld-frequency-start', formatSignatureNumber(weldGraphPreset?.frequencyStart));
  setSignatureInputValue('settings-signature-weld-frequency-stop', formatSignatureNumber(weldGraphPreset?.frequencyStop));
  renderWeldGraphPresetEntries();
}

function clearWeldGraphMetadata() {
  weldGraphPreset = null;
  weldGraphSummary = null;
  renderWeldGraphMetadata();
}

function applyWeldGraphMetadata(result = {}) {
  weldGraphPreset = result?.preset ?? null;
  weldGraphSummary = result?.summary ?? result?.startState?.summary ?? null;
  renderWeldGraphMetadata();
}

function getPrimaryHornScanResonanceValue(kind) {
  const values = Array.isArray(hornScanResonance?.[kind]) ? hornScanResonance[kind] : [];
  const nonZeroValue = values.find((value) => Number.isFinite(Number(value)) && Number(value) > 0);
  if (nonZeroValue != null) {
    return Number(nonZeroValue);
  }

  const presetField = kind === 'series' ? 'seriesResonantPoint1' : 'parallelResonantPoint1';
  return normalizeSignatureSampleValue(hornScanPreset?.[presetField]);
}

function renderHornScanMetadata() {
  setSignatureInputValue('settings-signature-frequency-start', formatSignatureNumber(hornScanPreset?.frequencyStart));
  setSignatureInputValue('settings-signature-frequency-stop', formatSignatureNumber(hornScanPreset?.frequencyStop));
  setSignatureInputValue('settings-signature-frequency-step', formatSignatureNumber(hornScanPreset?.frequencyStep));
  setSignatureInputValue('settings-signature-step-delay', formatSignatureNumber(hornScanPreset?.stepDelayMs));
  setSignatureInputValue('settings-signature-scan-amplitude', formatSignatureNumber(hornScanPreset?.amplitudePercent));
  setSignatureInputValue('settings-signature-scan-current', formatSignatureNumber(hornScanPreset?.currentPercent));
  setSignatureInputValue('settings-signature-series-resonant-point-1', formatSignatureNumber(getPrimaryHornScanResonanceValue('series')));
  setSignatureInputValue('settings-signature-parallel-resonant-point-1', formatSignatureNumber(getPrimaryHornScanResonanceValue('parallel')));
}

function clearHornScanMetadata() {
  hornScanPreset = null;
  hornScanResonance = null;
  renderHornScanMetadata();
}

function summarizeHornScanStatus(result = {}) {
  return {
    success: !!result?.success,
    ready: !!result?.ready,
    code: result?.state?.code ?? null,
    progressPercent: Number.isFinite(Number(result?.state?.progressPercent))
      ? Number(result.state.progressPercent)
      : null,
    frequencyStart: Number.isFinite(Number(result?.frequencyStart))
      ? Number(result.frequencyStart)
      : null,
    frequencyStop: Number.isFinite(Number(result?.frequencyStop))
      ? Number(result.frequencyStop)
      : null,
    seriesResonantPoint1: Number.isFinite(Number(result?.seriesResonantPoint1))
      ? Number(result.seriesResonantPoint1)
      : null,
    parallelResonantPoint1: Number.isFinite(Number(result?.parallelResonantPoint1))
      ? Number(result.parallelResonantPoint1)
      : null,
    psFrequencyType: result?.psFrequencyType ?? null,
    error: result?.error ?? null,
    raw: result?.raw ?? null
  };
}

async function refreshHornScanTabStatus() {
  if (hornScanStatusLoading
    || runtimeState.hornScanRunning
    || activeSettingsTab !== 'signature'
    || !isHornSignatureMode()
    || typeof window.api?.dcx?.getHornScanStatus !== 'function') {
    return;
  }

  hornScanStatusLoading = true;

  try {
    const res = await window.api.dcx.getHornScanStatus();
    log({ horn_scan_status: summarizeHornScanStatus(res) });

    if (!res?.success) {
      return;
    }

    const frequencyStart = normalizeSignatureSampleValue(res?.frequencyStart ?? res?.psFrequencyType?.start);
    const frequencyStop = normalizeSignatureSampleValue(res?.frequencyStop ?? res?.psFrequencyType?.stop);
    const seriesResonantPoint1 = normalizeSignatureSampleValue(res?.seriesResonantPoint1);
    const parallelResonantPoint1 = normalizeSignatureSampleValue(res?.parallelResonantPoint1);
    if (frequencyStart == null
      && frequencyStop == null
      && seriesResonantPoint1 == null
      && parallelResonantPoint1 == null) {
      return;
    }

    if (frequencyStart != null || frequencyStop != null) {
      hornScanPreset = {
        ...(hornScanPreset || {}),
        ...(frequencyStart != null ? { frequencyStart } : {}),
        ...(frequencyStop != null ? { frequencyStop } : {}),
        raw: String(res.raw ?? hornScanPreset?.raw ?? '')
      };
    }

    if (seriesResonantPoint1 != null || parallelResonantPoint1 != null) {
      hornScanResonance = {
        series: seriesResonantPoint1 != null ? [seriesResonantPoint1] : [],
        parallel: parallelResonantPoint1 != null ? [parallelResonantPoint1] : [],
        seriesResonantPoint1,
        parallelResonantPoint1,
        raw: String(res.raw ?? '')
      };
    }

    renderHornScanMetadata();
    refreshSignatureSummary(runtimeState.lastTelemetry);
    updateSignatureValueReadout();
  } catch (error) {
    log({ horn_scan_status_error: error.message });
  } finally {
    hornScanStatusLoading = false;
  }
}

function applyHornScanMetadata(result = {}) {
  hornScanPreset = result?.preset ?? null;
  hornScanResonance = result?.resonance ?? null;
  renderHornScanMetadata();
}

function getDefaultHornScanRange() {
  const presetStart = normalizeSignatureSampleValue(hornScanPreset?.frequencyStart);
  const presetStop = normalizeSignatureSampleValue(hornScanPreset?.frequencyStop);
  if (presetStart != null && presetStop != null && presetStop > presetStart) {
    return { from: presetStart, to: presetStop };
  }

  const scanFrequencies = signatureSamples
    .map((sample) => normalizeSignatureSampleValue(sample?.frequency))
    .filter((value) => value != null);
  if (scanFrequencies.length > 1) {
    return {
      from: scanFrequencies[0],
      to: scanFrequencies[scanFrequencies.length - 1]
    };
  }

  return {
    from: DEFAULT_HORN_SCAN_DRAW_FROM,
    to: DEFAULT_HORN_SCAN_DRAW_TO
  };
}

function getDefaultSignatureRange() {
  if (isHornSignatureMode()) {
    return getDefaultHornScanRange();
  }

  return getDefaultWeldGraphRange();
}

function getHornScanExpectedPointCount() {
  const frequencyStart = normalizeSignatureSampleValue(hornScanPreset?.frequencyStart);
  const frequencyStop = normalizeSignatureSampleValue(hornScanPreset?.frequencyStop);
  const frequencyStep = normalizeSignatureSampleValue(hornScanPreset?.frequencyStep);
  if (frequencyStart == null || frequencyStop == null || frequencyStep == null || frequencyStep <= 0 || frequencyStop < frequencyStart) {
    return null;
  }

  return Math.floor((frequencyStop - frequencyStart) / frequencyStep) + 1;
}

function syncSignatureModeLabels() {
  const hornSignatureMode = isHornSignatureMode();
  const drawStep = hornSignatureMode ? '1' : '100';
  const drawFromInput = $('settings-signature-draw-from');
  const drawToInput = $('settings-signature-draw-to');

  setSignatureText(
    'settings-signature-draw-from-label',
    hornSignatureMode ? t('settings.signature.drawFromHz', 'Draw From (Hz)') : t('settings.signature.drawFrom', 'Draw From (ms)')
  );
  setSignatureText(
    'settings-signature-draw-to-label',
    hornSignatureMode ? t('settings.signature.drawToHz', 'To (Hz)') : t('settings.signature.drawTo', 'To (ms)')
  );
  setSignatureText(
    'settings-signature-x-value-label',
    hornSignatureMode ? t('settings.signature.xValueFrequency', 'Frequency (Hz)') : t('settings.signature.xValue', 'X Value')
  );
  setSignatureText(
    'settings-signature-power-label',
    hornSignatureMode ? t('settings.signature.current', 'Current') : t('settings.signature.power', 'Power')
  );

  if (drawFromInput) {
    drawFromInput.step = drawStep;
  }

  if (drawToInput) {
    drawToInput.step = drawStep;
  }
}

function getSignatureXAxisValue(sample, firstTimestamp) {
  if (isHornSignatureMode()) {
    return normalizeSignatureSampleValue(sample?.frequency);
  }

  return formatSignatureTime(sample, firstTimestamp);
}

function getSignatureRange() {
  const defaults = getDefaultSignatureRange();
  const minSpan = isHornSignatureMode() ? 1 : 100;
  const from = Math.max(0, parseSignatureInputValue('settings-signature-draw-from', defaults.from));
  const requestedTo = Math.max(0, parseSignatureInputValue('settings-signature-draw-to', defaults.to));
  const to = requestedTo > from ? requestedTo : from + minSpan;

  return { from, to };
}

function setSignatureMeterFill(id, ratio) {
  const meter = $(id);
  if (!meter) {
    return;
  }

  meter.style.setProperty('--signature-meter-width', `${clamp(ratio, 0, 1) * 100}%`);
}

function setSignatureIndicatorState(id, { active = false, alert = false } = {}) {
  const indicator = $(id);
  if (!indicator) {
    return;
  }

  indicator.classList.toggle('active', active);
  indicator.classList.toggle('alert', alert);
}

function setSignatureText(id, value) {
  const element = $(id);
  if (!element) {
    return;
  }

  if ('value' in element && typeof element.value === 'string') {
    element.value = value;
  } else {
    element.textContent = value;
  }
}

function resetHornScanProgress() {
  hornScanProgressPercent = 0;
  hornScanProgressMessage = '';
}

function getHornScanProgressConfig() {
  const hasMeasuredProgress = Number.isFinite(hornScanProgressPercent) && hornScanProgressPercent > 0;

  switch (hornScanUiState) {
    case 'running':
      return {
        labelKey: 'settings.signature.scanRunning',
        labelFallback: hornScanProgressMessage || 'Horn scan in progress',
        value: hasMeasuredProgress ? hornScanProgressPercent : 0,
        indeterminate: !hasMeasuredProgress,
        tone: 'running'
      };
    case 'aborting':
      return {
        labelKey: 'settings.signature.scanAborting',
        labelFallback: hornScanProgressMessage || 'Aborting horn scan',
        value: hornScanProgressPercent,
        indeterminate: true,
        tone: 'aborted'
      };
    case 'passed':
      return {
        labelKey: 'settings.signature.scanPassed',
        labelFallback: 'Horn scan complete',
        value: 100,
        indeterminate: false,
        tone: 'passed'
      };
    case 'failed':
      return {
        labelKey: 'settings.signature.scanFailed',
        labelFallback: 'Horn scan failed',
        value: 100,
        indeterminate: false,
        tone: 'failed'
      };
    case 'aborted':
      return {
        labelKey: 'settings.signature.scanAborted',
        labelFallback: 'Horn scan aborted',
        value: 100,
        indeterminate: false,
        tone: 'aborted'
      };
    default:
      return {
        labelKey: 'settings.signature.scanIdle',
        labelFallback: 'Idle',
        value: 0,
        indeterminate: false,
        tone: 'idle'
      };
  }
}

function renderHornScanStatusUi() {
  const progressTrack = $('settings-signature-progress-track');
  const progressFill = $('settings-signature-progress-fill');
  const progressLabel = $('settings-signature-progress-label');
  const progress = getHornScanProgressConfig();

  if (progressTrack) {
    progressTrack.setAttribute('aria-valuenow', String(progress.value));
    ['idle', 'running', 'passed', 'failed', 'aborted'].forEach((state) => {
      progressTrack.classList.toggle(state, progress.tone === state);
    });
  }

  if (progressFill) {
    progressFill.style.setProperty('--signature-progress-width', `${progress.value}%`);
    progressFill.classList.toggle('indeterminate', progress.indeterminate);
  }

  if (progressLabel) {
    progressLabel.textContent = t(progress.labelKey, progress.labelFallback);
  }

  setSignatureIndicatorState('settings-signature-status-passed', { active: hornScanUiState === 'passed' });
  setSignatureIndicatorState('settings-signature-status-failed', { active: hornScanUiState === 'failed' });
  setSignatureIndicatorState('settings-signature-status-aborted', { active: hornScanUiState === 'aborted' });
}

function setHornScanUiProgress(nextState = 'idle') {
  hornScanUiState = nextState;
  renderHornScanStatusUi();
}

function applyHornScanProgress(progress = {}) {
  const nextPercent = Number(progress?.progressPercent);
  if (Number.isFinite(nextPercent)) {
    hornScanProgressPercent = clamp(nextPercent, 0, 100);
  }

  if (progress?.stage === 'running' && hornScanProgressPercent > 0) {
    hornScanProgressMessage = `Horn scan in progress (${hornScanProgressPercent}%)`;
  } else if (progress?.stage === 'complete') {
    hornScanProgressMessage = 'Horn scan complete';
  } else if (progress?.stage === 'start') {
    hornScanProgressMessage = 'Horn scan started';
  } else if (typeof progress?.message === 'string' && progress.message.trim()) {
    hornScanProgressMessage = progress.message.trim();
  }

  renderHornScanStatusUi();
}

function clearSignatureAutoStopTimer() {
  if (!signatureAutoStopTimer) {
    return;
  }

  window.clearTimeout(signatureAutoStopTimer);
  signatureAutoStopTimer = null;
}

function setHornScanRunning(running) {
  const nextRunning = Boolean(running);
  if (runtimeState.hornScanRunning === nextRunning) {
    return;
  }

  runtimeState.hornScanRunning = nextRunning;
  document.dispatchEvent(new CustomEvent('app:horn-scan-state', {
    detail: {
      running: nextRunning
    }
  }));
}

function normalizeSignatureSampleValue(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function getWeldGraphSummaryValue(field) {
  return normalizeSignatureSampleValue(weldGraphSummary?.[field]);
}

function applyHornScanSamples(samples = []) {
  const baseTimestamp = Date.now();
  const keepTimedRows = !isHornSignatureMode();
  const normalizedSamples = Array.isArray(samples)
    ? samples
      .map((sample, index) => ({
        timestamp: Number.isFinite(Number(sample?.timestamp)) ? Number(sample.timestamp) : baseTimestamp + index,
        frequency: normalizeSignatureSampleValue(sample?.frequency),
        power: normalizeSignatureSampleValue(sample?.power),
        phase: normalizeSignatureSampleValue(sample?.phase),
        current: normalizeSignatureSampleValue(sample?.current),
        amplitude: normalizeSignatureSampleValue(sample?.amplitude),
        pwmAmplitude: normalizeSignatureSampleValue(sample?.pwmAmplitude)
      }))
      .filter((sample) => keepTimedRows
        ? Number.isFinite(Number(sample.timestamp))
        : SIGNATURE_CHART_SERIES.some((series) => sample[series.field] != null))
    : [];

  if (!normalizedSamples.length) {
    return false;
  }

  signatureSamples = normalizedSamples;
  rebuildSignatureChart();
  return true;
}

function summarizeCaptureResult(result = {}) {
  const datasets = result?.datasets && typeof result.datasets === 'object'
    ? Object.fromEntries(
      Object.entries(result.datasets).map(([field, series]) => [field, Array.isArray(series) ? series.length : null])
    )
    : null;

  return {
    success: !!result?.success,
    aborted: !!result?.aborted,
    error: result?.error ?? null,
    message: result?.message ?? null,
    pollCount: Number.isFinite(Number(result?.pollCount)) ? Number(result.pollCount) : null,
    sampleCount: Array.isArray(result?.samples) ? result.samples.length : 0,
    datasetSizes: datasets,
    summary: result?.summary ?? result?.startState?.summary ?? null,
    preset: result?.preset ?? null,
    resonance: result?.resonance ?? null,
    raw: {
      start: result?.raw?.start ?? null,
      lastPoll: Array.isArray(result?.raw?.poll) && result.raw.poll.length
        ? result.raw.poll[result.raw.poll.length - 1]
        : null
    }
  };
}

function getActiveSignatureModeConfig() {
  return SIGNATURE_MODE_CONFIG[activeSignatureMode] || SIGNATURE_MODE_CONFIG.weldData;
}

function getWeldGraphMemoryRatio(summaryMemory) {
  if (Number.isFinite(summaryMemory)) {
    if (summaryMemory > 1000) {
      return clamp((summaryMemory - 39000) / 2000, 0, 1);
    }

    return clamp(summaryMemory / MAX_SIGNATURE_SAMPLES, 0, 1);
  }

  return signatureSamples.length ? clamp(signatureSamples.length / MAX_SIGNATURE_SAMPLES, 0, 1) : 0;
}

function syncSignatureModeUi() {
  const config = getActiveSignatureModeConfig();
  const availableSeries = new Set(config.series);
  const hornSignatureMode = isHornSignatureMode();
  const description = $('settings-signature-mode-description');
  const startButton = $('settings-signature-start-btn');
  const resetButton = $('settings-signature-reset-btn');
  const graphSelection = $('settings-signature-graph-selection');

  document.querySelectorAll('[data-signature-mode]').forEach((button) => {
    const isActive = button.dataset.signatureMode === activeSignatureMode;
    button.classList.toggle('active', isActive);
    button.classList.toggle('text-muted-foreground', !isActive);
  });

  if (description) {
    description.textContent = t(config.descriptionKey, config.descriptionFallback);
  }

  if (startButton) {
    startButton.textContent = t(config.startLabelKey, config.startLabelFallback);
  }

  if (resetButton) {
    resetButton.textContent = hornSignatureMode
      ? t('settings.signature.abortHornScan', 'Abort Horn Scan')
      : t('settings.signature.resetOverload', 'Reset Overload');
  }

  document.querySelectorAll('[data-signature-horn-only]').forEach((element) => {
    element.classList.toggle('hidden', !hornSignatureMode);
  });

  document.querySelectorAll('[data-signature-weld-only]').forEach((element) => {
    element.classList.toggle('hidden', hornSignatureMode);
  });

  syncSignatureModeLabels();

  document.querySelectorAll('[data-signature-series-option]').forEach((element) => {
    const key = element.dataset.signatureSeriesOption;
    const visible = availableSeries.has(key);
    const input = element.querySelector('input');

    element.classList.toggle('hidden', !visible);
    if (input) {
      const wasDisabled = input.disabled;
      input.disabled = !visible;
      if (!visible) {
        input.checked = false;
      } else if (wasDisabled) {
        input.checked = true;
      }
    }
  });

  if (graphSelection) {
    Array.from(graphSelection.options).forEach((option) => {
      const visible = availableSeries.has(option.value);
      option.hidden = !visible;
      option.disabled = !visible;
    });

    if (!availableSeries.has(graphSelection.value)) {
      graphSelection.value = config.defaultSelection;
    }
  }
}

function setActiveSignatureMode(mode, { clearGraph = true } = {}) {
  const nextMode = SIGNATURE_MODE_CONFIG[mode] ? mode : 'weldData';
  activeSignatureMode = nextMode;
  clearSignatureAutoStopTimer();
  syncSignatureModeUi();

  if (clearGraph) {
    resetHornScanProgress();
    clearWeldGraphMetadata();
    clearHornScanMetadata();
    signatureSamples = [];
    resetSignatureControls();
    rebuildSignatureChart();
    if (nextMode === 'hornSignature' && !runtimeState.hornScanRunning) {
      setHornScanUiProgress('idle');
    }
  } else {
    renderWeldGraphMetadata();
    renderHornScanMetadata();
    syncSignatureChartPresentation();
  }

  renderHornScanStatusUi();
  refreshSignatureSummary(runtimeState.lastTelemetry);
  updateSignatureValueReadout();

  if (nextMode === 'hornSignature' && activeSettingsTab === 'signature' && !runtimeState.hornScanRunning) {
    refreshHornScanTabStatus();
  }
}

function getSignatureChartSelection() {
  return $('settings-signature-graph-selection')?.value || getActiveSignatureModeConfig().defaultSelection;
}

function getSignatureSeriesCheckboxState(key) {
  return Boolean($(`settings-signature-series-${key === 'pwmAmplitude' ? 'pwm-amplitude' : key}`)?.checked);
}

function getSignatureDataRows() {
  const firstTimestamp = signatureSamples[0]?.timestamp || Date.now();

  return signatureSamples
    .map((sample) => {
      const timeMs = formatSignatureTime(sample, firstTimestamp);
      const xValue = getSignatureXAxisValue(sample, firstTimestamp);
      if (!Number.isFinite(xValue)) {
        return null;
      }

      return {
        xValue,
        timeMs,
        frequency: sample.frequency,
        power: sample.power,
        phase: sample.phase,
        current: sample.current,
        amplitude: sample.amplitude,
        pwmAmplitude: sample.pwmAmplitude
      };
    })
    .filter(Boolean);
}

function getVisibleSignatureRows() {
  const { from, to } = getSignatureRange();

  return getSignatureDataRows().filter((row) => row.xValue >= from && row.xValue <= to);
}

function syncSignatureChartPresentation({ update = true } = {}) {
  if (!signatureChart) {
    return;
  }

  const { from, to } = getSignatureRange();
  const selectedSeries = getSignatureChartSelection();

  SIGNATURE_CHART_SERIES.forEach((series, index) => {
    const dataset = signatureChart.data.datasets[index];
    if (!dataset) {
      return;
    }

    const visible = getSignatureSeriesCheckboxState(series.key);
    dataset.hidden = !visible;
    dataset.borderWidth = selectedSeries === series.key ? 3 : 2;
    dataset.pointRadius = selectedSeries === series.key ? 1.5 : 0;
  });

  signatureChart.options.scales.x.min = from;
  signatureChart.options.scales.x.max = to;

  if (update) {
    signatureChart.update('none');
  }
}

function updateSignatureValueReadout() {
  const selectedSeries = getSignatureChartSelection();
  const rows = getVisibleSignatureRows();
  const latestRow = [...rows].reverse().find((row) => Number.isFinite(row[selectedSeries]));

  setSignatureText('settings-signature-x-value', latestRow ? String(latestRow.xValue) : '0');
  setSignatureText('settings-signature-y-value', latestRow ? String(latestRow[selectedSeries]) : '0');
}

function exportSignatureGraphData() {
  const config = getActiveSignatureModeConfig();
  const rows = getVisibleSignatureRows();
  if (!rows.length) {
    log({ signature_export: 'No signature samples available to export.' });
    return;
  }

  const xColumn = isHornSignatureMode() ? 'frequency' : 'timeMs';
  const columns = [xColumn, ...config.series.filter((column) => column !== xColumn)];
  const csv = [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => row[column] ?? '').join(','))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${config.exportPrefix}-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  log({ signature_export: { rows: rows.length, range: getSignatureRange() } });
}

function resetSignatureControls() {
  const config = getActiveSignatureModeConfig();
  const availableSeries = new Set(config.series);
  const defaults = getDefaultSignatureRange();
  const drawFrom = $('settings-signature-draw-from');
  const drawTo = $('settings-signature-draw-to');
  const selection = $('settings-signature-graph-selection');

  if (drawFrom) {
    drawFrom.value = String(defaults.from);
  }

  if (drawTo) {
    drawTo.value = String(defaults.to);
  }

  if (selection) {
    selection.value = config.defaultSelection;
  }

  SIGNATURE_CHART_SERIES.forEach((series) => {
    const checkbox = $(series.checkboxId);
    if (checkbox) {
      checkbox.checked = availableSeries.has(series.key);
    }
  });

  syncSignatureChartPresentation();
  updateSignatureValueReadout();
}

async function runSignatureAction(action) {
  try {
    const res = await window.api?.dcx?.control?.({ action });
    log({ signature_action: action, res });

    if (!res?.success) {
      showFooterFeedback(`${action.toUpperCase()} failed: ${res?.error || res?.message || 'Operation failed'}`, { tone: 'error', timeout: 8000 });
    }

    return res;
  } catch (error) {
    log({ signature_action_error: action, error: error.message });
    showFooterFeedback(`${action.toUpperCase()} failed: ${error.message}`, { tone: 'error', timeout: 8000 });
    return { success: false, error: error.message };
  }
}

async function startHornScanCapture() {
  console.log('[UI HORN SCAN] startHornScanCapture()', {
    hornScanRunning: runtimeState.hornScanRunning,
    activeSettingsTab,
    activeSignatureMode,
    timestamp: Date.now()
  });
  resetHornScanProgress();
  setHornScanRunning(true);
  setHornScanUiProgress('running');
  clearWeldGraphMetadata();
  clearHornScanMetadata();
  showFooterFeedback('Horn scan started. Background polling is paused until it finishes.', { tone: 'info', timeout: 4000 });

  try {
    const res = await window.api?.dcx?.runHornScan?.();
    console.log('[UI HORN SCAN] runHornScan() result:', {
      success: !!res?.success,
      error: res?.error ?? null,
      message: res?.message ?? null,
      start: res?.raw?.start ?? null,
      pollCount: Number.isFinite(Number(res?.pollCount)) ? Number(res.pollCount) : null
    });
    log({
      horn_scan_start_response: {
        raw: res?.raw?.start ?? null,
        code: res?.startState?.code ?? null,
        payload: res?.startState?.payload ?? null,
        error: res?.error ?? null,
        message: res?.message ?? null
      }
    });
    log({ horn_scan: summarizeCaptureResult(res) });

    if (!res?.success) {
      if (res?.aborted) {
        setHornScanUiProgress('aborted');
        showFooterFeedback(res?.message || 'Horn scan aborted.', { tone: 'info', timeout: 5000 });
        return;
      }

      setHornScanUiProgress('failed');
      showFooterFeedback(`Horn scan failed: ${res?.error || res?.message || 'Operation failed'}`, { tone: 'error', timeout: 8000 });
      return;
    }

    applyHornScanMetadata(res);
    hornScanProgressPercent = 100;
    hornScanProgressMessage = res?.message || 'Horn scan complete';
    const appliedSamples = applyHornScanSamples(res.samples);
    if (appliedSamples) {
      const { from, to } = getDefaultSignatureRange();
      setSignatureInputValue('settings-signature-draw-from', from);
      setSignatureInputValue('settings-signature-draw-to', to);
      syncSignatureChartPresentation();
    }

    refreshSignatureSummary(runtimeState.lastTelemetry);
    updateSignatureValueReadout();
    setHornScanUiProgress('passed');
    showFooterFeedback(
      appliedSamples
        ? `Horn scan complete. Loaded ${signatureSamples.length} samples.`
        : (res?.message || 'Horn scan complete.'),
      { tone: 'success', timeout: 5000 }
    );
  } catch (error) {
    log({ horn_scan_error: error.message });
    setHornScanUiProgress('failed');
    showFooterFeedback(`Horn scan failed: ${error.message}`, { tone: 'error', timeout: 8000 });
  } finally {
    setHornScanRunning(false);
    refreshSignatureSummary(runtimeState.lastTelemetry);
    updateSignatureValueReadout();
  }
}

async function abortHornScanCapture() {
  if (!runtimeState.hornScanRunning) {
    return;
  }

  if (typeof window.api?.dcx?.abortHornScan !== 'function') {
    showFooterFeedback('Horn scan abort is not available in this build.', { tone: 'error', timeout: 8000 });
    return;
  }

  setHornScanUiProgress('aborting');
  hornScanProgressMessage = 'Aborting horn scan';

  try {
    const res = await window.api.dcx.abortHornScan();
    log({ horn_scan_abort: res });

    if (!res?.success) {
      setHornScanUiProgress('running');
      showFooterFeedback(`Abort horn scan failed: ${res?.error || res?.message || 'Operation failed'}`, { tone: 'error', timeout: 8000 });
      return;
    }

    showFooterFeedback(res?.message || 'Horn scan abort requested.', { tone: 'info', timeout: 4000 });
  } catch (error) {
    log({ horn_scan_abort_error: error.message });
    setHornScanUiProgress('running');
    showFooterFeedback(`Abort horn scan failed: ${error.message}`, { tone: 'error', timeout: 8000 });
  }
}

async function handleSignatureSecondaryAction() {
  if (isHornSignatureMode()) {
    await abortHornScanCapture();
    return;
  }

  await runSignatureAction('resetOverload');
}

async function startWeldGraphCapture() {
  console.log('[UI WELD GRAPH] startWeldGraphCapture()', {
    hornScanRunning: runtimeState.hornScanRunning,
    activeSettingsTab,
    activeSignatureMode,
    timestamp: Date.now()
  });
  setHornScanRunning(true);
  clearWeldGraphMetadata();
  clearHornScanMetadata();
  showFooterFeedback('Loading weld graph from the DCX over Ethernet.', { tone: 'info', timeout: 4000 });

  try {
    const res = await window.api?.dcx?.runWeldGraph?.();
    console.log('[UI WELD GRAPH] runWeldGraph() result:', {
      success: !!res?.success,
      error: res?.error ?? null,
      message: res?.message ?? null,
      start: res?.raw?.start ?? null,
      sampleCount: Array.isArray(res?.samples) ? res.samples.length : null
    });
    log({ weld_graph: summarizeCaptureResult(res) });

    if (!res?.success) {
      showFooterFeedback(`Weld graph load failed: ${res?.error || res?.message || 'Operation failed'}`, { tone: 'error', timeout: 8000 });
      return;
    }

    applyWeldGraphMetadata(res);
    const appliedSamples = applyHornScanSamples(res.samples);
    if (appliedSamples) {
      const { from, to } = getDefaultSignatureRange();
      setSignatureInputValue('settings-signature-draw-from', from);
      setSignatureInputValue('settings-signature-draw-to', to);
      syncSignatureChartPresentation();
    }

    refreshSignatureSummary(runtimeState.lastTelemetry);
    updateSignatureValueReadout();
    showFooterFeedback(
      appliedSamples
        ? `Weld graph loaded. ${signatureSamples.length} samples available.`
        : (res?.message || 'Weld graph loaded.'),
      { tone: 'success', timeout: 5000 }
    );
  } catch (error) {
    log({ weld_graph_error: error.message });
    showFooterFeedback(`Weld graph load failed: ${error.message}`, { tone: 'error', timeout: 8000 });
  } finally {
    setHornScanRunning(false);
    refreshSignatureSummary(runtimeState.lastTelemetry);
    updateSignatureValueReadout();
  }
}

async function startActiveSignatureCapture() {
  if (runtimeState.hornScanRunning) {
    return;
  }

  const config = getActiveSignatureModeConfig();
  clearSignatureAutoStopTimer();
  signatureSamples = [];
  rebuildSignatureChart();
  refreshSignatureSummary(runtimeState.lastTelemetry);
  updateSignatureValueReadout();

  if (activeSignatureMode === 'hornSignature' && typeof window.api?.dcx?.runHornScan === 'function') {
    await startHornScanCapture();
    return;
  }

  if (activeSignatureMode === 'weldData' && typeof window.api?.dcx?.runWeldGraph === 'function') {
    await startWeldGraphCapture();
    return;
  }

  const res = await runSignatureAction(config.action);
  if (!res?.success) {
    return;
  }

  if (config.action === 'start') {
    signatureAutoStopTimer = window.setTimeout(() => {
      runSignatureAction('stop');
      signatureAutoStopTimer = null;
    }, WELD_DATA_CAPTURE_MS);
  }
}

function rebuildSignatureChart() {
  if (!signatureChart) {
    return;
  }

  const firstTimestamp = signatureSamples[0]?.timestamp || Date.now();
  const hornSignatureMode = isHornSignatureMode();
  SIGNATURE_CHART_SERIES.forEach((series, index) => {
    const dataset = signatureChart.data.datasets[index];
    if (!dataset) {
      return;
    }

    dataset.label = t(series.labelKey, series.fallback);
    dataset.data = signatureSamples
      .map((sample) => {
        const xValue = getSignatureXAxisValue(sample, firstTimestamp);
        const yValue = sample[series.field];
        if (!Number.isFinite(xValue) || !Number.isFinite(Number(yValue))) {
          return null;
        }

        return {
          x: xValue,
          y: yValue
        };
      })
      .filter(Boolean);
  });

  signatureChart.options.scales.x.title.text = hornSignatureMode
    ? `${t('chart.axis.frequency', 'Frequency')} (Hz)`
    : `${t('chart.axis.time', 'Time')} (ms)`;
  signatureChart.options.scales.y.display = !hornSignatureMode;
  signatureChart.options.scales.y.title.text = `${t('chart.axis.frequency', 'Frequency')} (Hz)`;
  signatureChart.options.scales.y1.title.text = hornSignatureMode
    ? t('settings.signature.amplitudeScale', 'Amplitude (%)')
    : t('settings.signature.percentScale', 'Amplitude / Power (%)');
  signatureChart.options.scales.y2.title.text = t('settings.signature.phaseScale', 'Phase (deg)');
  signatureChart.options.scales.y3.title.text = t('settings.signature.currentScale', 'Current');
  syncSignatureChartPresentation();
}

function clearSignatureChart() {
  clearSignatureAutoStopTimer();
  resetHornScanProgress();
  clearWeldGraphMetadata();
  clearHornScanMetadata();
  signatureSamples = [];
  if (isHornSignatureMode() && !runtimeState.hornScanRunning) {
    setHornScanUiProgress('idle');
  }
  rebuildSignatureChart();
  refreshSignatureSummary(runtimeState.lastTelemetry);
  updateSignatureValueReadout();
}

function shouldCaptureSignature(telemetry = {}) {
  if (runtimeState.status !== 'online') {
    return false;
  }

  const resolvedTelemetry = getResolvedTelemetry(telemetry);

  return activeSignatureMode === 'hornSignature'
    ? Boolean(runtimeState.hornScanRunning || resolvedTelemetry.seek)
    : Boolean(resolvedTelemetry.active);
}

function appendSignatureSample(telemetry = {}) {
  if (!signatureChart || !shouldCaptureSignature(telemetry)) {
    return;
  }

  const frequency = Number(telemetry.frequency);
  const power = Number(telemetry.power);
  if (!Number.isFinite(frequency) && !Number.isFinite(power)) {
    return;
  }

  signatureSamples.push({
    timestamp: Date.now(),
    frequency: Number.isFinite(frequency) ? frequency : null,
    power: Number.isFinite(power) ? power : null,
    phase: Number.isFinite(Number(telemetry.phase)) ? Number(telemetry.phase) : null,
    current: Number.isFinite(Number(telemetry.current)) ? Number(telemetry.current) : null,
    amplitude: Number.isFinite(Number(telemetry.amplitude)) ? Number(telemetry.amplitude) : null,
    pwmAmplitude: Number.isFinite(Number(telemetry.pwmAmplitude)) ? Number(telemetry.pwmAmplitude) : null
  });

  while (
    signatureSamples.length > MAX_SIGNATURE_SAMPLES
    || (
      activeSignatureMode === 'weldData'
      && signatureSamples.length > 1
      && signatureSamples.at(-1).timestamp - signatureSamples[0].timestamp > WELD_DATA_CAPTURE_MS
    )
  ) {
    signatureSamples.shift();
  }

  rebuildSignatureChart();
}

function refreshSignatureSummary(telemetry = runtimeState.lastTelemetry || {}) {
  const resolvedTelemetry = getResolvedTelemetry(telemetry);
  const liveFrequency = Number(telemetry.frequency);
  const livePower = Number(telemetry.power);
  const liveCurrent = Number(telemetry.current);
  const liveAmplitude = Number(telemetry.amplitude);
  const hornSignatureMode = isHornSignatureMode();
  const weldFrequencySummary = hornSignatureMode ? null : getWeldGraphSummaryValue('frequency');
  const weldMemorySummary = hornSignatureMode ? null : getWeldGraphSummaryValue('memory');
  const weldPowerSummary = hornSignatureMode ? null : getWeldGraphSummaryValue('power');
  const weldAmplitudeSummary = hornSignatureMode ? null : getWeldGraphSummaryValue('amplitude');
  const latestFrequency = getLatestSignatureSampleValue('frequency');
  const latestPower = getLatestSignatureSampleValue('power');
  const latestCurrent = getLatestSignatureSampleValue('current');
  const latestAmplitude = getLatestSignatureSampleValue('amplitude');
  const frequency = hornSignatureMode
    ? (getPrimaryHornScanResonanceValue('series') ?? latestFrequency ?? (Number.isFinite(liveFrequency) ? liveFrequency : null))
    : (weldFrequencySummary ?? latestFrequency ?? (Number.isFinite(liveFrequency) ? liveFrequency : null));
  const power = hornSignatureMode
    ? (latestCurrent ?? normalizeSignatureSampleValue(hornScanPreset?.currentPercent) ?? (Number.isFinite(liveCurrent) ? liveCurrent : null))
    : (weldPowerSummary ?? latestPower ?? (Number.isFinite(livePower) ? livePower : null));
  const amplitude = hornSignatureMode
    ? (latestAmplitude ?? normalizeSignatureSampleValue(hornScanPreset?.amplitudePercent) ?? (Number.isFinite(liveAmplitude) ? liveAmplitude : null))
    : (weldAmplitudeSummary ?? latestAmplitude ?? (Number.isFinite(liveAmplitude) ? liveAmplitude : null));
  const expectedPointCount = hornSignatureMode ? getHornScanExpectedPointCount() : MAX_SIGNATURE_SAMPLES;
  const memoryRatio = hornSignatureMode
    ? (expectedPointCount ? signatureSamples.length / expectedPointCount : (signatureSamples.length ? 1 : 0))
    : getWeldGraphMemoryRatio(weldMemorySummary);
  const frequencyRatio = Number.isFinite(frequency) ? clamp((frequency - 39000) / 2000, 0, 1) : 0;
  const powerRatio = Number.isFinite(power) ? clamp(power / 100, 0, 1) : 0;
  const amplitudeRatio = Number.isFinite(amplitude) ? clamp(amplitude / 100, 0, 1) : 0;
  const memoryText = hornSignatureMode
    ? (expectedPointCount ? `${signatureSamples.length}/${expectedPointCount}` : `${signatureSamples.length} pts`)
    : (Number.isFinite(weldMemorySummary) ? String(Math.round(weldMemorySummary)) : String(signatureSamples.length));

  setSignatureText('settings-signature-frequency', Number.isFinite(frequency) ? String(Math.round(frequency)) : '--');
  setSignatureText('settings-signature-power', Number.isFinite(power) ? String(Math.round(power)) : '--');
  setSignatureText('settings-signature-amplitude', Number.isFinite(amplitude) ? String(Math.round(amplitude)) : '--');
  setSignatureText('settings-signature-memory', memoryText);

  setSignatureMeterFill('settings-signature-meter-frequency', frequencyRatio);
  setSignatureMeterFill('settings-signature-meter-memory', memoryRatio);
  setSignatureMeterFill('settings-signature-meter-amplitude', amplitudeRatio);
  setSignatureMeterFill('settings-signature-meter-power', powerRatio);

  setSignatureIndicatorState('settings-signature-status-run', { active: Boolean(resolvedTelemetry.active) });
  setSignatureIndicatorState('settings-signature-status-seek', { active: Boolean(runtimeState.hornScanRunning || resolvedTelemetry.seek) });
  setSignatureIndicatorState('settings-signature-result-stored', {
    active: Number.isFinite(weldMemorySummary)
      ? weldMemorySummary > 0
      : signatureSamples.length > 0
  });
  setSignatureIndicatorState('settings-signature-result-overload', {
    active: !resolvedTelemetry.alarm,
    alert: Boolean(resolvedTelemetry.alarm)
  });

  const canControl = String(runtimeState.status || 'offline').toLowerCase() === 'online';
  const startButton = $('settings-signature-start-btn');
  const resetButton = $('settings-signature-reset-btn');
  if (startButton) {
    startButton.disabled = !canControl || runtimeState.hornScanRunning;
  }
  if (resetButton) {
    resetButton.disabled = isHornSignatureMode()
      ? (!canControl || !runtimeState.hornScanRunning)
      : (!canControl || runtimeState.hornScanRunning);
  }
}

function appendAlarmLogEntry(stateLabel, detail) {
  const body = $('alarm-log-body');
  const shell = $('alarm-log-table-shell');
  if (!body) {
    return;
  }

  if (alarmEventCount === 0) {
    body.innerHTML = '';
  }

  const row = document.createElement('tr');
  const timeCell = document.createElement('td');
  const stateCell = document.createElement('td');
  const detailCell = document.createElement('td');

  timeCell.className = 'data-table-nowrap';
  stateCell.className = 'font-semibold';
  detailCell.className = 'text-muted-foreground';

  timeCell.textContent = new Date().toLocaleTimeString();
  stateCell.textContent = stateLabel;
  detailCell.textContent = detail;

  row.append(timeCell, stateCell, detailCell);
  body.appendChild(row);
  alarmEventCount += 1;

  if (shell) {
    shell.scrollTop = shell.scrollHeight;
  }
}

function maybeRecordAlarmEvent(telemetry = runtimeState.lastTelemetry || {}) {
  const resolvedTelemetry = getResolvedTelemetry(telemetry);
  const nextAlarmState = Boolean(resolvedTelemetry.alarm);
  if (nextAlarmState === previousAlarmState) {
    return;
  }

  previousAlarmState = nextAlarmState;
  const detail = `Frequency ${telemetry.frequency ?? '--'} Hz · Power ${telemetry.power ?? '--'} %`;
  appendAlarmLogEntry(
    nextAlarmState ? t('settings.alarms.active', 'ACTIVE') : t('settings.alarms.cleared', 'CLEAR'),
    detail
  );
}

function initializeSignatureChart() {
  const canvas = $('settings-signature-chart');
  if (!canvas || signatureChart) {
    return;
  }

  signatureChart = new Chart(canvas, {
    type: 'line',
    data: {
      datasets: SIGNATURE_CHART_SERIES.map((series) => ({
        label: t(series.labelKey, series.fallback),
        data: [],
        borderColor: series.color,
        backgroundColor: series.color,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.2,
        yAxisID: series.axis
      }))
    },
    options: {
      animation: false,
      maintainAspectRatio: false,
      parsing: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: DEFAULT_SIGNATURE_DRAW_FROM,
          max: DEFAULT_SIGNATURE_DRAW_TO,
          title: {
            display: true,
            color: '#cbd5e1',
            text: `${t('chart.axis.time', 'Time')} (ms)`
          },
          ticks: {
            color: '#94a3b8',
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.08)'
          }
        },
        y: {
          type: 'linear',
          title: {
            display: true,
            color: '#cbd5e1',
            text: `${t('chart.axis.frequency', 'Frequency')} (Hz)`
          },
          ticks: {
            color: '#cbd5e1'
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.08)'
          }
        },
        y1: {
          type: 'linear',
          position: 'right',
          min: 0,
          max: 100,
          title: {
            display: true,
            color: '#cbd5e1',
            text: t('settings.signature.percentScale', 'Amplitude / Power (%)')
          },
          ticks: {
            color: '#cbd5e1'
          },
          grid: {
            drawOnChartArea: false,
            color: 'rgba(148, 163, 184, 0.08)'
          }
        },
        y2: {
          type: 'linear',
          position: 'left',
          display: true,
          title: {
            display: false,
            color: '#cbd5e1',
            text: t('settings.signature.phaseScale', 'Phase (deg)')
          },
          ticks: {
            color: '#a1a1aa',
            display: false
          },
          grid: {
            drawOnChartArea: false,
            color: 'rgba(148, 163, 184, 0.06)'
          }
        },
        y3: {
          type: 'linear',
          position: 'right',
          display: true,
          title: {
            display: false,
            color: '#cbd5e1',
            text: t('settings.signature.currentScale', 'Current')
          },
          ticks: {
            color: '#a1a1aa',
            display: false
          },
          grid: {
            drawOnChartArea: false,
            color: 'rgba(148, 163, 184, 0.06)'
          }
        }
      }
    }
  });

  rebuildSignatureChart();
}

function bindSignatureControls() {
  const buttonBindings = [
    ['settings-signature-start-btn', startActiveSignatureCapture],
    ['settings-signature-reset-btn', handleSignatureSecondaryAction],
    ['settings-signature-update-graph-btn', () => {
      syncSignatureChartPresentation();
      updateSignatureValueReadout();
    }],
    ['settings-signature-export-btn', exportSignatureGraphData],
    ['clear-settings-signature-chart-btn', clearSignatureChart],
    ['settings-signature-default-btn', resetSignatureControls],
    ['settings-signature-update-value-btn', updateSignatureValueReadout]
  ];

  buttonBindings.forEach(([id, handler]) => {
    const element = $(id);
    if (!element || element.dataset.bound === 'true') {
      return;
    }

    element.dataset.bound = 'true';
    element.addEventListener('click', handler);
  });

  ['settings-signature-draw-from', 'settings-signature-draw-to', 'settings-signature-graph-selection'].forEach((id) => {
    const element = $(id);
    if (!element || element.dataset.bound === 'true') {
      return;
    }

    element.dataset.bound = 'true';
    element.addEventListener('change', () => {
      syncSignatureChartPresentation();
      updateSignatureValueReadout();
    });
  });

  document.querySelectorAll('[data-signature-series]').forEach((input) => {
    if (input.dataset.bound === 'true') {
      return;
    }

    input.dataset.bound = 'true';
    input.addEventListener('change', () => {
      syncSignatureChartPresentation();
      updateSignatureValueReadout();
    });
  });

  document.querySelectorAll('[data-signature-mode]').forEach((button) => {
    if (button.dataset.bound === 'true') {
      return;
    }

    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      setActiveSignatureMode(button.dataset.signatureMode || 'weldData');
    });
  });
}

export function initializeSettingsPage() {
  if (!hornScanProgressSubscriptionActive && typeof window.api?.dcx?.onHornScanProgress === 'function') {
    hornScanProgressSubscriptionActive = true;
    window.api.dcx.onHornScanProgress((progress) => {
      document.dispatchEvent(new CustomEvent('app:horn-scan-progress', {
        detail: progress || {}
      }));
    });
  }

  bindSettingsTabs();
  setActiveSettingsTab(activeSettingsTab);
  initializeSignatureChart();
  bindSetupControls();
  bindSignatureControls();
  setActiveSignatureMode(activeSignatureMode, { clearGraph: false });
  applySetupConfiguration(runtimeState.setupConfig || {}, runtimeState.setupMetadata || {}, { persist: false });
  renderSystemInfo(runtimeState.systemInfo);
  refreshIoSummary();
  renderHornScanStatusUi();
  refreshSignatureSummary(runtimeState.lastTelemetry);
  updateSignatureValueReadout();
  previousAlarmState = Boolean(getResolvedTelemetry(runtimeState.lastTelemetry || {}).alarm);

  document.addEventListener('app:telemetry-updated', (event) => {
    const telemetry = event.detail || runtimeState.lastTelemetry || {};
    refreshIoSummary({ telemetry });
    appendSignatureSample(telemetry);
    refreshSignatureSummary(telemetry);
    updateSignatureValueReadout();
    maybeRecordAlarmEvent(telemetry);
  });

  document.addEventListener('app:status-updated', () => {
    syncIoPollingState();

    if (canLoadSetupConfiguration()) {
      loadSetupConfiguration();
      return;
    }

    setupLoaded = false;
  });

  document.addEventListener('app:view-changed', () => {
    syncIoPollingState();
    refreshSystemInfoTab();
  });

  document.addEventListener('app:horn-scan-state', () => {
    syncIoPollingState();
    refreshSignatureSummary(runtimeState.lastTelemetry);
    updateSignatureValueReadout();
  });

  document.addEventListener('app:horn-scan-progress', (event) => {
    applyHornScanProgress(event.detail || {});
  });

  document.addEventListener('app:system-info-updated', (event) => {
    renderSystemInfo(event.detail || runtimeState.systemInfo || {});
  });

  document.addEventListener('app:language-changed', () => {
    rebuildSignatureChart();
    setActiveSignatureMode(activeSignatureMode, { clearGraph: false });
    applySetupConfiguration(runtimeState.setupConfig || {}, runtimeState.setupMetadata || {}, { persist: false });
    renderSystemInfo(runtimeState.systemInfo);
    renderHornScanStatusUi();
    refreshSignatureSummary(runtimeState.lastTelemetry);
    updateSignatureValueReadout();
  });

  syncIoPollingState();
  loadSetupDefaults();
  if (canLoadSetupConfiguration()) {
    loadSetupConfiguration({ force: true });
  }
}
