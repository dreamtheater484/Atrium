import { packContentSchema } from '@atrium/packs-core';
import { z } from 'zod';
import { badRequest, forbidden } from '../http/errors';
import { route } from '../http/route';
import { exportBundle, restoreBundle } from '../services/bundle';
import type { Deps } from '../services/deps';
import {
  applyMappings,
  installBundled,
  installPack,
  listPacks,
  mappingSuggestions,
  packFromFiles,
  previewPack,
  uninstallPack,
} from '../services/packs';
import { isAdmin } from '../services/policy';

async function readUploads(req: {
  isMultipart(): boolean;
  files(): AsyncIterable<{
    filename: string;
    toBuffer(): Promise<Buffer>;
    fields: Record<string, unknown>;
  }>;
}) {
  if (!req.isMultipart()) throw badRequest('Send files as multipart/form-data.');
  const files: Array<{ name: string; data: Uint8Array }> = [];
  for await (const part of req.files())
    files.push({ name: part.filename, data: new Uint8Array(await part.toBuffer()) });
  return files;
}

export function packRoutes(deps: Deps) {
  return [
    route({
      method: 'GET',
      url: '/api/v1/packs',
      summary: 'Industry reference packs: available and installed',
      tag: 'Packs',
      access: 'any',
      handler: async () => listPacks(deps),
    }),
    route({
      method: 'POST',
      url: '/api/v1/packs/:id/install',
      summary: 'Install a bundled pack (such as the starter capability reference)',
      tag: 'Packs',
      access: 'user',
      params: z.object({ id: z.string() }),
      handler: async ({ params, ctx }) => {
        if (!isAdmin(ctx) && ctx.role !== 'architect')
          throw forbidden('Only architects can install reference packs.');
        return installBundled(deps, ctx, params.id);
      },
    }),
    route({
      method: 'POST',
      url: '/api/v1/packs/:id/files',
      summary: 'Build a pack from source files (e.g. TM Forum spreadsheets) and preview the update',
      tag: 'Packs',
      access: 'user',
      multipart: true,
      params: z.object({ id: z.string() }),
      query: z.object({
        /** Release as published; by default the one the files state, else today's date. */
        version: z.string().optional(),
        install: z.enum(['true', 'false']).optional(),
      }),
      handler: async ({ params, query, req, ctx }) => {
        if (!isAdmin(ctx) && ctx.role !== 'architect')
          throw forbidden('Only architects can install reference packs.');
        const files = await readUploads(req as never);
        if (!files.length) throw badRequest('Choose one or more files.');
        const { content, report } = await packFromFiles(deps, params.id, query.version, files);
        if (!content.elements.length) {
          const why = report.files.map(
            (f) => `${f.name}: ${f.reader ?? 'not a file Atrium recognises for this pack'}`,
          );
          throw badRequest(`No reference elements found in the files. ${why.join('; ')}.`);
        }
        // Only the frameworks in these files are replaced; the others stay as installed.
        const scope = report.frameworks.map((f) => f.id);
        if (query.install === 'true')
          return { ...(await installPack(deps, ctx, content, scope)), report };
        const preview = await previewPack(deps, content, scope);
        return {
          report,
          installedVersion: preview.installedVersion,
          validation: preview.validation,
          diff: {
            added: preview.diff.added.length,
            renamed: preview.diff.renamed.length,
            changed: preview.diff.changed.length,
            removed: preview.diff.removed.length,
            unchanged: preview.diff.unchanged,
            removedMapped: preview.diff.removed
              .filter((r) => r.mappedFrom > 0)
              .map((r) => ({
                name: r.name,
                mappings: r.mappedFrom,
                replacement: r.replacement?.name ?? null,
              })),
          },
        };
      },
    }),
    route({
      method: 'POST',
      url: '/api/v1/packs/upload',
      summary: 'Install a pack from an atrium-pack JSON file',
      tag: 'Packs',
      access: 'user',
      multipart: true,
      handler: async ({ req, ctx }) => {
        if (!isAdmin(ctx) && ctx.role !== 'architect')
          throw forbidden('Only architects can install reference packs.');
        const [file] = await readUploads(req as never);
        if (!file) throw badRequest('Choose a pack file.');
        const content = packContentSchema.parse(JSON.parse(new TextDecoder().decode(file.data)));
        return installPack(deps, ctx, content);
      },
    }),
    route({
      method: 'DELETE',
      url: '/api/v1/packs/:id',
      summary: 'Remove a reference pack and the mappings to it',
      tag: 'Packs',
      access: 'user',
      params: z.object({ id: z.string() }),
      handler: async ({ params, ctx }) => {
        if (!isAdmin(ctx)) throw forbidden('Only admins can remove reference packs.');
        return uninstallPack(deps, ctx, params.id);
      },
    }),
    route({
      method: 'GET',
      url: '/api/v1/packs/:id/mapping-suggestions',
      summary:
        'Closest reference element for each of your elements that is not mapped to this pack yet',
      tag: 'Reference packs',
      access: 'any',
      params: z.object({ id: z.string() }),
      handler: async ({ params, ctx }) => mappingSuggestions(deps, ctx, params.id),
    }),
    route({
      method: 'POST',
      url: '/api/v1/packs/:id/mappings',
      summary: 'Add many "maps to" links at once',
      tag: 'Reference packs',
      access: 'any',
      params: z.object({ id: z.string() }),
      body: z.object({
        pairs: z
          .array(z.object({ sourceId: z.string().uuid(), targetId: z.string().uuid() }))
          .min(1)
          .max(2000),
      }),
      handler: async ({ params, body, ctx }) => applyMappings(deps, ctx, params.id, body.pairs),
    }),
    route({
      method: 'GET',
      url: '/api/v1/bundle',
      summary: 'Download a full backup (model, scenarios, suggestions, history)',
      tag: 'Import and export',
      access: 'user',
      handler: async ({ ctx, reply }) => {
        if (!isAdmin(ctx)) throw forbidden('Only admins can download a full backup.');
        const bundle = await exportBundle(deps);
        reply
          .header('content-type', 'application/json')
          .header(
            'content-disposition',
            `attachment; filename="atrium-backup-${new Date().toISOString().slice(0, 10)}.json"`,
          );
        return JSON.stringify(bundle);
      },
    }),
    route({
      method: 'POST',
      url: '/api/v1/bundle/restore',
      summary: 'Restore a backup into an empty workspace',
      tag: 'Import and export',
      access: 'user',
      multipart: true,
      handler: async ({ req, ctx }) => {
        if (!isAdmin(ctx)) throw forbidden('Only admins can restore a backup.');
        const [file] = await readUploads(req as never);
        if (!file) throw badRequest('Choose a backup file.');
        return restoreBundle(deps, JSON.parse(new TextDecoder().decode(file.data)));
      },
    }),
  ];
}
