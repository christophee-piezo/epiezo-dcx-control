export const $ = (id) => document.getElementById(id);

export const VIEW_TITLES = {
  dashboard: 'Dashboard',
  tests: 'Tests',
  method: 'Method',
  sequencer: 'Sequence',
  workflow: 'Workflow',
  settings: 'Settings'
};

export const runtimeState = {
  status: 'offline',
  simulation: false,
  connections: {
    ethernet: false,
    teensy: false
  },
  connectionIndicatorState: 'offline',
  selectedSimulationMode: false,
  modeSwitchBusy: false,
  connectionConfig: {
    mode: 'http',
    host: '192.168.10.100',
    port: '',
    simulation: false
  },
  language: 'en',
  themeMode: 'dark',
  lastTelemetry: {},
  ioSnapshot: null,
  setupConfig: {},
  setupMetadata: {},
  setupDefaults: {},
  systemInfo: {},
  feedbackMessage: '',
  feedbackTone: 'default',
  feedbackTimeoutId: null,
  sequenceRunning: false,
  sequenceStatus: null,
  workflowRunning: false,
  workflowStatus: null,
  workflowFileName: '',
  hornScanRunning: false,
  heartbeatStarted: false,
  heartbeatTimer: null,
  reconnectAttempts: 0,
  locked: false,
  currentView: 'dashboard',
  initialized: false,
  statusInitCleanup: null,
  connectionFailureMessage: ''
};

let timeline = [
  { type: 'PULSE', duration: 1000, amplitude: 80, ramp: 50 },
  { type: 'PAUSE', duration: 500 }
];

let dragPayload = null;

export function getTimeline() {
  return timeline;
}

export function getTimelineSnapshot() {
  return timeline.map((block) => ({ ...block }));
}

export function createTimelineBlock(type) {
  return type === 'PAUSE'
    ? { type: 'PAUSE', duration: 500 }
    : { type: 'PULSE', duration: 1000, amplitude: 80, ramp: 50 };
}

export function setDragPayload(payload) {
  dragPayload = payload;
}

export function getDragPayload() {
  return dragPayload;
}

export function clearDragPayload() {
  dragPayload = null;
}

export function moveTimelineBlock(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;

  const moved = timeline.splice(fromIndex, 1)[0];
  if (!moved) return;

  timeline.splice(toIndex, 0, moved);
}

export function insertTimelineBlock(index, block) {
  timeline.splice(index, 0, block);
}

export function updateTimelineBlock(index, patch) {
  const current = timeline[index];
  if (!current) return;

  timeline[index] = {
    ...current,
    ...patch
  };
}

export function removeTimelineBlock(index) {
  timeline.splice(index, 1);
}

export function setTimeline(nextTimeline = []) {
  timeline = Array.isArray(nextTimeline)
    ? nextTimeline.map((block) => ({ ...block }))
    : [];
}

export function clearTimeline() {
  timeline = [];
}
