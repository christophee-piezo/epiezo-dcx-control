import { ArrowUpDown } from 'lucide-react';

import { Button } from '../../ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card.jsx';
import { CheckboxSelect } from '../../ui/checkbox-select.jsx';
import { Input } from '../../ui/input.jsx';
import { NativeSelect } from '../../ui/native-select.jsx';
import { FormField } from '../form-field.jsx';

const testsAxisOptions = [
  { value: 'amplitude', label: 'Amplitude', labelKey: 'chart.axis.amplitude' },
  { value: 'frequency', label: 'Frequency', labelKey: 'chart.axis.frequency' },
  { value: 'power', label: 'Power', labelKey: 'chart.axis.power' },
  { value: 'cycles', label: 'Cycles', labelKey: 'chart.axis.cycles' },
  { value: 'time', label: 'Time', labelKey: 'chart.axis.time' },
  { value: 'aux1', label: 'Aux 1', labelKey: 'chart.axis.aux1' },
  { value: 'aux2', label: 'Aux 2', labelKey: 'chart.axis.aux2' }
];

export function TestsView() {
  return (
    <main className="content px-3 py-3 lg:px-4 lg:py-4" id="tests">
      <div className="grid min-h-0 flex-1 gap-4 grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
        <Card className="flex min-h-0 min-w-0 flex-col">
          <CardHeader>
            <CardTitle data-i18n="tests.title">Available Tests</CardTitle>
            <CardDescription data-i18n="tests.description">Filter saved sequence and workflow tests, then load one for comparison.</CardDescription>
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
                  <Input data-i18n-placeholder="tests.filters.searchPlaceholder" id="tests-search" placeholder="Search tests..." type="text" />
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

            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground" data-i18n="tests.list.title">Matching Tests</div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl border border-border/60 bg-background/70 p-3" id="tests-list">
              <div className="rounded-xl border border-dashed border-border/70 bg-background/40 px-4 py-6 text-center text-sm text-muted-foreground" data-i18n="tests.list.empty">
                No saved tests found.
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="flex min-h-0 min-w-0 flex-col">
          <CardHeader className="space-y-4">
            <CardTitle data-i18n="tests.graph.title">Test Comparison Graph</CardTitle>
            <div className="overflow-visible pb-1">
              <div className="flex flex-wrap items-end gap-3 overflow-visible">
                <FormField label="X-Axis" labelKey="dashboard.graph.xAxis">
                  <CheckboxSelect
                    buttonClassName="w-full sm:w-[10rem]"
                    defaultValue="time"
                    id="tests-chart-x-axis"
                    menuLabel="X-Axis"
                    menuLabelKey="dashboard.graph.xAxis"
                    options={testsAxisOptions}
                  />
                </FormField>
                <FormField label="Y-Axis" labelKey="dashboard.graph.yAxis">
                  <CheckboxSelect
                    buttonClassName="w-full sm:w-[10rem]"
                    defaultValues={['frequency']}
                    id="tests-chart-y-axis"
                    menuLabel="Y-Axis"
                    menuLabelKey="dashboard.graph.yAxis"
                    multiple
                    options={testsAxisOptions}
                  />
                </FormField>
                <div className="flex w-full flex-wrap items-center gap-2 overflow-visible sm:ml-auto sm:w-auto">
                  <Button className="min-w-[7rem] sm:min-w-[8rem]" data-i18n="dashboard.graph.clear" id="clear-tests-chart-btn" size="sm" variant="outline">
                    Clear
                  </Button>
                  <Button className="min-w-[8rem] sm:min-w-[10rem]" data-i18n="tests.graph.export" id="export-tests-data-btn" size="sm" variant="outline">
                    Export Data
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                  <div className="text-sm font-semibold text-foreground" id="tests-selected-name">No test loaded</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground" id="tests-selected-meta">Load a saved sequence or workflow test to compare ideal and actual traces.</div>
                </div>

                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                  <Button data-i18n="tests.graph.runLoaded" id="run-selected-test-btn">
                    Run Loaded Test
                  </Button>
                  <Button data-i18n="tests.graph.abortLoaded" id="abort-selected-test-btn" variant="destructive">
                    Abort Test
                  </Button>
                </div>
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
