import { type AttributeDef, enumLabel } from '@atrium/schema';
import { cn, formatDate, formatMoney, Input, Rating, Select, Textarea } from '@atrium/ui';
import { Check, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

/** Click-to-edit single line text. Saves on Enter or when focus leaves; Esc cancels. */
export function InlineText({
  value,
  onSave,
  placeholder = 'Add…',
  className,
  inputClassName,
  disabled,
  display,
}: {
  value: string | null | undefined;
  onSave: (v: string | null) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  display?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);
  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== (value ?? '')) onSave(next || null);
  };
  if (editing && !disabled) {
    return (
      <Input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(value ?? '');
            setEditing(false);
          }
        }}
        className={cn('h-7', inputClassName)}
        autoFocus
      />
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setEditing(true)}
      className={cn(
        'block min-h-7 w-full truncate rounded-md px-1.5 py-1 text-left text-[13px] transition-colors',
        !disabled && 'cursor-text hover:bg-surface-2',
        !value && 'text-subtle-foreground',
        className,
      )}
    >
      {display ?? (value || placeholder)}
    </button>
  );
}

export function InlineTextarea({
  value,
  onSave,
  placeholder = 'Add a description…',
  disabled,
  className,
}: {
  value: string | null | undefined;
  onSave: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    if (draft.trim() !== (value ?? '').trim()) onSave(draft.trim());
  };
  if (editing && !disabled) {
    return (
      <Textarea
        value={draft}
        rows={Math.min(10, Math.max(3, draft.split('\n').length + 1))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit();
          if (e.key === 'Escape') {
            setDraft(value ?? '');
            setEditing(false);
          }
        }}
        autoFocus
        className={className}
      />
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setEditing(true)}
      className={cn(
        'block w-full whitespace-pre-wrap rounded-md px-1.5 py-1 text-left text-[13px] leading-relaxed transition-colors',
        !disabled && 'cursor-text hover:bg-surface-2',
        !value && 'text-subtle-foreground',
        className,
      )}
    >
      {value || placeholder}
    </button>
  );
}

function parseNumber(s: string): number | null {
  const clean = s.replace(/[€$£\s]/g, '').replace(/,/g, '');
  const m = clean.match(/^(-?\d+(?:\.\d+)?)([kmb])?$/i);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? '').toLowerCase() as 'k'] ?? 1;
  return Math.round(Number(m[1]) * mult * 100) / 100;
}

/** Edits one attribute according to its kind (enum, rating, money, date, …). */
export function AttributeField({
  def,
  value,
  onSave,
  disabled,
}: {
  def: AttributeDef;
  value: unknown;
  onSave: (v: unknown) => void;
  disabled?: boolean;
}) {
  switch (def.kind) {
    case 'enum':
      return (
        <Select
          size="sm"
          value={(value as string) ?? null}
          onValueChange={(v) => onSave(v)}
          options={(def.options ?? []).map((o) => ({ value: o, label: enumLabel(o) }))}
          placeholder="Choose…"
          allowClear
          className="border-transparent bg-transparent shadow-none hover:bg-surface-2"
          aria-label={def.label}
        />
      );
    case 'rating':
      return (
        <div className="flex h-7 items-center px-1.5">
          <Rating value={value as number} onChange={disabled ? undefined : (v) => onSave(v)} />
          <span className="ml-2 text-xs text-muted-foreground tabular">
            {value ? `${value}/5` : ''}
          </span>
        </div>
      );
    case 'boolean':
      return (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSave(!value)}
          className="flex h-7 items-center gap-1.5 px-1.5 text-[13px]"
        >
          {value ? (
            <Check className="size-4 text-good" />
          ) : (
            <X className="size-4 text-muted-foreground" />
          )}
          {value ? 'Yes' : 'No'}
        </button>
      );
    case 'currency':
    case 'number':
    case 'percent':
      return (
        <InlineText
          value={value === undefined || value === null ? '' : String(value)}
          display={
            value === undefined || value === null
              ? undefined
              : def.kind === 'currency'
                ? formatMoney(Number(value), { compact: false })
                : def.kind === 'percent'
                  ? `${value}%`
                  : Number(value).toLocaleString('en-GB')
          }
          placeholder={def.kind === 'currency' ? 'e.g. 120k' : 'Add…'}
          onSave={(v) => onSave(v === null ? null : parseNumber(v))}
          disabled={disabled}
          className="tabular"
        />
      );
    case 'date':
      return <DateField value={(value as string) ?? null} onSave={onSave} disabled={disabled} />;
    case 'list':
      return (
        <InlineText
          value={Array.isArray(value) ? value.join(', ') : ((value as string) ?? '')}
          onSave={(v) =>
            onSave(
              v
                ? v
                    .split(/[,;]/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                : null,
            )
          }
          disabled={disabled}
          placeholder="Comma-separated"
        />
      );
    case 'url':
      return (
        <InlineText
          value={(value as string) ?? ''}
          onSave={onSave}
          disabled={disabled}
          placeholder="https://…"
        />
      );
    case 'longtext':
      return (
        <InlineTextarea
          value={(value as string) ?? ''}
          onSave={(v) => onSave(v || null)}
          disabled={disabled}
          placeholder="Add…"
        />
      );
    default:
      return <InlineText value={(value as string) ?? ''} onSave={onSave} disabled={disabled} />;
  }
}

export function DateField({
  value,
  onSave,
  disabled,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (editing && !disabled) {
    return (
      <Input
        type="date"
        defaultValue={value ?? ''}
        autoFocus
        className="h-7"
        onBlur={(e) => {
          setEditing(false);
          if (e.target.value !== (value ?? '')) onSave(e.target.value || null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setEditing(true)}
      className={cn(
        'block min-h-7 w-full rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-surface-2',
        !value && 'text-subtle-foreground',
      )}
    >
      {value ? formatDate(value) : 'Add date…'}
    </button>
  );
}

export function FieldRow({
  label,
  children,
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-2 py-0.5">
      <div
        className="flex min-h-7 items-center text-xs text-muted-foreground"
        title={typeof hint === 'string' ? hint : undefined}
      >
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
