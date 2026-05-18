import { Pause, Play, Trash2 } from 'lucide-react';

import { Button } from '../../ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card.jsx';
import { CheckboxSelect } from '../../ui/checkbox-select.jsx';
import { Input } from '../../ui/input.jsx';
import { FormField } from '../form-field.jsx';
import { TelemetryRow } from '../telemetry-row.jsx';

const liveIndicators = [
  { id: 'led-ready', label: 'Ready', key: 'dashboard.indicators.ready' },
  { id: 'led-active', label: 'Sonics', key: 'dashboard.indicators.sonics' },
  { id: 'led-alarm', label: 'Alarm', key: 'dashboard.indicators.alarm' },
  { id: 'led-seek', label: 'Seeking', key: 'dashboard.indicators.seeking' }
];
const telemetryAxisOptions = [
  { value: 'amplitude', label: 'Amplitude', labelKey: 'chart.axis.amplitude' },
  { value: 'frequency', label: 'Frequency', labelKey: 'chart.axis.frequency' },
  { value: 'power', label: 'Power', labelKey: 'chart.axis.power' },
  { value: 'cycles', label: 'Cycles', labelKey: 'chart.axis.cycles' },
  { value: 'time', label: 'Time', labelKey: 'chart.axis.time' },
  { value: 'aux1', label: 'Aux 1', labelKey: 'chart.axis.aux1' },
  { value: 'aux2', label: 'Aux 2', labelKey: 'chart.axis.aux2' }
];

export function DashboardView() {
  return (
    <main className="content active px-3 py-3 lg:px-4 lg:py-4" id="dashboard">
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(18rem,20rem)_minmax(0,1fr)]">
        <div className="flex min-h-0 min-w-0 flex-col gap-4">
          <Card className="flex min-h-0 flex-col">
            <CardHeader>
              <CardTitle data-i18n="dashboard.realtime.title">Real-Time Data</CardTitle>
              <CardDescription data-i18n="dashboard.realtime.description">Current live readings from the DCX stack.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <TelemetryRow label="Frequency" labelKey="dashboard.labels.frequency" unit="Hz" valueId="freq-val" />
              <TelemetryRow label="Amplitude" labelKey="dashboard.labels.amplitude" unit="%" valueId="amp-val" />
              <TelemetryRow compact label="Cycles" labelKey="dashboard.labels.cycles" valueId="cycles-val" />

              <div className="grid grid-cols-2 gap-3 pt-4">
                {liveIndicators.map((indicator) => (
                  <div className="status-indicator" key={indicator.id}>
                    <span className="led-dot" id={indicator.id} />
                    <span data-i18n={indicator.key}>{indicator.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col">
            <CardHeader>
              <CardTitle data-i18n="dashboard.manual.title">Manual Control</CardTitle>
              <CardDescription data-i18n="dashboard.manual.description">Direct operator commands for start, stop, tune, and reset.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField label="Amplitude Target (%)" labelKey="dashboard.manual.amplitudeTarget">
                <div className="space-y-2">
                  <Input defaultValue="50" id="amplitude-input" max="100" min="0" type="number" />
                  <p className="text-xs text-muted-foreground" id="amplitude-input-range" />
                </div>
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <Button className="w-full" data-i18n="dashboard.manual.start" id="start-btn">
                  Start
                </Button>
                <Button className="w-full" data-i18n="dashboard.manual.stop" id="stop-btn" variant="destructive">
                  Stop
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button className="w-full" data-i18n="dashboard.manual.seek" id="seek-btn" variant="outline">
                  Seek
                </Button>
                <Button className="w-full" data-i18n="dashboard.manual.reset" id="reset-btn" variant="outline">
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

          <Card className="flex min-h-0 min-w-0 flex-col">
            <CardHeader className="space-y-4">
              <CardTitle data-i18n="dashboard.graph.title">Telemetry Graph</CardTitle>
              <div className="overflow-visible pb-1">
                <div className="flex min-w-max items-end gap-3 overflow-visible">
                  <FormField label="X-Axis" labelKey="dashboard.graph.xAxis">
                    <CheckboxSelect
                      buttonClassName="w-[10rem]"
                      defaultValue="time"
                      id="chart-x-axis"
                      menuLabel="X-Axis"
                      menuLabelKey="dashboard.graph.xAxis"
                      options={telemetryAxisOptions}
                    />
                  </FormField>
                  <FormField label="Y-Axis" labelKey="dashboard.graph.yAxis">
                    <CheckboxSelect
                      buttonClassName="w-[10rem]"
                      defaultValues={['frequency']}
                      id="chart-y-axis"
                      menuLabel="Y-Axis"
                      menuLabelKey="dashboard.graph.yAxis"
                      multiple
                      options={telemetryAxisOptions}
                    />
                  </FormField>

                  <div className="ml-auto flex items-center gap-2 overflow-visible">
                    <Button
                      aria-label="Play telemetry"
                      className="border-emerald-500/40 bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200"
                      id="play-chart-btn"
                      size="icon"
                      title="Play telemetry"
                      variant="outline"
                    >
                      <Play className="size-4" />
                    </Button>
                    <Button
                      aria-label="Pause telemetry"
                      className="border-amber-500/40 bg-amber-500/12 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200"
                      id="pause-chart-btn"
                      size="icon"
                      title="Pause telemetry"
                      variant="outline"
                    >
                      <Pause className="size-4" />
                    </Button>
                    <Button
                      aria-label="Clear telemetry"
                      className="border-red-500/40 bg-red-500/12 text-red-300 hover:bg-red-500/20 hover:text-red-200"
                      id="clear-chart-btn"
                      size="icon"
                      title="Clear telemetry"
                      variant="outline"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                    <Button className="min-w-[8rem] sm:min-w-[10rem]" data-i18n="dashboard.graph.export" id="export-dashboard-data-btn" size="sm" variant="outline">
                      Export Data
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col">
            <div id="telemetry-chart-container">
              <canvas className="h-full w-full" id="telemetry-chart" />
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
