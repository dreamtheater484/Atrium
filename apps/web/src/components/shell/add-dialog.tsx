import { ELEMENT_TYPE_LIST, type ElementType, typeDef } from '@atrium/schema';
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Kbd,
  Label,
  Textarea,
  TypeIcon,
  toast,
} from '@atrium/ui';
import { useEffect, useRef, useState } from 'react';
import { useCreateElement, useSearch } from '../../lib/queries';
import { inspect, ui, useUi } from '../../lib/store';
import { ElementPicker, type PickedElement } from '../element-picker';

const ORDER: ElementType[] = [
  'application',
  'capability',
  'business_process',
  'interface',
  'data_object',
  'technology',
  'initiative',
  'decision',
  'standard',
  'principle',
  'team',
  'domain',
];

/** Quick add: pick a type, type a name, press Enter. Atrium fills in the rest. */
export function AddDialog() {
  const open = useUi((s) => s.addOpen);
  const preset = useUi((s) => s.addType) as ElementType | null;
  const [type, setType] = useState<ElementType>('application');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parent, setParent] = useState<PickedElement | null>(null);
  const [domain, setDomain] = useState<PickedElement | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const create = useCreateElement();
  const similar = useSearch(name.trim().length >= 3 ? name : '', { types: [type], limit: 3 });
  const dupe = similar.data?.find((h) => h.score >= 65);
  const def = typeDef(type);

  useEffect(() => {
    if (open) {
      if (preset) setType(preset);
      setName('');
      setDescription('');
      setParent(null);
      setTimeout(() => nameRef.current?.focus(), 30);
    }
  }, [open, preset]);

  const close = () => ui.set({ addOpen: false, addType: null });

  const submit = async (another: boolean) => {
    if (!name.trim()) {
      nameRef.current?.focus();
      return;
    }
    const res = await create.mutateAsync({
      type,
      name: name.trim(),
      description: description.trim() || undefined,
      parentId: parent?.id,
      domainId: domain?.id,
    });
    if (another) {
      toast.success(`Added ${name.trim()}`);
      setName('');
      setDescription('');
      nameRef.current?.focus();
    } else {
      close();
      if (res.element) inspect(res.element.id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add to the model</DialogTitle>
          <DialogDescription>
            Give it a name. Atrium fills in what it can work out, such as owner, domain and key.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type">
          {ORDER.map((t) => {
            const d = ELEMENT_TYPE_LIST.find((x) => x.type === t)!;
            return (
              // biome-ignore lint/a11y/useSemanticElements: styled radio cards
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => {
                  setType(t);
                  setParent(null);
                  nameRef.current?.focus();
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium transition',
                  type === t
                    ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                    : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
                )}
              >
                <TypeIcon type={t} size="xs" />
                {d.label}
              </button>
            );
          })}
        </div>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.shiftKey) {
              e.preventDefault();
              void submit(true);
            }
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="add-name">{def.label} name</Label>
            <Input
              id="add-name"
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                {
                  application: 'Customer Portal',
                  capability: 'Order management',
                  technology: 'PostgreSQL 16',
                  initiative: 'CRM consolidation',
                }[type as string] ?? `New ${def.label.toLowerCase()}`
              }
              className="h-10 text-sm"
              autoComplete="off"
            />
            {dupe && (
              <p className="text-xs text-watch-foreground">
                Similar:{' '}
                <button
                  type="button"
                  className="font-medium underline"
                  onClick={() => {
                    close();
                    inspect(dupe.id);
                  }}
                >
                  {dupe.name}
                </button>{' '}
                already exists.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {def.hierarchical && (
              <div className="grid gap-1.5">
                <Label>Part of</Label>
                <ElementPicker
                  types={[type]}
                  value={parent}
                  onChange={setParent}
                  placeholder="Top level"
                />
              </div>
            )}
            {type !== 'domain' && type !== 'team' && (
              <div className="grid gap-1.5">
                <Label>Domain</Label>
                <ElementPicker
                  types={['domain']}
                  value={domain}
                  onChange={setDomain}
                  placeholder={parent ? 'Same as parent' : 'Optional'}
                />
              </div>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="add-desc">Description</Label>
            <Textarea
              id="add-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional. What is it for?"
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Kbd>Enter</Kbd> add and open · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> add another
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={create.isPending}>
                Add {def.label.toLowerCase()}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
