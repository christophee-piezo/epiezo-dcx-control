import {
  $,
  clearDragPayload,
  clearTimeline,
  createTimelineBlock,
  getDragPayload,
  getTimeline,
  insertTimelineBlock,
  removeTimelineBlock,
  moveTimelineBlock,
  setDragPayload,
  updateTimelineBlock
} from './runtime.js';

function notifySequenceEditorChanged() {
  document.dispatchEvent(new CustomEvent('sequence-editor:changed'));
}

function syncNativeDragData(event, payload) {
  if (!event.dataTransfer) return;

  const serialized = JSON.stringify(payload);
  event.dataTransfer.setData('text/plain', serialized);
  event.dataTransfer.setData('application/x-epiezo-sequence', serialized);
}

function getDropIndex(container, clientX) {
  const blocks = Array.from(container.querySelectorAll('.block'));

  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;

    if (clientX < midpoint) {
      return Number(block.dataset.index);
    }
  }

  return blocks.length;
}

function applyDrop(dropIndex) {
  const payload = getDragPayload();
  if (!payload) return;

  if (payload.type === 'template') {
    insertTimelineBlock(dropIndex, createTimelineBlock(payload.blockType));
    renderTimeline();
    notifySequenceEditorChanged();
    return;
  }

  if (payload.type === 'timeline-block') {
    const sourceIndex = payload.index;
    const adjustedDropIndex = sourceIndex < dropIndex ? dropIndex - 1 : dropIndex;

    moveTimelineBlock(sourceIndex, adjustedDropIndex);
    renderTimeline();
    notifySequenceEditorChanged();
  }
}

function bindTemplateDnD() {
  document.querySelectorAll('[data-sequence-template]').forEach((template) => {
    if (template.dataset.dndBound === 'true') return;

    template.dataset.dndBound = 'true';
    template.addEventListener('click', () => {
      insertTimelineBlock(getTimeline().length, createTimelineBlock(template.dataset.sequenceTemplate));
      renderTimeline();
      notifySequenceEditorChanged();
    });

    template.addEventListener('dragstart', (event) => {
      const payload = {
        type: 'template',
        blockType: event.currentTarget.dataset.sequenceTemplate
      };

      setDragPayload(payload);
      syncNativeDragData(event, payload);

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'copy';
      }
    });

    template.addEventListener('dragend', () => {
      clearDragPayload();
    });
  });
}

function bindTimelineDropZone(container) {
  if (container.dataset.dndBound === 'true') return;

  container.dataset.dndBound = 'true';
  container.addEventListener('dragover', (event) => {
    const payload = getDragPayload();
    if (!payload) return;

    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = payload.type === 'template' ? 'copy' : 'move';
    }
  });

  container.addEventListener('drop', (event) => {
    const payload = getDragPayload();
    if (!payload) return;

    event.preventDefault();

    const dropIndex = getDropIndex(container, event.clientX);
    applyDrop(dropIndex);
    clearDragPayload();
  });
}

function parseBlockFieldValue(field, value) {
  const parsed = parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    return null;
  }

  if (field === 'amplitude') {
    return Math.max(0, Math.min(100, parsed));
  }

  return Math.max(0, parsed);
}

function getBlockDisplayName(type) {
  return type === 'PAUSE' ? 'STOP' : type;
}

function setBlockDragEnabled(block, enabled) {
  if (!block) {
    return;
  }

  block.draggable = Boolean(enabled);
}

function bindTimelineEditor(container) {
  if (container.dataset.editorBound === 'true') return;

  container.dataset.editorBound = 'true';
  container.addEventListener('pointerdown', (event) => {
    const input = event.target.closest('input[data-block-field]');
    if (!input) return;

    setBlockDragEnabled(input.closest('.block'), false);
  });

  container.addEventListener('focusin', (event) => {
    const input = event.target.closest('input[data-block-field]');
    if (!input) return;

    setBlockDragEnabled(input.closest('.block'), false);
  });

  container.addEventListener('focusout', (event) => {
    const input = event.target.closest('input[data-block-field]');
    if (!input) return;

    const block = input.closest('.block');
    if (block && event.relatedTarget && block.contains(event.relatedTarget)) {
      return;
    }

    setBlockDragEnabled(block, true);
  });

  container.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove-block]');
    if (!removeButton) return;

    const index = Number(removeButton.dataset.removeBlock);
    if (Number.isNaN(index)) return;

    removeTimelineBlock(index);
    renderTimeline();
    notifySequenceEditorChanged();
  });

  container.addEventListener('change', (event) => {
    const input = event.target.closest('[data-block-field]');
    if (!input) return;

    const index = Number(input.dataset.blockIndex);
    const field = input.dataset.blockField;

    if (Number.isNaN(index) || !field) return;

    const nextValue = parseBlockFieldValue(field, input.value);
    if (nextValue == null) {
      renderTimeline();
      return;
    }

    updateTimelineBlock(index, { [field]: nextValue });
    renderTimeline();
    notifySequenceEditorChanged();
  });
}

function attachDnD() {
  bindTemplateDnD();

  const container = $('main-timeline');
  if (container) {
    bindTimelineDropZone(container);
    bindTimelineEditor(container);
  }

  document.querySelectorAll('.block').forEach((block) => {
    block.addEventListener('dragstart', (event) => {
      if (event.target.closest('input, button')) {
        event.preventDefault();
        clearDragPayload();
        return;
      }

      const payload = {
        type: 'timeline-block',
        index: Number(event.currentTarget.dataset.index)
      };

      setDragPayload(payload);
      syncNativeDragData(event, payload);
      event.currentTarget.style.opacity = '0.4';

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
      }
    });

    block.addEventListener('dragover', (event) => {
      if (!getDragPayload()) return;

      event.preventDefault();

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
    });

    block.addEventListener('dragend', (event) => {
      event.currentTarget.style.opacity = '1';
      clearDragPayload();
    });
  });
}

export function clearSequencerTimeline() {
  clearTimeline();
  renderTimeline();
  notifySequenceEditorChanged();
}

export function renderTimeline() {
  const container = $('main-timeline');
  if (!container) return;

  container.innerHTML = '';

  if (!getTimeline().length) {
    container.innerHTML = `
      <div class="rounded-xl border border-dashed border-border/70 bg-background/40 px-4 py-10 text-center text-sm text-muted-foreground">
        Drag PULSE or STOP blocks here to build a sequence.
      </div>
    `;
    attachDnD();
    return;
  }

  getTimeline().forEach((block, index) => {
    const element = document.createElement('div');
    element.className = `block ${block.type.toLowerCase()}`;
    element.draggable = true;
    element.dataset.index = index;
    const amplitudeMarkup = block.type === 'PULSE'
      ? `
        <div class="grid gap-1.5">
          <label class="flex flex-col gap-1 text-[0.68rem] text-muted-foreground">
            <span class="uppercase tracking-[0.18em]">Amplitude</span>
            <input
              class="h-7 rounded-md border border-input bg-background/70 px-2 text-xs text-foreground outline-none"
              data-block-field="amplitude"
              data-block-index="${index}"
              max="100"
              min="0"
              type="number"
              value="${block.amplitude ?? 80}"
            />
          </label>
          <label class="flex flex-col gap-1 text-[0.68rem] text-muted-foreground">
            <span class="uppercase tracking-[0.18em]">Ramp</span>
            <input
              class="h-7 rounded-md border border-input bg-background/70 px-2 text-xs text-foreground outline-none"
              data-block-field="ramp"
              data-block-index="${index}"
              min="0"
              type="number"
              value="${block.ramp ?? 50}"
            />
          </label>
        </div>
      `
      : '';

    element.innerHTML = `
      <button class="block-remove" data-remove-block="${index}" type="button">x</button>
      <div class="block-label">${getBlockDisplayName(block.type)}</div>
      <div class="grid gap-2">
        <label class="flex flex-col gap-1 text-[0.68rem] text-muted-foreground">
          <span class="uppercase tracking-[0.18em]">Duration</span>
          <input
            class="h-7 rounded-md border border-input bg-background/70 px-2 text-xs text-foreground outline-none"
            data-block-field="duration"
            data-block-index="${index}"
            min="0"
            type="number"
            value="${block.duration || 0}"
          />
        </label>
        ${amplitudeMarkup}
      </div>
    `;

    container.appendChild(element);
  });

  attachDnD();
}
