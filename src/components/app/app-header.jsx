import { LogOut, UserRound } from 'lucide-react';

import { Badge } from '../ui/badge.jsx';
import { Button } from '../ui/button.jsx';

export function AppHeader({ currentUser = null, onSignOut, signingOut = false }) {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-background/75 px-3 py-2 backdrop-blur lg:min-h-16 lg:px-4 xl:px-6">
      <div className="min-w-0">
        <div className="text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-muted-foreground" data-i18n="header.workspace">Live Workspace</div>
        <div className="mt-1 truncate text-sm font-semibold" id="current-view-title">
          Dashboard
        </div>
      </div>

      <div className="flex items-center gap-2 self-start sm:self-auto">
        {currentUser ? (
          <Badge className="shrink-0 gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[0.7rem] text-primary shadow-none" variant="outline">
            <UserRound className="size-3.5" />
            <span className="max-w-28 truncate sm:max-w-40">{currentUser.username}</span>
            <span className="text-primary/70">{currentUser.role === 'admin' ? 'Admin' : 'Operator'}</span>
          </Badge>
        ) : null}

        <Badge className="shrink-0 gap-2 rounded-full border border-border/70 bg-card/80 px-3 py-1.5 text-[0.7rem] text-foreground shadow-none" variant="outline">
          <span className="status-dot" id="header-status-dot" />
          <span id="header-status-text">OFFLINE</span>
        </Badge>

        {currentUser && typeof onSignOut === 'function' ? (
          <Button disabled={signingOut} onClick={onSignOut} size="sm" variant="outline">
            <LogOut className="size-4" />
            {signingOut ? 'Signing Out...' : 'Sign Out'}
          </Button>
        ) : null}
      </div>
    </header>
  );
}
