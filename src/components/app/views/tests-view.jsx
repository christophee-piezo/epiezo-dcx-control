import { ArrowUpDown } from 'lucide-react';

import { Button } from '../../ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card.jsx';
import { Input } from '../../ui/input.jsx';
import { NativeSelect } from '../../ui/native-select.jsx';
import { FormField } from '../form-field.jsx';

export function TestsView() {
  return (
    <main className="content px-3 py-3 lg:px-4 lg:py-4" id="tests">
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="flex min-h-0 min-w-0 flex-col">
          <CardHeader>
            <CardTitle data-i18n="tests.title">Available Essais</CardTitle>
            <CardDescription data-i18n="tests.description">Filter saved sequence and workflow essais, then load one for comparison.</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="grid gap-3">
              <div className="tests-filter-switch rounded-xl border border-border/70 bg-background/70 p-1">
                <Button className="flex-1" data-tests-filter="all" id="tests-filter-all" size="sm" variant="ghost">All</Button>
                <Button className="flex-1" data-tests-filter="sequence" id="tests-filter-sequence" size="sm" variant="ghost">Sequence</Button>
                <Button className="flex-1" data-tests-filter="workflow" id="tests-filter-workflow" size="sm" variant="ghost">Workflow</Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-end">
                <FormField label="Search" labelKey="tests.filters.search">
                  <Input data-i18n-placeholder="tests.filters.searchPlaceholder" id="tests-search" placeholder="Search essais..." type="text" />
                </FormField>

                <FormField label="Sort By" labelKey="tests.filters.sort">
                  <div className="relative">
                    <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
                    <NativeSelect className="pl-9" id="tests-sort">
                      <option data-i18n="tests.filters.sort.date" value="date">Date</option>
                      <option data-i18n="tests.filters.sort.name" value="name">Name</option>
                      <option data-i18n="tests.filters.sort.blocks" value="blocks">Blocks</option>
                    </NativeSelect>
                  </div>
                </FormField>
              </div>
            </div>

            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground" data-i18n="tests.list.title">Matching Essais</div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl border border-border/60 bg-background/70 p-3" id="tests-list">
              <div className="rounded-xl border border-dashed border-border/70 bg-background/40 px-4 py-6 text-center text-sm text-muted-foreground" data-i18n="tests.list.empty">
                No saved essais found.
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="flex min-h-0 min-w-0 flex-col">
          <CardHeader className="flex-col items-start justify-between gap-3 space-y-0 sm:flex-row sm:items-center">
            <div>
              <CardTitle data-i18n="tests.graph.title">Essai Comparison Graph</CardTitle>
              <CardDescription data-i18n="tests.graph.description">Load a saved essai to plot its ideal profile, then run it to overlay measured or simulated data.</CardDescription>
            </div>
            <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[minmax(0,140px)_minmax(0,140px)_auto] sm:items-end">
              <FormField label="X-Axis" labelKey="dashboard.graph.xAxis">
                <NativeSelect defaultValue="time" id="tests-chart-x-axis">
                  <option data-i18n="chart.axis.amplitude" value="amplitude">Amplitude</option>
                  <option data-i18n="chart.axis.frequency" value="frequency">Frequency</option>
                  <option data-i18n="chart.axis.power" value="power">Power</option>
                  <option data-i18n="chart.axis.cycles" value="cycles">Cycles</option>
                  <option data-i18n="chart.axis.time" value="time">Time</option>
                  <option data-i18n="chart.axis.aux1" value="aux1">Aux 1</option>
                  <option data-i18n="chart.axis.aux2" value="aux2">Aux 2</option>
                </NativeSelect>
              </FormField>
              <FormField label="Y-Axis" labelKey="dashboard.graph.yAxis">
                <NativeSelect defaultValue="frequency" id="tests-chart-y-axis">
                  <option data-i18n="chart.axis.frequency" value="frequency">Frequency</option>
                  <option data-i18n="chart.axis.amplitude" value="amplitude">Amplitude</option>
                  <option data-i18n="chart.axis.power" value="power">Power</option>
                  <option data-i18n="chart.axis.cycles" value="cycles">Cycles</option>
                  <option data-i18n="chart.axis.time" value="time">Time</option>
                  <option data-i18n="chart.axis.aux1" value="aux1">Aux 1</option>
                  <option data-i18n="chart.axis.aux2" value="aux2">Aux 2</option>
                </NativeSelect>
              </FormField>
              <Button className="w-full sm:w-auto" data-i18n="dashboard.graph.clear" id="clear-tests-chart-btn" size="sm" variant="outline">
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                <div className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground" data-i18n="tests.graph.loaded">Loaded Essai</div>
                <div className="mt-2 text-sm font-semibold text-foreground" id="tests-selected-name">No essai loaded</div>
                <div className="mt-1 truncate text-xs text-muted-foreground" id="tests-selected-meta">Load a saved sequence or workflow essai to compare ideal and actual traces.</div>
              </div>

              <Button data-i18n="tests.graph.runLoaded" id="run-selected-test-btn">
                Run Loaded Essai
              </Button>
            </div>

            <div id="tests-telemetry-chart-container">
              <canvas className="h-full w-full" id="tests-telemetry-chart" />
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
