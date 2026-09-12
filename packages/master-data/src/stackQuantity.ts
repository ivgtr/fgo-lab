import { z } from 'zod';

export const stackSourceSchema = z
  .object({
    scope: z.enum(['attackerState', 'targetState', 'field']),
    trait: z.string().min(1).max(80),
  })
  .strict();
export type StackSource = z.infer<typeof stackSourceSchema>;
export function stackInputKey(source: StackSource): string {
  return `stack:${source.scope}:${encodeURIComponent(source.trait)}`;
}

export const stackInputSchema = z
  .object({
    kind: z.literal('effectStackCount'),
    key: z.string().min(1),
    owner: z.enum(['attacker', 'target', 'field']),
    label: z.string().min(1),
    description: z.string().min(1),
    minimum: z.literal(0),
    maximum: z.number().int().positive().max(4095),
    step: z.literal(1),
    defaultValue: z.number().int().nonnegative(),
    defaultReason: z.string().min(1),
    quantitySource: stackSourceSchema,
    instanceTraits: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.instanceTraits !== undefined &&
        (value.owner === 'field' || !value.instanceTraits.includes(value.quantitySource.trait))) ||
      value.key !== stackInputKey(value.quantitySource) ||
      value.defaultValue > value.maximum ||
      value.owner !==
        (value.quantitySource.scope === 'attackerState'
          ? 'attacker'
          : value.quantitySource.scope === 'targetState'
            ? 'target'
            : 'field')
    )
      context.addIssue({ code: 'custom', message: 'invalid_stack_quantity_definition' });
  });
export type StackInputDefinition = z.infer<typeof stackInputSchema>;

/** A reader's saturation cap may vary; one physical source has one initial baseline. */
export function stackInputDefaultsAgree(
  left: StackInputDefinition,
  right: StackInputDefinition,
): boolean {
  return (
    left.key === right.key &&
    left.quantitySource.scope === right.quantitySource.scope &&
    left.quantitySource.trait === right.quantitySource.trait &&
    left.defaultValue === right.defaultValue &&
    (!left.instanceTraits ||
      !right.instanceTraits ||
      JSON.stringify([...left.instanceTraits].sort()) ===
        JSON.stringify([...right.instanceTraits].sort()))
  );
}

export const npQuantitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('finiteTraits') }).strict(),
  z.object({ kind: z.literal('stacks'), inputs: z.array(stackInputSchema).min(1) }).strict(),
  z.object({ kind: z.literal('unsupported'), reason: z.string().min(1) }).strict(),
]);
