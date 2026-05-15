import { Pause, Play, Trash2 } from 'lucide-react';

import { Button } from '../../ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card.jsx';
import { Input } from '../../ui/input.jsx';
import { NativeSelect } from '../../ui/native-select.jsx';
import { FormField } from '../form-field.jsx';
import { TelemetryRow } from '../telemetry-row.jsx';

const liveIndicators = [
  { id: 'led-ready', label: 'Ready', key: 'dashboard.indicators.ready' },
  { id: 'led-active', label: 'Sonics', key: 'dashboard.indicators.sonics' },
  { id: 'led-alarm', label: 'Alarm', key: 'dashboard.indicators.alarm' },
  { id: 'led-seek', label: 'Seeking', key: 'dashboard.indicators.seeking' }
];

export function DashboardView() {
  return (
    <main className="content active px-3 py-3 lg:px-4 lg:py-4" id="dashboard">
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
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
          <CardHeader className="flex-col items-start justify-between gap-3 space-y-0 sm:flex-row sm:items-center">
            <div>
              <CardTitle data-i18n="dashboard.graph.title">Telemetry Graph</CardTitle>
              <CardDescription data-i18n="dashboard.graph.description">Plots live telemetry whenever the controller is online, including idle periods.</CardDescription>
            </div>
            <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[minmax(0,140px)_minmax(0,140px)_auto] sm:items-end">
              <FormField label="X-Axis" labelKey="dashboard.graph.xAxis">
                <NativeSelect defaultValue="time" id="chart-x-axis">
                  <option data-i18n="chart.axis.time" value="time">Time</option>
                  <option data-i18n="chart.axis.cycles" value="cycles">Cycles</option>
                  <option data-i18n="chart.axis.frequency" value="frequency">Frequency</option>
                  <option data-i18n="chart.axis.amplitude" value="amplitude">Amplitude</option>
                  <option data-i18n="chart.axis.power" value="power">Power</option>
                </NativeSelect>
              </FormField>
              <FormField label="Y-Axis" labelKey="dashboard.graph.yAxis">
                <NativeSelect defaultValue="frequency" id="chart-y-axis">
                  <option data-i18n="chart.axis.frequency" value="frequency">Frequency</option>
                  <option data-i18n="chart.axis.amplitude" value="amplitude">Amplitude</option>
                  <option data-i18n="chart.axis.power" value="power">Power</option>
                  <option data-i18n="chart.axis.cycles" value="cycles">Cycles</option>
                </NativeSelect>
              </FormField>
              <div className="grid grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-nowrap">
                <Button
                  aria-label="Play telemetry"
                  className="w-full border-emerald-500/40 bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200 sm:w-auto"
                  id="play-chart-btn"
                  size="icon"
                  title="Play telemetry"
                  variant="outline"
                >
                  <Play className="size-4" />
                </Button>
                <Button
                  aria-label="Pause telemetry"
                  className="w-full border-amber-500/40 bg-amber-500/12 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 sm:w-auto"
                  id="pause-chart-btn"
                  size="icon"
                  title="Pause telemetry"
                  variant="outline"
                >
                  <Pause className="size-4" />
                </Button>
                <Button
                  aria-label="Clear telemetry"
                  className="w-full border-red-500/40 bg-red-500/12 text-red-300 hover:bg-red-500/20 hover:text-red-200 sm:w-auto"
                  id="clear-chart-btn"
                  size="icon"
                  title="Clear telemetry"
                  variant="outline"
                >
                  <Trash2 className="size-4" />
                </Button>
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
