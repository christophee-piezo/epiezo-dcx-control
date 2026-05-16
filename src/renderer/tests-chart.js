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

let testsChart = null;
let idealSamples = [];
let actualSamples = [];
let idealLabel = 'Ideal';
let actualLabel = 'Actual';
let actualCaptureActive = false;

function getAxisSelection(axis) {
  const fallback = axis === 'x' ? 'time' : 'frequency';
  return $(axis === 'x' ? 'tests-chart-x-axis' : 'tests-chart-y-axis')?.value || fallback;
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
  if (![getAxisSelection('x'), getAxisSelection('y')].includes('power')) {
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

function rebuildTestsChart() {
  if (!testsChart) {
    return;
  }

  const xAxis = getAxisSelection('x');
  const yAxis = getAxisSelection('y');
  const xMeta = getAxisMeta(xAxis);
  const yMeta = getAxisMeta(yAxis);

  testsChart.data.datasets[0].label = `${idealLabel} · ${t(yMeta.labelKey, 'Y')} vs ${t(xMeta.labelKey, 'X')}`;
  testsChart.data.datasets[0].data = buildChartPoints(idealSamples);
  testsChart.data.datasets[1].label = `${actualLabel} · ${t(yMeta.labelKey, 'Y')} vs ${t(xMeta.labelKey, 'X')}`;
  testsChart.data.datasets[1].data = buildChartPoints(actualSamples);
  testsChart.options.scales.x.title.text = formatAxisTitle(xAxis);
  testsChart.options.scales.y.title.text = formatAxisTitle(yAxis);
  testsChart.options.scales.x.min = xMeta.min ?? undefined;
  testsChart.options.scales.x.max = xMeta.max ?? undefined;
  testsChart.options.scales.y.min = yMeta.min ?? undefined;
  testsChart.options.scales.y.max = yMeta.max ?? undefined;
  testsChart.update('none');
}

export function clearTestsComparisonChart() {
  idealSamples = [];
  actualSamples = [];
  idealLabel = 'Ideal';
  actualLabel = runtimeState.simulation ? 'Simulated' : 'Measured';
  actualCaptureActive = false;
  rebuildTestsChart();
}

export function setIdealTestSamples(samples = [], label = 'Ideal') {
  idealSamples = samples.map((sample) => ({
    timestamp: sample.timestamp,
    telemetry: {
      ...sample.telemetry
    }
  }));
  idealLabel = label;
  rebuildTestsChart();
}

export function clearActualTestSamples() {
  actualSamples = [];
  rebuildTestsChart();
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
    select.addEventListener('change', () => {
      syncGraphAxisAssignmentRequirements();
      rebuildTestsChart();
    });
  });

  document.addEventListener('app:language-changed', rebuildTestsChart);

  syncGraphAxisAssignmentRequirements();
  rebuildTestsChart();
}
