import { ELEMENT_TYPES } from '@atrium/schema';
import { z } from 'zod';
import { badRequest } from '../http/errors';
import { route } from '../http/route';
import type { Deps } from '../services/deps';
import { applyImport, previewImport, updateImportSheet } from '../services/import';

const target = z.union([
  z.object({
    kind: z.literal('core'),
    field: z.enum([
      'name',
      'key',
      'description',
      'owner',
      'domain',
      'parent',
      'lifecycle',
      'classification',
      'tags',
      'team',
      'external_id',
    ]),
  }),
  z.object({ kind: z.literal('attribute'), key: z.string() }),
  z.object({
    kind: z.literal('relation'),
    relation: z.string(),
    direction: z.enum(['out', 'in']),
    targetType: z.enum(ELEMENT_TYPES),
  }),
  z.object({
    kind: z.literal('lifecycle_date'),
    phase: z.enum(['plan', 'build', 'active', 'phase_out', 'retired']),
  }),
  z.object({ kind: z.literal('level'), level: z.number().int().min(1).max(10) }),
  z.object({ kind: z.literal('ignore') }),
]);

export function importRoutes(deps: Deps) {
  return [
    route({
      method: 'POST',
      url: '/api/v1/import/preview',
      summary: 'Upload files and see what an import would do (nothing changes yet)',
      tag: 'Import and export',
      access: 'any',
      multipart: true,
      handler: async ({ req, ctx }) => {
        if (!req.isMultipart()) throw badRequest('Send the file as multipart/form-data.');
        const files: Array<{ name: string; data: Uint8Array }> = [];
        for await (const part of req.files()) {
          files.push({
            name: part.filename || 'upload',
            data: new Uint8Array(await part.toBuffer()),
          });
        }
        return previewImport(deps, ctx, files);
      },
    }),
    route({
      method: 'PATCH',
      url: '/api/v1/import/:importId/sheets/:sheet',
      summary: 'Change the element type or column mapping of one sheet',
      tag: 'Import and export',
      access: 'any',
      params: z.object({ importId: z.string().uuid(), sheet: z.coerce.number().int().min(0) }),
      body: z.object({
        type: z.enum(ELEMENT_TYPES).optional(),
        columns: z.record(z.string(), target).optional(),
      }),
      handler: async ({ params, body, ctx }) =>
        updateImportSheet(deps, ctx, params.importId, params.sheet, body as never),
    }),
    route({
      method: 'POST',
      url: '/api/v1/import/:importId/apply',
      summary: 'Run the import',
      tag: 'Import and export',
      access: 'any',
      params: z.object({ importId: z.string().uuid() }),
      body: z.object({ skipSheets: z.array(z.number().int()).optional() }),
      handler: async ({ params, body, ctx }) => applyImport(deps, ctx, params.importId, body),
    }),
  ];
}
