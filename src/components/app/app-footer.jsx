import { Gauge } from 'lucide-react';

export function AppFooter() {
  return (
    <footer className="flex shrink-0 flex-col gap-2 border-t border-border/70 bg-background/75 px-3 py-2 text-xs text-muted-foreground backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:px-4">
      <div aria-live="polite" className="min-w-0 break-words text-sm font-medium leading-5 transition-colors" id="last-msg">
        System Ready
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end lg:gap-4">
        <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/80 px-3 py-1">
          <Gauge className="size-3.5" />
          <span data-i18n="footer.latency">Latency</span>: <span id="ping-val">0</span>ms
        </span>
        <span className="rounded-full border border-border/70 bg-card/80 px-3 py-1"><span data-i18n="footer.build">Build</span>: 1.2.0-PROD</span>
      </div>
    </footer>
  );
}
