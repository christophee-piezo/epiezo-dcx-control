import * as React from 'react';

import { cn } from '../../lib/utils.js';

const Card = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('rounded-xl border border-border/70 bg-card/85 text-card-foreground shadow-[0_24px_80px_-48px_rgba(15,23,42,0.85)] backdrop-blur', className)}
      {...props}
    />
  );
});

const CardHeader = React.forwardRef(({ className, ...props }, ref) => {
  return <div ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />;
});

const CardTitle = React.forwardRef(({ className, ...props }, ref) => {
  return <div ref={ref} className={cn('text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground', className)} {...props} />;
});

const CardDescription = React.forwardRef(({ className, ...props }, ref) => {
  return <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />;
});

const CardContent = React.forwardRef(({ className, ...props }, ref) => {
  return <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />;
});

Card.displayName = 'Card';
CardHeader.displayName = 'CardHeader';
CardTitle.displayName = 'CardTitle';
CardDescription.displayName = 'CardDescription';
CardContent.displayName = 'CardContent';

export { Card, CardContent, CardDescription, CardHeader, CardTitle };
