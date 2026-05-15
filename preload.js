const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  dcx: {
    connect: (config) => ipcRenderer.invoke('dcx:connect', config),
    disconnect: () => ipcRenderer.invoke('dcx:disconnect'),
    control: (payload) => ipcRenderer.invoke('dcx:control', payload),
    getStatus: () => ipcRenderer.invoke('dcx:getStatus'),
    getSystemInfo: () => ipcRenderer.invoke('dcx:getSystemInfo'),
    getSetup: () => ipcRenderer.invoke('dcx:getSetup'),
    getSetupDefaults: () => ipcRenderer.invoke('dcx:getSetupDefaults'),
    setParameters: (payload) => ipcRenderer.invoke('dcx:setParameters', payload),
    getHornScanStatus: () => ipcRenderer.invoke('dcx:getHornScanStatus'),
    runHornScan: () => ipcRenderer.invoke('dcx:runHornScan'),
    abortHornScan: () => ipcRenderer.invoke('dcx:abortHornScan'),
    runWeldGraph: () => ipcRenderer.invoke('dcx:runWeldGraph'),
    getIoSnapshot: () => ipcRenderer.invoke('dcx:getIoSnapshot'),
    getIoBootstrapSnapshot: () => ipcRenderer.invoke('dcx:getIoBootstrapSnapshot'),
    getIoLiveSnapshot: () => ipcRenderer.invoke('dcx:getIoLiveSnapshot'),
    listSerialPorts: () => ipcRenderer.invoke('dcx:listSerialPorts'),
    runSequence: (t) => ipcRenderer.invoke('dcx:runSequence', t),
    stopSequence: () => ipcRenderer.invoke('dcx:stopSequence'),
    getSequenceStatus: () => ipcRenderer.invoke('dcx:getSequenceStatus'),
    runWorkflow: (s) => ipcRenderer.invoke('dcx:runWorkflow', s),
    stopWorkflow: () => ipcRenderer.invoke('dcx:stopWorkflow'),
    getWorkflowStatus: () => ipcRenderer.invoke('dcx:getWorkflowStatus'),
    onStatusInit: (cb) => {
      const listener = (_, data) => cb(data);
      ipcRenderer.on('dcx:status-init', listener);

      return () => {
        ipcRenderer.removeListener('dcx:status-init', listener);
      };
    },
    onSequenceStatus: (cb) => {
      const listener = (_, data) => cb(data);
      ipcRenderer.on('sequence:status', listener);

      return () => {
        ipcRenderer.removeListener('sequence:status', listener);
      };
    },
    onTelemetry: (cb) => {
      const listener = (_, data) => cb(data);
      ipcRenderer.on('dcx:telemetry', listener);

      return () => {
        ipcRenderer.removeListener('dcx:telemetry', listener);
      };
    },
    onHornScanProgress: (cb) => {
      const listener = (_, data) => cb(data);
      ipcRenderer.on('dcx:horn-scan-progress', listener);

      return () => {
        ipcRenderer.removeListener('dcx:horn-scan-progress', listener);
      };
    },
    onWorkflowStatus: (cb) => {
      const listener = (_, data) => cb(data);
      ipcRenderer.on('workflow:status', listener);

      return () => {
        ipcRenderer.removeListener('workflow:status', listener);
      };
    }
  },

  workflow: {
    loadScript: () => ipcRenderer.invoke('workflow:loadScript'),
    saveScript: (payload) => ipcRenderer.invoke('workflow:saveScript', payload)
  },

  store: {
    get: (key) => ipcRenderer.invoke('store:get', key),
    set: (key, value) => ipcRenderer.invoke('store:set', key, value)
  }
});
