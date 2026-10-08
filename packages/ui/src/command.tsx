import { Command as C } from 'cmdk';
import { Search } from 'lucide-react';
import type * as React from 'react';
import { cn } from './primitives';

export function Command({ className, ...props }: React.ComponentProps<typeof C>) {
  return <C className={cn('flex h-full w-full flex-col overflow-hidden rounded-xl bg-surface text-foreground', className)} {...props} />;
}

export function CommandInput({ className, ...props }: React.ComponentProps<typeof C.Input>) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <C.Input
        className={cn('flex h-11 w-full bg-transparent text-sm outline-none placeholder:text-subtle-foreground', className)}
        {...props}
      />
    </div>
  );
}

export function CommandList({ className, ...props }: React.ComponentProps<typeof C.List>) {
  return <C.List className={cn('max-h-[min(60vh,440px)] scroll-py-1 overflow-y-auto overflow-x-hidden p-1', className)} {...props} />;
}

export function CommandEmpty(props: React.ComponentProps<typeof C.Empty>) {
  return <C.Empty className="py-8 text-center text-[13px] text-muted-foreground" {...props} />;
}

export function CommandGroup({ className, ...props }: React.ComponentProps<typeof C.Group>) {
  return (
    <C.Group
      className={cn(
        'overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function CommandItem({ className, ...props }: React.ComponentProps<typeof C.Item>) {
  return (
    <C.Item
      className={cn(
        'relative flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] outline-none select-none data-[selected=true]:bg-surface-2 data-[disabled=true]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}

export function CommandSeparator({ className }: { className?: string }) {
  return <C.Separator className={cn('-mx-1 h-px bg-border', className)} />;
}
