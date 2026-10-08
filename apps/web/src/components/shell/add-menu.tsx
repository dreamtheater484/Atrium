import { ELEMENT_TYPE_LIST } from '@atrium/schema';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
  TypeIcon,
} from '@atrium/ui';
import { ChevronDown, FileUp, Plus } from 'lucide-react';
import { openAdd, openImport } from '../../lib/store';

const QUICK = ['application', 'capability', 'technology', 'interface', 'initiative', 'decision'] as const;

export function AddMenu() {
  return (
    <div className="flex items-center">
      <Button variant="primary" className="rounded-r-none pr-2.5" onClick={() => openAdd(null)}>
        <Plus /> Add
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="primary" className="rounded-l-none border-l border-white/20 px-1.5" aria-label="More ways to add">
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          <DropdownMenuItem onSelect={() => openImport()}>
            <FileUp /> Import a file
            <span className="ml-auto text-[11px] text-muted-foreground">Excel, CSV, ArchiMate</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center justify-between">
            New element <Kbd>N</Kbd>
          </DropdownMenuLabel>
          {QUICK.map((t) => {
            const def = ELEMENT_TYPE_LIST.find((d) => d.type === t)!;
            return (
              <DropdownMenuItem key={t} onSelect={() => openAdd(t)}>
                <TypeIcon type={t} size="sm" /> {def.label}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuItem onSelect={() => openAdd(null)}>
            <Plus /> Something else…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
