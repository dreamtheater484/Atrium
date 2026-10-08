import {
  allowedRelations,
  CLASSIFICATIONS,
  ELEMENT_TYPE_DEFS,
  type ElementType,
  enumLabel,
  type FieldSuggestion,
  LIFECYCLE_PHASES,
  RELATION_TYPE_DEFS,
  type RelationType,
  type RelationView,
  typeDef,
  type UpdateElementInput,
} from '@atrium/schema';
import {
  Badge,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HealthBadge,
  LifecycleBadge,
  Progress,
  Select,
  Tooltip,
  TypeIcon,
} from '@atrium/ui';
import { AlertTriangle, Check, Link2, Plus, Sparkles, X } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import {
  type ElementDetailWithSuggestions,
  useCreateRelation,
  useDeleteRelation,
  useUpdateElement,
} from '../lib/queries';
import { inspect } from '../lib/store';
import { AttributeField, DateField, FieldRow, InlineText, InlineTextarea } from './fields';
import { ElementPicker } from './element-picker';

export function useSave(id: string) {
  const update = useUpdateElement();
  return (patch: UpdateElementInput) => update.mutate({ id, patch });
}

function suggestionLabel(field: string, s: FieldSuggestion, el: ElementDetailWithSuggestions): string {
  if (field === 'domainId') return el.relations.find((r) => r.other.id === s.value)?.other.name ?? 'a domain';
  if (typeof s.value === 'string' && s.value.length < 40) return enumLabel(s.value) || s.value;
  if (typeof s.value === 'string') return `${s.value.slice(0, 80)}…`;
  return String(s.value);
}

function fieldLabel(field: string, type: ElementType): string {
  if (field.startsWith('attributes.')) {
    return ELEMENT_TYPE_DEFS[type].attributes.find((a) => a.key === field.slice(11))?.label ?? field.slice(11);
  }
  return { domainId: 'Domain', owner: 'Owner', description: 'Description', classification: 'Classification' }[field] ?? field;
}

function patchFor(field: string, value: unknown): UpdateElementInput {
  if (field.startsWith('attributes.')) return { attributes: { [field.slice(11)]: value } };
  return { [field]: value } as UpdateElementInput;
}

/** Greyed-out values Atrium proposes. One click (or "Accept all") fills them in. */
export function Suggestions({ el, domainNames }: { el: ElementDetailWithSuggestions; domainNames: Map<string, string> }) {
  const save = useSave(el.id);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const entries = Object.entries(el.suggestions).filter(([f]) => !dismissed.includes(f));
  if (!entries.length) return null;
  const acceptAll = () => {
    const patch: UpdateElementInput = {};
    for (const [f, s] of entries) {
      if (f.startsWith('attributes.')) patch.attributes = { ...(patch.attributes ?? {}), [f.slice(11)]: s.value };
      else (patch as Record<string, unknown>)[f] = s.value;
    }
    save(patch);
  };
  return (
    <div className="rounded-xl border border-dashed border-primary/40 bg-primary-soft/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <span className="text-xs font-semibold text-primary-soft-foreground">Suggested by Atrium</span>
        <div className="flex-1" />
        {entries.length > 1 && (
          <Button size="sm" variant="soft" onClick={acceptAll}>
            Accept all
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {entries.map(([field, s]) => (
          <div key={field} className="group flex items-start gap-2 text-[13px]">
            <span className="w-24 shrink-0 pt-0.5 text-xs text-muted-foreground">{fieldLabel(field, el.type)}</span>
            <Tooltip content={s.reason}>
              <span className="min-w-0 flex-1 text-muted-foreground italic">
                {field === 'domainId' ? (domainNames.get(s.value as string) ?? 'Domain') : suggestionLabel(field, s, el)}
              </span>
            </Tooltip>
            <button type="button" aria-label="Accept" className="rounded-md p-1 text-good-foreground hover:bg-good-soft" onClick={() => save(patchFor(field, s.value))}>
              <Check className="size-3.5" />
            </button>
            <button type="button" aria-label="Dismiss" className="rounded-md p-1 text-muted-foreground hover:bg-surface-2" onClick={() => setDismissed((d) => [...d, field])}>
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function QualityMeter({ value, missing }: { value: number; missing: Array<{ label: string }> }) {
  const tone = value >= 85 ? 'good' : value >= 60 ? 'watch' : 'act';
  return (
    <Tooltip content={missing.length ? `Missing: ${missing.map((m) => m.label).join(', ')}` : 'Complete'}>
      <div className="flex w-28 items-center gap-2">
        <Progress value={value} tone={tone} />
        <span className="text-xs text-muted-foreground tabular">{value}%</span>
      </div>
    </Tooltip>
  );
}

export function CoreFields({ el, compact }: { el: ElementDetailWithSuggestions; compact?: boolean }) {
  const save = useSave(el.id);
  const def = typeDef(el.type);
  const readOnly = el.layer === 'reference';
  return (
    <div className="flex flex-col">
      <FieldRow label="Description">
        <InlineTextarea value={el.description} onSave={(description) => save({ description })} disabled={readOnly} />
      </FieldRow>
      <FieldRow label="Owner">
        <InlineText value={el.owner} onSave={(owner) => save({ owner })} placeholder="Who is accountable?" disabled={readOnly} />
      </FieldRow>
      {el.type !== 'domain' && el.type !== 'team' && (
        <FieldRow label="Domain">
          <ElementPicker
            types={['domain']}
            value={el.domainId ? { id: el.domainId, name: el.domainName ?? '…', type: 'domain' } : null}
            onChange={(v) => save({ domainId: v?.id ?? null })}
            placeholder="Choose a domain"
            className="border-transparent bg-transparent shadow-none hover:bg-surface-2"
          />
        </FieldRow>
      )}
      {def.hierarchical && (
        <FieldRow label="Part of">
          <ElementPicker
            types={[el.type]}
            exclude={[el.id]}
            value={el.parentId ? { id: el.parentId, name: el.parentName ?? '…', type: el.type } : null}
            onChange={(v) => save({ parentId: v?.id ?? null })}
            placeholder="Top level"
            className="border-transparent bg-transparent shadow-none hover:bg-surface-2"
          />
        </FieldRow>
      )}
      {def.hasLifecycle && (
        <FieldRow label="Lifecycle">
          <Select
            size="sm"
            value={el.lifecycle}
            onValueChange={(v) => save({ lifecycle: v as never })}
            options={LIFECYCLE_PHASES.map((p) => ({ value: p, label: enumLabel(p), hint: el.lifecycleDates[p] ? el.lifecycleDates[p] : undefined }))}
            placeholder="Set lifecycle"
            className="border-transparent bg-transparent shadow-none hover:bg-surface-2"
            aria-label="Lifecycle"
          />
        </FieldRow>
      )}
      {!compact && def.hasLifecycle && (
        <FieldRow label="Phase dates" hint="Atrium works out the lifecycle on any date from these">
          <div className="grid grid-cols-2 gap-x-2">
            {LIFECYCLE_PHASES.map((p) => (
              <div key={p} className="flex items-center gap-1">
                <span className="w-16 text-[11px] text-muted-foreground">{enumLabel(p)}</span>
                <DateField
                  value={el.lifecycleDates[p] ?? null}
                  onSave={(v) => save({ lifecycleDates: { ...el.lifecycleDates, [p]: v ?? undefined } })}
                  disabled={readOnly}
                />
              </div>
            ))}
          </div>
        </FieldRow>
      )}
      <FieldRow label="Classification">
        <Select
          size="sm"
          value={el.classification}
          onValueChange={(v) => v && save({ classification: v as never })}
          options={CLASSIFICATIONS.map((c) => ({ value: c, label: enumLabel(c) }))}
          className="border-transparent bg-transparent shadow-none hover:bg-surface-2"
          aria-label="Classification"
        />
      </FieldRow>
      {def.attributes.map((a) => (
        <FieldRow key={a.key} label={a.label} hint={a.help}>
          <AttributeField def={a} value={el.attributes[a.key]} onSave={(v) => save({ attributes: { [a.key]: v as never } })} disabled={readOnly || a.derived} />
          {a.key === 'eol_date' && el.attributes._eol ? (
            <span className="px-1.5 text-[11px] text-muted-foreground">Filled in automatically from endoflife.date</span>
          ) : null}
        </FieldRow>
      ))}
      {!compact && (
        <FieldRow label="Key">
          <InlineText value={el.key} onSave={(key) => save({ key })} placeholder="Used by engineers and agents" className="font-mono text-xs" disabled={readOnly} />
        </FieldRow>
      )}
    </div>
  );
}

function groupRelations(rels: RelationView[]) {
  const groups = new Map<string, { label: string; type: RelationType; direction: 'out' | 'in'; items: RelationView[] }>();
  for (const r of rels) {
    const def = RELATION_TYPE_DEFS[r.type];
    const key = `${r.type}:${r.direction}`;
    const label = r.direction === 'out' ? def.label : def.inverseLabel;
    const g = groups.get(key) ?? { label, type: r.type, direction: r.direction, items: [] };
    g.items.push(r);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** What a type can link to, in the order people need most. */
function addableRelations(type: ElementType): Array<{ relation: RelationType; direction: 'out' | 'in'; targetTypes: ElementType[]; label: string }> {
  const out: Array<{ relation: RelationType; direction: 'out' | 'in'; targetTypes: ElementType[]; label: string }> = [];
  for (const def of Object.values(RELATION_TYPE_DEFS)) {
    if (def.type === 'maps_to') continue;
    if (def.from.includes(type)) {
      const targets = def.to.filter((t) => t !== type || ['depends_on', 'flows_to', 'replaces', 'uses'].includes(def.type));
      if (targets.length && targets.length < 12) out.push({ relation: def.type, direction: 'out', targetTypes: [...targets], label: def.label });
    }
    if (def.to.includes(type) && ['supports', 'exposes', 'consumes', 'stores', 'uses', 'impacts', 'governed_by', 'owned_by'].includes(def.type)) {
      const sources = def.from.filter((t) => t !== type);
      if (sources.length && sources.length < 12) out.push({ relation: def.type, direction: 'in', targetTypes: [...sources], label: def.inverseLabel });
    }
  }
  return out;
}

export function Relations({ el, compact }: { el: ElementDetailWithSuggestions; compact?: boolean }) {
  const create = useCreateRelation();
  const remove = useDeleteRelation();
  const groups = useMemo(() => groupRelations(el.relations.filter((r) => r.type !== 'maps_to' || !compact)), [el.relations, compact]);
  const options = useMemo(() => addableRelations(el.type), [el.type]);
  const [adding, setAdding] = useState<null | (typeof options)[number]>(null);
  const readOnly = el.layer === 'reference';

  const add = (opt: (typeof options)[number], otherId: string) => {
    create.mutate(
      opt.direction === 'out'
        ? { type: opt.relation, sourceId: el.id, targetId: otherId }
        : { type: opt.relation, sourceId: otherId, targetId: el.id },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {groups.length === 0 && <p className="text-[13px] text-muted-foreground">Not linked to anything yet.</p>}
      {groups.map((g) => (
        <div key={`${g.type}:${g.direction}`}>
          <div className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {g.label} <span className="tabular">· {g.items.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((r) => (
              <span key={r.id} className="group inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-surface py-0.5 pr-1 pl-1 text-[13px] shadow-sm">
                <TypeIcon type={r.other.type} size="xs" />
                <button type="button" className="truncate hover:underline" onClick={() => inspect(r.other.id)}>
                  {r.other.name}
                </button>
                {r.other.layer === 'reference' && <Badge tone="outline">Ref</Badge>}
                {!readOnly && (
                  <button type="button" aria-label={`Remove link to ${r.other.name}`} className="rounded p-0.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-surface-2" onClick={() => remove.mutate(r.id)}>
                    <X className="size-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      ))}
      {!readOnly && (
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="text-muted-foreground">
                <Plus /> Link to…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {options.map((o) => (
                <DropdownMenuItem key={`${o.relation}:${o.direction}`} onSelect={() => setTimeout(() => setAdding(o), 0)}>
                  <Link2 /> {o.label[0]!.toUpperCase() + o.label.slice(1)}
                  <span className="ml-auto text-[11px] text-muted-foreground">{o.targetTypes.length === 1 ? typeDef(o.targetTypes[0]!).label : ''}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {adding && (
            <ElementPicker
              open
              onOpenChange={(o) => !o && setAdding(null)}
              types={adding.targetTypes}
              exclude={[el.id, ...el.relations.filter((r) => r.type === adding.relation).map((r) => r.other.id)]}
              onChange={(v) => {
                if (v) add(adding, v.id);
                setAdding(null);
              }}
              trigger={<span className="text-xs text-muted-foreground">{adding.label}…</span>}
            />
          )}
        </div>
      )}
      {el.suggestedRelations.map((s) => (
        <div key={s.relation} className="rounded-xl border border-dashed border-primary/40 bg-primary-soft/40 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary-soft-foreground">
            <Sparkles className="size-4 text-primary" />
            {s.relation === 'maps_to' ? 'Possible reference model matches' : `Probably ${RELATION_TYPE_DEFS[s.relation].label}`}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {s.matches.map((m) => (
              <Tooltip key={m.id} content={`${m.reason} (${Math.round(m.confidence * 100)}% sure)`}>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-primary/50 bg-surface px-2 py-0.5 text-[13px] text-muted-foreground transition hover:border-primary hover:text-foreground"
                  onClick={() => create.mutate({ type: s.relation, sourceId: el.id, targetId: m.id })}
                >
                  <Plus className="size-3" /> {m.name}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function HealthPanel({ el }: { el: ElementDetailWithSuggestions }) {
  if (!el.health && !el.healthReasons.length) return null;
  return (
    <div className={cn('rounded-xl p-3', el.health === 'act' ? 'bg-act-soft' : el.health === 'watch' ? 'bg-watch-soft' : 'bg-good-soft')}>
      <div className="flex items-center gap-2">
        <HealthBadge health={el.health} className="bg-surface/70" />
        <span className="text-xs text-muted-foreground">Worked out from fit ratings and the technologies it runs on</span>
      </div>
      {el.healthReasons.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {el.healthReasons.map((r) => (
            <li key={r} className="flex items-start gap-1.5 text-[13px]">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 opacity-70" /> {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ElementHeaderMeta({ el }: { el: ElementDetailWithSuggestions }): ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {el.health && <HealthBadge health={el.health} />}
      {el.lifecycle && <LifecycleBadge lifecycle={el.lifecycle} />}
      {el.layer === 'reference' && <Badge tone="outline">Reference · {el.pack}</Badge>}
      {el.scenarioMark && <Badge tone="primary">{el.scenarioMark === 'added' ? 'New in this scenario' : 'Changed in this scenario'}</Badge>}
      {el.pendingSuggestions > 0 && <Badge tone="watch">{el.pendingSuggestions} suggestion{el.pendingSuggestions > 1 ? 's' : ''} waiting</Badge>}
      {el.layer === 'org' && <QualityMeter value={el.quality} missing={el.missing} />}
    </div>
  );
}

export function TitleField({ el, className }: { el: ElementDetailWithSuggestions; className?: string }) {
  const save = useSave(el.id);
  return (
    <InlineText
      value={el.name}
      onSave={(name) => name && save({ name })}
      className={cn('px-1 text-lg font-semibold tracking-tight', className)}
      inputClassName="h-9 text-lg font-semibold"
      disabled={el.layer === 'reference'}
    />
  );
}

export { allowedRelations };
