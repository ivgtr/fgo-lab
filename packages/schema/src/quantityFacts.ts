import { z } from 'zod';

export const QUANTITY_FACT_DOMAINS = {
  attackerHpPermille: { min: 0, max: 1_000 },
  targetRarity: { min: 0, max: 5 },
  battlePointPhase: { min: 0, max: 10 },
} as const;

export type QuantityFactName = keyof typeof QUANTITY_FACT_DOMAINS;

export function isQuantityFactValueInDomain(quantity: QuantityFactName, value: number): boolean {
  const domain = QUANTITY_FACT_DOMAINS[quantity];
  return Number.isSafeInteger(value) && value >= domain.min && value <= domain.max;
}

export function quantityFactValueSchema(quantity: QuantityFactName) {
  const domain = QUANTITY_FACT_DOMAINS[quantity];
  return z.number().int().min(domain.min).max(domain.max);
}

export const worldFactQuantitySchema = z
  .object({
    kind: z.literal('quantity'),
    quantity: z.enum(['attackerHpPermille', 'targetRarity', 'battlePointPhase']),
    value: z.number().int(),
  })
  .superRefine((fact, context) => {
    if (isQuantityFactValueInDomain(fact.quantity, fact.value)) return;
    const domain = QUANTITY_FACT_DOMAINS[fact.quantity];
    context.addIssue({
      code: 'custom',
      path: ['value'],
      message: `${fact.quantity} must be between ${String(domain.min)} and ${String(domain.max)}`,
    });
  });
