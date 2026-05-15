const EventEmitter = require('events');

const serialAdapter = require('../adapters/serialAdapter');

class DcxSerialService extends EventEmitter {
  constructor() {
    super();

    serialAdapter.on('data', (data) => {
      this.emit('data', data);
    });

    serialAdapter.on('disconnect', () => {
      this.emit('disconnect');
    });
  }

  isConnected() {
    return Boolean(serialAdapter.connected);
  }

  async listPorts() {
    return serialAdapter.listPorts();
  }

  async resolvePort(preferredPort = '') {
    const requestedPort = String(preferredPort || '').trim();
    if (requestedPort) {
      return requestedPort;
    }

    const ports = await this.listPorts();
    const detectedPort = ports.find((port) => port.isTeensy) || ports[0];

    if (!detectedPort?.path) {
      throw new Error('No Teensy serial port detected');
    }

    return detectedPort.path;
  }

  async connect(preferredPort = '') {
    const port = await this.resolvePort(preferredPort);
    await serialAdapter.connect(port);

    return {
      success: true,
      port
    };
  }

  disconnect() {
    if (this.isConnected()) {
      serialAdapter.disconnect();
    }
  }

  sendCommand(command) {
    if (!this.isConnected()) {
      throw new Error('Serial transport is not connected');
    }

    serialAdapter.sendCommand(command);
    return {
      success: true,
      mode: 'serial',
      command
    };
  }
}

module.exports = DcxSerialService;
