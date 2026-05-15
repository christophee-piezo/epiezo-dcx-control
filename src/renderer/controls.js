import { $, getTimeline, runtimeState } from './runtime.js';
import { log } from './logger.js';
import { t } from './preferences.js';
import { initSequenceLibrary, syncSequenceEditorUi } from './sequence-library.js';
import { normalizeConnectionConfig, toggleConnectionSettings } from './serial.js';
import { getResolvedTelemetry, hideConnectionFailurePopup, refreshRealtimeDataDisplay, shouldUseSetupRealtimeData, showConnectionFailurePopup, showFooterFeedback, updateStatus, updateTelemetry } from './status-ui.js';
import { clearSequencerTimeline } from './timeline-ui.js';
import { initWorkflowLibrary, loadWorkflowDraft, syncWorkflowEditorFeedback } from './workflow-library.js';

let sequenceRunning = false;
let lastHeartbeatLogSignature = null;
let dashboardIoTimer = null;
let dashboardIoBusy = false;
let dashboardSetupTimer = null;
let dashboardSetupBusy = false;
let lastDashboardSetupError = null;

const DASHBOARD_IO_POLL_MS = 250;
const DASHBOARD_SETUP_POLL_MS = 10;
const ACTIVE_IO_OUTPUT_PINS = ['PIN8', 'PIN10'];

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

function isIoOutputActive(pin) {
  const ioEntry = runtimeState.ioSnapshot?.entries?.[pin] || null;
  const ioState = getIoDigitalState(ioEntry);
  return ioState == null ? false : ioState;
}

function getModeSwitchBlockedMessage(action = 'switch') {
  return action === 'disconnect'
    ? 'Stop sonics, seek, or scan before disconnecting.'
    : 'Stop sonics, seek, or scan before switching modes.';
}

function isManualControlActive() {
  const telemetry = getResolvedTelemetry(runtimeState.lastTelemetry || {});

  return Boolean(
    runtimeState.hornScanRunning
    ||
    telemetry.active
    || telemetry.seek
    || ACTIVE_IO_OUTPUT_PINS.some((pin) => isIoOutputActive(pin))
  );
}

function isBransonRunIndicatorActive() {
  if (!isOnline()) {
    return false;
  }

  const telemetry = getResolvedTelemetry(runtimeState.lastTelemetry || {});

  if (runtimeState.connections?.ethernet) {
    return ACTIVE_IO_OUTPUT_PINS.some((pin) => isIoOutputActive(pin));
  }

  return Boolean(telemetry.active || telemetry.seek);
}

function isExecutionActive() {
  return Boolean(sequenceRunning || runtimeState.workflowRunning || runtimeState.hornScanRunning || isManualControlActive());
}

function isHeartbeatRunActive(telemetry = {}) {
  const resolvedTelemetry = getResolvedTelemetry(telemetry);
  return Boolean(sequenceRunning || runtimeState.workflowRunning || runtimeState.hornScanRunning || resolvedTelemetry.active || resolvedTelemetry.seek);
}

function getHeartbeatLogSignature(status = {}, telemetry = {}) {
  const resolvedTelemetry = getResolvedTelemetry(telemetry);

  return JSON.stringify({
    status: status?.status ?? 'offline',
    simulation: Boolean(status?.simulation || status?.config?.simulation),
    active: Boolean(resolvedTelemetry.active),
    seek: Boolean(resolvedTelemetry.seek),
    alarm: Boolean(resolvedTelemetry.alarm),
    deviceStatus: telemetry?.deviceStatus || ''
  });
}

function isOnline() {
  return String(runtimeState.status || 'offline').toLowerCase() === 'online';
}

function applyDashboardAmplitudeRange() {
  const amplitudeInput = $('amplitude-input');
  const amplitudeRange = $('amplitude-input-range');
  const metadata = runtimeState.setupMetadata?.weldAmp || {};
  const hasMin = metadata.min != null && metadata.min !== '';
  const hasMax = metadata.max != null && metadata.max !== '';

  if (amplitudeInput) {
    if (hasMin) {
      amplitudeInput.min = String(metadata.min);
    } else {
      amplitudeInput.removeAttribute('min');
    }

    if (hasMax) {
      amplitudeInput.max = String(metadata.max);
    } else {
      amplitudeInput.removeAttribute('max');
    }
  }

  if (amplitudeRange) {
    amplitudeRange.textContent = hasMin && hasMax
      ? t('settings.setup.rangeIndicator', 'Range: {min} to {max}')
        .replace('{min}', String(metadata.min))
        .replace('{max}', String(metadata.max))
      : '';
  }
}

function canPollDashboardSetup() {
  return runtimeState.currentView === 'dashboard'
    && !runtimeState.hornScanRunning
    && typeof window.api?.dcx?.getSetup === 'function'
    && shouldUseSetupRealtimeData(runtimeState.lastTelemetry || {});
}

function stopDashboardSetupPolling() {
  if (dashboardSetupTimer) {
    window.clearInterval(dashboardSetupTimer);
    dashboardSetupTimer = null;
  }

  dashboardSetupBusy = false;
  lastDashboardSetupError = null;
  refreshRealtimeDataDisplay(runtimeState.lastTelemetry || {});
  applyDashboardAmplitudeRange();
}

async function pollDashboardSetupReadback() {
  if (dashboardSetupBusy || !canPollDashboardSetup()) {
    return;
  }

  dashboardSetupBusy = true;

  try {
    const res = await window.api.dcx.getSetup();
    if (!res?.success || !shouldUseSetupRealtimeData(runtimeState.lastTelemetry || {})) {
      return;
    }

    runtimeState.setupConfig = res.settings && typeof res.settings === 'object'
      ? { ...runtimeState.setupConfig, ...res.settings }
      : runtimeState.setupConfig;
    runtimeState.setupMetadata = res.metadata && typeof res.metadata === 'object'
      ? { ...runtimeState.setupMetadata, ...res.metadata }
      : runtimeState.setupMetadata;

    refreshRealtimeDataDisplay(runtimeState.lastTelemetry || {});
    applyDashboardAmplitudeRange();
    lastDashboardSetupError = null;
  } catch (error) {
    if (lastDashboardSetupError !== error.message) {
      log({ dashboard_setup_error: error.message });
      lastDashboardSetupError = error.message;
    }
  } finally {
    dashboardSetupBusy = false;
  }
}

function syncDashboardSetupPollingState() {
  if (!canPollDashboardSetup()) {
    stopDashboardSetupPolling();
    return;
  }

  if (dashboardSetupTimer) {
    return;
  }

  pollDashboardSetupReadback();
  dashboardSetupTimer = window.setInterval(pollDashboardSetupReadback, DASHBOARD_SETUP_POLL_MS);
}

function canPollDashboardIoIndicators() {
  return runtimeState.currentView === 'dashboard'
    && !runtimeState.hornScanRunning
    && !runtimeState.simulation
    && Boolean(runtimeState.connections?.ethernet)
    && typeof window.api?.dcx?.getIoBootstrapSnapshot === 'function';
}

function stopDashboardIoPolling({ clearSnapshot = false } = {}) {
  if (dashboardIoTimer) {
    window.clearInterval(dashboardIoTimer);
    dashboardIoTimer = null;
  }

  dashboardIoBusy = false;

  if (clearSnapshot) {
    runtimeState.ioSnapshot = null;
    updateTelemetry(runtimeState.lastTelemetry || {});
  }
}

async function pollDashboardIoIndicators() {
  if (dashboardIoBusy || !canPollDashboardIoIndicators()) {
    return;
  }

  dashboardIoBusy = true;

  try {
    const ioSnapshot = await window.api.dcx.getIoBootstrapSnapshot();
    if (!ioSnapshot?.success) {
      return;
    }

    runtimeState.ioSnapshot = ioSnapshot;
    updateTelemetry(runtimeState.lastTelemetry || {});
  } catch (error) {
    log({ dashboard_io_error: error.message });
  } finally {
    dashboardIoBusy = false;
  }
}

function syncDashboardIoPollingState() {
  if (!canPollDashboardIoIndicators()) {
    stopDashboardIoPolling({ clearSnapshot: !runtimeState.connections?.ethernet || runtimeState.simulation });
    return;
  }

  if (dashboardIoTimer) {
    return;
  }

  pollDashboardIoIndicators();
  dashboardIoTimer = window.setInterval(pollDashboardIoIndicators, DASHBOARD_IO_POLL_MS);
}

function syncModeSwitchUiState() {
  const executionActive = isExecutionActive();
  const modeSwitchBusy = Boolean(runtimeState.modeSwitchBusy);
  const bransonRunIndicatorActive = isBransonRunIndicatorActive();
  const element = $('sim-mode-toggle');
  const startButton = $('connect-dcx-btn');
  const stopButton = $('disconnect-dcx-btn');
  const selectedSimulationMode = element ? element.value === 'true' : Boolean(runtimeState.selectedSimulationMode);
  const activeSelection = isOnline() && Boolean(runtimeState.simulation) === selectedSimulationMode;

  if (element) {
    element.disabled = modeSwitchBusy || executionActive;
  }

  if (startButton) {
    startButton.disabled = modeSwitchBusy || executionActive || activeSelection;
  }

  if (stopButton) {
    stopButton.disabled = modeSwitchBusy || !isOnline() || bransonRunIndicatorActive;
  }

  syncDashboardIoPollingState();
  syncDashboardSetupPollingState();
}

function updateWorkflowFileLabel() {
  const label = $('workflow-file-name');
  if (!label) return;

  if (!runtimeState.workflowFileName) {
    label.textContent = t('workflow.file.none', 'No script loaded');
    return;
  }

  label.textContent = t('workflow.file.loaded', 'Loaded: {name}').replace('{name}', runtimeState.workflowFileName);
}

function formatWorkflowStatus(status = {}) {
  if (status.error) {
    return `${t('workflow.status.error', 'ERROR')}: ${status.error}`;
  }

  if (status.state === 'running' && status.currentLine && status.totalLines && status.command) {
    return t('workflow.status.line', 'LINE {current}/{total} · {command}')
      .replace('{current}', String(status.currentLine))
      .replace('{total}', String(status.totalLines))
      .replace('{command}', status.command);
  }

  const messageKey = {
    PREPARING: 'workflow.status.preparing',
    STOPPING: 'workflow.status.stopping',
    COMPLETED: 'workflow.status.completed',
    STOPPED: 'workflow.status.stopped',
    ERROR: 'workflow.status.error',
    IDLE: 'workflow.status.idle'
  }[status.message || 'IDLE'];

  return messageKey ? t(messageKey, status.message || 'IDLE') : status.message || t('workflow.status.idle', 'IDLE');
}

function syncWorkflowUiLockState() {
  const workflowRunning = Boolean(runtimeState.workflowRunning);
  const executionActive = Boolean(workflowRunning || sequenceRunning || runtimeState.hornScanRunning);
  const workflowStopButton = $('stop-workflow-btn');
  const workflowRunButton = $('run-workflow-btn');
  const workflowLoadButton = $('load-workflow-btn');
  const workflowSaveButton = $('save-workflow-btn');
  const workflowTextarea = $('workflow-text');

  if (workflowStopButton) {
    workflowStopButton.disabled = !workflowRunning;
  }

  if (workflowRunButton) {
    workflowRunButton.disabled = executionActive;
  }

  if (workflowLoadButton) {
    workflowLoadButton.disabled = executionActive;
  }

  if (workflowSaveButton) {
    workflowSaveButton.disabled = executionActive;
  }

  if (workflowTextarea) {
    workflowTextarea.disabled = executionActive;
  }

  const workflowName = $('workflow-name');
  if (workflowName) {
    workflowName.disabled = executionActive;
  }

  const workflowLibrarySave = $('save-workflow-library-btn');
  if (workflowLibrarySave) {
    workflowLibrarySave.disabled = executionActive;
  }

  document.querySelectorAll('[data-workflow-action], [data-example-id]').forEach((element) => {
    element.disabled = executionActive;
  });

  ['start-btn', 'seek-btn', 'reset-btn', 'amplitude-input'].forEach((id) => {
    const element = $(id);
    if (!element) return;

    element.disabled = executionActive;
  });

  const runSequenceButton = $('run-sequence-btn');
  if (runSequenceButton) {
    runSequenceButton.disabled = executionActive;
  }

  const clearTimelineButton = $('clear-timeline-btn');
  if (clearTimelineButton) {
    clearTimelineButton.disabled = executionActive;
  }

  ['seq-auto-abort', 'seq-loop-count', 'seq-name'].forEach((id) => {
    const element = $(id);
    if (!element) return;

    element.disabled = executionActive;
  });

  syncSequenceEditorUi(executionActive);
  syncModeSwitchUiState();
}

function setWorkflowUiState(status = {}) {
  runtimeState.workflowRunning = Boolean(status.isRunning);
  runtimeState.workflowStatus = status;
  document.dispatchEvent(new CustomEvent('app:workflow-status', { detail: status }));

  const workflowStatus = $('workflow-status');
  if (workflowStatus) {
    workflowStatus.textContent = formatWorkflowStatus(status);
  }

  syncWorkflowUiLockState();
  updateWorkflowFileLabel();
  syncWorkflowEditorFeedback(status);
}

function readConnectionConfigFromUi() {
  return normalizeConnectionConfig({
    ...runtimeState.connectionConfig,
    simulation: $('sim-mode-toggle')?.value === 'true'
  });
}

function syncConnectionModeUi() {
  const config = readConnectionConfigFromUi();
  runtimeState.connectionConfig = {
    ...runtimeState.connectionConfig,
    mode: config.mode,
    host: config.host,
    port: config.port,
    simulation: config.simulation
  };
  runtimeState.selectedSimulationMode = config.simulation;
  const { mode, simulation } = config;
  toggleConnectionSettings(mode, simulation);
  return config;
}

async function persistConnectionConfig(config = readConnectionConfigFromUi()) {
  await window.api.store.set('dcx-config', config);
  return config;
}

async function updateSelectedModeFromUi() {
  const simulationToggle = $('sim-mode-toggle');
  if (!simulationToggle) {
    return;
  }

  if (runtimeState.modeSwitchBusy) {
    simulationToggle.value = String(Boolean(runtimeState.selectedSimulationMode));
    syncModeSwitchUiState();
    return;
  }

  if (isExecutionActive()) {
    simulationToggle.value = String(Boolean(runtimeState.selectedSimulationMode));
    showFooterFeedback(getModeSwitchBlockedMessage('switch'), { tone: 'error', timeout: 8000 });
    syncModeSwitchUiState();
    return;
  }

  try {
    runtimeState.selectedSimulationMode = simulationToggle.value === 'true';
    syncConnectionModeUi();
    await persistConnectionConfig();
  } catch (error) {
    log({ mode_selection_error: error.message });
  }

  syncModeSwitchUiState();
}

function setSequenceUiState(status = {}) {
  sequenceRunning = Boolean(status.isRunning);
  runtimeState.sequenceRunning = sequenceRunning;
  runtimeState.sequenceStatus = status;
  document.dispatchEvent(new CustomEvent('app:sequence-status', { detail: status }));

  const progress = $('sequence-progress');
  const runLabel = $('run-sequence-label');
  const clearTimelineButton = $('clear-timeline-btn');

  const message = status.error ? `${status.message || 'ERROR'}: ${status.error}` : status.message || t('sequencer.progress.idle', 'IDLE');

  if (progress) {
    progress.textContent = message;
  }

  if (runLabel) {
    runLabel.textContent = sequenceRunning ? t('sequencer.buttons.stop', 'Stop Sequence') : t('sequencer.buttons.execute', 'Execute Sequence');
  }

  if (clearTimelineButton) {
    clearTimelineButton.disabled = sequenceRunning;
  }

  document.querySelectorAll('[data-sequence-template]').forEach((template) => {
    template.draggable = !sequenceRunning;
    template.classList.toggle('pointer-events-none', sequenceRunning);
    template.classList.toggle('opacity-50', sequenceRunning);
  });

  ['seq-auto-abort', 'seq-loop-count', 'seq-name'].forEach((id) => {
    const element = $(id);
    if (!element) return;

    element.disabled = sequenceRunning;
  });

  syncSequenceEditorUi(sequenceRunning);

  document.querySelectorAll('[data-sequence-action]').forEach((button) => {
    button.disabled = sequenceRunning;
  });

  syncWorkflowUiLockState();
}

function readSequenceRequest() {
  return {
    timeline: getTimeline(),
    options: {
      loopCount: $('seq-loop-count')?.value || '1',
      autoAbort: $('seq-auto-abort')?.value || 'ALARM'
    }
  };
}

async function hydrateSequenceStatus() {
  if (typeof window.api?.dcx?.getSequenceStatus !== 'function') {
    return;
  }

  try {
    const status = await window.api.dcx.getSequenceStatus();
    setSequenceUiState(status);
  } catch (error) {
    log({ sequence_status_error: error.message });
  }
}

async function hydrateWorkflowStatus() {
  if (typeof window.api?.dcx?.getWorkflowStatus !== 'function') {
    return;
  }

  try {
    const status = await window.api.dcx.getWorkflowStatus();
    setWorkflowUiState(status);
  } catch (error) {
    log({ workflow_status_error: error.message });
  }
}

async function stopActiveSequence() {
  if (typeof window.api?.dcx?.stopSequence !== 'function') {
    const res = { success: false, error: 'Sequence stop IPC is unavailable' };
    showFooterFeedback(res.error, { tone: 'error', timeout: 8000 });
    return res;
  }

  try {
    const res = await window.api.dcx.stopSequence();
    log({ sequence_stop: res });

    if (!res?.success) {
      showFooterFeedback(res?.error || res?.message || 'Sequence stop failed', { tone: 'error', timeout: 8000 });
    } else {
      showFooterFeedback('Sequence stop requested.', { tone: 'info', timeout: 4000 });
    }

    return res;
  } catch (error) {
    showFooterFeedback(`Sequence stop failed: ${error.message}`, { tone: 'error', timeout: 8000 });
    return { success: false, error: error.message };
  }
}

async function stopActiveWorkflow() {
  if (typeof window.api?.dcx?.stopWorkflow !== 'function') {
    const res = { success: false, error: 'Workflow stop IPC is unavailable' };
    showFooterFeedback(res.error, { tone: 'error', timeout: 8000 });
    return res;
  }

  try {
    const res = await window.api.dcx.stopWorkflow();
    log({ workflow_stop: res });

    if (!res?.success) {
      showFooterFeedback(res?.error || res?.message || 'Workflow stop failed', { tone: 'error', timeout: 8000 });
    } else {
      showFooterFeedback('Workflow stop requested.', { tone: 'info', timeout: 4000 });
    }

    return res;
  } catch (error) {
    showFooterFeedback(`Workflow stop failed: ${error.message}`, { tone: 'error', timeout: 8000 });
    return { success: false, error: error.message };
  }
}

export async function runSequenceFromUi() {
  if (runtimeState.hornScanRunning) {
    showFooterFeedback('Wait for the graph capture to finish before running a sequence.', { tone: 'error', timeout: 8000 });
    return { success: false, error: 'A graph capture is currently running' };
  }

  if (runtimeState.workflowRunning) {
    log({ sequence_error: 'Stop the active workflow before running a sequence.' });
    showFooterFeedback('Stop the active workflow before running a sequence.', { tone: 'error', timeout: 8000 });
    return { success: false, error: 'Workflow is currently running' };
  }

  try {
    const request = readSequenceRequest();
    const res = await window.api.dcx.runSequence(request);
    log({ sequence_result: res });

    if (!res?.success && !res?.stopped && res?.error) {
      showFooterFeedback(res.error, { tone: 'error', timeout: 8000 });
      setSequenceUiState({
        state: 'idle',
        isRunning: false,
        message: 'ERROR',
        error: res.error
      });
    }

    return res;
  } catch (error) {
    showFooterFeedback(`Sequence failed: ${error.message}`, { tone: 'error', timeout: 8000 });
    setSequenceUiState({
      state: 'idle',
      isRunning: false,
      message: 'ERROR',
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

export async function runWorkflowFromUi() {
  if (runtimeState.hornScanRunning) {
    showFooterFeedback('Wait for the graph capture to finish before running a workflow.', { tone: 'error', timeout: 8000 });
    const res = { success: false, error: 'A graph capture is currently running' };
    setWorkflowUiState({ state: 'idle', isRunning: false, message: 'ERROR', error: res.error });
    return res;
  }

  if (sequenceRunning) {
    log({ workflow_error: 'Stop the active sequence before running a workflow.' });
    showFooterFeedback('Stop the active sequence before running a workflow.', { tone: 'error', timeout: 8000 });
    const res = { success: false, error: 'Sequence is currently running' };
    setWorkflowUiState({ state: 'idle', isRunning: false, message: 'ERROR', error: res.error });
    return res;
  }

  try {
    const text = $('workflow-text')?.value || '';
    const res = await window.api.dcx.runWorkflow(text);
    log({ workflow: res });

    if (!res?.success) {
      showFooterFeedback(res?.stopped ? 'Workflow stopped.' : (res?.error || res?.message || 'Workflow failed'), {
        tone: res?.stopped ? 'warning' : 'error',
        timeout: 8000
      });
      setWorkflowUiState({
        state: 'idle',
        isRunning: false,
        message: res?.stopped ? 'STOPPED' : 'ERROR',
        error: res?.stopped ? null : res?.error || res?.message || 'Workflow failed'
      });
    }

    return res;
  } catch (error) {
    showFooterFeedback(`Workflow failed: ${error.message}`, { tone: 'error', timeout: 8000 });
    setWorkflowUiState({ state: 'idle', isRunning: false, message: 'ERROR', error: error.message });
    return { success: false, error: error.message };
  }
}

async function loadWorkflowScriptFromFile() {
  if (typeof window.api?.workflow?.loadScript !== 'function') {
    log({ workflow_file_error: 'Workflow file loading is unavailable.' });
    showFooterFeedback('Workflow file loading is unavailable.', { tone: 'error', timeout: 8000 });
    return;
  }

  try {
    const res = await window.api.workflow.loadScript();
    if (!res?.success) {
      return;
    }

    const textarea = $('workflow-text');
    loadWorkflowDraft({
      name: (res.fileName || '').replace(/\.[^.]+$/, ''),
      script: res.content || '',
      workflowId: null,
      clearFileReference: false
    });

    runtimeState.workflowFileName = res.fileName || '';
    updateWorkflowFileLabel();
    log({ workflow_loaded: { fileName: res.fileName, filePath: res.filePath } });
    showFooterFeedback(`Workflow loaded: ${res.fileName || 'script'}`, { tone: 'success', timeout: 4000 });
  } catch (error) {
    log({ workflow_file_error: error.message });
    showFooterFeedback(`Workflow load failed: ${error.message}`, { tone: 'error', timeout: 8000 });
  }
}

async function saveWorkflowScriptToFile() {
  if (typeof window.api?.workflow?.saveScript !== 'function') {
    log({ workflow_file_error: 'Workflow file saving is unavailable.' });
    showFooterFeedback('Workflow file saving is unavailable.', { tone: 'error', timeout: 8000 });
    return;
  }

  try {
    const res = await window.api.workflow.saveScript({
      fileName: runtimeState.workflowFileName || 'workflow-script.txt',
      content: $('workflow-text')?.value || ''
    });

    if (!res?.success) {
      return;
    }

    runtimeState.workflowFileName = res.fileName || '';
    updateWorkflowFileLabel();
    log({ workflow_saved: { fileName: res.fileName, filePath: res.filePath } });
    showFooterFeedback(`Workflow saved: ${res.fileName || 'script'}`, { tone: 'success', timeout: 4000 });
  } catch (error) {
    log({ workflow_file_error: error.message });
    showFooterFeedback(`Workflow save failed: ${error.message}`, { tone: 'error', timeout: 8000 });
  }
}

function safeMode(reason = 'Connection Lost') {
  if (runtimeState.locked) return;

  runtimeState.locked = true;
  log({ SAFE_MODE: reason });

  const overlay = document.createElement('div');
  overlay.style = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.95);
    color: #ff3b3b;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    font-weight: 800;
    z-index: 99999;
    text-align: center;
    padding: 20px;
  `;

  overlay.innerHTML = `&#9888; SAFE MODE ACTIVE<br>${reason}`;
  document.body.appendChild(overlay);

  document.querySelectorAll('button').forEach((button) => {
    button.disabled = true;
  });
}

function readUiAmplitude({ fallback = null } = {}) {
  const configuredRange = runtimeState.setupMetadata?.weldAmp || {};
  const minAmplitude = Number.isFinite(Number(configuredRange.min)) ? Number(configuredRange.min) : 0;
  const maxAmplitude = Number.isFinite(Number(configuredRange.max)) ? Number(configuredRange.max) : 100;
  const rawValue = $('amplitude-input')?.value;

  const candidateValue = rawValue == null || rawValue === ''
    ? fallback
    : rawValue;

  if (candidateValue == null || candidateValue === '') {
    return null;
  }

  const amplitude = Number(String(candidateValue).trim());

  if (!Number.isInteger(amplitude) || amplitude < minAmplitude || amplitude > maxAmplitude) {
    const message = `Amplitude must be an integer between ${minAmplitude} and ${maxAmplitude}`;
    log({ error: message });
    showFooterFeedback(message, { tone: 'error', timeout: 8000 });
    return null;
  }

  return amplitude;
}

function actionLabel(action) {
  return {
    start: 'Start',
    stop: 'Stop',
    seek: 'Seek',
    reset: 'Reset',
    setAmp: 'Amplitude update'
  }[action] || 'Control action';
}

export function applySystemInfo(systemInfo = {}) {
  runtimeState.systemInfo = systemInfo && typeof systemInfo === 'object'
    ? { ...systemInfo }
    : {};

  document.dispatchEvent(new CustomEvent('app:system-info-updated', {
    detail: runtimeState.systemInfo
  }));
}

export async function loadSystemInfo() {
  if (typeof window.api?.dcx?.getSystemInfo !== 'function') {
    applySystemInfo({});
    return {};
  }

  try {
    const systemInfo = await window.api.dcx.getSystemInfo();
    applySystemInfo(systemInfo || {});
    return systemInfo || {};
  } catch (error) {
    log({ system_info_error: error.message });
    return runtimeState.systemInfo;
  }
}

async function control(action, value) {
  try {
    const res = await window.api.dcx.control({ action, value });
    log({ action, value, res });

    if (!res?.success) {
      showFooterFeedback(`${actionLabel(action)} failed: ${res?.error || res?.message || 'Operation failed'}`, { tone: 'error', timeout: 8000 });
    }

    return res;
  } catch (error) {
    log({ control_error: error.message });
    showFooterFeedback(`${actionLabel(action)} failed: ${error.message}`, { tone: 'error', timeout: 8000 });
    return { success: false, error: error.message };
  }
}

async function connectDCX() {
  const { mode, host, port, simulation } = readConnectionConfigFromUi();

  if (isExecutionActive()) {
    const res = { success: false, status: runtimeState.status, error: getModeSwitchBlockedMessage('switch') };
    log({ connect_error: res.error });
    showFooterFeedback(res.error, { tone: 'error', timeout: 8000 });
    return res;
  }

  runtimeState.modeSwitchBusy = true;
  syncModeSwitchUiState();

  try {
    if (!simulation && !host) {
      const res = { success: false, status: 'offline', error: 'Enter a DCX IP address before connecting.' };
      log({ error: res.error });
      showFooterFeedback(res.error, { tone: 'error', timeout: 8000 });
      return res;
    }

    const config = { mode, host, port, simulation };

    if (isOnline() && Boolean(runtimeState.simulation) !== simulation) {
      await disconnectDCX({ preserveSelectedMode: true, suppressLog: true, skipBusyCheck: true });
    }

    await persistConnectionConfig(config);
    const res = await window.api.dcx.connect(config);

    updateStatus(res || { status: 'offline' });
    applySystemInfo(res?.systemInfo || {});

    if (Array.isArray(res?.warnings) && res.warnings.length) {
      log({ connect_warnings: res.warnings });
    }

    if (res.error) {
      log({ connect_error: res.error });
      showFooterFeedback(`Connection failed: ${res.error}`, { tone: 'error', timeout: 10000 });
      showConnectionFailurePopup(res.error);
    }

    if (res.success) {
      hideConnectionFailurePopup();
      const connectedConfig = {
        ...config,
        ...(res.host ? { host: res.host } : {}),
        ...(res.port ? { port: res.port } : {})
      };

      runtimeState.connectionConfig = {
        ...runtimeState.connectionConfig,
        ...connectedConfig
      };
      await persistConnectionConfig(connectedConfig);

      if (res?.telemetry) {
        updateTelemetry(res.telemetry);
      }
      applySystemInfo(res?.systemInfo || {});
      const partialHardwareConnection = !simulation
        && Boolean(res?.connections)
        && (!res.connections.ethernet || !res.connections.teensy);

      showFooterFeedback(
        simulation
          ? 'Simulation mode started.'
          : partialHardwareConnection
            ? 'Hardware connected with one transport unavailable.'
            : 'Hardware mode connected.',
        { tone: partialHardwareConnection ? 'warning' : 'success', timeout: 5000 }
      );
    }

    return res;
  } catch (error) {
    updateStatus({ status: 'offline', simulation: false });
    applySystemInfo({});
    log({ connect_error: error.message });
    showFooterFeedback(`Connection failed: ${error.message}`, { tone: 'error', timeout: 10000 });
    showConnectionFailurePopup(error.message);
    return { success: false, status: 'offline', error: error.message };
  } finally {
    runtimeState.modeSwitchBusy = false;
    syncModeSwitchUiState();
  }
}

async function disconnectDCX({ preserveSelectedMode = false, suppressLog = false, skipBusyCheck = false } = {}) {
  if (!skipBusyCheck && isExecutionActive()) {
    const res = { success: false, status: runtimeState.status, error: getModeSwitchBlockedMessage('disconnect') };
    log({ disconnect_error: res.error });
    showFooterFeedback(res.error, { tone: 'error', timeout: 8000 });
    return res;
  }

  if (!skipBusyCheck) {
    runtimeState.modeSwitchBusy = true;
    syncModeSwitchUiState();
  }

  runtimeState.sequenceRunning = false;
  runtimeState.workflowRunning = false;

  try {
    await window.api.dcx.disconnect();
    hideConnectionFailurePopup();
    updateStatus({ status: 'offline', simulation: preserveSelectedMode ? runtimeState.selectedSimulationMode : false });
    updateTelemetry({ frequency: 0, amplitude: 0, cycles: 0, power: 0, ready: 0, active: 0, seek: 0, alarm: 0 });
    applySystemInfo({});
    if (!suppressLog) {
      log('DISCONNECTED');
      showFooterFeedback('Disconnected.', { tone: 'info', timeout: 4000 });
    }

    return { success: true, status: 'offline' };
  } catch (error) {
    log({ disconnect_error: error.message });
    showFooterFeedback(`Disconnect failed: ${error.message}`, { tone: 'error', timeout: 8000 });
    return { success: false, status: runtimeState.status, error: error.message };
  } finally {
    if (!skipBusyCheck) {
      runtimeState.modeSwitchBusy = false;
      syncModeSwitchUiState();
    }
  }
}

async function updateAmplitudeFromUi() {
  const amp = readUiAmplitude();
  if (amp == null) {
    return;
  }

  await control('setAmp', { weldAmp: amp });
}

async function ensureHardwareConnectedForStart() {
  const simulationSelected = $('sim-mode-toggle')?.value === 'true';

  if (simulationSelected || isOnline()) {
    return { success: true };
  }

  return connectDCX();
}

export function initAmplitudeEnter() {
  const amplitudeInput = $('amplitude-input');
  if (!amplitudeInput) return;

  amplitudeInput.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    await updateAmplitudeFromUi();
  });
}

export function initButtons() {
  window.api?.dcx?.onSequenceStatus?.(setSequenceUiState);
  window.api?.dcx?.onWorkflowStatus?.(setWorkflowUiState);
  initSequenceLibrary().finally(() => {
    hydrateSequenceStatus();
    hydrateWorkflowStatus();
  });
  initWorkflowLibrary();

  syncConnectionModeUi();
  runtimeState.selectedSimulationMode = $('sim-mode-toggle')?.value === 'true';

  $('connect-dcx-btn')?.addEventListener('click', () => {
    connectDCX();
  });

  $('disconnect-dcx-btn')?.addEventListener('click', () => {
    disconnectDCX({ preserveSelectedMode: true });
  });

  $('sim-mode-toggle')?.addEventListener('change', updateSelectedModeFromUi);

  $('connection-failure-popup-reconnect')?.addEventListener('click', async () => {
    hideConnectionFailurePopup();
    await connectDCX();
  });

  $('connection-failure-popup-dismiss')?.addEventListener('click', () => {
    hideConnectionFailurePopup();
  });

  document.addEventListener('app:telemetry-updated', syncModeSwitchUiState);

  $('start-btn')?.addEventListener('click', async () => {
    const amp = readUiAmplitude({ fallback: 50 });
    if (amp == null) {
      return;
    }

    const connectionResult = await ensureHardwareConnectedForStart();
    if (!connectionResult?.success) {
      return;
    }

    await control('start', amp);
  });

  $('stop-btn')?.addEventListener('click', async () => {
    if (sequenceRunning) {
      await stopActiveSequence();
      return;
    }

    if (runtimeState.workflowRunning) {
      await stopActiveWorkflow();
      return;
    }

    await control('stop');
  });
  $('seek-btn')?.addEventListener('click', () => control('seek'));
  $('reset-btn')?.addEventListener('click', () => control('reset'));

  $('run-sequence-btn')?.addEventListener('click', async () => {
    if (sequenceRunning) {
      await stopActiveSequence();
      return;
    }

    await runSequenceFromUi();
  });

  $('clear-timeline-btn')?.addEventListener('click', () => {
    clearSequencerTimeline();
    log('SEQUENCE TIMELINE CLEARED');
  });

  $('run-workflow-btn')?.addEventListener('click', async () => {
    try {
      setWorkflowUiState({
        state: 'starting',
        isRunning: true,
        message: 'PREPARING',
        currentLine: 0,
        totalLines: 0,
        command: null,
        error: null
      });
      await runWorkflowFromUi();
    } catch (error) {
      setWorkflowUiState({ state: 'idle', isRunning: false, message: 'ERROR', error: error.message });
      log({ workflow_error: error.message });
    }
  });

  $('stop-workflow-btn')?.addEventListener('click', async () => {
    await stopActiveWorkflow();
  });

  $('load-workflow-btn')?.addEventListener('click', loadWorkflowScriptFromFile);
  $('save-workflow-btn')?.addEventListener('click', saveWorkflowScriptToFile);

  $('clear-branson-mem-btn')?.addEventListener('click', () => {
    log('CLR command is not implemented yet.');
    showFooterFeedback('Memory wipe is not implemented yet.', { tone: 'warning', timeout: 7000 });
  });

  document.addEventListener('app:language-changed', () => {
    setSequenceUiState(runtimeState.sequenceStatus || { isRunning: runtimeState.sequenceRunning, message: t('sequencer.progress.idle', 'IDLE') });
    setWorkflowUiState(runtimeState.workflowStatus || { isRunning: runtimeState.workflowRunning, message: t('workflow.status.idle', 'IDLE') });
  });

  document.addEventListener('app:view-changed', () => {
    syncDashboardIoPollingState();
    syncDashboardSetupPollingState();
  });

  document.addEventListener('app:status-updated', () => {
    syncDashboardIoPollingState();
    syncDashboardSetupPollingState();
  });

  document.addEventListener('app:horn-scan-state', () => {
    syncWorkflowUiLockState();
  });

  document.addEventListener('workflow:file-meta-changed', updateWorkflowFileLabel);

  syncWorkflowUiLockState();
  syncModeSwitchUiState();
  updateWorkflowFileLabel();
  syncDashboardIoPollingState();
}

export function heartbeatLoop() {
  if (runtimeState.heartbeatStarted) return;

  runtimeState.heartbeatStarted = true;
  const runHeartbeatTick = async () => {
    if (runtimeState.locked || runtimeState.hornScanRunning) return;

    try {
      const start = Date.now();
      const res = await window.api.dcx.getStatus();
      const latency = Date.now() - start;
      const telemetry = res?.telemetry || {};

      if (res?.connections?.ethernet && typeof window.api?.dcx?.getIoBootstrapSnapshot === 'function') {
        try {
          const ioSnapshot = await window.api.dcx.getIoBootstrapSnapshot();
          if (ioSnapshot?.success) {
            runtimeState.ioSnapshot = ioSnapshot;
          }
        } catch (ioError) {
          log({ io_indicator_error: ioError.message });
        }
      } else {
        runtimeState.ioSnapshot = null;
      }

      const heartbeatSignature = getHeartbeatLogSignature(res || {}, telemetry);
      const shouldRefreshLog = isHeartbeatRunActive(telemetry) || heartbeatSignature !== lastHeartbeatLogSignature;

      updateStatus(res || { status: 'offline' }, { latency });
      updateTelemetry(telemetry);
      if (shouldRefreshLog) {
        log(res);
      }
      lastHeartbeatLogSignature = heartbeatSignature;
      runtimeState.reconnectAttempts = 0;
    } catch (error) {
      runtimeState.reconnectAttempts += 1;
      updateStatus({ status: 'offline', simulation: false });
      const heartbeatErrorSignature = `heartbeat_error:${error.message}`;
      if (heartbeatErrorSignature !== lastHeartbeatLogSignature) {
        log({ heartbeat_error: error.message });
        lastHeartbeatLogSignature = heartbeatErrorSignature;
      }

      if (runtimeState.reconnectAttempts >= 3) {
        showFooterFeedback('Communication lost. Entering safe mode.', { tone: 'error', sticky: true });
        safeMode('DCX Communication Failure');
      }
    }
  };

  runHeartbeatTick();
  runtimeState.heartbeatTimer = setInterval(runHeartbeatTick, 2000);
}

export function initTelemetrySubscription() {
  window.api?.dcx?.onTelemetry?.((telemetry) => {
    updateTelemetry(telemetry);
  });
}
