import { $, runtimeState } from './runtime.js';
import { log } from './logger.js';
import { t } from './preferences.js';
import { showFooterFeedback } from './status-ui.js';
import { buildStructuredCsvExport, buildStructuredJsonExport, formatExportTimestamp, sanitizeFileNameSegment } from './data-export.js';
import { getTelemetryChartSnapshot } from './telemetry-chart.js';

const DASHBOARD_EXPORT_COLUMNS = [
  'sampleIndex',
  'sampleTimestampMs',
  'relativeTimeSeconds',
  'frequency',
  'amplitude',
  'power',
  'cycles',
  'aux1',
  'aux2',
  'alarm',
  'ready',
  'active',
  'seek'
];

function getAxisSelections() {
  return {
    xAxis: $('chart-x-axis')?.value || 'time',
    yAxis: $('chart-y-axis')?.value || 'frequency'
  };
}

function getTelemetryExportValue(telemetry = {}, field) {
  if (field === 'aux1') {
    return telemetry?.aux1 ?? telemetry?.analogInputsMillivolts?.[2] ?? '';
  }

  if (field === 'aux2') {
    return telemetry?.aux2 ?? telemetry?.analogInputsMillivolts?.[3] ?? '';
  }

  return telemetry?.[field] ?? '';
}

function getDashboardExportRows(samples = []) {
  const firstTimestamp = Number(samples[0]?.timestamp) || 0;

  return samples.map((sample, index) => ({
    sampleIndex: index,
    sampleTimestampMs: sample.timestamp ?? '',
    relativeTimeSeconds: Number.isFinite(Number(sample.timestamp))
      ? Number((((Number(sample.timestamp) - firstTimestamp) / 1000)).toFixed(3))
      : '',
    frequency: getTelemetryExportValue(sample.telemetry, 'frequency'),
    amplitude: getTelemetryExportValue(sample.telemetry, 'amplitude'),
    power: getTelemetryExportValue(sample.telemetry, 'power'),
    cycles: getTelemetryExportValue(sample.telemetry, 'cycles'),
    aux1: getTelemetryExportValue(sample.telemetry, 'aux1'),
    aux2: getTelemetryExportValue(sample.telemetry, 'aux2'),
    alarm: getTelemetryExportValue(sample.telemetry, 'alarm'),
    ready: getTelemetryExportValue(sample.telemetry, 'ready'),
    active: getTelemetryExportValue(sample.telemetry, 'active'),
    seek: getTelemetryExportValue(sample.telemetry, 'seek')
  }));
}

function getDashboardExportPayload() {
  const snapshot = getTelemetryChartSnapshot();
  const axes = getAxisSelections();
  const rows = getDashboardExportRows(snapshot.samples);
  const metadata = {
    exportType: 'Dashboard Telemetry',
    exportedAt: new Date().toISOString(),
    controllerStatus: runtimeState.status || 'offline',
    simulation: Boolean(runtimeState.simulation),
    selectedXAxis: axes.xAxis,
    selectedYAxis: axes.yAxis,
    selectedPlots: snapshot.multiPlotEnabled ? snapshot.selectedSeries.join(', ') : axes.yAxis,
    multiPlotEnabled: snapshot.multiPlotEnabled,
    captureState: snapshot.paused ? 'paused' : 'live',
    sampleCount: rows.length
  };

  return {
    axes,
    metadata,
    rows,
    snapshot
  };
}

function buildDashboardCsvExport(payload) {
  return buildStructuredCsvExport({
    infoTitle: 'Dashboard Telemetry Information',
    infoRows: [
      ['Export Type', payload.metadata.exportType],
      ['Exported At', payload.metadata.exportedAt],
      ['Controller Status', payload.metadata.controllerStatus],
      ['Simulation', payload.metadata.simulation ? 'true' : 'false'],
      ['Selected X Axis', payload.metadata.selectedXAxis],
      ['Selected Y Axis', payload.metadata.selectedYAxis],
      ['Multi Plot Enabled', payload.metadata.multiPlotEnabled ? 'true' : 'false'],
      ['Selected Plots', payload.metadata.selectedPlots],
      ['Capture State', payload.metadata.captureState],
      ['Sample Count', payload.metadata.sampleCount]
    ],
    dataTitle: 'Telemetry Data',
    dataColumns: DASHBOARD_EXPORT_COLUMNS,
    dataRows: payload.rows
  });
}

function buildDashboardJsonExport(payload) {
  return buildStructuredJsonExport({
    metadata: payload.metadata,
    dataColumns: DASHBOARD_EXPORT_COLUMNS,
    dataRows: payload.rows
  });
}

function updateDashboardExportButtonState() {
  const button = $('export-dashboard-data-btn');
  if (!button) {
    return;
  }

  button.disabled = !getTelemetryChartSnapshot().samples.length;
}

async function exportDashboardTelemetryData() {
  const payload = getDashboardExportPayload();
  if (!payload.rows.length) {
    const message = t('dashboard.export.noData', 'No dashboard telemetry data available to export.');
    log({ dashboard_export: message });
    showFooterFeedback(message, { tone: 'warning', timeout: 5000 });
    return;
  }

  if (typeof window.api?.dataExport?.saveFile !== 'function') {
    const message = t('dashboard.export.error', 'Dashboard export failed: {error}').replace('{error}', 'Export is unavailable');
    log({ dashboard_export_error: 'Export is unavailable.' });
    showFooterFeedback(message, { tone: 'error', timeout: 8000 });
    return;
  }

  const suggestedName = `${sanitizeFileNameSegment('dashboard-telemetry')}-${formatExportTimestamp()}.csv`;

  try {
    const result = await window.api.dataExport.saveFile({
      title: 'Export Dashboard Telemetry Data',
      suggestedName,
      preferredExtension: '.csv',
      csvContent: buildDashboardCsvExport(payload),
      jsonContent: buildDashboardJsonExport(payload)
    });

    if (!result?.success) {
      return;
    }

    log({ dashboard_export: { fileName: result.fileName, format: result.format, rows: payload.rows.length } });
    showFooterFeedback(
      t('dashboard.export.success', 'Dashboard telemetry exported: {name}').replace('{name}', result.fileName || suggestedName),
      { tone: 'success', timeout: 5000 }
    );
  } catch (error) {
    log({ dashboard_export_error: error.message });
    showFooterFeedback(
      t('dashboard.export.error', 'Dashboard export failed: {error}').replace('{error}', error.message || 'Unknown error'),
      { tone: 'error', timeout: 8000 }
    );
  }
}

export function initializeDashboardExport() {
  const button = $('export-dashboard-data-btn');
  if (button && button.dataset.bound !== 'true') {
    button.dataset.bound = 'true';
    button.addEventListener('click', exportDashboardTelemetryData);
  }

  document.addEventListener('app:telemetry-chart-changed', updateDashboardExportButtonState);
  updateDashboardExportButtonState();
}
