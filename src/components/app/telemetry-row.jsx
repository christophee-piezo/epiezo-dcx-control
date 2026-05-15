import { cn } from '../../lib/utils.js';

export function TelemetryRow({ label, labelKey, valueId, unit, compact = false }) {
  return (
    <div className="telemetry-row">
      <div className="telemetry-label" data-i18n={labelKey}>{label}</div>
      <div>
        <span className={cn('telemetry-val', compact && 'text-xl')} id={valueId}>
          0
        </span>
        {unit ? <span className="telemetry-unit">{unit}</span> : null}
      </div>
    </div>
  );
}
