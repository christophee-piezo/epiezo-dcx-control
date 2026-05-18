import { ArrowLeft, CircleHelp } from 'lucide-react';

import { Button } from '../../ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card.jsx';
import { Input } from '../../ui/input.jsx';
import { Textarea } from '../../ui/textarea.jsx';
import { FormField } from '../form-field.jsx';

export function WorkflowView() {
  return (
    <main className="content px-3 py-3 lg:px-4 lg:py-4" id="workflow">
      <div className="grid gap-3">
        <Card className="overflow-hidden border-border/70 bg-background/80">
          <CardHeader className="flex-col gap-3 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle data-i18n="workflow.editor.title">Workflow Builder</CardTitle>
              <CardDescription className="mt-1 text-xs sm:text-sm" data-i18n="workflow.editor.description">Write, validate, and save workflow methods from a focused editor.</CardDescription>
            </div>

            <Button id="workflow-back-home-btn" size="sm" variant="outline">
              <ArrowLeft className="size-4" />
              <span data-i18n="method.navigation.home">Method Home</span>
            </Button>
          </CardHeader>

          <CardContent className="p-3 pt-3 lg:p-4 lg:pt-4">
            <div className="grid gap-3">
              <div className="rounded-2xl border border-border/70 bg-background/55 p-3">
                <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.25fr)_auto_auto] 2xl:items-end">
                  <FormField label="Workflow Name" labelKey="workflow.library.name">
                    <Input data-i18n-placeholder="workflow.library.namePlaceholder" id="workflow-name" placeholder="Inspection Routine..." type="text" />
                  </FormField>

                  <Button data-i18n="workflow.library.save" id="save-workflow-library-btn" size="sm" variant="outline">
                    Save to Library
                  </Button>

                  <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
                    <details className="relative">
                      <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-input bg-transparent text-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&::-webkit-details-marker]:hidden">
                        <CircleHelp className="size-4" />
                        <span className="sr-only" data-i18n="workflow.help.title">Syntax Help & Examples</span>
                      </summary>

                      <div className="absolute right-0 top-full z-20 mt-2 w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-border/70 bg-background/95 p-4 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.85)] backdrop-blur">
                        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground" data-i18n="workflow.help.title">Syntax Help & Examples</div>
                        <div className="mt-1 text-sm text-muted-foreground" data-i18n="workflow.help.description">Use these supported commands and starter examples to build a valid workflow script.</div>

                        <div className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground" data-i18n="workflow.help.commands">Supported Commands</div>
                        <div className="mt-2 space-y-1 font-mono text-xs leading-6 text-muted-foreground">
                          <div><span className="text-foreground">START [0-100]</span> <span data-i18n="workflow.help.start">Start sonics, optional amplitude override.</span></div>
                          <div><span className="text-foreground">STOP</span> <span data-i18n="workflow.help.stop">Stop sonics immediately.</span></div>
                          <div><span className="text-foreground">SET_AMP [0-100]</span> <span data-i18n="workflow.help.setAmp">Set the weld amplitude target.</span></div>
                          <div><span className="text-foreground">WAIT [ms]</span> <span data-i18n="workflow.help.wait">Pause execution for a duration in milliseconds.</span></div>
                          <div><span className="text-foreground">SEEK</span> <span data-i18n="workflow.help.seek">Run a seek cycle.</span></div>
                          <div><span className="text-foreground">RESET</span> <span data-i18n="workflow.help.reset">Clear active alarms.</span></div>
                          <div><span className="text-foreground">FLASH</span> <span data-i18n="workflow.help.flash">Flash the Teensy with the firmware selected in Settings.</span></div>
                        </div>

                        <div className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground" data-i18n="workflow.help.examples">Example Scripts</div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                          <Button className="justify-start" data-example-id="ramp-check" id="workflow-example-ramp" size="sm" variant="outline">
                            <span data-i18n="workflow.example.ramp">Ramp Check</span>
                          </Button>
                          <Button className="justify-start" data-example-id="seek-check" id="workflow-example-seek" size="sm" variant="outline">
                            <span data-i18n="workflow.example.seek">Seek Check</span>
                          </Button>
                          <Button className="justify-start" data-example-id="pulse-train" id="workflow-example-pulse" size="sm" variant="outline">
                            <span data-i18n="workflow.example.pulse">Pulse Train</span>
                          </Button>
                        </div>
                      </div>
                    </details>

                    <Button data-i18n="workflow.run" id="run-workflow-btn" size="sm">Validate & Execute</Button>
                    <Button data-i18n="workflow.load" id="load-workflow-btn" size="sm" variant="outline">Load Script...</Button>
                    <Button data-i18n="workflow.save" id="save-workflow-btn" size="sm" variant="outline">Save Script...</Button>
                    <Button data-i18n="workflow.stop" id="stop-workflow-btn" size="sm" variant="destructive">Stop Workflow</Button>
                  </div>
                </div>

                <div className="mt-2 flex flex-col gap-1 text-[11px] font-medium sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-muted-foreground" id="workflow-library-state">
                    Library ready
                  </div>
                  <div className="text-right">
                    <div className="text-primary" id="workflow-status">IDLE</div>
                    <div className="truncate text-muted-foreground" id="workflow-file-name">No script loaded</div>
                  </div>
                </div>
              </div>

              <div className="hidden rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" id="workflow-editor-error" />

              <Card className="flex min-h-0 min-w-0 flex-col border-border/70 bg-background/50">
                <CardHeader className="p-4 pb-2">
                  <CardTitle data-i18n="workflow.title">Advanced Scripting Workflow</CardTitle>
                  <CardDescription className="text-xs sm:text-sm" data-i18n="workflow.description">Validate and run higher-level command scripts against the controller.</CardDescription>
                </CardHeader>

                <CardContent className="p-4 pt-0">
                  <div className="workflow-editor-shell flex min-h-[26rem] overflow-hidden rounded-xl border border-border/60 bg-background/80">
                    <div className="workflow-line-numbers" id="workflow-line-numbers" />
                    <Textarea
                      className="workflow-editor min-h-0 flex-1 resize-none overflow-auto rounded-none border-0 bg-transparent px-3 py-2 font-mono text-sm leading-6 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      data-i18n-placeholder="workflow.placeholder"
                      id="workflow-text"
                      placeholder={'// Example:\nSET_AMP 80\nWAIT 1000\nSTART\nWAIT 5000\nSTOP'}
                      wrap="off"
                    />
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
