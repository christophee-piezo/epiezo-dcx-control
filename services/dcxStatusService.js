const EventEmitter = require('events');

const dcx = require('./dcxService');

const POLL_INTERVAL_MS = 10;

function normalizeSignalValue(value, fallback = false) {
  if (value == null) {
    return fallback;
  }

  return Boolean(value);
}

class DcxStatusService extends EventEmitter {
  constructor({ pollIntervalMs = POLL_INTERVAL_MS } = {}) {
    super();

    this.pollIntervalMs = pollIntervalMs;
    this.timer = null;
    this.running = false;
    this.pollCount = 0;
    this.snapshot = this.buildSnapshot();
    this.snapshotSignature = this.buildSnapshotSignature(this.snapshot);
  }

  buildSnapshot() {
    const connectionState = typeof dcx.getConnectionStateSnapshot === 'function'
      ? dcx.getConnectionStateSnapshot()
      : {
          status: 'offline',
          mode: 'http',
          simulation: false,
          connections: {
            ethernet: false,
            teensy: false
          }
        };
    const telemetry = typeof dcx.getTelemetrySnapshot === 'function'
      ? dcx.getTelemetrySnapshot()
      : {};
    const connections = {
      ethernet: Boolean(connectionState?.connections?.ethernet),
      teensy: Boolean(connectionState?.connections?.teensy)
    };
    const status = String(connectionState?.status || 'offline').toLowerCase();
    const simulation = Boolean(connectionState?.simulation);
    const signalTelemetry = status !== 'online' && !simulation
      ? {
          ready: 0,
          active: 0,
          alarm: 0,
          seek: 0
        }
      : {
          ready: normalizeSignalValue(telemetry.ready) ? 1 : 0,
          active: normalizeSignalValue(telemetry.active) ? 1 : 0,
          alarm: normalizeSignalValue(telemetry.alarm) ? 1 : 0,
          seek: normalizeSignalValue(telemetry.seek) ? 1 : 0
        };

    return {
      status,
      mode: connectionState?.mode || 'http',
      simulation,
      intervalMs: this.pollIntervalMs,
      connections: {
        ...connections,
        both: connections.ethernet && connections.teensy
      },
      bothHardwareConnected: connections.ethernet && connections.teensy,
      telemetry: signalTelemetry,
      signals: {
        READY: Boolean(signalTelemetry.ready),
        Sonics_ACTIVE: Boolean(signalTelemetry.active),
        ALARM: Boolean(signalTelemetry.alarm),
        SEEKSCAN_OUT: Boolean(signalTelemetry.seek)
      },
      pollCount: this.pollCount,
      updatedAt: Date.now()
    };
  }

  buildSnapshotSignature(snapshot = {}) {
    return JSON.stringify({
      status: snapshot.status || 'offline',
      mode: snapshot.mode || 'http',
      simulation: Boolean(snapshot.simulation),
      ethernet: Boolean(snapshot?.connections?.ethernet),
      teensy: Boolean(snapshot?.connections?.teensy),
      both: Boolean(snapshot?.bothHardwareConnected),
      ready: Boolean(snapshot?.signals?.READY),
      active: Boolean(snapshot?.signals?.Sonics_ACTIVE),
      alarm: Boolean(snapshot?.signals?.ALARM),
      seek: Boolean(snapshot?.signals?.SEEKSCAN_OUT)
    });
  }

  getSnapshot() {
    return {
      ...this.snapshot,
      connections: {
        ...this.snapshot.connections
      },
      telemetry: {
        ...this.snapshot.telemetry
      },
      signals: {
        ...this.snapshot.signals
      }
    };
  }

  scheduleNextTick(delay = this.pollIntervalMs) {
    if (!this.running) {
      return;
    }

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      this.poll();
    }, Math.max(0, delay));
  }

  poll() {
    if (!this.running) {
      return;
    }

    this.pollCount += 1;
    const nextSnapshot = this.buildSnapshot();
    const nextSignature = this.buildSnapshotSignature(nextSnapshot);

    this.snapshot = nextSnapshot;

    if (nextSignature !== this.snapshotSignature) {
      this.snapshotSignature = nextSignature;
      this.emit('status', this.getSnapshot());
    }

    this.scheduleNextTick();
  }

  start() {
    if (this.running) {
      return this.getSnapshot();
    }

    this.running = true;
    this.snapshot = this.buildSnapshot();
    this.snapshotSignature = this.buildSnapshotSignature(this.snapshot);
    this.scheduleNextTick(0);
    return this.getSnapshot();
  }

  stop() {
    this.running = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

module.exports = new DcxStatusService();
