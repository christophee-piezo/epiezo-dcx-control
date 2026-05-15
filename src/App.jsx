import { useEffect } from 'react';

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
import { initializeRenderer } from './renderer-core.js';

function App() {
  useEffect(() => {
    initializeRenderer();
  }, []);

  return (
    <div className="app-background h-screen overflow-hidden text-foreground">
      <div
        id="app-shell"
        className="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-y-auto bg-transparent md:grid-cols-[260px_minmax(0,1fr)] md:grid-rows-1 md:overflow-hidden xl:grid-cols-[280px_minmax(0,1fr)]"
      >
        <AppSidebar />

        <div className="main-wrapper flex min-h-0 min-w-0 flex-col overflow-hidden">
          <AppHeader />
          <DashboardView />
          <TestsView />
          <MethodView />
          <SequencerView />
          <WorkflowView />
          <SettingsView />
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
    </div>
  );
}

export default App;
