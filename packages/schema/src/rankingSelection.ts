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
export const initialOverchargeSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const selectionShape = {
  initialOvercharge: initialOverchargeSchema,
  population: z.enum(['all', 'owned']),
  levelBasis: z.enum(['naturalLimit', 'uniformLevel90', 'ownedLevel']),
  npLevelBasis: rankingNpBasisSchema,
  classAffinity: z.enum(['neutral', 'favorable']),
  selfBuffs: z.enum(['included', 'excluded']),
  conditionalEffects: z.enum(['baseline', 'satisfied']),
};
export const rankingSelectionV41Schema = z
  .object(selectionShape)
  .strict()
  .refine(
    (selection) =>
      selection.population === 'owned' ||
      (selection.levelBasis !== 'ownedLevel' && selection.npLevelBasis.kind !== 'owned'),
    { message: 'ranking_owned_basis_requires_owned_population' },
  );

export const resolvedRankingBasisV41Schema = z
  .object({
    servantId: z.string().min(1),
    level: z.number().int().min(1).max(120),
    npLevel: rankingNpLevelSchema,
    initialOvercharge: initialOverchargeSchema,
    levelSource: selectionShape.levelBasis,
    npSource: z.enum(['specified', 'owned']),
  })
  .strict();


export const rankingGrowthBasisSchema = z.enum(['common', 'saved']);
export const rankingSkillLevelsSchema = z.partialRecord(
  z.enum(['1', '2', '3']),
  z.number().int().min(1).max(10),
);
export const rankingSelectionSchema = z.discriminatedUnion('growthBasis', [
  z.object({ ...selectionShape, growthBasis: z.literal('common') }).strict().refine(
    (selection) => selection.population === 'owned' ||
      (selection.levelBasis !== 'ownedLevel' && selection.npLevelBasis.kind !== 'owned'),
    { message: 'ranking_owned_basis_requires_owned_population' },
  ),
  z.object({
    ...selectionShape,
    growthBasis: z.literal('saved'),
    population: z.literal('owned'),
    levelBasis: z.literal('ownedLevel'),
    npLevelBasis: z.object({ kind: z.literal('owned') }).strict(),
  }).strict(),
]);
export type RankingSelection = z.infer<typeof rankingSelectionSchema>;
export const resolvedRankingBasisSchema = resolvedRankingBasisV41Schema.extend({
  growthBasis: rankingGrowthBasisSchema,
  fouAtk: z.number().int().min(0).max(3000),
  skillLevels: rankingSkillLevelsSchema,
}).strict();
export type ResolvedRankingBasis = z.infer<typeof resolvedRankingBasisSchema>;
