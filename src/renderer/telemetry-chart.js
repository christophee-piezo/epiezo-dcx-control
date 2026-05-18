import Chart from 'chart.js/auto';

import { t } from './preferences.js';
import { $, runtimeState } from './runtime.js';

const MAX_SAMPLES = 180;

const AXIS_OPTIONS = {
  time: { labelKey: 'chart.axis.time', unit: 's', color: '#38bdf8', min: 0 },
  frequency: { labelKey: 'chart.axis.frequency', unit: 'Hz', color: '#38bdf8' },
  amplitude: { labelKey: 'chart.axis.amplitude', unit: '%', color: '#a78bfa', min: 0, max: 100 },
  power: { labelKey: 'chart.axis.power', unit: '%', color: '#f59e0b', min: 0, max: 100 },
  cycles: { labelKey: 'chart.axis.cycles', unit: '', color: '#34d399', min: 0 },
  aux1: { labelKey: 'chart.axis.aux1', unit: 'mV', color: '#f472b6' },
  aux2: { labelKey: 'chart.axis.aux2', unit: 'mV', color: '#22d3ee' }
};

const MULTIPLOT_SERIES = [
  { key: 'time', axisId: 'yTime', min: 0, max: undefined },
  { key: 'frequency', axisId: 'y', min: undefined, max: undefined },
  { key: 'amplitude', axisId: 'yPercent', min: 0, max: 100 },
  { key: 'power', axisId: 'yPercent', min: 0, max: 100 },
  { key: 'cycles', axisId: 'yCycles', min: 0, max: undefined },
  { key: 'aux1', axisId: 'yAux', min: undefined, max: undefined },
  { key: 'aux2', axisId: 'yAux', min: undefined, max: undefined }
];

let telemetryChart = null;
let telemetrySamples = [];
let telemetryChartPaused = true;

function normalizeTelemetrySample(sample) {
  const timestamp = Number(sample?.timestamp);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return {
    timestamp,
    telemetry: sample?.telemetry && typeof sample.telemetry === 'object'
      ? { ...sample.telemetry }
      : {}
  };
}

function normalizeTelemetrySamples(samples = []) {
  if (!Array.isArray(samples)) {
    return [];
  }

  return samples.map(normalizeTelemetrySample).filter(Boolean);
}

function notifyTelemetryChartChanged() {
  document.dispatchEvent(new CustomEvent('app:telemetry-chart-changed'));
}

function syncSerialTelemetryGate(enabled) {
  window.api?.dcx?.setSerialTelemetryEnabled?.(enabled).catch(() => {});
}

function isMultiplotEnabled() {
  return getSelectedYAxisSeries().length > 1;
}

function getAxisSelectionValues(axis) {
  const fallback = axis === 'x' ? ['time'] : ['frequency'];
  const element = $(axis === 'x' ? 'chart-x-axis' : 'chart-y-axis');
  const rawValues = String(element?.dataset?.selectedValues || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (rawValues.length) {
    return rawValues;
  }

  if (element?.value) {
    return [element.value];
  }

  return fallback;
}

function getAxisSelection(axis) {
  return getAxisSelectionValues(axis)[0] || (axis === 'x' ? 'time' : 'frequency');
}

function getSelectedYAxisSeries() {
  const availableKeys = new Set(Object.keys(AXIS_OPTIONS));
  const values = getAxisSelectionValues('y').filter((value) => availableKeys.has(value));
  return values.length ? values : ['frequency'];
}

function getSeriesConfig(seriesKey) {
  return MULTIPLOT_SERIES.find((series) => series.key === seriesKey) || { key: seriesKey, axisId: 'y' };
}

function getAxisMeta(axisKey) {
  return AXIS_OPTIONS[axisKey] || AXIS_OPTIONS.frequency;
}

function getTelemetryAxisValue(telemetry = {}, axisKey) {
  if (axisKey === 'aux1') {
    const directValue = Number(telemetry?.aux1);
    if (Number.isFinite(directValue)) {
      return directValue;
    }

    const fallbackValue = Number(telemetry?.analogInputsMillivolts?.[2]);
    return Number.isFinite(fallbackValue) ? fallbackValue : null;
  }

  if (axisKey === 'aux2') {
    const directValue = Number(telemetry?.aux2);
    if (Number.isFinite(directValue)) {
      return directValue;
    }

    const fallbackValue = Number(telemetry?.analogInputsMillivolts?.[3]);
    return Number.isFinite(fallbackValue) ? fallbackValue : null;
  }

  const value = Number(telemetry?.[axisKey]);
  return Number.isFinite(value) ? value : null;
}

function syncGraphAxisAssignmentRequirements() {
  if (![getAxisSelection('x'), ...getSelectedYAxisSeries()].includes('power')) {
    return;
  }

  document.dispatchEvent(new CustomEvent('app:ensure-io-output-assignment', {
    detail: {
      output: 'powerOut'
    }
  }));
}

function getAxisValue(sample, axisKey, firstTimestamp) {
  if (axisKey === 'time') {
    return Number(((sample.timestamp - firstTimestamp) / 1000).toFixed(2));
  }

  return getTelemetryAxisValue(sample.telemetry, axisKey);
}

function getMultiplotAxisValue(sample, seriesKey, firstTimestamp) {
  return seriesKey === 'time'
    ? getAxisValue(sample, 'time', firstTimestamp)
    : getTelemetryAxisValue(sample.telemetry, seriesKey);
}

function shouldRecordTelemetrySample(telemetry = {}) {
  return runtimeState.status === 'online' && !telemetryChartPaused;
}

function syncTelemetryPlaybackUiState() {
  const playButton = $('play-chart-btn');
  const pauseButton = $('pause-chart-btn');

  if (playButton) {
    playButton.disabled = !telemetryChartPaused;
  }

  if (pauseButton) {
    pauseButton.disabled = telemetryChartPaused;
  }
}

function syncMultiplotControlState() {
  const xAxisSelect = $('chart-x-axis');
  const yAxisSelect = $('chart-y-axis');

  if (xAxisSelect) {
    xAxisSelect.disabled = false;
  }

  if (yAxisSelect) {
    yAxisSelect.disabled = false;
  }
}

export function playTelemetryChart() {
  telemetryChartPaused = false;
  syncSerialTelemetryGate(true);
  syncTelemetryPlaybackUiState();
}

export function pauseTelemetryChart() {
  telemetryChartPaused = true;
  syncSerialTelemetryGate(false);
  syncTelemetryPlaybackUiState();
}

function trimTelemetrySamples() {
  while (telemetrySamples.length > MAX_SAMPLES) {
    telemetrySamples.shift();
  }
}

function buildChartPoints() {
  const xAxis = getAxisSelection('x');
  const yAxis = getAxisSelection('y');
  const firstTimestamp = telemetrySamples[0]?.timestamp || Date.now();

  return telemetrySamples
    .map((sample) => {
      const x = getAxisValue(sample, xAxis, firstTimestamp);
      const y = getAxisValue(sample, yAxis, firstTimestamp);
      return x == null || y == null ? null : { x, y };
    })
    .filter(Boolean);
}

function buildMultiplotPoints(seriesKey) {
  const xAxis = getAxisSelection('x');
  const firstTimestamp = telemetrySamples[0]?.timestamp || Date.now();

  return telemetrySamples
    .map((sample) => {
      const x = getAxisValue(sample, xAxis, firstTimestamp);
      const y = getMultiplotAxisValue(sample, seriesKey, firstTimestamp);
      return x == null || y == null ? null : { x, y };
    })
    .filter(Boolean);
}

function formatAxisTitle(axisKey) {
  const meta = getAxisMeta(axisKey);
  const label = t(meta.labelKey, axisKey);
  return meta.unit ? `${label} (${meta.unit})` : label;
}

function buildSinglePlotDataset() {
  const yMeta = getAxisMeta(getSelectedYAxisSeries()[0]);
  return {
    label: `${t(yMeta.labelKey, 'Y')} vs ${t(getAxisMeta(getAxisSelection('x')).labelKey, 'X')}`,
    data: buildChartPoints(),
    borderColor: yMeta.color,
    backgroundColor: yMeta.color,
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.28,
    showLine: true,
    yAxisID: 'y'
  };
}

function buildMultiplotDatasets() {
  return getSelectedYAxisSeries().map((seriesKey) => {
    const meta = getAxisMeta(seriesKey);
    const series = getSeriesConfig(seriesKey);
    return {
      label: t(meta.labelKey, seriesKey),
      data: buildMultiplotPoints(seriesKey),
      borderColor: meta.color,
      backgroundColor: meta.color,
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.24,
      showLine: true,
      yAxisID: series.axisId
    };
  });
}

function syncTelemetryScaleVisibility() {
  if (!telemetryChart) {
    return;
  }

  const datasets = telemetryChart.data.datasets || [];
  const axisUsage = new Set(datasets.map((dataset) => dataset.yAxisID || 'y'));
  const multiPlotEnabled = isMultiplotEnabled();

  telemetryChart.options.scales.y.display = axisUsage.has('y');
  telemetryChart.options.scales.yPercent.display = multiPlotEnabled && axisUsage.has('yPercent');
  telemetryChart.options.scales.yCycles.display = multiPlotEnabled && axisUsage.has('yCycles');
  telemetryChart.options.scales.yAux.display = multiPlotEnabled && axisUsage.has('yAux');
  telemetryChart.options.scales.yTime.display = multiPlotEnabled && axisUsage.has('yTime');
}

function rebuildTelemetryChart() {
  if (!telemetryChart) {
    return;
  }

  syncMultiplotControlState();
  const yAxisSelections = getSelectedYAxisSeries();
  const multiPlotEnabled = isMultiplotEnabled();
  const xAxis = getAxisSelection('x');
  const yAxis = yAxisSelections[0];
  const xMeta = getAxisMeta(xAxis);
  const yMeta = getAxisMeta(yAxis);
  const primaryYAxis = yAxisSelections.find((seriesKey) => getSeriesConfig(seriesKey).axisId === 'y') || 'frequency';
  const primaryPercentAxis = yAxisSelections.find((seriesKey) => getSeriesConfig(seriesKey).axisId === 'yPercent') || 'amplitude';
  const primaryCyclesAxis = yAxisSelections.find((seriesKey) => getSeriesConfig(seriesKey).axisId === 'yCycles') || 'cycles';
  const primaryAuxAxis = yAxisSelections.find((seriesKey) => getSeriesConfig(seriesKey).axisId === 'yAux') || 'aux1';

  telemetryChart.data.datasets = multiPlotEnabled ? buildMultiplotDatasets() : [buildSinglePlotDataset()];
  telemetryChart.options.scales.x.title.text = formatAxisTitle(xAxis);
  telemetryChart.options.scales.y.title.text = multiPlotEnabled
    ? formatAxisTitle(primaryYAxis)
    : formatAxisTitle(yAxis);
  telemetryChart.options.scales.x.min = xMeta.min ?? undefined;
  telemetryChart.options.scales.x.max = xMeta.max ?? undefined;
  telemetryChart.options.scales.y.min = multiPlotEnabled ? undefined : yMeta.min ?? undefined;
  telemetryChart.options.scales.y.max = multiPlotEnabled ? undefined : yMeta.max ?? undefined;
  telemetryChart.options.scales.yPercent.title.text = formatAxisTitle(primaryPercentAxis);
  telemetryChart.options.scales.yCycles.title.text = formatAxisTitle(primaryCyclesAxis);
  telemetryChart.options.scales.yAux.title.text = formatAxisTitle(primaryAuxAxis);
  telemetryChart.options.scales.yTime.title.text = formatAxisTitle('time');
  syncTelemetryScaleVisibility();
  telemetryChart.update('none');
}

export function clearTelemetryChart() {
  telemetrySamples = [];
  rebuildTelemetryChart();
  notifyTelemetryChartChanged();
}

export function appendTelemetrySample(telemetry = {}) {
  if (!telemetryChart || !shouldRecordTelemetrySample(telemetry)) {
    return;
  }

  const hasChartableTelemetry = ['frequency', 'amplitude', 'power', 'cycles', 'aux1', 'aux2'].some((field) => {
    return getTelemetryAxisValue(telemetry, field) != null;
  });

  if (!hasChartableTelemetry) {
    return;
  }

  telemetrySamples.push({
    timestamp: Date.now(),
    telemetry: {
      ...telemetry
    }
  });
  trimTelemetrySamples();
  rebuildTelemetryChart();
  notifyTelemetryChartChanged();
}

export function getTelemetryChartSnapshot() {
  return {
    samples: normalizeTelemetrySamples(telemetrySamples),
    paused: telemetryChartPaused,
    multiPlotEnabled: isMultiplotEnabled(),
    selectedSeries: getSelectedYAxisSeries()
  };
}

export function initializeTelemetryChart() {
  const canvas = $('telemetry-chart');
  if (!canvas || telemetryChart) {
    return;
  }

  telemetryChart = new Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: []
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
          labels: {
            color: '#cbd5e1',
            boxWidth: 10,
            usePointStyle: true,
            pointStyle: 'line'
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            color: '#cbd5e1',
            text: formatAxisTitle(getAxisSelection('x'))
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
            text: formatAxisTitle(getAxisSelection('y'))
          },
          ticks: {
            color: '#cbd5e1'
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.08)'
          }
        },
        yPercent: {
          type: 'linear',
          position: 'right',
          min: 0,
          max: 100,
          display: false,
          title: {
            display: true,
            color: '#cbd5e1',
            text: ''
          },
          ticks: {
            color: '#cbd5e1'
          },
          grid: {
            drawOnChartArea: false,
            color: 'rgba(148, 163, 184, 0.08)'
          }
        },
        yCycles: {
          type: 'linear',
          position: 'left',
          display: false,
          title: {
            display: true,
            color: '#cbd5e1',
            text: ''
          },
          ticks: {
            color: '#cbd5e1'
          },
          grid: {
            drawOnChartArea: false,
            color: 'rgba(148, 163, 184, 0.08)'
          }
        },
        yAux: {
          type: 'linear',
          position: 'right',
          display: false,
          title: {
            display: true,
            color: '#cbd5e1',
            text: ''
          },
          ticks: {
            color: '#cbd5e1'
          },
          grid: {
            drawOnChartArea: false,
            color: 'rgba(148, 163, 184, 0.08)'
          }
        },
        yTime: {
          type: 'linear',
          position: 'left',
          display: false,
          min: 0,
          title: {
            display: true,
            color: '#cbd5e1',
            text: ''
          },
          ticks: {
            color: '#cbd5e1'
          },
          grid: {
            drawOnChartArea: false,
            color: 'rgba(148, 163, 184, 0.08)'
          }
        }
      }
    }
  });

  const clearButton = $('clear-chart-btn');
  if (clearButton && clearButton.dataset.bound !== 'true') {
    clearButton.dataset.bound = 'true';
    clearButton.addEventListener('click', clearTelemetryChart);
  }

  const playButton = $('play-chart-btn');
  if (playButton && playButton.dataset.bound !== 'true') {
    playButton.dataset.bound = 'true';
    playButton.addEventListener('click', playTelemetryChart);
  }

  const pauseButton = $('pause-chart-btn');
  if (pauseButton && pauseButton.dataset.bound !== 'true') {
    pauseButton.dataset.bound = 'true';
    pauseButton.addEventListener('click', pauseTelemetryChart);
  }

  ['chart-x-axis', 'chart-y-axis'].forEach((id) => {
    const select = $(id);
    if (!select || select.dataset.bound === 'true') {
      return;
    }

    select.dataset.bound = 'true';
    const handleSelectionChange = () => {
      syncGraphAxisAssignmentRequirements();
      rebuildTelemetryChart();
    };

    select.addEventListener('change', handleSelectionChange);
    select.addEventListener('input', handleSelectionChange);
  });

  document.addEventListener('app:language-changed', rebuildTelemetryChart);

  syncTelemetryPlaybackUiState();
  syncSerialTelemetryGate(!telemetryChartPaused);
  syncGraphAxisAssignmentRequirements();
  rebuildTelemetryChart();
}
