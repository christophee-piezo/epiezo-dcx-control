import { $, getTimelineSnapshot, setTimeline } from './runtime.js';
import { log } from './logger.js';
import { t } from './preferences.js';
import { refreshSequencePreviewChart } from './sequence-preview-chart.js';
import { renderTimeline } from './timeline-ui.js';

const STORE_KEY = 'saved-sequences';
const DRAFT_STORE_KEY = 'sequence-editor-draft';
const DRAFT_PERSIST_DELAY_MS = 200;

let savedSequences = [];
let activeSequenceId = null;
let saveState = 'draft';
let saveStateMessageKey = 'sequencer.saveState.draft';
let sequenceDraftPersistTimer = null;

function navigateToMethodView() {
  document.dispatchEvent(new CustomEvent('app:navigate', { detail: { tab: 'sequencer' } }));
}

function notifySequenceLibraryChanged() {
  document.dispatchEvent(new CustomEvent('app:tests-library-changed', { detail: { type: 'sequence' } }));
}

function getDefaultSaveStateMessageKey(state) {
  return {
    draft: 'sequencer.saveState.draft',
    dirty: 'sequencer.saveState.dirty',
    saving: activeSequenceId ? 'sequencer.saveState.savingChanges' : 'sequencer.saveState.savingNew',
    saved: 'sequencer.saveState.saved',
    error: 'sequencer.saveState.nameRequired'
  }[state] || 'sequencer.saveState.draft';
}

function setSaveState(state, messageKey = null) {
  saveState = state;
  saveStateMessageKey = messageKey || getDefaultSaveStateMessageKey(state);

  const saveStateElement = $('seq-save-state');
  if (!saveStateElement) return;

  const palette = {
    draft: 'text-muted-foreground',
    dirty: 'text-amber-300',
    saving: 'text-primary',
    saved: 'text-emerald-300',
    error: 'text-destructive'
  };

  saveStateElement.className = `text-xs font-medium ${palette[state] || palette.draft}`;
  saveStateElement.textContent = t(saveStateMessageKey, saveStateElement.textContent);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createSequenceId() {
  return `seq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readSequenceOptionsFromUi() {
  return {
    loopCount: $('seq-loop-count')?.value || '1',
    autoAbort: $('seq-auto-abort')?.value || 'ALARM',
    flashBeforeRun: $('seq-flash-before-run')?.value === 'SELECTED_FIRMWARE'
  };
}

function applySequenceOptionsToUi(options = {}) {
  if ($('seq-loop-count')) {
    $('seq-loop-count').value = String(options.loopCount || 1);
  }

  if ($('seq-auto-abort')) {
    $('seq-auto-abort').value = options.autoAbort === 'NEVER' ? 'NEVER' : 'ALARM';
  }

  if ($('seq-flash-before-run')) {
    $('seq-flash-before-run').value = options.flashBeforeRun ? 'SELECTED_FIRMWARE' : 'DISABLED';
  }
}

function normalizeSequenceTimeline(timeline = [], fallbackRamp = 50) {
  if (!Array.isArray(timeline)) {
    return [];
  }

  return timeline.map((block) => {
    const type = String(block?.type || '').toUpperCase() === 'PAUSE' ? 'PAUSE' : 'PULSE';
    const duration = Math.max(0, Number(block?.duration) || 0);

    if (type === 'PAUSE') {
      return { type, duration };
    }

    return {
      type,
      duration,
      amplitude: Math.max(0, Math.min(100, Number(block?.amplitude) || 0)),
      ramp: Math.max(0, Number(block?.ramp ?? fallbackRamp) || 0)
    };
  });
}

function normalizeSavedSequences(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((sequence) => sequence && typeof sequence.name === 'string' && sequence.name.trim() && Array.isArray(sequence.timeline))
    .map((sequence) => {
      const fallbackRamp = Math.max(0, Number(sequence.options?.globalRamp) || 50);

      return {
        id: sequence.id || createSequenceId(),
        name: sequence.name.trim(),
        timeline: normalizeSequenceTimeline(sequence.timeline, fallbackRamp),
        options: {
          loopCount: String(sequence.options?.loopCount || '1'),
          autoAbort: sequence.options?.autoAbort === 'NEVER' ? 'NEVER' : 'ALARM',
          flashBeforeRun: Boolean(sequence.options?.flashBeforeRun)
        },
        createdAt: sequence.createdAt || Date.now(),
        updatedAt: sequence.updatedAt || Date.now()
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function normalizeSequenceDraft(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const fallbackRamp = Math.max(0, Number(value.options?.globalRamp) || 50);
  const normalizedTimeline = normalizeSequenceTimeline(value.timeline, fallbackRamp);
  const normalizedSaveState = ['draft', 'dirty'].includes(value.saveState) ? value.saveState : 'draft';
  const normalizedMessageKey = typeof value.saveStateMessageKey === 'string' && value.saveStateMessageKey.trim()
    ? value.saveStateMessageKey.trim()
    : getDefaultSaveStateMessageKey(normalizedSaveState);

  return {
    activeSequenceId: typeof value.activeSequenceId === 'string' && value.activeSequenceId.trim()
      ? value.activeSequenceId.trim()
      : null,
    name: typeof value.name === 'string' ? value.name : '',
    timeline: normalizedTimeline,
    options: {
      loopCount: String(value.options?.loopCount || '1'),
      autoAbort: value.options?.autoAbort === 'NEVER' ? 'NEVER' : 'ALARM',
      flashBeforeRun: Boolean(value.options?.flashBeforeRun)
    },
    saveState: normalizedSaveState,
    saveStateMessageKey: normalizedMessageKey
  };
}

async function persistSavedSequences() {
  await window.api.store.set(STORE_KEY, savedSequences);
}

function clearSequenceDraftPersistence() {
  if (sequenceDraftPersistTimer) {
    window.clearTimeout(sequenceDraftPersistTimer);
    sequenceDraftPersistTimer = null;
  }

  const persistResult = window.api?.store?.set?.(DRAFT_STORE_KEY, null);
  if (persistResult && typeof persistResult.catch === 'function') {
    persistResult.catch(() => {});
  }
}

function buildEditorSequenceDraft() {
  return normalizeSequenceDraft({
    activeSequenceId: getSequenceById(activeSequenceId)?.id || null,
    name: $('seq-name')?.value || '',
    timeline: getTimelineSnapshot(),
    options: readSequenceOptionsFromUi(),
    saveState,
    saveStateMessageKey
  });
}

function scheduleSequenceDraftPersistence() {
  if (sequenceDraftPersistTimer) {
    window.clearTimeout(sequenceDraftPersistTimer);
  }

  sequenceDraftPersistTimer = window.setTimeout(() => {
    sequenceDraftPersistTimer = null;
    const persistResult = window.api?.store?.set?.(DRAFT_STORE_KEY, buildEditorSequenceDraft());
    if (persistResult && typeof persistResult.catch === 'function') {
      persistResult.catch(() => {});
    }
  }, DRAFT_PERSIST_DELAY_MS);
}

function applySequenceEditorState({
  name = '',
  timeline = [],
  options = {},
  sequenceId = null,
  nextSaveState = 'draft',
  nextSaveStateMessageKey = null,
  navigate = false
} = {}) {
  activeSequenceId = sequenceId && getSequenceById(sequenceId) ? sequenceId : null;
  setTimeline(timeline);
  renderTimeline();
  applySequenceOptionsToUi(options);
  refreshSequencePreviewChart();

  if ($('seq-name')) {
    $('seq-name').value = name;
  }

  setSaveState(nextSaveState, nextSaveStateMessageKey);
  updateSaveButtonState();
  renderSequenceList();
  if (navigate) {
    navigateToMethodView();
  }
}

function updateSaveButtonState() {
  const saveButton = $('save-seq-btn');

  if (saveButton) {
    saveButton.textContent = activeSequenceId
      ? t('sequencer.buttons.saveChanges', 'Save Changes')
      : t('sequencer.buttons.saveSequence', 'Save Sequence');
  }

  syncSequenceEditorUi();

  if (saveState === 'draft' && activeSequenceId) {
    setSaveState('saved');
  }
}

export function syncSequenceEditorUi(sequenceRunning = false) {
  const saveButton = $('save-seq-btn');

  if (saveButton) {
    saveButton.disabled = sequenceRunning;
  }
}

function markEditorDirty() {
  if (activeSequenceId) {
    setSaveState('dirty');
  } else {
    setSaveState('draft');
  }

  scheduleSequenceDraftPersistence();
}

async function getStoredWorkflowNames() {
  try {
    const storedWorkflows = await window.api.store.get('saved-workflows');
    return new Set(
      Array.isArray(storedWorkflows)
        ? storedWorkflows
            .map((workflow) => String(workflow?.name || '').trim().toLowerCase())
            .filter(Boolean)
        : []
    );
  } catch {
    return new Set();
  }
}

async function createSequenceCopyName(name) {
  const baseName = `${name} ${t('sequencer.copySuffix', 'Copy')}`;
  const takenNames = new Set(savedSequences.map((sequence) => sequence.name.toLowerCase()));

  const workflowNames = await getStoredWorkflowNames();
  workflowNames.forEach((workflowName) => takenNames.add(workflowName));

  if (!takenNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  let index = 2;
  while (takenNames.has(`${baseName} ${index}`.toLowerCase())) {
    index += 1;
  }

  return `${baseName} ${index}`;
}

function renderEmptyState(container) {
  container.innerHTML = `
    <div class="flex h-full min-h-0 items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/40 px-4 py-6 text-center text-sm text-muted-foreground">
      ${t('sequencer.library.empty', 'Saved sequences will appear here.')}
    </div>
  `;
}

function renderSequenceList() {
  const container = $('sequence-list');
  if (!container) return;

  container.innerHTML = '';

  if (!savedSequences.length) {
    renderEmptyState(container);
    return;
  }

  savedSequences.forEach((sequence) => {
    const item = document.createElement('div');
    item.className = activeSequenceId === sequence.id
      ? 'typed-item-card typed-item-card-sequence typed-item-card-active rounded-xl border border-border/70 bg-background/60 p-3'
      : 'typed-item-card typed-item-card-sequence rounded-xl border border-border/70 bg-background/60 p-3';
    const escapedName = escapeHtml(sequence.name);
    const blockLabel = sequence.timeline.length === 1
      ? t('sequencer.blocks.single', 'block')
      : t('sequencer.blocks.plural', 'blocks');
    item.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="typed-item-badge typed-item-badge-sequence">SEQ</span>
            <div class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">${t('tests.type.sequence', 'Sequence')}</div>
          </div>
          <div class="mt-2 truncate text-sm font-semibold text-foreground">${escapedName}</div>
          <div class="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            ${sequence.timeline.length} ${blockLabel}
          </div>
        </div>
        <div class="text-[0.68rem] text-muted-foreground">
          x${sequence.options.loopCount || '1'}
        </div>
      </div>

      <div class="mt-3 grid grid-cols-3 gap-2">
        <button
          class="inline-flex h-8 items-center justify-center rounded-md border border-input bg-transparent px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          data-sequence-action="load"
          data-sequence-id="${sequence.id}"
          type="button"
        >
          ${t('sequencer.actions.load', 'Load')}
        </button>
        <button
          class="inline-flex h-8 items-center justify-center rounded-md border border-input bg-transparent px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          data-sequence-action="duplicate"
          data-sequence-id="${sequence.id}"
          type="button"
        >
          ${t('sequencer.actions.duplicate', 'Duplicate')}
        </button>
        <button
          class="inline-flex h-8 items-center justify-center rounded-md border border-destructive/40 bg-transparent px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/12 disabled:opacity-50"
          data-sequence-action="delete"
          data-sequence-id="${sequence.id}"
          type="button"
        >
          ${t('sequencer.actions.delete', 'Delete')}
        </button>
      </div>
    `;

    container.appendChild(item);
  });
}

function getSequenceById(sequenceId) {
  return savedSequences.find((sequence) => sequence.id === sequenceId) || null;
}

export function loadSequenceIntoEditor(sequence, { navigate = true } = {}) {
  applySequenceEditorState({
    name: sequence.name,
    timeline: sequence.timeline,
    options: sequence.options,
    sequenceId: sequence.id,
    nextSaveState: 'saved',
    navigate
  });
  log(`SEQUENCE LOADED: ${sequence.name}`);
}

export function getSavedSequences() {
  return savedSequences.map((sequence) => ({
    ...sequence,
    timeline: sequence.timeline.map((block) => ({ ...block })),
    options: {
      ...sequence.options
    }
  }));
}

export function loadSequenceById(sequenceId, options = {}) {
  const sequence = getSequenceById(sequenceId);
  if (!sequence) {
    return false;
  }

  loadSequenceIntoEditor(sequence, options);
  return true;
}

export function loadSequenceDraft({
  name = '',
  timeline = [],
  options = {},
  activeSequenceId: draftSequenceId = null,
  saveState: draftSaveState = 'draft',
  saveStateMessageKey: draftSaveStateMessageKey = null,
  clearPersistedDraft = false
} = {}) {
  applySequenceEditorState({
    name,
    timeline,
    options,
    sequenceId: draftSequenceId,
    nextSaveState: draftSaveState,
    nextSaveStateMessageKey: draftSaveStateMessageKey
  });

  if (clearPersistedDraft) {
    clearSequenceDraftPersistence();
  }
}

async function duplicateSequence(sequenceId) {
  const sequence = getSequenceById(sequenceId);
  if (!sequence) return null;

  const now = Date.now();
  const duplicatedSequence = {
    id: createSequenceId(),
    name: await createSequenceCopyName(sequence.name),
    timeline: sequence.timeline.map((block) => ({ ...block })),
    options: {
      ...sequence.options
    },
    createdAt: now,
    updatedAt: now
  };

  savedSequences = [duplicatedSequence, ...savedSequences].sort((a, b) => b.updatedAt - a.updatedAt);
  await persistSavedSequences();
  renderSequenceList();
  notifySequenceLibraryChanged();
  log(`SEQUENCE DUPLICATED: ${duplicatedSequence.name}`);
  return duplicatedSequence;
}

export async function duplicateSequenceById(sequenceId) {
  return duplicateSequence(sequenceId);
}

async function deleteSequence(sequenceId) {
  const sequence = getSequenceById(sequenceId);
  if (!sequence) return;

  const confirmed = window.confirm(t('sequencer.confirmDelete', 'Delete saved sequence "{name}"?').replace('{name}', sequence.name));
  if (!confirmed) return;

  savedSequences = savedSequences.filter((entry) => entry.id !== sequenceId);
  if (activeSequenceId === sequenceId) {
    activeSequenceId = null;
    setSaveState('draft');
    updateSaveButtonState();
  }
  await persistSavedSequences();
  renderSequenceList();
  notifySequenceLibraryChanged();
  log(`SEQUENCE DELETED: ${sequence.name}`);
}

export async function deleteSequenceById(sequenceId) {
  await deleteSequence(sequenceId);
}

function getSequenceConflict(name, sequenceId) {
  return savedSequences.find((sequence) => sequence.id !== sequenceId && sequence.name.toLowerCase() === name.toLowerCase()) || null;
}

function buildEditorSequence(sequenceId = activeSequenceId) {
  const name = $('seq-name')?.value?.trim() || '';
  const timeline = getTimelineSnapshot();

  if (!name) {
    return { errorKey: 'sequencer.saveState.nameRequired' };
  }

  const conflict = getSequenceConflict(name, sequenceId);
  if (conflict) {
    return { errorKey: 'sequencer.saveState.duplicateName' };
  }

  const existing = sequenceId ? getSequenceById(sequenceId) : null;
  const now = Date.now();

  return {
    sequence: {
      id: existing?.id || sequenceId || createSequenceId(),
      name,
      timeline,
      options: readSequenceOptionsFromUi(),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    },
    existing
  };
}

async function persistEditorSequence(sequenceId, { allowEmptyTimeline = false, shouldLog = false } = {}) {
  const result = buildEditorSequence(sequenceId);
  if (result.errorKey) {
    setSaveState('error', result.errorKey);
    if (shouldLog) {
      log({ sequence_save_error: t(result.errorKey, result.errorKey) });
    }
    return false;
  }

  const { sequence, existing } = result;
  const workflowNames = await getStoredWorkflowNames();
  if (workflowNames.has(sequence.name.toLowerCase())) {
    setSaveState('error', 'sequencer.saveState.duplicateName');
    if (shouldLog) {
      log({ sequence_save_error: t('sequencer.saveState.duplicateName', 'A saved sequence or workflow with this name already exists') });
    }
    return false;
  }

  const isUpdatingExisting = Boolean(sequenceId && existing);
  if (!allowEmptyTimeline && !sequence.timeline.length) {
    if (shouldLog) {
      log({ sequence_save_error: 'Add at least one block before saving a sequence.' });
    }
    setSaveState('error', 'sequencer.saveState.empty');
    return false;
  }

  setSaveState('saving', isUpdatingExisting ? 'sequencer.saveState.savingChanges' : 'sequencer.saveState.savingNew');
  activeSequenceId = sequence.id;
  savedSequences = [
    sequence,
    ...savedSequences.filter((entry) => entry.id !== sequence.id)
  ].sort((a, b) => b.updatedAt - a.updatedAt);

  await persistSavedSequences();
  clearSequenceDraftPersistence();
  renderSequenceList();
  updateSaveButtonState();
  setSaveState('saved');
  notifySequenceLibraryChanged();

  if (shouldLog) {
    log(existing ? `SEQUENCE UPDATED: ${sequence.name}` : `SEQUENCE SAVED: ${sequence.name}`);
  }

  return true;
}

async function restoreSequenceDraft() {
  const stored = await window.api.store.get(DRAFT_STORE_KEY);
  const draft = normalizeSequenceDraft(stored);
  if (!draft) {
    return false;
  }

  loadSequenceDraft({
    ...draft,
    activeSequenceId: getSequenceById(draft.activeSequenceId)?.id || null,
    clearPersistedDraft: false
  });
  return true;
}

async function saveCurrentSequence() {
  const targetSequenceId = activeSequenceId && getSequenceById(activeSequenceId)
    ? activeSequenceId
    : null;

  const success = await persistEditorSequence(targetSequenceId, { shouldLog: true });
  if (!success) {
    $('seq-name')?.focus();
  }
}

function bindSequenceListActions() {
  const list = $('sequence-list');
  if (!list || list.dataset.bound === 'true') return;

  list.dataset.bound = 'true';
  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-sequence-action]');
    if (!button) return;

    const sequenceId = button.dataset.sequenceId;
    const action = button.dataset.sequenceAction;
    const sequence = getSequenceById(sequenceId);

    if (action === 'load' && sequence) {
      loadSequenceIntoEditor(sequence);
      return;
    }

    if (action === 'duplicate') {
      await duplicateSequence(sequenceId);
      return;
    }

    if (action === 'delete') {
      await deleteSequence(sequenceId);
    }
  });
}

function bindSaveAction() {
  const saveButton = $('save-seq-btn');
  if (saveButton && saveButton.dataset.bound !== 'true') {
    saveButton.dataset.bound = 'true';
    saveButton.addEventListener('click', saveCurrentSequence);
  }

  const nameInput = $('seq-name');
  if (nameInput && nameInput.dataset.bound !== 'true') {
    nameInput.dataset.bound = 'true';
  }
}

function bindEditorDirtyState() {
  if (document.body?.dataset.sequenceEditorDirtyStateBound === 'true') {
    return;
  }

  document.body.dataset.sequenceEditorDirtyStateBound = 'true';

  ['seq-name', 'seq-loop-count', 'seq-auto-abort', 'seq-flash-before-run'].forEach((id) => {
    const element = $(id);
    if (!element) return;

    const eventName = id === 'seq-name' ? 'input' : 'change';
    element.addEventListener(eventName, markEditorDirty);
  });

  document.addEventListener('sequence-editor:changed', markEditorDirty);
}

export async function initSequenceLibrary() {
  bindSequenceListActions();
  bindSaveAction();
  bindEditorDirtyState();

  try {
    const stored = await window.api.store.get(STORE_KEY);
    savedSequences = normalizeSavedSequences(stored);
    const restoredDraft = await restoreSequenceDraft();
    if (!restoredDraft) {
      renderSequenceList();
      updateSaveButtonState();
      setSaveState('draft');
    }
    notifySequenceLibraryChanged();
  } catch (error) {
    savedSequences = [];
    renderSequenceList();
    updateSaveButtonState();
    setSaveState('draft');
    notifySequenceLibraryChanged();
    log({ sequence_library_error: error.message });
  }

  document.addEventListener('app:language-changed', () => {
    renderSequenceList();
    updateSaveButtonState();
    setSaveState(saveState, saveStateMessageKey);
  });
}
