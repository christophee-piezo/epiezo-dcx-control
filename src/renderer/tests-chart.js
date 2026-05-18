import Chart from 'chart.js/auto';

import { t } from './preferences.js';
import { $, runtimeState } from './runtime.js';

const AXIS_OPTIONS = {
  time: { labelKey: 'chart.axis.time', unit: 's', min: 0 },
  frequency: { labelKey: 'chart.axis.frequency', unit: 'Hz' },
  amplitude: { labelKey: 'chart.axis.amplitude', unit: '%', min: 0, max: 100 },
  power: { labelKey: 'chart.axis.power', unit: '%', min: 0, max: 100 },
  cycles: { labelKey: 'chart.axis.cycles', unit: '', min: 0 },
  aux1: { labelKey: 'chart.axis.aux1', unit: 'mV' },
  aux2: { labelKey: 'chart.axis.aux2', unit: 'mV' }
};
const SERIES_AXIS_MAP = {
  time: 'yTime',
  frequency: 'y',
  amplitude: 'yPercent',
  power: 'yPercent',
  cycles: 'yCycles',
  aux1: 'yAux',
  aux2: 'yAux'
};

let testsChart = null;
let idealSamples = [];
let actualSamples = [];
let idealLabel = 'Ideal';
let actualLabel = 'Actual';
let actualCaptureActive = false;

function normalizeChartSample(sample) {
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

function normalizeChartSamples(samples = []) {
  if (!Array.isArray(samples)) {
    return [];
  }

  return samples.map(normalizeChartSample).filter(Boolean);
}

function notifyTestsComparisonChanged() {
  document.dispatchEvent(new CustomEvent('app:tests-comparison-changed'));
}

function getAxisSelectionValues(axis) {
  const fallback = axis === 'x' ? ['time'] : ['frequency'];
  const element = $(axis === 'x' ? 'tests-chart-x-axis' : 'tests-chart-y-axis');
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

function isMultiplotEnabled() {
  return getSelectedYAxisSeries().length > 1;
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
    return Number((((sample.timestamp || 0) - firstTimestamp) / 1000).toFixed(2));
  }

  return getTelemetryAxisValue(sample.telemetry, axisKey);
}

function hasChartableTelemetry(telemetry = {}) {
  return ['frequency', 'amplitude', 'power', 'cycles', 'aux1', 'aux2'].some((field) => getTelemetryAxisValue(telemetry, field) != null);
}

function buildChartPoints(samples = []) {
  const xAxis = getAxisSelection('x');
  const yAxis = getAxisSelection('y');
  const firstTimestamp = samples[0]?.timestamp || 0;

  return samples
    .map((sample) => {
      const x = getAxisValue(sample, xAxis, firstTimestamp);
      const y = getAxisValue(sample, yAxis, firstTimestamp);
      return x == null || y == null ? null : { x, y };
    })
    .filter(Boolean);
}

function buildChartPointsForAxis(samples = [], yAxis) {
  const xAxis = getAxisSelection('x');
  const firstTimestamp = samples[0]?.timestamp || 0;

  return samples
    .map((sample) => {
      const x = getAxisValue(sample, xAxis, firstTimestamp);
      const y = getAxisValue(sample, yAxis, firstTimestamp);
      return x == null || y == null ? null : { x, y };
    })
    .filter(Boolean);
}

function formatAxisTitle(axisKey) {
  const meta = getAxisMeta(axisKey);
  const label = t(meta.labelKey, axisKey);
  return meta.unit ? `${label} (${meta.unit})` : label;
}

function createDataset({ label, color, dash = [] }) {
  return {
    label,
    data: [],
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    borderDash: dash,
    pointRadius: 0,
    tension: 0.22,
    showLine: true
  };
}

function createComparisonDataset({ label, axisKey, samples = [], dash = [] }) {
  const baseColor = axisKey === 'frequency'
    ? '#38bdf8'
    : axisKey === 'amplitude'
      ? '#a78bfa'
      : axisKey === 'power'
        ? '#f59e0b'
        : axisKey === 'cycles'
          ? '#34d399'
          : axisKey === 'aux1'
            ? '#f472b6'
            : axisKey === 'aux2'
              ? '#22d3ee'
              : '#94a3b8';

  return {
    ...createDataset({
      label,
      color: baseColor,
      dash
    }),
    data: buildChartPointsForAxis(samples, axisKey),
    yAxisID: SERIES_AXIS_MAP[axisKey] || 'y'
  };
}

function syncTestsScaleVisibility() {
  if (!testsChart) {
    return;
  }

  const datasets = testsChart.data.datasets || [];
  const axisUsage = new Set(datasets.map((dataset) => dataset.yAxisID || 'y'));
  const multiPlotEnabled = isMultiplotEnabled();

  testsChart.options.scales.y.display = axisUsage.has('y');
  testsChart.options.scales.yPercent.display = multiPlotEnabled && axisUsage.has('yPercent');
  testsChart.options.scales.yCycles.display = multiPlotEnabled && axisUsage.has('yCycles');
  testsChart.options.scales.yAux.display = multiPlotEnabled && axisUsage.has('yAux');
  testsChart.options.scales.yTime.display = multiPlotEnabled && axisUsage.has('yTime');
}

function rebuildTestsChart() {
  if (!testsChart) {
    return;
  }

  const xAxis = getAxisSelection('x');
  const yAxisSelections = getSelectedYAxisSeries();
  const yAxis = yAxisSelections[0];
  const xMeta = getAxisMeta(xAxis);
  const yMeta = getAxisMeta(yAxis);
  const multiPlotEnabled = isMultiplotEnabled();
  const primaryYAxis = yAxisSelections.find((axisKey) => (SERIES_AXIS_MAP[axisKey] || 'y') === 'y') || 'frequency';
  const primaryPercentAxis = yAxisSelections.find((axisKey) => SERIES_AXIS_MAP[axisKey] === 'yPercent') || 'amplitude';
  const primaryCyclesAxis = yAxisSelections.find((axisKey) => SERIES_AXIS_MAP[axisKey] === 'yCycles') || 'cycles';
  const primaryAuxAxis = yAxisSelections.find((axisKey) => SERIES_AXIS_MAP[axisKey] === 'yAux') || 'aux1';

  testsChart.data.datasets = multiPlotEnabled
    ? yAxisSelections.flatMap((axisKey) => ([
        createComparisonDataset({
          label: `${idealLabel} · ${t(getAxisMeta(axisKey).labelKey, axisKey)}`,
          axisKey,
          samples: idealSamples,
          dash: [7, 5]
        }),
        createComparisonDataset({
          label: `${actualLabel} · ${t(getAxisMeta(axisKey).labelKey, axisKey)}`,
          axisKey,
          samples: actualSamples
        })
      ]))
    : [
        {
          ...createDataset({ label: `${idealLabel} · ${t(yMeta.labelKey, 'Y')} vs ${t(xMeta.labelKey, 'X')}`, color: '#a78bfa', dash: [7, 5] }),
          data: buildChartPoints(idealSamples)
        },
        {
          ...createDataset({ label: `${actualLabel} · ${t(yMeta.labelKey, 'Y')} vs ${t(xMeta.labelKey, 'X')}`, color: '#38bdf8' }),
          data: buildChartPoints(actualSamples)
        }
      ];
  testsChart.options.scales.x.title.text = formatAxisTitle(xAxis);
  testsChart.options.scales.y.title.text = multiPlotEnabled ? formatAxisTitle(primaryYAxis) : formatAxisTitle(yAxis);
  testsChart.options.scales.x.min = xMeta.min ?? undefined;
  testsChart.options.scales.x.max = xMeta.max ?? undefined;
  testsChart.options.scales.y.min = multiPlotEnabled ? undefined : yMeta.min ?? undefined;
  testsChart.options.scales.y.max = multiPlotEnabled ? undefined : yMeta.max ?? undefined;
  testsChart.options.scales.yPercent.title.text = formatAxisTitle(primaryPercentAxis);
  testsChart.options.scales.yCycles.title.text = formatAxisTitle(primaryCyclesAxis);
  testsChart.options.scales.yAux.title.text = formatAxisTitle(primaryAuxAxis);
  testsChart.options.scales.yTime.title.text = formatAxisTitle('time');
  syncTestsScaleVisibility();
  testsChart.update('none');
}

export function clearTestsComparisonChart() {
  idealSamples = [];
  actualSamples = [];
  idealLabel = 'Ideal';
  actualLabel = runtimeState.simulation ? 'Simulated' : 'Measured';
  actualCaptureActive = false;
  rebuildTestsChart();
  notifyTestsComparisonChanged();
}

export function setIdealTestSamples(samples = [], label = 'Ideal') {
  idealSamples = normalizeChartSamples(samples);
  idealLabel = label;
  rebuildTestsChart();
  notifyTestsComparisonChanged();
}

export function clearActualTestSamples() {
  actualSamples = [];
  rebuildTestsChart();
  notifyTestsComparisonChanged();
}

export function beginActualTestCapture(label = runtimeState.simulation ? 'Simulated' : 'Measured') {
  actualSamples = [];
  actualLabel = label;
  actualCaptureActive = true;

  if (runtimeState.status === 'online' && hasChartableTelemetry(runtimeState.lastTelemetry || {})) {
    actualSamples.push({
      timestamp: Date.now(),
      telemetry: {
        ...runtimeState.lastTelemetry
      }
    });
  }

  rebuildTestsChart();
  notifyTestsComparisonChanged();
}

export function endActualTestCapture() {
  if (actualCaptureActive && runtimeState.status === 'online' && hasChartableTelemetry(runtimeState.lastTelemetry || {})) {
    actualSamples.push({
      timestamp: Date.now(),
      telemetry: {
        ...runtimeState.lastTelemetry
      }
    });
  }

  actualCaptureActive = false;
  rebuildTestsChart();
  notifyTestsComparisonChanged();
}

export function appendActualTestSample(telemetry = {}) {
  if (!actualCaptureActive || !hasChartableTelemetry(telemetry)) {
    return;
  }

  actualSamples.push({
    timestamp: Date.now(),
    telemetry: {
      ...telemetry
    }
  });

  rebuildTestsChart();
  notifyTestsComparisonChanged();
}

export function getTestsComparisonSnapshot() {
  return {
    idealSamples: normalizeChartSamples(idealSamples),
    actualSamples: normalizeChartSamples(actualSamples),
    idealLabel,
    actualLabel,
    selectedSeries: getSelectedYAxisSeries()
  };
}

export function restoreTestsComparisonSnapshot(state = {}) {
  idealSamples = normalizeChartSamples(state.idealSamples);
  actualSamples = normalizeChartSamples(state.actualSamples);
  idealLabel = typeof state.idealLabel === 'string' && state.idealLabel.trim()
    ? state.idealLabel
    : 'Ideal';
  actualLabel = typeof state.actualLabel === 'string' && state.actualLabel.trim()
    ? state.actualLabel
    : (runtimeState.simulation ? 'Simulated' : 'Measured');
  actualCaptureActive = false;
  rebuildTestsChart();
}

export function initializeTestsComparisonChart() {
  const canvas = $('tests-telemetry-chart');
  if (!canvas || testsChart) {
    return;
  }

  testsChart = new Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [
        createDataset({ label: 'Ideal', color: '#a78bfa', dash: [7, 5] }),
        createDataset({ label: runtimeState.simulation ? 'Simulated' : 'Measured', color: '#38bdf8' })
      ]
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

  const clearButton = $('clear-tests-chart-btn');
  if (clearButton && clearButton.dataset.bound !== 'true') {
    clearButton.dataset.bound = 'true';
    clearButton.addEventListener('click', clearTestsComparisonChart);
  }

  ['tests-chart-x-axis', 'tests-chart-y-axis'].forEach((id) => {
    const select = $(id);
    if (!select || select.dataset.bound === 'true') {
      return;
    }

    select.dataset.bound = 'true';
    const handleSelectionChange = () => {
      syncGraphAxisAssignmentRequirements();
      rebuildTestsChart();
    };

    select.addEventListener('change', handleSelectionChange);
    select.addEventListener('input', handleSelectionChange);
  });

  document.addEventListener('app:language-changed', rebuildTestsChart);

  syncGraphAxisAssignmentRequirements();
  rebuildTestsChart();
}
