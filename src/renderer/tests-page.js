import { t } from './preferences.js';
import { $, runtimeState } from './runtime.js';
import { runSequenceFromUi, runWorkflowFromUi } from './controls.js';
import { getSavedSequences, loadSequenceById } from './sequence-library.js';
import { getResolvedTelemetry } from './status-ui.js';
import { getSavedWorkflows, loadWorkflowById } from './workflow-library.js';
import {
  appendActualTestSample,
  beginActualTestCapture,
  clearActualTestSamples,
  clearTestsComparisonChart,
  endActualTestCapture,
  initializeTestsComparisonChart,
  setIdealTestSamples
} from './tests-chart.js';

const IDEAL_SAMPLE_STEP_MS = 250;

let selectedTestKey = null;

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
    title.textContent = t('tests.graph.noneLoaded', 'No essai loaded');
    meta.textContent = t('tests.graph.noneLoadedDescription', 'Load a saved sequence or workflow essai to compare ideal and actual traces.');
    return;
  }

  title.textContent = test.name;
  meta.textContent = `${t(`tests.type.${test.type}`, test.type)} · ${test.summary} · ${t('tests.filters.updatedAt', 'Updated')} ${formatDate(test.updatedAt)}`;
}

function buildBaseIdealTelemetry(overrides = {}) {
  return {
    deviceStatus: 'Ideal Ready',
    frequency: 40000,
    power: 0,
    amplitude: 0,
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
  const loopCount = Math.max(1, Number(sequence.options?.loopCount) || 1);
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
        currentTelemetry = buildBaseIdealTelemetry({
          amplitude,
          cycles: segment.cycles
        });
        pushIdealSample(samples, elapsed, currentTelemetry);
        return;
      }

      const pauseTelemetry = {
        ...currentTelemetry,
        active: 0,
        seek: 0,
        frequency: 40000,
        power: 0,
        deviceStatus: 'Ideal Ready'
      };
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
  let currentTelemetry = buildBaseIdealTelemetry({ amplitude });

  pushIdealSample(samples, elapsed, currentTelemetry);

  instructions.forEach((instruction) => {
    switch (instruction.command) {
      case 'SET_AMP':
        amplitude = Number(instruction.argument) || amplitude;
        currentTelemetry = {
          ...currentTelemetry,
          amplitude
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
          power: 8,
          deviceStatus: 'Ideal Seek'
        };
        pushIdealSample(samples, elapsed, currentTelemetry);
        break;
      case 'STOP':
      case 'RESET':
        currentTelemetry = buildBaseIdealTelemetry({
          amplitude,
          cycles: currentTelemetry.cycles || 0
        });
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
    amplitude,
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
  if (!runButton) {
    return;
  }

  runButton.disabled = !getSelectedTest() || isExecutionActive();
}

function renderTestsList() {
  const container = $('tests-list');
  if (!container) {
    return;
  }

  const tests = getFilteredTests();
  const executionActive = isExecutionActive();
  const selectedTest = getSelectedTest();

  if (selectedTest && !getAllTests().some((test) => buildTestKey(test.type, test.id) === selectedTestKey)) {
    selectedTestKey = null;
    setSelectedTestMeta(null);
    clearTestsComparisonChart();
  }

  if (!tests.length) {
    container.innerHTML = `
      <div class="rounded-xl border border-dashed border-border/70 bg-background/40 px-4 py-6 text-center text-sm text-muted-foreground">
        ${t('tests.list.empty', 'No saved essais found.')}
      </div>
    `;
    updateRunButtonState();
    return;
  }

  container.innerHTML = tests.map((test) => {
    const isSelected = buildTestKey(test.type, test.id) === selectedTestKey;
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
            ${executionActive ? 'disabled' : ''}
            type="button"
          >
            ${escapeHtml(t('tests.actions.run', 'Run'))}
          </button>
        </div>
      </div>
    `;
  }).join('');

  setSelectedTestMeta(selectedTest);
  updateRunButtonState();
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
  }
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

export function initializeTestsPage() {
  initializeTestsComparisonChart();
  bindFilterButtons();
  bindFilterInputs();
  bindTestsListActions();
  bindRunSelectedAction();
  setSelectedTestMeta(null);
  renderTestsList();

  document.addEventListener('app:tests-library-changed', renderTestsList);
  document.addEventListener('app:language-changed', renderTestsList);
  document.addEventListener('app:sequence-status', renderTestsList);
  document.addEventListener('app:workflow-status', renderTestsList);
  document.addEventListener('app:telemetry-updated', (event) => {
    appendActualTestSample(event.detail || {});
    updateRunButtonState();
  });
}
