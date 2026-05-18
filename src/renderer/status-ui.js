import { $, runtimeState } from './runtime.js';
import { t } from './preferences.js';
import { appendTelemetrySample } from './telemetry-chart.js';

const FOOTER_TONE_CLASSES = {
  default: ['text-muted-foreground'],
  info: ['text-sky-300'],
  success: ['text-emerald-300'],
  warning: ['text-amber-300'],
  error: ['text-red-400']
};
function getDefaultFooterMessage() {
  const indicatorState = runtimeState.connectionIndicatorState || 'offline';

  if (indicatorState === 'partial') {
    return t('footer.connectionDegraded', 'CHECK CONNECTIONS');
  }

  if (indicatorState !== 'online') {
    return t('footer.waitingForConnection', 'WAITING FOR CONNECTION');
  }

  return runtimeState.simulation
    ? t('footer.simulatorReady', 'SIMULATOR READY')
    : t('footer.systemReady', 'SYSTEM READY');
}

function applyFooterTone(element, tone = 'default') {
  Object.values(FOOTER_TONE_CLASSES).flat().forEach((className) => {
    element.classList.remove(className);
  });

  (FOOTER_TONE_CLASSES[tone] || FOOTER_TONE_CLASSES.default).forEach((className) => {
    element.classList.add(className);
  });
}

function renderFooterMessage() {
  const last = $('last-msg');
  if (!last) {
    return;
  }

  const hasFeedback = Boolean(runtimeState.feedbackMessage);
  last.textContent = hasFeedback ? runtimeState.feedbackMessage : getDefaultFooterMessage();
  applyFooterTone(last, hasFeedback ? runtimeState.feedbackTone : 'default');
}

export function clearFooterFeedback() {
  if (runtimeState.feedbackTimeoutId) {
    window.clearTimeout(runtimeState.feedbackTimeoutId);
    runtimeState.feedbackTimeoutId = null;
  }

  runtimeState.feedbackMessage = '';
  runtimeState.feedbackTone = 'default';
  renderFooterMessage();
}

export function showFooterFeedback(message, { tone = 'info', timeout = 5000, sticky = false } = {}) {
  if (runtimeState.feedbackTimeoutId) {
    window.clearTimeout(runtimeState.feedbackTimeoutId);
    runtimeState.feedbackTimeoutId = null;
  }

  runtimeState.feedbackMessage = String(message || '').trim();
  runtimeState.feedbackTone = tone;
  renderFooterMessage();

  if (!sticky && timeout > 0) {
    runtimeState.feedbackTimeoutId = window.setTimeout(() => {
      clearFooterFeedback();
    }, timeout);
  }
}

function getConnectionsFromStatus(statusObj) {
  if (typeof statusObj === 'string') {
    return {
      ethernet: false,
      teensy: false
    };
  }

  if (statusObj?.connections) {
    return {
      ethernet: Boolean(statusObj.connections.ethernet),
      teensy: Boolean(statusObj.connections.teensy)
    };
  }

  if ((statusObj?.status ?? 'offline').toLowerCase() === 'offline') {
    return {
      ethernet: false,
      teensy: false
    };
  }

  return {
    ...runtimeState.connections
  };
}

function getIndicatorState({ status, simulation, connections }) {
  if (simulation && status === 'online') {
    return 'online';
  }

  if (connections.ethernet && connections.teensy) {
    return 'online';
  }

  if (connections.ethernet || connections.teensy) {
    return 'partial';
  }

  return 'offline';
}

export function showConnectionFailurePopup(message) {
  const popup = $('connection-failure-popup');
  const messageElement = $('connection-failure-popup-message');

  runtimeState.connectionFailureMessage = String(message || '').trim() || t(
    'connectionFailurePopup.messageFallback',
    'The hardware connection did not complete. Check Ethernet and Teensy, then retry.'
  );

  if (messageElement) {
    messageElement.textContent = runtimeState.connectionFailureMessage;
  }

  if (popup) {
    popup.classList.remove('hidden');
    popup.classList.add('flex');
  }
}

export function hideConnectionFailurePopup() {
  const popup = $('connection-failure-popup');
  if (!popup) {
    return;
  }

  popup.classList.add('hidden');
  popup.classList.remove('flex');
}

export function updateStatus(statusObj, meta = {}) {
  const dot = $('header-status-dot');
  const text = $('header-status-text');
  const ping = $('ping-val');

  const status = typeof statusObj === 'string' ? statusObj : statusObj?.status ?? 'offline';
  const simulation = typeof statusObj === 'string'
    ? false
    : Boolean(statusObj?.simulation || statusObj?.config?.simulation);
  const connections = getConnectionsFromStatus(statusObj);
  const indicatorState = getIndicatorState({ status, simulation, connections });

  runtimeState.status = status;
  runtimeState.simulation = simulation;
  runtimeState.connections = connections;
  runtimeState.connectionIndicatorState = indicatorState;
  document.dispatchEvent(new CustomEvent('app:status-updated', {
    detail: {
      status,
      simulation,
      connections,
      indicatorState
    }
  }));

  const online = status.toLowerCase() === 'online';

  if (dot) {
    dot.classList.toggle('online', indicatorState === 'online');
    dot.classList.toggle('partial', indicatorState === 'partial');
  }

  if (text) {
    text.textContent = indicatorState === 'partial'
      ? t('status.partial', 'PARTIAL')
      : online
        ? (simulation ? t('status.simOnline', 'SIM ONLINE') : t('status.online', 'ONLINE'))
        : t('status.offline', 'OFFLINE');
  }

  if (ping && meta.latency != null) ping.textContent = String(meta.latency);

  renderFooterMessage();
}

export function refreshStatusUi() {
  updateStatus({
    status: runtimeState.status,
    simulation: runtimeState.simulation,
    connections: runtimeState.connections
  });
}

function resolveIndicatorState(telemetryValue) {
  return Boolean(telemetryValue);
}

export function getResolvedTelemetry(telemetry = {}) {
  const nextTelemetry = {
    ...telemetry,
    ready: resolveIndicatorState(telemetry.ready) ? 1 : 0,
    active: resolveIndicatorState(telemetry.active) ? 1 : 0,
    alarm: resolveIndicatorState(telemetry.alarm) ? 1 : 0,
    seek: resolveIndicatorState(telemetry.seek) ? 1 : 0
  };

  return nextTelemetry;
}

function toFiniteNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function enrichTelemetryChannels(telemetry = {}) {
  const serialAnalogInputs = [
    toFiniteNumber(telemetry.analog1),
    toFiniteNumber(telemetry.analog2),
    toFiniteNumber(telemetry.analog3),
    toFiniteNumber(telemetry.analog4)
  ];
  const hasSerialAnalogInputs = serialAnalogInputs.some((value) => value != null);
  const fallbackAnalogInputs = Array.isArray(telemetry.analogInputsMillivolts)
    ? telemetry.analogInputsMillivolts.map((value) => toFiniteNumber(value)).slice(0, 4)
    : null;
  const analogInputsMillivolts = hasSerialAnalogInputs
    ? serialAnalogInputs
    : fallbackAnalogInputs;

  if (!analogInputsMillivolts) {
    return { ...telemetry };
  }

  return {
    ...telemetry,
    analogInputsMillivolts,
    aux1: analogInputsMillivolts[2],
    aux2: analogInputsMillivolts[3]
  };
}

export function shouldUseSetupRealtimeData(telemetry = runtimeState.lastTelemetry || {}) {
  const resolvedTelemetry = getResolvedTelemetry(telemetry);

  return Boolean(
    runtimeState.connections?.ethernet
    && !runtimeState.simulation
    && !runtimeState.connections?.teensy
    && !resolvedTelemetry.active
    && !resolvedTelemetry.seek
  );
}

function getRealtimeDisplayValues(telemetry = runtimeState.lastTelemetry || {}) {
  const resolvedTelemetry = getResolvedTelemetry(telemetry);
  const useSetupRealtimeData = shouldUseSetupRealtimeData(resolvedTelemetry);

  return {
    frequency: useSetupRealtimeData && runtimeState.setupConfig?.digitaltune != null
      ? runtimeState.setupConfig.digitaltune
      : resolvedTelemetry.frequency,
    amplitude: useSetupRealtimeData && runtimeState.setupConfig?.weldAmp != null
      ? runtimeState.setupConfig.weldAmp
      : resolvedTelemetry.amplitude,
    cycles: resolvedTelemetry.cycles
  };
}

export function refreshRealtimeDataDisplay(telemetry = runtimeState.lastTelemetry || {}) {
  const values = getRealtimeDisplayValues(telemetry);
  const valueMappings = [
    ['freq-val', values.frequency],
    ['amp-val', values.amplitude],
    ['cycles-val', values.cycles]
  ];

  valueMappings.forEach(([id, value]) => {
    if (value == null) return;

    const element = $(id);
    if (element) {
      element.textContent = String(value);
    }
  });
}

export function updateTelemetry(telemetry = {}) {
  const mergedTelemetry = {
    ...runtimeState.lastTelemetry,
    ...telemetry
  };
  const nextTelemetry = getResolvedTelemetry(enrichTelemetryChannels(mergedTelemetry));

  runtimeState.lastTelemetry = nextTelemetry;
  document.dispatchEvent(new CustomEvent('app:telemetry-updated', { detail: nextTelemetry }));

  refreshRealtimeDataDisplay(nextTelemetry);

  const ready = $('led-ready');
  const active = $('led-active');
  const seek = $('led-seek');
  const alarm = $('led-alarm');
  const readyState = resolveIndicatorState(nextTelemetry.ready);
  const activeState = resolveIndicatorState(nextTelemetry.active);
  const seekState = resolveIndicatorState(nextTelemetry.seek);
  const alarmState = resolveIndicatorState(nextTelemetry.alarm);

  if (ready) ready.classList.toggle('active', readyState);
  if (active) active.classList.toggle('active', activeState);
  if (seek) seek.classList.toggle('active', seekState);
  if (alarm) alarm.classList.toggle('alarm', alarmState);

  appendTelemetrySample(nextTelemetry);
}
