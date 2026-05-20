import { useEffect, useRef, useState } from 'react';

import { AuthScreen } from './components/app/auth-screen.jsx';
import { AppFooter } from './components/app/app-footer.jsx';
import { AppHeader } from './components/app/app-header.jsx';
import { AppSidebar } from './components/app/app-sidebar.jsx';
import { DashboardView } from './components/app/views/dashboard-view.jsx';
import { MethodView } from './components/app/views/method-view.jsx';
import { SequencerView } from './components/app/views/sequencer-view.jsx';
import { SettingsView } from './components/app/views/settings-view.jsx';
import { TestsView } from './components/app/views/tests-view.jsx';
import { WorkflowView } from './components/app/views/workflow-view.jsx';
import { Button } from './components/ui/button.jsx';
import { cn } from './lib/utils.js';
import { initializeRenderer } from './renderer-core.js';

const DEFAULT_AUTH_SETTINGS = {
  sessionTimeoutMinutes: 15
};
const AUTH_SESSION_TOUCH_INTERVAL_MS = 30000;

const INITIAL_AUTH_STATE = {
  status: 'loading',
  user: null,
  users: [],
  settings: DEFAULT_AUTH_SETTINGS,
  error: '',
  feedback: '',
  feedbackTone: 'default',
  busyAction: 'bootstrap'
};

function mergeAuthSettings(settings = {}) {
  return {
    ...DEFAULT_AUTH_SETTINGS,
    ...(settings || {})
  };
}

function createAuthState(nextState) {
  return {
    ...INITIAL_AUTH_STATE,
    busyAction: null,
    ...nextState,
    settings: mergeAuthSettings(nextState?.settings)
  };
}

function isSessionExpiredError(message) {
  return typeof message === 'string' && message.toLowerCase().includes('session expired');
}

function upsertAuthUser(users, user) {
  if (!user) {
    return users;
  }

  const hasUser = users.some((candidate) => candidate.id === user.id);
  const nextUsers = hasUser
    ? users.map((candidate) => (candidate.id === user.id ? user : candidate))
    : [...users, user];

  return [...nextUsers].sort((left, right) => left.username.localeCompare(right.username));
}

function AuthLoadingScreen() {
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/72 backdrop-blur-md" />
      <div className="relative w-full max-w-sm rounded-3xl border border-border/70 bg-card/92 p-6 text-center shadow-[0_32px_120px_-56px_rgba(14,165,233,0.45)]">
        <div className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-primary/80">Authentication</div>
        <div className="mt-3 text-lg font-semibold text-foreground">Checking local session</div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Loading the operator account state before the control workspace is unlocked.
        </p>
      </div>
    </div>
  );
}

function App() {
  const [authState, setAuthState] = useState(INITIAL_AUTH_STATE);
  const rendererInitializedRef = useRef(false);
  const inactivityTimerRef = useRef(null);
  const lastSessionTouchRef = useRef(0);
  const sessionTimeoutInFlightRef = useRef(false);

  function clearInactivityTimer() {
    if (inactivityTimerRef.current) {
      window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }

  function lockToLogin(message) {
    clearInactivityTimer();

    if (typeof window.api?.dcx?.disconnect === 'function') {
      void window.api.dcx.disconnect().catch(() => {
        // Ignore disconnect errors while forcing the auth gate closed.
      });
    }

    setAuthState((currentState) => createAuthState({
      status: 'unauthenticated',
      error: message,
      settings: currentState.settings
    }));
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrapAuth() {
      try {
        const result = await window.api?.auth?.bootstrap?.();
        if (cancelled) {
          return;
        }

        if (!result?.success) {
          throw new Error(result?.error || 'Unable to load local authentication state.');
        }

        if (result.user) {
          setAuthState(createAuthState({
            status: 'authenticated',
            user: result.user,
            settings: result.settings
          }));
          return;
        }

        setAuthState(createAuthState({
          status: result.hasUsers ? 'unauthenticated' : 'setup',
          settings: result.settings
        }));
      } catch (error) {
        if (!cancelled) {
          setAuthState(createAuthState({
            status: 'unauthenticated',
            error: error.message || 'Unable to load local authentication state.',
            settings: DEFAULT_AUTH_SETTINGS
          }));
        }
      }
    }

    bootstrapAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authState.status !== 'authenticated' || rendererInitializedRef.current) {
      return;
    }

    rendererInitializedRef.current = true;
    initializeRenderer();
  }, [authState.status]);

  useEffect(() => {
    if (authState.status !== 'authenticated' || authState.user?.role !== 'admin') {
      if (authState.users.length > 0) {
        setAuthState((currentState) => (
          currentState.status === 'authenticated'
            ? { ...currentState, users: [] }
            : currentState
        ));
      }
      return;
    }

    let cancelled = false;

    async function loadUsers() {
      try {
        const result = await window.api?.auth?.listUsers?.();
        if (cancelled) {
          return;
        }

        if (!result?.success) {
          throw new Error(result?.error || 'Unable to load local users.');
        }

        setAuthState((currentState) => (
          currentState.status === 'authenticated'
            ? {
                ...currentState,
                users: Array.isArray(result.users) ? result.users : []
              }
            : currentState
        ));
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (isSessionExpiredError(error.message)) {
          lockToLogin(error.message);
          return;
        }

        setAuthState((currentState) => (
          currentState.status === 'authenticated'
            ? {
                ...currentState,
                feedback: error.message || 'Unable to load local users.',
                feedbackTone: 'error'
              }
            : currentState
        ));
      }
    }

    loadUsers();

    return () => {
      cancelled = true;
    };
  }, [authState.status, authState.user?.id, authState.user?.role]);

  useEffect(() => {
    if (authState.status !== 'authenticated') {
      clearInactivityTimer();
      lastSessionTouchRef.current = 0;
      sessionTimeoutInFlightRef.current = false;
      return;
    }

    let cancelled = false;
    const timeoutMs = mergeAuthSettings(authState.settings).sessionTimeoutMinutes * 60 * 1000;
    const activityEvents = ['pointerdown', 'keydown', 'mousemove', 'touchstart'];

    function scheduleAutoLock() {
      clearInactivityTimer();
      inactivityTimerRef.current = window.setTimeout(() => {
        if (cancelled || sessionTimeoutInFlightRef.current) {
          return;
        }

        sessionTimeoutInFlightRef.current = true;
        void performLogout({ reason: 'Session timed out due to inactivity.', busyAction: 'timeout' }).finally(() => {
          sessionTimeoutInFlightRef.current = false;
        });
      }, timeoutMs);
    }

    function handleActivity() {
      if (cancelled) {
        return;
      }

      scheduleAutoLock();

      const now = Date.now();
      if (now - lastSessionTouchRef.current < AUTH_SESSION_TOUCH_INTERVAL_MS) {
        return;
      }

      lastSessionTouchRef.current = now;

      void window.api?.auth?.touchSession?.().then((result) => {
        if (cancelled) {
          return;
        }

        if (!result?.success) {
          if (!sessionTimeoutInFlightRef.current) {
            sessionTimeoutInFlightRef.current = true;
            void performLogout({ reason: result?.error || 'Session expired. Please sign in again.', busyAction: 'timeout' }).finally(() => {
              sessionTimeoutInFlightRef.current = false;
            });
          }
          return;
        }

        if (result.settings) {
          setAuthState((currentState) => (
            currentState.status === 'authenticated'
              ? {
                  ...currentState,
                  settings: mergeAuthSettings(result.settings)
                }
              : currentState
          ));
        }
      }).catch(() => {
        // Ignore transient touch-session errors and rely on the local timer.
      });
    }

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity);
    });

    scheduleAutoLock();

    return () => {
      cancelled = true;
      clearInactivityTimer();
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
    };
  }, [authState.status, authState.settings.sessionTimeoutMinutes]);

  async function submitAuth(action, credentials) {
    setAuthState((currentState) => ({
      ...currentState,
      busyAction: action,
      error: '',
      feedback: '',
      feedbackTone: 'default'
    }));

    try {
      const submit = action === 'setup'
        ? window.api?.auth?.register
        : window.api?.auth?.login;
      const result = await submit?.(credentials);

      if (!result?.success || !result?.user) {
        throw new Error(result?.error || 'Authentication failed.');
      }

      setAuthState(createAuthState({
        status: 'authenticated',
        user: result.user,
        settings: result.settings
      }));

      return { success: true };
    } catch (error) {
      setAuthState((currentState) => ({
        ...currentState,
        status: action === 'setup' ? 'setup' : 'unauthenticated',
        busyAction: null,
        error: error.message || 'Authentication failed.'
      }));

      return { success: false };
    }
  }

  async function performLogout({ busyAction = 'logout', reason = '' } = {}) {
    clearInactivityTimer();
    setAuthState((currentState) => ({
      ...currentState,
      busyAction,
      error: '',
      feedback: '',
      feedbackTone: 'default'
    }));

    try {
      const result = await window.api?.auth?.logout?.();
      if (!result?.success) {
        throw new Error(result?.error || 'Unable to sign out.');
      }

      if (typeof window.api?.dcx?.disconnect === 'function') {
        try {
          await window.api.dcx.disconnect();
        } catch {
          // Ignore disconnect errors during sign-out so the auth gate still closes the UI.
        }
      }

      setAuthState((currentState) => createAuthState({
        status: 'unauthenticated',
        error: reason,
        settings: currentState.settings
      }));

      return { success: true };
    } catch (error) {
      if (busyAction === 'timeout') {
        setAuthState((currentState) => createAuthState({
          status: 'unauthenticated',
          error: reason || error.message || 'Session expired. Please sign in again.',
          settings: currentState.settings
        }));

        return { success: false };
      }

      setAuthState((currentState) => ({
        ...currentState,
        busyAction: null,
        error: error.message || 'Unable to sign out.'
      }));

      return { success: false };
    }
  }

  async function handleSignOut() {
    await performLogout();
  }

  async function handleChangePassword(payload) {
    setAuthState((currentState) => ({
      ...currentState,
      busyAction: 'changePassword',
      error: '',
      feedback: '',
      feedbackTone: 'default'
    }));

    try {
      const result = await window.api?.auth?.changePassword?.(payload);
      if (!result?.success) {
        throw new Error(result?.error || 'Unable to update the password.');
      }

      setAuthState((currentState) => (
        currentState.status === 'authenticated'
          ? {
              ...currentState,
              busyAction: null,
              user: result.user || currentState.user,
              users: currentState.user?.role === 'admin'
                ? upsertAuthUser(currentState.users, result.user)
                : currentState.users,
              settings: mergeAuthSettings(result.settings || currentState.settings),
              feedback: 'Password updated successfully.',
              feedbackTone: 'success'
            }
          : currentState
      ));

      return { success: true };
    } catch (error) {
      if (isSessionExpiredError(error.message)) {
        lockToLogin(error.message);
        return { success: false };
      }

      setAuthState((currentState) => (
        currentState.status === 'authenticated'
          ? {
              ...currentState,
              busyAction: null,
              feedback: error.message || 'Unable to update the password.',
              feedbackTone: 'error'
            }
          : currentState
      ));

      return { success: false };
    }
  }

  async function handleCreateUser(payload) {
    setAuthState((currentState) => ({
      ...currentState,
      busyAction: 'createUser',
      error: '',
      feedback: '',
      feedbackTone: 'default'
    }));

    try {
      const result = await window.api?.auth?.createUser?.(payload);
      if (!result?.success) {
        throw new Error(result?.error || 'Unable to create the user.');
      }

      setAuthState((currentState) => (
        currentState.status === 'authenticated'
          ? {
              ...currentState,
              busyAction: null,
              users: Array.isArray(result.users) ? result.users : currentState.users,
              feedback: `Created local user ${result.user?.username || ''}.`.trim(),
              feedbackTone: 'success'
            }
          : currentState
      ));

      return { success: true };
    } catch (error) {
      if (isSessionExpiredError(error.message)) {
        lockToLogin(error.message);
        return { success: false };
      }

      setAuthState((currentState) => (
        currentState.status === 'authenticated'
          ? {
              ...currentState,
              busyAction: null,
              feedback: error.message || 'Unable to create the user.',
              feedbackTone: 'error'
            }
          : currentState
      ));

      return { success: false };
    }
  }

  async function handleUpdateUser(payload) {
    setAuthState((currentState) => ({
      ...currentState,
      busyAction: `updateUser:${payload.userId}`,
      error: '',
      feedback: '',
      feedbackTone: 'default'
    }));

    try {
      const result = await window.api?.auth?.updateUser?.(payload);
      if (!result?.success) {
        throw new Error(result?.error || 'Unable to update user access.');
      }

      setAuthState((currentState) => (
        currentState.status === 'authenticated'
          ? {
              ...currentState,
              busyAction: null,
              users: Array.isArray(result.users) ? result.users : currentState.users,
              feedback: `Updated access for ${result.user?.username || 'the selected user'}.`,
              feedbackTone: 'success'
            }
          : currentState
      ));

      return { success: true };
    } catch (error) {
      if (isSessionExpiredError(error.message)) {
        lockToLogin(error.message);
        return { success: false };
      }

      setAuthState((currentState) => (
        currentState.status === 'authenticated'
          ? {
              ...currentState,
              busyAction: null,
              feedback: error.message || 'Unable to update user access.',
              feedbackTone: 'error'
            }
          : currentState
      ));

      return { success: false };
    }
  }

  async function handleDeleteUser(payload) {
    setAuthState((currentState) => ({
      ...currentState,
      busyAction: `deleteUser:${payload.userId}`,
      error: '',
      feedback: '',
      feedbackTone: 'default'
    }));

    try {
      const result = await window.api?.auth?.deleteUser?.(payload);
      if (!result?.success) {
        throw new Error(result?.error || 'Unable to delete the user.');
      }

      setAuthState((currentState) => (
        currentState.status === 'authenticated'
          ? {
              ...currentState,
              busyAction: null,
              users: Array.isArray(result.users) ? result.users : currentState.users,
              feedback: 'User deleted successfully.',
              feedbackTone: 'success'
            }
          : currentState
      ));

      return { success: true };
    } catch (error) {
      if (isSessionExpiredError(error.message)) {
        lockToLogin(error.message);
        return { success: false };
      }

      setAuthState((currentState) => (
        currentState.status === 'authenticated'
          ? {
              ...currentState,
              busyAction: null,
              feedback: error.message || 'Unable to delete the user.',
              feedbackTone: 'error'
            }
          : currentState
      ));

      return { success: false };
    }
  }

  async function handleResetUserPassword(payload) {
    setAuthState((currentState) => ({
      ...currentState,
      busyAction: `resetPassword:${payload.userId}`,
      error: '',
      feedback: '',
      feedbackTone: 'default'
    }));

    try {
      const result = await window.api?.auth?.resetUserPassword?.(payload);
      if (!result?.success) {
        throw new Error(result?.error || 'Unable to reset the password.');
      }

      setAuthState((currentState) => (
        currentState.status === 'authenticated'
          ? {
              ...currentState,
              busyAction: null,
              users: Array.isArray(result.users) ? result.users : currentState.users,
              feedback: `Password reset for ${result.user?.username || 'the selected user'}.`,
              feedbackTone: 'success'
            }
          : currentState
      ));

      return { success: true };
    } catch (error) {
      if (isSessionExpiredError(error.message)) {
        lockToLogin(error.message);
        return { success: false };
      }

      setAuthState((currentState) => (
        currentState.status === 'authenticated'
          ? {
              ...currentState,
              busyAction: null,
              feedback: error.message || 'Unable to reset the password.',
              feedbackTone: 'error'
            }
          : currentState
      ));

      return { success: false };
    }
  }

  async function handleUpdateSessionTimeout(payload) {
    setAuthState((currentState) => ({
      ...currentState,
      busyAction: 'updateTimeout',
      error: '',
      feedback: '',
      feedbackTone: 'default'
    }));

    try {
      const result = await window.api?.auth?.updateSettings?.(payload);
      if (!result?.success) {
        throw new Error(result?.error || 'Unable to update the session timeout.');
      }

      setAuthState((currentState) => (
        currentState.status === 'authenticated'
          ? {
              ...currentState,
              busyAction: null,
              settings: mergeAuthSettings(result.settings),
              feedback: 'Session timeout updated successfully.',
              feedbackTone: 'success'
            }
          : currentState
      ));

      return { success: true };
    } catch (error) {
      if (isSessionExpiredError(error.message)) {
        lockToLogin(error.message);
        return { success: false };
      }

      setAuthState((currentState) => (
        currentState.status === 'authenticated'
          ? {
              ...currentState,
              busyAction: null,
              feedback: error.message || 'Unable to update the session timeout.',
              feedbackTone: 'error'
            }
          : currentState
      ));

      return { success: false };
    }
  }

  const isAuthenticated = authState.status === 'authenticated';
  const isLoadingAuth = authState.status === 'loading';
  const isSubmittingAuth = authState.busyAction === 'login' || authState.busyAction === 'setup';
  const isSigningOut = authState.busyAction === 'logout' || authState.busyAction === 'timeout';

  return (
    <div className="app-background relative h-screen overflow-hidden text-foreground">
      <div
        id="app-shell"
        aria-hidden={!isAuthenticated}
        className={cn(
          'grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-y-auto bg-transparent transition-[filter,opacity] duration-200 lg:grid-cols-[250px_minmax(0,1fr)] lg:grid-rows-1 lg:overflow-hidden xl:grid-cols-[270px_minmax(0,1fr)]',
          !isAuthenticated && 'pointer-events-none opacity-35 blur-[3px] saturate-50'
        )}
      >
        <AppSidebar />

        <div className="main-wrapper flex min-h-0 min-w-0 flex-col overflow-hidden">
          <AppHeader currentUser={authState.user} onSignOut={handleSignOut} signingOut={isSigningOut} />
          <DashboardView />
          <TestsView />
          <MethodView />
          <SequencerView />
          <WorkflowView />
          <SettingsView
            busyAction={authState.busyAction}
            currentUser={authState.user}
            feedback={authState.feedback}
            feedbackTone={authState.feedbackTone}
            onChangePassword={handleChangePassword}
            onCreateUser={handleCreateUser}
            onDeleteUser={handleDeleteUser}
            onResetUserPassword={handleResetUserPassword}
            onUpdateSessionTimeout={handleUpdateSessionTimeout}
            onUpdateUser={handleUpdateUser}
            settings={authState.settings}
            users={authState.users}
          />
          <AppFooter />
        </div>
      </div>

      <div className="fixed inset-0 z-[120] hidden items-center justify-center bg-black/72 p-4 backdrop-blur-sm" id="connection-failure-popup" role="dialog" aria-modal="true" aria-labelledby="connection-failure-popup-title">
        <div className="w-full max-w-md rounded-3xl border border-border/70 bg-background/95 p-5 shadow-2xl">
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-amber-300" data-i18n="connectionFailurePopup.eyebrow">
            Connection Failed
          </div>
          <h2 className="mt-2 text-xl font-semibold text-foreground" data-i18n="connectionFailurePopup.title" id="connection-failure-popup-title">
            Hardware Connection Incomplete
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground" id="connection-failure-popup-message">
            The hardware connection did not complete. Check Ethernet and Teensy, then retry.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button className="sm:min-w-32" data-i18n="connectionFailurePopup.reconnect" id="connection-failure-popup-reconnect">
              Reconnect
            </Button>
            <Button className="sm:min-w-28" data-i18n="connectionFailurePopup.dismiss" id="connection-failure-popup-dismiss" variant="outline">
              Dismiss
            </Button>
          </div>
        </div>
      </div>

      <div className="fixed inset-0 z-[120] hidden items-center justify-center bg-black/72 p-4 backdrop-blur-sm" id="reset-cycles-confirmation-popup" role="dialog" aria-modal="true" aria-labelledby="reset-cycles-confirmation-popup-title">
        <div className="w-full max-w-md rounded-3xl border border-border/70 bg-background/95 p-5 shadow-2xl">
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-amber-300" data-i18n="dashboard.resetCyclesPopup.eyebrow">
            Warning
          </div>
          <h2 className="mt-2 text-xl font-semibold text-foreground" data-i18n="dashboard.resetCyclesPopup.title" id="reset-cycles-confirmation-popup-title">
            Reset Cycles While Active?
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground" data-i18n="dashboard.resetCyclesPopup.message" id="reset-cycles-confirmation-popup-message">
            Sonics is currently active. Resetting cycles now may clear the live count during a run. Do you want to continue?
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button className="sm:min-w-36" data-i18n="dashboard.resetCyclesPopup.confirm" id="reset-cycles-confirmation-confirm">
              Reset Cycles
            </Button>
            <Button className="sm:min-w-28" data-i18n="dashboard.resetCyclesPopup.cancel" id="reset-cycles-confirmation-cancel" variant="outline">
              Cancel
            </Button>
          </div>
        </div>
      </div>

      {isLoadingAuth ? <AuthLoadingScreen /> : null}

      {authState.status === 'setup' ? (
        <AuthScreen
          busy={isSubmittingAuth}
          error={authState.error}
          mode="setup"
          onSetup={(credentials) => submitAuth('setup', credentials)}
        />
      ) : null}

      {authState.status === 'unauthenticated' ? (
        <AuthScreen
          busy={isSubmittingAuth}
          error={authState.error}
          mode="login"
          onLogin={(credentials) => submitAuth('login', credentials)}
        />
      ) : null}

      {isAuthenticated && authState.error ? (
        <div className="fixed right-4 top-4 z-[130] max-w-sm rounded-2xl border border-red-500/30 bg-red-500/12 px-4 py-3 text-sm text-red-100 shadow-xl">
          {authState.error}
        </div>
      ) : null}
    </div>
  );
}

export default App;
