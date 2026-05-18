const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  auth: {
    bootstrap: () => ipcRenderer.invoke('auth:bootstrap'),
    register: (payload) => ipcRenderer.invoke('auth:register', payload),
    login: (payload) => ipcRenderer.invoke('auth:login', payload),
    logout: () => ipcRenderer.invoke('auth:logout'),
    touchSession: () => ipcRenderer.invoke('auth:touchSession'),
    listUsers: () => ipcRenderer.invoke('auth:listUsers'),
    createUser: (payload) => ipcRenderer.invoke('auth:createUser', payload),
    updateUser: (payload) => ipcRenderer.invoke('auth:updateUser', payload),
    deleteUser: (payload) => ipcRenderer.invoke('auth:deleteUser', payload),
    resetUserPassword: (payload) => ipcRenderer.invoke('auth:resetUserPassword', payload),
    changePassword: (payload) => ipcRenderer.invoke('auth:changePassword', payload),
    updateSettings: (payload) => ipcRenderer.invoke('auth:updateSettings', payload)
  },

  dcx: {
    connect: (config) => ipcRenderer.invoke('dcx:connect', config),
    disconnect: () => ipcRenderer.invoke('dcx:disconnect'),
    control: (payload) => ipcRenderer.invoke('dcx:control', payload),
    getStatus: () => ipcRenderer.invoke('dcx:getStatus'),
    getStatusInitSnapshot: () => ipcRenderer.invoke('dcx:getStatusInitSnapshot'),
    getStatusMonitorSnapshot: () => ipcRenderer.invoke('dcx:getStatusMonitorSnapshot'),
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
    getIoConfiguration: () => ipcRenderer.invoke('dcx:getIoConfiguration'),
    setIoConfiguration: (payload) => ipcRenderer.invoke('dcx:setIoConfiguration', payload),
    restoreIoConfigurationDefaults: () => ipcRenderer.invoke('dcx:restoreIoConfigurationDefaults'),
    listSerialPorts: () => ipcRenderer.invoke('dcx:listSerialPorts'),
    runSequence: (t) => ipcRenderer.invoke('dcx:runSequence', t),
    stopSequence: () => ipcRenderer.invoke('dcx:stopSequence'),
    getSequenceStatus: () => ipcRenderer.invoke('dcx:getSequenceStatus'),
    runWorkflow: (s) => ipcRenderer.invoke('dcx:runWorkflow', s),
    stopWorkflow: () => ipcRenderer.invoke('dcx:stopWorkflow'),
    getWorkflowStatus: () => ipcRenderer.invoke('dcx:getWorkflowStatus'),
    setSerialTelemetryEnabled: (enabled) => ipcRenderer.invoke('dcx:setSerialTelemetryEnabled', enabled),
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
    onStatusMonitor: (cb) => {
      const listener = (_, data) => cb(data);
      ipcRenderer.on('dcx:status-monitor', listener);

      return () => {
        ipcRenderer.removeListener('dcx:status-monitor', listener);
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

  dataExport: {
    saveFile: (payload) => ipcRenderer.invoke('data-export:save-file', payload),
    autoSaveFile: (payload) => ipcRenderer.invoke('data-export:auto-save-file', payload)
  },

  teensy: {
    getStatus: () => ipcRenderer.invoke('teensy:getStatus'),
    selectFirmware: () => ipcRenderer.invoke('teensy:selectFirmware'),
    selectCli: () => ipcRenderer.invoke('teensy:selectCli'),
    flash: (payload) => ipcRenderer.invoke('teensy:flash', payload),
    restoreFactoryFirmware: () => ipcRenderer.invoke('teensy:restoreFactoryFirmware'),
    onStatus: (cb) => {
      const listener = (_, data) => cb(data);
      ipcRenderer.on('teensy:status', listener);

      return () => {
        ipcRenderer.removeListener('teensy:status', listener);
      };
    }
  },

  store: {
    get: (key) => ipcRenderer.invoke('store:get', key),
    set: (key, value) => ipcRenderer.invoke('store:set', key, value)
  }
});
