import {
  type CapabilityColumn,
  type DeckSpec,
  type ExportModel,
  exportArchimate,
  exportExcel,
  exportPptx,
  PALETTE,
  type SlideSpec,
  tint,
} from '@atrium/exporters';
import {
  ELEMENT_TYPE_DEFS,
  ELEMENT_TYPES,
  type ElementType,
  enumLabel,
  type MapOverlay,
} from '@atrium/schema';
import { z } from 'zod';
import type { RequestContext } from '../auth/context';
import { badRequest } from '../http/errors';
import { resolveScenario } from '../http/query';
import { route } from '../http/route';
import { audit } from '../services/audit';
import type { Deps } from '../services/deps';
import { overview } from '../services/stats';
import { resolveState } from '../services/store';
import { capabilityMap } from '../services/views';
import { getWorkspace } from '../services/workspace';

const FORMATS = ['xlsx', 'csv', 'json', 'archimate', 'pptx-map'] as const;

const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json',
  xml: 'application/xml',
};

const today = () => new Date().toISOString().slice(0, 10);

function fileName(base: string, ext: string) {
  const safe = base.replace(/[^\w\- ]+/g, '').trim() || 'atrium';
  return `${safe} ${today()}.${ext}`;
}

/** The model as the caller may see it (classification and domain scope), in a scenario if asked. */
async function exportModel(
  deps: Deps,
  ctx: RequestContext,
  scenarioId?: string,
): Promise<ExportModel> {
  const state = await resolveState(deps.store, deps.sql, ctx, { scenarioId });
  const ws = await getWorkspace(deps.sql, deps.config.workspaceName);
  const elements = [...state.elements.values()].filter((e) => e.layer === 'org');
  const ids = new Set(elements.map((e) => e.id));
  const relations = [...state.relations.values()].filter(
    (r) => ids.has(r.sourceId) && ids.has(r.targetId),
  );
  return { elements, relations, workspaceName: ws.name, generatedAt: new Date().toISOString() };
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Guard against spreadsheet formula injection, then quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** One flat sheet for one type, with the same headers the importer recognises. */
function toCsv(model: ExportModel, type: ElementType): string {
  const def = ELEMENT_TYPE_DEFS[type];
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  const rows = model.elements
    .filter((e) => e.type === type)
    .sort((a, b) => a.name.localeCompare(b.name));
  const headers = [
    'Name',
    'Key',
    'Description',
    'Domain',
    'Parent',
    'Owner',
    'Lifecycle',
    'Classification',
    ...def.attributes.map((a) => a.label),
    'Tags',
    'Atrium id',
  ];
  const lines = [headers.map(csvCell).join(',')];
  for (const e of rows) {
    lines.push(
      [
        e.name,
        e.key,
        e.description,
        e.domainId ? byId.get(e.domainId)?.name : '',
        e.parentId ? byId.get(e.parentId)?.name : '',
        e.owner,
        e.lifecycle ? enumLabel(e.lifecycle) : '',
        enumLabel(e.classification),
        ...def.attributes.map((a) => {
          const v = e.attributes[a.key];
          return a.kind === 'enum' && typeof v === 'string' ? enumLabel(v) : v;
        }),
        e.tags,
        e.id,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  // Excel opens UTF-8 CSV correctly only with a byte order mark.
  return `﻿${lines.join('\r\n')}\r\n`;
}

const HEALTH_HEX: Record<string, string> = {
  good: PALETTE.good,
  watch: PALETTE.watch,
  act: PALETTE.act,
};

/** A capability map deck: one slide per top-level group of up to six columns, coloured by health or cost. */
async function capabilityDeck(
  deps: Deps,
  ctx: RequestContext,
  scenarioId: string | undefined,
  overlay: MapOverlay,
): Promise<DeckSpec> {
  const map = await capabilityMap(deps, ctx, { scenarioId });
  const ws = await getWorkspace(deps.sql, deps.config.workspaceName);
  const maxCost = Math.max(1, ...map.roots.flatMap((r) => r.children.map((c) => c.cost)));
  const colour = (c: { health: string | null; cost: number; apps: unknown[] }) => {
    if (overlay === 'cost') return tint(PALETTE.accent, 0.88 - 0.78 * (c.cost / maxCost));
    if (overlay === 'coverage')
      return c.apps.length ? tint(PALETTE.good, 0.55) : tint(PALETTE.act, 0.35);
    return c.health ? tint(HEALTH_HEX[c.health]!, 0.55) : PALETTE.white;
  };
  const columns: CapabilityColumn[] = map.roots.map((r) => ({
    name: r.name,
    children: (r.children.length ? r.children : [r]).map((c) => ({
      name: c.name,
      color: colour(c),
      note: c.apps.length ? `${c.apps.length} app${c.apps.length === 1 ? '' : 's'}` : 'No apps',
    })),
  }));
  const legend =
    overlay === 'cost'
      ? [
          { label: 'Low cost', color: tint(PALETTE.accent, 0.88) },
          { label: 'High cost', color: tint(PALETTE.accent, 0.1) },
        ]
      : overlay === 'coverage'
        ? [
            { label: 'Supported', color: tint(PALETTE.good, 0.55) },
            { label: 'No applications', color: tint(PALETTE.act, 0.35) },
          ]
        : [
            { label: 'Good', color: tint(PALETTE.good, 0.55) },
            { label: 'Watch', color: tint(PALETTE.watch, 0.55) },
            { label: 'Act', color: tint(PALETTE.act, 0.55) },
            { label: 'Not known', color: PALETTE.white },
          ];
  const slides: SlideSpec[] = [];
  for (let i = 0; i < columns.length; i += 6) {
    slides.push({
      kind: 'capabilityMap',
      title:
        columns.length > 6
          ? `Capability map (${i / 6 + 1} of ${Math.ceil(columns.length / 6)})`
          : 'Capability map',
      subtitle: `${map.totals.capabilities} capabilities · ${map.totals.applications} applications · coloured by ${overlay === 'none' ? 'health' : overlay}`,
      legend,
      columns: columns.slice(i, i + 6),
    });
  }
  return {
    title: 'Capability map',
    subtitle: ws.name,
    workspaceName: ws.name,
    date: today(),
    slides,
  };
}

const KPI_SLIDE = async (
  deps: Deps,
  ctx: RequestContext,
  scenarioId: string | undefined,
  ids: string[],
): Promise<SlideSpec | null> => {
  if (!ids.length) return null;
  const o = await overview(deps, ctx, { scenarioId });
  const a = o.applications;
  const money = (n: number) =>
    n >= 1e6 ? `€${(n / 1e6).toFixed(1)}m` : n >= 1e3 ? `€${Math.round(n / 1e3)}k` : `€${n}`;
  const healthy = a.total ? Math.round((a.health.good / a.total) * 100) : 0;
  const all: Record<
    string,
    { label: string; value: string; hint?: string; tone?: 'good' | 'watch' | 'act' | 'neutral' }
  > = {
    'kpi-apps': {
      label: 'Applications in use',
      value: String(a.total),
      hint: `Across ${a.byDomain.length} domains`,
    },
    'kpi-cost': {
      label: 'Annual run cost',
      value: money(a.cost),
      hint:
        o.completeness.cost.known < o.completeness.cost.total
          ? `Known for ${o.completeness.cost.known} of ${o.completeness.cost.total} applications${o.completeness.cost.estimated ? `, ${money(o.completeness.cost.estimated)} estimated` : ''}`
          : o.completeness.cost.estimated
            ? `${money(o.completeness.cost.estimated)} of it estimated`
            : 'All applications and contracts',
    },
    'kpi-healthy': {
      label: 'Healthy',
      value: `${healthy}%`,
      hint: `${a.health.act} need action`,
      tone: healthy >= 60 ? 'good' : healthy >= 35 ? 'watch' : 'act',
    },
    'kpi-eol': {
      label: 'End-of-life exposure',
      value: String(o.eol.length),
      hint: `${o.eol.filter((e) => e.past).length} already unsupported`,
      tone: o.eol.some((e) => e.past) ? 'act' : o.eol.length ? 'watch' : 'good',
    },
    'kpi-quality': {
      label: 'Model quality',
      value: `${o.quality.average}%`,
      hint: 'How complete the records are',
      tone: o.quality.average >= 80 ? 'good' : 'watch',
    },
  };
  const kpis = ids.map((id) => all[id]).filter((k): k is NonNullable<typeof k> => !!k);
  return kpis.length ? { kind: 'kpis', title: 'At a glance', kpis } : null;
};

const slideSchema = z
  .object({
    kind: z.enum(['kpis', 'capabilityMap', 'bar', 'doughnut', 'table', 'roadmap', 'text']),
    title: z.string(),
  })
  .passthrough();

export function exportRoutes(deps: Deps) {
  return [
    route({
      method: 'GET',
      url: '/api/v1/export',
      summary:
        'Download the model as Excel, CSV, JSON, ArchiMate exchange XML or a capability map deck',
      tag: 'Import and export',
      access: 'any',
      query: z.object({
        format: z.enum(FORMATS),
        type: z.enum(ELEMENT_TYPES).optional(),
        scenario: z.string().optional(),
        overlay: z.string().optional(),
      }),
      handler: async ({ query, ctx, reply }) => {
        const scenarioId = await resolveScenario(deps.sql, query.scenario);
        await audit(deps.sql, ctx, 'export', undefined, {
          format: query.format,
          type: query.type ?? null,
          scenario: query.scenario ?? null,
        });
        const label = query.type ? ELEMENT_TYPE_DEFS[query.type].plural : 'Atrium model';
        const send = (body: Uint8Array | string, mime: string, name: string) => {
          reply
            .header('content-type', mime)
            .header('content-disposition', `attachment; filename="${name}"`);
          return typeof body === 'string' ? body : Buffer.from(body);
        };
        switch (query.format) {
          case 'xlsx': {
            const model = await exportModel(deps, ctx, scenarioId);
            return send(
              await exportExcel(model, { types: query.type ? [query.type] : undefined }),
              MIME.xlsx,
              fileName(label, 'xlsx'),
            );
          }
          case 'csv': {
            if (!query.type)
              throw badRequest(
                'Choose one element type for a CSV export, or use Excel for everything.',
              );
            return send(
              toCsv(await exportModel(deps, ctx, scenarioId), query.type),
              MIME.csv,
              fileName(label, 'csv'),
            );
          }
          case 'json': {
            const model = await exportModel(deps, ctx, scenarioId);
            const elements = query.type
              ? model.elements.filter((e) => e.type === query.type)
              : model.elements;
            const ids = new Set(elements.map((e) => e.id));
            const body = {
              format: 'atrium-model',
              version: 1,
              workspace: model.workspaceName,
              generatedAt: model.generatedAt,
              elements,
              relations: model.relations.filter((r) => ids.has(r.sourceId) || ids.has(r.targetId)),
            };
            return send(JSON.stringify(body, null, 2), MIME.json, fileName(label, 'json'));
          }
          case 'archimate': {
            const xml = exportArchimate(await exportModel(deps, ctx, scenarioId));
            return send(xml, MIME.xml, fileName(label, 'xml'));
          }
          case 'pptx-map': {
            const deck = await capabilityDeck(
              deps,
              ctx,
              scenarioId,
              (query.overlay as MapOverlay) ?? 'health',
            );
            return send(await exportPptx(deck), MIME.pptx, fileName('Capability map', 'pptx'));
          }
        }
      },
    }),
    route({
      method: 'POST',
      url: '/api/v1/export/dashboard',
      summary: 'Turn a dashboard or roadmap into native, editable PowerPoint slides',
      tag: 'Import and export',
      access: 'any',
      body: z.object({
        title: z.string().min(1).max(200),
        kpis: z.array(z.string()).max(10).optional(),
        slides: z.array(slideSchema).max(40),
        scenario: z.string().optional(),
      }),
      handler: async ({ body, ctx, reply }) => {
        const scenarioId = await resolveScenario(deps.sql, body.scenario);
        const ws = await getWorkspace(deps.sql, deps.config.workspaceName);
        const kpis = await KPI_SLIDE(deps, ctx, scenarioId, body.kpis ?? []);
        const deck: DeckSpec = {
          title: body.title,
          subtitle: scenarioId ? 'Scenario view' : undefined,
          workspaceName: ws.name,
          date: today(),
          slides: [...(kpis ? [kpis] : []), ...(body.slides as unknown as SlideSpec[])],
        };
        await audit(deps.sql, ctx, 'export', undefined, { format: 'pptx', title: body.title });
        reply
          .header('content-type', MIME.pptx)
          .header('content-disposition', `attachment; filename="${fileName(body.title, 'pptx')}"`);
        return Buffer.from(await exportPptx(deck));
      },
    }),
  ];
}
