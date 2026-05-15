import { $, runtimeState } from './runtime.js';
import { log } from './logger.js';
import { t } from './preferences.js';

let localizationBound = false;
const INVALID_SERIAL_PORT_VALUES = new Set([
  'detecting...',
  'detection...',
  'no serial ports found',
  'aucun port serie detecte'
]);
const DEFAULT_CONNECTION_CONFIG = {
  mode: 'http',
  host: '192.168.10.100',
  port: '',
  simulation: false
};

function normalizeSerialPortValue(port) {
  const normalizedPort = String(port ?? '').trim();

  if (!normalizedPort) {
    return '';
  }

  return INVALID_SERIAL_PORT_VALUES.has(normalizedPort.toLowerCase())
    ? ''
    : normalizedPort;
}

export function normalizeConnectionConfig(config = {}) {
  return {
    mode: config.mode === 'serial' ? 'serial' : 'http',
    host: String(config.host ?? DEFAULT_CONNECTION_CONFIG.host).trim() || DEFAULT_CONNECTION_CONFIG.host,
    port: normalizeSerialPortValue(config.port ?? DEFAULT_CONNECTION_CONFIG.port),
    simulation: Boolean(config.simulation)
  };
}

function bindLocalizationListener() {
  if (localizationBound) {
    return;
  }

  localizationBound = true;
  document.addEventListener('app:language-changed', () => {
    toggleConnectionSettings(runtimeState.connectionConfig.mode, runtimeState.selectedSimulationMode);
  });
}

export function toggleConnectionSettings(mode, simulation = false) {
  const httpSettings = $('http-settings');
  const serialSettings = $('serial-settings');
  const isSerial = mode === 'serial';

  if (httpSettings) {
    httpSettings.style.display = !simulation && !isSerial ? 'block' : 'none';
  }

  if (serialSettings) {
    serialSettings.style.display = !simulation && isSerial ? 'block' : 'none';
  }
}

function renderSerialPortOptions(ports) {
  const select = $('serial-port-select');
  if (!select) return;

  if (!ports.length) {
    select.innerHTML = `<option value="">${t('serial.noPorts', 'No serial ports found')}</option>`;
    return;
  }

  select.innerHTML = ports
    .map((port) => {
      const label = port.isTeensy ? `${port.friendly} (Teensy)` : port.friendly;
      return `<option value="${port.path}">${label}</option>`;
    })
    .join('');
}

export async function loadSerialPorts() {
  if (typeof window.api?.dcx?.listSerialPorts !== 'function') return;

  const select = $('serial-port-select');
  if (select) {
    select.innerHTML = `<option value="">${t('serial.detecting', 'Detecting...')}</option>`;
  }

  try {
    const ports = await window.api.dcx.listSerialPorts();
    renderSerialPortOptions(ports || []);
  } catch (error) {
    renderSerialPortOptions([]);
    log({ serial_ports_error: error.message });
  }
}

export async function loadStoredConfig() {
  bindLocalizationListener();

  const config = normalizeConnectionConfig(await window.api.store.get('dcx-config'));
  runtimeState.connectionConfig = config;
  runtimeState.selectedSimulationMode = Boolean(config.simulation);

  if ($('sim-mode-toggle')) {
    $('sim-mode-toggle').value = String(runtimeState.selectedSimulationMode);
  }

  toggleConnectionSettings(config.mode, runtimeState.selectedSimulationMode);

  if (config.mode === 'serial' && !config.simulation) {
    await loadSerialPorts();
  }
}
