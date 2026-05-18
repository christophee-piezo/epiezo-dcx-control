import { applySystemInfo, initAmplitudeEnter, initButtons, initStatusMonitorSubscription, initTelemetrySubscription } from './renderer/controls.js';
import { log } from './renderer/logger.js';
import { initNavigation, setCurrentView } from './renderer/navigation.js';
import { initPreferenceControls, loadUiPreferences } from './renderer/preferences.js';
import { runtimeState } from './renderer/runtime.js';
import { loadStoredConfig } from './renderer/serial.js';
import { hideConnectionFailurePopup, refreshStatusUi, showConnectionFailurePopup, showFooterFeedback, updateStatus, updateTelemetry } from './renderer/status-ui.js';
import { renderTimeline } from './renderer/timeline-ui.js';

export async function initializeRenderer() {
  if (runtimeState.initialized) return;

  runtimeState.initialized = true;

  await loadUiPreferences();
  await loadStoredConfig();
  initNavigation();
  initButtons();

  const [
    { initializeMethodHome },
    { initializeSettingsPage },
    { initializeDashboardExport },
    { initializeSequencePreviewChart },
    { initializeTelemetryChart },
    { initializeTestsPage }
  ] = await Promise.all([
    import('./renderer/method-home.js'),
    import('./renderer/settings-page.js'),
    import('./renderer/dashboard-export.js'),
    import('./renderer/sequence-preview-chart.js'),
    import('./renderer/telemetry-chart.js'),
    import('./renderer/tests-page.js')
  ]);

  initializeMethodHome();
  initializeSettingsPage();
  initAmplitudeEnter();
  initTelemetrySubscription();
  initStatusMonitorSubscription();
  initializeSequencePreviewChart();
  initializeTelemetryChart();
  initializeDashboardExport();
  initializeTestsPage();
  initPreferenceControls();
  renderTimeline();
  setCurrentView('dashboard');
  updateStatus('offline');
  log('UI READY');

  document.addEventListener('app:language-changed', () => {
    refreshStatusUi();
  });

  const applyStatusInit = (data) => {
    log({ init_status: data });
    updateStatus(data || { status: 'offline' });

    if (data?.error) {
      showFooterFeedback(`Auto-connect failed: ${data.error}`, { tone: 'error', timeout: 10000 });
      showConnectionFailurePopup(data.error);
    } else if (data?.status === 'online') {
      hideConnectionFailurePopup();
    }

    if (data?.status === 'online') {
      if (data?.telemetry) {
        updateTelemetry(data.telemetry);
      }

      if (data?.systemInfo) {
        applySystemInfo(data.systemInfo);
      }
    }
  };

  runtimeState.statusInitCleanup = window.api.dcx.onStatusInit(applyStatusInit);

  try {
    const snapshot = await window.api?.dcx?.getStatusInitSnapshot?.();
    if (snapshot) {
      applyStatusInit(snapshot);
    }
  } catch (error) {
    log({ init_status_snapshot_error: error.message });
  }
}
