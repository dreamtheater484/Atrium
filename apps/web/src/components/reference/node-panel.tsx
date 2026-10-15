import { type FrameworkNodeLink, type FrameworkTree, typeDef } from '@atrium/schema';
import { Badge, Button, cn, HealthDot, Progress, Skeleton, TypeIcon, toast } from '@atrium/ui';
import { useNavigate } from '@tanstack/react-router';
import { ChevronRight, ExternalLink, Link2, Plus, X } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useCreateRelation, useDeleteRelation, useFrameworkNode } from '../../lib/queries';
import { inspect } from '../../lib/store';
import { ElementPicker } from '../element-picker';
import { BranchCoverage } from './coverage';

const n = (v: number) => v.toLocaleString('en-GB');

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border px-5 py-4">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A description, cut short when it would push what maps here out of view. */
function Description({ text }: { text: string }) {
  const [all, setAll] = useState(false);
  const long = text.length > 600;
  return (
    <div className="flex flex-col items-start gap-1">
      <p
        className={cn(
          'text-[13px] whitespace-pre-line text-muted-foreground',
          long && !all && 'line-clamp-8',
        )}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline"
          onClick={() => setAll(!all)}
        >
          {all ? 'Show less' : 'Show all'}
        </button>
      )}
    </div>
  );
}

/** Opens another framework at one of its elements. */
function useOpenFramework() {
  const navigate = useNavigate();
  return (packId: string, framework: string, node?: string) =>
    navigate({ to: '/explore', search: { pack: packId, framework, node, view: 'tree' } });
}

/**
 * The right-hand panel of a framework: an overview with the coverage per top-level branch,
 * or the details of the selected element: what it is, what of yours maps to it, and what it
 * links to in other frameworks.
 */
export function NodePanel({
  tree,
  nodeId,
  onSelect,
}: {
  tree: FrameworkTree;
  nodeId: string | undefined;
  onSelect: (id: string | undefined) => void;
}) {
  return nodeId ? (
    <NodeDetail tree={tree} nodeId={nodeId} onSelect={onSelect} />
  ) : (
    <Overview tree={tree} onSelect={onSelect} />
  );
}

function Overview({
  tree,
  onSelect,
}: {
  tree: FrameworkTree;
  onSelect: (id: string | undefined) => void;
}) {
  const openFramework = useOpenFramework();
  const roots = useMemo(() => tree.nodes.filter((x) => x.depth === 1), [tree]);
  const { totals, framework } = tree;
  const plural = typeDef(framework.elementType).plural.toLowerCase();
  const pct = totals.nodes ? (totals.covered / totals.nodes) * 100 : 0;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-2 px-5 py-4">
        <h2 className="text-[15px] font-semibold tracking-tight">{framework.name}</h2>
        <p className="text-xs text-muted-foreground">
          {tree.pack.name}
          {framework.version ? ` · version ${framework.version}` : ''}
        </p>
        {framework.description && (
          <p className="text-[13px] text-muted-foreground">{framework.description}</p>
        )}
      </div>
      <Section title="Your model against it">
        <div className="flex items-center gap-3">
          <Progress
            value={pct > 0 ? Math.max(pct, 2) : 0}
            tone="good"
            label="Elements of the framework with a mapping"
            className="flex-1"
          />
          <span className="text-xs font-medium tabular">
            {pct < 1 && pct > 0 ? '<1' : Math.round(pct)}%
          </span>
        </div>
        <p className="text-[13px]">
          <strong className="font-semibold">{n(totals.covered)}</strong> of {n(totals.nodes)}{' '}
          elements have something of yours mapped to them.{' '}
          <span className="text-muted-foreground">
            {n(totals.mappedElements)} of your {n(totals.candidates)} {plural} map here.
          </span>
        </p>
      </Section>
      <Section title="By branch">
        <ul className="flex flex-col">
          {roots.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                className="flex w-full flex-col gap-1 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
              >
                <span className="flex w-full items-center gap-2 text-[13px]">
                  {r.key && (
                    <span className="font-mono text-[11px] text-muted-foreground">{r.key}</span>
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                </span>
                <span className="flex w-full">
                  <BranchCoverage node={r} wide />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
      {tree.links.length > 0 && (
        <Section title="Links to other frameworks">
          <ul className="flex flex-col gap-1">
            {tree.links.map((l) => (
              <li key={`${l.type}-${l.direction}-${l.framework.packId}-${l.framework.id}`}>
                <button
                  type="button"
                  onClick={() => openFramework(l.framework.packId, l.framework.id)}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
                >
                  <Link2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    {n(l.elements)} {l.elements === 1 ? 'element' : 'elements'} {l.label}{' '}
                    <span className="font-medium">{l.framework.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {n(l.count)} {l.count === 1 ? 'link' : 'links'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <p className="px-5 pb-5 text-xs text-muted-foreground">
        Choose an element to see its description, what of yours maps to it and how it links to other
        frameworks.
      </p>
    </div>
  );
}

function NodeDetail({
  tree,
  nodeId,
  onSelect,
}: {
  tree: FrameworkTree;
  nodeId: string;
  onSelect: (id: string | undefined) => void;
}) {
  const { pack, framework } = tree;
  const q = useFrameworkNode(pack.id, framework.id, nodeId);
  const d = q.data?.id === nodeId ? q.data : undefined;
  const node = tree.nodes.find((x) => x.id === nodeId);
  const link = useCreateRelation();
  const unlink = useDeleteRelation();
  const openFramework = useOpenFramework();
  const linkGroups = useMemo(() => {
    const groups = new Map<string, { label: string; links: FrameworkNodeLink[] }>();
    for (const l of d?.links ?? []) {
      const k = `${l.label}|${l.other.framework.packId}|${l.other.framework.id}`;
      const g = groups.get(k) ?? { label: `${l.label} · ${l.other.framework.name}`, links: [] };
      g.links.push(l);
      groups.set(k, g);
    }
    return [...groups.values()];
  }, [d]);
  const typeLabel = typeDef(framework.elementType);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-2 px-5 pt-3 pb-4">
        <div className="flex items-start gap-1">
          <nav aria-label="Where it sits" className="min-w-0 flex-1">
            <ol className="flex flex-wrap items-center gap-0.5 text-xs text-muted-foreground">
              <li>
                <button
                  type="button"
                  className="rounded px-1 py-0.5 hover:bg-surface-2 hover:text-foreground"
                  onClick={() => onSelect(undefined)}
                >
                  {framework.name}
                </button>
              </li>
              {(d?.path ?? []).map((p) => (
                <li key={p.id} className="flex items-center gap-0.5">
                  <ChevronRight className="size-3" />
                  <button
                    type="button"
                    className="max-w-48 truncate rounded px-1 py-0.5 hover:bg-surface-2 hover:text-foreground"
                    onClick={() => onSelect(p.id)}
                  >
                    {p.key ?? p.name}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Close details"
            onClick={() => onSelect(undefined)}
          >
            <X />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(d?.key ?? node?.key) && (
            <span className="font-mono text-xs text-muted-foreground">{d?.key ?? node?.key}</span>
          )}
          <Badge tone="outline">{d?.level ?? node?.level}</Badge>
          {(d?.domain ?? node?.domain) && <Badge>{d?.domain ?? node?.domain}</Badge>}
        </div>
        <h2 className="text-[15px] leading-snug font-semibold tracking-tight">
          {d?.name ?? node?.name}
        </h2>
        {d || node ? (
          <Description
            key={nodeId}
            text={(d?.description ?? node?.description) || 'No description in the framework.'}
          />
        ) : null}
        {d && d.details.length > 0 && (
          // Keyed by element, so it closes again when you move to another one.
          <details key={d.id} className="group text-[13px]">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground">
              More details: {d.details.map((x) => x.label.toLowerCase()).join(', ')}
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {d.details.map((x) => (
                <div key={x.label}>
                  <p className="text-xs font-medium text-muted-foreground">{x.label}</p>
                  <p className="whitespace-pre-line text-muted-foreground">
                    {Array.isArray(x.value) ? x.value.join(', ') : x.value}
                  </p>
                </div>
              ))}
            </div>
          </details>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" onClick={() => inspect(nodeId)}>
            <ExternalLink /> All details
          </Button>
        </div>
      </div>

      <Section title="Your model">
        {!d ? (
          <Skeleton className="h-16" />
        ) : (
          <>
            {d.mappedFrom.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Nothing of yours maps to this yet.
              </p>
            ) : (
              <ul className="flex flex-col">
                {d.mappedFrom.map((m) => (
                  <li key={m.relationId} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => inspect(m.element.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
                    >
                      <TypeIcon type={m.element.type} size="xs" />
                      <span className="truncate font-medium">{m.element.name}</span>
                      <HealthDot health={m.element.health} />
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {m.element.domainName}
                      </span>
                    </button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove the mapping from ${m.element.name}`}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() =>
                        unlink.mutate(m.relationId, {
                          onSuccess: (res) =>
                            res.mode !== 'suggestion' &&
                            toast(`${m.element.name} no longer maps to ${d.name}`),
                        })
                      }
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <ElementPicker
              types={[framework.elementType]}
              exclude={d.mappedFrom.map((m) => m.element.id)}
              onChange={(v) =>
                v &&
                link.mutate(
                  { type: 'maps_to', sourceId: v.id, targetId: nodeId },
                  {
                    // A suggestion is announced by the mutation itself.
                    onSuccess: (res) =>
                      res.mode !== 'suggestion' && toast.success(`${v.name} maps to ${d.name}`),
                  },
                )
              }
              trigger={
                <Button size="sm" variant="ghost" className="self-start">
                  <Plus /> Map one of your {typeLabel.plural.toLowerCase()}
                </Button>
              }
            />
            {node && node.size > 1 && (
              <div className="flex flex-col gap-1.5 pt-2">
                <p className="text-[13px]">
                  In this branch, <strong className="font-semibold">{n(node.covered)}</strong> of{' '}
                  {n(node.size)} elements are mapped, by {n(node.mappedBelow)} of your{' '}
                  {node.mappedBelow === 1
                    ? typeLabel.label.toLowerCase()
                    : typeLabel.plural.toLowerCase()}
                  .
                </p>
                <BranchCoverage node={node} wide />
                {d.mappedBelow.items.length > 0 && (
                  <ul className="flex flex-col pt-1">
                    {d.mappedBelow.items.map((m) => (
                      <li key={m.element.id} className="flex flex-col rounded-lg px-2 py-1">
                        <button
                          type="button"
                          onClick={() => inspect(m.element.id)}
                          className="flex items-center gap-2 text-left text-[13px] hover:underline"
                        >
                          <TypeIcon type={m.element.type} size="xs" />
                          <span className="truncate font-medium">{m.element.name}</span>
                        </button>
                        <span className="flex flex-wrap gap-x-2 pl-6 text-xs text-muted-foreground">
                          maps to
                          {m.to.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => onSelect(t.id)}
                              className="hover:text-foreground hover:underline"
                            >
                              {t.key ? `${t.key} ` : ''}
                              {t.name}
                            </button>
                          ))}
                        </span>
                      </li>
                    ))}
                    {d.mappedBelow.elements > d.mappedBelow.items.length && (
                      <li className="px-2 text-xs text-muted-foreground">
                        and {n(d.mappedBelow.elements - d.mappedBelow.items.length)} more
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </Section>

      {d && linkGroups.length > 0 && (
        <Section title="In other frameworks">
          {linkGroups.map((g) => (
            <div key={g.label} className="flex flex-col gap-0.5">
              <p className="text-xs font-medium text-muted-foreground">
                {g.label.charAt(0).toUpperCase() + g.label.slice(1)}
              </p>
              <ul className="flex flex-col">
                {g.links.map((l) => (
                  <li key={l.relationId}>
                    <button
                      type="button"
                      onClick={() =>
                        openFramework(l.other.framework.packId, l.other.framework.id, l.other.id)
                      }
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] hover:bg-surface-2',
                      )}
                    >
                      {l.other.key && (
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {l.other.key}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{l.other.name}</span>
                      {l.other.level && (
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {l.other.level}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
