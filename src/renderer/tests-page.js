import { t } from './preferences.js';
import { $, runtimeState } from './runtime.js';
import { hasTeensyControlSource, runSequenceFromUi, runWorkflowFromUi, stopActiveSequence, stopActiveWorkflow } from './controls.js';
import { log } from './logger.js';
import { getSavedSequences, loadSequenceById } from './sequence-library.js';
import { getResolvedTelemetry, showFooterFeedback } from './status-ui.js';
import { getSavedWorkflows, loadWorkflowById } from './workflow-library.js';
import { buildStructuredCsvExport, buildStructuredJsonExport, formatExportTimestamp, sanitizeFileNameSegment } from './data-export.js';
import {
  appendActualTestSample,
  beginActualTestCapture,
  clearActualTestSamples,
  clearTestsComparisonChart,
  getTestsComparisonSnapshot,
  endActualTestCapture,
  initializeTestsComparisonChart,
  restoreTestsComparisonSnapshot,
  setIdealTestSamples
} from './tests-chart.js';

const IDEAL_SAMPLE_STEP_MS = 250;
const TESTS_AUTO_SAVE_STORE_KEY = 'tests-auto-save-data';
const TESTS_COMPARISON_STORE_KEY = 'tests-comparison-state';
const TESTS_COMPARISON_PERSIST_DELAY_MS = 200;
const TEST_EXPORT_COLUMNS = [
  'plotIndex',
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

let selectedTestKey = null;
let autoSaveTestKeys = new Set();
let testsComparisonPersistTimer = null;
let testsComparisonStorageBound = false;

function getFiniteLoopCount(value, fallback = 1) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text || text === 'inf' || text === 'infinite') {
    return fallback;
  }

  const numericValue = Number(text);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : fallback;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isExecutionActive() {
  const telemetry = getResolvedTelemetry(runtimeState.lastTelemetry || {});

  return Boolean(
    runtimeState.sequenceRunning ||
    runtimeState.workflowRunning ||
    telemetry.active ||
    telemetry.seek
  );
}

function buildTestKey(type, id) {
  return `${type}:${id}`;
}

function formatDate(value) {
  if (!value) {
    return '--';
  }

  return new Date(value).toLocaleDateString();
}

function getTestsAxisSelections() {
  const yAxisValues = String($('tests-chart-y-axis')?.dataset?.selectedValues || $('tests-chart-y-axis')?.value || 'frequency')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    xAxis: $('tests-chart-x-axis')?.value || 'time',
    yAxis: yAxisValues.join(', ') || 'frequency',
    yAxes: yAxisValues.length ? yAxisValues : ['frequency']
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

function getComparisonSeriesRows(samples = [], plotIndex = 0) {
  const firstTimestamp = Number(samples[0]?.timestamp) || 0;

  return samples.map((sample, index) => ({
    plotIndex,
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

function getComparisonExportPayload() {
  const snapshot = getTestsComparisonSnapshot();
  const selectedTest = getSelectedTest();
  const axes = getTestsAxisSelections();
  const rows = [
    ...getComparisonSeriesRows(snapshot.idealSamples, 0),
    ...getComparisonSeriesRows(snapshot.actualSamples, 1)
  ];

  return {
    metadata: {
      exportType: 'Test Comparison',
      exportedAt: new Date().toISOString(),
      testName: selectedTest?.name || '',
      testType: selectedTest?.type || '',
      updatedAt: selectedTest?.updatedAt ? new Date(selectedTest.updatedAt).toISOString() : '',
      summary: selectedTest?.summary || '',
      selectedXAxis: axes.xAxis,
      selectedYAxis: axes.yAxis,
      idealLabel: snapshot.idealLabel,
      actualLabel: snapshot.actualLabel,
      plotMapping: `0=${snapshot.idealLabel}; 1=${snapshot.actualLabel}`,
      idealSamples: snapshot.idealSamples.length,
      actualSamples: snapshot.actualSamples.length
    },
    snapshot,
    selectedTest,
    axes,
    rows
  };
}

function buildComparisonCsvExport(payload) {
  return buildStructuredCsvExport({
    infoTitle: 'Test Information',
    infoRows: [
      ['Export Type', payload.metadata.exportType],
      ['Exported At', payload.metadata.exportedAt],
      ['Test Name', payload.metadata.testName],
      ['Test Type', payload.metadata.testType],
      ['Updated At', payload.metadata.updatedAt],
      ['Summary', payload.metadata.summary],
      ['Selected X Axis', payload.metadata.selectedXAxis],
      ['Selected Y Axis', payload.metadata.selectedYAxis],
      ['Plot Mapping', payload.metadata.plotMapping],
      ['Ideal Label', payload.metadata.idealLabel],
      ['Actual Label', payload.metadata.actualLabel],
      ['Ideal Samples', payload.metadata.idealSamples],
      ['Actual Samples', payload.metadata.actualSamples]
    ],
    dataTitle: 'Test Data',
    dataColumns: TEST_EXPORT_COLUMNS,
    dataRows: payload.rows
  });
}

function buildComparisonJsonExport(payload) {
  return buildStructuredJsonExport({
    metadata: {
      ...payload.metadata,
      test: payload.selectedTest
        ? {
            id: payload.selectedTest.id,
            type: payload.selectedTest.type,
            name: payload.selectedTest.name,
            updatedAt: payload.selectedTest.updatedAt,
            summary: payload.selectedTest.summary
          }
        : null,
      axes: payload.axes,
      raw: payload.snapshot
    },
    dataColumns: TEST_EXPORT_COLUMNS,
    dataRows: payload.rows
  });
}

function updateTestsExportButtonState() {
  const exportButton = $('export-tests-data-btn');
  if (!exportButton) {
    return;
  }

  const snapshot = getTestsComparisonSnapshot();
  exportButton.disabled = !snapshot.idealSamples.length && !snapshot.actualSamples.length;
}

async function exportTestsComparisonData() {
  const payload = getComparisonExportPayload();
  const { rows } = payload;
  if (!rows.length) {
    const message = t('tests.export.noData', 'No test comparison data available to export.');
    log({ tests_export: message });
    showFooterFeedback(message, { tone: 'warning', timeout: 5000 });
    return;
  }

  if (typeof window.api?.dataExport?.saveFile !== 'function') {
    const message = t('tests.export.error', 'Test data export failed: {error}').replace('{error}', 'Export is unavailable');
    log({ tests_export_error: 'Export is unavailable.' });
    showFooterFeedback(message, { tone: 'error', timeout: 8000 });
    return;
  }

  const safeName = sanitizeFileNameSegment(payload.selectedTest?.name || `${payload.snapshot.actualLabel || payload.snapshot.idealLabel || 'test-comparison'}-data`, 'test-comparison');
  const suggestedName = `${safeName}-${formatExportTimestamp()}.csv`;

  try {
    const result = await window.api.dataExport.saveFile({
      title: 'Export Test Comparison Data',
      suggestedName,
      preferredExtension: '.csv',
      csvContent: buildComparisonCsvExport(payload),
      jsonContent: buildComparisonJsonExport(payload)
    });

    if (!result?.success) {
      return;
    }

    log({ tests_export: { fileName: result.fileName, format: result.format, rows: rows.length } });
    showFooterFeedback(
      t('tests.export.success', 'Test comparison exported: {name}').replace('{name}', result.fileName || suggestedName),
      { tone: 'success', timeout: 5000 }
    );
  } catch (error) {
    log({ tests_export_error: error.message });
    showFooterFeedback(
      t('tests.export.error', 'Test data export failed: {error}').replace('{error}', error.message || 'Unknown error'),
      { tone: 'error', timeout: 8000 }
    );
  }
}

async function autoSaveTestsComparisonData(test) {
  const payload = getComparisonExportPayload();
  if (!payload.rows.length || !test || typeof window.api?.dataExport?.autoSaveFile !== 'function') {
    return;
  }

  const fileName = `${sanitizeFileNameSegment(`${test.type}-${test.name}`, 'test-data')}-${formatExportTimestamp()}.csv`;

  try {
    const result = await window.api.dataExport.autoSaveFile({
      folderName: 'Test Data',
      fileName,
      preferredExtension: '.csv',
      csvContent: buildComparisonCsvExport(payload),
      jsonContent: buildComparisonJsonExport(payload)
    });

    if (!result?.success) {
      return;
    }

    log({ tests_auto_save: { fileName: result.fileName, rows: payload.rows.length } });
    showFooterFeedback(
      t('tests.autoSave.success', 'Test data stored automatically: {name}').replace('{name}', result.fileName || fileName),
      { tone: 'success', timeout: 5000 }
    );
  } catch (error) {
    log({ tests_auto_save_error: error.message });
    showFooterFeedback(
      t('tests.autoSave.error', 'Automatic test data save failed: {error}').replace('{error}', error.message || 'Unknown error'),
      { tone: 'error', timeout: 8000 }
    );
  }
}

function normalizeStoredTestsComparisonState(value) {
  if (!value || typeof value !== 'object') {
    return {
      selectedTestKey: null,
      chartState: null
    };
  }

  return {
    selectedTestKey: typeof value.selectedTestKey === 'string' && value.selectedTestKey.trim()
      ? value.selectedTestKey.trim()
      : null,
    chartState: value.chartState && typeof value.chartState === 'object'
      ? value.chartState
      : null
  };
}

function scheduleTestsComparisonPersistence() {
  if (testsComparisonPersistTimer) {
    window.clearTimeout(testsComparisonPersistTimer);
  }

  testsComparisonPersistTimer = window.setTimeout(() => {
    testsComparisonPersistTimer = null;
    const persistResult = window.api?.store?.set?.(TESTS_COMPARISON_STORE_KEY, {
      selectedTestKey,
      chartState: getTestsComparisonSnapshot()
    });
    if (persistResult && typeof persistResult.catch === 'function') {
      persistResult.catch(() => {});
    }
  }, TESTS_COMPARISON_PERSIST_DELAY_MS);
}

async function loadStoredTestsComparisonState() {
  try {
    const stored = normalizeStoredTestsComparisonState(await window.api.store.get(TESTS_COMPARISON_STORE_KEY));
    selectedTestKey = stored.selectedTestKey;

    if (stored.chartState) {
      restoreTestsComparisonSnapshot(stored.chartState);
    }

    setSelectedTestMeta(getSelectedTest());
    renderTestsList();
  } catch {
    selectedTestKey = null;
    clearTestsComparisonChart();
    setSelectedTestMeta(null);
    renderTestsList();
  }
}

async function loadStoredAutoSavePreferences() {
  try {
    const stored = await window.api.store.get(TESTS_AUTO_SAVE_STORE_KEY);
    autoSaveTestKeys = new Set(Array.isArray(stored) ? stored.filter((value) => typeof value === 'string' && value) : []);
  } catch {
    autoSaveTestKeys = new Set();
  }
}

async function persistAutoSavePreferences() {
  await window.api.store.set(TESTS_AUTO_SAVE_STORE_KEY, [...autoSaveTestKeys]);
}

function getSelectedTest() {
  return getAllTests().find((test) => buildTestKey(test.type, test.id) === selectedTestKey) || null;
}

function getAllTests() {
  const sequences = getSavedSequences().map((sequence) => ({
    id: sequence.id,
    type: 'sequence',
    name: sequence.name,
    updatedAt: sequence.updatedAt || sequence.createdAt || Date.now(),
    createdAt: sequence.createdAt || sequence.updatedAt || Date.now(),
    blockCount: sequence.timeline.length,
    summary: `${sequence.timeline.length} ${sequence.timeline.length === 1 ? t('sequencer.blocks.single', 'block') : t('sequencer.blocks.plural', 'blocks')}`,
    payload: sequence
  }));

  const workflows = getSavedWorkflows().map((workflow) => {
    const lineCount = Math.max(1, String(workflow.script || '').split('\n').filter((line) => line.trim()).length);
    return {
      id: workflow.id,
      type: 'workflow',
      name: workflow.name,
      updatedAt: workflow.updatedAt || workflow.createdAt || Date.now(),
      createdAt: workflow.createdAt || workflow.updatedAt || Date.now(),
      blockCount: lineCount,
      summary: `${lineCount} ${lineCount === 1 ? t('workflow.library.lineSingle', 'line') : t('workflow.library.linePlural', 'lines')}`,
      payload: workflow
    };
  });

  return [...sequences, ...workflows];
}

function isAutoSaveEnabledForTest(test) {
  return Boolean(test && autoSaveTestKeys.has(buildTestKey(test.type, test.id)));
}

function getFilterType() {
  return document.querySelector('[data-tests-filter].active')?.dataset.testsFilter || 'all';
}

function getSortMode() {
  return $('tests-sort')?.value || 'date';
}

function compareTestsByName(a, b) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
}

function sortTests(tests) {
  const sortMode = getSortMode();
  const items = [...tests];

  if (sortMode === 'name') {
    return items.sort((a, b) => compareTestsByName(a, b) || b.updatedAt - a.updatedAt);
  }

  if (sortMode === 'blocks') {
    return items.sort((a, b) => b.blockCount - a.blockCount || compareTestsByName(a, b));
  }

  return items.sort((a, b) => b.updatedAt - a.updatedAt || compareTestsByName(a, b));
}

function getFilteredTests() {
  const filterType = getFilterType();
  const searchValue = ($('tests-search')?.value || '').trim().toLowerCase();

  return sortTests(getAllTests().filter((test) => {
    if (filterType !== 'all' && test.type !== filterType) {
      return false;
    }

    if (searchValue && !`${test.name} ${test.type}`.toLowerCase().includes(searchValue)) {
      return false;
    }

    return true;
  }));
}

function setSelectedTestMeta(test) {
  const title = $('tests-selected-name');
  const meta = $('tests-selected-meta');
  if (!title || !meta) {
    return;
  }

  if (!test) {
    title.textContent = t('tests.graph.noneLoaded', 'No test loaded');
    meta.textContent = t('tests.graph.noneLoadedDescription', 'Load a saved sequence or workflow test to compare ideal and actual traces.');
    return;
  }

  title.textContent = test.name;
  meta.textContent = `${t(`tests.type.${test.type}`, test.type)} · ${test.summary} · ${t('tests.filters.updatedAt', 'Updated')} ${formatDate(test.updatedAt)}`;
}

function buildBaseIdealTelemetry(overrides = {}) {
  return {
    deviceStatus: 'Ideal Ready',
    frequency: 0,
    power: 0,
    amplitude: 0,
    aux1: 0,
    aux2: 0,
    analogInputsMillivolts: [0, 0, 0, 0],
    alarm: 0,
    ready: 1,
    active: 0,
    seek: 0,
    cycles: 0,
    ...overrides
  };
}

function pushIdealSample(samples, timestamp, telemetry) {
  samples.push({
    timestamp,
    telemetry: {
      ...telemetry
    }
  });
}

function appendIdealSegment(samples, startTime, duration, telemetry, cycleRate = 0) {
  const safeDuration = Math.max(0, Number(duration) || 0);
  const stepCount = Math.max(1, Math.ceil(safeDuration / IDEAL_SAMPLE_STEP_MS));
  let currentCycles = Number(telemetry.cycles) || 0;

  if (safeDuration === 0) {
    pushIdealSample(samples, startTime, telemetry);
    return { nextTime: startTime, cycles: currentCycles };
  }

  for (let stepIndex = 0; stepIndex <= stepCount; stepIndex += 1) {
    const progress = stepIndex / stepCount;
    const timestamp = startTime + Math.round(safeDuration * progress);
    const targetCycles = currentCycles + ((safeDuration * cycleRate) / 1000) * progress;
    pushIdealSample(samples, timestamp, {
      ...telemetry,
      cycles: Number(targetCycles.toFixed(2))
    });
  }

  currentCycles += (safeDuration * cycleRate) / 1000;
  return { nextTime: startTime + safeDuration, cycles: Number(currentCycles.toFixed(2)) };
}

function buildSequenceIdealSamples(sequence) {
  const samples = [];
  const loopCount = getFiniteLoopCount(sequence.options?.loopCount, 1);
  let elapsed = 0;
  let currentTelemetry = buildBaseIdealTelemetry();

  pushIdealSample(samples, elapsed, currentTelemetry);

  for (let loopIndex = 0; loopIndex < loopCount; loopIndex += 1) {
    sequence.timeline.forEach((block) => {
      if (block.type === 'PULSE') {
        const amplitude = Number(block.amplitude) || 0;
        const pulseTelemetry = {
          ...currentTelemetry,
          active: 1,
          seek: 0,
          amplitude,
          frequency: 39950,
          power: Math.max(5, Math.round(amplitude * 0.8)),
          deviceStatus: 'Ideal Weld Cycle'
        };
        const segment = appendIdealSegment(samples, elapsed, block.duration, pulseTelemetry, Math.max(1, amplitude / 2));
        elapsed = segment.nextTime;
        currentTelemetry = buildBaseIdealTelemetry({ cycles: segment.cycles });
        pushIdealSample(samples, elapsed, currentTelemetry);
        return;
      }

      const pauseTelemetry = buildBaseIdealTelemetry({ cycles: currentTelemetry.cycles || 0 });
      const segment = appendIdealSegment(samples, elapsed, block.duration, pauseTelemetry, 0);
      elapsed = segment.nextTime;
      currentTelemetry = {
        ...pauseTelemetry,
        cycles: segment.cycles
      };
      pushIdealSample(samples, elapsed, currentTelemetry);
    });
  }

  return samples;
}

function parseWorkflowInstructions(script = '') {
  return String(script)
    .split('\n')
    .map((line) => line.replace(/\s*\/\/.*$/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const [command, argument] = line.split(/\s+/, 2);
      return {
        command: String(command || '').toUpperCase(),
        argument: argument == null ? null : argument
      };
    });
}

function buildWorkflowIdealSamples(workflow) {
  const samples = [];
  const instructions = parseWorkflowInstructions(workflow.script);
  let elapsed = 0;
  let amplitude = 80;
  let currentTelemetry = buildBaseIdealTelemetry();

  pushIdealSample(samples, elapsed, currentTelemetry);

  instructions.forEach((instruction) => {
    switch (instruction.command) {
      case 'SET_AMP':
        amplitude = Number(instruction.argument) || amplitude;
        currentTelemetry = {
          ...currentTelemetry,
          amplitude: currentTelemetry.active ? amplitude : 0
        };
        pushIdealSample(samples, elapsed, currentTelemetry);
        break;
      case 'START':
        amplitude = instruction.argument == null ? amplitude : Number(instruction.argument) || amplitude;
        currentTelemetry = {
          ...currentTelemetry,
          active: 1,
          seek: 0,
          amplitude,
          frequency: 39950,
          power: Math.max(5, Math.round(amplitude * 0.8)),
          deviceStatus: 'Ideal Weld Cycle'
        };
        pushIdealSample(samples, elapsed, currentTelemetry);
        break;
      case 'SEEK':
        currentTelemetry = {
          ...currentTelemetry,
          active: 0,
          seek: 1,
          frequency: 39880,
          amplitude: 0,
          power: 8,
          deviceStatus: 'Ideal Seek'
        };
        pushIdealSample(samples, elapsed, currentTelemetry);
        break;
      case 'STOP':
      case 'RESET':
        currentTelemetry = buildBaseIdealTelemetry({ cycles: currentTelemetry.cycles || 0 });
        pushIdealSample(samples, elapsed, currentTelemetry);
        break;
      case 'WAIT': {
        const waitDuration = Math.max(0, Number(instruction.argument) || 0);
        const cycleRate = currentTelemetry.active ? Math.max(1, amplitude / 2) : 0;
        const segment = appendIdealSegment(samples, elapsed, waitDuration, currentTelemetry, cycleRate);
        elapsed = segment.nextTime;
        currentTelemetry = {
          ...currentTelemetry,
          cycles: segment.cycles
        };
        pushIdealSample(samples, elapsed, currentTelemetry);
        break;
      }
      default:
        break;
    }
  });

  currentTelemetry = buildBaseIdealTelemetry({
    cycles: currentTelemetry.cycles || 0
  });
  pushIdealSample(samples, elapsed, currentTelemetry);

  return samples;
}

function buildIdealSamplesForTest(test) {
  if (!test) {
    return [];
  }

  return test.type === 'sequence'
    ? buildSequenceIdealSamples(test.payload)
    : buildWorkflowIdealSamples(test.payload);
}

function updateRunButtonState() {
  const runButton = $('run-selected-test-btn');
  const abortButton = $('abort-selected-test-btn');
  if (!runButton && !abortButton) {
    return;
  }

  if (runButton) {
    runButton.disabled = !getSelectedTest() || isExecutionActive() || !hasTeensyControlSource();
  }

  if (abortButton) {
    abortButton.disabled = !runtimeState.sequenceRunning && !runtimeState.workflowRunning;
  }
}

function renderTestsList() {
  const container = $('tests-list');
  if (!container) {
    return;
  }

  const tests = getFilteredTests();
  const executionActive = isExecutionActive();
  const hasTeensyExecutionSource = hasTeensyControlSource();
  const selectedTest = getSelectedTest();

  if (selectedTest && !getAllTests().some((test) => buildTestKey(test.type, test.id) === selectedTestKey)) {
    selectedTestKey = null;
    setSelectedTestMeta(null);
    clearTestsComparisonChart();
  }

  if (!tests.length) {
    container.innerHTML = `
      <div class="rounded-xl border border-dashed border-border/70 bg-background/40 px-4 py-6 text-center text-sm text-muted-foreground">
        ${t('tests.list.empty', 'No saved tests found.')}
      </div>
    `;
    updateRunButtonState();
    updateTestsExportButtonState();
    return;
  }

  container.innerHTML = tests.map((test) => {
    const isSelected = buildTestKey(test.type, test.id) === selectedTestKey;
    const autoSaveEnabled = isAutoSaveEnabledForTest(test);
    const typeCardClassName = test.type === 'sequence' ? 'typed-item-card typed-item-card-sequence' : 'typed-item-card typed-item-card-workflow';
    const typePillClassName = test.type === 'sequence' ? 'tests-type-pill typed-item-badge typed-item-badge-sequence' : 'tests-type-pill typed-item-badge typed-item-badge-workflow';
    const typeShortLabel = test.type === 'sequence' ? 'SEQ' : 'WF';
    return `
      <div class="${isSelected ? `tests-list-item ${typeCardClassName} typed-item-card-active active` : `tests-list-item ${typeCardClassName}`}">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="${typePillClassName}">${typeShortLabel}</span>
              <span class="tests-type-label">${escapeHtml(t(`tests.type.${test.type}`, test.type))}</span>
            </div>
            <div class="mt-2 truncate text-base font-semibold text-foreground">${escapeHtml(test.name)}</div>
            <div class="mt-3 flex flex-wrap gap-2 text-sm text-foreground/85">
              <span class="tests-meta-chip">${escapeHtml(test.summary)}</span>
              <span class="tests-meta-chip">${escapeHtml(t('tests.filters.updatedAt', 'Updated'))} ${escapeHtml(formatDate(test.updatedAt))}</span>
            </div>
          </div>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button
            class="inline-flex h-8 items-center justify-center rounded-md border border-input bg-transparent px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            data-test-action="load"
            data-test-id="${escapeHtml(test.id)}"
            data-test-type="${escapeHtml(test.type)}"
            type="button"
          >
            ${escapeHtml(t('tests.actions.load', 'Load Essai'))}
          </button>
          <button
            class="inline-flex h-8 items-center justify-center rounded-md border border-primary/30 bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/16 disabled:opacity-50"
            data-test-action="run"
            data-test-id="${escapeHtml(test.id)}"
            data-test-type="${escapeHtml(test.type)}"
            ${executionActive || !hasTeensyExecutionSource ? 'disabled' : ''}
            type="button"
          >
            ${escapeHtml(t('tests.actions.run', 'Run'))}
          </button>
        </div>
        <label class="mt-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <input
            class="size-4 accent-primary"
            data-test-auto-save="true"
            data-test-id="${escapeHtml(test.id)}"
            data-test-type="${escapeHtml(test.type)}"
            type="checkbox"
            ${autoSaveEnabled ? 'checked' : ''}
          />
          ${escapeHtml(t('tests.actions.storeData', 'Store Data'))}
        </label>
      </div>
    `;
  }).join('');

  setSelectedTestMeta(selectedTest);
  updateRunButtonState();
  updateTestsExportButtonState();
}

async function loadTestIntoComparison(test) {
  if (!test) {
    return;
  }

  selectedTestKey = buildTestKey(test.type, test.id);
  if (test.type === 'sequence') {
    loadSequenceById(test.id, { navigate: false });
  } else {
    loadWorkflowById(test.id, { navigate: false });
  }

  setSelectedTestMeta(test);
  clearActualTestSamples();
  setIdealTestSamples(buildIdealSamplesForTest(test), `${test.name} · ${t('tests.graph.ideal', 'Ideal')}`);
  renderTestsList();
}

async function runLoadedTest() {
  const test = getSelectedTest();
  if (!test || isExecutionActive()) {
    return;
  }

  await loadTestIntoComparison(test);

  beginActualTestCapture(runtimeState.simulation ? t('tests.graph.simulated', 'Simulated') : t('tests.graph.measured', 'Measured'));
  try {
    if (test.type === 'sequence') {
      await runSequenceFromUi();
    } else {
      await runWorkflowFromUi();
    }
  } finally {
    endActualTestCapture();
    renderTestsList();
    if (isAutoSaveEnabledForTest(test)) {
      await autoSaveTestsComparisonData(test);
    }
  }
}

async function abortLoadedTest() {
  if (runtimeState.sequenceRunning) {
    await stopActiveSequence();
    return;
  }

  if (runtimeState.workflowRunning) {
    await stopActiveWorkflow();
    return;
  }

  showFooterFeedback('No test is currently running.', { tone: 'info', timeout: 4000 });
}

function bindFilterButtons() {
  document.querySelectorAll('[data-tests-filter]').forEach((button) => {
    if (button.dataset.bound === 'true') {
      return;
    }

    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-tests-filter]').forEach((candidate) => {
        candidate.classList.toggle('active', candidate === button);
      });
      renderTestsList();
    });
  });

  $('tests-filter-all')?.classList.add('active');
}

function bindFilterInputs() {
  ['tests-search', 'tests-sort'].forEach((id) => {
    const element = $(id);
    if (!element || element.dataset.bound === 'true') {
      return;
    }

    element.dataset.bound = 'true';
    element.addEventListener(id === 'tests-search' ? 'input' : 'change', renderTestsList);
  });
}

function bindTestsListActions() {
  const list = $('tests-list');
  if (!list || list.dataset.bound === 'true') {
    return;
  }

  list.dataset.bound = 'true';
  list.addEventListener('change', async (event) => {
    const checkbox = event.target.closest('[data-test-auto-save]');
    if (!checkbox) {
      return;
    }

    const testKey = buildTestKey(checkbox.dataset.testType, checkbox.dataset.testId);
    if (checkbox.checked) {
      autoSaveTestKeys.add(testKey);
    } else {
      autoSaveTestKeys.delete(testKey);
    }

    await persistAutoSavePreferences();
  });

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-test-action]');
    if (!button) {
      return;
    }

    const test = getAllTests().find((entry) => entry.id === button.dataset.testId && entry.type === button.dataset.testType);
    if (!test) {
      return;
    }

    if (button.dataset.testAction === 'load') {
      await loadTestIntoComparison(test);
      return;
    }

    selectedTestKey = buildTestKey(test.type, test.id);
    await runLoadedTest();
  });
}

function bindRunSelectedAction() {
  const button = $('run-selected-test-btn');
  if (!button || button.dataset.bound === 'true') {
    return;
  }

  button.dataset.bound = 'true';
  button.addEventListener('click', runLoadedTest);
}

function bindAbortSelectedAction() {
  const button = $('abort-selected-test-btn');
  if (!button || button.dataset.bound === 'true') {
    return;
  }

  button.dataset.bound = 'true';
  button.addEventListener('click', abortLoadedTest);
}

function bindExportAction() {
  const button = $('export-tests-data-btn');
  if (!button || button.dataset.bound === 'true') {
    return;
  }

  button.dataset.bound = 'true';
  button.addEventListener('click', exportTestsComparisonData);
}

export function initializeTestsPage() {
  initializeTestsComparisonChart();
  bindFilterButtons();
  bindFilterInputs();
  bindTestsListActions();
  bindRunSelectedAction();
  bindAbortSelectedAction();
  bindExportAction();
  setSelectedTestMeta(null);
  renderTestsList();
  void loadStoredAutoSavePreferences().then(() => {
    renderTestsList();
  });
  void loadStoredTestsComparisonState();

  if (!testsComparisonStorageBound) {
    testsComparisonStorageBound = true;
    document.addEventListener('app:tests-comparison-changed', () => {
      scheduleTestsComparisonPersistence();
      updateTestsExportButtonState();
    });
  }

  document.addEventListener('app:tests-library-changed', renderTestsList);
  document.addEventListener('app:language-changed', renderTestsList);
  document.addEventListener('app:status-updated', renderTestsList);
  document.addEventListener('app:sequence-status', renderTestsList);
  document.addEventListener('app:workflow-status', renderTestsList);
  document.addEventListener('app:telemetry-updated', (event) => {
    appendActualTestSample(event.detail || {});
    updateRunButtonState();
  });
}
