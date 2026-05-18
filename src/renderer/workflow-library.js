import { $, runtimeState } from './runtime.js';
import { log } from './logger.js';
import { t } from './preferences.js';

const STORE_KEY = 'saved-workflows';
const DRAFT_STORE_KEY = 'workflow-editor-draft';
const DRAFT_PERSIST_DELAY_MS = 200;
const LINE_HEIGHT_PX = 24;
const EDITOR_PADDING_TOP_PX = 8;

const EXAMPLE_WORKFLOWS = [
  {
    id: 'ramp-check',
    nameKey: 'workflow.example.ramp',
    script: 'SET_AMP 40\nSTART 40\nWAIT 500\nSET_AMP 70\nWAIT 500\nSTOP'
  },
  {
    id: 'seek-check',
    nameKey: 'workflow.example.seek',
    script: 'RESET\nSEEK\nWAIT 1200\nSTOP'
  },
  {
    id: 'pulse-train',
    nameKey: 'workflow.example.pulse',
    script: 'SET_AMP 60\nSTART 60\nWAIT 300\nSTOP\nWAIT 250\nSTART 75\nWAIT 300\nSTOP'
  }
];

let savedWorkflows = [];
let activeWorkflowId = null;
let libraryStateKey = 'workflow.library.ready';
let languageListenerBound = false;
let workflowDraftPersistTimer = null;

function navigateToMethodView() {
  document.dispatchEvent(new CustomEvent('app:navigate', { detail: { tab: 'workflow' } }));
}

function notifyWorkflowLibraryChanged() {
  document.dispatchEvent(new CustomEvent('app:tests-library-changed', { detail: { type: 'workflow' } }));
}

function setLibraryState(messageKey) {
  libraryStateKey = messageKey;

  const state = $('workflow-library-state');
  if (!state) {
    return;
  }

  state.textContent = t(messageKey, state.textContent);
}

function normalizeSavedWorkflows(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((workflow) => workflow && typeof workflow.name === 'string' && workflow.name.trim() && typeof workflow.script === 'string')
    .map((workflow) => ({
      id: workflow.id || `workflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: workflow.name.trim(),
      script: workflow.script,
      createdAt: workflow.createdAt || Date.now(),
      updatedAt: workflow.updatedAt || Date.now()
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function normalizeWorkflowDraft(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return {
    workflowId: typeof value.workflowId === 'string' && value.workflowId.trim()
      ? value.workflowId.trim()
      : null,
    name: typeof value.name === 'string' ? value.name : '',
    script: typeof value.script === 'string' ? value.script : '',
    workflowFileName: typeof value.workflowFileName === 'string' ? value.workflowFileName : ''
  };
}

async function persistSavedWorkflows() {
  await window.api.store.set(STORE_KEY, savedWorkflows);
}

function clearWorkflowDraftPersistence() {
  if (workflowDraftPersistTimer) {
    window.clearTimeout(workflowDraftPersistTimer);
    workflowDraftPersistTimer = null;
  }

  const persistResult = window.api?.store?.set?.(DRAFT_STORE_KEY, null);
  if (persistResult && typeof persistResult.catch === 'function') {
    persistResult.catch(() => {});
  }
}

function buildWorkflowDraftPayload() {
  return normalizeWorkflowDraft({
    workflowId: getWorkflowById(activeWorkflowId)?.id || null,
    name: $('workflow-name')?.value || '',
    script: $('workflow-text')?.value || '',
    workflowFileName: runtimeState.workflowFileName || ''
  });
}

function scheduleWorkflowDraftPersistence() {
  if (workflowDraftPersistTimer) {
    window.clearTimeout(workflowDraftPersistTimer);
  }

  workflowDraftPersistTimer = window.setTimeout(() => {
    workflowDraftPersistTimer = null;
    const persistResult = window.api?.store?.set?.(DRAFT_STORE_KEY, buildWorkflowDraftPayload());
    if (persistResult && typeof persistResult.catch === 'function') {
      persistResult.catch(() => {});
    }
  }, DRAFT_PERSIST_DELAY_MS);
}

function getWorkflowById(workflowId) {
  return savedWorkflows.find((workflow) => workflow.id === workflowId) || null;
}

function getWorkflowNameConflict(name, workflowId) {
  return savedWorkflows.find((workflow) => workflow.id !== workflowId && workflow.name.toLowerCase() === name.toLowerCase()) || null;
}

async function getStoredSequenceNames() {
  try {
    const storedSequences = await window.api.store.get('saved-sequences');
    return new Set(
      Array.isArray(storedSequences)
        ? storedSequences
            .map((sequence) => String(sequence?.name || '').trim().toLowerCase())
            .filter(Boolean)
        : []
    );
  } catch {
    return new Set();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function clearWorkflowFileContext() {
  runtimeState.workflowFileName = '';
  document.dispatchEvent(new CustomEvent('workflow:file-meta-changed'));
}

function getLineCount(script = '') {
  return Math.max(1, String(script).split('\n').length);
}

function parseWorkflowErrorLine(status = {}) {
  const match = String(status.error || '').match(/line\s+(\d+)/i);
  if (!match) {
    return null;
  }

  return parseInt(match[1], 10);
}

function getHighlightedLines(status = runtimeState.workflowStatus || {}) {
  return {
    activeLine: status.state === 'running' && status.currentLine ? status.currentLine : null,
    errorLine: parseWorkflowErrorLine(status)
  };
}

function scrollWorkflowDecorations() {
  const textarea = $('workflow-text');
  const gutter = $('workflow-line-numbers');
  if (!textarea || !gutter) {
    return;
  }

  gutter.scrollTop = textarea.scrollTop;
}

function ensureLineVisible(lineNumber) {
  const textarea = $('workflow-text');
  if (!textarea || !lineNumber) {
    return;
  }

  const lineTop = (lineNumber - 1) * LINE_HEIGHT_PX;
  const visibleTop = textarea.scrollTop;
  const visibleBottom = visibleTop + textarea.clientHeight - LINE_HEIGHT_PX;

  if (lineTop < visibleTop) {
    textarea.scrollTop = Math.max(0, lineTop - LINE_HEIGHT_PX);
  } else if (lineTop > visibleBottom) {
    textarea.scrollTop = Math.max(0, lineTop - textarea.clientHeight + LINE_HEIGHT_PX * 3);
  }

  scrollWorkflowDecorations();
}

function applyEditorLineHighlight(status = runtimeState.workflowStatus || {}) {
  const textarea = $('workflow-text');
  if (!textarea) {
    return;
  }

  const { activeLine, errorLine } = getHighlightedLines(status);
  const backgrounds = [];

  if (activeLine) {
    const top = EDITOR_PADDING_TOP_PX + ((activeLine - 1) * LINE_HEIGHT_PX);
    const bottom = top + LINE_HEIGHT_PX;
    backgrounds.push(`linear-gradient(to bottom, transparent ${top}px, rgba(59, 130, 246, 0.16) ${top}px, rgba(59, 130, 246, 0.16) ${bottom}px, transparent ${bottom}px)`);
  }

  if (errorLine) {
    const top = EDITOR_PADDING_TOP_PX + ((errorLine - 1) * LINE_HEIGHT_PX);
    const bottom = top + LINE_HEIGHT_PX;
    backgrounds.push(`linear-gradient(to bottom, transparent ${top}px, rgba(239, 68, 68, 0.16) ${top}px, rgba(239, 68, 68, 0.16) ${bottom}px, transparent ${bottom}px)`);
  }

  textarea.style.backgroundImage = backgrounds.length ? backgrounds.join(',') : 'none';
  textarea.style.backgroundRepeat = 'no-repeat';
}

function updateWorkflowErrorBanner(status = runtimeState.workflowStatus || {}) {
  const errorBanner = $('workflow-editor-error');
  if (!errorBanner) {
    return;
  }

  if (!status.error) {
    errorBanner.classList.add('hidden');
    errorBanner.textContent = '';
    return;
  }

  errorBanner.classList.remove('hidden');
  errorBanner.textContent = status.error;
}

function renderWorkflowLineNumbers(status = runtimeState.workflowStatus || {}) {
  const textarea = $('workflow-text');
  const gutter = $('workflow-line-numbers');
  if (!textarea || !gutter) {
    return;
  }

  const { activeLine, errorLine } = getHighlightedLines(status);
  const fragment = document.createDocumentFragment();
  const lineCount = getLineCount(textarea.value);

  gutter.innerHTML = '';

  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
    const line = document.createElement('div');
    line.className = 'workflow-line-number';
    if (lineNumber === activeLine) {
      line.classList.add('active');
    }
    if (lineNumber === errorLine) {
      line.classList.add('error');
    }
    line.textContent = String(lineNumber);
    fragment.appendChild(line);
  }

  gutter.appendChild(fragment);
  scrollWorkflowDecorations();
}

export function syncWorkflowEditorFeedback(status = runtimeState.workflowStatus || {}) {
  renderWorkflowLineNumbers(status);
  applyEditorLineHighlight(status);
  updateWorkflowErrorBanner(status);

  const highlightedLine = parseWorkflowErrorLine(status) || (status.state === 'running' ? status.currentLine : null);
  if (highlightedLine) {
    ensureLineVisible(highlightedLine);
  }
}

function applyWorkflowFileReference(workflowFileName = '') {
  runtimeState.workflowFileName = workflowFileName;
  document.dispatchEvent(new CustomEvent('workflow:file-meta-changed'));
}

export function loadWorkflowDraft({
  name = '',
  script = '',
  workflowId = null,
  clearFileReference = false,
  workflowFileName = '',
  persistDraft = false,
  clearPersistedDraft = false
} = {}) {
  const textarea = $('workflow-text');
  const nameInput = $('workflow-name');

  if (nameInput) {
    nameInput.value = name;
  }

  if (textarea) {
    textarea.value = script;
  }

  activeWorkflowId = workflowId && getWorkflowById(workflowId) ? workflowId : null;
  if (!runtimeState.workflowRunning) {
    runtimeState.workflowStatus = { state: 'idle', isRunning: false, message: 'IDLE', error: null };
  } else {
    runtimeState.workflowStatus = runtimeState.workflowStatus || { state: 'idle', isRunning: false, message: 'IDLE', error: null };
  }

  if (clearFileReference) {
    clearWorkflowFileContext();
  } else {
    applyWorkflowFileReference(workflowFileName || '');
  }

  renderWorkflowLibrary();
  syncWorkflowEditorFeedback(runtimeState.workflowStatus);

  if (persistDraft) {
    scheduleWorkflowDraftPersistence();
  } else if (clearPersistedDraft) {
    clearWorkflowDraftPersistence();
  }
}

export function getSavedWorkflows() {
  return savedWorkflows.map((workflow) => ({ ...workflow }));
}

function renderWorkflowLibraryEmptyState(container) {
  container.innerHTML = `
    <div class="flex h-full min-h-0 items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/40 px-4 py-6 text-center text-sm text-muted-foreground">
      ${t('workflow.library.empty', 'Saved workflows will appear here.')}
    </div>
  `;
}

function renderWorkflowLibrary() {
  const container = $('workflow-library-list');
  if (!container) {
    return;
  }

  container.innerHTML = '';

  if (!savedWorkflows.length) {
    renderWorkflowLibraryEmptyState(container);
    return;
  }

  savedWorkflows.forEach((workflow) => {
    const item = document.createElement('div');
    item.className = activeWorkflowId === workflow.id
      ? 'typed-item-card typed-item-card-workflow typed-item-card-active rounded-xl border border-border/70 bg-background/60 p-3'
      : 'typed-item-card typed-item-card-workflow rounded-xl border border-border/70 bg-background/60 p-3';
    const escapedName = escapeHtml(workflow.name);
    const lineCount = getLineCount(workflow.script);
    const lineLabel = lineCount === 1 ? t('workflow.library.lineSingle', 'line') : t('workflow.library.linePlural', 'lines');

    item.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="typed-item-badge typed-item-badge-workflow">WF</span>
            <div class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">${t('tests.type.workflow', 'Workflow')}</div>
          </div>
          <div class="mt-2 truncate text-sm font-semibold text-foreground">${escapedName}</div>
          <div class="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            ${lineCount} ${lineLabel}
          </div>
        </div>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-2">
        <button
          class="inline-flex h-8 items-center justify-center rounded-md border border-input bg-transparent px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          data-workflow-action="load"
          data-workflow-id="${workflow.id}"
          type="button"
        >
          ${t('workflow.library.load', 'Load')}
        </button>
        <button
          class="inline-flex h-8 items-center justify-center rounded-md border border-destructive/40 bg-transparent px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/12 disabled:opacity-50"
          data-workflow-action="delete"
          data-workflow-id="${workflow.id}"
          type="button"
        >
          ${t('workflow.library.delete', 'Delete')}
        </button>
      </div>
    `;

    container.appendChild(item);
  });
}

async function saveCurrentWorkflowToLibrary() {
  const name = $('workflow-name')?.value?.trim() || '';
  const script = $('workflow-text')?.value || '';

  if (!name) {
    setLibraryState('workflow.library.errorNameRequired');
    $('workflow-name')?.focus();
    return;
  }

  if (!script.trim()) {
    setLibraryState('workflow.library.errorScriptRequired');
    $('workflow-text')?.focus();
    return;
  }

  const existing = activeWorkflowId ? getWorkflowById(activeWorkflowId) : null;
  const conflict = getWorkflowNameConflict(name, activeWorkflowId);
  if (conflict) {
    setLibraryState('workflow.library.errorDuplicate');
    $('workflow-name')?.focus();
    return;
  }

  const sequenceNames = await getStoredSequenceNames();
  if (sequenceNames.has(name.toLowerCase())) {
    setLibraryState('workflow.library.errorDuplicate');
    $('workflow-name')?.focus();
    return;
  }

  const now = Date.now();
  const workflow = {
    id: existing?.id || `workflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    script,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  activeWorkflowId = workflow.id;
  savedWorkflows = [
    workflow,
    ...savedWorkflows.filter((entry) => entry.id !== workflow.id)
  ].sort((a, b) => b.updatedAt - a.updatedAt);

  await persistSavedWorkflows();
  clearWorkflowDraftPersistence();
  renderWorkflowLibrary();
  setLibraryState(existing ? 'workflow.library.updated' : 'workflow.library.saved');
  notifyWorkflowLibraryChanged();
  log({ workflow_library_saved: workflow.name });
}

async function deleteSavedWorkflow(workflowId) {
  const workflow = getWorkflowById(workflowId);
  if (!workflow) {
    return;
  }

  const confirmed = window.confirm(t('workflow.library.confirmDelete', 'Delete saved workflow "{name}"?').replace('{name}', workflow.name));
  if (!confirmed) {
    return;
  }

  savedWorkflows = savedWorkflows.filter((entry) => entry.id !== workflowId);
  if (activeWorkflowId === workflowId) {
    activeWorkflowId = null;
  }

  await persistSavedWorkflows();
  renderWorkflowLibrary();
  setLibraryState('workflow.library.deleted');
  notifyWorkflowLibraryChanged();
  log({ workflow_library_deleted: workflow.name });
}

async function createWorkflowCopyName(name) {
  const baseName = `${name} ${t('sequencer.copySuffix', 'Copy')}`;
  const takenNames = new Set(savedWorkflows.map((workflow) => workflow.name.toLowerCase()));
  const sequenceNames = await getStoredSequenceNames();
  sequenceNames.forEach((sequenceName) => takenNames.add(sequenceName));

  if (!takenNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  let index = 2;
  while (takenNames.has(`${baseName} ${index}`.toLowerCase())) {
    index += 1;
  }

  return `${baseName} ${index}`;
}

export async function duplicateWorkflowById(workflowId) {
  const workflow = getWorkflowById(workflowId);
  if (!workflow) {
    return null;
  }

  const now = Date.now();
  const duplicatedWorkflow = {
    id: `workflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: await createWorkflowCopyName(workflow.name),
    script: workflow.script,
    createdAt: now,
    updatedAt: now
  };

  savedWorkflows = [duplicatedWorkflow, ...savedWorkflows].sort((a, b) => b.updatedAt - a.updatedAt);
  await persistSavedWorkflows();
  renderWorkflowLibrary();
  notifyWorkflowLibraryChanged();
  log({ workflow_library_duplicated: duplicatedWorkflow.name });
  return duplicatedWorkflow;
}

export async function deleteWorkflowById(workflowId) {
  await deleteSavedWorkflow(workflowId);
}

export function loadWorkflowById(workflowId, { navigate = true } = {}) {
  const workflow = getWorkflowById(workflowId);
  if (!workflow) {
    return false;
  }

  loadWorkflowDraft({
    name: workflow.name,
    script: workflow.script,
    workflowId: workflow.id,
    clearFileReference: true
  });
  setLibraryState('workflow.library.loaded');
  if (navigate) {
    navigateToMethodView();
  }
  return true;
}

function bindWorkflowLibraryActions() {
  const list = $('workflow-library-list');
  if (list && list.dataset.bound !== 'true') {
    list.dataset.bound = 'true';
    list.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-workflow-action]');
      if (!button) {
        return;
      }

      const workflowId = button.dataset.workflowId;
      const action = button.dataset.workflowAction;

      if (action === 'load') {
        loadWorkflowById(workflowId);
        return;
      }

      if (action === 'delete') {
        await deleteSavedWorkflow(workflowId);
      }
    });
  }

  const saveButton = $('save-workflow-library-btn');
  if (saveButton && saveButton.dataset.bound !== 'true') {
    saveButton.dataset.bound = 'true';
    saveButton.addEventListener('click', saveCurrentWorkflowToLibrary);
  }
}

function bindWorkflowDraftPersistence() {
  ['workflow-name', 'workflow-text'].forEach((id) => {
    const element = $(id);
    if (!element || element.dataset.draftBound === 'true') {
      return;
    }

    element.dataset.draftBound = 'true';
    element.addEventListener('input', scheduleWorkflowDraftPersistence);
  });
}

function bindWorkflowExamples() {
  document.querySelectorAll('[data-example-id]').forEach((button) => {
    if (button.dataset.bound === 'true') {
      return;
    }

    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      const example = EXAMPLE_WORKFLOWS.find((entry) => entry.id === button.dataset.exampleId);
      if (!example) {
        return;
      }

      loadWorkflowDraft({
        name: t(example.nameKey, 'Workflow Example'),
        script: example.script,
        workflowId: null,
        clearFileReference: true,
        persistDraft: true
      });
      setLibraryState('workflow.library.exampleLoaded');
    });
  });
}

function bindWorkflowEditorDecorations() {
  const textarea = $('workflow-text');
  if (!textarea || textarea.dataset.decorationsBound === 'true') {
    return;
  }

  textarea.dataset.decorationsBound = 'true';
  textarea.addEventListener('input', () => {
    syncWorkflowEditorFeedback(runtimeState.workflowStatus || {});
  });
  textarea.addEventListener('scroll', scrollWorkflowDecorations);
}

export async function initWorkflowLibrary() {
  bindWorkflowLibraryActions();
  bindWorkflowDraftPersistence();
  bindWorkflowExamples();
  bindWorkflowEditorDecorations();

  try {
    const stored = await window.api.store.get(STORE_KEY);
    savedWorkflows = normalizeSavedWorkflows(stored);
    const storedDraft = normalizeWorkflowDraft(await window.api.store.get(DRAFT_STORE_KEY));
    if (storedDraft) {
      loadWorkflowDraft({
        ...storedDraft,
        workflowId: getWorkflowById(storedDraft.workflowId)?.id || null,
        persistDraft: false,
        clearPersistedDraft: false
      });
    } else {
      renderWorkflowLibrary();
    }
    setLibraryState('workflow.library.ready');
    notifyWorkflowLibraryChanged();
  } catch (error) {
    savedWorkflows = [];
    renderWorkflowLibrary();
    setLibraryState('workflow.library.errorLoad');
    notifyWorkflowLibraryChanged();
    log({ workflow_library_error: error.message });
  }

  syncWorkflowEditorFeedback(runtimeState.workflowStatus || {});

  if (!languageListenerBound) {
    languageListenerBound = true;
    document.addEventListener('app:language-changed', () => {
      renderWorkflowLibrary();
      setLibraryState(libraryStateKey);
      syncWorkflowEditorFeedback(runtimeState.workflowStatus || {});
    });
  }
}
