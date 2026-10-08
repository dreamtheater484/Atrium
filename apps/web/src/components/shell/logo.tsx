import { cn } from '@atrium/ui';

/** The Atrium mark: two nested arches, the shared hall everyone walks through. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-7', className)} aria-hidden="true">
      <rect width="64" height="64" rx="16" className="fill-primary" />
      <path
        d="M16 48V30a16 16 0 0 1 32 0v18"
        fill="none"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M26 48V32a6 6 0 0 1 12 0v16"
        fill="none"
        stroke="white"
        strokeOpacity="0.6"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && <span className="text-[15px] font-semibold tracking-tight">Atrium</span>}
    </span>
  );
}
