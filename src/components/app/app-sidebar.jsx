import { LayoutDashboard, ListChecks, Settings2, SlidersHorizontal, Sparkles } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.jsx';
import { Button, buttonVariants } from '../ui/button.jsx';
import { NativeSelect } from '../ui/native-select.jsx';
import { cn } from '../../lib/utils.js';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', key: 'sidebar.nav.dashboard', icon: LayoutDashboard },
  { id: 'tests', label: 'Essais', key: 'sidebar.nav.tests', icon: ListChecks },
  { id: 'method', label: 'Method', key: 'sidebar.nav.method', icon: SlidersHorizontal },
  { id: 'settings', label: 'Settings', key: 'sidebar.nav.settings', icon: Settings2 }
];

export function AppSidebar() {
  return (
    <aside className="min-h-0 overflow-y-auto border-b border-border/70 bg-card/80 backdrop-blur-xl md:h-full md:overflow-hidden md:border-b-0 md:border-r">
      <div className="flex min-h-full flex-col gap-4 p-3 md:h-full md:min-h-0 lg:p-4">
        <div className="rounded-2xl border border-primary/15 bg-primary/8 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex items-center gap-3 text-primary">
            <div className="rounded-xl bg-primary/15 p-2.5">
              <Sparkles className="size-5" />
            </div>
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.22em]">E-PIEZO DCX</div>
              <div className="mt-1 text-xs text-primary/70" data-i18n="sidebar.productSubtitle">Industrial ultrasonic control console</div>
            </div>
          </div>
        </div>

        <div className="nav-items min-h-0 overflow-y-auto grid gap-2">
          {navItems.map((item, index) => {
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'nav-btn h-auto w-full rounded-xl px-4 py-3', index === 0 && 'active')}
                data-tab={item.id}
              >
                <span className="nav-btn-icon">
                  <Icon className="size-[18px]" />
                </span>
                <span className="nav-btn-label" data-i18n={item.key}>{item.label}</span>
              </button>
            );
          })}
        </div>

        <Card className="mt-auto shrink-0 bg-background/50">
          <CardHeader className="pb-3">
            <CardTitle data-i18n="sidebar.simulation.title">Operating Mode</CardTitle>
            <CardDescription data-i18n="sidebar.simulation.description">Choose the target mode, then click Start or Stop.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <NativeSelect defaultValue="false" id="sim-mode-toggle">
              <option data-i18n="sidebar.simulation.hardware" value="false">Hardware</option>
              <option data-i18n="sidebar.simulation.simulation" value="true">Simulation</option>
            </NativeSelect>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
              <Button className="w-full" data-i18n="sidebar.simulation.start" id="connect-dcx-btn">
                Start
              </Button>
              <Button className="w-full" data-i18n="sidebar.simulation.stop" id="disconnect-dcx-btn" variant="destructive">
                Stop
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </aside>
  );
}
