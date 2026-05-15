import Chart from 'chart.js/auto';

import { t } from './preferences.js';
import { $, runtimeState } from './runtime.js';

const MAX_SAMPLES = 180;

const AXIS_OPTIONS = {
  time: { labelKey: 'chart.axis.time', unit: 's', color: '#38bdf8', min: 0 },
  frequency: { labelKey: 'chart.axis.frequency', unit: 'Hz', color: '#38bdf8' },
  amplitude: { labelKey: 'chart.axis.amplitude', unit: '%', color: '#a78bfa', min: 0, max: 100 },
  power: { labelKey: 'chart.axis.power', unit: '%', color: '#f59e0b', min: 0, max: 100 },
  cycles: { labelKey: 'chart.axis.cycles', unit: '', color: '#34d399', min: 0 }
};

let telemetryChart = null;
let telemetrySamples = [];
let telemetryChartPaused = true;

function getAxisSelection(axis) {
  const fallback = axis === 'x' ? 'time' : 'frequency';
  return $(axis === 'x' ? 'chart-x-axis' : 'chart-y-axis')?.value || fallback;
}

function getAxisMeta(axisKey) {
  return AXIS_OPTIONS[axisKey] || AXIS_OPTIONS.frequency;
}

function getAxisValue(sample, axisKey, firstTimestamp) {
  if (axisKey === 'time') {
    return Number(((sample.timestamp - firstTimestamp) / 1000).toFixed(2));
  }

  const value = Number(sample.telemetry?.[axisKey]);
  return Number.isFinite(value) ? value : null;
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

export function playTelemetryChart() {
  telemetryChartPaused = false;
  syncTelemetryPlaybackUiState();
}

export function pauseTelemetryChart() {
  telemetryChartPaused = true;
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

function formatAxisTitle(axisKey) {
  const meta = getAxisMeta(axisKey);
  const label = t(meta.labelKey, axisKey);
  return meta.unit ? `${label} (${meta.unit})` : label;
}

function rebuildTelemetryChart() {
  if (!telemetryChart) {
    return;
  }

  const xAxis = getAxisSelection('x');
  const yAxis = getAxisSelection('y');
  const xMeta = getAxisMeta(xAxis);
  const yMeta = getAxisMeta(yAxis);

  telemetryChart.data.datasets[0].label = `${t(yMeta.labelKey, 'Y')} vs ${t(xMeta.labelKey, 'X')}`;
  telemetryChart.data.datasets[0].borderColor = yMeta.color;
  telemetryChart.data.datasets[0].backgroundColor = yMeta.color;
  telemetryChart.data.datasets[0].data = buildChartPoints();
  telemetryChart.options.scales.x.title.text = formatAxisTitle(xAxis);
  telemetryChart.options.scales.y.title.text = formatAxisTitle(yAxis);
  telemetryChart.options.scales.x.min = xMeta.min ?? undefined;
  telemetryChart.options.scales.x.max = xMeta.max ?? undefined;
  telemetryChart.options.scales.y.min = yMeta.min ?? undefined;
  telemetryChart.options.scales.y.max = yMeta.max ?? undefined;
  telemetryChart.update('none');
}

function buildDataset() {
  const yMeta = getAxisMeta(getAxisSelection('y'));
  return {
    label: `${t(yMeta.labelKey, 'Y')} vs ${t(getAxisMeta(getAxisSelection('x')).labelKey, 'X')}`,
    data: [],
    borderColor: yMeta.color,
    backgroundColor: yMeta.color,
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.28,
    showLine: true
  };
}

export function clearTelemetryChart() {
  telemetrySamples = [];
  rebuildTelemetryChart();
}

export function appendTelemetrySample(telemetry = {}) {
  if (!telemetryChart || !shouldRecordTelemetrySample(telemetry)) {
    return;
  }

  const hasChartableTelemetry = ['frequency', 'amplitude', 'power', 'cycles'].some((field) => {
    const value = Number(telemetry[field]);
    return Number.isFinite(value);
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
}

export function initializeTelemetryChart() {
  const canvas = $('telemetry-chart');
  if (!canvas || telemetryChart) {
    return;
  }

  telemetryChart = new Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [buildDataset()]
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
    select.addEventListener('change', rebuildTelemetryChart);
  });

  document.addEventListener('app:language-changed', rebuildTelemetryChart);

  syncTelemetryPlaybackUiState();
  rebuildTelemetryChart();
}
