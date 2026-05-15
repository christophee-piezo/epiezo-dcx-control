import { log } from './logger.js';
import { runtimeState } from './runtime.js';
import { updateTelemetry } from './status-ui.js';

export async function loadStatusToDiagnostics() {
  try {
    const res = await window.api.dcx.getStatus();

    if (res?.connections?.ethernet && typeof window.api?.dcx?.getIoBootstrapSnapshot === 'function') {
      try {
        const ioSnapshot = await window.api.dcx.getIoBootstrapSnapshot();
        runtimeState.ioSnapshot = ioSnapshot?.success ? ioSnapshot : null;
      } catch (ioError) {
        runtimeState.ioSnapshot = null;
        log({ diagnostics_io_error: ioError.message });
      }
    } else {
      runtimeState.ioSnapshot = null;
    }

    updateTelemetry(res?.telemetry);

    log({ diagnostics_refresh: { status: res.status, telemetry: res.telemetry } });
    return res;
  } catch (error) {
    log({ diagnostics_error: error.message });
    return null;
  }
}
