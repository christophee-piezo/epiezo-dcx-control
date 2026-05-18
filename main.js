const crypto = require('crypto');
const { app, BrowserWindow, Menu,  dialog, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const Store = require('electron-store');

const sequenceEngine = require('./services/sequenceEngine');
const teensyFlashService = require('./services/teensyFlashService');
const workflowEngine = require('./services/workflowEngine');
const ePiezo = require('./services/dcxService');
const dcxStatusService = require('./services/dcxStatusService');

const store = new Store();
let mainWindow = null;
let appShutdownStarted = false;
let appShutdownPromise = null;
let appShutdownPending = false;

const AUTH_LEGACY_ACCOUNT_KEY = 'auth-account';
const AUTH_USERS_KEY = 'auth-users';
const AUTH_SESSION_KEY = 'auth-session';
const AUTH_SETTINGS_KEY = 'auth-settings';
const AUTH_ROLES = new Set(['admin', 'operator']);
const AUTH_SYSTEM_ADMIN_ID = 'system-admin';
const AUTH_SYSTEM_ADMIN_USERNAME = 'admin';
const AUTH_DEFAULT_ADMIN_PASSWORD = 'admin';
const DEFAULT_SESSION_TIMEOUT_MINUTES = 15;
const MIN_SESSION_TIMEOUT_MINUTES = 1;
const MAX_SESSION_TIMEOUT_MINUTES = 480;
const RENDERER_STORE_KEYS = new Set([
  'alarm-history',
  'dcx-config',
  'method-home-favorites',
  'saved-sequences',
  'saved-workflows',
  'sequence-editor-draft',
  'tests-auto-save-data',
  'tests-comparison-state',
  'workflow-editor-draft',
  'ui-preferences'
]);

let lastStatusInitPayload = null;

function normalizeUsername(value) {
  return String(value || '').trim();
}

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase();
}

function validatePassword(password, label = 'Password') {
  if (typeof password !== 'string' || password.length < 5) {
    throw new Error(`${label} must be at least 5 characters long.`);
  }

  return password;
}

function validateSessionTimeoutMinutes(value) {
  const timeoutMinutes = Number(value);

  if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < MIN_SESSION_TIMEOUT_MINUTES || timeoutMinutes > MAX_SESSION_TIMEOUT_MINUTES) {
    throw new Error(`Session timeout must be between ${MIN_SESSION_TIMEOUT_MINUTES} and ${MAX_SESSION_TIMEOUT_MINUTES} minutes.`);
  }

  return timeoutMinutes;
}

function validateRole(value) {
  const role = normalizeRole(value);

  if (!AUTH_ROLES.has(role)) {
    throw new Error('Role must be admin or operator.');
  }

  return role;
}

function assertRendererStoreKey(key) {
  const normalizedKey = String(key || '').trim();

  if (!RENDERER_STORE_KEYS.has(normalizedKey)) {
    throw new Error(`Renderer store access is not allowed for key: ${normalizedKey || '(empty)'}`);
  }

  return normalizedKey;
}

function sanitizeFileNameSegment(value, fallback = 'export-data') {
  const normalizedValue = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalizedValue || fallback;
}

function sanitizePathSegment(value, fallback = 'Test Data') {
  const normalizedValue = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalizedValue || fallback;
}

function resolveDataExportFormat(filePath, preferredExtension = '.csv') {
  const normalizedPreferredExtension = String(preferredExtension || '.csv').startsWith('.')
    ? String(preferredExtension || '.csv').toLowerCase()
    : `.${String(preferredExtension || 'csv').toLowerCase()}`;
  const selectedExtension = path.extname(filePath).toLowerCase();
  const resolvedFilePath = selectedExtension ? filePath : `${filePath}${normalizedPreferredExtension}`;
  const resolvedExtension = path.extname(resolvedFilePath).toLowerCase();

  return {
    filePath: resolvedFilePath,
    format: resolvedExtension === '.json' ? 'json' : 'csv'
  };
}

function getDataExportContent(payload = {}, format = 'csv') {
  return format === 'json'
    ? String(payload.jsonContent || '{}')
    : String(payload.csvContent || '');
}

function sanitizeStoredUser(user) {
  if (!user || typeof user !== 'object') {
    return null;
  }

  const id = typeof user.id === 'string' ? user.id.trim() : '';
  const username = normalizeUsername(user.username);
  const usernameKey = normalizeUsername(user.usernameKey).toLowerCase() || username.toLowerCase();
  const role = normalizeRole(user.role);
  const enabled = user.enabled !== false;
  const passwordSalt = typeof user.passwordSalt === 'string' ? user.passwordSalt : '';
  const passwordHash = typeof user.passwordHash === 'string' ? user.passwordHash : '';

  if (!id || !username || !usernameKey || !AUTH_ROLES.has(role) || !passwordSalt || !passwordHash) {
    return null;
  }

  return {
    id,
    username,
    usernameKey,
    role,
    enabled,
    passwordSalt,
    passwordHash,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null
  };
}

function createSystemAdminUser({ createdAt = new Date().toISOString(), updatedAt = createdAt } = {}) {
  return {
    id: AUTH_SYSTEM_ADMIN_ID,
    username: AUTH_SYSTEM_ADMIN_USERNAME,
    usernameKey: AUTH_SYSTEM_ADMIN_USERNAME,
    role: 'admin',
    enabled: true,
    ...buildPasswordRecord(AUTH_DEFAULT_ADMIN_PASSWORD),
    createdAt,
    updatedAt
  };
}

function ensureSystemAdminUser(users = []) {
  const normalizedUsers = Array.isArray(users) ? users.map((user) => ({ ...user })) : [];
  const adminIndex = normalizedUsers.findIndex((user) => user.id === AUTH_SYSTEM_ADMIN_ID || user.usernameKey === AUTH_SYSTEM_ADMIN_USERNAME);

  if (adminIndex === -1) {
    return {
      changed: true,
      users: [createSystemAdminUser(), ...normalizedUsers]
    };
  }

  const existingAdmin = normalizedUsers[adminIndex];
  const normalizedAdmin = {
    ...existingAdmin,
    id: AUTH_SYSTEM_ADMIN_ID,
    username: AUTH_SYSTEM_ADMIN_USERNAME,
    usernameKey: AUTH_SYSTEM_ADMIN_USERNAME,
    role: 'admin',
    enabled: true
  };
  const nextUsers = normalizedUsers.filter((user, index) => {
    if (index === adminIndex) {
      return true;
    }

    return user.id !== AUTH_SYSTEM_ADMIN_ID && user.usernameKey !== AUTH_SYSTEM_ADMIN_USERNAME;
  });

  nextUsers[adminIndex] = normalizedAdmin;

  const changed = nextUsers.length !== users.length
    || normalizedAdmin.id !== existingAdmin.id
    || normalizedAdmin.username !== existingAdmin.username
    || normalizedAdmin.usernameKey !== existingAdmin.usernameKey
    || normalizedAdmin.role !== existingAdmin.role
    || normalizedAdmin.enabled !== existingAdmin.enabled;

  return {
    changed,
    users: nextUsers
  };
}

function migrateLegacyAccountIfNeeded() {
  const users = store.get(AUTH_USERS_KEY);
  if (Array.isArray(users) && users.length > 0) {
    return;
  }

  const legacyAccount = store.get(AUTH_LEGACY_ACCOUNT_KEY);
  if (!legacyAccount || typeof legacyAccount !== 'object') {
    return;
  }

  const migratedUser = sanitizeStoredUser({
    ...legacyAccount,
    id: crypto.randomUUID(),
    role: 'admin'
  });

  if (migratedUser) {
    store.set(AUTH_USERS_KEY, [migratedUser]);
  }

  store.delete(AUTH_LEGACY_ACCOUNT_KEY);
}

function getStoredUsers() {
  migrateLegacyAccountIfNeeded();

  const users = store.get(AUTH_USERS_KEY);
  if (!Array.isArray(users)) {
    return [];
  }

  const sanitizedUsers = users.map(sanitizeStoredUser).filter(Boolean);
  const ensuredUsers = ensureSystemAdminUser(sanitizedUsers);

  if (sanitizedUsers.length !== users.length || ensuredUsers.changed) {
    store.set(AUTH_USERS_KEY, ensuredUsers.users);
  }

  return ensuredUsers.users;
}

function saveStoredUsers(users) {
  store.set(AUTH_USERS_KEY, users);
}

function cacheStatusInitPayload(payload = {}) {
  lastStatusInitPayload = payload;
  return payload;
}

function getStoredAuthSettings() {
  const settings = store.get(AUTH_SETTINGS_KEY);

  try {
    const sessionTimeoutMinutes = validateSessionTimeoutMinutes(settings?.sessionTimeoutMinutes ?? DEFAULT_SESSION_TIMEOUT_MINUTES);
    const normalizedSettings = { sessionTimeoutMinutes };

    if (!settings || settings.sessionTimeoutMinutes !== sessionTimeoutMinutes) {
      store.set(AUTH_SETTINGS_KEY, normalizedSettings);
    }

    return normalizedSettings;
  } catch {
    const fallbackSettings = { sessionTimeoutMinutes: DEFAULT_SESSION_TIMEOUT_MINUTES };
    store.set(AUTH_SETTINGS_KEY, fallbackSettings);
    return fallbackSettings;
  }
}

function toPublicAuthSettings(settings = getStoredAuthSettings()) {
  return {
    sessionTimeoutMinutes: settings.sessionTimeoutMinutes
  };
}

function toAuthUser(account) {
  if (!account) {
    return null;
  }

  return {
    id: account.id,
    username: account.username,
    role: account.role,
    enabled: account.enabled !== false,
    isSystemAdmin: account.id === AUTH_SYSTEM_ADMIN_ID,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}

function buildPasswordRecord(password) {
  const passwordSalt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(password, passwordSalt, 64).toString('hex');

  return { passwordSalt, passwordHash };
}

function verifyPassword(password, account) {
  if (!account || !password) {
    return false;
  }

  try {
    const storedHash = Buffer.from(account.passwordHash, 'hex');
    const candidateHash = crypto.scryptSync(password, account.passwordSalt, storedHash.length);

    return storedHash.length === candidateHash.length && crypto.timingSafeEqual(storedHash, candidateHash);
  } catch {
    return false;
  }
}

function validateAuthPayload(payload) {
  const username = normalizeUsername(payload?.username);

  if (username.length < 3) {
    throw new Error('Username must be at least 3 characters long.');
  }

  const password = validatePassword(payload?.password);

  return {
    username,
    usernameKey: username.toLowerCase(),
    password
  };
}

function findSessionUser(session, users) {
  const sessionUserId = typeof session?.userId === 'string' ? session.userId.trim() : '';
  const sessionUsernameKey = normalizeUsername(session?.usernameKey || session?.username).toLowerCase();

  if (sessionUserId) {
    const userById = users.find((candidate) => candidate.id === sessionUserId);
    if (userById) {
      return userById;
    }
  }

  if (!sessionUsernameKey) {
    return null;
  }

  return users.find((candidate) => candidate.usernameKey === sessionUsernameKey) || null;
}

function isSessionExpired(session, settings) {
  const referenceTime = Date.parse(session?.lastActivityAt || session?.signedInAt || '');

  if (!Number.isFinite(referenceTime)) {
    return true;
  }

  const timeoutMs = settings.sessionTimeoutMinutes * 60 * 1000;
  return Date.now() - referenceTime >= timeoutMs;
}

function setAuthSession(account, previousSession = null) {
  const now = new Date().toISOString();
  const session = {
    userId: account.id,
    usernameKey: account.usernameKey,
    signedInAt: typeof previousSession?.signedInAt === 'string' ? previousSession.signedInAt : now,
    lastActivityAt: now
  };

  store.set(AUTH_SESSION_KEY, session);
  return session;
}

function clearAuthSession() {
  store.delete(AUTH_SESSION_KEY);
}

function getActiveAuthContext() {
  const users = getStoredUsers();
  const settings = getStoredAuthSettings();
  const session = store.get(AUTH_SESSION_KEY);

  if (!session || typeof session !== 'object') {
    return { users, settings, session: null, user: null };
  }

  const user = findSessionUser(session, users);
  if (!user || isSessionExpired(session, settings)) {
    clearAuthSession();
    return { users, settings, session: null, user: null };
  }

  return { users, settings, session, user };
}

function requireAuthenticatedContext() {
  const context = getActiveAuthContext();

  if (!context.user) {
    throw new Error('Session expired. Please sign in again.');
  }

  if (context.user.enabled === false) {
    clearAuthSession();
    throw new Error('Your access has been restricted. Please contact an administrator.');
  }

  return context;
}

function requireAdminContext() {
  const context = requireAuthenticatedContext();

  if (context.user.role !== 'admin') {
    throw new Error('Administrator access is required for this action.');
  }

  return context;
}

function getAuthBootstrapState() {
  const context = getActiveAuthContext();

  return {
    success: true,
    hasUsers: context.users.length > 0,
    user: toAuthUser(context.user),
    settings: toPublicAuthSettings(context.settings)
  };
}

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

dcxStatusService.on('status', (status) => {
  sendToRenderer('dcx:status-monitor', status);
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
  mainWindow.on('close', (event) => {
    if (appShutdownStarted) {
      return;
    }

    event.preventDefault();
    requestAppShutdown();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function shutdownMainProcessServices() {
  if (!appShutdownPromise) {
    appShutdownPromise = (async () => {
      const shutdownTasks = [];

      if (sequenceEngine.getStatus().isRunning) {
        shutdownTasks.push(sequenceEngine.stop());
      }

      if (workflowEngine.getStatus().isRunning) {
        shutdownTasks.push(workflowEngine.stop());
      }

      dcxStatusService.stop();
      shutdownTasks.push(ePiezo.disconnect({ skipActiveCheck: true }));

      await Promise.allSettled(shutdownTasks);
    })();
  }

  return appShutdownPromise;
}

function getShutdownWarningActivityLines(activity = {}) {
  const lines = [];

  if (activity.sonicsActive) {
    lines.push('Sonics is active.');
  }

  if (activity.seekActive) {
    lines.push('Seek is active.');
  }

  if (activity.scanActive) {
    lines.push('Scan is active.');
  }

  return lines;
}

async function confirmShutdownForActiveOperation() {
  const activity = typeof ePiezo.getShutdownActivitySnapshot === 'function'
    ? ePiezo.getShutdownActivitySnapshot()
    : { active: false, sonicsActive: false, seekActive: false, scanActive: false };

  if (!activity.active) {
    return {
      confirmed: true,
      activity
    };
  }

  const detailLines = getShutdownWarningActivityLines(activity);
  detailLines.push('If you continue, the app will stop the active operation before closing.');

  const response = await dialog.showMessageBox(mainWindow || undefined, {
    type: 'warning',
    buttons: ['Stop and Close', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    title: 'Active Operation',
    message: 'Sonics, seek, or scan is still active.',
    detail: detailLines.join('\n')
  });

  return {
    confirmed: response.response === 0,
    activity
  };
}

async function requestAppShutdown() {
  if (appShutdownStarted || appShutdownPending) {
    return;
  }

  appShutdownPending = true;

  try {
    const confirmation = await confirmShutdownForActiveOperation();
    if (!confirmation.confirmed) {
      return;
    }

    if (confirmation.activity?.active && typeof ePiezo.stopActiveOperationForShutdown === 'function') {
      const stopResult = await ePiezo.stopActiveOperationForShutdown();
      if (!stopResult?.success) {
        await dialog.showMessageBox(mainWindow || undefined, {
          type: 'error',
          buttons: ['OK'],
          defaultId: 0,
          noLink: true,
          title: 'Unable to Close',
          message: 'The active operation could not be stopped.',
          detail: stopResult?.error || 'Stop sonics, seek, or scan manually before closing the app.'
        });
        return;
      }
    }

    appShutdownStarted = true;
    await shutdownMainProcessServices();
    app.quit();
  } catch (error) {
    console.error('[APP SHUTDOWN REQUEST ERROR]', error.message);
    appShutdownStarted = false;
    appShutdownPromise = null;
  } finally {
    if (!appShutdownStarted) {
      appShutdownPending = false;
    }
  }
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
      sendToRenderer('dcx:status-init', cacheStatusInitPayload({
        status: res.success ? 'online' : 'offline',
        auto: true,
        simulation: Boolean(config?.simulation || res?.simulation),
        connections: res?.connections,
        telemetry: res?.telemetry,
        systemInfo: res?.systemInfo,
        config,
        error: res.error
      }));
      return;
    }

    const status = await ePiezo.getStatus();
    const systemInfo = await ePiezo.getSystemInfo({ status });
    sendToRenderer('dcx:status-init', cacheStatusInitPayload({
      ...status,
      systemInfo
    }));
  } catch (e) {
    sendToRenderer('dcx:status-init', cacheStatusInitPayload({
      status: 'offline',
      error: e.message
    }));
  }
}

async function getStatusInitSnapshot() {
  if (lastStatusInitPayload) {
    return lastStatusInitPayload;
  }

  try {
    const status = await ePiezo.getStatus();
    const systemInfo = await ePiezo.getSystemInfo({ status });

    return cacheStatusInitPayload({
      ...status,
      systemInfo
    });
  } catch (error) {
    return cacheStatusInitPayload({
      status: 'offline',
      error: error.message
    });
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null) // removes app menu globally
  dcxStatusService.start();
  createWindow();

  ipcMain.handle('store:set', (_, key, value) => {
    store.set(assertRendererStoreKey(key), value);
    return true;
  });
  ipcMain.handle('store:get', (_, key) => store.get(assertRendererStoreKey(key)));

  ipcMain.handle('auth:bootstrap', () => {
    return getAuthBootstrapState();
  });

  ipcMain.handle('auth:register', (_, payload) => {
    return {
      success: false,
      error: 'The built-in administrator account is fixed to admin. Sign in with admin and change its password from Settings.'
    };
  });

  ipcMain.handle('auth:login', (_, payload) => {
    const users = getStoredUsers();
    if (users.length === 0) {
      return {
        success: false,
        error: 'No local account is configured yet.'
      };
    }

    try {
      const { usernameKey, password } = validateAuthPayload(payload);
      const account = users.find((candidate) => candidate.usernameKey === usernameKey);

      if (!account || account.enabled === false || !verifyPassword(password, account)) {
        return {
          success: false,
          error: account?.enabled === false
            ? 'Your access has been restricted. Please contact an administrator.'
            : 'Invalid username or password.'
        };
      }

      setAuthSession(account);

      return {
        success: true,
        user: toAuthUser(account),
        settings: toPublicAuthSettings()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('auth:logout', () => {
    clearAuthSession();
    return { success: true };
  });

  ipcMain.handle('auth:touchSession', () => {
    try {
      const context = requireAuthenticatedContext();
      setAuthSession(context.user, context.session);

      return {
        success: true,
        user: toAuthUser(context.user),
        settings: toPublicAuthSettings(context.settings)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('auth:listUsers', () => {
    try {
      const context = requireAdminContext();

      return {
        success: true,
        users: context.users
          .map(toAuthUser)
          .sort((left, right) => left.username.localeCompare(right.username))
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('auth:createUser', (_, payload) => {
    try {
      const context = requireAdminContext();
      const { username, usernameKey, password } = validateAuthPayload(payload);
      const role = validateRole(payload?.role || 'operator');

      if (usernameKey === AUTH_SYSTEM_ADMIN_USERNAME) {
        return {
          success: false,
          error: 'The username admin is reserved for the built-in administrator account.'
        };
      }

      if (context.users.some((candidate) => candidate.usernameKey === usernameKey)) {
        return {
          success: false,
          error: 'A user with that username already exists.'
        };
      }

      const createdAt = new Date().toISOString();
      const nextUser = {
        id: crypto.randomUUID(),
        username,
        usernameKey,
        role,
        enabled: true,
        ...buildPasswordRecord(password),
        createdAt,
        updatedAt: createdAt
      };
      const nextUsers = [...context.users, nextUser].sort((left, right) => left.username.localeCompare(right.username));

      saveStoredUsers(nextUsers);

      return {
        success: true,
        user: toAuthUser(nextUser),
        users: nextUsers.map(toAuthUser)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('auth:updateUser', (_, payload) => {
    try {
      const context = requireAdminContext();
      const userId = typeof payload?.userId === 'string' ? payload.userId.trim() : '';
      const enabled = payload?.enabled !== false;
      const role = validateRole(payload?.role || 'operator');

      if (!userId) {
        return {
          success: false,
          error: 'Missing target user.'
        };
      }

      if (userId === AUTH_SYSTEM_ADMIN_ID) {
        return {
          success: false,
          error: 'The built-in admin account cannot be restricted or reassigned.'
        };
      }

      if (userId === context.user.id) {
        return {
          success: false,
          error: 'Use the built-in admin account to manage other users.'
        };
      }

      const targetUser = context.users.find((candidate) => candidate.id === userId);
      if (!targetUser) {
        return {
          success: false,
          error: 'The selected user no longer exists.'
        };
      }

      const updatedAt = new Date().toISOString();
      const nextUsers = context.users.map((candidate) => (
        candidate.id === userId
          ? {
              ...candidate,
              role,
              enabled,
              updatedAt
            }
          : candidate
      ));

      saveStoredUsers(nextUsers);

      const nextTargetUser = nextUsers.find((candidate) => candidate.id === userId);

      if (context.session?.userId === userId && enabled === false) {
        clearAuthSession();
      }

      return {
        success: true,
        user: toAuthUser(nextTargetUser),
        users: nextUsers
          .map(toAuthUser)
          .sort((left, right) => left.username.localeCompare(right.username))
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('auth:deleteUser', (_, payload) => {
    try {
      const context = requireAdminContext();
      const userId = typeof payload?.userId === 'string' ? payload.userId.trim() : '';

      if (!userId) {
        return {
          success: false,
          error: 'Missing target user.'
        };
      }

      if (userId === AUTH_SYSTEM_ADMIN_ID) {
        return {
          success: false,
          error: 'The built-in admin account cannot be deleted.'
        };
      }

      if (userId === context.user.id) {
        return {
          success: false,
          error: 'Use the built-in admin account to delete other users.'
        };
      }

      const targetUser = context.users.find((candidate) => candidate.id === userId);
      if (!targetUser) {
        return {
          success: false,
          error: 'The selected user no longer exists.'
        };
      }

      const nextUsers = context.users.filter((candidate) => candidate.id !== userId);
      saveStoredUsers(nextUsers);

      if (context.session?.userId === userId) {
        clearAuthSession();
      }

      return {
        success: true,
        users: nextUsers
          .map(toAuthUser)
          .sort((left, right) => left.username.localeCompare(right.username))
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('auth:resetUserPassword', (_, payload) => {
    try {
      const context = requireAdminContext();
      const userId = typeof payload?.userId === 'string' ? payload.userId.trim() : '';
      const newPassword = validatePassword(payload?.newPassword, 'New password');

      if (!userId) {
        return {
          success: false,
          error: 'Missing target user.'
        };
      }

      if (userId === AUTH_SYSTEM_ADMIN_ID) {
        return {
          success: false,
          error: 'Use Change Password while signed in as admin to update the built-in administrator password.'
        };
      }

      if (userId === context.user.id) {
        return {
          success: false,
          error: 'Use Change Password to update your own password.'
        };
      }

      const targetUser = context.users.find((candidate) => candidate.id === userId);
      if (!targetUser) {
        return {
          success: false,
          error: 'The selected user no longer exists.'
        };
      }

      if (verifyPassword(newPassword, targetUser)) {
        return {
          success: false,
          error: 'New password must be different from the current password.'
        };
      }

      const updatedAt = new Date().toISOString();
      const nextUsers = context.users.map((candidate) => {
        if (candidate.id !== userId) {
          return candidate;
        }

        return {
          ...candidate,
          ...buildPasswordRecord(newPassword),
          updatedAt
        };
      });
      const updatedUser = nextUsers.find((candidate) => candidate.id === userId);

      saveStoredUsers(nextUsers);

      return {
        success: true,
        user: toAuthUser(updatedUser),
        users: nextUsers
          .map(toAuthUser)
          .sort((left, right) => left.username.localeCompare(right.username))
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('auth:changePassword', (_, payload) => {
    try {
      const context = requireAuthenticatedContext();
      const currentPassword = typeof payload?.currentPassword === 'string' ? payload.currentPassword : '';
      const newPassword = validatePassword(payload?.newPassword, 'New password');

      if (!verifyPassword(currentPassword, context.user)) {
        return {
          success: false,
          error: 'Current password is incorrect.'
        };
      }

      if (currentPassword === newPassword) {
        return {
          success: false,
          error: 'New password must be different from the current password.'
        };
      }

      const updatedAt = new Date().toISOString();
      const nextUsers = context.users.map((candidate) => {
        if (candidate.id !== context.user.id) {
          return candidate;
        }

        return {
          ...candidate,
          ...buildPasswordRecord(newPassword),
          updatedAt
        };
      });
      const updatedUser = nextUsers.find((candidate) => candidate.id === context.user.id);

      saveStoredUsers(nextUsers);

      if (updatedUser) {
        setAuthSession(updatedUser, context.session);
      }

      return {
        success: true,
        user: toAuthUser(updatedUser),
        settings: toPublicAuthSettings(context.settings)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('auth:updateSettings', (_, payload) => {
    try {
      const context = requireAdminContext();
      const sessionTimeoutMinutes = validateSessionTimeoutMinutes(payload?.sessionTimeoutMinutes);
      const nextSettings = { sessionTimeoutMinutes };

      store.set(AUTH_SETTINGS_KEY, nextSettings);

      return {
        success: true,
        settings: toPublicAuthSettings(nextSettings),
        user: toAuthUser(context.user)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('dcx:connect', async (_, config) => {
    return ePiezo.connect(config);
  });

  ipcMain.handle('dcx:disconnect', async () => {
  return ePiezo.disconnect();
});

  ipcMain.handle('dcx:control', async (_, payload) => {
    return ePiezo.control(payload?.action, payload?.value, payload?.options || {});
  });

  ipcMain.handle('dcx:getStatus', async () => {
    return ePiezo.getStatus();
  });

  ipcMain.handle('dcx:getStatusInitSnapshot', async () => {
    return getStatusInitSnapshot();
  });

  ipcMain.handle('dcx:getStatusMonitorSnapshot', async () => {
    return dcxStatusService.getSnapshot();
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

  ipcMain.handle('dcx:getIoConfiguration', async () => {
    return ePiezo.getIoConfiguration();
  });

  ipcMain.handle('dcx:setIoConfiguration', async (_, payload) => {
    return ePiezo.setIoConfiguration(payload || {});
  });

  ipcMain.handle('dcx:restoreIoConfigurationDefaults', async () => {
    return ePiezo.restoreIoConfigurationDefaults();
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

  ipcMain.handle('data-export:save-file', async (_, payload = {}) => {
    const suggestedName = String(payload.suggestedName || 'export-data.csv').trim() || 'export-data.csv';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: String(payload.title || 'Export Data'),
      defaultPath: suggestedName,
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    const { filePath, format } = resolveDataExportFormat(result.filePath, payload.preferredExtension || '.csv');
    const content = getDataExportContent(payload, format);

    await fs.writeFile(filePath, content, 'utf8');

    return {
      success: true,
      format,
      filePath,
      fileName: path.basename(filePath)
    };
  });

  ipcMain.handle('data-export:auto-save-file', async (_, payload = {}) => {
    const folderName = sanitizePathSegment(payload.folderName || 'Test Data', 'Test Data');
    const documentsRoot = app.getPath('documents');
    const exportDirectory = path.join(documentsRoot, 'Epiezo DCX Control', folderName);
    const desiredFileName = sanitizeFileNameSegment(payload.fileName || 'export-data', 'export-data');
    const preferredExtension = payload.preferredExtension || '.csv';
    const { filePath, format } = resolveDataExportFormat(path.join(exportDirectory, desiredFileName), preferredExtension);
    const content = getDataExportContent(payload, format);

    await fs.mkdir(exportDirectory, { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');

    return {
      success: true,
      format,
      directory: exportDirectory,
      filePath,
      fileName: path.basename(filePath)
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

app.on('before-quit', (event) => {
  if (appShutdownStarted) {
    return;
  }

  event.preventDefault();
  requestAppShutdown();
});
