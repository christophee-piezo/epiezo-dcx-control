import { ArrowLeft, PlayCircle } from 'lucide-react';

import { Button, buttonVariants } from '../../ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card.jsx';
import { Input } from '../../ui/input.jsx';
import { NativeSelect } from '../../ui/native-select.jsx';
import { FormField } from '../form-field.jsx';
import { cn } from '../../../lib/utils.js';

export function SequencerView() {
  return (
    <main className="content px-3 py-3 lg:px-4 lg:py-4" id="sequencer">
      <div className="grid min-w-0 gap-3">
        <Card className="min-w-0 overflow-hidden border-border/70 bg-background/80">
          <CardHeader className="flex-col gap-3 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle data-i18n="sequencer.editor.title">Sequence Builder</CardTitle>
              <CardDescription className="mt-1 text-xs sm:text-sm" data-i18n="sequencer.editor.description">Build, save, and run sequence methods from a focused editor.</CardDescription>
            </div>

            <Button id="sequencer-back-home-btn" size="sm" variant="outline">
              <ArrowLeft className="size-4" />
              <span data-i18n="method.navigation.home">Method Home</span>
            </Button>
          </CardHeader>

          <CardContent className="min-w-0 p-3 pt-3 lg:p-4 lg:pt-4">
            <div className="grid min-w-0 gap-3">
              <div className="min-w-0 rounded-2xl border border-border/70 bg-background/55 p-3">
                <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.55fr)_minmax(0,0.7fr)_minmax(0,0.85fr)_auto] 2xl:items-end">
                  <FormField label="Sequence Name" labelKey="sequencer.sequenceName">
                    <Input id="seq-name" placeholder="Routine Name..." type="text" />
                  </FormField>
                  <FormField label="Loop Count" labelKey="sequencer.config.loopCount">
                    <Input defaultValue="1" id="seq-loop-count" placeholder="1 or inf" type="text" />
                  </FormField>
                  <FormField label="Auto-Abort" labelKey="sequencer.config.autoAbort">
                    <NativeSelect defaultValue="ALARM" id="seq-auto-abort">
                      <option data-i18n="sequencer.config.onAlarm" value="ALARM">On Alarm</option>
                      <option data-i18n="sequencer.config.never" value="NEVER">Never</option>
                    </NativeSelect>
                  </FormField>
                  <FormField label="Teensy Flash" labelKey="sequencer.config.teensyFlash">
                    <NativeSelect defaultValue="DISABLED" id="seq-flash-before-run">
                      <option data-i18n="sequencer.config.flashDisabled" value="DISABLED">Skip Flash</option>
                      <option data-i18n="sequencer.config.flashSelectedFirmware" value="SELECTED_FIRMWARE">Flash Selected Hex</option>
                    </NativeSelect>
                  </FormField>
                  <div className="flex flex-wrap gap-1.5 xl:justify-end">
                    <Button data-i18n="sequencer.buttons.saveChanges" id="save-seq-btn" size="sm" variant="outline">
                      Save Changes
                    </Button>
                    <Button data-i18n="sequencer.buttons.wipeAll" id="clear-timeline-btn" size="sm" variant="destructive">
                      Wipe All
                    </Button>
                    <Button id="run-sequence-btn" size="sm">
                      <PlayCircle className="size-4" />
                      <span id="run-sequence-label">Execute Sequence</span>
                    </Button>
                  </div>
                </div>

                <div className="mt-2 flex flex-col gap-1 text-[11px] font-medium sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-muted-foreground" id="seq-save-state">
                    New draft not saved
                  </div>
                  <div className="text-primary" id="sequence-progress">
                    IDLE
                  </div>
                </div>
              </div>

              <Card className="min-w-0 border-border/70 bg-background/50">
                <CardHeader className="p-4 pb-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle data-i18n="sequencer.construction.title">Sequence Construction</CardTitle>
                      <CardDescription className="text-xs sm:text-sm" data-i18n="sequencer.construction.description">Arrange pulse and stop blocks, then execute the timeline.</CardDescription>
                    </div>
                    <div className="text-[11px] font-medium text-muted-foreground sm:text-right" id="sequence-preview-summary">0 blocks · 1 loop · 0s</div>
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 min-w-0 flex-col gap-3 p-4 pt-0">
                  <div className="min-w-0 rounded-xl border border-border/60 bg-background/70 p-2.5">
                    <div className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground" data-i18n="sequencer.preview.title">Sequence Preview</div>
                    <div className="min-w-0 overflow-x-auto" id="sequence-preview-scroll">
                      <div className="h-40 min-w-full lg:h-44" id="sequence-preview-chart-frame">
                        <canvas className="h-full w-full" id="sequence-preview-chart" />
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 rounded-xl border border-border/70 bg-muted/35 p-3">
                    <div className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground" data-i18n="sequencer.timeline.label">Timeline (drag blocks to reorder)</div>

                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:max-w-xl">
                      <div
                        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-grab justify-center rounded-xl')}
                        data-sequence-template="PULSE"
                        draggable="true"
                        id="tpl-pulse"
                      >
                        <span data-i18n="sequencer.blocks.pulse">Pulse</span>
                      </div>
                      <div
                        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-grab justify-center rounded-xl')}
                        data-sequence-template="PAUSE"
                        draggable="true"
                        id="tpl-pause"
                      >
                        <span data-i18n="sequencer.blocks.pause">Stop</span>
                      </div>
                    </div>

                    <div className="mt-3 timeline-scroll" id="main-timeline" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
