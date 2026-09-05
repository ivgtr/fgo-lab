import { z } from 'zod';

export const rankingNpLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export const rankingNpBasisSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('specified'), npLevel: rankingNpLevelSchema }).strict(),
  z.object({ kind: z.literal('owned') }).strict(),
]);
const selectionShape = {
  population: z.enum(['all', 'owned']),
  levelBasis: z.enum(['naturalLimit', 'uniformLevel90', 'ownedLevel']),
  npLevelBasis: rankingNpBasisSchema,
  classAffinity: z.enum(['neutral', 'favorable']),
  selfBuffs: z.enum(['included', 'excluded']),
  conditionalEffects: z.enum(['baseline', 'satisfied']),
};
export const rankingSelectionSchema = z
  .object(selectionShape)
  .strict()
  .refine(
    (selection) =>
      selection.population === 'owned' ||
      (selection.levelBasis !== 'ownedLevel' && selection.npLevelBasis.kind !== 'owned'),
    { message: 'ranking_owned_basis_requires_owned_population' },
  );
export type RankingSelection = z.infer<typeof rankingSelectionSchema>;
export const resolvedRankingBasisSchema = z
  .object({
    servantId: z.string().min(1),
    level: z.number().int().min(1).max(120),
    npLevel: rankingNpLevelSchema,
    levelSource: selectionShape.levelBasis,
    npSource: z.enum(['specified', 'owned']),
  })
  .strict();
export type ResolvedRankingBasis = z.infer<typeof resolvedRankingBasisSchema>;
