import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '../../lib/utils.js';

const NativeSelect = React.forwardRef(({ className, wrapperClassName, children, ...props }, ref) => {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select
        ref={ref}
        className={cn(
          'flex h-10 w-full appearance-none rounded-md border border-input bg-background/80 px-3 py-2 pr-9 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:border-border/70 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
});

NativeSelect.displayName = 'NativeSelect';

export { NativeSelect };
