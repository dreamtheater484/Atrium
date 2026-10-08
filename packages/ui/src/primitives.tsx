import { cva, type VariantProps } from 'class-variance-authority';
import { type ClassValue, clsx } from 'clsx';
import { Slot } from 'radix-ui';
import * as React from 'react';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[13px] font-medium transition-[background,color,box-shadow,border-color] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background cursor-pointer select-none',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover',
        secondary:
          'bg-surface text-foreground border border-border-strong shadow-sm hover:bg-surface-2',
        ghost: 'text-foreground hover:bg-surface-2',
        subtle: 'bg-surface-2 text-foreground hover:bg-surface-3',
        soft: 'bg-primary-soft text-primary-soft-foreground hover:brightness-95 dark:hover:brightness-110',
        danger: 'bg-act text-white shadow-sm hover:brightness-95',
        link: 'text-primary underline-offset-4 hover:underline px-0 h-auto',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-8 px-3',
        lg: 'h-10 px-4 text-sm',
        icon: 'size-8',
        'icon-sm': 'size-7',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, type = 'button', ...props }, ref) => {
    const Comp = asChild ? Slot.Root : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-8 w-full min-w-0 rounded-lg border border-input bg-surface px-2.5 text-[13px] shadow-sm outline-none transition-[border,box-shadow] placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full min-w-0 rounded-lg border border-input bg-surface px-2.5 py-2 text-[13px] shadow-sm outline-none transition-[border,box-shadow] placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: generic label, control passed by caller
    <label className={cn('text-xs font-medium text-muted-foreground', className)} {...props} />
  );
}

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-2 text-muted-foreground',
        outline: 'border border-border text-muted-foreground',
        primary: 'bg-primary-soft text-primary-soft-foreground',
        good: 'bg-good-soft text-good-foreground',
        watch: 'bg-watch-soft text-watch-foreground',
        act: 'bg-act-soft text-act-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl border border-border bg-surface shadow-sm', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-start justify-between gap-3 px-4 pt-4 pb-2', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-[13px] font-semibold tracking-tight', className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 pb-4', className)} {...props} />;
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1 font-sans text-[10px] font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-surface-3', className)} {...props} />;
}

export function Separator({ className, vertical }: { className?: string; vertical?: boolean }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: an <hr> can't be drawn vertically
    <div
      role="separator"
      className={cn(vertical ? 'w-px self-stretch' : 'h-px w-full', 'bg-border', className)}
    />
  );
}

export function Progress({
  value,
  className,
  tone = 'primary',
}: {
  value: number;
  className?: string;
  tone?: 'primary' | 'good' | 'watch' | 'act';
}) {
  const color = { primary: 'bg-primary', good: 'bg-good', watch: 'bg-watch', act: 'bg-act' }[tone];
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', color)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

const AVATAR_TONES = [
  'bg-[oklch(0.9_0.05_274)] text-[oklch(0.4_0.15_274)] dark:bg-[oklch(0.35_0.08_274)] dark:text-[oklch(0.9_0.06_274)]',
  'bg-[oklch(0.92_0.05_165)] text-[oklch(0.4_0.09_165)] dark:bg-[oklch(0.35_0.06_165)] dark:text-[oklch(0.9_0.06_165)]',
  'bg-[oklch(0.93_0.05_75)] text-[oklch(0.45_0.1_60)] dark:bg-[oklch(0.38_0.07_70)] dark:text-[oklch(0.92_0.07_80)]',
  'bg-[oklch(0.92_0.04_15)] text-[oklch(0.45_0.14_20)] dark:bg-[oklch(0.36_0.07_20)] dark:text-[oklch(0.9_0.06_20)]',
  'bg-[oklch(0.92_0.04_240)] text-[oklch(0.42_0.12_240)] dark:bg-[oklch(0.35_0.07_240)] dark:text-[oklch(0.9_0.06_240)]',
];

export function initials(name: string) {
  // Words only: "atrium sync (CI)" → "AS", not "A(".
  const parts = name
    .replace(/\(.*?\)/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (!parts.length) return '?';
  return (
    (parts[0]![0] ?? '') + (parts.length > 1 ? parts.at(-1)![0] : (parts[0]![1] ?? ''))
  ).toUpperCase();
}

export function Avatar({
  name,
  className,
  size = 'md',
}: {
  name: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const tone = AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
  const dim = { sm: 'size-5 text-[9px]', md: 'size-7 text-[11px]', lg: 'size-9 text-xs' }[size];
  return (
    <span
      title={name}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ring-2 ring-surface',
        dim,
        tone,
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
