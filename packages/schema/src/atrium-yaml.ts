import { z } from 'zod';
import { CLASSIFICATIONS, INTERFACE_PROTOCOLS, LIFECYCLE_PHASES } from './enums';

/**
 * atrium.yaml lives in a service repository. Engineers (or `atrium init`) describe
 * the service there; CI syncs it into the shared model.
 */
export const atriumYamlSchema = z.object({
  apiVersion: z.literal('atrium/v1'),
  kind: z.literal('Service').default('Service'),
  metadata: z.object({
    key: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-_.]*$/, 'Use lower case letters, digits and dashes')
      .max(120),
    name: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    owner: z.string().max(200).optional(),
    team: z.string().max(200).optional(),
    domain: z.string().max(200).optional(),
    lifecycle: z.enum(LIFECYCLE_PHASES).optional(),
    classification: z.enum(CLASSIFICATIONS).optional(),
    tags: z.array(z.string()).optional(),
    links: z.record(z.string(), z.string()).optional(),
  }),
  spec: z
    .object({
      dependsOn: z.array(z.string()).optional(),
      provides: z
        .array(
          z.object({
            key: z.string().max(120),
            name: z.string().max(200).optional(),
            protocol: z.enum(INTERFACE_PROTOCOLS).optional(),
            docs: z.string().optional(),
            description: z.string().optional(),
          }),
        )
        .optional(),
      consumes: z.array(z.string()).optional(),
      data: z.array(z.string()).optional(),
      technologies: z
        .array(
          z.object({
            name: z.string(),
            version: z.string().optional(),
          }),
        )
        .optional(),
      capabilities: z.array(z.string()).optional(),
    })
    .default({}),
});
export type AtriumYaml = z.infer<typeof atriumYamlSchema>;
