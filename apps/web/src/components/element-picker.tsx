import type { ElementType } from '@atrium/schema';
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TypeIcon,
} from '@atrium/ui';
import { ChevronDown, Plus, X } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useElements, useSearch } from '../lib/queries';

export interface PickedElement {
  id: string;
  name: string;
  type: ElementType;
}

/**
 * Search-as-you-type picker for elements. Short lists (domains, teams) show everything;
 * long lists search on the server. Can offer "Create …" when nothing matches.
 */
export function ElementPicker({
  types,
  value,
  onChange,
  placeholder = 'Choose…',
  exclude = [],
  onCreate,
  layer = 'org',
  trigger,
  className,
  align = 'start',
  open: openProp,
  onOpenChange,
}: {
  types: ElementType[];
  value?: PickedElement | null;
  onChange: (v: PickedElement | null) => void;
  placeholder?: string;
  exclude?: string[];
  onCreate?: (name: string) => void;
  layer?: 'org' | 'reference' | 'all';
  trigger?: ReactNode;
  className?: string;
  align?: 'start' | 'end';
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;
  const [q, setQ] = useState('');
  const small = types.every((t) => t === 'domain' || t === 'team');
  const all = useElements(
    { types, layer, limit: 300, sort: 'name' },
    { enabled: open && (small || !q) },
  );
  const found = useSearch(q, { types, layer, limit: 30 });
  const items = useMemo(() => {
    const list = q ? (found.data ?? []) : (all.data?.items ?? []);
    return list.filter((e) => !exclude.includes(e.id)).slice(0, 200);
  }, [q, found.data, all.data, exclude]);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ('');
      }}
    >
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className={cn(
              'flex h-8 w-full items-center gap-2 rounded-lg border border-input bg-surface px-2.5 text-left text-[13px] shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/20',
              className,
            )}
          >
            {value ? (
              <>
                <TypeIcon type={value.type} size="xs" />
                <span className="flex-1 truncate">{value.name}</span>
                {/* biome-ignore lint/a11y/useSemanticElements: sits inside the trigger button, which can't contain another button */}
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Clear"
                  className="rounded p-0.5 text-muted-foreground hover:bg-surface-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(null);
                  }}
                >
                  <X className="size-3" />
                </span>
              </>
            ) : (
              <>
                <span className="flex-1 truncate text-subtle-foreground">{placeholder}</span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </>
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align={align}>
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder="Type to search…" autoFocus />
          <CommandList>
            <CommandEmpty>{q ? 'Nothing found.' : 'Nothing here yet.'}</CommandEmpty>
            {items.length > 0 && (
              <CommandGroup>
                {items.map((e) => (
                  <CommandItem
                    key={e.id}
                    value={e.id}
                    onSelect={() => {
                      onChange({ id: e.id, name: e.name, type: e.type });
                      setOpen(false);
                      setQ('');
                    }}
                  >
                    <TypeIcon type={e.type} size="xs" />
                    <span className="flex-1 truncate">{e.name}</span>
                    {'domainName' in e && e.domainName && (
                      <span className="truncate text-[11px] text-muted-foreground">
                        {e.domainName}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {onCreate &&
              q.trim() &&
              !items.some((i) => i.name.toLowerCase() === q.trim().toLowerCase()) && (
                <CommandGroup>
                  <CommandItem
                    value={`create:${q}`}
                    onSelect={() => {
                      onCreate(q.trim());
                      setOpen(false);
                      setQ('');
                    }}
                  >
                    <Plus /> Create “{q.trim()}”
                  </CommandItem>
                </CommandGroup>
              )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function PickerButton({ children, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button variant="ghost" size="sm" className="h-7 text-muted-foreground" {...props}>
      {children}
    </Button>
  );
}
