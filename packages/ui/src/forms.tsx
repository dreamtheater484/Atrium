import { Check, ChevronDown } from 'lucide-react';
import { Checkbox as CB, Select as S, Switch as SW, Tabs as TB, ToggleGroup as TG } from 'radix-ui';
import type * as React from 'react';
import { cn } from './primitives';

/* ---------------- Select ---------------- */
export interface SelectOption {
  value: string;
  label: React.ReactNode;
  hint?: string;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Choose…',
  className,
  size = 'md',
  allowClear,
  'aria-label': ariaLabel,
}: {
  value: string | null | undefined;
  onValueChange: (v: string | null) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md';
  allowClear?: boolean;
  'aria-label'?: string;
}) {
  const CLEAR = '__clear__';
  return (
    <S.Root value={value ?? ''} onValueChange={(v) => onValueChange(v === CLEAR ? null : v)}>
      <S.Trigger
        aria-label={ariaLabel}
        className={cn(
          'inline-flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-surface px-2.5 text-left text-[13px] shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/20 data-[placeholder]:text-subtle-foreground',
          size === 'sm' ? 'h-7' : 'h-8',
          className,
        )}
      >
        <span className="truncate">
          <S.Value placeholder={placeholder} />
        </span>
        <S.Icon>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={4}
          className="z-[60] max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <S.Viewport>
            {allowClear && value && (
              <S.Item
                value={CLEAR}
                className="flex cursor-pointer items-center rounded-lg px-2 py-1.5 text-[13px] text-muted-foreground outline-none data-[highlighted]:bg-surface-2"
              >
                <S.ItemText>Clear</S.ItemText>
              </S.Item>
            )}
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer items-center gap-2 rounded-lg py-1.5 pr-7 pl-2 text-[13px] outline-none select-none data-[highlighted]:bg-surface-2"
              >
                <S.ItemText>{o.label}</S.ItemText>
                {o.hint && (
                  <span className="ml-auto text-[11px] text-muted-foreground">{o.hint}</span>
                )}
                <S.ItemIndicator className="absolute right-2">
                  <Check className="size-3.5 text-primary" />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}

/* ---------------- Switch ---------------- */
export function Switch({ className, ...props }: React.ComponentProps<typeof SW.Root>) {
  return (
    <SW.Root
      className={cn(
        'inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-surface-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-primary',
        className,
      )}
      {...props}
    >
      <SW.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-4" />
    </SW.Root>
  );
}

/* ---------------- Checkbox ---------------- */
export function Checkbox({ className, ...props }: React.ComponentProps<typeof CB.Root>) {
  return (
    <CB.Root
      className={cn(
        'flex size-4 shrink-0 cursor-pointer items-center justify-center rounded border border-border-strong bg-surface outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary',
        className,
      )}
      {...props}
    >
      <CB.Indicator className="text-primary-foreground">
        {props.checked === 'indeterminate' ? (
          <span className="block h-0.5 w-2 rounded bg-current" />
        ) : (
          <Check className="size-3" strokeWidth={3} />
        )}
      </CB.Indicator>
    </CB.Root>
  );
}

/* ---------------- Tabs ---------------- */
export const Tabs = TB.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof TB.List>) {
  return (
    <TB.List
      className={cn('flex items-center gap-1 border-b border-border', className)}
      {...props}
    />
  );
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TB.Trigger>) {
  return (
    <TB.Trigger
      className={cn(
        '-mb-px inline-flex cursor-pointer items-center gap-1.5 border-b-2 border-transparent px-2.5 py-2 text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground [&_svg]:size-3.5',
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = TB.Content;

/* ---------------- Segmented control ---------------- */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  className,
  size = 'md',
}: {
  value: T;
  onValueChange: (v: T) => void;
  options: Array<{ value: T; label: React.ReactNode; icon?: React.ReactNode; title?: string }>;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <TG.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      className={cn('inline-flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5', className)}
    >
      {options.map((o) => (
        <TG.Item
          key={o.value}
          value={o.value}
          title={o.title}
          aria-label={o.title ?? (typeof o.label === 'string' ? o.label : o.value)}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 font-medium text-muted-foreground outline-none transition-all hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=on]:bg-surface data-[state=on]:text-foreground data-[state=on]:shadow-sm [&_svg]:size-3.5',
            size === 'sm' ? 'h-6 text-xs' : 'h-7 text-[13px]',
          )}
        >
          {o.icon}
          {o.label}
        </TG.Item>
      ))}
    </TG.Root>
  );
}
