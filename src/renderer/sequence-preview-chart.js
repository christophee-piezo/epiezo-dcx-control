import Chart from 'chart.js/auto';

import { t } from './preferences.js';
import { $, getTimeline } from './runtime.js';

let sequencePreviewChart = null;
let syncScrollInProgress = false;

function readNumber(id, fallback = 0) {
  const value = Number($(id)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function getLoopCount() {
  return Math.max(1, Math.round(readNumber('seq-loop-count', 1)) || 1);
}

function addPoint(points, timeMs, amplitude) {
  const x = Number((Math.max(0, timeMs) / 1000).toFixed(2));
  const y = Math.max(0, Math.min(100, Number(amplitude) || 0));
  const lastPoint = points[points.length - 1];

  if (lastPoint && lastPoint.x === x && lastPoint.y === y) {
    return;
  }

  points.push({ x, y });
}

function buildSequencePreview() {
  const timeline = getTimeline();
  const loopCount = getLoopCount();
  const points = [];
  let elapsedMs = 0;
  let currentAmplitude = 0;

  addPoint(points, elapsedMs, currentAmplitude);

  for (let loopIndex = 0; loopIndex < loopCount; loopIndex += 1) {
    timeline.forEach((block) => {
      const durationMs = Math.max(0, Number(block.duration) || 0);

      if (block.type === 'PULSE') {
        const targetAmplitude = Math.max(0, Math.min(100, Number(block.amplitude) || 0));
        const rampMs = Math.min(Math.max(0, Number(block.ramp) || 0), durationMs);

        addPoint(points, elapsedMs, currentAmplitude);

        if (rampMs > 0 && currentAmplitude !== targetAmplitude) {
          elapsedMs += rampMs;
          addPoint(points, elapsedMs, targetAmplitude);
        } else {
          addPoint(points, elapsedMs, targetAmplitude);
        }

        elapsedMs += Math.max(0, durationMs - rampMs);
        addPoint(points, elapsedMs, targetAmplitude);
        currentAmplitude = targetAmplitude;
        return;
      }

      addPoint(points, elapsedMs, currentAmplitude);
      addPoint(points, elapsedMs, 0);
      elapsedMs += durationMs;
      addPoint(points, elapsedMs, 0);
      currentAmplitude = 0;
    });
  }

  return {
    points,
    totalDurationMs: elapsedMs,
    loopCount,
    blockCount: timeline.length
  };
}

function getScrollProgress(element) {
  if (!element) {
    return 0;
  }

  const maxScrollLeft = element.scrollWidth - element.clientWidth;
  if (maxScrollLeft <= 0) {
    return 0;
  }

  return element.scrollLeft / maxScrollLeft;
}

function setScrollProgress(element, progress) {
  if (!element) {
    return;
  }

  const maxScrollLeft = element.scrollWidth - element.clientWidth;
  if (maxScrollLeft <= 0) {
    element.scrollLeft = 0;
    return;
  }

  element.scrollLeft = Math.max(0, Math.min(maxScrollLeft, progress * maxScrollLeft));
}

function syncSequenceWorkspaceScroll(source, target) {
  if (!source || !target || syncScrollInProgress) {
    return;
  }

  syncScrollInProgress = true;
  setScrollProgress(target, getScrollProgress(source));
  syncScrollInProgress = false;
}

function bindSequenceWorkspaceScrollSync() {
  const previewScroll = $('sequence-preview-scroll');
  const timelineScroll = $('main-timeline');

  if (previewScroll && previewScroll.dataset.scrollSyncBound !== 'true') {
    previewScroll.dataset.scrollSyncBound = 'true';
    previewScroll.addEventListener('scroll', () => {
      syncSequenceWorkspaceScroll(previewScroll, timelineScroll);
    });
  }

  if (timelineScroll && timelineScroll.dataset.scrollSyncBound !== 'true') {
    timelineScroll.dataset.scrollSyncBound = 'true';
    timelineScroll.addEventListener('scroll', () => {
      syncSequenceWorkspaceScroll(timelineScroll, previewScroll);
    });
  }
}

function updatePreviewFrameWidth({ blockCount, totalDurationMs }) {
  const frame = $('sequence-preview-chart-frame');
  const scroll = $('sequence-preview-scroll');
  const timelineScroll = $('main-timeline');
  if (!frame) {
    return;
  }

  const availableWidth = scroll?.clientWidth || frame.parentElement?.clientWidth || 0;
  const durationSeconds = totalDurationMs / 1000;
  const timelineWidth = timelineScroll?.scrollWidth || 0;
  const targetWidth = Math.max(560, availableWidth, timelineWidth, blockCount * 152, durationSeconds * 48);
  frame.style.width = `${Math.round(targetWidth)}px`;
}

function updatePreviewSummary({ totalDurationMs, loopCount, blockCount }) {
  const summary = $('sequence-preview-summary');
  if (!summary) {
    return;
  }

  const durationSeconds = Number((totalDurationMs / 1000).toFixed(totalDurationMs >= 10000 ? 1 : 2));
  const blockLabel = blockCount === 1
    ? t('sequencer.blocks.single', 'block')
    : t('sequencer.blocks.plural', 'blocks');
  const loopLabel = loopCount === 1
    ? t('sequencer.preview.loopSingle', 'loop')
    : t('sequencer.preview.loopPlural', 'loops');

  summary.textContent = `${blockCount} ${blockLabel} · ${loopCount} ${loopLabel} · ${durationSeconds}s`;
}

export function refreshSequencePreviewChart() {
  if (!sequencePreviewChart) {
    return;
  }

  const preview = buildSequencePreview();
  updatePreviewFrameWidth(preview);
  sequencePreviewChart.resize();
  syncSequenceWorkspaceScroll($('main-timeline'), $('sequence-preview-scroll'));
  sequencePreviewChart.data.datasets[0].label = t('sequencer.preview.dataset', 'Sequence Preview');
  sequencePreviewChart.data.datasets[0].data = preview.points;
  sequencePreviewChart.options.scales.x.title.text = `${t('chart.axis.time', 'Time')} (s)`;
  sequencePreviewChart.options.scales.y.title.text = `${t('chart.axis.amplitude', 'Amplitude')} (%)`;
  sequencePreviewChart.update('none');
  updatePreviewSummary(preview);
}

export function initializeSequencePreviewChart() {
  const canvas = $('sequence-preview-chart');
  if (!canvas || sequencePreviewChart) {
    return;
  }

  sequencePreviewChart = new Chart(canvas, {
    type: 'line',
    data: {
      datasets: [
        {
          label: t('sequencer.preview.dataset', 'Sequence Preview'),
          data: [],
          borderColor: '#a78bfa',
          backgroundColor: 'rgba(167, 139, 250, 0.18)',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0
        }
      ]
    },
    options: {
      animation: false,
      maintainAspectRatio: false,
      parsing: false,
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
          min: 0,
          title: {
            display: true,
            color: '#cbd5e1',
            text: `${t('chart.axis.time', 'Time')} (s)`
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
          min: 0,
          max: 100,
          title: {
            display: true,
            color: '#cbd5e1',
            text: `${t('chart.axis.amplitude', 'Amplitude')} (%)`
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

  ['seq-loop-count'].forEach((id) => {
    const element = $(id);
    if (!element || element.dataset.sequencePreviewBound === 'true') {
      return;
    }

    element.dataset.sequencePreviewBound = 'true';
    element.addEventListener('input', refreshSequencePreviewChart);
    element.addEventListener('change', refreshSequencePreviewChart);
  });

  document.addEventListener('sequence-editor:changed', refreshSequencePreviewChart);
  document.addEventListener('app:language-changed', refreshSequencePreviewChart);
  window.addEventListener('resize', refreshSequencePreviewChart);
  bindSequenceWorkspaceScrollSync();

  refreshSequencePreviewChart();
}
