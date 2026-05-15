import { applySystemInfo, initAmplitudeEnter, initButtons, initTelemetrySubscription } from './renderer/controls.js';
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
    { initializeSequencePreviewChart },
    { initializeTelemetryChart },
    { initializeTestsPage }
  ] = await Promise.all([
    import('./renderer/method-home.js'),
    import('./renderer/settings-page.js'),
    import('./renderer/sequence-preview-chart.js'),
    import('./renderer/telemetry-chart.js'),
    import('./renderer/tests-page.js')
  ]);

  initializeMethodHome();
  initializeSettingsPage();
  initAmplitudeEnter();
  initTelemetrySubscription();
  initializeSequencePreviewChart();
  initializeTelemetryChart();
  initializeTestsPage();
  initPreferenceControls();
  renderTimeline();
  setCurrentView('dashboard');
  updateStatus('offline');
  log('UI READY');

  document.addEventListener('app:language-changed', () => {
    refreshStatusUi();
  });

  runtimeState.statusInitCleanup = window.api.dcx.onStatusInit((data) => {
    log({ init_status: data });
    updateStatus(data || { status: 'offline' });

    if (data?.error) {
      showFooterFeedback(`Auto-connect failed: ${data.error}`, { tone: 'error', timeout: 10000 });
      showConnectionFailurePopup(data.error);
    } else if (data?.status === 'online') {
      hideConnectionFailurePopup();
    }

    if (data?.auto && data.status === 'online') {
      if (data?.telemetry) {
        updateTelemetry(data.telemetry);
      }
      applySystemInfo(data?.systemInfo || {});
    }
  });
}
