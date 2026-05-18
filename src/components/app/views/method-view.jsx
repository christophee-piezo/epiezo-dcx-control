import { Search } from 'lucide-react';

import { Button } from '../../ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card.jsx';
import { Input } from '../../ui/input.jsx';

export function MethodView() {
  return (
    <main className="content px-3 py-3 lg:px-4 lg:py-4" id="method">
      <div className="grid gap-4">
        <Card className="overflow-hidden border-border/70 bg-background/80">
          <CardHeader className="border-b border-border/70">
            <CardTitle data-i18n="method.title">Method Builder</CardTitle>
            <CardDescription data-i18n="method.description">Create and run sequence or workflow methods from one workspace.</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 p-4 lg:p-6">
            <div className="space-y-3">
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground" data-i18n="method.home.new">
                Create New
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                <button
                  className="rounded-2xl border border-black bg-black px-4 py-5 text-left text-white shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
                  data-method-home-action="new-sequence"
                  id="method-home-new-sequence"
                  type="button"
                >
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-white/60" data-i18n="method.home.blank">
                    Blank
                  </div>
                  <div className="mt-4 text-lg font-semibold" data-i18n="method.home.newSequence">New Sequence</div>
                  <div className="mt-2 text-sm leading-6 text-white/72" data-i18n="method.home.newSequenceDescription">
                    Start with an empty pulse timeline.
                  </div>
                </button>

                <button
                  className="rounded-2xl border border-black bg-black px-4 py-5 text-left text-white shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
                  data-method-home-action="new-workflow"
                  id="method-home-new-workflow"
                  type="button"
                >
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-white/60" data-i18n="method.home.blank">
                    Blank
                  </div>
                  <div className="mt-4 text-lg font-semibold" data-i18n="method.home.newWorkflow">New Workflow</div>
                  <div className="mt-2 text-sm leading-6 text-white/72" data-i18n="method.home.newWorkflowDescription">
                    Open a clean scripting workspace.
                  </div>
                </button>

                <button
                  className="rounded-2xl border border-border/70 bg-background/70 px-4 py-5 text-left shadow-sm transition-transform hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
                  data-example-id="ramp-check"
                  type="button"
                >
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground" data-i18n="method.home.example">
                    Example
                  </div>
                  <div className="mt-4 text-lg font-semibold text-foreground" data-i18n="workflow.example.ramp">Ramp Check</div>
                  <div className="mt-2 text-sm leading-6 text-muted-foreground" data-i18n="method.home.exampleDescription">
                    Start from a tested script pattern.
                  </div>
                </button>

                <button
                  className="rounded-2xl border border-border/70 bg-background/70 px-4 py-5 text-left shadow-sm transition-transform hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
                  data-example-id="seek-check"
                  type="button"
                >
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground" data-i18n="method.home.example">
                    Example
                  </div>
                  <div className="mt-4 text-lg font-semibold text-foreground" data-i18n="workflow.example.seek">Seek Check</div>
                  <div className="mt-2 text-sm leading-6 text-muted-foreground" data-i18n="method.home.exampleDescription">
                    Start from a tested script pattern.
                  </div>
                </button>

                <button
                  className="rounded-2xl border border-border/70 bg-background/70 px-4 py-5 text-left shadow-sm transition-transform hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
                  data-example-id="pulse-train"
                  type="button"
                >
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground" data-i18n="method.home.example">
                    Example
                  </div>
                  <div className="mt-4 text-lg font-semibold text-foreground" data-i18n="workflow.example.pulse">Pulse Train</div>
                  <div className="mt-2 text-sm leading-6 text-muted-foreground" data-i18n="method.home.exampleDescription">
                    Start from a tested script pattern.
                  </div>
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button className="bg-foreground text-background hover:bg-foreground/90" data-method-home-tab="recents" id="method-home-tab-recents" size="sm" type="button" variant="ghost">
                  <span data-i18n="method.home.recents">Recents</span>
                </Button>
                <Button className="text-muted-foreground" data-method-home-tab="all" id="method-home-tab-all" size="sm" type="button" variant="ghost">
                  <span data-i18n="method.home.all">All</span>
                </Button>
                <Button className="text-muted-foreground" data-method-home-tab="favorites" id="method-home-tab-favorites" size="sm" type="button" variant="ghost">
                  <span data-i18n="method.home.favorites">Favorites</span>
                </Button>
                <Button className="text-muted-foreground" data-method-home-tab="sequence" id="method-home-tab-sequence" size="sm" type="button" variant="ghost">
                  <span data-i18n="method.home.sequence">Sequence</span>
                </Button>
                <Button className="text-muted-foreground" data-method-home-tab="workflow" id="method-home-tab-workflow" size="sm" type="button" variant="ghost">
                  <span data-i18n="method.home.workflow">Workflow</span>
                </Button>
              </div>

              <div className="relative w-full xl:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  data-i18n-placeholder="method.home.searchPlaceholder"
                  id="method-home-search"
                  placeholder="Search methods"
                  type="text"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" id="method-home-list">
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/40 px-4 py-8 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3" data-i18n="method.home.empty">
                No methods match this view yet.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
