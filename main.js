const { app, BrowserWindow, Menu,  dialog, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const Store = require('electron-store');

const sequenceEngine = require('./services/sequenceEngine');
const teensyFlashService = require('./services/teensyFlashService');
const workflowEngine = require('./services/workflowEngine');
const ePiezo = require('./services/dcxService');

const store = new Store();
let mainWindow = null;

teensyFlashService.setStore(store);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForIdle(getter, { timeoutMs = 5000, intervalMs = 50 } = {}) {
  const startedAt = Date.now();

  while (getter()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error('Timed out waiting for the active operation to stop');
    }

    await delay(intervalMs);
  }
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const { webContents } = mainWindow;
  if (!webContents || webContents.isDestroyed()) {
    return;
  }

  webContents.send(channel, payload);
}

sequenceEngine.on('status', (status) => {
  sendToRenderer('sequence:status', status);
});

workflowEngine.on('status', (status) => {
  sendToRenderer('workflow:status', status);
});

teensyFlashService.on('status', (status) => {
  sendToRenderer('teensy:status', status);
});

ePiezo.on('telemetry', (telemetry) => {
  sendToRenderer('dcx:telemetry', telemetry);
});

ePiezo.on('horn-scan-progress', (progress) => {
  sendToRenderer('dcx:horn-scan-progress', progress);
});

function hasSavedConnection(config) {
  if (!config) return false;

  return Boolean(config.simulation || config.host || config.port);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: '#09090B',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function maybeRestoreFactoryFirmwareOnLaunch() {
  const config = store.get('dcx-config');
  if (config?.simulation) {
    return { success: true, skipped: true, message: 'Skipped factory firmware restore in simulation mode' };
  }

  return teensyFlashService.restoreFactoryFirmware({ skipIfNoPort: true });
}

async function canFlashTeensy() {
  if (sequenceEngine.getStatus().isRunning) {
    return {
      success: false,
      error: 'A sequence is already running',
      message: 'Stop the active sequence before flashing the Teensy'
    };
  }

  if (workflowEngine.getStatus().isRunning) {
    return {
      success: false,
      error: 'A workflow is already running',
      message: 'Stop the active workflow before flashing the Teensy'
    };
  }

  const status = await ePiezo.getStatus();
  if (status?.simulation) {
    return {
      success: false,
      error: 'Teensy flashing is unavailable in simulation mode',
      message: 'Switch out of simulation mode before flashing the Teensy'
    };
  }

  if (typeof ePiezo.hasActiveOperation === 'function' && ePiezo.hasActiveOperation()) {
    return {
      success: false,
      error: 'Stop sonics, seek, or scan before flashing the Teensy.',
      message: 'A DCX operation is already active'
    };
  }

  return { success: true };
}

async function sendInitialStatus() {
  try {
    const config = store.get('dcx-config');

    if (hasSavedConnection(config)) {
      const res = await ePiezo.connect(config);
      sendToRenderer('dcx:status-init', {
        status: res.success ? 'online' : 'offline',
        auto: true,
        simulation: Boolean(config?.simulation || res?.simulation),
        connections: res?.connections,
        telemetry: res?.telemetry,
        systemInfo: res?.systemInfo,
        config,
        error: res.error
      });
      return;
    }

    const status = await ePiezo.getStatus();
    sendToRenderer('dcx:status-init', status);
  } catch (e) {
    sendToRenderer('dcx:status-init', {
      status: 'offline',
      error: e.message
    });
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null) // removes app menu globally
  createWindow();

  ipcMain.handle('store:set', (_, key, value) => {
    store.set(key, value);
    return true;
  });
  ipcMain.handle('store:get', (_, key) => store.get(key));

  ipcMain.handle('dcx:connect', async (_, config) => {
    return ePiezo.connect(config);
  });

  ipcMain.handle('dcx:disconnect', async () => {
  return ePiezo.disconnect();
});

  ipcMain.handle('dcx:control', async (_, payload) => {
    return ePiezo.control(payload?.action, payload?.value);
  });

  ipcMain.handle('dcx:getStatus', async () => {
    return ePiezo.getStatus();
  });

  ipcMain.handle('dcx:getSystemInfo', async () => {
    return ePiezo.getSystemInfo();
  });

  ipcMain.handle('dcx:getSetup', async () => {
    return ePiezo.getSetup();
  });

  ipcMain.handle('dcx:getSetupDefaults', async () => {
    return ePiezo.getSetupDefaults();
  });

  ipcMain.handle('dcx:setParameters', async (_, payload) => {
    return ePiezo.setParameters(payload || {});
  });

  ipcMain.handle('dcx:getHornScanStatus', async () => {
    return ePiezo.getHornScanStatus();
  });

  ipcMain.handle('dcx:runHornScan', async () => {
    console.log('[IPC HORN SCAN] run request', {
      sequenceRunning: sequenceEngine.getStatus().isRunning,
      workflowRunning: workflowEngine.getStatus().isRunning,
      timestamp: Date.now()
    });

    if (sequenceEngine.getStatus().isRunning) {
      await sequenceEngine.stop();
      await waitForIdle(() => sequenceEngine.getStatus().isRunning);
    }

    if (workflowEngine.getStatus().isRunning) {
      await workflowEngine.stop();
      await waitForIdle(() => workflowEngine.getStatus().isRunning);
    }

    await delay(150);

    const result = await ePiezo.runHornScan();
    console.log('[IPC HORN SCAN] run result', {
      success: !!result?.success,
      error: result?.error ?? null,
      message: result?.message ?? null,
      start: result?.raw?.start ?? null,
      pollCount: Number.isFinite(Number(result?.pollCount)) ? Number(result.pollCount) : null
    });
    return result;
  });

  ipcMain.handle('dcx:abortHornScan', async () => {
    return ePiezo.abortHornScan();
  });

  ipcMain.handle('dcx:runWeldGraph', async () => {
    console.log('[IPC WELD GRAPH] run request', {
      sequenceRunning: sequenceEngine.getStatus().isRunning,
      workflowRunning: workflowEngine.getStatus().isRunning,
      hasActiveOperation: typeof ePiezo.hasActiveOperation === 'function' && ePiezo.hasActiveOperation(),
      timestamp: Date.now()
    });

    if (sequenceEngine.getStatus().isRunning) {
      return {
        success: false,
        error: 'A sequence is already running',
        message: 'Stop the active sequence before running a weld graph capture'
      };
    }

    if (workflowEngine.getStatus().isRunning) {
      return {
        success: false,
        error: 'A workflow is already running',
        message: 'Stop the active workflow before running a weld graph capture'
      };
    }

    if (typeof ePiezo.hasActiveOperation === 'function' && ePiezo.hasActiveOperation()) {
      return {
        success: false,
        error: 'Stop sonics, seek, or scan before running a weld graph capture.',
        message: 'A DCX operation is already active'
      };
    }

    const result = await ePiezo.runWeldGraph();
    console.log('[IPC WELD GRAPH] run result', {
      success: !!result?.success,
      error: result?.error ?? null,
      message: result?.message ?? null,
      start: result?.raw?.start ?? null,
      sampleCount: Array.isArray(result?.samples) ? result.samples.length : null
    });
    return result;
  });

  ipcMain.handle('dcx:getIoSnapshot', async () => {
    return ePiezo.getIoSnapshot();
  });

  ipcMain.handle('dcx:getIoBootstrapSnapshot', async () => {
    return ePiezo.getIoBootstrapSnapshot();
  });

  ipcMain.handle('dcx:getIoLiveSnapshot', async () => {
    return ePiezo.getIoLiveSnapshot();
  });

  ipcMain.handle('dcx:listSerialPorts', async () => {
    return ePiezo.listSerialPorts();
  });

  ipcMain.handle('dcx:runSequence', async (_, timeline) => {
    if (workflowEngine.getStatus().isRunning) {
      return {
        success: false,
        error: 'A workflow is already running',
        message: 'Stop the active workflow before running a sequence'
      };
    }

    if (typeof ePiezo.hasActiveOperation === 'function' && ePiezo.hasActiveOperation()) {
      return {
        success: false,
        error: 'Stop sonics, seek, or scan before running a sequence.',
        message: 'A DCX operation is already active'
      };
    }

    return sequenceEngine.runSequence(timeline || []);
  });

  ipcMain.handle('dcx:stopSequence', async () => {
    return sequenceEngine.stop();
  });

  ipcMain.handle('dcx:getSequenceStatus', async () => {
    return sequenceEngine.getStatus();
  });

  ipcMain.handle('dcx:runWorkflow', async (_, script) => {
    if (sequenceEngine.getStatus().isRunning) {
      return {
        success: false,
        error: 'A sequence is already running',
        message: 'Stop the active sequence before running a workflow'
      };
    }

    if (typeof ePiezo.hasActiveOperation === 'function' && ePiezo.hasActiveOperation()) {
      return {
        success: false,
        error: 'Stop sonics, seek, or scan before running a workflow.',
        message: 'A DCX operation is already active'
      };
    }

    return workflowEngine.run(script || '');
  });

  ipcMain.handle('dcx:stopWorkflow', async () => {
    return workflowEngine.stop();
  });

  ipcMain.handle('dcx:getWorkflowStatus', async () => {
    return workflowEngine.getStatus();
  });

  ipcMain.handle('dcx:setSerialTelemetryEnabled', async (_, enabled) => {
    return ePiezo.setSerialTelemetryEnabled(enabled);
  });

  ipcMain.handle('teensy:getStatus', async () => {
    return teensyFlashService.getStatus();
  });

  ipcMain.handle('teensy:selectFirmware', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Teensy Firmware',
      properties: ['openFile'],
      filters: [
        { name: 'Firmware Files', extensions: ['hex'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true };
    }

    const filePath = result.filePaths[0];
    const status = teensyFlashService.setFirmwarePath(filePath);

    return {
      success: true,
      filePath,
      fileName: path.basename(filePath),
      status
    };
  });

  ipcMain.handle('teensy:selectCli', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Teensy Loader CLI',
      properties: ['openFile'],
      filters: [
        { name: 'Executables', extensions: ['exe'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true };
    }

    const filePath = result.filePaths[0];
    const status = teensyFlashService.setCliPath(filePath);

    return {
      success: true,
      filePath,
      fileName: path.basename(filePath),
      status
    };
  });

  ipcMain.handle('teensy:flash', async (_, payload = {}) => {
    const permission = await canFlashTeensy();
    if (!permission.success) {
      return permission;
    }

    return teensyFlashService.flash(payload || {});
  });

  ipcMain.handle('teensy:restoreFactoryFirmware', async () => {
    const permission = await canFlashTeensy();
    if (!permission.success) {
      return permission;
    }

    return teensyFlashService.restoreFactoryFirmware();
  });

  ipcMain.handle('workflow:loadScript', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Load Workflow Script',
      properties: ['openFile'],
      filters: [
        { name: 'Workflow Scripts', extensions: ['txt', 'workflow', 'wfl'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true };
    }

    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, 'utf8');

    return {
      success: true,
      filePath,
      fileName: path.basename(filePath),
      content
    };
  });

  ipcMain.handle('workflow:saveScript', async (_, payload = {}) => {
    const suggestedName = String(payload.fileName || 'workflow-script.txt').trim() || 'workflow-script.txt';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Workflow Script',
      defaultPath: suggestedName,
      filters: [
        { name: 'Workflow Scripts', extensions: ['txt', 'workflow', 'wfl'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    await fs.writeFile(result.filePath, String(payload.content || ''), 'utf8');

    return {
      success: true,
      filePath: result.filePath,
      fileName: path.basename(result.filePath)
    };
  });

  setTimeout(async () => {
    try {
      await maybeRestoreFactoryFirmwareOnLaunch();
    } catch (error) {
      console.error('[TEENSY FACTORY RESTORE ERROR]', error.message);
    }

    await sendInitialStatus();
  }, 500);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
