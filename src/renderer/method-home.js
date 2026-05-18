import { $, runtimeState } from './runtime.js';
import { t } from './preferences.js';
import { deleteSequenceById, duplicateSequenceById, getSavedSequences, loadSequenceById, loadSequenceDraft } from './sequence-library.js';
import { deleteWorkflowById, duplicateWorkflowById, getSavedWorkflows, loadWorkflowById, loadWorkflowDraft } from './workflow-library.js';

const FAVORITES_STORE_KEY = 'method-home-favorites';
const RECENTS_LIMIT = 8;

let activeMethodHomeTab = 'recents';
let favoriteMethodKeys = new Set();
let highlightedMethodKey = null;
let highlightedMethodTimer = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildMethodKey(type, id) {
  return `${type}:${id}`;
}

function formatDate(value) {
  if (!value) {
    return '--';
  }

  return new Date(value).toLocaleDateString();
}

function getMethodHomeItems() {
  const sequences = getSavedSequences().map((sequence) => ({
    key: buildMethodKey('sequence', sequence.id),
    id: sequence.id,
    type: 'sequence',
    name: sequence.name,
    updatedAt: sequence.updatedAt || sequence.createdAt || Date.now(),
    detail: `${sequence.timeline.length} ${sequence.timeline.length === 1 ? t('sequencer.blocks.single', 'block') : t('sequencer.blocks.plural', 'blocks')}`
  }));

  const workflows = getSavedWorkflows().map((workflow) => {
    const lineCount = Math.max(1, String(workflow.script || '').split('\n').filter((line) => line.trim()).length);
    return {
      key: buildMethodKey('workflow', workflow.id),
      id: workflow.id,
      type: 'workflow',
      name: workflow.name,
      updatedAt: workflow.updatedAt || workflow.createdAt || Date.now(),
      detail: `${lineCount} ${lineCount === 1 ? t('workflow.library.lineSingle', 'line') : t('workflow.library.linePlural', 'lines')}`
    };
  });

  return [...sequences, ...workflows].sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
}

function syncFavoriteMethodKeys(items) {
  const validKeys = new Set(items.map((item) => item.key));
  const nextFavoriteKeys = [...favoriteMethodKeys].filter((key) => validKeys.has(key));

  if (nextFavoriteKeys.length === favoriteMethodKeys.size) {
    return;
  }

  favoriteMethodKeys = new Set(nextFavoriteKeys);
  const persistResult = window.api?.store?.set?.(FAVORITES_STORE_KEY, nextFavoriteKeys);
  if (persistResult && typeof persistResult.catch === 'function') {
    persistResult.catch(() => {});
  }
}

function getFilteredMethodHomeItems() {
  const searchValue = ($('method-home-search')?.value || '').trim().toLowerCase();
  const items = getMethodHomeItems();

  syncFavoriteMethodKeys(items);

  const visibleItems = items.filter((item) => {
    if (activeMethodHomeTab === 'favorites' && !favoriteMethodKeys.has(item.key)) {
      return false;
    }

    if (activeMethodHomeTab === 'sequence' && item.type !== 'sequence') {
      return false;
    }

    if (activeMethodHomeTab === 'workflow' && item.type !== 'workflow') {
      return false;
    }

    if (searchValue && !`${item.name} ${item.type}`.toLowerCase().includes(searchValue)) {
      return false;
    }

    return true;
  });

  return activeMethodHomeTab === 'recents'
    ? visibleItems.slice(0, RECENTS_LIMIT)
    : visibleItems;
}

function setMethodHomeTabButtonState() {
  document.querySelectorAll('[data-method-home-tab]').forEach((button) => {
    const isActive = button.dataset.methodHomeTab === activeMethodHomeTab;
    button.classList.toggle('bg-foreground', isActive);
    button.classList.toggle('text-background', isActive);
    button.classList.toggle('hover:bg-foreground/90', isActive);
    button.classList.toggle('text-muted-foreground', !isActive);
  });
}

function syncMethodHomeActionState() {
  const isBusy = Boolean(runtimeState.sequenceRunning || runtimeState.workflowRunning);

  document.querySelectorAll('[data-method-home-action], [data-method-home-duplicate], [data-method-home-delete]').forEach((button) => {
    button.disabled = isBusy;
  });

  document.querySelectorAll('[data-method-home-open]').forEach((card) => {
    card.classList.toggle('pointer-events-none', isBusy);
    card.classList.toggle('opacity-60', isBusy);
  });
}

function renderMethodHomeList() {
  const container = $('method-home-list');
  if (!container) {
    return;
  }

  setMethodHomeTabButtonState();

  const items = getFilteredMethodHomeItems();

  if (!items.length) {
    container.innerHTML = `
      <div class="rounded-2xl border border-dashed border-border/70 bg-background/40 px-4 py-8 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
        ${escapeHtml(t('method.home.empty', 'No methods match this view yet.'))}
      </div>
    `;
    syncMethodHomeActionState();
    return;
  }

  container.innerHTML = items.map((item) => {
    const isFavorite = favoriteMethodKeys.has(item.key);
    const typeCardClassName = item.type === 'sequence'
      ? 'typed-item-card typed-item-card-sequence'
      : 'typed-item-card typed-item-card-workflow';
    const typeBadgeClassName = item.type === 'sequence'
      ? 'typed-item-badge typed-item-badge-sequence'
      : 'typed-item-badge typed-item-badge-workflow';
    const typeShortLabel = item.type === 'sequence' ? 'SEQ' : 'WF';
    const cardClassName = item.key === highlightedMethodKey
      ? `${typeCardClassName} typed-item-card-highlight rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm transition-colors hover:border-primary/30 hover:bg-accent/20`
      : `${typeCardClassName} rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm transition-colors hover:border-primary/30 hover:bg-accent/20`;
    return `
      <div
        class="${cardClassName}"
        data-method-home-open="${escapeHtml(item.key)}"
        data-method-id="${escapeHtml(item.id)}"
        data-method-type="${escapeHtml(item.type)}"
        role="button"
        tabindex="0"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="${typeBadgeClassName}">${typeShortLabel}</span>
              <div class="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                ${escapeHtml(t(`tests.type.${item.type}`, item.type))}
              </div>
            </div>
            <div class="mt-2 truncate text-base font-semibold text-foreground">${escapeHtml(item.name)}</div>
            <div class="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>${escapeHtml(item.detail)}</span>
              <span>${escapeHtml(t('method.home.updated', 'Updated'))} ${escapeHtml(formatDate(item.updatedAt))}</span>
            </div>
          </div>

          <button
            class="inline-flex h-8 items-center justify-center rounded-md border border-input bg-transparent px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            data-method-home-toggle-favorite="${escapeHtml(item.key)}"
            type="button"
          >
            ${escapeHtml(isFavorite ? t('method.home.unfavorite', 'Favorited') : t('method.home.favorite', 'Favorite'))}
          </button>
        </div>

        <div class="mt-4 flex gap-2">
          <button
            class="inline-flex h-9 items-center justify-center rounded-md border border-input bg-transparent px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            data-method-home-duplicate="${escapeHtml(item.key)}"
            data-method-id="${escapeHtml(item.id)}"
            data-method-type="${escapeHtml(item.type)}"
            type="button"
          >
            ${escapeHtml(t('method.home.duplicate', 'Duplicate'))}
          </button>
          <button
            class="inline-flex h-9 items-center justify-center rounded-md border border-destructive/40 bg-transparent px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/12 disabled:opacity-50"
            data-method-home-delete="${escapeHtml(item.key)}"
            data-method-id="${escapeHtml(item.id)}"
            data-method-type="${escapeHtml(item.type)}"
            type="button"
          >
            ${escapeHtml(t('method.home.delete', 'Delete'))}
          </button>
        </div>
      </div>
    `;
  }).join('');

  syncMethodHomeActionState();
}

function focusHighlightedMethodCard() {
  if (!highlightedMethodKey) {
    return;
  }

  const card = document.querySelector(`[data-method-home-open="${highlightedMethodKey}"]`);
  if (!card) {
    return;
  }

  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function highlightMethodCard(methodKey) {
  highlightedMethodKey = methodKey;
  renderMethodHomeList();

  window.requestAnimationFrame(() => {
    focusHighlightedMethodCard();
  });

  if (highlightedMethodTimer) {
    window.clearTimeout(highlightedMethodTimer);
  }

  highlightedMethodTimer = window.setTimeout(() => {
    highlightedMethodKey = null;
    highlightedMethodTimer = null;
    renderMethodHomeList();
  }, 1800);
}

function navigateTo(tab) {
  document.dispatchEvent(new CustomEvent('app:navigate', { detail: { tab } }));
}

function bindEditorHomeButtons() {
  ['sequencer-back-home-btn', 'workflow-back-home-btn'].forEach((id) => {
    const button = $(id);
    if (!button || button.dataset.bound === 'true') {
      return;
    }

    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      navigateTo('method');
    });
  });
}

function resetWorkflowDraft() {
  loadWorkflowDraft({
    name: '',
    script: '',
    workflowId: null,
    clearFileReference: true,
    clearPersistedDraft: true
  });

  const workflowState = $('workflow-library-state');
  if (workflowState) {
    workflowState.textContent = t('workflow.library.ready', 'Library ready');
  }
}

function bindMethodHomeTabs() {
  document.querySelectorAll('[data-method-home-tab]').forEach((button) => {
    if (button.dataset.bound === 'true') {
      return;
    }

    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      activeMethodHomeTab = button.dataset.methodHomeTab || 'recents';
      renderMethodHomeList();
    });
  });
}

function bindMethodHomeSearch() {
  const input = $('method-home-search');
  if (!input || input.dataset.bound === 'true') {
    return;
  }

  input.dataset.bound = 'true';
  input.addEventListener('input', renderMethodHomeList);
}

function bindMethodHomeTemplates() {
  const newSequenceButton = $('method-home-new-sequence');
  if (newSequenceButton && newSequenceButton.dataset.bound !== 'true') {
    newSequenceButton.dataset.bound = 'true';
    newSequenceButton.addEventListener('click', () => {
      loadSequenceDraft({ clearPersistedDraft: true });
      navigateTo('sequencer');
    });
  }

  const newWorkflowButton = $('method-home-new-workflow');
  if (newWorkflowButton && newWorkflowButton.dataset.bound !== 'true') {
    newWorkflowButton.dataset.bound = 'true';
    newWorkflowButton.addEventListener('click', () => {
      resetWorkflowDraft();
      navigateTo('workflow');
    });
  }

  document.querySelectorAll('[data-example-id]').forEach((button) => {
    if (button.dataset.methodHomeExampleBound === 'true') {
      return;
    }

    button.dataset.methodHomeExampleBound = 'true';
    button.addEventListener('click', () => {
      window.setTimeout(() => {
        navigateTo('workflow');
      }, 0);
    });
  });
}

function bindMethodHomeListActions() {
  const container = $('method-home-list');
  if (!container || container.dataset.bound === 'true') {
    return;
  }

  container.dataset.bound = 'true';
  container.addEventListener('click', async (event) => {
    const favoriteButton = event.target.closest('[data-method-home-toggle-favorite]');
    if (favoriteButton) {
      const methodKey = favoriteButton.dataset.methodHomeToggleFavorite;
      if (!methodKey) {
        return;
      }

      if (favoriteMethodKeys.has(methodKey)) {
        favoriteMethodKeys.delete(methodKey);
      } else {
        favoriteMethodKeys.add(methodKey);
      }

      await window.api?.store?.set?.(FAVORITES_STORE_KEY, [...favoriteMethodKeys]);
      renderMethodHomeList();
      return;
    }

    const actionButton = event.target.closest('[data-method-home-duplicate], [data-method-home-delete]');
    if (!actionButton) {
      return;
    }

    const methodId = actionButton.dataset.methodId;
    const methodType = actionButton.dataset.methodType;
    if (!methodId || !methodType) {
      return;
    }

    if (actionButton.dataset.methodHomeDuplicate != null) {
      let duplicatedItem = null;

      if (methodType === 'sequence') {
        duplicatedItem = await duplicateSequenceById(methodId);
      } else {
        duplicatedItem = await duplicateWorkflowById(methodId);
      }

      if (duplicatedItem) {
        if (activeMethodHomeTab === 'favorites') {
          activeMethodHomeTab = 'recents';
        }

        highlightMethodCard(buildMethodKey(methodType, duplicatedItem.id));
      }

      return;
    }

    if (methodType === 'sequence') {
      await deleteSequenceById(methodId);
    } else {
      await deleteWorkflowById(methodId);
    }
  });

  container.addEventListener('keydown', (event) => {
    const card = event.target.closest('[data-method-home-open]');
    if (!card || !['Enter', ' '].includes(event.key)) {
      return;
    }

    event.preventDefault();
    card.click();
  });

  container.addEventListener('click', (event) => {
    if (event.target.closest('[data-method-home-toggle-favorite], [data-method-home-duplicate], [data-method-home-delete]')) {
      return;
    }

    const card = event.target.closest('[data-method-home-open]');
    if (!card || runtimeState.sequenceRunning || runtimeState.workflowRunning) {
      return;
    }

    const methodId = card.dataset.methodId;
    const methodType = card.dataset.methodType;
    if (!methodId || !methodType) {
      return;
    }

    if (methodType === 'sequence') {
      loadSequenceById(methodId);
      return;
    }

    loadWorkflowById(methodId);
  });
}

async function loadMethodHomeFavorites() {
  try {
    const stored = await window.api?.store?.get?.(FAVORITES_STORE_KEY);
    favoriteMethodKeys = new Set(Array.isArray(stored) ? stored.filter((value) => typeof value === 'string' && value) : []);
  } catch {
    favoriteMethodKeys = new Set();
  }
}

export async function initializeMethodHome() {
  await loadMethodHomeFavorites();

  bindMethodHomeTabs();
  bindMethodHomeSearch();
  bindMethodHomeTemplates();
  bindEditorHomeButtons();
  bindMethodHomeListActions();
  renderMethodHomeList();

  document.addEventListener('app:tests-library-changed', renderMethodHomeList);
  document.addEventListener('app:language-changed', renderMethodHomeList);
  document.addEventListener('app:sequence-status', syncMethodHomeActionState);
  document.addEventListener('app:workflow-status', syncMethodHomeActionState);
}
